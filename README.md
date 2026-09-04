
## 📁 Organisation physique des dossiers (arborescence réelle)

```
cours-interactifs/                         # Racine du dépôt (servie sur GitHub Pages)
│
├── index.html                             # Router technique SPA → parcours/src/{slug}/
├── 404.html                               # Fallback GitHub Pages pour les routes SPA
├── package.json                           # npm run deploy → GitHub Pages
│
├── src/                                   # ★ Code source partagé (tous parcours, écrit à la main)
│   ├── js/
│   │   ├── storage.js                     #   Module central : storage (cache+sync) + staticJson
│   │   ├── cours-loader.js                #   Couche métier au-dessus de staticJson
│   │   ├── parcours.js                    #   Module multi-parcours (chargé en premier)
│   │   ├── dataStorage.js                 #   Auth, progression, UserManager
│   │   ├── main.js                        #   Utilitaires DOM, APP_BASE_URL
│   │   ├── config.js                      #   Configuration globale
│   │   ├── index.js                       #   Grille des chapitres (page d'accueil du parcours)
│   │   ├── chapitre.js                    #   Logique page chapitre
│   │   ├── chapterInit.js                 #   Init page chapitre (auth, vue formateur,
│   │   │                                  #   protection copier-coller et glisser-déposer)
│   │   ├── correctionModal.js             #   Modale de correction formateur
│   │   ├── studentCorrectionModal.js      #   Modale de correction élève
│   │   ├── studentWorkEditor.js           #   Éditeur de travail élève
│   │   ├── progressManager.js             #   Gestionnaire de progression
│   │   ├── aide.js                        #   Fiches d'aide formateur — version rédigée des
│   │   │                                  #   règles de barème et de notation
│   │   ├── qrCharge.js                    #   Format de la charge du QRCode de question —
│   │   │                                  #   source unique, partagée apprenant/formateur
│   │   ├── qrQuestion.js                  #   QRCode + nom de l'apprenant dans le bandeau
│   │   │                                  #   de question (voir "qrcode question.md")
│   │   ├── getChapterBadgeState.js        #   État des badges chapitre
│   │   ├── simulation.js                  #   Simulation apprenant (identité isolée + purge)
│   │   ├── teacherDashboard.js            #   Tableau de bord formateur
│   │   ├── teacherChapters.js             #   Gestion des chapitres (formateur)
│   │   ├── teacherStats.js                #   Statistiques (formateur)
│   │   ├── teacherStudents.js             #   Gestion des élèves (formateur)
│   │   ├── teacherSubmissions.js          #   Soumissions (formateur)
│   │   ├── teacherUsers.js                #   Utilisateurs (formateur)
│   │   ├── atelier/                       #   Mode Atelier AR (voir "mode atelier AR.md")
│   │   │   ├── atelierCodes.js            #     Codes de validation et AR (partagé apprenant/formateur)
│   │   │   ├── atelierQuestion.js         #     Vue apprenant de la consigne
│   │   │   └── suiviAtelier.js            #     Logique de l'outil de validation
│   │   ├── chapter/
│   │   │   ├── chapterBilan.js            #   Bilan de chapitre
│   │   │   ├── chapterOrdre.js            #   Ordre d'affichage des questions (option aléatoire)
│   │   │   ├── chapterPagination.js       #   Affichage question par question (Examen, Blind)
│   │   │   ├── chapterSubmission.js       #   Soumission de chapitre
│   │   │   └── chapterUI.js               #   UI chapitre
│   │   ├── vendor/                        #   Bibliothèques tierces embarquées (jamais de CDN :
│   │   │   │                              #   le site doit tourner hors-ligne et en Electron)
│   │   │   ├── qrcode-generator.js        #     Générateur de QRCode (K. Arase, MIT)
│   │   │   └── jsqr.js                      #     Lecteur de QRCode (jsQR, Apache-2.0),
│   │   │                                  #     chargé à la demande par l'outil formateur
│   │   └── core/
│   │       ├── chapterRepository.js       #   Accès données chapitre
│   │       ├── chapterRenderer.js         #   Rendu chapitre
│   │       ├── chapterSession.js          #   Session chapitre
│   │       ├── chapterState.js            #   État chapitre
│   │       ├── bareme.js                  #   Barème des questions auto (pénalité d'essais)
│   │       ├── getExamContext.js          #   Contexte examen
│   │       └── utils.js                   #   Utilitaires
│   │
│   ├── assets/css/
│   │   ├── style.css
│   │   ├── index.css
│   │   ├── chapitre.css
│   │   ├── teacher.css
│   │   ├── chapter-bilan.css
│   │   └── correction-modal.css
│   │
│   └── html/
│       ├── login.html                     #   Connexion apprenant
│       ├── teacher-login.html             #   Connexion formateur
│       ├── teacher.html                   #   Gestion parcours (formateur)
│       ├── suiviAtelier.html              #   Outil de validation en main propre (mobile, autonome)
│       └── user.html                      #   Profil utilisateur
│
├── parcours/                              # ★ Données pédagogiques (publiées par XSpro)
│   ├── cours.json                         #   Registre JSON complet de TOUS les parcours
│   │                                      #   (contient la totalité des données : chapitres,
│   │                                      #    questions, réponses, feedbacks, html incorporé)
│   │                                      #   Chargé via staticJson.get('/parcours/cours.json')
│   └── src/
│       └── chapter_template.html          #   Page unique de chapitre (?parcours=&chapitre=)
│
├── storage/                               # ★ Configuration du backend de stockage
│   ├── config.json                        #   Provider actif (copie locale de .supabase ou .local)
│   ├── config.local.json                  #   Configuration SQLite (développement local)
│   ├── config.supabase.json               #   Identifiants Supabase (production)
│   ├── provider.sqlite.js                 #   Client HTTP vers le backend SQLite local
│   ├── provider.supabase.js               #   Client HTTP vers Supabase
│   └── MIGRATION.md                       #   Notes de migration
│
├── backend/                               # ★ Serveur local (Node.js / SQLite, développement)
│   ├── server.js                          #   Serveur Express (API REST /api/data/*)
│   ├── data.db                            #   Fichier SQLite
│   ├── sync_supabase_to_sqlite.js         #   Sync Supabase → SQLite
│   └── sync_sqlite_to_supabase.js         #   Sync SQLite → Supabase
│
├── tools/                                 # ★ Outils de développement (non déployés)
│   └── generer-cours-demo.js              #   Export XSpro → parcours/cours.json (démo/secours)
│
├── tools_xlsx/                            # ★ Vestige de la chaîne Excel (non déployé)
│   └── SUPABASE_SETUP.sql                 #   Schéma SQL pour les tables app_data / parcours_data
│
├── deploiement.md                         # Documentation déploiement
├── DETAILS_VUES.md                        # Documentation vues
├── principe flux.md                       # Documentation flux de données
├── mode atelier AR.md                     # Mode Atelier AR : intention, codes, modèle de données
├── qrcode question.md                     # QRCode de question : intention, format figé de la charge utile
│
└── .gitignore
```

