/**
 * aide.js — Les fiches d'aide du formateur
 * ============================================================================
 *
 * CE MODULE EST LA VERSION RÉDIGÉE DES RÈGLES DE BARÈME ET DE NOTATION.
 *
 * Ces règles vivent dans le code, réparties entre `core/bareme.js`,
 * `chapter/chapterBilan.js`, `correctionModal.js` et `core/getExamContext.js`. Pour les
 * comprendre il fallait jusqu'ici lire quatre implémentations et deviner laquelle fait
 * foi. Chaque fiche ci-dessous énonce une règle en français, et nomme le code qui
 * l'applique ; réciproquement, ces fonctions renvoient ici. C'est ce double renvoi qui
 * rend l'ensemble relisable — par un formateur comme par qui découvrirait ce dépôt.
 *
 * Si une règle change dans le code, la fiche correspondante doit changer avec elle.
 * Une aide qui ment est pire que pas d'aide.
 *
 * Usage dans un template : `${Aide.icone('bareme')}`, et l'icône se branche seule.
 *
 * Le module est AUTONOME : il porte son propre style et ne dépend d'aucune feuille. Il
 * peut donc être posé aussi bien dans le tableau de bord que dans `suiviAtelier.html`,
 * qui a sa propre mise en page mobile et n'a rien à faire de `teacher.css`.
 */

