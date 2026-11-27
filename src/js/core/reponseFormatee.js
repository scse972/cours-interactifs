// ============================================================================
// RÉPONSE FORMATÉE — une réponse « texte long » écrite en Markdown / HTML (27/11/2026)
// ============================================================================
// L'apprenant écrit sa réponse comme une cellule de texte Capytale (Markdown, HTML permis) et
// bascule, par la coche « Aperçu formaté », entre le texte qu'il tape et son rendu. La coche
// laissée mise est gardée avec la réponse (question.formatReponse = 'formate') : le formateur
// voit alors la réponse formatée, avec un repère qui rebascule au texte brut.
//
// RÈGLES (décisions de l'utilisateur, XSpro docs/etude-reponse-formatee.md) :
//   - `answer` reste TOUJOURS la source brute : l'IA, la longueur minimale, la retranscription de
//     la salle des copies et l'historique n'en savent rien ;
//   - le brut est le défaut partout : en NSI une balise est souvent la réponse elle-même ;
//   - la coche est offerte sur toutes les questions « texte long », Examen compris ;
//   - AUCUNE image (ni en ligne, ni data:) : traçage du lecteur, progressions trop lourdes.
//
// SÉCURITÉ. Le HTML vient de l'apprenant : il est rendu par marked puis NETTOYÉ par une liste
// blanche (balises, attributs, adresses), sur un document inerte (DOMParser : rien ne s'y exécute,
// rien ne s'y charge). Chaque lecteur refait le rendu à partir de la source brute : on ne transmet
// jamais du HTML déjà rendu. XPro (fenêtres avec Node) passe en plus par sanitize-html, avec les
// mêmes listes (formulaireProgressionApprenant.js).
//
// Utilisable dans le navigateur (window.ReponseFormatee) et sous Node (module.exports), où les
// fonctions qui touchent au DOM demandent un DOMParser en option.
// ============================================================================
(function (racine, fabrique) {
    const module_ = fabrique(racine);
    if (typeof module === 'object' && module.exports) module.exports = module_;
    if (racine && typeof racine === 'object') racine.ReponseFormatee = module_;
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (racine) {
    'use strict';

    const FORMATE = 'formate';

    // Gardées telles quelles (sans attribut, sauf ATTRIBUTS_PERMIS).
    const BALISES_PERMISES = [
        'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark', 'sub', 'sup', 'small',
        'code', 'pre', 'kbd', 'samp', 'var', 'blockquote', 'abbr', 'span', 'div',
        'ul', 'ol', 'li', 'dl', 'dt', 'dd',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
        'details', 'summary', 'a',
    ];

    const ATTRIBUTS_PERMIS = {
        a: ['href', 'title'],
        abbr: ['title'],
        code: ['class'],
        ol: ['start'],
        th: ['align', 'colspan', 'rowspan'],
        td: ['align', 'colspan', 'rowspan'],
    };

    // Retirées AVEC leur contenu : exécutable, chargement extérieur, formulaire, image, espaces de
    // noms (svg, math) où naissent les détournements du HTML. Une balise qui n'est ni permise ni
    // ici est « déballée » : son texte reste, la balise part.
    const BALISES_RETIREES = [
        'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'param',
        'svg', 'math', 'template', 'noscript', 'noembed', 'noframes', 'xmp', 'plaintext', 'listing',
        'form', 'textarea', 'select', 'option', 'optgroup', 'button', 'input', 'label', 'fieldset',
        'img', 'picture', 'source', 'video', 'audio', 'track', 'canvas', 'map', 'area',
        'link', 'meta', 'base', 'title', 'head', 'portal', 'dialog', 'slot', 'marquee',
    ];

    const CLASSE_CODE = /^language-[A-Za-z0-9_+-]{1,30}$/;
    const ADRESSE_PERMISE = /^(https?:|mailto:|#)/i;

    const TEXTES = {
        coche: 'Aperçu formaté',
        aideCoche: "Écris ta réponse en Markdown (comme une cellule de texte Capytale) ou en HTML, puis coche pour voir le rendu. " +
            'Décoche (ou double-clique sur le rendu) pour revenir au texte. Si tu laisses la coche, ton formateur lira ta réponse formatée.',
        repere: '✎ formaté',
        aideRepere: 'Réponse rédigée en Markdown / HTML, affichée formatée. Cliquer pour voir le texte brut.',
        repereBrut: '✎ texte brut',
        aideRepereBrut: 'Texte tel que l\'apprenant l\'a tapé. Cliquer pour revoir la réponse formatée.',
    };

    /** La réponse de cette question est-elle à montrer formatée ? */
    function estFormatee(question) {
        return !!question && question.formatReponse === FORMATE && typeof question.answer === 'string';
    }

    function echapper(texte) {
        return String(texte ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /** Markdown → HTML brut (non nettoyé). marked est window.marked (src/js/vendor/marked.umd.js). */
    function markdownVersHtml(source, marked) {
        const m = marked || racine?.marked;
        const parse = m && (typeof m.parse === 'function' ? m.parse : (typeof m.marked === 'function' ? m.marked : null));
        if (!parse) return null;
        try {
            return parse(String(source ?? ''), { gfm: true, breaks: true, async: false });
        } catch (e) {
            return null;
        }
    }

    function nettoyerElement(el, doc) {
        // Les enfants d'abord, sur une copie de la liste : on remplace et retire en marchant.
        [...el.childNodes].forEach(enfant => nettoyerNoeud(enfant, doc));
    }

    function nettoyerNoeud(noeud, doc) {
        if (noeud.nodeType === 3) return;                       // texte
        if (noeud.nodeType !== 1) { noeud.remove(); return; }   // commentaire, instruction…

        const balise = noeud.localName ? noeud.localName.toLowerCase() : '';

        // La case d'une liste de tâches (« - [ ] … », marked la rend en <input type=checkbox>) :
        // un caractère, pas un champ — un champ dans la question serait lu comme une réponse.
        if (balise === 'input' && String(noeud.getAttribute('type') || '').toLowerCase() === 'checkbox') {
            // marked laisse une espace après la case : on ne la double pas.
            const suivant = noeud.nextSibling;
            if (suivant && suivant.nodeType === 3) suivant.nodeValue = suivant.nodeValue.replace(/^\s+/, '');
            noeud.replaceWith(doc.createTextNode(noeud.hasAttribute('checked') ? '☑ ' : '☐ '));
            return;
        }
        if (BALISES_RETIREES.includes(balise) || noeud.namespaceURI && noeud.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
            noeud.remove();
            return;
        }
        if (!BALISES_PERMISES.includes(balise)) {
            nettoyerElement(noeud, doc);
            noeud.replaceWith(...noeud.childNodes);
            return;
        }

        const permis = ATTRIBUTS_PERMIS[balise] || [];
        [...noeud.attributes].forEach(attr => {
            const nom = attr.name.toLowerCase();
            const valeur = String(attr.value || '').trim();
            let garder = permis.includes(nom);
            if (garder && nom === 'href') garder = ADRESSE_PERMISE.test(valeur.replace(/[\u0000- ]/g, ''));
            if (garder && nom === 'class') garder = CLASSE_CODE.test(valeur);
            if (garder && (nom === 'colspan' || nom === 'rowspan' || nom === 'start')) garder = /^\d{1,3}$/.test(valeur);
            if (garder && nom === 'align') garder = /^(left|right|center)$/i.test(valeur);
            if (!garder) noeud.removeAttribute(attr.name);
        });
        if (balise === 'a' && noeud.hasAttribute('href') && !/^#/.test(noeud.getAttribute('href'))) {
            noeud.setAttribute('target', '_blank');
            noeud.setAttribute('rel', 'noopener noreferrer nofollow');
        }
        nettoyerElement(noeud, doc);
    }

    /**
     * HTML quelconque → HTML de la liste blanche. Le document est INERTE (DOMParser) : ni script,
     * ni chargement d'image pendant le nettoyage.
     * @param {string} html
     * @param {{ DOMParser?: Function }} [options] - sous Node, un DOMParser (jsdom, Electron…)
     */
    function nettoyer(html, options = {}) {
        const Analyseur = options.DOMParser || racine?.DOMParser;
        if (!Analyseur) throw new Error('ReponseFormatee.nettoyer : aucun DOMParser');
        const doc = new Analyseur().parseFromString(`<!doctype html><html><body>${String(html ?? '')}</body></html>`, 'text/html');
        nettoyerElement(doc.body, doc);
        return doc.body.innerHTML;
    }

    /** Source de l'apprenant → HTML nettoyé, prêt à insérer. Repli : le texte échappé, tel quel. */
    function rendre(source, options = {}) {
        const html = markdownVersHtml(source, options.marked);
        if (html === null) return `<div class="reponse-formatee-brut">${echapper(source)}</div>`;
        return nettoyer(html, options);
    }

    /**
     * Affichage d'une réponse dans une vue de LECTURE (formateur, copie corrigée) : le texte brut
     * échappé si l'apprenant n'a pas laissé la coche, sinon le rendu et un repère qui bascule.
     * @param {string} source - la réponse brute
     * @param {boolean} formatee
     */
    function afficherReponse(source, formatee, options = {}) {
        if (!formatee || typeof source !== 'string') return echapper(source);
        let rendu;
        // options.rendre : XPro passe le sien (double nettoyage, liens neutralisés).
        try { rendu = options.rendre ? options.rendre(source) : rendre(source, options); } catch (e) { return echapper(source); }
        return `<div class="reponse-formatee-lecture">`
            + `<button type="button" class="reponse-formatee-repere" title="${echapper(TEXTES.aideRepere)}" data-reponse-formatee-bascule>${echapper(TEXTES.repere)}</button>`
            + `<div class="reponse-formatee-rendu">${rendu}</div>`
            + `<div class="reponse-formatee-brut" hidden>${echapper(source)}</div>`
            + `</div>`;
    }

    // ------------------------------------------------------------------------
    // Navigateur : la bascule des vues de lecture, et la coche de l'apprenant
    // ------------------------------------------------------------------------

    function basculerLecture(bouton) {
        const bloc = bouton.closest('.reponse-formatee-lecture');
        if (!bloc) return;
        const rendu = bloc.querySelector('.reponse-formatee-rendu');
        const brut = bloc.querySelector('.reponse-formatee-brut');
        const versBrut = !rendu.hidden;
        rendu.hidden = versBrut;
        brut.hidden = !versBrut;
        bouton.textContent = versBrut ? TEXTES.repereBrut : TEXTES.repere;
        bouton.title = versBrut ? TEXTES.aideRepereBrut : TEXTES.aideRepere;
    }

    if (racine && racine.document && racine.document.addEventListener) {
        // Délégué une fois pour toutes : les vues de lecture insèrent leur HTML en chaîne.
        racine.document.addEventListener('click', (e) => {
            const bouton = e.target?.closest?.('[data-reponse-formatee-bascule]');
            if (!bouton) return;
            e.preventDefault();
            basculerLecture(bouton);
        });
    }

    function questionDeLaProgression(questionId) {
        const session = racine?.ChapterSession;
        return session?.progress?.chapters?.[session.chapterId]?.questions?.[questionId] || null;
    }

    /**
     * Pose la coche « Aperçu formaté » sous chaque zone « texte long » de la page du chapitre.
     * À appeler APRÈS la restauration des réponses (chapterUI.restoreAllAnswers). Sans effet sur
     * une question déjà équipée.
     * @param {{ lectureSeule?: boolean }} [options] - vue formateur : bascule d'affichage seulement
     */
    function equiperPage(options = {}) {
        const doc = racine?.document;
        if (!doc) return;
        doc.querySelectorAll('.question-section').forEach(section => {
            const champ = section.querySelector('.answer-area textarea');
            if (!champ || champ.dataset.reponseFormatee === '1') return;
            equiperChamp(section, champ, options);
        });
    }

    function equiperChamp(section, champ, options) {
        const doc = racine.document;
        const questionId = section.dataset.questionId || champ.id;
        champ.dataset.reponseFormatee = '1';

        // Une étiquette et non une case à cocher : la page lit TOUTE case cochée d'une question
        // comme une réponse de QCM (QuestionEngine.extract), et le verrouillage d'un chapitre
        // rendu désactive les input/button — l'affichage doit rester basculable.
        const coche = doc.createElement('span');
        coche.className = 'reponse-formatee-coche';
        coche.setAttribute('role', 'switch');
        coche.setAttribute('tabindex', '0');
        coche.title = TEXTES.aideCoche;

        const apercu = doc.createElement('div');
        apercu.className = 'reponse-formatee-apercu';
        apercu.hidden = true;
        apercu.title = 'Double-clic : revenir au texte';

        const barre = doc.createElement('div');
        barre.className = 'reponse-formatee-barre';
        barre.appendChild(coche);

        champ.insertAdjacentElement('afterend', apercu);
        apercu.insertAdjacentElement('afterend', barre);

        let formatee = false;
        const appliquer = (valeur) => {
            formatee = valeur;
            // style et non hidden : la feuille du chapitre pose display sur les textarea.
            champ.style.display = valeur ? 'none' : '';
            apercu.hidden = !valeur;
            if (valeur) {
                try { apercu.innerHTML = rendre(champ.value); } catch (e) { apercu.textContent = champ.value; }
            } else {
                apercu.innerHTML = '';
            }
            coche.setAttribute('aria-checked', valeur ? 'true' : 'false');
            coche.textContent = (valeur ? '☑ ' : '☐ ') + TEXTES.coche;
            section.classList.toggle('reponse-formatee-active', valeur);
        };

        const basculer = () => {
            const valeur = !formatee;
            appliquer(valeur);
            if (!valeur) champ.focus?.();
            // Gardée avec la réponse, sauf en lecture seule et sur un champ figé (rendu, verrou) :
            // le formateur doit voir ce que l'apprenant a rendu.
            if (options.lectureSeule || champ.disabled || champ.readOnly) return;
            racine.enregistrerFormatReponse?.(questionId, valeur);
        };

        coche.addEventListener('click', basculer);
        coche.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); basculer(); }
        });
        apercu.addEventListener('dblclick', () => { if (formatee) basculer(); });

        appliquer(questionDeLaProgression(questionId)?.formatReponse === FORMATE);
    }

    return {
        FORMATE, BALISES_PERMISES, ATTRIBUTS_PERMIS, BALISES_RETIREES, ADRESSE_PERMISE, CLASSE_CODE, TEXTES,
        estFormatee, echapper, markdownVersHtml, nettoyer, rendre, afficherReponse, equiperPage,
    };
}));
