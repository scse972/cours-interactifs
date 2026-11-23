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

console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est bon.');
process.exit(echecs ? 1 : 0);
