// test-chapterSortiePage.js — Banc de src/js/chapter/chapterSortiePage.js (option « 🚪 Sortie de
// page », 17/11/2026), sans navigateur : un DOM minimal, une horloge et des minuteurs à la main,
// le module chargé dans un bac à sable vm avec le vrai core/bareme.js.
//
//   node scripts/test-chapterSortiePage.js
//
// Ce qui est vérifié : quand l'option est inerte ; l'annonce à l'ouverture ; le seuil de 3 s
// (strict, 18/11/2026), jamais annoncé — aucune durée dans ce que lit l'apprenant ; la confirmation par le relevé ou au retour (page gelée), sans doublon ; l'iframe,
// l'onglet caché, le sélecteur de fichier ; l'attente d'une fenêtre déjà ouverte ; la copie rendue.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let echecs = 0;
const ok = (c, m) => { if (!c) echecs++; console.log(c ? 'PASS' : 'FAIL', m); };
// Décision du 17/11/2026 : l'élève lit « interdit / sanctionné », jamais un montant.
const MONTANT = /\d+(?:[.,]\d+)?\s*(?:points?|pts?)\b|sur 20/i;
const sansMontant = (texte) => !MONTANT.test(String(texte));

class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null; this.id = ''; this.className = ''; this.innerHTML = ''; }
    insertBefore(e, ref) { e.parentNode = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? 0 : i, 0, e); return e; }
    get firstChild() { return this.children[0] || null; }
}

function creerMonde({ chapitre = {}, mode = 'exam', formateur = false, simulation = false, entrainement = false,
                      ecritureBloquee = false, verrouille = false } = {}) {
    let maintenant = 1000;
    const minuteurs = [];
    const contenu = new Element('main');
    let fenetreOuverte = false;
    const document = {
        hidden: false,
        _focus: true,
        hasFocus() { return this._focus; },
        createElement: tag => new Element(tag),
        querySelector: sel => (sel === '.chapter-content' ? contenu : null),
        getElementById(id) {
            if (id === '_native-dialog-overlay') return fenetreOuverte ? {} : null;
            return contenu.children.find(e => e.id === id) || null;
        },
        _ecoutes: {},
        addEventListener(type, fn) { (this._ecoutes[type] ||= []).push(fn); },
        dispatch(type, ev = {}) { (this._ecoutes[type] || []).forEach(fn => fn(ev)); }
    };
    const enregistrements = [];
    const fenetres = [];
    const chapter = { frozenSortiePage: true, frozenChapterMode: mode, ...chapitre };
    const bac = {
        console: { log() {}, warn: console.warn }, Date, Promise, Math, Number, String, Array, Object, isNaN,
        setTimeout, clearTimeout, setInterval, clearInterval,
        document,
        Parcours: { estVueFormateur: () => formateur },
        Simulation: { active: () => simulation },
        ChapterOrdre: { mode: () => mode },
        currentExamContext: { isChapterLocked: verrouille },
        ChapterSession: { progress: { chapters: { c1: chapter } }, chapterId: 'c1', studentId: 'S1', entrainement, ecritureBloquee },
        ProgressManager: { saveProgress: (id, p) => { enregistrements.push(JSON.parse(JSON.stringify(p.chapters.c1.sortiesPage || []))); return Promise.resolve(); } },
        ChapterSubmission: { _alertModal: (m) => { fenetres.push(m); return Promise.resolve(); } },
    };
    bac.window = bac;
    const ecoutesFenetre = {};
    bac.addEventListener = (type, fn) => { (ecoutesFenetre[type] ||= []).push(fn); };
    vm.createContext(bac);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/core/bareme.js'), 'utf8'), bac, { filename: 'bareme.js' });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/chapter/chapterSortiePage.js'), 'utf8'), bac, { filename: 'chapterSortiePage.js' });
    const S = bac.ChapterSortiePage;
    S._configurer({
        horloge: () => maintenant,
        armer: (fn, ms) => { minuteurs.push(fn); },
        releve: () => {}            // le relevé est joué à la main (S.verifier)
    });
    const monde = {
        S, bac, document, chapter, contenu, enregistrements, fenetres,
        avancer(ms) { maintenant += ms; },
        fenetreOuverte(v) { fenetreOuverte = v; },
        jouerMinuteurs() { const lot = minuteurs.splice(0); lot.forEach(fn => fn()); },
        // Gestes : la page perd / retrouve le focus
        quitter() { document._focus = false; (ecoutesFenetre.blur || []).forEach(fn => fn({})); },
        revenir() { document._focus = true; (ecoutesFenetre.focus || []).forEach(fn => fn({})); },
        cacher() { document.hidden = true; document.dispatch('visibilitychange'); },
        montrer() { document.hidden = false; document.dispatch('visibilitychange'); },
        blurVersIframe() { (ecoutesFenetre.blur || []).forEach(fn => fn({})); },   // le document garde le focus
        cliquerFichier() { document.dispatch('click', { target: { tagName: 'INPUT', type: 'file' } }); },
    };
    return monde;
}

