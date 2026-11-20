// test-memoireCoursJson.js — cours.json gardé dans le navigateur et relu seulement si sa date a
// changé (storage.js, staticJson._lireParLaDate, 20/11/2026), sans navigateur : une fausse base
// et une mémoire en Map à la place d'IndexedDB.
//
// Pourquoi : cours.json pèse 6,8 Mo et chaque page ouverte par un apprenant le retéléchargeait —
// la limite de bande passante d'Appwrite atteinte en deux séances.
//
//   node scripts/test-memoireCoursJson.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let echecs = 0;
const ok = (c, m) => { if (!c) echecs++; console.log(c ? 'PASS' : 'FAIL', m); };

function charger() {
    const donnees = new Map();
    const localStorage = {
        getItem: k => (donnees.has(k) ? donnees.get(k) : null), setItem: (k, v) => donnees.set(k, String(v)),
        removeItem: k => donnees.delete(k), key: i => [...donnees.keys()][i] ?? null, get length() { return donnees.size; },
    };
    const document = {
        readyState: 'loading', addEventListener() {},
        createElement: () => ({ style: {}, appendChild() {}, querySelector: () => null }),
        getElementById: () => null, body: { insertBefore() {}, style: {} }, visibilityState: 'visible',
    };
    const window = { addEventListener() {}, location: { search: '', pathname: '/', hostname: 'localhost', port: '8010', protocol: 'http:' } };
    const bac = {
        window, document, localStorage, console: { ...console, log() {}, warn() {}, info() {} },
        navigator: { onLine: true }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
        setImmediate, URLSearchParams, Promise, Map, Set, JSON, Date,
        getComputedStyle: () => ({ paddingTop: '0' }), fetch: async () => { throw new Error('pas de réseau'); },
    };
    window.window = window;
    vm.createContext(bac);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/storage.js'), 'utf8'), bac, { filename: 'storage.js' });
    return window.staticJson;
}

function fausseBase() {
    const base = {
        _endpoint: 'https://exemple/v1', _project: 'p', _databaseId: 'd', _collectionId: 'parcours_data',
        ligne: { jeton: 'j1', value: { parcours: [1, 2] } },
        telechargements: 0, dates: 0, datesEnPanne: false,
        async lister(cle, { valeurs } = {}) {
            base.dates++;
            if (base.datesEnPanne) throw new Error('Appwrite ne répond pas');
            if (valeurs !== false) throw new Error('le test attend une lecture des seules dates');
            return base.ligne ? [{ key: cle, jeton: base.ligne.jeton }] : [];
        },
        async get() { base.telechargements++; return base.ligne ? JSON.parse(JSON.stringify(base.ligne.value)) : null; },
    };
    return base;
}

function memoireEnMap() {
    const m = new Map();
    return { lire: async id => m.get(id) ?? null, ecrire: async (id, v) => { m.set(id, v); }, m };
}

(async () => {
    const S = charger();
    ok(typeof S._lireParLaDate === 'function', 'staticJson expose la lecture par la date');

    const base = fausseBase();
    const memoire = memoireEnMap();
    let r = await S._lireParLaDate(base, 'cours.json', memoire);
    ok(r.telecharge && base.telechargements === 1 && r.value.parcours.length === 2, 'première page : cours.json téléchargé et gardé');

    r = await S._lireParLaDate(base, 'cours.json', memoire);
    ok(!r.telecharge && base.telechargements === 1 && base.dates === 2 && r.value.parcours.length === 2,
        'page suivante, date inchangée : seule la date est demandée, rien n\'est retéléchargé');

    base.ligne = { jeton: 'j2', value: { parcours: [1, 2, 3] } };
    r = await S._lireParLaDate(base, 'cours.json', memoire);
    ok(r.telecharge && base.telechargements === 2 && r.value.parcours.length === 3, 'cours.json republié : retéléchargé une fois');

    base.datesEnPanne = true;
    r = await S._lireParLaDate(base, 'cours.json', memoire);
    ok(r.telecharge && base.telechargements === 3, 'date illisible : lecture directe, comme avant');
    base.datesEnPanne = false;

    const autre = fausseBase();
    autre._project = 'autre-projet';
    autre.ligne = { jeton: 'j2', value: { parcours: ['autre'] } };
    r = await S._lireParLaDate(autre, 'cours.json', memoire);
    ok(r.telecharge && r.value.parcours[0] === 'autre', 'une autre base, même date : rien n\'est repris de la première');

    base.ligne = null;
    r = await S._lireParLaDate(base, 'cours.json', memoire);
    ok(r.value === null && !r.telecharge, 'cours.json absent de la base : null, sans téléchargement');

    const sansListe = fausseBase();
    sansListe.lister = undefined;
    r = await S._lireParLaDate(sansListe, 'cours.json', memoire);
    ok(r.telecharge && r.value.parcours.length === 2, 'base qui ne sait pas lister (XPro, base locale) : lecture directe');

    console.log(echecs ? `\n${echecs} échec(s)` : '\nTout passe.');
    process.exit(echecs ? 1 : 0);
})();