(function () {
    'use strict';

    const FICHES = {

        // Appliquée par : core/bareme.js (pointsAuto) et le plancher du cumul, posé par
        // chapterBilan (autoMin/autoMax), correctionModal (calculateDetailedScore) et
        // showBlindBilan.
        bareme: {
            titre: '⭐ Comment les points sont comptés',
            html: `
<h4>La pénalité d'essais</h4>
<p>Elle existe pour <strong>dissuader la réponse au hasard</strong>. Sans elle, un apprenant qui
coche n'importe quoi et réessaie finit par tomber juste, et repart avec des points qu'il n'a pas
gagnés.</p>
<p>Une bonne réponse du premier coup rapporte tout le barème. Chaque tentative ratée retire une
part de ce barème, <strong>d'autant plus grande qu'il y avait peu de choix</strong> : deviner entre
deux réponses est facile, deviner entre cinq ne l'est pas.</p>
<table class="aide-table">
  <tr><th>Choix proposés</th><th>Retiré par tentative ratée</th><th>Sur une question à 5 points</th></tr>
  <tr><td>2 (vrai / faux)</td><td>2 × le barème</td><td>+5, −5, −10</td></tr>
  <tr><td>3</td><td>le barème</td><td>+5, 0, −5, −10</td></tr>
  <tr><td>4</td><td>⅔ du barème</td><td>+5, +1,67, −1,67, −5</td></tr>
  <tr><td>5</td><td>½ du barème</td><td>+5, +2,5, 0, −2,5, −5</td></tr>
</table>
<p>Ce réglage fait qu'un apprenant qui répond <strong>entièrement au hasard obtient zéro en
moyenne</strong>, quel que soit le nombre de choix. Sans lui, un QCM vrai/faux lui rapporterait la
moitié des points sans qu'il ait rien appris.</p>
<p><strong>Oui, une question peut valoir des points négatifs</strong> : c'est le prix de
l'insistance sans réflexion. Le plancher est fixé à deux fois le barème de la question.</p>

<h4>Le garde-fou</h4>
<p><strong>Le total des questions auto-corrigées ne descend jamais sous zéro.</strong> Un mauvais
résultat sur les QCM ne vient donc pas manger les points gagnés ailleurs, sur les questions
ouvertes par exemple. Quand ce plancher joue, le bilan de l'apprenant le lui dit.</p>
<p>Les questions à texte court ou ouvertes n'ont pas de choix à deviner : elles gardent le réglage
à trois choix, et on n'y répond pas au hasard de toute façon.</p>

<h4>La pénalité de cours</h4>
<p>Si un cours <em>obligatoire</em> n'a pas été validé, <strong>2 points sont retirés de la note
sur 20</strong> — pas des points de questions. C'est une valeur automatique : au moment de
corriger, vous pouvez la remplacer par ce que vous voulez, y compris un bonus.</p>

<h4>Ce que votre apprenant voit</h4>
<p>En tête de chapitre, <strong>⭐ Points obtenus</strong> affiche les points réellement acquis sur
les exercices auto-corrigés, pénalités comprises — <strong>le même nombre que dans son bilan</strong>.
À côté, <strong>🎯 Précision</strong> est une échelle de qualité centrée sur 50 %, pas un nombre de
points : les deux ne se lisent pas de la même façon.</p>
<p>Tant que sa copie n'est pas corrigée, son bilan lui montre une <strong>fourchette</strong> :
la note qu'il aurait si tout ce qui reste tournait au pire, et celle qu'il aurait si tout tournait
au mieux. Chaque question qu'il répond, et chaque question que vous corrigez, resserre cette
fourchette. Quand tout est corrigé, les deux bornes se rejoignent : c'est sa note.</p>
<p>La fourchette tient compte de la pénalité automatique de cours, mais <strong>jamais du bonus ou
du malus que vous ajoutez vous-même</strong>. Ce que l'apprenant peut déduire reste donc une note
théorique — votre geste vous appartient, et ne lui est annoncé qu'à la validation.</p>
`
        },

        // Appliquée par : core/getExamContext.js (résolution du mode et gel au premier
        // démarrage), chapter/chapterOrdre.js et chapter/chapterPagination.js. Le rendu
        // Blind : chapter/chapterBilan.js (showBlindBilan) et chapter/chapterSubmission.js
        // (_finalizeBlindSubmission, _resetBlindAttempt).
        modes: {
            titre: '🎛️ Les modes de chapitre et leurs options',
            html: `
<p>Le mode règle la <strong>diffusion</strong>, pas le contenu : un même chapitre peut se jouer
différemment d'une classe à l'autre, et se changer sans republier le parcours.</p>
<table class="aide-table">
  <tr><th>Mode</th><th>Principe</th></tr>
  <tr><td>📖 Découverte</td><td>Retour immédiat, l'apprenant peut réessayer.</td></tr>
  <tr><td>📝 Examen</td><td>Aucun retour, enregistrement en continu, tout se verrouille au rendu.</td></tr>
  <tr><td>🥽 Blind</td><td>Aucun retour. Au rendu, l'apprenant voit sa note sans savoir où il s'est trompé, puis valide ou recommence (voir plus bas).</td></tr>
  <tr><td>💰 Millionnaire</td><td>Une réponse fausse propose de recommencer (questions auto remises à zéro, manuelles conservées) ou de rendre. Pas de reprise : revenir sur le chapitre repart d'une tentative neuve.</td></tr>
  <tr><td>🧾 Atelier AR</td><td>Les questions ouvertes se valident en main propre, par échange de codes dans l'application.</td></tr>
  <tr><td>📋 Consigne</td><td>Travail sur papier, feuille nominative à QRCodes. L'application reste consultable comme en Découverte ; vous corrigez même sans rendu.</td></tr>
</table>
<p><strong>Le mode est figé au premier démarrage de chaque apprenant.</strong> Le changer ensuite
ne touche que ceux qui n'ont pas commencé.</p>

<h4>🥽 Le rendu en Blind</h4>
<p>Pendant le travail, comme en Examen : ni « Vérifier », ni juste / faux. Mais « Rendre »
n'envoie pas la copie : il ouvre un bilan qui donne <strong>la note sur 20, sans dire quelles
questions sont fausses</strong> — ou une <strong>fourchette</strong> s'il reste des réponses
rédigées à corriger (de « vous n'accordez rien » à « vous accordez tout »).</p>
<table class="aide-table">
  <tr><th>Bouton</th><th>Effet</th></tr>
  <tr><td>✅ Valider définitivement</td><td>La copie vous est rendue et se verrouille, comme en Examen.</td></tr>
  <tr><td>🔄 Recommencer</td><td>Les réponses auto et semi-automatiques sont effacées, les manuelles conservées. Il corrige, puis rend de nouveau.</td></tr>
</table>
<p><strong>Tentatives illimitées</strong> tant qu'il n'a pas validé — sa copie n'est rendue
qu'à ce moment. Il sait combien de points il perd, pas où : à lui de se relire.
Une erreur vaut 0, jamais de points négatifs, et la pénalité de cours n'entre pas dans ce bilan.</p>

<h4>🖨️ Feuille de consignes (mode Consigne)</h4>
<p>Le bouton <strong>« 🖨️ Feuille de consignes »</strong> de la carte imprime, par apprenant,
les énoncés, la place pour écrire et un QRCode par question, à scanner depuis
« ✍️ Correction en salle ». Chaque QRCode ne vaut que pour son apprenant, dont le nom est écrit
en vertical à côté : on sait à qui est une feuille ramassée, et on dissuade les échanges.</p>
<ul>
  <li><strong>Imprimer ouvre le suivi de correction</strong> des apprenants qui n'ont pas ouvert
      le chapitre. Sans cela, une copie faite sur papier n'apparaîtrait ni dans
      « 📬 Rendus à corriger » ni dans XSpro.</li>
  <li><strong>Les QRCodes sont optionnels</strong> (case cochée par défaut). Sans eux, la feuille
      ne porte que les énoncés, et vous corrigez depuis « 📬 Rendus à corriger » ou XSpro.
      La page de garde reste nominative, le suivi s'ouvre pareil.</li>
  <li>⚠️ <strong>QRCodes = site publié, en HTTPS.</strong> Leur empreinte est calculée par
      <code>crypto.subtle</code>, absent en <code>http://192.168.…</code> : la case y est
      verrouillée et seuls les énoncés s'impriment. Même contrainte que le scan
      (fiche « 📱 Installer et utiliser en salle »).</li>
</ul>

<h4>🎲 Ordre aléatoire</h4>
<p>Examen, Blind et Millionnaire (coché d'office), sur les chapitres <strong>entièrement
auto-corrigés</strong> seulement. Les questions répondues restent en tête, dans leur ordre ; les
autres sont retirées au sort à chaque affichage. Les cours ne bougent pas, et vos vues gardent
l'ordre publié.</p>

<h4>📄 Question par question</h4>
<p>Examen, Blind et Millionnaire. Un écran par élément, cours compris, navigation libre. On s'ouvre
sur la première étape non faite ; la pagination disparaît une fois la copie rendue. En
Millionnaire, « Recommencer » repart de la première question, dans le nouvel ordre.</p>

<h4>🤖 Anti-IA</h4>
<p>Examen, Blind et Millionnaire. Les énoncés sont masqués : l'apprenant clique dessus pour les
lire, et ils se remasquent dès qu'il clique ailleurs ou quitte la fenêtre. Contre les agents IA
intégrés au navigateur et les captures d'écran. Les cours ne sont jamais masqués.</p>
<table class="aide-table">
  <tr><th>Niveau</th><th>Masque</th><th>Se remasque au clic…</th></tr>
  <tr><td>Intitulés persistants</td><td>toutes les questions</td><td>hors de la question</td></tr>
  <tr><td>Intitulés temporaires</td><td>toutes les questions</td><td>hors de l'intitulé, réponse comprise</td></tr>
  <tr><td>Auto-corrigés persistants</td><td>questions auto et semi</td><td>hors de la question</td></tr>
  <tr><td>Auto-corrigés temporaires</td><td>questions auto et semi</td><td>hors de l'intitulé, réponse comprise</td></tr>
</table>
<p>Un énoncé masqué est <strong>retiré de la page</strong>, pas seulement flouté : un agent ne
peut pas le lire. Limites : une capture prise pendant qu'un énoncé est affiché le montre, et les
bonnes réponses restent présentes dans le code de la page.</p>
`
        },

        // Appliquée par : correctionModal.js (calculateDetailedScore, calculateNoteSur20,
        // applyScoreToChapter).
        notation: {
            titre: '📝 Comment la note sur 20 se construit',
            html: `
<ol>
  <li>Les questions <strong>auto-corrigées</strong> sont additionnées, pénalités d'essais comprises.
      Le total est ramené à 0 s'il est négatif.</li>
  <li>Les questions <strong>manuelles et semi-automatiques</strong> sont additionnées à part, avec
      les notes que vous attribuez. Même garde-fou.</li>
  <li>La somme des deux est rapportée au barème total du chapitre, puis mise sur 20.</li>
  <li><strong>Enfin seulement</strong>, le bonus ou le malus est ajouté — sur la note, pas sur les
      points — et le résultat est ramené entre 0 et 20.</li>
</ol>
<p>Une question manuelle que vous n'avez pas corrigée compte pour <strong>zéro</strong>, exactement
comme une question ratée. Les cases « traité » sont là pour que vous n'en oubliiez aucune.</p>

<h4>Le score système</h4>
<p>Sur une question auto-corrigée, la note pré-remplie est une <strong>proposition</strong> : le
barème moins les pénalités d'essais. Dès que vous la retouchez, c'est votre valeur qui compte et la
pénalité d'essais disparaît. C'est voulu — mais sachez que vous perdez alors la trace du nombre de
tentatives dans la note.</p>
`
        },

        // Appliquée par : atelier/suiviAtelier.js (_emettre et _enregistrerDirect) et
        // atelier/atelierQuestion.js (les quatre états de consigne).
        correctionEnSalle: {
            titre: '✍️ Les deux façons de corriger ici',
            html: `
<h4>Valider et générer l'AR</h4>
<p>Réservé aux consignes d'un chapitre joué en <strong>Atelier AR</strong>. Vous n'inscrivez pas
directement des points : vous produisez un accusé de réception que l'apprenant doit saisir chez lui
pour que les points comptent.</p>
<p><strong>Cette lenteur est le dispositif</strong>, pas son coût d'usage. Elle oblige à l'échange
en présence. Ne cherchez pas à la contourner : c'est exactement ce que le mode Atelier est censé
produire.</p>

<h4>Enregistrer la correction</h4>
<p>Disponible partout. La note et l'appréciation sont écrites tout de suite, exactement comme
depuis le tableau de bord après le rendu d'une copie. Pas d'accusé de réception : ce qui est écrit
compte immédiatement dans les totaux.</p>

<h4>Ce que l'apprenant voit</h4>
<p><strong>Rien ne s'affiche sous ses yeux au moment où vous corrigez.</strong> Rien n'est poussé,
sa page ne se rafraîchit pas.</p>
<ul>
  <li>Hors mode Atelier : il ne verra sa note qu'à la <strong>validation du chapitre</strong>. En
      attendant, seule la fourchette de son bilan se resserre.</li>
  <li>En mode Atelier : à son prochain chargement, la consigne affichera « corrigée » avec les
      points — ce mode promet un retour immédiat, on le tient.</li>
</ul>
`
        },

        // Appliquée par : sw.js (le service worker), mobile/manifest.webmanifest, et
        // atelier/suiviAtelier.js (_cameraDisponible, _couperCamera). Documentation
        // complète : mobile/CLAUDE.md.
        applicationTelephone: {
            titre: '📱 Installer et utiliser en salle',
            html: `
<h4>Installer l'outil sur le téléphone</h4>
<p>Ouvrez cette page dans le navigateur du téléphone, <strong>à l'adresse publiée</strong>. Sur
Android, Chrome propose « Installer l'application » ; à défaut, le menu du navigateur le propose.
Sur iPhone, il n'y a jamais de proposition : passez par <strong>Partager → Sur l'écran
d'accueil</strong>.</p>
<p>Une icône apparaît alors sur l'écran d'accueil, et l'outil s'ouvre en plein écran sans barre
d'adresse. C'est la même page : rien ne vient d'un magasin d'applications.</p>

<h4>⚠️ Le scan du QRCode exige la base distante</h4>
<p><strong>Le scan ne fonctionne que depuis le site publié</strong>, en HTTPS. Ni depuis une adresse
locale du réseau (<code>http://192.168…</code>), ni dans XSpro.</p>
<p>Et ce n'est pas la caméra qui est en cause, ou pas seulement. Le QRCode ne porte pas l'identité
de l'apprenant en clair, mais une <strong>empreinte chiffrée</strong> ; la fonction qui permet de
la recalculer n'existe pas dans un navigateur servi sans HTTPS. Scanner avec l'application photo du
téléphone puis coller le contenu échoue donc exactement au même endroit.</p>
<p>Sur une adresse locale il vous reste le <strong>code de validation dicté</strong> et la
<strong>navigation par liste</strong>, qui ne calculent aucune empreinte. L'AR, lui, exige aussi
l'adresse publiée.</p>

<h4>Quand le réseau tombe</h4>
<p>L'outil continue de s'ouvrir et de fonctionner : ses fichiers sont gardés sur le téléphone. Les
corrections que vous saisissez sont <strong>mises en attente et repartent toutes seules</strong>
dès que le réseau revient — un bandeau indique combien attendent.</p>
<p><strong>Ouvrez l'application une fois en ligne en début de séance.</strong> La liste des
apprenants doit avoir été lue au moins une fois pour qu'un QRCode puisse être rattaché à quelqu'un ;
sans cela, hors ligne, le scan ne trouvera personne.</p>

<h4>La caméra</h4>
<p>Elle s'éteint dès que vous quittez l'écran de scan, <strong>et dès que vous passez l'application
en arrière-plan</strong>. Au retour, il faut ré-appuyer sur « Démarrer la caméra » : un voyant qui
reste allumé dans une salle de classe est un problème en soi.</p>
<p>Visez le QRCode <strong>agrandi</strong> — un clic sur la vignette du bandeau de l'apprenant
l'ouvre en grand. La vignette elle-même est trop petite pour être lue, c'est voulu.</p>

<h4>Sur iPhone, une réserve</h4>
<p>L'application installée a un <strong>stockage propre, séparé de Safari</strong> : vous devrez
vous y reconnecter, et des corrections en attente dans Safari ne partiront pas depuis
l'application. Travaillez dans l'une ou dans l'autre, pas dans les deux.</p>
`
        }
    };

    const Aide = {

        FICHES,

        /**
         * À insérer dans un template. L'écouteur est délégué, posé une fois pour toutes.
         * Un « i » simple, pas le glyphe cerclé « ⓘ » : celui-ci porte déjà son cercle, et
         * dans la pastille ronde il en faisait deux, lus comme un bouton marche/arrêt.
         */
        icone(cle, libelle) {
            const titre = libelle || FICHES[cle]?.titre || 'Aide';
            return `<button type="button" class="aide-icone" data-aide="${cle}"
                            title="${titre.replace(/"/g, '&quot;')}" aria-label="${titre.replace(/"/g, '&quot;')}">i</button>`;
        },

        ouvrir(cle) {
            const fiche = FICHES[cle];
            if (!fiche) return;

            this._styler();
            this.fermer();
            const overlay = document.createElement('div');
            overlay.className = 'aide-overlay';
            overlay.innerHTML = `
                <div class="aide-contenu" role="dialog" aria-modal="true">
                    <div class="aide-entete">
                        <h3>${fiche.titre}</h3>
                        <button type="button" class="aide-fermer" data-aide-fermer>×</button>
                    </div>
                    <div class="aide-corps">${fiche.html}</div>
                </div>`;
            overlay.addEventListener('click', e => {
                if (e.target === overlay || e.target.hasAttribute('data-aide-fermer')) this.fermer();
            });
            document.body.appendChild(overlay);
            overlay.querySelector('[data-aide-fermer]').focus();
        },

        fermer() {
            document.querySelectorAll('.aide-overlay').forEach(o => o.remove());
        },

        /** Style posé une seule fois, à la première ouverture. */
        _styler() {
            if (document.getElementById('aide-style')) return;
            const style = document.createElement('style');
            style.id = 'aide-style';
            style.textContent = `
.aide-icone { display:inline-flex; align-items:center; justify-content:center;
    width:1.25rem; height:1.25rem; margin-left:0.4rem; padding:0; flex-shrink:0;
    border:none; border-radius:50%; background:#dbeafe; color:#1d4ed8;
    font:700 0.8rem/1 Georgia, 'Times New Roman', serif; font-style:normal;
    text-transform:none; letter-spacing:0; cursor:pointer; vertical-align:middle;
    transition:background .15s ease, color .15s ease; }
.aide-icone:hover, .aide-icone:focus-visible { background:#2563eb; color:#fff; outline:none; }
.aide-icone:focus-visible { box-shadow:0 0 0 2px #fff, 0 0 0 4px #2563eb; }
.aide-overlay { position:fixed; inset:0; z-index:30000; display:flex; align-items:center;
    justify-content:center; padding:1rem; background:rgba(15,23,42,.6); }
.aide-contenu { background:#fff; border-radius:12px; max-width:820px; width:100%;
    max-height:90vh; display:flex; flex-direction:column;
    box-shadow:0 20px 50px rgba(0,0,0,.35); }
.aide-entete { display:flex; align-items:center; justify-content:space-between;
    gap:1rem; padding:1rem 1.25rem; border-bottom:1px solid #e2e8f0; }
.aide-entete h3 { margin:0; font-size:1rem; color:#1b4f72; }
.aide-fermer { width:2rem; height:2rem; border:none; border-radius:50%; background:#e2e8f0;
    color:#334155; font-size:1.1rem; line-height:1; cursor:pointer; flex-shrink:0; }
.aide-fermer:hover { background:#cbd5e1; }
.aide-corps { padding:1rem 1.25rem 1.25rem; overflow-y:auto;
    font-size:0.92rem; line-height:1.55; color:#334155; }
.aide-corps h4 { margin:1.2rem 0 0.4rem; font-size:0.95rem; color:#1b4f72; }
.aide-corps h4:first-child { margin-top:0; }
.aide-corps p, .aide-corps ul, .aide-corps ol { margin:0.4rem 0; }
.aide-corps li { margin-bottom:0.25rem; }
.aide-table { width:100%; border-collapse:collapse; margin:0.6rem 0; font-size:0.85rem; }
.aide-table th, .aide-table td { border:1px solid #e2e8f0; padding:0.35rem 0.6rem; text-align:left; }
.aide-table th { background:#f1f5f9; font-weight:600; color:#334155; }
.aide-table td:first-child { white-space:nowrap; }
@media (max-width:520px) { .aide-corps { font-size:0.88rem; } .aide-table { font-size:0.78rem; }
    .aide-table td:first-child { white-space:normal; } }
`;
            document.head.appendChild(style);
        },

        /**
         * Délégation sur le document : les vues formateur se re-rendent entièrement à
         * chaque rafraîchissement, un écouteur par bouton serait perdu à chaque fois.
         */
        _brancher() {
            this._styler();
            document.addEventListener('click', e => {
                const bouton = e.target.closest?.('.aide-icone');
                if (bouton) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.ouvrir(bouton.dataset.aide);
                }
            });
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape') this.fermer();
            });
        }
    };

    window.Aide = Aide;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => Aide._brancher());
    } else {
        Aide._brancher();
    }
})();
