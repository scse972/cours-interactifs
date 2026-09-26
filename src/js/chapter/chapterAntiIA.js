// ============================================================================
// CHAPTER ANTI-IA - Énoncés masqués jusqu'au clic
// ============================================================================
// Option « 🤖 Anti-IA », disponible dans les modes Examen, Blind et Millionnaire.
// Un agent intégré au navigateur, ou une capture d'écran confiée à une IA, lit d'un
// coup tout l'énoncé d'un chapitre. Ici l'intitulé d'une question n'est affiché que
// lorsque l'apprenant clique dessus, et il se remasque dès qu'il clique ailleurs.
//
// Quatre niveaux, réglés par le formateur (chapter_config.antiIA) :
//
//   tous-persistant   toutes les questions   remasquée hors de la QUESTION
//   tous-temporaire   toutes les questions   remasquée hors de l'INTITULÉ
//   auto-persistant   auto et semi           remasquée hors de la question
//   auto-temporaire   auto et semi           remasquée hors de l'intitulé
//
// Les blocs de cours ne sont jamais masqués.
//
// MASQUER, C'EST RETIRER DU DOM. Un agent lit la page, pas l'écran : un simple flou
// laisserait tout le texte à sa portée. L'intitulé et l'indication partent donc dans
// une WeakMap indexée par la section, et ne reviennent dans la page que révélés.
// Indexer par la section fait que l'ordre peut être retiré au sort (Millionnaire) ou
// la page découpée en étapes (pagination) sans que ce module ait à le savoir.
//
// Limites, dites aussi dans l'aide : les bonnes réponses (data-correct-answers) restent
// dans la page, cours.json est public, et une capture prise pendant qu'un énoncé est
// affiché le montre.
//
// Ni en vue formateur, ni dans les modales de correction : seule la page apprenant
// (simulation comprise) est concernée — y compris une copie rendue, dont la relecture
// reste masquée.
// ============================================================================

const ChapterAntiIA = {

    MODES: ['exam', 'blind', 'millionnaire'],

    NIVEAUX: {
        'tous-persistant': { portee: 'tous', remasque: 'question' },
        'tous-temporaire': { portee: 'tous', remasque: 'intitule' },
        'auto-persistant': { portee: 'auto', remasque: 'question' },
        'auto-temporaire': { portee: 'auto', remasque: 'intitule' }
    },

    // Ce qui, dans une question, fait partie de « l'intitulé » en niveau temporaire :
    // lire l'indication, c'est encore lire l'énoncé.
    ZONE_INTITULE: '.question-text, .hint-container, [data-hint-btn]',

    _contenus: new WeakMap(),
    _revelee: null,
    _niveau: null,
    _ecoutesBranchees: false,

    // ------------------------------------------------------------------------
    // DÉCISION
    // ------------------------------------------------------------------------

    estProposable() {
        const mode = window.ChapterOrdre?.mode?.() || 'normal';
        return this.MODES.includes(mode);
    },

    niveau() {
        if (new URLSearchParams(window.location.search).get('teacher_view') === 'true') return null;
        if (!this.estProposable()) return null;
        return this.NIVEAUX[window.currentChapterConfig?.antiIA] || null;
    },

    // ------------------------------------------------------------------------
    // MISE EN PLACE
    // ------------------------------------------------------------------------

    /** À appeler avant ChapterOrdre.reveler() : l'énoncé ne doit jamais s'afficher. */
    init() {
        this._niveau = this.niveau();
        if (!this._niveau) return false;

        const sections = [...document.querySelectorAll('.question-section')]
            .filter(section => this._estVisee(section));

        sections.forEach(section => this._retirer(section));
        this._brancherEcoutes();

        console.log(`[Anti-IA] ${sections.length} énoncé(s) masqué(s)`);
        return sections.length > 0;
    },

    _estVisee(section) {
        if (this._niveau.portee === 'tous') return true;
        return ['auto', 'semi'].includes(section.dataset.correctionType || 'auto');
    },

    /** Première fois : l'intitulé et l'indication quittent la page pour la WeakMap. */
    _retirer(section) {
        const texte = section.querySelector('.question-text');
        if (!texte || this._contenus.has(section)) return;

        const indication = section.querySelector('.hint-content');
        this._contenus.set(section, {
            texte: texte.innerHTML,
            indication: indication ? indication.innerHTML : null
        });
        this._voiler(section);
    },

    _voiler(section) {
        const texte = section.querySelector('.question-text');
        const indication = section.querySelector('.hint-content');
        const temporaire = this._niveau.remasque === 'intitule';

        texte.classList.add('anti-ia-masque');
        // Pas un <button> : le verrouillage au rendu désactive tous les boutons de la
        // page, ce qui rendrait l'énoncé illisible à la relecture.
        texte.innerHTML = `
            <div class="anti-ia-voile" role="button" tabindex="0"
                 aria-label="Afficher l'énoncé de la question">
                🙈 Énoncé masqué — cliquer pour l'afficher
                ${temporaire ? '<small>Il se masquera dès que vous cliquerez ailleurs.</small>' : ''}
            </div>`;
        if (indication) indication.innerHTML = '';

        const voile = texte.querySelector('.anti-ia-voile');
        voile.addEventListener('click', () => this.reveler(section));
        voile.addEventListener('keydown', (evenement) => {
            if (evenement.key === 'Enter' || evenement.key === ' ') {
                evenement.preventDefault();
                this.reveler(section);
            }
        });
    },

    // ------------------------------------------------------------------------
    // RÉVÉLER / REMASQUER
    // ------------------------------------------------------------------------

    reveler(section) {
        const contenu = this._contenus.get(section);
        if (!contenu) return;
        if (this._revelee && this._revelee !== section) this.masquer(this._revelee);

        const texte = section.querySelector('.question-text');
        const indication = section.querySelector('.hint-content');
        texte.innerHTML = contenu.texte;
        texte.classList.remove('anti-ia-masque');
        if (indication && contenu.indication !== null) indication.innerHTML = contenu.indication;

        this._revelee = section;
    },

    masquer(section) {
        if (!section || !this._contenus.has(section)) return;
        this._voiler(section);
        if (this._revelee === section) this._revelee = null;
    },

    masquerTout() {
        if (this._revelee) this.masquer(this._revelee);
    },

    /**
     * Posées une seule fois. Un clic ou un focus hors de la zone autorisée remasque ;
     * quitter la fenêtre ou l'onglet remasque tout (agent qui prend la main, outil de
     * capture qui vole le focus).
     */
    _brancherEcoutes() {
        if (this._ecoutesBranchees) return;
        this._ecoutesBranchees = true;

        const horsZone = (evenement) => {
            const section = this._revelee;
            if (!section) return;
            const cible = evenement.target;
            const dansQuestion = section.contains(cible);
            const dansIntitule = dansQuestion && !!cible.closest?.(this.ZONE_INTITULE);
            const garde = this._niveau.remasque === 'question' ? dansQuestion : dansIntitule;
            if (!garde) this.masquer(section);
        };

        document.addEventListener('pointerdown', horsZone, true);
        document.addEventListener('focusin', horsZone, true);
        window.addEventListener('blur', () => this.masquerTout());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.masquerTout();
        });
    }
};

window.ChapterAntiIA = ChapterAntiIA;
