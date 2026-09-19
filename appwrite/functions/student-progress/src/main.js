// ============================================================================
// student-progress — fonction serveur (Appwrite Function)
// ============================================================================
// Portage Appwrite de supabase/functions/student-progress/index.ts. Même
// contrat, même enchaînement, mêmes refus — seul le magasin change.
//
// Point d'entrée unique pour l'accès apprenant (anonyme) à sa progression.
// Reçoit en POST JSON : { action: 'get'|'set'|'whoami', slug, token, key?, value? }
//
// 'whoami' vérifie qu'un jeton est bien inscrit à ce parcours et renvoie le nom
// de l'apprenant, sans lire ni écrire de progression — c'est ce qu'appellent
// login.html et user.html pour valider un jeton.
//
// Pourquoi une fonction serveur : cours.json est un document PAR FORMATEUR. Un
// apprenant ne connaît que son jeton et le slug de son parcours, jamais le
// formateur qui le possède. Il faut donc chercher, parmi tous les formateurs,
// celui dont le cours.json contient ce slug — seule une clé d'API, qui voit
// toutes les lignes, le permet.
//
// ⚠️ TROIS ACCORDS À TENIR AVEC LE RESTE DU CODE, sous peine de pannes muettes :
//
//   1. L'IDENTIFIANT DE LIGNE. Appwrite n'a pas de clé composite (owner_id, key)
//      comme la contrainte SQL de Supabase : l'unicité est fabriquée dans l'ID
//      lui-même, par un hash FNV-1a de la clé logique. idLigne() ci-dessous doit
//      rester le jumeau exact de AppwriteProvider.prototype._docId
//      (storage/provider.appwrite.js). S'ils divergent, la progression écrite
//      par l'apprenant atterrit dans une ligne que l'application formateur ne
//      lira jamais — sans la moindre erreur nulle part.
//
//   2. LE FORMAT DE `value`. Le fournisseur stocke une CHAÎNE JSON, pas du JSON
//      natif comme le jsonb de Supabase. On parse à la lecture, on sérialise à
//      l'écriture.
//
//   3. LE CHAMP QUI PORTE LE JETON dans users_list est `id`, jamais `token`.
//      La version Supabase garde la trace d'un bug où cette confusion faisait
//      échouer TOUTES les autorisations, quel que soit le jeton.
//
// CORS : contrairement à Supabase, ce n'est PAS la fonction qui l'accorde. La
// console Appwrite doit déclarer une plateforme Web pour chaque domaine
// appelant — voir appwrite/deploy-student-progress.mjs, qui s'en charge. Figer
// un hôte ici ne servirait à rien, et c'est la faute de la version Supabase,
// dont l'origine codée en dur interdit tout autre déploiement.
// ============================================================================

const TABLE_DONNEES  = 'app_data';
const TABLE_PARCOURS = 'parcours_data';

/**
 * Hash déterministe (FNV-1a, 32 bits) → identifiant de ligne Appwrite.
 * Jumeau de AppwriteProvider.prototype._docId — voir l'accord n°1 en tête.
 */
