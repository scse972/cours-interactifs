// ============================================================================
// superadmin — fonction serveur (Edge Function Supabase)
// ============================================================================
// Centralise toutes les actions superadmin qui ne peuvent plus passer par un
// accès table direct depuis qu'une vraie RLS est en place (Phases 3/4) :
//   - réglages globaux (platform_mode, admin_notification_email) : owner_id
//     NULL, non modifiables par la RLS anonyme (seul platform_mode est
//     lisible publiquement, jamais écrit sans passer par ici — cf. migration
//     0002, bloc 4) ;
//   - gestion de la table formateurs (aucune policy anonyme du tout, cf.
//     migration 0002, bloc 1) : lister, pré-créer, approuver, révoquer, purger.
//     La pré-création exige la migration 0003 (cf. create_formateur).
//
// Authentification : PAS une session Supabase Auth (le superadmin n'a pas de
// compte GitHub sur ce projet — c'est justement l'exception qui permet de
// basculer le site avant qu'aucun formateur n'existe). À la place, le même
// jeton de récupération que celui de teacher-login.html/teacher.html
// (RECOVERY_TOKEN, actuellement "YXORP@97240" en dur côté client) doit être
// fourni dans le corps de la requête et vérifié ici contre un secret de
// fonction du même nom — JAMAIS la clé anon seule, qui n'authentifie rien.
//
// ⚠️ Jamais encore déployée ni exécutée contre un vrai projet Supabase — à
// valider dès qu'un projet de test existe. Le secret de fonction
// RECOVERY_TOKEN doit être positionné (`supabase secrets set RECOVERY_TOKEN=...`)
// avec exactement la même valeur que la constante côté client.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail } from '../_shared/sendEmail.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RECOVERY_TOKEN = Deno.env.get('RECOVERY_TOKEN')!;

interface RequestBody {
    recoveryToken: string;
    op: string;
    [key: string]: unknown;
}

Deno.serve(async (req: Request) => {
    if (req.method !== 'POST') return json({ error: 'Méthode non supportée' }, 405);

    let body: RequestBody;
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Corps de requête invalide (JSON attendu)' }, 400);
    }

    if (!body.recoveryToken || body.recoveryToken !== RECOVERY_TOKEN) {
        return json({ error: 'Non autorisé' }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    switch (body.op) {
        case 'get_settings':
            return json(await getSettings(admin));

        case 'set_platform_mode':
            await setGlobalSetting(admin, 'platform_mode', body.mode === 'web' ? 'web' : null);
            return json({ ok: true });

        case 'set_notification_email':
            await setGlobalSetting(admin, 'admin_notification_email', body.email || null);
            return json({ ok: true });

        case 'list_formateurs': {
            const { data, error } = await admin.from('formateurs').select('*').order('created_at', { ascending: false });
            if (error) return json({ error: error.message }, 500);
            return json({ formateurs: data });
        }

        case 'count_active_formateurs': {
            const { count, error } = await admin
                .from('formateurs')
                .select('id', { count: 'exact', head: true })
                .in('status', ['pending', 'approved']);
            if (error) return json({ error: error.message }, 500);
            return json({ count: count ?? 0 });
        }

        case 'create_formateur': {
            // Pré-création manuelle (Phase 4) : le formateur n'a pas encore de
            // compte auth.users tant qu'il ne s'est pas connecté. La ligne est
            // donc posée avec un id PROVISOIRE, que la première connexion
            // GitHub remplacera par le vrai id auth.users — le rapprochement se
            // fait sur github_login (trigger handle_new_formateur, migration
            // 0003, qui a aussi libéré `id` de sa clé étrangère vers
            // auth.users pour rendre cette insertion possible).
            //
            // ⚠️ Requiert la migration 0003 : sur un projet resté en 0002, la
            // clé étrangère fait encore échouer cette insertion.
            const githubLogin = String(body.githubLogin || '').trim();
            if (!githubLogin) return json({ error: 'githubLogin requis' }, 400);

            const { error } = await admin.from('formateurs').insert({
                id: crypto.randomUUID(),          // provisoire, cf. ci-dessus
                github_login: githubLogin,
                email: body.email || null,
                status: 'approved',
                approved_at: new Date().toISOString(),
                awaiting_first_login: true
            });
            if (error) {
                // 23505 = violation d'unicité sur lower(github_login) : ce
                // login est déjà connu, pré-créé ou auto-inscrit. Un message
                // clair vaut mieux que le texte brut de Postgres, l'écran
                // d'administration l'affiche tel quel.
                if (error.code === '23505') {
                    return json({ error: `Le formateur "${githubLogin}" est déjà dans la liste.` }, 409);
                }
                return json({ error: error.message }, 500);
            }

            if (body.email) {
                await sendEmail({
                    to: body.email as string,
                    subject: 'Votre accès à coursInteractifs',
                    text: `Bonjour,

Votre accès formateur a été activé. Connectez-vous avec votre compte GitHub ("${githubLogin}") à l'adresse habituelle du site.`
                });
            }
            return json({ ok: true });
        }

        case 'approve_formateur':
            return json(await updateFormateurStatus(admin, String(body.id), 'approved', true));

        case 'revoke_formateur':
            return json(await updateFormateurStatus(admin, String(body.id), 'revoked', false));

        case 'purge_formateur': {
            const id = String(body.id || '');
            if (!id) return json({ error: 'id requis' }, 400);
            // Efface réellement les données (parcours publiés, listes d'élèves,
            // progressions) — irréversible, cf. Phase 4bis. La confirmation
            // (saisie du github_login) est de la responsabilité de l'écran
            // appelant (admin-formateurs.html), pas de cette fonction.
            await admin.from('app_data').delete().eq('owner_id', id);
            await admin.from('parcours_data').delete().eq('owner_id', id);
            const { error } = await admin.from('formateurs').delete().eq('id', id);
            if (error) return json({ error: error.message }, 500);
            return json({ ok: true });
        }

        default:
            return json({ error: 'op inconnue: ' + body.op }, 400);
    }
});

async function getSettings(admin: ReturnType<typeof createClient>) {
    const { data } = await admin
        .from('app_data')
        .select('key, value')
        .is('owner_id', null)
        .in('key', ['platform_mode', 'admin_notification_email']);

    const settings: Record<string, unknown> = { platform_mode: null, admin_notification_email: null };
    for (const row of data || []) settings[row.key] = row.value;
    return settings;
}

async function setGlobalSetting(admin: ReturnType<typeof createClient>, key: string, value: unknown) {
    if (value === null) {
        await admin.from('app_data').delete().is('owner_id', null).eq('key', key);
        return;
    }
    await admin.from('app_data').upsert(
        { owner_id: null, key, value, updated_at: new Date().toISOString() },
        { onConflict: 'owner_id,key' }
    );
}

async function updateFormateurStatus(admin: ReturnType<typeof createClient>, id: string, status: string, setApprovedAt: boolean) {
    if (!id) return { error: 'id requis' };
    const patch: Record<string, unknown> = { status };
    if (setApprovedAt) patch.approved_at = new Date().toISOString();
    const { error } = await admin.from('formateurs').update(patch).eq('id', id);
    return error ? { error: error.message } : { ok: true };
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}