# 🎓 Cours Interactifs — Résumé complet de l’architecture

## Présentation générale

**Cours Interactifs** est une plateforme pédagogique web conçue pour diffuser plusieurs parcours de formation indépendants, avec :

* suivi individuel des apprenants,
* QCM interactifs,
* gestion de progression,
* tableau de bord formateur,
* fonctionnement hors-ligne,
* compatibilité GitHub Pages,
* backend interchangeable (Supabase ou SQLite).

L’application repose sur une architecture hybride :

* un **frontend statique** servi comme un simple site web,
* un **système de stockage abstrait**,
* et une **couche de données pédagogiques centralisée**.

---

# Philosophie du projet

Le projet cherche à combiner :


* simplicité de déploiement,
* faible dépendance serveur,
* fonctionnement hors-ligne,
* séparation claire entre contenu et données utilisateur,
* possibilité de fonctionner aussi bien :

  * sur GitHub Pages,
  * avec Supabase,
  * ou entièrement en local avec SQLite.

L’objectif est d’obtenir une plateforme LMS légère, portable et robuste.

---

# Architecture générale

Le projet est organisé autour de cinq grands blocs.

---

# 1. `src/` — Le moteur de l’application

Le dossier `src/` contient tout le code applicatif écrit à la main :

* authentification,
* affichage des chapitres,
* moteur de QCM,
* gestion de progression,
* dashboard formateur,
* synchronisation hors-ligne,
* gestion du stockage,
* rendu de l’interface.

C’est le cœur fonctionnel de l’application.

Le code est mutualisé pour tous les parcours.

---

# 2. `parcours/` — Les données pédagogiques

Le dossier `parcours/` contient les ressources pédagogiques statiques :

* liste des parcours,
* chapitres,
* questions,
* réponses,
* feedbacks,
* contenu HTML.

La totalité du contenu pédagogique est centralisée dans :

```text id="7v50m2"
/parcours/cours.json
```

Ce fichier agit comme un registre global des parcours.

