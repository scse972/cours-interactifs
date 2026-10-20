// test-tirageQuestions.js — Tirage de x questions parmi y, figé par apprenant (progressManager.js :
// tirerQuestions, questionsDuChapitre, initChapter, gelerContexteChapitre, degelerContexteChapitre,
// ensureChapterInitialized, computeChapterUIStats).
//
//   node scripts/test-tirageQuestions.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

let echecs = 0;
const ok = (c, m) => { if (!c) echecs++; console.log(c ? 'PASS' : 'FAIL', m); };

function charger({ chapitreCourant = 'ch1' } = {}) {
    const bac = {
        window: {},
        console: { ...console, log() {}, warn() {} },
        crypto: { getRandomValues: (t) => crypto.randomFillSync(t) },
        URLSearchParams,
        sessionStorage: { getItem: () => 'eleve1' },
        location: { search: '?chapitre=' + chapitreCourant, pathname: '/parcours/src/chapter_template.html' },
        Bareme: { estBlind: () => false, pointsAuto: (p) => p, pointsAutoJuste: (p) => p, pointsAutoFausse: () => 0, nbOptions: () => 4 },
    };
    bac.window.location = bac.location;
    bac.window.sha256Hex = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
    vm.createContext(bac);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/progressManager.js'), 'utf8'), bac, { filename: 'progressManager.js' });
    return bac;
}

function chapitre({ y = 10, mode = 'exam', nombre = 4, invalides = 0, cours = 1 } = {}) {
    const questions = [];
    for (let i = 1; i <= y; i++) {
        const invalide = i <= invalides;
        questions.push({ id: 'ch1_q' + i, type: 'qcm', correctionType: 'auto', points: i % 3 + 1,
            questionText: invalide ? '' : 'Énoncé ' + i, options: ['a', 'b'] });
    }
    return { id: 'ch1', chapterMode: mode, nombreQuestions: nombre, questions, courseValidationCount: cours,
             maxPoints: questions.reduce((s, q) => s + q.points, 0) };
}

const m = charger();
const PM = m.window.ProgressManager;

// ── tirerQuestions ──
{
    const conf = chapitre({ y: 10, nombre: 4 });
    const t = PM.tirerQuestions(conf);
    ok(Array.isArray(t) && t.length === 4 && new Set(t).size === 4, 'x < y : 4 identifiants distincts');
    const rangs = t.map(id => Number(id.split('_q')[1]));
    ok(rangs.every((r, i) => i === 0 || r > rangs[i - 1]), 'dans l\'ordre publié');
    ok(t.every(id => conf.questions.some(q => q.id === id)), 'tous pris dans le chapitre');

    const listes = new Set();
    for (let k = 0; k < 50; k++) listes.add(PM.tirerQuestions(conf).join(','));
    ok(listes.size > 5, 'deux apprenants tirent des listes différentes (' + listes.size + ' listes sur 50 tirages)');

    ok(PM.tirerQuestions(chapitre({ y: 10, nombre: 10 })) === null, 'x = y : null (toutes)');
    ok(PM.tirerQuestions(chapitre({ y: 10, nombre: 50 })) === null, 'x > y : null (toutes)');
    ok(PM.tirerQuestions(chapitre({ nombre: 0 })) === null && PM.tirerQuestions(chapitre({ nombre: null })) === null
        && PM.tirerQuestions(chapitre({ nombre: '' })) === null && PM.tirerQuestions(chapitre({ nombre: -3 })) === null, '0, vide, négatif : null');
    ok(PM.tirerQuestions(chapitre({ mode: 'normal' })) === null && PM.tirerQuestions(chapitre({ mode: 'consigne' })) === null
        && PM.tirerQuestions(chapitre({ mode: 'atelier' })) === null, 'Découverte, Consigne, Atelier : null');
    ok(Array.isArray(PM.tirerQuestions(chapitre({ mode: 'blind' }))) && Array.isArray(PM.tirerQuestions(chapitre({ mode: 'millionnaire' }))), 'Blind et Millionnaire : tirage');
    ok(PM.tirerQuestions({ ...chapitre({ mode: undefined }), chapterMode: undefined, examMode: true }).length === 4, 'ancien examMode : tirage');
    ok(PM.tirerQuestions(chapitre({ nombre: '3.7' })).length === 3, 'nombre décimal : partie entière');

    const avecInvalides = chapitre({ y: 10, nombre: 4, invalides: 3 });
    const ti = PM.tirerQuestions(avecInvalides);
    ok(ti.length === 4 && ti.every(id => Number(id.split('_q')[1]) > 3), 'questions invalides hors du tirage');
    ok(PM.tirerQuestions(chapitre({ y: 10, nombre: 7, invalides: 3 })) === null, 'x = nombre de questions valides : null');
    ok(PM.tirerQuestions(null) === null && PM.tirerQuestions({ chapterMode: 'exam', nombreQuestions: 2 }) === null, 'config absente ou sans questions : null');
}

// ── questionsDuChapitre ──
{
    const conf = chapitre({ y: 6 });
    ok(PM.questionsDuChapitre(conf, null).length === 6 && PM.questionsDuChapitre(conf, { questionsTirees: null }).length === 6, 'sans tirage : toutes');
    const q = PM.questionsDuChapitre(conf, { questionsTirees: ['ch1_q5', 'ch1_q2', 'disparue'] });
    ok(q.length === 2 && q[0].id === 'ch1_q2' && q[1].id === 'ch1_q5', 'avec tirage : ordre publié, question disparue ignorée');
    ok(PM.questionsDuChapitre(null, null).length === 0, 'config absente : liste vide');
}

