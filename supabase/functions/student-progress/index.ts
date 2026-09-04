// ============================================================================
// student-progress — fonction serveur (Edge Function Supabase)
// ============================================================================
// Point d'entrée unique pour l'accès élève (anonyme) à sa progression, en
// mode Web multi-formateur (Phase 3 du plan). Reçoit en POST JSON :
//   { action: 'get'|'set', slug, token, key, value? }
//
// Pourquoi une fonction serveur et pas une policy RLS anonyme :
// `cours.json` est un document PAR FORMATEUR (colonne owner_id, cf. migration
// 0001), pas une clé par parcours — un élève ne connaît que son jeton et le
// slug de son parcours (rendu globalement unique à la publication, Phase 1),
// jamais le formateur qui le possède. Il faut donc chercher, parmi TOUS les
// formateurs, celui dont le cours.json contient ce slug — une policy RLS
// déclarative ne peut pas faire cette recherche ; seule une fonction disposant
// de la clé service_role (qui voit toutes les lignes, tous formateurs
// confondus) le peut.
//
// Sécurité : trouver le bon slug ne suffit pas — le jeton élève doit en plus
// figurer dans la liste "{slug}:teacher:users_list" de CE formateur précis
// avant tout accès (lecture ou écriture) à sa progression.
//
// ⚠️ Jamais encore déployée ni exécutée contre un vrai projet Supabase — les
// noms de colonnes/tables suivent la migration 0001_multi_tenant.sql, à
// valider ensemble dès qu'un projet de test existe (cf. plan, prérequis
// externes).
// ============================================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface RequestBody {
    action: 'get' | 'set';
    slug: string;
    token: string;
    key: string;
    value?: unknown;
}

Deno.serve(async (req: Request) => {
    if (req.method !== 'POST') {
        return json({ error: 'Méthode non supportée' }, 405);
    }

    let body: RequestBody;
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Corps de requête invalide (JSON attendu)' }, 400);
    }

    const { action, slug, token, key, value } = body || ({} as RequestBody);
    if (!action || !slug || !token || !key) {
        return json({ error: 'Paramètres manquants (action, slug, token, key requis)' }, 400);
    }
    if (action !== 'get' && action !== 'set') {
        return json({ error: 'action doit être "get" ou "set"' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1. Retrouver, parmi tous les formateurs, celui dont cours.json contient ce slug.
    const ownerId = await findOwnerBySlug(admin, slug);
    if (!ownerId) {
        return json({ error: 'Parcours introuvable' }, 404);
    }

    // 2. Vérifier que ce jeton figure bien dans la liste d'élèves de CE formateur.
    const authorized = await tokenIsAssigned(admin, ownerId, slug, token);
    if (!authorized) {
        return json({ error: 'Jeton non autorisé pour ce parcours' }, 403);
    }

    // 3. Lire ou écrire la progression, scopée à ce owner_id précis — jamais
    //    à un autre, même si un autre formateur a par hasard la même clé.
    const progressKey = `${slug}:${token}:${key}`;

    if (action === 'get') {
        const { data, error } = await admin
            .from('app_data')
            .select('value')
            .eq('owner_id', ownerId)
            .eq('key', progressKey)
            .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        return json({ value: data ? data.value : null });
    }

    // action === 'set'
    const { error } = await admin
        .from('app_data')
        .upsert(
            { owner_id: ownerId, key: progressKey, value, updated_at: new Date().toISOString() },
            { onConflict: 'owner_id,key' }
        );
    if (error) return json({ error: error.message }, 500);
    return json({ value });
});

async function findOwnerBySlug(admin: SupabaseClient, slug: string): Promise<string | null> {
    // Le nombre de lignes scanné est borné par le nombre de formateurs (quelques
    // centaines, cf. plan) — un parcours au format cours.json par ligne, pas un
    // scan de toutes les progressions élèves.
    const { data, error } = await admin
        .from('parcours_data')
        .select('owner_id, value')
        .eq('key', 'cours.json');
    if (error || !data) return null;

    for (const row of data as { owner_id: string; value: { parcours?: { slug: string }[] } }[]) {
        const parcoursList = row.value?.parcours;
        if (Array.isArray(parcoursList) && parcoursList.some((p) => p.slug === slug)) {
            return row.owner_id;
        }
    }
    return null;
}

async function tokenIsAssigned(admin: SupabaseClient, ownerId: string, slug: string, token: string): Promise<boolean> {
    const { data, error } = await admin
        .from('app_data')
        .select('value')
        .eq('owner_id', ownerId)
        .eq('key', `${slug}:teacher:users_list`)
        .maybeSingle();
    if (error || !data || !Array.isArray(data.value)) return false;
    return (data.value as { token?: string }[]).some((u) => u.token === token);
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}
