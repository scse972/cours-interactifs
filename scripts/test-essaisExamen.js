// test-essaisExamen.js — Mode Examen, décision du 2026-11-19 (progressManager.js) :
//   - ramenerEssaisExamen : au rendu, chaque compteur d'essais > 1 revient à 1 ;
//   - restoreSavedAnswers : en Examen non corrigé, les réponses reviennent sans verdict.
//
//   node scripts/test-essaisExamen.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let echecs = 0;
const ok = (c, m) => { if (!c) echecs++; console.log(c ? 'PASS' : 'FAIL', m); };

// Un DOM réduit : un champ de retour et un bouton radio par question.
function faireDocument(ids) {
    const elements = {};
    ids.forEach(id => {
        elements['feedback_' + id] = { innerHTML: '', className: 'feedback' };
        elements['radio_' + id] = { checked: false, disabled: false };
    });
    return {
        elements,
        getElementById: id => elements[id] || null,
        querySelector: sel => {
            const m = sel.match(/name="qcm_([^"]+)"/);
            return m ? elements['radio_' + m[1]] : null;
        },
    };
}

function charger(document) {
    const bac = {
        window: {}, console: { ...console, log() {}, warn() {} }, URLSearchParams, document,
        sessionStorage: { getItem: () => null },
        location: { search: '', pathname: '/parcours/src/chapter_template.html' },
        requestAnimationFrame: f => f(),
        storage: { set: async () => {}, get: async () => null },
    };
    bac.window.location = bac.location;
    vm.createContext(bac);
    vm.runInContext('var ChapterSession = {};', bac);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/progressManager.js'), 'utf8'), bac, { filename: 'progressManager.js' });
    return bac;
}

// ── ramenerEssaisExamen ──
{
    const PM = charger(faireDocument([])).window.ProgressManager;
    const historique = [{ answer: 0 }, { answer: 2 }, { answer: 3 }];
    const chapitre = { questions: {
        q1: { attempts: 4, attemptHistory: historique },
        q2: { attempts: 1 },
        q3: { attempts: 0 },
        q4: {},
        course_0: { attempts: 3 },
    } };
    const n = PM.ramenerEssaisExamen(chapitre);
    ok(chapitre.questions.q1.attempts === 1, '4 essais → 1');
    ok(chapitre.questions.q1.attemptHistory === historique && historique.length === 3, "l'historique des hésitations est gardé");
    ok(chapitre.questions.q2.attempts === 1, '1 essai reste 1');
    ok(chapitre.questions.q3.attempts === 0, '0 reste 0 (« jamais répondue »)');
    ok(chapitre.questions.q4.attempts === undefined, 'compteur absent : rien posé');
    ok(chapitre.questions.course_0.attempts === 3, 'les cours (course_…) ne sont pas touchés');
    ok(n === 1, 'renvoie le nombre de questions ramenées');
    ok(PM.ramenerEssaisExamen(null) === 0 && PM.ramenerEssaisExamen({}) === 0, 'chapitre absent ou vide : 0, sans erreur');
}

// ── restoreSavedAnswers : verdict selon le mode et l'état de la copie ──
function restaurer(chapitre, config = {}) {
    const doc = faireDocument(['q1', 'q2']);
    const bac = charger(doc);
    bac.window.currentChapterConfig = config;
    bac.window.ProgressManager.restoreSavedAnswers({ chapters: { c: chapitre } }, 'c');
    return doc.elements;
}
const questions = () => ({
    q1: { answered: true, answer: 1, isCorrect: true },
    q2: { answered: true, answer: 0, isCorrect: false },
});

{
    const e = restaurer({ frozenAt: 'x', frozenChapterMode: 'exam', submissionStatus: 'not_submitted', questions: questions() });
    ok(e.radio_q1.checked && e.radio_q2.checked, 'Examen en cours : les réponses sont remises');
    ok(e.feedback_q1.innerHTML === '' && e.feedback_q2.innerHTML === '', 'Examen en cours : aucun verdict');
}
{
    const e = restaurer({ frozenAt: 'x', frozenChapterMode: 'exam', submissionStatus: 'submitted', questions: questions() });
    ok(e.feedback_q1.innerHTML === '', 'Examen rendu, non corrigé : aucun verdict');
}
{
    const e = restaurer({ frozenAt: 'x', frozenChapterMode: 'exam', submissionStatus: 'validated', questions: questions() });
    ok(/Correct/.test(e.feedback_q1.innerHTML) && /Incorrect/.test(e.feedback_q2.innerHTML), 'Examen corrigé : le verdict revient');
}
{
    const e = restaurer({ questions: questions() }, { chapterMode: 'exam' });
    ok(e.feedback_q1.innerHTML === '', 'Examen pas encore figé : le mode vient de la config');
}
{
    const e = restaurer({ frozenAt: 'x', frozenChapterMode: 'normal', questions: questions() }, { chapterMode: 'exam' });
    ok(/Correct/.test(e.feedback_q1.innerHTML), 'Découverte figée (config passée en Examen depuis) : verdict comme avant');
}
{
    const e = restaurer({ frozenAt: 'x', frozenChapterMode: 'blind', questions: questions() });
    ok(/Correct/.test(e.feedback_q1.innerHTML), 'Blind : inchangé');
}

console.log(echecs ? `\n${echecs} échec(s)` : '\nTout passe.');
process.exit(echecs ? 1 : 0);