Il est produit par **XSpro** (`publishParcours.js`), seule source de vérité du format. Le fichier
statique versionné ici sert de jeu de démonstration et de secours ; voir « Génération du contenu
pédagogique » plus bas pour le régénérer.

---

# 3. `storage/` — Couche d’abstraction du stockage

Le projet ne dépend pas directement d’un backend spécifique.

Le stockage passe par une couche d’abstraction capable d’utiliser :

* Supabase,
* ou SQLite.

Le provider actif est choisi dynamiquement via :

```text id="j7xyul"
storage/config.json
```

Le reste de l’application ne sait jamais quel backend est utilisé.

---

# 4. `backend/` — Serveur local Node.js

Le backend local sert principalement au développement.

Il fournit :

* une API REST,
* une base SQLite,
* des routes de lecture/écriture,
* des scripts de synchronisation avec Supabase.

Cette partie n’est pas déployée sur GitHub Pages.

---

# 5. Génération du contenu pédagogique

Le contenu est créé et publié depuis **XSpro**, qui écrit `cours.json` dans `parcours_data`
(voir `publishParcours.js` côté XSpro — source de vérité unique du format).

`parcours/cours.json` reste la source **prioritaire** lue par `staticJson` : il sert de jeu de
démonstration et de secours quand la base est vide. Pour le régénérer à partir d'un export XSpro :

```bash
node tools/generer-cours-demo.js "chemin/vers/export.json"
```

Le script appelle `buildParcours()` de XSpro plutôt que de réimplémenter le format — il exige donc
un dépôt XSpro accessible (`--xspro <chemin>`, défaut `../XSpro`). C'est un outil de développement,
jamais utilisé au déploiement.

L'ancienne chaîne Excel est démantelée : le générateur Python (`tools_xlsx/generate_chapters.py`), les
fichiers `.xlsx` source et la copie legacy du template de chapitre ont été supprimés. Le générateur
produisait un format antérieur au tableau `items`, que le template de chapitre ne sait plus afficher.
`tools_xlsx/` ne conserve que le schéma SQL.

Le contrat d'autorat pour l'IA (`parcours/model/modelChapitre.json`) a également été retiré : la
définition des types, règles et corrections vit désormais uniquement dans `manifest_parcours.js` côté
XSpro, seule source de vérité.

---

# Isolation des parcours

Chaque parcours est totalement indépendant :

* progression,
* utilisateurs,
* statistiques,
* configuration,
* chapitres.

Un élève connecté à un parcours :

* ne voit jamais les autres,
* ne partage aucune donnée avec eux.

Le système fonctionne avec des tokens isolés par parcours :

```text id="p7ktvw"
nsi-term:STU001
math-2de:STU001
```

sont deux utilisateurs distincts.

---

# Fonctionnalités principales

## 👨‍🎓 Côté élève

* connexion par token,
* progression sauvegardée,
* QCM interactifs,
* validation des chapitres,
* feedback immédiat,
* travail hors-ligne,
* reprise automatique,
* consultation des corrections.

---

## 👨‍🏫 Côté formateur

Le tableau de bord permet :

* suivi individuel,
* statistiques globales,
* correction des réponses ouvertes,
* verrouillage des chapitres,
* mode du chapitre (Découverte, Examen, Blind, Millionnaire, Atelier AR, Consigne),
* dates limites,
* gestion des utilisateurs,
* import/export CSV.

---

# ⭐ Barème et bilan

La **pénalité d'essais** dissuade la réponse au hasard : une bonne réponse du premier coup rapporte
tout le barème, chaque tentative ratée en retire une part — d'autant plus grande qu'il y avait peu de
choix. La pénalité vaut `2 × barème / (options − 1)`, ce qui ramène à **zéro l'espérance d'un
apprenant qui répond entièrement au hasard**, quel que soit le nombre de choix. Une question peut
donc valoir des points négatifs, mais **le total des questions auto ne descend jamais sous zéro** :
un mauvais résultat sur les QCM ne vient pas manger les points gagnés ailleurs. Source unique :
`src/js/core/bareme.js`.

Le **bilan** répond à une seule question : entre quelles bornes la note va-t-elle finir ? Chaque
question apporte un intervalle de points — une question corrigée apporte une valeur fixe, une
question en attente apporte « entre zéro et son barème » — et on somme. Les bornes **se resserrent
d'elles-mêmes** à mesure que l'apprenant répond et que le formateur corrige ; quand tout est corrigé,
elles se rejoignent et le bilan n'affiche plus qu'une note.

