// test-fonctionPont.mjs — Banc de la fonction serveur Appwrite « student-progress »
// (appwrite/functions/student-progress/src/main.js), sans Appwrite : un faux fetch compte les
// requêtes. Vérifie la mémoire entre deux appels (19/11/2026) : le formateur d'un parcours et la
// liste des élèves ne sont plus relus à chaque écriture ; un élève tout juste inscrit est trouvé.
//
//   node scripts/test-fonctionPont.mjs
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

let echecs = 0;
const ok = (c, m) => { if (!c) echecs++; console.log(c ? 'PASS' : 'FAIL', m); };

process.env.APPWRITE_FUNCTION_API_ENDPOINT = 'https://exemple.appwrite.io/v1';
process.env.APPWRITE_FUNCTION_PROJECT_ID = 'projet';
process.env.APPWRITE_API_KEY = 'cle';

// La base simulée : cours.json (parcours P1), la liste des élèves, les progressions.
let inscrits = [{ id: 'e1', name: 'Élève Un' }];
const requetes = [];
global.fetch = async (url, options = {}) => {
    const methode = options.method || 'GET';
    requetes.push(methode + ' ' + url);
    const json = (corps, status = 200) => ({ ok: status < 400, status, json: async () => corps });
    if (url.includes('/tables/parcours_data/rows?')) {
        return json({ rows: [{ value: JSON.stringify({ parcours: [{ slug: 'P1' }] }), owner_id: null }] });
    }
    if (url.includes('/tables/app_data/rows/') && methode === 'GET') {
        // Seule la liste des élèves est lue ici (users_list).
        return json({ value: JSON.stringify(inscrits) });
    }
    if (url.includes('/tables/app_data/rows/') && methode === 'PATCH') return json({});
    return json({ message: 'inattendu' }, 500);
};

const dossier = path.dirname(fileURLToPath(import.meta.url));
const { default: fonction } = await import(pathToFileURL(path.join(dossier, '../appwrite/functions/student-progress/src/main.js')).href);

async function appeler(corps) {
    let reponse = null;
    await fonction({
        req: { method: 'POST', headers: {}, body: JSON.stringify(corps) },
        res: { json: (donnees, status = 200) => { reponse = { donnees, status }; return reponse; } },
        error: () => {},
    });
    return reponse;
}
const compte = (motif) => requetes.filter(r => r.includes(motif)).length;

const r1 = await appeler({ action: 'set', slug: 'P1', token: 'e1', key: 'student_e1_progress', value: { n: 1 } });
ok(r1.status === 200 && compte('parcours_data') === 1 && compte('PATCH') === 1, 'premier appel : le parcours est cherché, la progression écrite');

const r2 = await appeler({ action: 'set', slug: 'P1', token: 'e1', key: 'student_e1_progress', value: { n: 2 } });
ok(r2.status === 200 && compte('parcours_data') === 1, 'deuxième appel : cours.json n\'est pas relu (formateur gardé en mémoire)');
const lecturesListe = requetes.filter(r => r.startsWith('GET') && r.includes('/tables/app_data/rows/')).length;
ok(lecturesListe === 1, 'deuxième appel : la liste des élèves n\'est pas relue (gardée 1 min)');

// Un élève inscrit depuis : absent de la liste gardée, on relit avant de refuser.
inscrits = [...inscrits, { id: 'e2', name: 'Élève Deux' }];
const r3 = await appeler({ action: 'set', slug: 'P1', token: 'e2', key: 'student_e2_progress', value: { n: 1 } });
ok(r3.status === 200, 'un élève tout juste inscrit est accepté sans attendre la minute');

const r4 = await appeler({ action: 'set', slug: 'P1', token: 'inconnu', key: 'student_x_progress', value: {} });
ok(r4.status === 403, 'un jeton inconnu reste refusé');

const r5 = await appeler({ action: 'whoami', slug: 'P2', token: 'e1' });
ok(r5.status === 404, 'un parcours introuvable reste refusé (et n\'est pas gardé)');

console.log(echecs ? `\n${echecs} échec(s)` : '\nTout passe.');
process.exit(echecs ? 1 : 0);
