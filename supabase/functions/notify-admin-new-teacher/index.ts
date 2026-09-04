// ============================================================================
// notify-admin-new-teacher — fonction serveur (Edge Function Supabase)
// ============================================================================
// Invoquée par le trigger SQL `handle_new_formateur()` (migration
// 0002_formateurs.sql) à chaque nouvelle connexion GitHub, jamais directement
// par un client. Lit l'adresse de notification (réglage global, owner_id
// NULL — cf. Phase 2bis) et envoie un email à l'administrateur.
//
// N'échoue jamais bruyamment : appelée depuis un trigger Postgres, une erreur
// ici ne doit jamais faire échouer la création du compte auth.users
// elle-même (le trigger rattrape déjà toute exception, mais on reste
// défensif ici aussi).
//
// ⚠️ Jamais encore déployée ni exécutée contre un vrai projet — à valider dès
// qu'un projet de test existe.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail } from '../_shared/sendEmail.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
    if (req.method !== 'POST') return new Response('Méthode non supportée', { status: 405 });

    let body: { github_login?: string; email?: string; formateur_id?: string };
    try {
        body = await req.json();
    } catch {
        return new Response('Corps invalide', { status: 400 });
    }

    try {
        const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
        const { data } = await admin
            .from('app_data')
            .select('value')
            .is('owner_id', null)
            .eq('key', 'admin_notification_email')
            .maybeSingle();

        const adminEmail = data?.value as string | undefined;
        if (!adminEmail) {
            console.warn('[notify-admin-new-teacher] Aucune adresse de notification configurée, email non envoyé.');
            return new Response(JSON.stringify({ ok: false, reason: 'no_admin_email' }), { status: 200 });
        }

        await sendEmail({
            to: adminEmail,
            subject: 'Nouvelle demande d\'inscription formateur',
            text: `Le compte GitHub "${body.github_login || '(inconnu)'}" (${body.email || 'sans email'}) `
                + `vient de se connecter à coursInteractifs et attend votre approbation.\n\n`
                + `Rendez-vous sur la page d'administration des formateurs pour l'approuver ou le refuser.`
        });

        return new Response(JSON.stringify({ ok: true }), { status: 200 });
    } catch (e) {
        console.warn('[notify-admin-new-teacher] erreur:', (e as Error).message);
        return new Response(JSON.stringify({ ok: false }), { status: 200 }); // 200 volontaire : ne jamais faire échouer le trigger appelant
    }
});
