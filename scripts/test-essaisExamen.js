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

// ── Rendu FORCÉ par le formateur (tableau de bord, 19/11/2026) : même remise à 1 qu'un rendu ──
(async () => {
    const bac = charger(faireDocument([]));
    bac.window.ProgressManager = bac.window.ProgressManager;
    vm.runInContext('var ProgressManager = window.ProgressManager;', bac);
    bac.sessionStorage = { getItem: () => 'true', setItem() {} };
    bac.window.currentParcoursSlug = 'P';
    bac.document.addEventListener = () => {};
    let ecrit = null;
    bac.storage = { set: async (k, v) => { ecrit = v; }, get: async () => null };
    vm.runInContext('var storage = this.storage;', bac);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/teacherDashboard.js'), 'utf8')
        + '\n;this.TD = TeacherDashboard;', bac, { filename: 'teacherDashboard.js' });
    const rendre = async (chapitre, reglage, options) => {
        const t = Object.create(bac.TD.prototype);
        t.chapters = [{ id: 'c1', ...reglage }];
        t.getStudentProgress = async () => ({ chapters: { c1: chapitre } });
        ecrit = null;
        await t.updateSubmissionStatus('e', 'c1', 'submitted', options);
        return ecrit.chapters.c1.questions;
    };
    const qs = () => ({ q1: { attempts: 3 }, q2: { attempts: 0 } });
    let q = await rendre({ frozenAt: 'x', frozenChapterMode: 'exam', questions: qs() }, {}, { rendu: true });
    ok(q.q1.attempts === 1 && q.q2.attempts === 0, 'rendu forcé en Examen : 3 essais → 1, 0 reste 0');
    q = await rendre({ frozenAt: 'x', frozenChapterMode: 'normal', questions: qs() }, { chapterMode: 'exam' }, { rendu: true });
    ok(q.q1.attempts === 3, 'rendu forcé hors Examen (mode figé Découverte) : essais inchangés');
    q = await rendre({ frozenAt: 'x', frozenChapterMode: 'exam', questions: qs() }, {}, undefined);
    ok(q.q1.attempts === 3, '« Rouvrir pour correction » (même statut, sans rendu) : essais inchangés');

    // XPro, fenêtre Progression apprenant : la copie de ramenerEssaisExamen et son appel.
    const xs = fs.readFileSync(path.join(__dirname, '../../XSpro/src/vuesOnglets/vuesOngletsClasses/formulaireProgressionApprenant.js'), 'utf8');
    ok(/function ramenerEssaisExamenXS\(/.test(xs) && /=== 'exam'\) ramenerEssaisExamenXS\(ch\)/.test(xs),
        'XPro : « Forcer le rendu » ramène aussi les essais à 1 en Examen');

    // ── Examen et Blind : une question ouverte est un brouillon, pas un essai (19/11/2026) ──
    {
        const bacE = charger(faireDocument([]));
        bacE.window.partChezUnHumain = el => !!el.estOuverte;
        bacE.fauxEvaluate = el => ({ userAnswer: el.valeur, isCorrect: el.estOuverte ? null : true, points: 1 });
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/studentWorkEditor.js'), 'utf8')
            + '\n;this.SWE = StudentWorkEditor; QuestionEngine.evaluate = this.fauxEvaluate;', bacE, { filename: 'studentWorkEditor.js' });
        for (const mode of ['exam', 'blind']) {
            const recus = { valide: 0, brouillon: 0 };
            const ed = new bacE.SWE({ onAnswerValidated: () => recus.valide++, onDraftChanged: () => recus.brouillon++ });
            ed.examMode = mode === 'exam'; ed.blindMode = mode === 'blind'; ed.locked = false;
            ed.onInputChanged({ dataset: { questionId: 'ouverte' }, estOuverte: true, valeur: 'Un long texte' }, null);
            ed.onInputChanged({ dataset: { questionId: 'qcm' }, estOuverte: false, valeur: 'B' }, null);
            ok(recus.brouillon === 1 && recus.valide === 1,
                (mode === 'exam' ? 'Examen' : 'Blind') + ' : question ouverte → brouillon, QCM → réponse enregistrée comme avant');
        }
    }

    // ── Les règles de notation annoncées à l'ouverture, mode par mode (20/11/2026) ──
    {
        const source = fs.readFileSync(path.join(__dirname, '../src/js/chapitre.js'), 'utf8');
        const debut = source.indexOf('const LIGNE_BAREME_MILLIONNAIRE');
        const finAvertir = source.indexOf('\n}\n', source.indexOf('function avertirNotation()')) + 2;
        const code = source.slice(debut, finAvertir);
        const essayer = (mode, { verrouille = false, repondue = false, questions = [{ type: 'qcm', correctionType: 'auto' }], penalite = 0 } = {}) => {
            const inseres = [];
            const fenetres = [];
            const contexte = {
                isExamMode: mode === 'exam', isBlindMode: mode === 'blind', isMillionnaireMode: mode === 'millionnaire',
                isAtelierMode: mode === 'atelier', isConsigneMode: mode === 'consigne', isEntrainementMode: mode === 'entrainement',
                isChapterLocked: verrouille,
            };
            const bac = {
                window: {
                    currentExamContext: contexte,
                    currentChapterConfig: { questions },
                    ProgressManager: { aRepondu: q => !!q.answer },
                    Bareme: { reglesTentatives: () => ({ penalite }) },
                },
                document: {
                    querySelector: () => ({ firstChild: null, insertBefore: el => inseres.push(el) }),
                    getElementById: () => null,
                    createElement: () => ({}),
                },
                ChapterSession: { chapterId: 'c', progress: { chapters: { c: { questions: {
                    course_0: { answer: 'lu' }, q1: { answer: repondue ? 'B' : null },
                } } } } },
                ChapterSubmission: { _alertModal: m => fenetres.push(m) },
            };
            bac.Bareme = bac.window.Bareme;
            vm.createContext(bac);
            vm.runInContext(code + '\navertirNotation();', bac);
            return { bandeau: inseres[0] ? inseres[0].innerHTML.replace(/<[^>]+>/g, '') : null, fenetre: fenetres[0] || null };
        };
        let r = essayer('exam');
        ok(/fausse : les points de la question\s+sont retirés/.test(r.bandeau) && /Sans réponse : 0/.test(r.bandeau)
            && /Réponse fausse : les points de la question sont retirés/.test(r.fenetre) && /Sans réponse : 0 point/.test(r.fenetre),
            'Examen : bandeau et fenêtre — fausse = points retirés, sans réponse = 0');
        r = essayer('normal');
        ok(/Chaque essai raté en retire une part/.test(r.bandeau) && /Sans réponse : 0/.test(r.bandeau) && /hasard ne rapporte rien/.test(r.fenetre),
            'Découverte : chaque essai raté coûte, fausse = points retirés, sans réponse = 0');
        r = essayer('blind', { penalite: 1 });
        ok(/fausse ou sans réponse : 0/.test(r.bandeau) && /coûte 1 pt sur 20/.test(r.bandeau) && /Réponse fausse : 0 point/.test(r.fenetre),
            'Blind : fausse ou sans réponse = 0, et ce que coûte une nouvelle tentative');
        r = essayer('blind');
        ok(/Recommencer ne coûte rien/.test(r.bandeau), 'Blind sans pénalité de tentative : recommencer ne coûte rien');
        r = essayer('exam', { repondue: true });
        ok(r.bandeau && !r.fenetre, 'copie déjà commencée : le bandeau seulement, pas de fenêtre à chaque rechargement');
        r = essayer('exam', { verrouille: true });
        ok(!r.bandeau && !r.fenetre, 'copie rendue ou verrouillée : rien');
        ok(['millionnaire', 'atelier', 'consigne', 'entrainement'].every(m => { const x = essayer(m); return !x.bandeau && !x.fenetre; }),
            'Millionnaire (sa propre fenêtre), Atelier, Consigne, Entraînement : rien de plus ici');
        r = essayer('exam', { questions: [{ type: 'ouverte', correctionType: 'manuel' }, { type: 'ouverte', correctionType: 'auto' }] });
        ok(!r.bandeau && !r.fenetre, 'chapitre sans question à correction automatique : rien (le formateur note)');
        ok(/LIGNE_BAREME_MILLIONNAIRE\}`;/.test(source) && /\\n\\n\$\{LIGNE_BAREME_MILLIONNAIRE\}`\);/.test(source),
            'Millionnaire : la ligne de barème dans son bandeau et dans sa fenêtre');
    }

    // ── Une réponse vide vaut 0, même remplie puis effacée (décision du 20/11/2026) ──
    {
        const bacB = charger(faireDocument([]));
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/core/bareme.js'), 'utf8'), bacB, { filename: 'bareme.js' });
        vm.runInContext('if (typeof Bareme === "undefined") var Bareme = window.Bareme;', bacB);
        const PM = bacB.window.ProgressManager;
        const config = { questions: [
            { id: 'juste', points: 4, correctionType: 'auto' },
            { id: 'fausse', points: 2, correctionType: 'auto' },
            { id: 'effacee', points: 2, correctionType: 'auto' },
            { id: 'jamais', points: 2, correctionType: 'auto' },
        ] };
        const chapitre = { frozenAt: 'x', frozenChapterMode: 'exam', questions: {
            juste: { attempts: 1, answered: true, answer: '4', isCorrect: true },
            fausse: { attempts: 1, answered: true, answer: '3', isCorrect: false },
            effacee: { attempts: 1, answered: false, answer: null, isCorrect: null },
            jamais: { attempts: 0, answered: false, answer: null, isCorrect: null },
        } };
        const stats = PM.computeChapterUIStats(chapitre, config);
        ok(stats.pointsObtenus === 2, 'site : juste +4, fausse −2, effacée 0, jamais répondue 0 → 2 points (' + stats.pointsObtenus + ')');

        const xs = fs.readFileSync(path.join(__dirname, '../../XSpro/src/vuesOnglets/vuesOngletsClasses/formulaireProgressionApprenant.js'), 'utf8');
        ok(/if \(!wasAnswered\) return 0;/.test(xs) && !/attempts > 0 && !wasAnswered\) effectiveIsCorrect = false/.test(xs),
            'XPro : une réponse vide vaut 0, même après un essai');
        const cm = fs.readFileSync(path.join(__dirname, '../src/js/correctionModal.js'), 'utf8');
        const bilan = fs.readFileSync(path.join(__dirname, '../src/js/chapter/chapterBilan.js'), 'utf8');
        ok(/if \(!wasAnswered\) return 0;/.test(cm) && /const rate = repondue && donnees\.isCorrect === false;/.test(bilan),
            'site : fenêtre de correction et bilan suivent la même règle');
    }

    // ── Plus d'historique des tentatives (décision du 19/11/2026) ──
    {
        const PM = charger(faireDocument([])).window.ProgressManager;
        const progression = { chapters: { c: { questions: { q: { answered: false, attempts: 0, attemptHistory: [] } } } } };
        for (let i = 0; i < 100; i++) PM.recordAnswer(progression, 'c', 'q', 'texte ' + i, null, 0);
        const q = progression.chapters.c.questions.q;
        ok(Array.isArray(q.attemptHistory) && q.attemptHistory.length === 0, 'recordAnswer n\'empile plus rien dans l\'historique');
        ok(q.attempts === 100 && q.answer === 'texte 99', 'les essais et la réponse ne changent pas');
        const gonflee = { chapters: {
            a: { questions: { q1: { answer: 'x', attempts: 4, attemptHistory: Array.from({ length: 3369 }, (_, i) => ({ answer: i })) }, q2: { attemptHistory: [] } } },
            b: { questions: { q1: { attemptHistory: [{ answer: 1 }] } } },
        } };
        const n = PM.retirerHistoriques(gonflee);
        ok(n === 2 && gonflee.chapters.a.questions.q1.attemptHistory.length === 0 && gonflee.chapters.a.questions.q1.attempts === 4,
            'retirerHistoriques vide les historiques (2 questions), sans toucher aux essais');
        const source = fs.readFileSync(path.join(__dirname, '../src/js/progressManager.js'), 'utf8');
        const corps = nom => source.slice(source.indexOf('async function ' + nom + '('), source.indexOf('async function ' + nom + '(') + 1500);
        ok(/retirerHistoriques\(progress\)/.test(corps('saveProgress')) && /retirerHistoriques\(progress\)/.test(corps('saveProgressDiffere')),
            'chaque sauvegarde (immédiate ou groupée) vide l\'historique : une progression gonflée s\'allège à la sauvegarde suivante');
    }

    console.log(echecs ? `\n${echecs} échec(s)` : '\nTout passe.');
    process.exit(echecs ? 1 : 0);
})();
