// ============================================================================
// SUIVI ATELIER - Outil de validation en main propre (mode Atelier AR)
// ============================================================================
// Page formateur autonome, pensée pour un téléphone en atelier : on saisit le code
// de validation de l'apprenant, on voit son travail, on met des points et un mot,
// on obtient l'AR à lui dicter.
//
// ⚠️ RÈGLE D'ARCHITECTURE — cet outil parle au stockage et aux données du cours,
//    JAMAIS au tableau de bord. C'est cette indépendance, et elle seule, qui
//    permettra de l'emballer plus tard en application mobile. Ne pas y importer
//    correctionModal ni teacherDashboard.
//
// Voir "mode atelier AR.md" §3.3.
// ============================================================================

const SuiviAtelier = {

    MOT_DE_PASSE_DEFAUT: 'formateur2026',
    JETON_RECUPERATION: 'YXORP@97240',

    slug: null,
    formateur: 'Formateur',
    contexte: null,   // consigne en cours d'évaluation

    // ------------------------------------------------------------------------
    // AMORÇAGE
    // ------------------------------------------------------------------------

    async init() {
        this.slug = new URLSearchParams(window.location.search).get('parcours') || '';
        this._brancher();

        if (sessionStorage.getItem('teacher_authenticated') !== 'true') {
            return this._ecran('acces');
        }
        await this._chargerIdentite();

        if (!this.slug) return this._parcours();
        this._ecran('code');
    },

    _brancher() {
        document.getElementById('form-acces').addEventListener('submit', (e) => {
            e.preventDefault();
            this._connecter();
        });
        document.getElementById('form-code').addEventListener('submit', (e) => {
            e.preventDefault();
            this._chercherCode();
        });
        document.getElementById('lien-repli').addEventListener('click', () => this._repli());
        document.getElementById('form-eval').addEventListener('submit', (e) => {
            e.preventDefault();
            this._emettre();
        });
        document.querySelectorAll('[data-retour-code]').forEach(bouton => {
            bouton.addEventListener('click', () => this._ecran('code'));
        });
        document.getElementById('btn-deconnexion').addEventListener('click', () => {
            sessionStorage.removeItem('teacher_authenticated');
            window.location.reload();
        });
    },

    /** Affiche un seul écran à la fois — l'outil est une suite de gestes, pas un menu. */
    _ecran(nom) {
        document.querySelectorAll('.ecran').forEach(bloc => {
            bloc.hidden = bloc.dataset.ecran !== nom;
        });
        document.getElementById('barre-formateur').hidden = (nom === 'acces');
        if (nom === 'code') {
            const champ = document.getElementById('champ-code');
            champ.value = '';
            champ.focus();
        }
    },

    _message(id, texte, type = 'erreur') {
        const zone = document.getElementById(id);
        zone.textContent = texte || '';
        zone.className = `sa-message sa-message-${type}`;
    },

    // ------------------------------------------------------------------------
    // ACCÈS — même mécanisme que teacher-login.html, volontairement
    // ------------------------------------------------------------------------

    async _connecter() {
        const saisie = document.getElementById('champ-mdp').value.trim();

        if (saisie === this.JETON_RECUPERATION) {
            return this._accesAccorde('Admin');
        }

        let motDePasseEnregistre = null;
        try { motDePasseEnregistre = await storage.get('teacher_password'); } catch (_) {}

        if (motDePasseEnregistre && saisie === motDePasseEnregistre) return this._accesAccorde();
        if (!motDePasseEnregistre && saisie === this.MOT_DE_PASSE_DEFAUT) return this._accesAccorde();

        this._message('msg-acces', 'Mot de passe incorrect.');
        document.getElementById('champ-mdp').value = '';
    },

    async _accesAccorde(nom) {
        sessionStorage.setItem('teacher_authenticated', 'true');
        if (nom) sessionStorage.setItem('teacher_name', nom);
        await this._chargerIdentite();
        if (!this.slug) return this._parcours();
        this._ecran('code');
    },

    /**
     * Le nom du formateur est affiché en permanence : cet outil tournera sur des
     * appareils partagés, et c'est lui qui signera les AR émis.
     */
    async _chargerIdentite() {
        let nom = sessionStorage.getItem('teacher_name');
        if (!nom) {
            try { nom = await storage.get('teacher_name'); } catch (_) {}
        }
        this.formateur = nom || 'Formateur';
        document.getElementById('nom-formateur').textContent = this.formateur;
        document.getElementById('nom-parcours').textContent = this.slug || '—';
    },

    // ------------------------------------------------------------------------
    // CHOIX DU PARCOURS — une fois par session
    // ------------------------------------------------------------------------

    async _parcours() {
        this._ecran('parcours');
        const liste = document.getElementById('liste-parcours');
        liste.innerHTML = '<p>Chargement…</p>';

        const donnees = await staticJson.get('/parcours/cours.json');
        const parcours = (donnees && Array.isArray(donnees.parcours)) ? donnees.parcours : [];

        if (!parcours.length) {
            liste.innerHTML = '<p class="sa-message sa-message-erreur">Aucun parcours publié.</p>';
            return;
        }

        liste.innerHTML = '';
        parcours.forEach(p => {
            const bouton = document.createElement('button');
            bouton.type = 'button';
            bouton.className = 'sa-choix';
            bouton.textContent = p.label || p.slug;
            bouton.addEventListener('click', () => {
                window.location.search = `?parcours=${encodeURIComponent(p.slug)}`;
            });
            liste.appendChild(bouton);
        });
    },

    // ------------------------------------------------------------------------
    // RÉSOLUTION DU CODE
    // ------------------------------------------------------------------------

    async _chercherCode() {
        const code = AtelierCodes.normaliser(document.getElementById('champ-code').value);

        if (code.length !== AtelierCodes.LONGUEUR_CODE_VALIDATION) {
            return this._message('msg-code', `Un code de validation compte ${AtelierCodes.LONGUEUR_CODE_VALIDATION} caractères.`);
        }

        this._message('msg-code', 'Recherche…', 'attente');
        const ticket = await storage.get(AtelierCodes.cleCodeValidation(this.slug, code));

        if (!ticket) {
            return this._message('msg-code',
                'Code inconnu pour ce parcours. Si le réseau vient de tomber, passez par la liste des apprenants.');
        }

        this._message('msg-code', '');
        await this._ouvrir(ticket.token, ticket.chapitreId, ticket.questionId, code);
    },

    /**
     * Repli quand le code ne résout pas — typiquement une coupure réseau : la clé du
     * ticket a été écrite quelques secondes plus tôt sur l'appareil de l'apprenant.
     * On perd le raccourci, pas l'échange.
     */
    async _repli() {
        this._ecran('repli');
        const liste = document.getElementById('liste-apprenants');
        liste.innerHTML = '<p>Chargement…</p>';

        const apprenants = (await storage.get(`${this.slug}:teacher:users_list`) || [])
            .filter(u => u.type !== 'teacher');

        if (!apprenants.length) {
            liste.innerHTML = '<p class="sa-message sa-message-erreur">Aucun apprenant dans ce parcours.</p>';
            return;
        }

        liste.innerHTML = '';
        apprenants.forEach(apprenant => {
            const bouton = document.createElement('button');
            bouton.type = 'button';
            bouton.className = 'sa-choix';
            bouton.innerHTML = `${apprenant.name || apprenant.id} <small>${apprenant.class || ''}</small>`;
            bouton.addEventListener('click', () => this._consignesEnAttente(apprenant.id));
            liste.appendChild(bouton);
        });
    },

    /** Liste les consignes qu'un apprenant a déclarées prêtes et qui attendent un AR. */
    async _consignesEnAttente(token) {
        const liste = document.getElementById('liste-apprenants');
        liste.innerHTML = '<p>Chargement…</p>';

        const attentes = await this._attentes(token);

        if (!attentes.length) {
            liste.innerHTML = `<p class="sa-message sa-message-attente">Aucune consigne en attente pour cet apprenant.</p>`;
            return;
        }

        liste.innerHTML = '';
        attentes.forEach(attente => {
            const bouton = document.createElement('button');
            bouton.type = 'button';
            bouton.className = 'sa-choix';
            bouton.innerHTML = `${attente.titreChapitre} <small>${attente.question.title}</small>`;
            bouton.addEventListener('click', () =>
                this._ouvrir(token, attente.chapitreId, attente.question.id, attente.donnees.codeValidation));
            liste.appendChild(bouton);
        });
    },

    async _attentes(token) {
        const progression = await storage.get(this._cleProgression(token));
        const donneesCours = await staticJson.get('/parcours/cours.json');
        const parcours = donneesCours?.parcours?.find(p => p.slug === this.slug);
        const attentes = [];

        Object.entries(progression?.chapters || {}).forEach(([chapitreId, chapitre]) => {
            const configChapitre = parcours?.chapitres?.find(c => String(c.id) === String(chapitreId));
            Object.entries(chapitre.questions || {}).forEach(([questionId, donnees]) => {
                if (!donnees?.codeValidation || donnees.arSaisiAt) return;
                const question = configChapitre?.questions?.find(q => q.id === questionId);
                if (!question) return;
                attentes.push({
                    chapitreId,
                    titreChapitre: configChapitre?.title || `Chapitre ${chapitreId}`,
                    question,
                    donnees
                });
            });
        });

        return attentes;
    },

    _cleProgression(token) {
        return `${this.slug}:${token}:student_${token}_progress`;
    },

    // ------------------------------------------------------------------------
    // ÉVALUATION
    // ------------------------------------------------------------------------

    async _ouvrir(token, chapitreId, questionId, code) {
        const progression = await storage.get(this._cleProgression(token));
        if (!progression) return this._message('msg-code', 'Progression de cet apprenant introuvable.');

        const donneesCours = await staticJson.get('/parcours/cours.json');
        const parcours = donneesCours?.parcours?.find(p => p.slug === this.slug);
        const chapitre = parcours?.chapitres?.find(c => String(c.id) === String(chapitreId));
        const question = chapitre?.questions?.find(q => q.id === questionId);
        if (!question) return this._message('msg-code', 'Consigne introuvable dans ce parcours.');

        const apprenants = await storage.get(`${this.slug}:teacher:users_list`) || [];
        const apprenant = apprenants.find(u => u.id === token);
        const donnees = progression.chapters?.[chapitreId]?.questions?.[questionId] || {};

        this.contexte = { token, chapitreId, questionId, question, code, donnees };

        document.getElementById('eval-apprenant').textContent =
            `${apprenant?.name || token}${apprenant?.class ? ' · ' + apprenant.class : ''}`;
        document.getElementById('eval-chapitre').textContent = chapitre?.title || '';
        document.getElementById('eval-consigne').innerHTML = question.questionTextHtml || question.questionText || '';

        const criteres = document.getElementById('eval-criteres');
        criteres.innerHTML = question.hintHtml || '';
        criteres.hidden = !question.hintHtml;

        document.getElementById('eval-compte-rendu').textContent =
            donnees.answer || '— aucun compte rendu enregistré —';
        document.getElementById('eval-positionnement').textContent =
            this._libelleNiveau(donnees.autoPositionnement);

        const points = document.getElementById('champ-points');
        points.max = question.points;
        points.value = donnees.arPoints ?? question.points;
        document.getElementById('eval-bareme').textContent = `sur ${this._nombre(question.points)}`;
        document.getElementById('champ-appreciation').value = donnees.arAppreciation || '';

        // Réévaluation : le précédent AR cessera de fonctionner dès que le nouveau sera émis.
        const avis = document.getElementById('eval-deja');
        avis.hidden = !donnees.arHash;
        if (donnees.arHash) {
            avis.textContent = donnees.arSaisiAt
                ? 'Cette consigne a déjà été validée par l\'apprenant. Émettre un nouvel AR remplacera les points.'
                : 'Un AR a déjà été émis et n\'a pas encore été saisi. En émettre un nouveau annulera le précédent.';
        }

        this._message('msg-eval', '');
        this._ecran('eval');
        await this._autresAttentes(token, questionId);
    },

    /** Un seul passage doit suffire : on montre les autres consignes prêtes du même apprenant. */
    async _autresAttentes(token, questionIdCourante) {
        const zone = document.getElementById('eval-autres');
        const attentes = (await this._attentes(token)).filter(a => a.question.id !== questionIdCourante);

        if (!attentes.length) {
            zone.hidden = true;
            return;
        }

        zone.hidden = false;
        zone.innerHTML = `<div class="sa-sous-titre">Autres consignes prêtes pour cet apprenant</div>`;
        attentes.forEach(attente => {
            const bouton = document.createElement('button');
            bouton.type = 'button';
            bouton.className = 'sa-choix sa-choix-discret';
            bouton.innerHTML = `${attente.titreChapitre} <small>${attente.question.title}</small>`;
            bouton.addEventListener('click', () =>
                this._ouvrir(token, attente.chapitreId, attente.question.id, attente.donnees.codeValidation));
            zone.appendChild(bouton);
        });
    },

    // ------------------------------------------------------------------------
    // ÉMISSION DE L'AR
    // ------------------------------------------------------------------------

    /**
     * L'outil n'écrit PAS teacherScore : il dépose les points dans des champs
     * d'attente (arPoints / arAppreciation). C'est la saisie de l'AR par l'apprenant
     * qui les promeut dans le calcul. Sans ce geste, les points ne comptent nulle
     * part — c'est ce qui rend l'échange obligatoire sans masquer quoi que ce soit.
     */
    async _emettre() {
        if (!this.contexte) return;
        const { token, chapitreId, questionId, question } = this.contexte;

        const points = Number(document.getElementById('champ-points').value);
        if (Number.isNaN(points) || points < 0 || points > question.points) {
            return this._message('msg-eval', `Les points doivent être compris entre 0 et ${this._nombre(question.points)}.`);
        }
        if (points > AtelierCodes.POINTS_MAX) {
            return this._message('msg-eval', `Le format d'AR ne porte que ${AtelierCodes.POINTS_MAX} points au maximum.`);
        }

        this._message('msg-eval', 'Émission…', 'attente');

        // Relecture juste avant écriture : la progression s'enregistre en objet entier,
        // on réduit la fenêtre pendant laquelle l'appareil de l'apprenant pourrait écrire.
        const cle = this._cleProgression(token);
        const progression = await storage.get(cle);
        const donnees = progression?.chapters?.[chapitreId]?.questions?.[questionId];
        if (!donnees) return this._message('msg-eval', 'Progression introuvable — réessayez.');

        const ar = AtelierCodes.genererAR(points);
        const maintenant = new Date().toISOString();

        donnees.arPoints = points;
        donnees.arAppreciation = document.getElementById('champ-appreciation').value.trim();
        donnees.arHash = await AtelierCodes.condensat(ar);
        donnees.arEmisAt = maintenant;
        donnees.arEmisPar = this.formateur;
        donnees.arSaisiAt = null;   // un nouvel AR annule la saisie précédente

        await storage.set(cle, progression);

        // L'AR en clair, pour les surfaces formateur : réémission d'un AR perdu,
        // et vérification d'un code recopié sur un carnet des mois plus tard.
        await storage.set(AtelierCodes.cleAR(this.slug, token, chapitreId, questionId), {
            ar, points, emisAt: maintenant, emisPar: this.formateur
        });

        document.getElementById('ar-code').textContent = AtelierCodes.formater(ar);
        document.getElementById('ar-points').textContent =
            `${this._nombre(points)} / ${this._nombre(question.points)}`;
        this._ecran('ar');
    },

    // ------------------------------------------------------------------------
    // OUTILS
    // ------------------------------------------------------------------------

    _libelleNiveau(cle) {
        const niveaux = {
            non_acquis: '🔴 Pas encore acquis',
            en_cours: '🟠 En cours d\'acquisition',
            acquis: '🟢 Acquis'
        };
        return niveaux[cle] || 'non précisé';
    },

    _nombre(valeur) {
        return Number(valeur || 0).toLocaleString('fr-FR');
    }
};

window.SuiviAtelier = SuiviAtelier;
document.addEventListener('DOMContentLoaded', () => SuiviAtelier.init());