La fourchette intègre la pénalité automatique de cours non lu, mais **jamais le bonus ou le malus que
le formateur saisit lui-même** : ce que l'apprenant peut déduire reste une note théorique.

Ces règles sont rédigées en français dans `src/js/aide.js`, atteignables par les icônes ⓘ du tableau
de bord — c'est là qu'il faut aller avant de lire le code. **Documentation technique complète :
`DETAILS_VUES.md`**, sections « Barème des questions auto-corrigées » et « Le bilan de chapitre ».

---

# Modes de chapitre

Un mode est une **politique de chapitre** choisie par le formateur, indépendante du contenu : le même
chapitre peut être joué dans un mode différent d'une classe à l'autre. Il est stocké dans
`slug:config:chapter_config` (`chapterMode`), figé par apprenant au premier démarrage
(`frozenChapterMode`), et résolu par la source unique de vérité `src/js/core/getExamContext.js`.

| Mode | Icône | Principe |
|---|---|---|
| Découverte | 📖 | Feedback immédiat, l'apprenant peut réessayer |
| Examen | 📝 | Pas de feedback, enregistrement en temps réel, tout se verrouille au rendu |
| Blind | 🥽 | Saisie silencieuse, bilan min/max à la validation |
| Millionnaire | 💰 | Une erreur réinitialise les questions auto-corrigées. **Pas de reprise** : revenir sur le chapitre, même par un simple rechargement, repart d'une tentative neuve |
| Atelier AR | 🧾 | Les questions ouvertes se valident **en main propre**, par échange de codes — dans l'application |
| Consigne | 📋 | Travail **sur papier** : feuille nominative imprimable avec un QRCode par question. Côté élève, rien ne change (comportement Découverte) ; côté formateur la correction est accessible **même sans rendu**, les champs vides étant normaux |

## 🎲 Option « ordre aléatoire »

Proposée aux modes **Examen, Blind et Millionnaire**, et seulement pour les chapitres **entièrement
auto-corrigés** : mélanger des questions dont certaines attendent une correction manuelle n'apporte rien
et brouillerait la lecture du formateur. Cochée par défaut en Millionnaire, où l'ordre fait partie du
jeu ; à activer soi-même dans les deux autres. Stockée dans `chapter_config` (`ordreAleatoire`).

Une seule règle d'ordonnancement, pour les trois modes : **les questions déjà répondues d'abord**, dans
l'ordre où elles l'ont été, **puis les autres tirées au sort**. Rien n'est mémorisé — l'ordre est
recalculé à chaque affichage. Ce qui est fait reste devant, ce qui reste à faire change de place ; et
comme le tirage est propre à chaque apprenant, la copie sur l'écran du voisin devient malcommode.

Les blocs de cours ne bougent pas : seules les questions permutent entre elles. Les vues formateur
(modale de correction, bilan) conservent toujours l'ordre publié — le formateur a besoin d'une référence
stable, pas de l'ordre vu par tel apprenant. Voir `src/js/chapter/chapterOrdre.js`.

## 📄 Option « questions par questions »

Proposée aux modes **Examen et Blind**, sans condition sur le type de correction — afficher une question
ouverte seule à l'écran ne pose aucun problème. Décochée par défaut : elle change toute l'expérience.
Stockée dans `chapter_config` (`questionParQuestion`).

Un écran = un élément, **blocs de cours compris** : sans cela un long cours resterait affiché au-dessus
de chaque question. Navigation libre **dans les deux sens** (boutons, et flèches gauche/droite du
clavier hors champ de saisie) : aucune étape ne verrouille la suivante.

Rien n'est mémorisé là non plus. À l'ouverture on se place sur la **première étape non faite** —
question sans réponse, ou cours à valider non validé — ce qui est déduit des réponses déjà
enregistrées, pas d'un avancement stocké. Sans cela l'apprenant devrait recliquer autant de fois qu'il
a déjà répondu de questions.

Dès que la copie est rendue, ou le chapitre verrouillé, la pagination s'efface : la relecture se fait
d'un seul tenant. Voir `src/js/chapter/chapterPagination.js`.

## 🧾 Le mode Atelier AR

C'est un mode Découverte dans lequel les questions **ouvertes à correction manuelle** deviennent des
consignes : un travail réalisé hors écran, que l'apprenant vient faire valider auprès de son formateur.

1. L'apprenant rédige son compte rendu, se positionne sur une échelle à trois niveaux, puis se déclare
   prêt — ce qui produit un **code de validation** de 6 caractères.
