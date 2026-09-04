// ============================================================================
// _shared/sendEmail.ts — envoi d'email via Resend, partagé par les fonctions
// "superadmin" et "notify-admin-new-teacher".
// ============================================================================
// Choix de Resend : une seule clé API, pas de service à héberger soi-même
// (cf. plan, Phase 4 — "pas de nouveau service à héberger"). Remplaçable par
// SendGrid ou tout autre fournisseur HTTP en ne changeant que ce fichier.
//
// ⚠️ Jamais exécuté contre un vrai compte Resend — nécessite le secret de
// fonction RESEND_API_KEY (`supabase secrets set RESEND_API_KEY=...`) et une
// adresse d'expédition vérifiée sur le compte Resend (RESEND_FROM_EMAIL).
// ============================================================================

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'coursInteractifs <onboarding@resend.dev>';

export interface EmailParams {
    to: string;
    subject: string;
    text: string;
}

/**
 * Envoie un email. N'échoue jamais bruyamment : un email non envoyé (clé
 * absente, Resend indisponible) est loggé mais ne doit jamais faire échouer
 * l'opération superadmin ou l'inscription du formateur qui l'a déclenché.
 */
export async function sendEmail({ to, subject, text }: EmailParams): Promise<boolean> {
    if (!RESEND_API_KEY) {
        console.warn('[sendEmail] RESEND_API_KEY absent — email non envoyé à', to);
        return false;
    }
    try {
        const resp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + RESEND_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, text })
        });
        if (!resp.ok) {
            console.warn('[sendEmail] Resend HTTP', resp.status, await resp.text());
            return false;
        }
        return true;
    } catch (e) {
        console.warn('[sendEmail] échec réseau:', (e as Error).message);
        return false;
    }
}