(async () => {
    // ── 1. Inerte ──
    {
        const cas = [
            ['vue formateur', { formateur: true }],
            ['simulation', { simulation: true }],
            ['entraînement', { entrainement: true }],
            ['progression illisible', { ecritureBloquee: true }],
            ['option non figée', { chapitre: { frozenSortiePage: null } }],
            ['mode Découverte', { mode: 'normal' }],
            ['mode Entraînement', { mode: 'entrainement' }],
            ['copie rendue', { chapitre: { submissionStatus: 'submitted' } }],
            ['copie validée', { chapitre: { submissionStatus: 'validated' } }],
            ['chapitre verrouillé', { verrouille: true }],
        ];
        for (const [nom, options] of cas) {
            const m = createOrSkip(options);
            ok(m.S.init() === false && m.contenu.children.length === 0 && m.fenetres.length === 0, `inerte : ${nom}`);
            m.quitter(); m.avancer(10000); m.S.verifier(); m.revenir();
            ok(m.enregistrements.length === 0 && !m.chapter.sortiesPage, `inerte : ${nom} — rien d'enregistré`);
        }
    }
    function createOrSkip(o) { return creerMonde(o); }

    // ── 2. Annonce, seuil, confirmation, retour ──
    {
        const m = creerMonde();
        ok(m.S.init() === true, 'Examen, option figée : active');
        const bandeau = m.document.getElementById('bandeau-sortie-page');
        // Le seuil n'est jamais annoncé (18/11/2026) : aucune durée dans ce que lit l'apprenant.
        const sansDuree = t => !/\d+\s*(s|secondes?|min)\b/.test(String(t));
        ok(m.bac.Bareme.SEUIL_SORTIE_PAGE_MS === 3000, 'seuil : 3 s (5 s jusqu\'au 18/11/2026)');
        ok(bandeau && /Ne quittez pas cette page/.test(bandeau.innerHTML) && /interdit/.test(bandeau.innerHTML) && /sanctionnée/.test(bandeau.innerHTML) && sansMontant(bandeau.innerHTML) && sansDuree(bandeau.innerHTML), 'bandeau à l\'ouverture : ne pas quitter la page, interdit et sanctionné, sans montant ni durée', bandeau && bandeau.innerHTML);
        ok(m.fenetres.length === 1 && /Restez sur cette page/.test(m.fenetres[0]) && sansDuree(m.fenetres[0]), 'fenêtre à l\'ouverture, sans durée');

        // 2 s dehors : rien
        m.quitter(); m.avancer(2000); ok(m.S.verifier() === 'dehors', '2 s dehors : sortie en cours, pas confirmée');
        m.revenir();
        ok(!m.chapter.sortiesPage && m.enregistrements.length === 0 && m.fenetres.length === 1, '2 s : rien d\'enregistré, aucun message');

        // exactement 3 s : rien (plus de 3 s)
        m.quitter(); m.avancer(3000); m.S.verifier(); m.revenir();
        ok(!m.chapter.sortiesPage, '3 s pile : pas une sortie (il faut plus de 3 s)');

        // 5 s, confirmée par le relevé à 3,5 s, puis retour
        m.quitter(); m.avancer(3500);
        ok(m.S.verifier() === 'confirmee', '3,5 s dehors : confirmée par le relevé');
        ok(m.chapter.sortiesPage.length === 1 && m.chapter.sortiesPage[0].dureeS === null && m.enregistrements.length === 1, 'enregistrée tout de suite, durée encore inconnue');
        m.avancer(1500); ok(m.S.verifier() === 'dehors', 'toujours dehors : pas de doublon');
        m.revenir();
        ok(m.chapter.sortiesPage.length === 1 && m.chapter.sortiesPage[0].dureeS === 5, 'au retour : durée complétée (5 s)');
        ok(m.enregistrements.length === 2 && m.enregistrements[1][0].dureeS === 5, 'au retour : réenregistrée avec sa durée');
        ok(m.fenetres.length === 2 && /Vous avez quitté la page/.test(m.fenetres[1]) && /interdit/.test(m.fenetres[1]) && /sanctionnée/.test(m.fenetres[1]) && /1 sortie enregistrée/.test(m.fenetres[1]),
            'message au retour : quitté, interdit, sanctionné, bilan');
        ok(m.fenetres.every(sansDuree), 'aucune durée dans les fenêtres de l\'élève (ni seuil, ni durée de la sortie)', m.fenetres);
        ok(m.fenetres.every(sansMontant), 'aucun montant dans les fenêtres de l\'élève');
        ok(/1 sortie enregistrée\./.test(m.document.getElementById('bandeau-sortie-page').innerHTML) && sansMontant(m.document.getElementById('bandeau-sortie-page').innerHTML), 'bandeau mis à jour, sans montant');
        ok(m.chapter.sortiesPage[0].tentative === 1, 'tentative n°1 notée');

        // page gelée : aucun relevé, retour au bout de 8 s → confirmée au retour, une seule entrée
        m.chapter.tentative = 2;
        m.quitter(); m.avancer(8000); m.revenir();
        ok(m.chapter.sortiesPage.length === 2 && m.chapter.sortiesPage[1].dureeS === 8 && m.chapter.sortiesPage[1].tentative === 2, 'page gelée : confirmée au retour (8 s, tentative n°2)');
        ok(/2 sorties enregistrées\./.test(m.fenetres[m.fenetres.length - 1]) && sansMontant(m.fenetres[m.fenetres.length - 1]), 'le bilan cumule les tentatives, sans montant');

        // Bareme : la ligne et le retrait que le formateur verra
        const r = m.bac.Bareme.sortiesPage(m.chapter);
        ok(r.nombre === 2 && r.valeur === -6 && /^🚪 2 sorties de la page \(.+, 5 s ; .+, 8 s\) : -6 pt$/.test(r.texte), 'Bareme.sortiesPage : 2 sorties, −6, heure et durée, sans le seuil', r.texte);
    }

    // ── 2 bis. Chapitre ouvert dans un onglet d'arrière-plan : pas encore arrivé ──
    {
        const m = creerMonde();
        m.document._focus = false;              // chargé sans le focus
        m.S.init();
        m.avancer(30000);
        ok(m.S.verifier() === 'pas-arrive' && !m.chapter.sortiesPage, 'ouvert en arrière-plan, 30 s sans y venir : pas une sortie');
        m.revenir();                            // l'apprenant arrive
        ok(m.S.etat().arrive === true && !m.chapter.sortiesPage, 'arrivée : rien d\'enregistré');
        m.quitter(); m.avancer(6000); m.S.verifier(); m.revenir();
        ok(m.chapter.sortiesPage?.length === 1 && m.chapter.sortiesPage[0].dureeS === 6, 'après l\'arrivée, une vraie sortie compte');
    }

    // ── 3. Iframe, onglet caché ──
    {
        const m = creerMonde(); m.S.init();
        m.blurVersIframe(); m.avancer(10000);
        ok(m.S.verifier() === 'present' && !m.chapter.sortiesPage, 'focus dans une iframe de la page : pas une sortie');
        m.cacher(); m.avancer(6000); m.S.verifier(); m.montrer();
        ok(m.chapter.sortiesPage?.length === 1 && m.chapter.sortiesPage[0].dureeS === 6, 'onglet caché 6 s : une sortie');
    }

    // ── 4. Sélecteur de fichier ──
    {
        const m = creerMonde(); m.S.init();
        m.cliquerFichier(); m.quitter(); m.avancer(20000);
        ok(m.S.verifier() === 'pause', 'sélecteur de fichier ouvert 20 s : en pause');
        m.revenir();
        ok(!m.chapter.sortiesPage, 'sélecteur refermé : rien d\'enregistré');
        m.quitter(); m.avancer(6000); m.S.verifier(); m.revenir();
        ok(m.chapter.sortiesPage?.length === 1, 'pause finie au retour : la sortie suivante compte');

        const m2 = creerMonde(); m2.S.init();
        m2.cliquerFichier(); m2.quitter(); m2.avancer(61000);
        ok(m2.S.verifier() === 'depart', 'sélecteur ouvert plus d\'une minute : le décompte démarre');
        m2.avancer(6000); m2.S.verifier(); m2.revenir();
        ok(m2.chapter.sortiesPage?.length === 1 && m2.chapter.sortiesPage[0].dureeS === 6, '… et compte depuis la fin de la pause (6 s)');

        const m3 = creerMonde(); m3.S.init();
        m3.cliquerFichier(); m3.avancer(4000); m3.S.verifier();   // aucun sélecteur ne s'est ouvert
        m3.quitter(); m3.avancer(6000); m3.S.verifier(); m3.revenir();
        ok(m3.chapter.sortiesPage?.length === 1, 'clic sans sélecteur : pas de pause laissée derrière');
    }

    // ── 5. Une fenêtre déjà ouverte (confirmation de rendu, Millionnaire) ──
    {
        const m = creerMonde();
        m.fenetreOuverte(true);
        m.S.init();
        ok(m.fenetres.length === 0, 'annonce : attend que la fenêtre ouverte soit fermée');
        m.fenetreOuverte(false); m.jouerMinuteurs();
        ok(m.fenetres.length === 1 && /Restez sur cette page/.test(m.fenetres[0]), 'annonce affichée après sa fermeture');

        m.fenetreOuverte(true);
        m.quitter(); m.avancer(6000); m.revenir();
        m.quitter(); m.avancer(9000); m.revenir();
        ok(m.chapter.sortiesPage.length === 2 && m.fenetres.length === 1, 'deux retours pendant une fenêtre ouverte : enregistrés, aucun message encore');
        m.jouerMinuteurs();                 // toujours ouverte : on réessaie plus tard
        ok(m.fenetres.length === 1, 'fenêtre toujours ouverte : on attend encore');
        m.fenetreOuverte(false); m.jouerMinuteurs();
        ok(m.fenetres.length === 2 && /2 sorties enregistrées/.test(m.fenetres[1]), 'une seule fenêtre, la dernière (son bilan compte les deux sorties), après fermeture');
    }

    // ── 6. Copie rendue en cours de route ──
    {
        const m = creerMonde(); m.S.init();
        m.chapter.submissionStatus = 'submitted';
        m.quitter(); m.avancer(10000); m.S.verifier(); m.revenir();
        ok(!m.chapter.sortiesPage, 'copie rendue : plus rien n\'est compté');
    }

    console.log(echecs ? `${echecs} FAIL` : 'tout est vert');
    process.exitCode = echecs ? 1 : 0;
})();