2. Le formateur ouvre `src/html/suiviAtelier.html` (page mobile autonome), saisit ce code, voit le
   travail, attribue des points et une appréciation, et obtient un **AR** de 8 caractères qu'il dicte.
3. L'apprenant saisit l'AR : les points s'inscrivent alors dans sa progression.

L'objectif est pédagogique — rendre l'échange obligatoire — et c'est ce qui explique la mécanique :
l'outil de validation n'écrit pas `teacherScore` mais des champs d'attente (`arPoints`,
`arAppreciation`), et **c'est la saisie de l'AR qui les promeut** dans le calcul. Aucun masquage de note
n'est donc nécessaire : les points ne sont pas cachés, ils ne sont simplement pas encore dans le champ
que le calcul regarde. Au moment de rendre sa copie, l'apprenant est averti nommément des consignes qui
partiront à 0 point faute d'AR.

**Sortir une question du rituel — la règle « Texte non vide ».** Comme le coller n'est autorisé que dans
les questions ouvertes à correction manuelle (voir plus bas), on passe parfois une question en correction
manuelle *uniquement* pour permettre le collé, sans vouloir d'AR. La règle **« Texte non vide »**
(`texte(10)`) dit exactement cela : la question reste ouverte, corrigée à la main, le collé y est
autorisé, mais elle n'affiche **aucun bloc de validation** et ne figure pas dans l'avertissement des
0 points. La règle **« Texte »** (ou aucune règle) reste celle des consignes. Le choix est cohérent :
une consigne se juge en présence, pas au compteur de caractères. Attention, « Texte non vide » impose un
**minimum de 10 caractères** pour enregistrer la réponse.

**Documentation complète : `mode atelier AR.md`** (intention, format des codes, modèle de données,
limites assumées). À lire avant toute modification : plusieurs choix y sont contre-intuitifs et
protègent la fonction du dispositif.

---

# 🔳 QRCode de question

Le bandeau de **chaque question**, dans tous les modes, porte une petite vignette QRCode et le **nom
de l'apprenant**. Le nom identifie de visu l'écran devant lequel on se trouve ; le QRCode, scanné
depuis l'outil formateur, désignera exactement une question d'un apprenant et y ouvrira la saisie
d'un commentaire de question, d'un commentaire général de chapitre et de points.

C'est le même service que le mode Atelier AR, **sans son rituel** : là-bas la dictée d'un code à
6 caractères est lente à dessein, ici on veut aller au plus court.

La charge utile est **autoporteuse** — rien n'est écrit en base, contrairement aux tickets Atelier :

```text
XSQ1|{slug}|{empreinte}|{chapitreId}|{questionId}
```

L'`empreinte` est un SHA-256 de `slug:token` tronqué à 12 caractères, **et non le token** : celui-ci
est l'identifiant de connexion de l'apprenant, on ne le publie pas en lisible-machine sur tous les
écrans de la salle. L'outil formateur le résout via `{slug}:teacher:users_list`.

La vignette fait la hauteur exacte de la pastille de points — **le bandeau ne grandit pas** — et
n'est donc pas scannable à cette taille : c'est une affordance, un clic ouvre le QRCode en grand et
c'est celui-là qu'on scanne. Le QRCode est masqué en vue formateur, à l'impression, et dès que
l'apprenant n'est pas identifiable ; il est affiché en simulation apprenant.

La bibliothèque de génération est **embarquée** dans `src/js/vendor/` : pas de CDN, le site doit
tourner hors-ligne et en Electron sur `file:`.

### Le pendant formateur

L'outil qui lit cette charge est **« ✍️ Correction en salle »** (`src/html/suiviAtelier.html`), la
page mobile du mode Atelier AR, enrichie plutôt que doublée — l'ancien libellé « Suivi Atelier »
décrivait ce qu'elle faisait, pas ce qu'elle fait. Le fichier garde son nom : `XSpro/main.js` teste
cette URL pour accorder l'accès au stockage à la popup.

On y entre de trois façons :

- **le code de validation** dicté par l'apprenant, comme avant ;
- **la charge d'un QRCode**, lue par la caméra (hors XSpro) ou collée — la modale d'agrandissement
  affiche la chaîne en clair avec un bouton « 📋 Copier », sans quoi le champ de saisie réclamerait
  un texte que personne ne peut lire ;
- **la liste** : apprenant → chapitre → question, lue depuis `cours.json`, avec une pastille d'état
  par question. C'est le seul chemin sans QRCode ni caractères à saisir — celui qu'on prend devant
  un écran en veille, ou depuis son bureau.

L'écran d'évaluation porte **deux boutons**, jamais un bouton qui change de sens :

