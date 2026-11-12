// test-correctionsFormateurConservees.js — La page de l'apprenant, restée ouverte, ne défait pas ce
// que le formateur a écrit entre-temps (progressManager.js, conserverCorrectionsFormateur ;
// storage.js, get { serveur: true }). 12/11/2026.
//
//   node scripts/test-correctionsFormateurConservees.js
//
// Le scénario de bout en bout avec XPro (publication depuis « Progression apprenant ») est dans
// XSpro : scripts/test-correctionPreserveeApprenant.js. Ici, ce qui est propre au site : la
// reprise d'un chapitre publié, le mode atelier (l'apprenant répond et saisit un AR pendant que le
// formateur corrige une autre consigne) et la lecture au serveur malgré le cache d'écriture.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let echecs = 0;
const ok = (c, m) => { if (!c) echecs++; console.log(c ? 'PASS' : 'FAIL', m); };
const clone = (o) => JSON.parse(JSON.stringify(o));
const muet = { ...console, log() {}, warn() {}, info() {} };

// ── progressManager.js, la progression d'un apprenant dans un magasin en mémoire ────────────
const JETON = 'essai01';
let enregistree = null;
const bac = { window: {}, console: muet };
bac.window.Parcours = bac.Parcours = { scoped: { student: {
    get: async () => (enregistree ? clone(enregistree) : null),
    set: async (cle, valeur) => { enregistree = clone(valeur); },
} } };
vm.createContext(bac);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/progressManager.js'), 'utf8'), bac, { filename: 'progressManager.js' });
const PM = bac.window.ProgressManager;

const config = { id: 'c1', title: 'Atelier', chapterMode: 'atelier', questions: [
    { id: 'c1_q1', type: 'ouverte', correctionType: 'manuel', rule: 'texte', points: 4 },
    { id: 'c1_q2', type: 'ouverte', correctionType: 'manuel', rule: 'texte', points: 4 },
    { id: 'c1_q3', type: 'ouverte', correctionType: 'manuel', rule: 'texte', points: 4 },
] };
const repondre = (ch, id, texte) => Object.assign(ch.questions[id], { answered: true, answer: texte, isCorrect: null, needsManualCorrection: true, manualCorrectionStatus: 'pending' });
const plusTard = (iso, ms) => new Date(new Date(iso).getTime() + ms).toISOString();

