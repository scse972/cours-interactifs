// test-scanProgressions.js — Le scan des progressions du tableau de bord formateur
// (teacherDashboard.js, scanResetStudents), sans navigateur : un DOM réduit et un stockage lent.
// Corrigé le 19/11/2026 : mesuré dans XPro, 222 lectures l'une après l'autre (62 s) à chaque
// changement de parcours. Vérifie : 6 lectures à la fois au plus, toutes faites, la reprise de
// ce que l'onglet « Suivi apprenants » a déjà lu, et pas de reprise après une réinitialisation.
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
    };
}

function creerMonde(nbEleves, delaiMs) {
    const elements = {};
    const lus = [];
    let enVol = 0, maxEnVol = 0;
    const cles = ['P1:teacher:users_list'];
    for (let i = 0; i < nbEleves; i++) cles.push(`P1:e${i}:student_e${i}_progress`);
    const bac = {
        console: { ...console, log() {}, warn() {}, error() {} },
        sessionStorage: { getItem: () => 'true' },
        localStorage: { length: 0, key: () => null },
        document: {
            getElementById: (id) => (elements[id] = elements[id] || element()),
            querySelectorAll: () => [],
            addEventListener() {},
        },
        setTimeout, Promise, Map, Array, Math, Object, JSON,
        storage: {
            async keys() { return cles; },
            async get(k) {
                if (k.endsWith(':users_list')) return [];
                lus.push(k);
                enVol++; maxEnVol = Math.max(maxEnVol, enVol);
                await new Promise(r => setTimeout(r, delaiMs));
                enVol--;
                return { chapters: { c1: { submissionStatus: 'submitted', completed: true } } };
            },
        },
        currentParcoursSlug: 'P1',
    };
    bac.window = bac;
    vm.createContext(bac);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/teacherDashboard.js'), 'utf8'), bac, { filename: 'teacherDashboard.js' });
    const Dashboard = vm.runInContext('TeacherDashboard', bac);
    return { bac, elements, lus, Dashboard, enVol: () => maxEnVol };
}

(async () => {
    {
        const m = creerMonde(30, 50);
        const tableau = Object.create(m.Dashboard.prototype);
        tableau.modules = {};
        const debut = Date.now();
        await tableau.scanResetStudents();
        const duree = Date.now() - debut;
        ok(m.lus.length === 30, 'toutes les progressions sont lues (' + m.lus.length + ')');
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
    console.log(echecs ? `\n${echecs} échec(s)` : '\nTout passe.');
    process.exit(echecs ? 1 : 0);
})();