| Bouton | Quand | Ce qu'il écrit |
|---|---|---|
| `Valider et générer l'AR` | seulement sur une consigne d'un chapitre joué en Atelier | les champs d'attente du rituel, inchangé |
| `Enregistrer la correction` | toujours | `teacherScore`, `teacherComment`, comme depuis le tableau de bord |

S'y ajoute le **commentaire général du chapitre**, avec son propre bouton : on doit pouvoir commenter
l'activité sans toucher à la note d'une question.

**Rien de tout cela ne change ce que voit l'apprenant.** Les règles de visibilité existantes
s'appliquent inchangées, et aucune mise à jour n'est poussée sous ses yeux : s'il rouvre son
chapitre, il retrouve l'état qu'il aurait eu si le formateur avait commencé à corriger sa copie
depuis le tableau de bord. C'est vrai par construction — corriger une question ne peut pas faire
basculer un chapitre en `validated`, seul état qui lui ouvre le corrigé.

Deux ajustements ont malgré tout été nécessaires, internes au mode Atelier : un **4ᵉ état de
consigne** (`corrigee`) pour les consignes notées hors rituel, et le **bilan** qui compte désormais
les points manuels quand l'apprenant les connaît déjà — il annonçait « ⏳ En attente, +0 » une
consigne dont le bloc affichait « 8 / 10 » deux écrans plus haut.

