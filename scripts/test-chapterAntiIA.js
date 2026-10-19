// test-chapterAntiIA.js — Banc de src/js/chapter/chapterAntiIA.js, sans navigateur : un DOM
// minimal, un presse-papiers simulé, et le module chargé dans un bac à sable vm.
//
//   node scripts/test-chapterAntiIA.js
//
// Ce qui est vérifié : le masquage, l'ouverture différée au survol, le presse-papiers écrasé
// (affichage, Impr. écran, retour de focus après une capture probable, rejeu au prochain geste
// quand l'écriture est refusée), l'impression, la simulation (jamais d'écriture), la vue
// formateur (rien n'est masqué) et le navigateur piloté (rien ne s'affiche jamais).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let echecs = 0;
const ok = (c, m) => { if (!c) echecs++; console.log(c ? 'PASS' : 'FAIL', m); };
const dormir = (ms) => new Promise(r => setTimeout(r, ms));

// ── DOM minimal ─────────────────────────────────────────────────────────────
class Element {
    constructor(tag, classes = []) {
        this.tagName = tag.toUpperCase();
        this._classes = new Set(classes);
        this.children = [];
        this.parentNode = null;
        this.dataset = {};
        this.style = {};
        this._attrs = {};
        this._ecoutes = {};
        this._html = '';
        this._text = '';
        this.id = '';
        const self = this;
        this.classList = {
            add: (...c) => c.forEach(x => self._classes.add(x)),
            remove: (...c) => c.forEach(x => self._classes.delete(x)),
            contains: (c) => self._classes.has(c)
        };
    }
    get className() { return [...this._classes].join(' '); }
    set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
    get innerHTML() { return this._html; }
    set innerHTML(v) {
        this._html = String(v);
        this.children.forEach(c => { c.parentNode = null; });
        this.children = [];
        // Le seul HTML que le module pose lui-même : le voile. On le matérialise.
        if (this._html.includes('anti-ia-voile')) {
            const voile = new Element('div', ['anti-ia-voile']);
            if (this._html.includes('anti-ia-automate')) voile.classList.add('anti-ia-automate');
            this.appendChild(voile);
        }
    }
    get textContent() { return this._text || this._html.replace(/<[^>]+>/g, ''); }
    set textContent(v) { this._text = String(v); this._html = ''; this.children = []; }
    setAttribute(n, v) { this._attrs[n] = String(v); if (n === 'id') this.id = String(v); }
    getAttribute(n) { return n in this._attrs ? this._attrs[n] : null; }
    removeAttribute(n) { delete this._attrs[n]; }
    appendChild(e) { if (e.parentNode) e.remove(); e.parentNode = this; this.children.push(e); return e; }
    remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter(c => c !== this); this.parentNode = null; } }
    contains(e) { if (!e) return false; for (let x = e; x; x = x.parentNode) if (x === this) return true; return false; }
    addEventListener(type, fn) { (this._ecoutes[type] ||= []).push(fn); }
    dispatch(type, ev = {}) {
        ev.type = type; ev.target ||= this; ev.preventDefault ||= () => {};
        (this._ecoutes[type] || []).forEach(fn => fn(ev));
    }
    _correspond(token) {
        if (token.startsWith('.')) return this._classes.has(token.slice(1));
        if (token.startsWith('#')) return this.id === token.slice(1);
        return this.tagName === token.toUpperCase();
    }
    _descendants() { const r = []; const visite = (e) => e.children.forEach(c => { r.push(c); visite(c); }); visite(this); return r; }
    querySelectorAll(sel) {
        const tokens = sel.trim().split(/\s+/);
        return this._descendants().filter(e => {
            if (!e._correspond(tokens[tokens.length - 1])) return false;
            let i = tokens.length - 2;
            for (let a = e.parentNode; a && i >= 0; a = a.parentNode) if (a._correspond(tokens[i])) i--;
            return i < 0;
        });
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

function construireSection(numero, correctionType) {
    const section = new Element('section', ['question-section']);
    section.dataset.correctionType = correctionType;
    const titre = new Element('div', ['question-title']);
    const h3 = new Element('h3'); h3.textContent = `Question ${numero}`;
    titre.appendChild(h3);
    const texte = new Element('div', ['question-text']);
    texte.innerHTML = `<p>Énoncé numéro ${numero} : calculer la dérivée.</p>`;
    const hintContainer = new Element('div', ['hint-container']);
    hintContainer.style.display = 'none';
    const hint = new Element('div', ['hint-content']);
    hint.innerHTML = `Indication ${numero}`;
    hintContainer.appendChild(hint);
    section.appendChild(titre); section.appendChild(texte); section.appendChild(hintContainer);
    return section;
}

// ── Le monde : window, document, navigator, et le module ────────────────────
function creerMonde({ niveau = 'tous-temporaire', webdriver = false, simulation = false, formateur = false, ecritureAccepte = true, nbSections = 3 } = {}) {
    const racine = new Element('body');
    const entete = new Element('div');
    const nom = new Element('span', ['student-name']); nom.textContent = 'ESSAI Deux';
    const classe = new Element('span', ['student-class']); classe.textContent = 'TNSI';
    entete.appendChild(nom); entete.appendChild(classe); racine.appendChild(entete);
    const main = new Element('main', ['chapter-content']);
    for (let i = 1; i <= nbSections; i++) main.appendChild(construireSection(i, i === 2 ? 'manuel' : 'auto'));
    racine.appendChild(main);

    const document = new Element('document');
    document.appendChild(racine);
    document.hidden = false;
    document.createElement = (tag) => new Element(tag);

    const ecritures = [];
    const navigator = {
        webdriver,
        clipboard: {
            writeText(t) {
                ecritures.push(t);
                return ecritureAccepte ? Promise.resolve() : Promise.reject(new Error('NotAllowedError'));
            }
        }
    };

    const bac = {
        console, setTimeout, clearTimeout, Date, Promise, URLSearchParams,
        document, navigator,
        Simulation: { active: () => simulation },
        Parcours: { estVueFormateur: () => formateur },
        ChapterOrdre: { mode: () => 'blind' },
        currentChapterConfig: { antiIA: niveau },
        ANTI_COPY_MSG: '🔒 Contenu protégé — copier/coller désactivé sur ce chapitre.'
    };
    bac.window = bac;
    const fenetreEcoutes = {};
    bac.addEventListener = (type, fn) => { (fenetreEcoutes[type] ||= []).push(fn); };
    bac.dispatch = (type, ev = {}) => (fenetreEcoutes[type] || []).forEach(fn => fn(ev));
    vm.createContext(bac);
    const source = fs.readFileSync(path.join(__dirname, '../src/js/chapter/chapterAntiIA.js'), 'utf8');
    vm.runInContext(source, bac, { filename: 'chapterAntiIA.js' });

    const sections = document.querySelectorAll('.question-section');
    return { bac, document, sections, ecritures, A: bac.ChapterAntiIA, main };
}

const texteDe = (s) => s.querySelector('.question-text');
const fenetreDe = (s) => s.querySelector('.anti-ia-fenetre');
const voileDe = (s) => s.querySelector('.anti-ia-voile');

(async () => {
    // ── 1. Masquage, état privé ──
    {
        const m = creerMonde();
        ok(m.A.init() === true, 'init : des énoncés sont masqués');
        ok(m.sections.every(s => texteDe(s).innerHTML.includes('anti-ia-voile') && !texteDe(s).innerHTML.includes('dérivée')), 'les trois énoncés ont quitté la page');
        ok(m.sections.every(s => s.querySelector('h3').textContent === 'Question'), 'le numéro est retiré du titre');
        ok(m.sections.every(s => s.querySelector('.hint-content').innerHTML === '' && s.querySelector('.hint-content').dataset.antiIa === 'survol'), 'les indications aussi, la boîte dit « survol »');
        ok(m.A._contenus === undefined && !Object.keys(m.A).some(k => k.startsWith('_')), 'rien de privé sur window.ChapterAntiIA');
        ok(m.A.estMasquee(m.sections[0]) && !m.A.estMasquee(new Element('div')), 'estMasquee');
        ok(m.ecritures.length === 0, 'aucune écriture du presse-papiers au seul masquage');
    }

    // ── 2. Perte de focus sans aucun affichage : rien ──
    {
        const m = creerMonde();
        m.A.init();
        m.bac.dispatch('blur');
        ok(m.A.etat().captureSuspectee === false, 'blur sans énoncé affiché : pas de capture suspectée');
        m.bac.dispatch('focus');
        ok(m.ecritures.length === 0, 'retour de focus : aucune écriture');
    }

    // ── 3. Survol différé, fenêtre, presse-papiers, aria ──
    {
        const m = creerMonde();
        m.A.init();
        const s = m.sections[0], t = texteDe(s);
        t.dispatch('pointerenter', { pointerType: 'mouse' });
        ok(!fenetreDe(s) && m.A.etat().survolDiffere, 'pointerenter : rien tout de suite, ouverture différée');
        t.dispatch('pointerleave', { pointerType: 'mouse' });
        await dormir(m.A.DELAI_SURVOL_MS + 60);
        ok(!fenetreDe(s) && m.ecritures.length === 0, 'sortie avant le délai : jamais ouvert, presse-papiers intact');

        t.dispatch('pointerenter', { pointerType: 'mouse' });
        await dormir(m.A.DELAI_SURVOL_MS + 60);
        const f = fenetreDe(s);
        ok(f && f.innerHTML.includes('Énoncé numéro 1'), 'après le délai : la fenêtre porte l\'énoncé');
        ok(!f.innerHTML.includes('Indication'), 'indication fermée : absente de la fenêtre');
        ok(f.classList.contains('anti-ia-filigrane') && decodeURIComponent(f.style.backgroundImage).includes('ESSAI Deux · TNSI'), 'filigrane nom · classe');
        ok(voileDe(s).getAttribute('aria-describedby') === f.id && f.id.startsWith('anti-ia-fenetre-'), 'le voile désigne la fenêtre (aria-describedby)');
        ok(m.ecritures.length === 1 && m.ecritures[0] === m.bac.ANTI_COPY_MSG, 'affichage : presse-papiers écrasé par le message du blocage copier');
        ok(m.A.etat().enoncesAffiches && m.A.etat().pressePapiersEnAttente === false, 'écriture acceptée : rien en attente');

        t.dispatch('pointerleave', { pointerType: 'mouse' });
        ok(!fenetreDe(s) && voileDe(s).getAttribute('aria-describedby') === null, 'pointerleave : fenêtre fermée, aria retiré');

        // Toucher : immédiat (clic), fermé par un toucher ailleurs
        voileDe(s).dispatch('click');
        ok(!!fenetreDe(s), 'clic sur le voile : ouverture immédiate');
        m.document.dispatch('pointerdown', { target: m.sections[2] });
        ok(!fenetreDe(s), 'pointerdown hors de la question : fermée');
        ok(m.ecritures.length === 2, 'chaque affichage écrase le presse-papiers');
    }

    // ── 4. Écriture refusée (Firefox, Safari sans geste) : rejouée au prochain geste ──
    {
        const m = creerMonde({ ecritureAccepte: false });
        m.A.init();
        const s = m.sections[1];
        texteDe(s).dispatch('pointerenter', { pointerType: 'mouse' });
        await dormir(m.A.DELAI_SURVOL_MS + 60);
        await dormir(0);
        ok(m.ecritures.length === 1 && m.A.etat().pressePapiersEnAttente === true, 'écriture refusée : en attente');
        m.document.dispatch('keydown', { key: 'a', target: m.sections[2] });
        await dormir(0);
        ok(m.ecritures.length === 2, 'prochain geste : l\'écriture est rejouée');
    }

    // ── 5. Perte de focus pendant un affichage (Win+Shift+S) : écrasé au retour ──
    {
        const m = creerMonde();
        m.A.init();
        const s = m.sections[0];
        voileDe(s).dispatch('click');
        ok(m.ecritures.length === 1, 'affichage : une écriture');
        m.bac.dispatch('blur');
        ok(!fenetreDe(s) && m.A.etat().captureSuspectee === true, 'blur pendant l\'affichage : tout remasqué, capture suspectée');
        ok(m.ecritures.length === 1, 'pas d\'écriture au blur (la capture n\'y est pas encore)');
        m.bac.dispatch('focus');
        ok(m.ecritures.length === 2 && m.A.etat().captureSuspectee === false, 'retour du focus : presse-papiers écrasé');

        // Fenêtre fermée par pointerleave juste avant le blur (l'outil de capture fait sortir
        // le pointeur) : encore suspect dans la foulée.
        voileDe(s).dispatch('click');
        texteDe(s).dispatch('pointerleave', { pointerType: 'mouse' });
        m.bac.dispatch('blur');
        ok(m.A.etat().captureSuspectee === true, 'fermée juste avant le blur : encore suspect');
        m.document.hidden = true;
        m.document.dispatch('visibilitychange');
        m.bac.dispatch('focus');
        ok(m.ecritures.length === 4, 'retour : écrasé (3 affichages + 1 retour)');
    }

    // ── 6. Impr. écran, impression ──
    {
        const m = creerMonde();
        m.A.init();
        const s = m.sections[2];
        voileDe(s).dispatch('click');
        m.document.dispatch('keyup', { key: 'PrintScreen', code: 'PrintScreen', target: s });
        ok(!fenetreDe(s) && m.ecritures.length === 2, 'Impr. écran : remasqué, presse-papiers écrasé');
        voileDe(s).dispatch('click');
        m.bac.dispatch('beforeprint');
        ok(!fenetreDe(s), 'beforeprint : remasqué');
    }

    // ── 7. Persistant : en place ──
    {
        const m = creerMonde({ niveau: 'auto-persistant' });
        m.A.init();
        ok(m.A.estMasquee(m.sections[0]) && !m.A.estMasquee(m.sections[1]) && m.A.estMasquee(m.sections[2]), 'auto : la question manuelle n\'est pas visée');
        const s = m.sections[0];
        voileDe(s).dispatch('click');
        ok(texteDe(s).innerHTML.includes('Énoncé numéro 1') && texteDe(s).classList.contains('anti-ia-filigrane'), 'clic : affiché en place, sous filigrane');
        ok(s.querySelector('.hint-content').innerHTML === 'Indication 1', 'l\'indication revient avec lui');
        ok(m.ecritures.length === 1, 'affichage en place : presse-papiers écrasé');
        m.document.dispatch('focusin', { target: m.sections[2] });
        ok(texteDe(s).innerHTML.includes('anti-ia-voile') && s.querySelector('.hint-content').innerHTML === '', 'focus hors de la question : remasqué');
    }

    // ── 8. Simulation : masqué, jamais d'écriture ──
    {
        const m = creerMonde({ simulation: true });
        ok(m.A.init() === true, 'simulation : les énoncés sont masqués (le formateur voit ce que voit l\'élève)');
        voileDe(m.sections[0]).dispatch('click');
        ok(!!fenetreDe(m.sections[0]) && m.ecritures.length === 0, 'simulation : affiché, presse-papiers du formateur intact');
    }

    // ── 9. Vue formateur (avec session) : rien n'est masqué ──
    {
        const m = creerMonde({ formateur: true });
        ok(m.A.niveau() === null && m.A.init() === false, 'vue formateur : niveau null, rien de masqué');
        ok(m.sections.every(s => texteDe(s).innerHTML.includes('dérivée')), 'les énoncés sont restés en place');
    }

    // ── 10. Navigateur piloté ──
    {
        const m = creerMonde({ webdriver: true });
        ok(m.A.init() === true, 'automate : masqué');
        const s = m.sections[0];
        ok(voileDe(s).classList.contains('anti-ia-automate') && texteDe(s).innerHTML.includes('automate'), 'le voile dit « automate »');
        voileDe(s).dispatch('click');
        texteDe(s).dispatch('pointerenter', { pointerType: 'mouse' });
        await dormir(m.A.DELAI_SURVOL_MS + 60);
        m.A.reveler(s); m.A.ouvrirFenetre(s);
        ok(!fenetreDe(s) && !texteDe(s).innerHTML.includes('dérivée') && m.ecritures.length === 0, 'rien ne s\'affiche, même en appelant le module');
    }

    console.log(echecs ? echecs + ' FAIL' : 'tout est vert');
    process.exitCode = echecs ? 1 : 0;
})();
