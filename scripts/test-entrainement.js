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

    // ── étoiles du mode Entraînement (27/11/2026) ──
    ok(E.etoilesPourNote(20) === 4 && E.etoilesPourNote(19.9) === 3 && E.etoilesPourNote(18) === 3
        && E.etoilesPourNote(17.9) === 2 && E.etoilesPourNote(16) === 2 && E.etoilesPourNote(15.5) === 1
        && E.etoilesPourNote(14) === 1 && E.etoilesPourNote(13.9) === 0 && E.etoilesPourNote(0) === 0,
        'étoiles : 20 → 4, ≥18 → 3, ≥16 → 2, ≥14 → 1, sinon 0');
    ok(E.etoilesPourNote(null) === 0 && E.etoilesPourNote(undefined) === 0 && E.etoilesPourNote('x') === 0, 'pas de note : 0 étoile');
    ok(E.etoilesTexte(3) === '★★★☆' && E.etoilesTexte(0) === '☆☆☆☆' && E.etoilesTexte(9) === '★★★★', 'texte des étoiles sur 4');
    let r = E.fusionnerEssai(null, 16.5, 'T1');
    ok(egal(r, { meilleureNote: 16.5, etoiles: 2, essais: 1, derniereNote: 16.5, majLe: 'T1' }), 'premier essai gardé');
    r = E.fusionnerEssai(r, 12, 'T2');
    ok(r.meilleureNote === 16.5 && r.etoiles === 2 && r.essais === 2 && r.derniereNote === 12, 'essai moins bon : le meilleur reste');
    r = E.fusionnerEssai(r, 20, 'T3');
    ok(r.meilleureNote === 20 && r.etoiles === 4 && r.essais === 3, 'meilleur essai : 4 étoiles');
    r = E.fusionnerEssai(r, 15, 'T4');
    ok(r.etoiles === 4 && r.meilleureNote === 20, '4 étoiles restent 4 étoiles');
    ok(E.fusionnerEssai(r, null) === r, 'essai sans note : rien ne change');
    ok(E.cleEtoiles('e1') === 'student_e1_entrainement', 'clé de l\'élève à part de la progression');

    // enregistrerEssai : écrit la clé de l'élève en mode Entraînement seulement
    {
        const magasin = {};
        const bac = { window: {}, console: { ...console, log() {}, warn() {} }, URLSearchParams,
                      location: { search: '', pathname: '/parcours/src/chapter_template.html' } };
        bac.window = bac;   // comme dans la page : window est l'objet global
        bac.window.Parcours = { scoped: { student: {
            get: async k => (k in magasin ? JSON.parse(magasin[k]) : null),
            set: async (k, v) => { magasin[k] = JSON.stringify(v); } } } };
        vm.createContext(bac);
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/chapter/chapterEntrainement.js'), 'utf8'), bac,
            { filename: 'chapterEntrainement.js' });
        const E2 = bac.window.ChapterEntrainement;
        bac.window.ChapterSession = { studentId: 'e1', chapterId: 'c7', progress: { chapters: {} } };
        bac.window.currentChapterConfig = { chapterMode: 'blind' };
        ok(await E2.enregistrerEssai('c7', 18) === null && Object.keys(magasin).length === 0,
            'hors mode Entraînement (corrigé rejoué) : rien d\'écrit');
        bac.window.currentChapterConfig = { chapterMode: 'entrainement' };
        let res = await E2.enregistrerEssai('c7', 18);
        ok(res.avant === null && res.apres.etoiles === 3, 'mode Entraînement : premier essai, 3 étoiles');
        res = await E2.enregistrerEssai('c7', 14.5);
        ok(res.avant.meilleureNote === 18 && res.apres.meilleureNote === 18 && res.apres.essais === 2, 'second essai moins bon : 18 gardé');
        const garde = JSON.parse(magasin.student_e1_entrainement);
        ok(garde.version === 1 && garde.chapitres.c7.etoiles === 3 && garde.chapitres.c7.derniereNote === 14.5, 'clé student_e1_entrainement écrite');
        ok((await E2.etoilesDuChapitre('c7', 'e1')).etoiles === 3 && (await E2.etoilesDuChapitre('autre', 'e1')) === null,
            'carte du chapitre : meilleur résultat lu, rien pour un autre chapitre');
        bac.window.ChapterSession.progress.chapters.c7 = { frozenAt: 'x', frozenChapterMode: 'exam' };
        ok(await E2.enregistrerEssai('c7', 20) === null, 'commencé dans un autre mode : pas d\'étoile');
    }

    console.log(echecs ? echecs + ' FAIL' : 'tout est vert');
    process.exitCode = echecs ? 1 : 0;
})();