function idLigne(cle, ownerId) {
    const graine = ownerId ? (ownerId + '::' + cle) : cle;
    let hash = 0x811c9dc5;
    for (let i = 0; i < graine.length; i++) {
        hash ^= graine.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return 'k' + (hash >>> 0).toString(16);
}

export default async ({ req, res, error }) => {
    const endpoint = (process.env.APPWRITE_FUNCTION_API_ENDPOINT || '').replace(/\/$/, '');
    const projet   = process.env.APPWRITE_FUNCTION_PROJECT_ID;
    const base     = process.env.APPWRITE_DATABASE_ID || 'cours-interactifs';

    // Clé dynamique fournie par Appwrite à chaque exécution, sinon clé posée en
    // variable de la fonction. Jamais écrite dans le dépôt.
    const cleApi = (req.headers && req.headers['x-appwrite-key']) || process.env.APPWRITE_API_KEY;

    if (!endpoint || !projet || !cleApi) {
        error("Configuration incomplète : endpoint, projet ou clé d'API manquant.");
        return res.json({ error: 'Fonction mal configurée' }, 500);
    }

    const cheminLignes = (table, suffixe) =>
        '/tablesdb/' + base + '/tables/' + table + '/rows' + (suffixe || '');

    // ── Appel REST vers Appwrite ────────────────────────────────────────────
    async function appel(methode, chemin, corps) {
        const reponse = await fetch(endpoint + chemin, {
            method: methode,
            headers: {
                'X-Appwrite-Project': projet,
                'X-Appwrite-Key':     cleApi,
                'Content-Type':       'application/json'
            },
            body: corps === undefined ? undefined : JSON.stringify(corps)
        });
        if (reponse.status === 404) {
            const absent = new Error('introuvable');
            absent.status = 404;
            throw absent;
        }
        if (!reponse.ok) {
            throw new Error('Appwrite HTTP ' + reponse.status + ' sur ' + chemin);
        }
        return reponse.json();
    }

    /** Lit une ligne par sa clé logique. Retourne null si absente. */
    async function lire(table, cle, ownerId) {
        try {
            const ligne = await appel('GET', cheminLignes(table, '/' + idLigne(cle, ownerId)));
            if (!ligne || ligne.value === undefined || ligne.value === null) return null;
            // Accord n°2 : `value` est une chaîne JSON.
            return typeof ligne.value === 'string' ? JSON.parse(ligne.value) : ligne.value;
        } catch (e) {
            if (e.status === 404) return null;
            throw e;
        }
    }

    /** Écrit une ligne (upsert), au même identifiant que le fournisseur. */
    async function ecrire(table, cle, valeur, ownerId) {
        const rowId = idLigne(cle, ownerId);
        const data  = { key: cle, value: JSON.stringify(valeur), updated_at: new Date().toISOString() };
        if (ownerId) data.owner_id = ownerId;

        try {
            await appel('PATCH', cheminLignes(table, '/' + rowId), { data });
        } catch (e) {
            if (e.status !== 404) throw e;
            await appel('POST', cheminLignes(table), { rowId, data });
        }
    }

    /**
     * Retrouve le formateur propriétaire d'un slug, et REFUSE si plusieurs le
     * revendiquent.
     *
     * Les jetons d'apprenants ne sont pas uniques : ce sont des identifiants
     * choisis par l'évaluateur (« STU001 »), et le même peut exister chez
     * plusieurs. Servir le premier trouvé ferait fuiter la progression d'un
     * apprenant vers celle d'un autre formateur.
     *
     * En MONO-FORMATEUR, les lignes ne portent pas d'owner_id : une seule ligne
     * cours.json existe, ownerId vaut null, et ce n'est pas une anomalie.
     */
    async function trouverProprietaire(slugCherche) {
        const requete = encodeURIComponent(JSON.stringify({
            method: 'equal', values: ['key', ['cours.json']]
        }));
        const page   = await appel('GET', cheminLignes(TABLE_PARCOURS, '?queries[]=' + requete));
        const lignes = (page && Array.isArray(page.rows)) ? page.rows : [];

        const proprietaires = [];
        for (const ligne of lignes) {
            let contenu;
            try {
                contenu = typeof ligne.value === 'string' ? JSON.parse(ligne.value) : ligne.value;
            } catch {
                continue; // ligne illisible : on l'ignore plutôt que de tout refuser
            }
            const parcours = contenu && contenu.parcours;
            if (Array.isArray(parcours) && parcours.some(p => p && p.slug === slugCherche)) {
                proprietaires.push(ligne.owner_id || null);
            }
        }

        if (proprietaires.length === 0) return { statut: 'introuvable' };
        if (proprietaires.length > 1)  return { statut: 'ambigu', proprietaires: proprietaires.length };
        return { statut: 'trouve', ownerId: proprietaires[0] };
    }

    /**
     * Retrouve l'entrée d'un jeton dans "{slug}:teacher:users_list", ou null.
     * Accord n°3 : le champ qui porte le jeton est `id`, jamais `token`.
     */
    async function trouverInscrit(ownerId, slugCherche, jeton) {
        const liste = await lire(TABLE_DONNEES, slugCherche + ':teacher:users_list', ownerId);
        if (!Array.isArray(liste)) return null;
        return liste.find(u => u && u.id === jeton) || null;
    }

    // ── Lecture de la requête ───────────────────────────────────────────────
    if (req.method !== 'POST') return res.json({ error: 'Méthode non supportée' }, 405);

    let corps;
    try {
        corps = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    } catch {
        return res.json({ error: 'Corps de requête invalide (JSON attendu)' }, 400);
    }

    const { action, slug, token, key, value } = corps;
    if (!action || !slug || !token) {
        return res.json({ error: 'Paramètres manquants (action, slug, token requis)' }, 400);
    }
    if (action !== 'get' && action !== 'set' && action !== 'whoami') {
        return res.json({ error: 'action doit être "get", "set" ou "whoami"' }, 400);
    }
    if ((action === 'get' || action === 'set') && !key) {
        return res.json({ error: 'Paramètre manquant (key requis pour get/set)' }, 400);
    }

    try {
        // ── 1. Retrouver le formateur propriétaire de ce slug ────────────────
        const resolution = await trouverProprietaire(slug);

        if (resolution.statut === 'introuvable') {
            return res.json({ error: 'Parcours introuvable' }, 404);
        }
        if (resolution.statut === 'ambigu') {
            // 409 et non 403 : ce n'est pas l'apprenant qui est en faute, c'est
            // la publication. Devant l'ambiguïté on refuse tout le monde plutôt
            // que de servir la mauvaise personne — une porte fermée se remarque
            // et se corrige, une porte qui ouvre sur le voisin, non.
            error('[student-progress] slug revendiqué par ' + resolution.proprietaires +
                  ' formateurs, accès refusé — slug: ' + slug);
            return res.json({ error: 'Ce parcours est publié en double : contactez votre évaluateur.' }, 409);
        }

        const ownerId = resolution.ownerId; // null en mono-formateur : c'est normal

        // ── 2. Ce jeton est-il inscrit chez CE formateur ? ───────────────────
        const inscrit = await trouverInscrit(ownerId, slug, token);

        if (action === 'whoami') {
            return res.json(inscrit
                ? { found: true, name: inscrit.name || null, class: inscrit.class || null }
                : { found: false });
        }
        if (!inscrit) {
            return res.json({ error: 'Jeton non autorisé pour ce parcours' }, 403);
        }

        // ── 3. Lire ou écrire la progression, scopée à ce formateur ──────────
        const cleProgression = slug + ':' + token + ':' + key;

        if (action === 'get') {
            return res.json({ value: await lire(TABLE_DONNEES, cleProgression, ownerId) });
        }

        await ecrire(TABLE_DONNEES, cleProgression, value, ownerId);
        return res.json({ value });

    } catch (e) {
        error('[student-progress] ' + (e && e.message ? e.message : String(e)));
        return res.json({ error: 'Erreur interne' }, 500);
    }
};