// ── initChapter ──
{
    const conf = chapitre({ y: 10, nombre: 4, cours: 2 });
    const ch = PM.initChapter(conf, 'eleve1');
    const ids = Object.keys(ch.questions).filter(id => !id.startsWith('course_'));
    ok(Array.isArray(ch.questionsTirees) && ch.questionsTirees.length === 4, 'initChapter : tirage posé');
    ok(ids.length === 4 && ids.every(id => ch.questionsTirees.includes(id)), 'progression : seulement les 4 tirées');
    ok(Object.keys(ch.questions).filter(id => id.startsWith('course_')).length === 2, 'les cours sont tous là');
    ok(ch.questionCount === 4 && ch.progressItemCount === 6, 'questionCount 4, progressItemCount 4 + 2 cours');
    const points = conf.questions.filter(q => ch.questionsTirees.includes(q.id)).reduce((s, q) => s + q.points, 0);
    ok(ch.maxPoints === points, 'maxPoints = points des questions tirées (' + points + ')');

    const sans = PM.initChapter(chapitre({ y: 10, nombre: 0, cours: 2 }), 'eleve1');
    ok(sans.questionsTirees === null && Object.keys(sans.questions).length === 12 && sans.progressItemCount === 12, 'sans tirage : 10 questions + 2 cours, comme avant');
}

// ── dégel puis gel (entrée créée d'avance) ──
{
    const conf = chapitre({ y: 10, nombre: 4, cours: 1 });
    const statique = { ...conf, nombreQuestions: undefined };            // cours.json seul : pas de nombre
    const ch = PM.initChapter(statique, null);
    PM.degelerContexteChapitre(ch);
    ok(ch.questionsTirees === null && ch.frozenAt === null, 'dégel : pas de tirage, pas démarré');
    ok(Object.keys(ch.questions).length === 11, 'entrée créée d\'avance : toutes les questions');
    const geler = vm.runInContext('gelerContexteChapitre', m);
    geler(ch, conf, 'eleve1');
    ok(ch.questionsTirees.length === 4 && Object.keys(ch.questions).filter(id => !id.startsWith('course_')).length === 4, 'gel avec la config effective : tirage, questions non tirées retirées');
    ok(ch.questions.course_0 && ch.progressItemCount === 5 && ch.questionCount === 4, 'gel : cours gardés, compteurs recomptés');

    const ch2 = PM.initChapter(conf, 'eleve1');
    PM.degelerContexteChapitre(ch2);
    geler(ch2, { ...conf, nombreQuestions: 0 }, 'eleve1');
    ok(ch2.questionsTirees === null && ch2.progressItemCount === 11 && ch2.questionCount === 10,
        'gel sans tirage : compteurs sur toutes les questions (ensureChapterInitialized rajoutera les absentes)');
}

// ── ensureChapterInitialized ne rajoute pas les questions non tirées ──
{
    const conf = chapitre({ y: 10, nombre: 4, cours: 1 });
    const progression = { chapters: { ch1: PM.initChapter(conf, 'eleve1') } };
    const tirees = progression.chapters.ch1.questionsTirees.slice();
    PM.ensureChapterInitialized(progression, { chapters: [conf] });
    const ids = Object.keys(progression.chapters.ch1.questions).filter(id => !id.startsWith('course_'));
    ok(ids.length === 4 && ids.every(id => tirees.includes(id)), 'ensureChapterInitialized : rien de rajouté');
    ok(progression.chapters.ch1.questionsTirees.join() === tirees.join(), 'le tirage ne change pas à la réouverture');

    // Première ouverture d'un chapitre absent : le tirage se fait là
    const vide = { chapters: {} };
    PM.ensureChapterInitialized(vide, { chapters: [conf] });
    ok(Array.isArray(vide.chapters.ch1?.questionsTirees) && vide.chapters.ch1.questionsTirees.length === 4, 'premier accès : tirage');

    // Entrée sans tirage (démarrée avant le réglage) : toutes les questions, inchangé
    const ancienne = { chapters: { ch1: PM.initChapter({ ...conf, nombreQuestions: 0 }, 'eleve1') } };
    PM.ensureChapterInitialized(ancienne, { chapters: [conf] });
    ok(ancienne.chapters.ch1.questionsTirees === null && Object.keys(ancienne.chapters.ch1.questions).length === 11,
        'chapitre démarré avant le réglage : garde toutes ses questions');
}

// ── Avancement et statistiques sur les seules questions tirées ──
{
    const conf = chapitre({ y: 10, nombre: 4, cours: 0 });
    const ch = PM.initChapter(conf, 'eleve1');
    ch.questionsTirees.forEach(id => Object.assign(ch.questions[id], { answered: true, attempts: 1, isCorrect: true }));
    const av = PM.compterAvancement(ch, conf);
    ok(av.total === 4 && av.pourcentage === 100, 'avancement : 4/4 = 100 % (et non 4/10)');
    const stats = PM.computeChapterUIStats(ch, conf, 20);
    ok(stats.totalPossiblePoints === ch.maxPoints, 'bandeau : total des points = celui du tirage');
    ok(stats.autoMaxPossible === ch.maxPoints, 'bandeau : points attribuables sur les seules questions tirées');
}

console.log(echecs ? echecs + ' FAIL' : 'tout est vert');
process.exitCode = echecs ? 1 : 0;
