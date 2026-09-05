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
    const resolution = await findOwnerBySlug(admin, slug);
    if (resolution.statut === 'introuvable') {
        return json({ error: 'Parcours introuvable' }, 404);
    }
    if (resolution.statut === 'ambigu') {
        // 409 et non 403 : ce n'est pas l'eleve qui est en faute, c'est la
        // publication. Le message reste vague cote client — inutile de lui
        // apprendre combien de formateurs partagent ce slug.
        return json({ error: 'Ce parcours est publie en double : contactez votre formateur.' }, 409);
    }
    const ownerId = resolution.ownerId;

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

/**
 * Retrouve le formateur propriétaire d'un slug, et REFUSE si plusieurs le
 * revendiquent.
 *
 * La version précédente renvoyait le premier trouvé. Ce n'était pas seulement
 * imprécis, c'était une fuite entre formateurs — parce que les jetons d'élèves
 * ne sont pas uniques : ce sont des identifiants choisis par l'enseignant
 * (« STU001 »), importés depuis un CSV, et le même peut exister chez plusieurs.
 * Soit deux formateurs ayant tous deux un parcours « P001 » et un élève
 * « STU001 » : l'élève du second était résolu vers le premier, son jeton y
 * figurait donc aussi, l'autorisation passait, et il lisait puis écrasait la
 * progression de l'élève d'un autre formateur.
 *
 * Le préfixe de slug (Phase 1) rend les slugs globalement uniques et doit
 * empêcher ce cas d'arriver. Cette fonction ne s'y fie pas : un parcours publié
 * à la main, une migration incomplète ou un préfixe absent suffiraient à le
 * recréer. Devant l'ambiguïté, on refuse tout le monde plutôt que de servir la
 * mauvaise personne — une porte fermée se remarque et se corrige, une porte qui
 * ouvre sur le voisin, non.
 */
type ResolutionOwner =
    | { statut: 'trouve'; ownerId: string }
    | { statut: 'introuvable' }
    | { statut: 'ambigu'; proprietaires: number };

async function findOwnerBySlug(admin: SupabaseClient, slug: string): Promise<ResolutionOwner> {
    // Le nombre de lignes scanné est borné par le nombre de formateurs (quelques
    // centaines, cf. plan) — un parcours au format cours.json par ligne, pas un
    // scan de toutes les progressions élèves.
    const { data, error } = await admin
        .from('parcours_data')
        .select('owner_id, value')
        .eq('key', 'cours.json');
    if (error || !data) return { statut: 'introuvable' };

    const proprietaires: string[] = [];
    for (const row of data as { owner_id: string; value: { parcours?: { slug: string }[] } }[]) {
        const parcoursList = row.value?.parcours;
        if (Array.isArray(parcoursList) && parcoursList.some((p) => p.slug === slug)) {
            proprietaires.push(row.owner_id);
        }
    }

    if (proprietaires.length === 0) return { statut: 'introuvable' };
    if (proprietaires.length > 1) {
        // Trace serveur : c'est une anomalie de publication, l'administrateur
        // doit pouvoir la voir sans attendre qu'un élève se plaigne.
        console.error(
            '[student-progress] Slug revendiqué par ' + proprietaires.length +
            ' formateurs, accès refusé — slug: ' + slug +
            ', owner_id: ' + proprietaires.join(', ')
        );
        return { statut: 'ambigu', proprietaires: proprietaires.length };
    }
    return { statut: 'trouve', ownerId: proprietaires[0] };
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