**Documentation complète : `qrcode question.md`** (intention, format figé de la charge utile, règles
d'affichage, outil formateur, ce qui reste à faire). Le format de la charge utile est imprimé sur
tous les écrans : à lire avant d'y toucher.

---

# 👁 Simulation apprenant

Dans la vue **Gestion des chapitres**, une icône 👁 placée après la pastille de statut ouvre le chapitre
**dans un nouvel onglet, tel qu'un apprenant le verra** : le mode et ses règles, l'ordre des questions,
la pagination, les consignes, la protection copier-coller. L'interface est **vivante** — on répond, on
valide, on rend la copie, on voit le bilan. Un bandeau le rappelle en permanence.

## Enregistrer puis purger, plutôt que neutraliser

La persistance ne passe pas par un point unique : les écritures vont par paires (`saveProgress` **et**
un `storage.set` explicite sur la même clé, en cinq endroits), une simple lecture alimente le cache
localStorage, et la file hors-ligne rejoue plus tard ce qui n'a pas pu partir. Neutraliser tout cela
ferait tourner le code dans des conditions qu'il ne rencontre jamais en vrai — et un simulateur qui
simule mal ne sert à rien.

La simulation laisse donc le code **écrire normalement**, sous une identité isolée, et purge.

| Aspect | Choix |
|---|---|
| Identité | `SIMU001`, « Simulation formateur », `type: 'student'` + indicateur `simulation: true` |
| Transport de l'identité | Par l'URL (`?simulation=true&student_id=SIMU001`), comme l'aperçu formateur — **la session de l'onglet n'est jamais écrite** |
| Moment de la purge | **À l'entrée**, jamais à la sortie : un onglet fermé brutalement n'exécute aucun nettoyage |
| Portée de la purge | Progression, clés annexes de l'apprenant, AR et **tickets** du mode Atelier, opérations encore en file de synchronisation |
| Visibilité | L'apprenant de simulation n'apparaît dans les vues formateur que s'il a une **activité** — pas seulement une progression, qui est recréée vide à chaque ouverture |

La purge est **déterministe d'abord** : elle vise des clés connues d'avance, et lit la progression pour
retrouver les tickets Atelier dont le code est aléatoire. L'énumération des clés (`storage.keys()`) ne
sert que de balayage complémentaire — elle n'est pas garantie par tous les backends, et une purge qui en
dépendrait échouerait en silence.

**Hypothèse assumée :** un seul formateur simule à la fois sur un parcours donné. L'authentification
formateur étant un mot de passe partagé, deux personnes simulant le même parcours écriraient dans les
mêmes clés.

L'aperçu formateur existant (`?teacher_view=true&student_id=…`) est conservé : il sert à consulter la
copie d'un apprenant réel, en lecture seule. La simulation, elle, ne touche jamais aux données d'un
apprenant.

---

# 🛡️ Protection copier-coller et glisser-déposer

Portée par `src/js/chapterInit.js` (`_applyAntiCopyProtection`), **active uniquement en mode
apprenant** : la vue formateur (`?teacher_view=true`) reste entièrement manipulable.

Il n'y a **qu'une exemption, et elle est étroite** : le *coller* dans la zone de texte d'une question
**ouverte à correction manuelle**. Un apprenant doit pouvoir y déposer un travail rédigé ailleurs —
c'est le seul endroit où ça a un sens pédagogique.

| Action | Zone de texte `ouverte` + `manuel` | Partout ailleurs |
|---|---|---|
| Copier | ❌ presse-papiers remplacé par un message | ❌ idem |
| Couper | ❌ | ❌ |
| Coller (Ctrl+V ou menu contextuel) | ✅ **autorisé** | ❌ |
| Menu contextuel | ✅ autorisé, sans quoi le « Coller » serait inaccessible | ❌ |
| Glisser-déposer, dans les deux sens | ❌ | ❌ |

Trois points qui expliquent la forme de ce tableau :

**Le sens sortant est fermé même dans la zone exemptée.** Sans cela, l'énoncé et les réponses des
autres questions s'exfiltreraient en passant par le seul champ ouvert.

**Les questions ouvertes en correction `semi` ont aussi une zone de texte, et ne sont pas exemptées.**
La règle porte sur `data-correction-type="manuel"`, pas sur la présence d'un `<textarea>` — et une
question `courte` en correction manuelle, qui n'a qu'un `<input>`, n'est pas exemptée non plus.

> Conséquence côté conception du parcours : pour qu'une question ouverte accepte le collé, il faut la
> passer en correction **manuelle**. En mode Atelier AR, cela en ferait une consigne à valider en main
> propre — ce qui n'est pas toujours voulu. La règle **« Texte non vide »** sert de porte de sortie :
> collé autorisé, aucun AR. Voir le mode Atelier AR ci-dessus.

**Le glisser-déposer est bloqué partout**, y compris dans la zone exemptée : c'est un contournement
complet du presse-papiers, dans un sens comme dans l'autre. Les écouteurs sont posés en capture pour
qu'aucun composant ne puisse rétablir le dépôt. La sélection de texte, elle, reste possible : la
bloquer casserait l'édition dans les zones de saisie, et elle ne suffit pas à exporter quoi que ce soit
puisque le copier est neutralisé.

**Aucune journalisation, aucune menace.** L'ancien message affirmait que la tentative « a été
enregistrée » et « sera signalée à votre formateur » : c'était faux, rien n'était enregistré. Le
message se contente maintenant de constater que le contenu est protégé.

---

# Architecture du stockage

Le fichier central :

```text id="0y5dl5"
src/js/storage.js
```

regroupe désormais trois systèmes distincts.

---

# 1. `storage` — Données applicatives dynamiques

Cette couche gère :

* progression,
* utilisateurs,
* réponses,
* statistiques,
* sessions.

API :

```js id="w9kqsr"
storage.get()
storage.set()
storage.remove()
storage.keys()
```

Fonctionnalités :

* cache localStorage,
* synchronisation automatique,
* queue hors-ligne,
* provider abstrait.

---

# 2. `SyncManager` — Synchronisation hors-ligne

Le système enregistre les opérations locales dans une queue :

```text id="mdnd6i"
_sync_queue
```

Lorsque la connexion revient :

* les opérations sont rejouées automatiquement,
* les données sont synchronisées avec le backend.

Cela permet un fonctionnement semi hors-ligne robuste.

---

# 3. `staticJson` — Abstraction des ressources JSON statiques

Le dernier refactor introduit une nouvelle couche centrale :

```js id="lly4rq"
staticJson.get('/parcours/cours.json')
```

Cette couche remplace tous les anciens :

```js id="o7mymd"
fetch('/parcours/cours.json')
```

dispersés dans le projet.

---

# Objectif du refactor `staticJson`

Avant le refactor :

* chaque module faisait son propre `fetch`,
* sans cache partagé,
* avec sa propre gestion d’erreur,
* et une dépendance directe aux fichiers physiques.

Le chargement des ressources était dupliqué dans tout le code.

Le refactor introduit une abstraction centralisée :

* unique,
* mutualisée,
* indépendante du support réel des données.

---

# Principe d’abstraction mis en place

Le reste de l’application ne sait plus :

* si les données viennent d’un fichier,
* d’un cache mémoire,
* ou d’une base de données.

Tous les modules utilisent simplement :

```js id="o2sq2n"
await staticJson.get('/parcours/cours.json')
```

La source réelle est résolue automatiquement.

---

# Stratégie de résolution des données

Lorsqu’une ressource JSON est demandée, `staticJson` applique trois niveaux de résolution.

| Priorité | Source                            | Rôle                     |
| -------- | --------------------------------- | ------------------------ |
| 1        | Cache mémoire                     | Retour immédiat sans I/O |
| 2        | Fichier statique HTTP             | Cas nominal              |
| 3        | Base de données (`parcours_data`) | Fallback automatique     |

---

# Cas normal : fichier statique présent

En production GitHub Pages, le fichier :

```text id="9aeh6r"
/parcours/cours.json
```

existe physiquement.

Dans ce cas :

* le fichier statique est utilisé directement,
* aucune requête base de données n’est faite,
* les performances restent celles d’un site statique classique.

Le fichier statique reste donc la source prioritaire et nominale.

---

# Cas fallback : absence du fichier statique

Si le fichier n’existe pas :

* environnement de développement,
* backend seul,
* génération non exportée,
* mode Supabase-only,

alors `staticJson` bascule automatiquement vers :

```text id="ovh0yf"
parcours_data
```

dans :

* Supabase,
* ou SQLite.

L’application continue donc de fonctionner sans dépendre obligatoirement des fichiers statiques.

---

# Nouvelle séparation des données

Le refactor introduit deux tables distinctes.

---

## `app_data`

Contient les données dynamiques utilisateur :

* progression,
* réponses,
* utilisateurs,
* statistiques,
* configuration applicative.

Familles de clés, toutes préfixées par le slug du parcours :

| Clé | Contenu |
|---|---|
| `slug:teacher:users_list` | Liste des jetons du parcours |
| `slug:config:chapter_config` | Verrous, mode, options d'affichage (ordre aléatoire, questions par questions), dates limites par chapitre |
| `slug:token:student_<token>_progress` | Progression complète d'un apprenant |
| `slug:atelier:code_<CODE>` | Mode Atelier AR — ticket écrit par l'apprenant à sa demande de validation, résolu par l'outil de suivi puis supprimé à la saisie de l'AR |
| `slug:atelier:ar_<token>_<chap>_<question>` | Mode Atelier AR — l'AR en clair, pour les surfaces formateur (réémission, vérification d'un code recopié sur un carnet) |

