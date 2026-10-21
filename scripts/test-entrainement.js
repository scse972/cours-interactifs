// test-entrainement.js — Mode entraînement sur un chapitre corrigé (chapter/chapterEntrainement.js :
// demande, estDisponible, progressionVierge, noter ; garde de saveProgress dans progressManager.js).
//
//   node scripts/test-entrainement.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let echecs = 0;
const ok = (c, m) => { if (!c) echecs++; console.log(c ? 'PASS' : 'FAIL', m); };
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function chargerEntrainement() {
    const bac = { window: {}, console: { ...console, log() {}, warn() {} }, URLSearchParams,
                  location: { search: '', pathname: '/parcours/src/chapter_template.html' } };
    bac.window.location = bac.location;
    vm.createContext(bac);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/chapter/chapterEntrainement.js'), 'utf8'), bac,
        { filename: 'chapterEntrainement.js' });
    return bac.window.ChapterEntrainement;
}

const E = chargerEntrainement();

// ── demande ──
ok(E.demande('?parcours=P&chapitre=c&entrainement=1') === true, 'entrainement=1 : demandé');
ok(E.demande('?parcours=P&chapitre=c') === false && E.demande('?entrainement=0') === false, 'absent ou autre valeur : non');

// ── estDisponible ──
const config = { chapterMode: 'blind', questions: [
    { id: 'q1', correctionType: 'auto', points: 1 }, { id: 'q2', correctionType: 'manuel', points: 2 }] };
const corrige = { submissionStatus: 'validated', frozenAt: '2026-10-20', frozenChapterMode: 'blind' };
ok(E.estDisponible(corrige, config) === true, 'correction publiée, Blind, une question auto : proposé');
ok(E.estDisponible({ ...corrige, submissionStatus: 'submitted' }, config) === false
    && E.estDisponible({ ...corrige, submissionStatus: 'not_submitted' }, config) === false
    && E.estDisponible({ ...corrige, submissionStatus: 'late_submitted' }, config) === false, 'rendu non corrigé, ou pas rendu : non');
ok(E.estDisponible(corrige, config, { vueFormateur: true }) === false, 'vue formateur : jamais');
ok(E.estDisponible(null, config) === false, 'pas de progression : non');
ok(E.estDisponible({ ...corrige, frozenChapterMode: 'consigne' }, config) === false
    && E.estDisponible({ ...corrige, frozenChapterMode: 'atelier' }, config) === false, 'Consigne et Atelier : non');
ok(E.estDisponible({ ...corrige, frozenChapterMode: 'normal' }, config) === true
    && E.estDisponible({ ...corrige, frozenChapterMode: 'exam' }, config) === true
    && E.estDisponible({ ...corrige, frozenChapterMode: 'millionnaire' }, config) === true, 'Découverte, Examen, Millionnaire : oui');
ok(E.estDisponible(corrige, { questions: [{ id: 'q2', correctionType: 'manuel' }] }) === false, 'aucune question auto ou semi : non');
ok(E.estDisponible({ submissionStatus: 'validated' }, { chapterMode: 'consigne', questions: config.questions }) === false,
    'copie jamais figée : le mode de la config compte');

// ── progressionVierge ──
const progression = { studentId: 'e1', chapters: {
    c: { submissionStatus: 'validated', questionsTirees: ['q1'], tentative: 3, tentativesPassees: [{ note: 9 }], coursePenalty: 1,
         frozenAt: 'x', frozenChapterMode: 'blind',
         questions: { q1: { answer: 0, answered: true, score: 1 }, course_1: { validated: true } } },
    autre: { submissionStatus: 'validated', questions: { a1: { answer: 1 } } } } };
const avant = JSON.stringify(progression);
const vierge = E.progressionVierge(progression, 'c');
ok(JSON.stringify(progression) === avant, 'la progression reçue n\'est pas modifiée');
const cv = vierge.chapters.c;
ok(egal(Object.keys(cv.questions), ['course_1']), 'réponses retirées, validations de cours gardées');
ok(cv.questionsTirees === null, 'pas de tirage : toutes les questions');
ok(cv.submissionStatus === 'not_submitted', 'statut : pas rendu');
ok(!('tentative' in cv) && !('tentativesPassees' in cv) && !('coursePenalty' in cv), 'ni tentatives ni pénalité');
ok(cv.frozenAt === 'x' && cv.frozenChapterMode === 'blind', 'contexte figé gardé (mode, date)');
ok(egal(vierge.chapters.autre, progression.chapters.autre), 'les autres chapitres sont intacts');
ok(egal(E.progressionVierge(progression, 'absent').chapters.c, progression.chapters.c), 'chapitre absent : simple copie');

