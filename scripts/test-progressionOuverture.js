// test-progressionOuverture.js — progressManager.js à l'ouverture d'un chapitre : la panne de
// lecture ne crée rien (getOrCreateStudentProgress strict), l'écriture est refusée quand la
// progression n'a pas pu être lue (ChapterSession.ecritureBloquee), loadProgress garde null ailleurs.
//
//   node scripts/test-progressionOuverture.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

let echecs = 0;
const ok = (c, m) => { if (!c) echecs++; console.log(c ? 'PASS' : 'FAIL', m); };

function creerMonde(student) {
    const bac = {
        window: {},
        console: { ...console, error() {}, warn() {} },
        crypto: { getRandomValues: (t) => crypto.randomFillSync(t) },
        Parcours: { scoped: { student } },
        storage: { async get() { throw new Error('storage ne doit pas être appelé'); }, async set() { throw new Error('storage ne doit pas être appelé'); } },
    };
    bac.window.sha256Hex = (t) => crypto.createHash('sha256').update(String(t), 'utf8').digest('hex');
    bac.window.Parcours = bac.Parcours;
    vm.createContext(bac);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/progressManager.js'), 'utf8'), bac, { filename: 'progressManager.js' });
    return bac;
}

(async () => {
    // ── Panne de lecture : rien n'est créé, rien n'est écrit ──
    {
        const ecrits = [];
        const m = creerMonde({ async get() { const e = new Error('service injoignable'); e.serviceIndisponible = true; throw e; }, async set(k, v) { ecrits.push(v); } });
        const PM = m.window.ProgressManager;
        let erreur = null;
        try { await PM.getOrCreateStudentProgress('graxa', 'X', {}); } catch (e) { erreur = e; }
        ok(erreur && erreur.serviceIndisponible === true, 'getOrCreateStudentProgress : la panne remonte');
        ok(ecrits.length === 0, 'panne : aucune progression vide écrite');
        ok(await PM.loadProgress('graxa') === null, 'loadProgress non strict : null, comme avant');
    }

    // ── Pas de ligne : création et une écriture ──
    {
        const ecrits = [];
        const m = creerMonde({ async get() { return null; }, async set(k, v) { ecrits.push(v); } });
        const p = await m.window.ProgressManager.getOrCreateStudentProgress('graxa', 'X', {});
        ok(p && p.studentId === 'graxa' && p.chapters && Object.keys(p.chapters).length === 0, 'pas de ligne : progression vierge');
        ok(ecrits.length === 1 && ecrits[0].studentId === 'graxa', 'pas de ligne : une écriture');
    }

    // ── Ligne existante : rendue telle quelle, aucune écriture ──
    {
        const ecrits = [];
        const existante = { studentId: 'graxa', chapters: { ch1: { status: 'in_progress' } } };
        const m = creerMonde({ async get() { return JSON.parse(JSON.stringify(existante)); }, async set(k, v) { ecrits.push(v); } });
        const p = await m.window.ProgressManager.getOrCreateStudentProgress('graxa', 'X', {});
        ok(p.chapters.ch1.status === 'in_progress' && ecrits.length === 0, 'ligne existante : lue, rien d\'écrit');
    }

    // ── Garde d'écriture ──
    {
        const ecrits = [];
        const m = creerMonde({ async get() { return { studentId: 'graxa', chapters: {} }; }, async set(k, v) { ecrits.push(v); } });
        const PM = m.window.ProgressManager;
        vm.runInContext('var ChapterSession = { ecritureBloquee: true }', m);
        await PM.saveProgress('graxa', { studentId: 'graxa', chapters: {} });
        ok(ecrits.length === 0, 'ecritureBloquee : saveProgress n\'écrit pas');
        vm.runInContext('ChapterSession.ecritureBloquee = false', m);
        await PM.saveProgress('graxa', { studentId: 'graxa', chapters: {} });
        ok(ecrits.length === 1, 'écriture débloquée : saveProgress écrit');
    }

    console.log(echecs ? echecs + ' FAIL' : 'tout est vert');
    process.exitCode = echecs ? 1 : 0;
})();
