// test-scanProgressions.js — Les progressions lues par le tableau de bord formateur
// (teacherDashboard.js : getStudentProgress, switchTab, scanResetStudents) et la lecture groupée
// (storage.js : storage.lister), sans navigateur : un DOM réduit et un stockage lent.
//
// Mesuré dans XPro le 19/11/2026 : chaque élève lu par sa propre requête, et deux fois (l'onglet,
// puis la liste « Réinitialiser ») — 316 requêtes et 20 s par changement de parcours.
// Vérifie : le chargement d'un onglet lit les progressions d'un coup, la liste « Réinitialiser »
// reprend cette lecture (sauf après une réinitialisation), un geste ultérieur relit l'élève à
// jour, et sans lecture groupée (base locale, XPro antérieur) : 6 lectures à la fois au plus.
// storage.lister : la copie locale d'une écriture récente ou en attente l'emporte.
//
//   node scripts/test-scanProgressions.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let echecs = 0;
const ok = (c, m) => { if (!c) echecs++; console.log(c ? 'PASS' : 'FAIL', m); };

function element() {
    return {
        style: {}, innerHTML: '', textContent: '', parentNode: { replaceChild() {} },
        cloneNode() { return element(); }, addEventListener() {},
        classList: { add() {}, remove() {} },
    };
}

const progression = (n) => ({ chapters: { c1: { submissionStatus: 'submitted', completed: true, n } } });

// `groupee` : le stockage sait lister (storage.lister rend une Map), sinon il rend null.
function creerMonde(nbEleves, delaiMs, { groupee = false } = {}) {
    const elements = {};
    const lus = [];
    const listes = [];
    let enVol = 0, maxEnVol = 0;
    const cles = ['P1:teacher:users_list'];
    for (let i = 0; i < nbEleves; i++) cles.push(`P1:e${i}:student_e${i}_progress`);
    const base = new Map(cles.slice(1).map((k, i) => [k, progression(i)]));
    const bac = {
        console: { ...console, log() {}, warn() {}, error() {} },
        sessionStorage: { getItem: () => 'true', setItem() {} },
        localStorage: { length: 0, key: () => null },
        document: {
            getElementById: (id) => (elements[id] = elements[id] || element()),
            querySelectorAll: () => [],
            querySelector: () => null,
            addEventListener() {},
        },
        setTimeout, Promise, Map, Array, Math, Object, JSON, structuredClone,
        storage: {
            locales: new Set(),
            aUneCopieLocaleRecente(k) { return this.locales.has(k); },
            async keys() { return cles; },
            autres: [],
            async get(k) {
                if (k.endsWith(':users_list') || k.endsWith(':chapter_config')) {
                    this.autres.push(k);
                    await new Promise(r => setTimeout(r, delaiMs));
                    return k.endsWith(':users_list') ? [] : { c1: { locked: true } };
                }
                lus.push(k);
                enVol++; maxEnVol = Math.max(maxEnVol, enVol);
                await new Promise(r => setTimeout(r, delaiMs));
                enVol--;
                return base.has(k) ? JSON.parse(JSON.stringify(base.get(k))) : null;
            },
            async lister(prefixe, options) {
                listes.push([prefixe, options && options.suffixe]);
                if (!groupee) return null;
                await new Promise(r => setTimeout(r, delaiMs));
                return new Map([...base].filter(([k]) => k.startsWith(prefixe)));
            },
        },
        currentParcoursSlug: 'P1',
    };
    bac.window = bac;
    vm.createContext(bac);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/teacherDashboard.js'), 'utf8'), bac, { filename: 'teacherDashboard.js' });
    const Dashboard = vm.runInContext('TeacherDashboard', bac);
    return { bac, base, elements, lus, listes, Dashboard, enVol: () => maxEnVol };
}

// Un tableau de bord sans init() (qui touche tout le DOM), avec un onglet qui lit chaque élève
// deux fois pendant son chargement, comme le font « Suivi apprenants » puis son rendu.
function tableauAvecOnglet(m, nbEleves) {
    const t = Object.create(m.Dashboard.prototype);
    t.loadChapters = async () => {};
    t.recus = [];
    t.modules = {
        students: {
            async refresh() {
                const ids = Array.from({ length: nbEleves }, (_, i) => 'e' + i);
                const lus = await Promise.all(ids.map(id => t.getStudentProgress(id)));
                await Promise.all(ids.map(id => t.getStudentProgress(id)));
                t.recus = lus;
            },
        },
    };
    return t;
}

