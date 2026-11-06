// test-renduApresCorrection.js — Le rendu d'un chapitre (ProgressManager.submitChapter) ne défait pas
// une correction du formateur (2026-11-06). En atelier, l'apprenant fait valider sa consigne en main
// propre (note + AR saisi), puis rend son chapitre : la consigne doit rester « corrigée ».
//
//   node scripts/test-renduApresCorrection.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let echecs = 0;
const ok = (c, m) => { if (!c) echecs++; console.log(c ? 'PASS' : 'FAIL', m); };

const bac = { window: {}, console: { ...console, log() {}, warn() {} } };
vm.createContext(bac);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/progressManager.js'), 'utf8'), bac, { filename: 'progressManager.js' });
const PM = bac.window.ProgressManager;
ok(PM && typeof PM.submitChapter === 'function' && typeof PM.teacherCorrectQuestion === 'function', 'progressManager chargé sans navigateur');

// Un chapitre en atelier : une consigne (ouverte, manuelle), une autre consigne seulement répondue,
// une question semi-automatique juste, une consigne jamais ouverte.
const config = { id: 'c1', title: 'Atelier', chapterMode: 'atelier', questions: [
    { id: 'c1_q1', type: 'ouverte', correctionType: 'manuel', rule: 'texte', points: 10 },
    { id: 'c1_q2', type: 'ouverte', correctionType: 'manuel', rule: 'texte', points: 5 },
    { id: 'c1_q3', type: 'courte', correctionType: 'semi', rule: 'exact', points: 1 },
    { id: 'c1_q4', type: 'ouverte', correctionType: 'manuel', rule: 'texte', points: 4 },
] };
const progression = { chapters: { c1: PM.initChapter(config) } };
const ch = progression.chapters.c1;
const qs = ch.questions;
const repondre = (q, texte) => Object.assign(qs[q], { answered: true, answer: texte, isCorrect: null, needsManualCorrection: true, manualCorrectionStatus: 'pending' });
repondre('c1_q1', 'compte rendu de la consigne 1');
repondre('c1_q2', 'compte rendu de la consigne 2');
Object.assign(qs.c1_q3, { answered: true, answer: '42', isCorrect: true, needsManualCorrection: true, manualCorrectionStatus: 'pending' });
qs.c1_q4.needsManualCorrection = true;

// La consigne 1 validée en main propre : la note inscrite (« Valider et générer l'AR »), puis l'AR saisi.
PM.teacherCorrectQuestion(progression, 'c1', 'c1_q1', 9, 'démarche complète', '', 'corrected');
Object.assign(qs.c1_q1, { arPoints: 9, arHash: 'h', arEmisAt: qs.c1_q1.correctedAt, arSaisiAt: new Date().toISOString() });
ok(qs.c1_q1.manualCorrectionStatus === 'corrected' && qs.c1_q1.teacherScore === 9, 'avant le rendu : la consigne 1 est corrigée, 9 points');

PM.submitChapter(progression, 'c1', null);

ok(ch.submissionStatus === 'submitted' && !!ch.submittedAt, 'le chapitre est rendu');
ok(qs.c1_q1.manualCorrectionStatus === 'corrected' && qs.c1_q1.teacherScore === 9 && qs.c1_q1.teacherComment === 'démarche complète',
    'la consigne corrigée AVANT le rendu le reste (statut, note, appréciation) — ' + qs.c1_q1.manualCorrectionStatus);
ok(qs.c1_q2.manualCorrectionStatus === 'pending', 'une consigne seulement répondue attend toujours le formateur');
ok(qs.c1_q3.manualCorrectionStatus === 'not_needed', 'une semi-automatique juste n\'attend personne');
ok(qs.c1_q4.manualCorrectionStatus !== 'corrected', 'une consigne jamais répondue n\'est pas corrigée pour autant');

// « validated » (validation définitive d'une question) : même règle.
const p2 = { chapters: { c1: PM.initChapter(config) } };
Object.assign(p2.chapters.c1.questions.c1_q2, { answered: true, answer: 'y', isCorrect: null, needsManualCorrection: true, manualCorrectionStatus: 'validated', teacherScore: 5 });
PM.submitChapter(p2, 'c1', null);
ok(p2.chapters.c1.questions.c1_q2.manualCorrectionStatus === 'validated', 'une question validée par le formateur reste validée au rendu');

console.log(echecs ? `${echecs} ÉCHEC(S)` : 'TOUT PASSE');
process.exit(echecs ? 1 : 0);
