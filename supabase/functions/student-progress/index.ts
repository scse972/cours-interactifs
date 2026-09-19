// ============================================================================
// student-progress — fonction serveur (Edge Function Supabase)
// ============================================================================
// Point d'entrée unique pour l'accès élève (anonyme) à sa progression, en
// mode Web multi-formateur (Phase 3 du plan). Reçoit en POST JSON :
//   { action: 'get'|'set'|'whoami', slug, token, key?, value? }
//
// 'whoami' vérifie qu'un jeton est bien inscrit à ce parcours et renvoie le
// nom de l'élève, sans lire ni écrire de progression — c'est ce qu'appellent
// login.html et user.html (coursInteractifs) pour valider un jeton, qui ne
// peuvent plus le faire en lisant "{slug}:teacher:users_list" en direct
// depuis que la RLS est fermée : owner_id = auth.uid() échoue toujours pour
// un appel anonyme, ce qui provoquait une boucle de redirection infinie
// (constaté en testant un vrai lien élève, migration 0007).
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
// Deployee et exercee contre un vrai projet depuis (cf. PLAN_migration_plateforme,
// journal) : c'est ce test reel qui a fait apparaitre l'absence de CORS et le
// verify_jwt de la passerelle, tous deux corriges. L'avertissement « jamais
// deployee » qui figurait ici n'avait plus lieu d'etre.
//
// Jumelle Appwrite : appwrite/functions/student-progress/src/main.js. Meme
// contrat, memes refus, memes codes. Les faire diverger casserait l'un des deux
// magasins sans toucher l'autre — et rien ne le signalerait.
// ============================================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface RequestBody {
    action: 'get' | 'set' | 'whoami';
    slug: string;
    token: string;
    key?: string;
    value?: unknown;
}

// Appelée directement depuis le navigateur de l'apprenant, corps JSON — voir la
// même remarque CORS que dans supabase/functions/superadmin/index.ts.
//
// L'origine etait FIGEE sur https://scse972.github.io. Or XSpro publie le site
// de chaque formateur sur SON compte GitHub : tous les autres domaines etaient
// refuses par le navigateur avant meme que l'appel parte. La fonction pouvait
// etre parfaitement saine, aucun apprenant d'un autre site ne pouvait s'y
// connecter. Constate en portant la meme fonction vers Appwrite, ou l'equivalent
// (la « plateforme Web ») se declare par domaine.
//
// La liste vient donc de l'environnement : ORIGINES_AUTORISEES, domaines separes
// par des virgules. On renvoie l'origine de l'appelant quand elle y figure —
// jamais « * », qui obligerait a renoncer aux cookies et masquerait les fautes
// de configuration.
const ORIGINES_AUTORISEES = (Deno.env.get('ORIGINES_AUTORISEES') || 'https://scse972.github.io')
    .split(',').map((o) => o.trim()).filter(Boolean);

function corsHeaders(req: Request): Record<string, string> {
    const origine = req.headers.get('origin') || '';
    const accordee = ORIGINES_AUTORISEES.includes(origine)
        ? origine
        : ORIGINES_AUTORISEES[0];
    return {
        'Access-Control-Allow-Origin': accordee,
        // Une meme fonction repond a plusieurs origines : sans Vary, un cache
        // intermediaire servirait a l'une l'en-tete calcule pour l'autre.
        'Vary': 'Origin',
        // apikey + Authorization : la passerelle Supabase les exige sur l'appel
        // reel (cf. studentProgressBridge.js), meme si cette fonction n'en tire
        // aucune authentification elle-meme — seuls slug+token, dans le corps,
        // le font.
        'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };
}

Deno.serve(async (req: Request) => {
    const CORS = corsHeaders(req);
    const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS }
    });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
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
    if (!action || !slug || !token) {
        return json({ error: 'Paramètres manquants (action, slug, token requis)' }, 400);
    }
    if (action !== 'get' && action !== 'set' && action !== 'whoami') {
        return json({ error: 'action doit être "get", "set" ou "whoami"' }, 400);
    }
    if ((action === 'get' || action === 'set') && !key) {
        return json({ error: 'Paramètre manquant (key requis pour get/set)' }, 400);
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
        return json({ error: 'Ce parcours est publie en double : contactez votre evaluateur.' }, 409);
    }
    const ownerId = resolution.ownerId;

    // 2. Vérifier que ce jeton figure bien dans la liste d'élèves de CE formateur.
    const assignedUser = await findAssignedUser(admin, ownerId, slug, token);
    if (action === 'whoami') {
        return json(assignedUser
            ? { found: true, name: assignedUser.name || null, class: assignedUser.class || null }
            : { found: false });
    }
    if (!assignedUser) {
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

/**
 * Retrouve l'entrée élève d'un jeton dans "{slug}:teacher:users_list", ou
 * null si le jeton n'y figure pas.
 *
 * Le champ qui porte le jeton dans ces entrées est `id` (cf.
 * exportUsersListParcours.js `_eleveToUser()` côté XSpro, et teacherUsers.js
 * côté coursInteractifs — les deux écrivent `id`, jamais `token`). Une
 * version précédente de cette fonction testait `u.token`, un champ qui
 * n'existe dans aucune des deux écritures : l'autorisation échouait donc
 * TOUJOURS, quel que soit le jeton.
 */
async function findAssignedUser(admin: SupabaseClient, ownerId: string, slug: string, token: string): Promise<{ id: string; name?: string; class?: string } | null> {
    const { data, error } = await admin
        .from('app_data')
        .select('value')
        .eq('owner_id', ownerId)
        .eq('key', `${slug}:teacher:users_list`)
        .maybeSingle();
    if (error || !data || !Array.isArray(data.value)) return null;
    const found = (data.value as { id?: string; name?: string; class?: string }[]).find((u) => u.id === token);
    return found ?? null;
}

// json() est desormais defini DANS le gestionnaire : les en-tetes CORS dependent
// de l'origine de la requete, ils ne peuvent plus etre une constante de module.