(async () => {
    // ── Avec lecture groupée ──────────────────────────────────────────────────────────────────
    {
        const m = creerMonde(30, 20, { groupee: true });
        const t = tableauAvecOnglet(m, 31);   // e30 : inscrit, sans progression
        await t.switchTab('students');
        ok(m.listes.length === 1 && m.lus.length === 0,
            'chargement d\'un onglet : une seule lecture groupée, aucune lecture élève par élève (' + m.listes.length + ' / ' + m.lus.length + ')');
        ok(m.listes[0][0] === 'P1:' && m.listes[0][1] === '_progress', 'lecture groupée restreinte aux progressions du parcours');
        ok(t.recus[3].chapters.c1.n === 3 && t.recus[30] && t.recus[30].chapters && Object.keys(t.recus[30].chapters).length === 0,
            'chaque élève reçoit sa progression, l\'élève sans ligne une progression vide');
        t.recus[3].chapters.c1.n = 999;
        await t.switchTab('students');
        ok(t.recus[3].chapters.c1.n === 3, 'chaque lecture reçoit sa propre copie (une modification ne déteint pas)');

        await t.scanResetStudents();
        ok(m.listes.length === 1 && m.lus.length === 0, 'liste « Réinitialiser » : reprend la lecture de l\'onglet, rien de relu');
        ok(/30 étudiant\(s\) avec progression/.test(m.elements['reset-students-list'].innerHTML), 'la liste annonce les 30 élèves');

        await t.scanResetStudents({ reutiliser: false });
        ok(m.listes.length === 2, 'après une réinitialisation : une nouvelle lecture groupée');

        await t.getStudentProgress('e5');
        ok(m.lus.length === 0 && m.listes.length === 2, 'dans les 15 s : une demande reprend la lecture groupée');
        m.bac.storage.locales.add('P1:e5:student_e5_progress');
        await t.getStudentProgress('e5');
        ok(m.lus.length === 1, 'une progression que la page vient d\'écrire (correction…) est relue seule, à jour');
        m.bac.storage.locales.clear();
        t._derniereLectureGroupee.debut -= 20000;
        await t.getStudentProgress('e6');
        ok(m.lus.length === 2 && m.listes.length === 2, 'hors chargement, passé 15 s : l\'élève est relu seul, sans nouvelle lecture groupée');
    }

    // ── À l'ouverture : les modules qui chargent dès leur construction partagent la lecture ──
    {
        const m = creerMonde(12, 20, { groupee: true });
        const t = Object.create(m.Dashboard.prototype);
        t.loadChapters = async () => {};
        t._phasesDeChargement = 1;            // ce que fait init() avant initModules()
        const ids = Array.from({ length: 12 }, (_, i) => 'e' + i);
        await Promise.all([
            Promise.all(ids.map(id => t.getStudentProgress(id))),      // compteur « Rendus à corriger »
            Promise.all(ids.map(id => t.getStudentProgress(id))),      // statistiques
            (async () => { await new Promise(r => setTimeout(r, 5)); return Promise.all(ids.map(id => t.getStudentProgress(id))); })(),
        ]);
        t._phasesDeChargement = 0;
        t.modules = {};
        await t.scanResetStudents();
        ok(m.listes.length === 1 && m.lus.length === 0, 'ouverture : trois modules et la liste « Réinitialiser » = une seule lecture groupée (' + m.listes.length + ' / ' + m.lus.length + ')');
    }

    // ── Réglages des chapitres et liste des élèves : lectures partagées pendant le chargement ─
    {
        const m = creerMonde(3, 10, { groupee: true });
        const t = Object.create(m.Dashboard.prototype);
        const autres = m.bac.storage.autres;
        t._phasesDeChargement = 1;
        // Gestion des chapitres : un getChapterConfig PAR CHAPITRE, l'un après l'autre.
        for (let i = 0; i < 12; i++) await t.getChapterConfig('c1');
        await Promise.all([t.getStudents(), t.getStudents(), t.getStudents()]);
        const nbConfig = autres.filter(k => k.endsWith(':chapter_config')).length;
        const nbListe = autres.filter(k => k.endsWith(':users_list')).length;
        ok(nbConfig === 1 && nbListe === 1, 'pendant le chargement : réglages des chapitres et liste des élèves lus une fois (' + nbConfig + ' / ' + nbListe + ')');
        const a = await t.getChapterConfig('c1'); a.locked = false;
        ok((await t.getChapterConfig('c1')).locked === true, 'chaque lecture partagée reçoit sa propre copie');

        m.bac.storage.locales.add('P1:config:chapter_config');
        await t.getChapterConfig('c1');
        ok(autres.filter(k => k.endsWith(':chapter_config')).length === 2, 'réglages que la page vient d\'écrire : relus');
        m.bac.storage.locales.clear();

        t._phasesDeChargement = 0;
        await t.getChapterConfig('c1');
        ok(autres.filter(k => k.endsWith(':chapter_config')).length === 3, 'hors chargement (avant d\'écrire, après un geste) : lecture neuve');
    }

    // ── Voyant « Connecté » : plus d'énumération de toute la base ──────────────────────────────
    {
        const source = fs.readFileSync(path.join(__dirname, '../src/js/teacherDashboard.js'), 'utf8');
        ok(!/_storageProvider\.keys\(\)/.test(source) && /_storageProvider\.get\('__ping__'\)/.test(source),
            'le voyant de connexion lit une clé absente, il n\'énumère plus toute la base');
    }

    // ── Sans lecture groupée (base locale, XPro antérieur) ───────────────────────────────────
    {
        const m = creerMonde(30, 50);
        const tableau = Object.create(m.Dashboard.prototype);
        tableau.modules = {};
        const debut = Date.now();
        await tableau.scanResetStudents();
        const duree = Date.now() - debut;
        ok(m.lus.length === 30, 'sans lecture groupée : toutes les progressions sont lues (' + m.lus.length + ')');
        ok(m.enVol() <= 6 && m.enVol() >= 2, '6 lectures à la fois au plus, et plus d\'une (' + m.enVol() + ')');
        ok(duree < 30 * 50 / 3, 'plus rapide qu\'une par une : ' + duree + ' ms au lieu de ' + (30 * 50) + ' ms');
        ok(/30 étudiant\(s\) avec progression/.test(m.elements['reset-students-list'].innerHTML), 'la liste annonce les 30 élèves');
    }
    {
        const m = creerMonde(10, 5);
        const tableau = Object.create(m.Dashboard.prototype);
        const cache = new Map([['e0', { chapters: {} }], ['e1', { chapters: {} }], ['e2', { chapters: {} }]]);
        tableau.modules = { students: { progressCache: cache } };
        await tableau.scanResetStudents();
        ok(m.lus.length === 7, 'les 3 progressions déjà chargées par « Suivi apprenants » ne sont pas relues (' + m.lus.length + ' lectures)');
        const m2 = creerMonde(10, 5);
        const t2 = Object.create(m2.Dashboard.prototype);
        t2.modules = { students: { progressCache: cache } };
        await t2.scanResetStudents({ reutiliser: false });
        ok(m2.lus.length === 10, 'après une réinitialisation : tout est relu (' + m2.lus.length + ')');
    }
    {
        const m = creerMonde(4, 5);
        const t = tableauAvecOnglet(m, 4);
        await t.switchTab('students');
        ok(m.lus.length === 8, 'onglet sans lecture groupée : lu élève par élève, comme avant (' + m.lus.length + ' lectures pour 4 élèves lus deux fois)');
    }

    // ── storage.lister (storage.js) ──────────────────────────────────────────────────────────
    {
        const donnees = new Map();
        const localStorage = {
            getItem: k => (donnees.has(k) ? donnees.get(k) : null),
            setItem: (k, v) => donnees.set(k, String(v)),
            removeItem: k => donnees.delete(k),
            key: i => [...donnees.keys()][i] ?? null,
            get length() { return donnees.size; },
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
        vm.runInContext('StatusBanner.show = () => {}; StatusBanner.hide = () => {}; StatusBanner.remove = () => {};', bac);
        const serveur = new Map([
            ['P1:a:student_a_progress', { v: 'serveur-a' }],
            ['P1:b:student_b_progress', { v: 'serveur-b' }],
            ['P1:config:chapter_config', { gros: true }],
        ]);
        const provider = {
            appels: [],
            async lister(prefixe, { suffixe } = {}) {
                this.appels.push([prefixe, suffixe]);
                return [...serveur].filter(([k]) => k.startsWith(prefixe)).map(([key, value]) => ({ key, value }));
            },
            async set(k, v) { serveur.set(k, v); },
            async get(k) { return serveur.get(k) || null; },
            async remove() {},
            async keys() { return [...serveur.keys()]; },
        };
        const S = window.storage;
        S._provider = provider; S._noCache = false;
        window._storageProvider = provider;

        await S.set('P1:b:student_b_progress', { v: 'local-b' });
        serveur.set('P1:b:student_b_progress', { v: 'serveur-b-ancien' });   // le serveur n'a pas encore rattrapé
        const lus = await S.lister('P1:', { suffixe: '_progress' });
        ok(provider.appels.length === 1 && provider.appels[0][1] === '_progress', 'storage.lister passe le suffixe à la base');
        ok(lus.size === 2 && !lus.has('P1:config:chapter_config'), 'seules les clés qui finissent par le suffixe sont rendues');
        ok(lus.get('P1:a:student_a_progress').v === 'serveur-a', 'une clé sans écriture locale : la valeur du serveur');
        ok(lus.get('P1:b:student_b_progress').v === 'local-b', 'une clé écrite à l\'instant par cette page : la copie locale l\'emporte');

        delete provider.lister;
        ok(await S.lister('P1:') === null, 'base qui ne sait pas lister : null (lecture clé par clé)');
        provider.lister = async () => { throw new Error('Appwrite ne répond pas'); };
        ok(await S.lister('P1:') === null, 'base qui ne répond pas : null, jamais une liste vide');
    }

    console.log(echecs ? `\n${echecs} échec(s)` : '\nTout passe.');
    process.exit(echecs ? 1 : 0);
})();