// ── noter ──
const bilan = E.noter([
    { id: 'q1', correctionType: 'auto', points: 2, etat: 'correct' },
    { id: 'q2', correctionType: 'auto', points: 1, etat: 'wrong' },
    { id: 'q3', correctionType: 'auto', points: 1, etat: 'empty' },
    { id: 'q4', correctionType: 'semi', points: 2, etat: 'pending' },
    { id: 'q5', correctionType: 'semi', points: 2, etat: 'correct' },
    { id: 'q6', correctionType: 'manuel', points: 4, etat: 'manual' },
    { id: 'q7', correctionType: 'obligatoire', points: 1, etat: 'correct' },
]);
ok(bilan.total === 8 && bilan.obtenus === 4, 'points : auto et semi seulement (4 / 8)');
ok(bilan.sur20 === 10, 'note sur 20 : 10');
ok(bilan.details.filter(d => !d.notee).map(d => d.id).join() === 'q6,q7', 'manuelle et obligatoire : non notées');
ok(bilan.details.find(d => d.id === 'q4').juste === false && bilan.details.find(d => d.id === 'q5').gagne === 2, 'semi : juste seulement si reconnue');
ok(E.noter([{ id: 'q', correctionType: 'manuel', points: 3, etat: 'manual' }]).sur20 === null, 'rien de noté : pas de note');
ok(E.noter([{ id: 'q', correctionType: 'auto', points: 3, etat: 'correct' }, { id: 'r', correctionType: 'auto', points: 4, etat: 'wrong' }]).sur20 === 8.6,
    'arrondi au dixième (3/7 → 8,6)');

// ── Mode de chapitre « Entraînement » et tirage neuf (21/10/2026) ──
ok(E.estModeEntrainement({ chapterMode: 'entrainement' }) === true && E.estModeEntrainement({ chapterMode: 'exam' }) === false
    && E.estModeEntrainement(null) === false, 'estModeEntrainement : la config en direct');
ok(E.estDisponible(null, { chapterMode: 'entrainement', questions: [] }) === true
    && E.estDisponible({ submissionStatus: 'not_submitted', frozenAt: null }, { chapterMode: 'entrainement' }) === true,
    'mode Entraînement : proposé sans copie ni correction (pas d\'entrée, ou entrée jamais figée)');
ok(E.estDisponible({ submissionStatus: 'not_submitted', frozenAt: 'x', frozenChapterMode: 'exam' }, { chapterMode: 'entrainement' }) === false,
    'rétrocompatibilité : commencé en Examen, il le garde (pas d\'entraînement imposé)');
ok(E.estDisponible({ submissionStatus: 'validated', frozenAt: 'x', frozenChapterMode: 'exam' }, { chapterMode: 'entrainement', questions: [{ correctionType: 'auto' }] }) === true,
    'rétrocompatibilité : sa copie Examen corrigée garde le « S\'entraîner » du corrigé');
ok(E.estModeEntrainement({ chapterMode: 'entrainement' }, { frozenAt: 'x', frozenChapterMode: 'blind' }) === false
    && E.estModeEntrainement({ chapterMode: 'entrainement' }, { frozenAt: 'x', frozenChapterMode: 'entrainement' }) === true
    && E.estModeEntrainement({ chapterMode: 'entrainement' }, { frozenAt: null, frozenChapterMode: 'blind' }) === true,
    'estModeEntrainement : figé autrement = son mode ; figé Entraînement ou jamais figé = Entraînement');
ok(E.estDisponible(null, { chapterMode: 'entrainement' }, { vueFormateur: true }) === false, 'mode Entraînement en vue formateur : non');
ok(E.modeDuChapitre({ frozenAt: 'x', frozenChapterMode: 'blind' }, { chapterMode: 'entrainement' }) === 'blind'
    && E.modeDuChapitre(null, { chapterMode: 'entrainement' }) === 'entrainement', 'mode figé prioritaire ; sans entrée : Entraînement');
const tiree = E.progressionVierge(progression, 'c', ['q3', 'q7']);
ok(JSON.stringify(tiree.chapters.c.questionsTirees) === '["q3","q7"]' && JSON.stringify(progression) === avant, 'progressionVierge : le tirage de cet entraînement, original intact');
let recu = null;
const tirer = (cfg) => { recu = cfg; return ['q2']; };
ok(JSON.stringify(E.tirageNeuf({ chapterMode: 'normal', nombreQuestions: 1 }, tirer)) === '["q2"]' && recu.chapterMode === 'exam' && recu.nombreQuestions === 1,
    'tirageNeuf : tire quel que soit le mode (présenté comme « exam »)');
