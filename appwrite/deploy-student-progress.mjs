#!/usr/bin/env node
// ============================================================================
// Déploiement de la fonction Appwrite « student-progress »
// ============================================================================
// Crée la fonction si elle n'existe pas, téléverse le code, l'active.
//
// LA CLÉ D'API NE VIT PAS DANS CE DÉPÔT. Le script la lit dans la variable
// d'environnement APPWRITE_API_KEY, que vous posez au moment de lancer :
//
//     APPWRITE_API_KEY="…" node appwrite/deploy-student-progress.mjs
//
// (PowerShell : $env:APPWRITE_API_KEY="…" ; node appwrite/...)
//
// Elle n'est jamais écrite sur disque, ni affichée, ni journalisée. Le script
// ne crée aucun fichier de secret.
//
// Le reste de la configuration est lu dans storage/config.json (endpoint,
// projectId, databaseId), pour qu'il n'y ait qu'un seul endroit où elle vive.
// ============================================================================

import { readFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ICI    = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..');

const ID_FONCTION = 'student-progress';   // doit valoir ce qu'appelle studentProgressBridge.js
const ENTREE      = 'src/main.js';
const RUNTIME     = process.env.APPWRITE_RUNTIME || 'node-22';

// ── Configuration ───────────────────────────────────────────────────────────

const cleApi = process.env.APPWRITE_API_KEY;
if (!cleApi) {
    console.error('✗ APPWRITE_API_KEY absente.');
    console.error('  Posez-la dans votre terminal avant de lancer ce script ; elle ne doit');
    console.error('  jamais être écrite dans un fichier du dépôt.');
    process.exit(1);
}

/**
 * La configuration Appwrite peut vivre a trois endroits, et le depot local
 * n'est pas forcement celui qui est deploye : storage/config.json y est en
 * Supabase, tandis que le site publie sert une config Appwrite. On lit donc les
 * deux fichiers, on ignore les valeurs gabarit (« <votre-project-id> »), et les
 * variables d'environnement l'emportent sur tout.
 */
function lireConfigAppwrite() {
    const trouve = {};
    for (const nom of ['config.json', 'config.appwrite.json']) {
        const chemin = join(RACINE, 'storage', nom);
        if (!existsSync(chemin)) continue;
        let bloc;
        try { bloc = (JSON.parse(readFileSync(chemin, 'utf8')) || {}).appwrite; } catch { continue; }
        if (!bloc) continue;
        for (const [cle, valeur] of Object.entries(bloc)) {
            if (typeof valeur !== 'string' || valeur.startsWith('<')) continue; // gabarit
            if (trouve[cle] === undefined) trouve[cle] = valeur;
        }
    }
    return trouve;
}

const aw = lireConfigAppwrite();
const ENDPOINT = (process.env.APPWRITE_ENDPOINT || aw.endpoint || '').replace(/\/$/, '');
const PROJET   = process.env.APPWRITE_PROJECT_ID || aw.projectId;
const BASE     = process.env.APPWRITE_DATABASE_ID || aw.databaseId || 'cours-interactifs';

if (!ENDPOINT || !PROJET) {
    console.error('✗ endpoint ou projectId introuvable.');
    console.error('  Ni storage/config.json ni storage/config.appwrite.json ne portent de');
    console.error('  valeurs reelles (les gabarits « <...> » sont ignores). Passez-les en');
    console.error('  variables :');
    console.error('');
    console.error('    APPWRITE_ENDPOINT="https://fra.cloud.appwrite.io/v1"');
    console.error('    APPWRITE_PROJECT_ID="..." APPWRITE_API_KEY="..."');
    console.error('    node appwrite/deploy-student-progress.mjs');
    process.exit(1);
}

// Domaines autorisés à appeler la fonction depuis un navigateur. Appwrite les
// gère par « plateforme Web », pas par en-tête CORS dans la fonction.
const DOMAINES = (process.env.APPWRITE_DOMAINES || 'xgrandjean.github.io,scse972.github.io,localhost')
    .split(',').map(d => d.trim()).filter(Boolean);

console.log('Projet   : ' + PROJET);
console.log('Endpoint : ' + ENDPOINT);
console.log('Base     : ' + BASE);
console.log('Fonction : ' + ID_FONCTION + ' (' + RUNTIME + ')');
console.log('');

// ── Appels REST ─────────────────────────────────────────────────────────────

async function api(methode, chemin, corps, entetes = {}) {
    const reponse = await fetch(ENDPOINT + chemin, {
        method: methode,
        headers: {
            'X-Appwrite-Project': PROJET,
            'X-Appwrite-Key':     cleApi,
            ...(corps instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
            ...entetes
        },
        body: corps === undefined ? undefined
            : corps instanceof FormData ? corps
            : JSON.stringify(corps)
    });

    const texte = await reponse.text();
    let donnees = null;
    try { donnees = texte ? JSON.parse(texte) : null; } catch { /* réponse non JSON */ }

    if (!reponse.ok) {
        const message = (donnees && donnees.message) || texte || ('HTTP ' + reponse.status);
        const erreur = new Error(message);
        erreur.status = reponse.status;
        throw erreur;
    }
    return donnees;
}

// ── 1. La fonction existe-t-elle ? ──────────────────────────────────────────

let existe = false;
try {
    await api('GET', '/functions/' + ID_FONCTION);
    existe = true;
    console.log('• Fonction déjà présente — le code sera remplacé.');
} catch (e) {
    if (e.status !== 404) {
        console.error('✗ Impossible d\'interroger la fonction : ' + e.message);
        process.exit(1);
    }
    console.log('• Fonction absente — création.');
}

if (!existe) {
    await api('POST', '/functions', {
        functionId: ID_FONCTION,
        name: 'student-progress',
        runtime: RUNTIME,
        // Exécution ouverte : l'apprenant est anonyme par construction. Ce n'est
        // pas une faille — la fonction vérifie elle-même slug + jeton avant tout
        // accès, c'est précisément sa raison d'être.
        execute: ['any'],
        entrypoint: ENTREE,
        // La clé dynamique permet à la fonction d'accéder aux tables sans qu'on
        // y range une clé permanente.
        scopes: ['databases.read', 'databases.write', 'tables.read', 'tables.write',
                 'documents.read', 'documents.write', 'rows.read', 'rows.write']
    });
    console.log('  ✓ créée');
}

// ── 2. Variables d'environnement ────────────────────────────────────────────
// Pas de clé d'API ici : Appwrite en fournit une dynamique à chaque exécution.

try {
    const { variables = [] } = await api('GET', '/functions/' + ID_FONCTION + '/variables') || {};
    const existante = variables.find(v => v.key === 'APPWRITE_DATABASE_ID');
    if (existante) {
        await api('PUT', '/functions/' + ID_FONCTION + '/variables/' + existante.$id,
                  { key: 'APPWRITE_DATABASE_ID', value: BASE });
    } else {
        await api('POST', '/functions/' + ID_FONCTION + '/variables',
                  { key: 'APPWRITE_DATABASE_ID', value: BASE });
    }
    console.log('• Variable APPWRITE_DATABASE_ID = ' + BASE);
} catch (e) {
    console.warn('⚠ Variables non posées (' + e.message + ') — la fonction retombera sur sa valeur par défaut.');
}

// ── 3. Plateformes Web (le CORS d'Appwrite) ─────────────────────────────────
// Sans plateforme déclarée, le navigateur de l'apprenant se fait refuser l'appel
// avant même qu'il parte. Cet appel passe par l'API Console : une clé de projet
// ordinaire n'y a pas forcément droit, d'où le repli explicite.

try {
    const { platforms = [] } = await api('GET', '/projects/' + PROJET + '/platforms') || {};
    const deja = new Set(platforms.map(p => p.hostname));
    for (const domaine of DOMAINES) {
        if (deja.has(domaine)) { console.log('• Plateforme déjà déclarée : ' + domaine); continue; }
        await api('POST', '/projects/' + PROJET + '/platforms', {
            type: 'web', name: domaine, hostname: domaine
        });
        console.log('  ✓ plateforme ajoutée : ' + domaine);
    }
} catch (e) {
    console.warn('');
    console.warn('⚠ Plateformes Web non vérifiables avec cette clé (' + e.message + ').');
    console.warn('  À FAIRE À LA MAIN dans la console Appwrite → Settings → Platforms,');
    console.warn('  sinon le navigateur refusera l\'appel (erreur CORS) :');
    for (const domaine of DOMAINES) console.warn('    • Web · ' + domaine);
    console.warn('');
}

// ── 4. Téléverser le code ───────────────────────────────────────────────────

const dossier = join(ICI, 'functions', ID_FONCTION);
const archive = join(tmpdir(), 'student-progress-' + Date.now() + '.tar.gz');

console.log('• Archivage de ' + dossier);
try {
    execFileSync('tar', ['-czf', archive, '-C', dossier, '.'], { stdio: 'pipe' });
} catch (e) {
    console.error('✗ Archivage impossible : ' + e.message);
    console.error('  La commande « tar » doit être disponible (Git Bash la fournit).');
    process.exit(1);
}

try {
    const formulaire = new FormData();
    formulaire.set('entrypoint', ENTREE);
    formulaire.set('activate', 'true');
    formulaire.set('code', new Blob([readFileSync(archive)]), 'code.tar.gz');

    const deploiement = await api('POST', '/functions/' + ID_FONCTION + '/deployments', formulaire);
    console.log('  ✓ déploiement ' + (deploiement && deploiement.$id) + ' envoyé');
    console.log('');
    console.log('La construction se termine côté Appwrite : comptez quelques dizaines de');
    console.log('secondes avant que la fonction réponde. Vérification :');
    console.log('');
    console.log('  curl -s -X POST "' + ENDPOINT + '/functions/' + ID_FONCTION + '/executions" \\');
    console.log('    -H "X-Appwrite-Project: ' + PROJET + '" -H "Content-Type: application/json" \\');
    console.log('    -d \'{"body":"{\\"action\\":\\"whoami\\",\\"slug\\":\\"VOTRE_SLUG\\",\\"token\\":\\"VOTRE_JETON\\"}","async":false}\'');
} catch (e) {
    console.error('✗ Téléversement échoué : ' + e.message);
    process.exitCode = 1;
} finally {
    if (existsSync(archive)) rmSync(archive, { force: true });
}