(async () => {
    // ════ 1. Atelier, chapitre non rendu : le formateur valide la consigne 2 pendant que l'apprenant
    //        saisit l'AR de la consigne 1 et réécrit sa consigne 3.
    const p = PM.initProgress(JETON, 'ESSAI Un', null);
    p.chapters.c1 = PM.initChapter(config);
    const ch = p.chapters.c1;
    repondre(ch, 'c1_q1', 'compte rendu 1'); repondre(ch, 'c1_q2', 'compte rendu 2'); repondre(ch, 'c1_q3', 'première version');
    // Consigne 1 : note et AR émis par le formateur, déjà connus de la page.
    const emis = new Date(Date.now() - 60000).toISOString();
    Object.assign(ch.questions.c1_q1, { teacherScore: 3, manualCorrectionStatus: 'corrected', correctedAt: emis, arHash: 'h1', arEmisAt: emis, arSaisiAt: null });
    PM.recomputeChapterStats(ch);
    enregistree = clone(p);
    const page = clone(p);

    // Le formateur, ailleurs : consigne 2 corrigée et datée, et une appréciation générale.
    const corrige = plusTard(emis, 30000);
    Object.assign(enregistree.chapters.c1.questions.c1_q2, { teacherScore: 4, teacherComment: 'Parfait', manualCorrectionStatus: 'corrected', correctedAt: corrige, correctedBy: 'teacher' });
    enregistree.chapters.c1.globalComment = 'Bonne séance';
    enregistree.chapters.c1.teacherMonitoring = { ...(enregistree.chapters.c1.teacherMonitoring || {}), lastTeacherActionAt: corrige };

    // L'apprenant, sur sa page : saisit l'AR de la consigne 1, réécrit la consigne 3.
    page.chapters.c1.questions.c1_q1.arSaisiAt = new Date().toISOString();
    page.chapters.c1.questions.c1_q3.answer = 'seconde version';
    await PM.saveProgress(JETON, page);

    const q = enregistree.chapters.c1.questions;
    ok(q.c1_q2.teacherScore === 4 && q.c1_q2.manualCorrectionStatus === 'corrected', 'atelier : la consigne corrigée ailleurs est gardée');
    ok(enregistree.chapters.c1.globalComment === 'Bonne séance', "atelier : l'appréciation générale du formateur est gardée");
    ok(!!q.c1_q1.arSaisiAt, "atelier : l'AR que l'apprenant vient de saisir n'est pas effacé");
    ok(q.c1_q3.answer === 'seconde version' && q.c1_q3.manualCorrectionStatus === 'pending', "atelier : la réponse que l'apprenant vient de réécrire est gardée");

    // ════ 2. Rien de neuf côté formateur : la page écrit ce qu'elle a, sans rien reprendre.
    const page2 = clone(enregistree);
    page2.chapters.c1.questions.c1_q3.answer = 'troisième version';
    page2.chapters.c1.globalComment = 'modifié localement (ne devrait jamais arriver)';
    await PM.saveProgress(JETON, page2);
    ok(enregistree.chapters.c1.globalComment === 'modifié localement (ne devrait jamais arriver)',
        'sans intervention plus récente du formateur, rien n\'est repris');

    // ════ 3. storage.get : { serveur: true } passe outre la fenêtre d'écriture de 15 s, sans
    //        toucher au cache.
    const memoire = new Map();
    const st = {
        window: {}, console: muet, setTimeout, clearTimeout,
        localStorage: {
            getItem: (k) => (memoire.has(k) ? memoire.get(k) : null),
            setItem: (k, v) => memoire.set(k, String(v)),
            removeItem: (k) => memoire.delete(k),
            key: (i) => [...memoire.keys()][i] ?? null,
            get length() { return memoire.size; },
        },
        document: { readyState: 'loading', addEventListener() {}, getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }), body: { appendChild() {} } },
    };
    st.window.addEventListener = () => {};
    st.window.location = { search: '', pathname: '/', href: 'http://localhost/' };
    vm.createContext(st);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/storage.js'), 'utf8'), st, { filename: 'storage.js' });
    const storage = st.window.storage;
    let surLeServeur = null;
    storage._provider = { get: async () => clone(surLeServeur), set: async (k, v) => { surLeServeur = clone(v); }, remove: async () => {} };
    storage._noCache = false;

    await storage.set('k', { v: 'écrit par la page' });
    surLeServeur = { v: 'écrit par le formateur' };   // une autre écriture, juste après
    const parCache = await storage.get('k');
    const parServeur = await storage.get('k', { serveur: true });
    const ensuite = await storage.get('k');
    ok(parCache?.v === 'écrit par la page', 'storage : dans les 15 s, la lecture ordinaire rend l\'écriture de la page (inchangé)');
    ok(parServeur?.v === 'écrit par le formateur', 'storage : { serveur: true } rend la valeur du serveur');
    ok(ensuite?.v === 'écrit par la page', 'storage : { serveur: true } ne réécrit pas le cache');

    storage._provider.get = async () => { throw new Error('hors ligne'); };
    const enPanne = await storage.get('k', { serveur: true });
    ok(enPanne?.v === 'écrit par la page', 'storage : serveur injoignable, { serveur: true } retombe sur le cache');
    let leve = false;
    try { await storage.get('k', { serveur: true, strict: true }); } catch (e) { leve = !!e.serviceIndisponible; }
    ok(leve, 'storage : { serveur: true, strict: true } lève sur panne');

    console.log(echecs ? `${echecs} ÉCHEC(S)` : 'TOUT PASSE');
    process.exitCode = echecs ? 1 : 0;
})().catch(e => { console.error('ERREUR', e); process.exitCode = 1; });