ok(E.tirageNeuf(null, tirer) === null && E.tirageNeuf({ nombreQuestions: 2 }, null) === null, 'tirageNeuf : sans config ni fonction, toutes (null)');
const entree = E.viderChapitre({ questions: { q1: { answer: 1 }, course_2: { validated: true } }, submissionStatus: 'validated', tentative: 2 }, null);
ok(Object.keys(entree.questions).join() === 'course_2' && entree.questionsTirees === null && entree.submissionStatus === 'not_submitted' && !('tentative' in entree),
    'viderChapitre : réponses, statut et tentatives retirés');

// ── getExamContext : isEntrainementMode, même règle que estModeEntrainement ──
{
    const bac = { window: { currentChapterConfig: {} }, console: { ...console, log() {} } };
    vm.createContext(bac);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/core/getExamContext.js'), 'utf8'), bac, { filename: 'getExamContext.js' });
    const g = bac.window.getExamContext;
    const cfg = { chapterMode: 'entrainement' };
    ok(g(null, cfg).isEntrainementMode === true && g({ frozenAt: null }, cfg).isEntrainementMode === true, 'contexte : pas commencé → Entraînement');
    ok(g({ frozenAt: 'x', frozenChapterMode: 'exam' }, cfg).isEntrainementMode === false && g({ frozenAt: 'x', frozenChapterMode: 'exam' }, cfg).isExamMode === true,
        'contexte : commencé en Examen → reste Examen');
    ok(g({ frozenAt: 'x', frozenChapterMode: 'entrainement' }, cfg).isEntrainementMode === true, 'contexte : figé Entraînement → Entraînement');
    ok(g(null, { chapterMode: 'blind' }).isEntrainementMode === false, 'contexte : autre mode → jamais Entraînement');
}

// ── saveProgress n'écrit rien en entraînement ──
(async () => {
    const ecrits = [];
    const bac = {
        window: {}, console: { ...console, log() {}, warn() {} }, URLSearchParams,
        sessionStorage: { getItem: () => 'e1' },
        location: { search: '?chapitre=c', pathname: '/parcours/src/chapter_template.html' },
        Bareme: { estBlind: () => false },
        storage: { set: async (k, v) => { ecrits.push(k); }, get: async () => null },
    };
    bac.window.location = bac.location;
    vm.createContext(bac);
    vm.runInContext('var ChapterSession = { entrainement: true };', bac);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/progressManager.js'), 'utf8'), bac, { filename: 'progressManager.js' });
    const PM = bac.window.ProgressManager;
    await PM.saveProgress('e1', { chapters: {} });
    ok(ecrits.length === 0, 'saveProgress : aucune écriture tant que l\'entraînement est posé');
    vm.runInContext('ChapterSession.entrainement = false;', bac);
    await PM.saveProgress('e1', { chapters: {} });
    ok(ecrits.length === 1, 'hors entraînement : l\'écriture a lieu');

    // unlockNextChapter : jamais d'entrée pour un chapitre suivant en mode Entraînement
    const prog = { chapters: { a: { status: 'completed', questions: {} } } };
    const index = { chapters: [{ id: 'a', questions: [] }, { id: 'b', chapterMode: 'entrainement', questions: [{ id: 'b1', type: 'qcm', correctionType: 'auto', points: 1, questionText: 'x', options: ['o', 'p'] }] }] };
    PM.unlockNextChapter(prog, 'a', index);
    ok(!prog.chapters.b, 'unlockNextChapter : aucune entrée créée pour un chapitre Entraînement');
    index.chapters[1].chapterMode = 'exam';
    PM.unlockNextChapter(prog, 'a', index);
    ok(!!prog.chapters.b, 'unlockNextChapter : un autre mode reste déverrouillé comme avant');

    // tirage réel : x questions, et des tirages différents d'un entraînement à l'autre
    const qs = Array.from({ length: 12 }, (_, i) => ({ id: 'q' + i, type: 'qcm', correctionType: 'auto', points: 1, questionText: 'É' + i, options: ['a', 'b'] }));
    const cfg = { chapterMode: 'entrainement', nombreQuestions: 4, questions: qs };
    const vus = new Set();
    for (let i = 0; i < 30; i++) {
        const t = E.tirageNeuf(cfg, PM.tirerQuestions);
        if (!Array.isArray(t) || t.length !== 4) { vus.add('ERREUR'); break; }
        vus.add(t.join());
    }
    ok(!vus.has('ERREUR') && vus.size > 1, "tirage neuf : 4 questions, différentes d'un entraînement à l'autre");
    ok(E.tirageNeuf({ ...cfg, nombreQuestions: 0 }, PM.tirerQuestions) === null && E.tirageNeuf({ ...cfg, nombreQuestions: 20 }, PM.tirerQuestions) === null,
        'sans tirage réglé, ou x ≥ y : toutes (null)');

    console.log(echecs ? echecs + ' FAIL' : 'tout est vert');
    process.exitCode = echecs ? 1 : 0;
})();
