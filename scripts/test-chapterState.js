// test-chapterState.js — Carte d'accueil de l'apprenant (core/chapterState.js) : une correction
// publiée garde sa note même quand le formateur a verrouillé le chapitre (examen verrouillé après
// l'épreuve).
//
//   node scripts/test-chapterState.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let echecs = 0;
const ok = (c, m) => { if (!c) echecs++; console.log(c ? 'PASS' : 'FAIL', m); };

function chargerChapterState() {
    const bac = { window: {}, console };
    vm.createContext(bac);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/core/getExamContext.js'), 'utf8'), bac,
        { filename: 'getExamContext.js' });
    bac.getExamContext = bac.window.getExamContext;
    const src = fs.readFileSync(path.join(__dirname, '../src/js/core/chapterState.js'), 'utf8')
        .replace('export function computeChapterState', 'function computeChapterState');
    vm.runInContext(src + '\nwindow.computeChapterState = computeChapterState;', bac, { filename: 'chapterState.js' });
    return bac.window.computeChapterState;
}

const compute = chargerChapterState();
const publie = { submissionStatus: 'validated', noteAttribuee: 14.5, frozenAt: '2026-11-01', frozenChapterMode: 'exam', completionPercent: 100 };

let s = compute(publie, { chapterMode: 'exam', locked: true });
ok(s.note === 14.5, 'examen publié puis verrouillé : la note reste affichée');
ok(s.status === 'validated' && /Correction publiée/.test(s.label) && /🔒/.test(s.label), 'libellé « Correction publiée · 🔒 »');
ok(s.locked === true && s.bilanLocked === false, 'accès au chapitre fermé, corrigé consultable');

s = compute(publie, { chapterMode: 'exam', verrousEleves: { J1: true } }, 'J1');
ok(s.note === 14.5 && s.locked === true, 'verrou par élève : même chose');

s = compute(publie, { chapterMode: 'exam' });
ok(s.note === 14.5 && s.locked === false && s.label === '✅ Correction publiée', 'publié non verrouillé : inchangé');

s = compute({ ...publie, submissionStatus: 'submitted' }, { chapterMode: 'exam', locked: true });
ok(s.note === null && s.status === 'locked_inprogress' && s.locked === true, 'rendu non publié + verrou : toujours « Verrouillé », sans note');

// ── 📚 Non suivi (27/11/2026) : disponible, pas encore à rendre ; lu en direct, l'exception de l'élève l'emporte ──
s = compute({ submissionStatus: 'not_submitted' }, { nonSuivi: true }, 'J1');
ok(s.status === 'nonSuivi' && s.label === '📚 Non suivi' && s.locked === false, 'non suivi, pas commencé : « 📚 Non suivi », ouvert');
s = compute({ submissionStatus: 'not_submitted', completionPercent: 40 }, { nonSuivi: true, nonSuivisEleves: { J1: false } }, 'J1');
ok(s.status !== 'nonSuivi', 'exception de l\'élève (suivi) : l\'état habituel');
s = compute({ submissionStatus: 'submitted' }, { nonSuivi: true }, 'J1');
ok(s.status === 'submitted', 'une copie déjà rendue garde son état');
{
    const bac = { window: {}, console };
    vm.createContext(bac);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/core/getExamContext.js'), 'utf8'), bac);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/core/echeances.js'), 'utf8'), bac);
    const E = bac.window.Echeances;
    const config = { nonSuivi: true, dateLimitEnabled: true, endDate: '2026-12-01T18:00:00.000Z' };
    ok(E.decrire({}, config, 'J1') === null, 'échéance d\'un chapitre non suivi : rien à dire');
    ok(E.decrire({}, { ...config, nonSuivisEleves: { J1: false } }, 'J1') !== null, 'suivi pour cet élève : la date limite revient');
}

console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est bon.');
process.exit(echecs ? 1 : 0);