Une clé par ticket et par AR, jamais de liste partagée : deux appareils qui écrivent en même temps ne
peuvent pas s'écraser mutuellement, ce qui compte avec la file de synchronisation hors-ligne.

Routes API :

```text id="jhz8jh"
/api/app_data
```

---

## `parcours_data`

Nouvelle table dédiée au contenu pédagogique :

* `cours.json`,
* structure des parcours,
* chapitres,
* référentiels statiques.

Routes API :

```text id="9qughr"
/api/parcours_data
```

---

# Intérêt de cette séparation

Cette architecture apporte plusieurs avantages importants.

## Isolation claire des responsabilités

Le contenu pédagogique est séparé des données utilisateur.

---

## Compatibilité avec un outil externe

Un outil d’administration ou d’édition peut :

* publier du contenu,
* modifier les parcours,
* mettre à jour `cours.json`,

sans toucher aux données applicatives.

---

## Architecture plus évolutive

Le contenu pédagogique devient :

* versionnable,
* synchronisable,
* exportable,
* administrable séparément.

---

# Uniformisation backend

Les routes et providers ont été harmonisés :

| Table           | Route                |
| --------------- | -------------------- |
| `app_data`      | `/api/app_data`      |
| `parcours_data` | `/api/parcours_data` |

SQLite et Supabase suivent désormais exactement la même logique.

---

# Synchronisation SQLite ↔ Supabase

Les scripts de synchronisation couvrent maintenant :

* `app_data`,
* `parcours_data`.

Cela garantit :

* un développement local cohérent,
* une migration complète,
* une compatibilité totale entre environnements.

---

# Déploiement

Le projet reste pensé pour un déploiement très léger.

Commande :

```bash id="c4t0w8"
npm run deploy
```

Cette commande :

* active automatiquement le provider Supabase,
* pousse le dépôt sur GitHub Pages,
* sert les ressources pédagogiques statiquement.

---

# Résultat global

L’architecture actuelle transforme **Cours Interactifs** en une plateforme pédagogique :

* modulaire,
* découplée,
* portable,
* extensible,
* capable de fonctionner :

  * comme un simple site statique,
  * avec backend distant,
  * ou entièrement en local.

Le refactor `staticJson` apporte une véritable abstraction des ressources pédagogiques et une séparation nette entre :

* contenu,
* stockage,
* et données utilisateur.

Le système privilégie toujours les fichiers statiques lorsqu’ils existent, mais peut basculer automatiquement sur la base de données sans modification du reste de l’application.
