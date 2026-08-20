
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
│   │   ├── chapterInit.js                 #   Init page chapitre (auth, vue formateur)
│   │   ├── correctionModal.js             #   Modale de correction formateur
│   │   ├── studentCorrectionModal.js      #   Modale de correction élève
│   │   ├── studentWorkEditor.js           #   Éditeur de travail élève
│   │   ├── progressManager.js             #   Gestionnaire de progression
│   │   ├── getChapterBadgeState.js        #   État des badges chapitre
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
│   │   │   ├── chapterSubmission.js       #   Soumission de chapitre
│   │   │   └── chapterUI.js               #   UI chapitre
│   │   └── core/
│   │       ├── chapterRepository.js       #   Accès données chapitre
│   │       ├── chapterRenderer.js         #   Rendu chapitre
│   │       ├── chapterSession.js          #   Session chapitre
│   │       ├── chapterState.js            #   État chapitre
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
* mode du chapitre (Découverte, Examen, Blind, Millionnaire, Atelier AR),
* dates limites,
* gestion des utilisateurs,
* import/export CSV.

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
| Atelier AR | 🧾 | Les consignes se valident **en main propre**, par échange de codes |

## 🎲 Option « ordre aléatoire »

Proposée aux modes **Examen, Blind et Millionnaire**, et seulement pour les chapitres **entièrement
auto-corrigés** : mélanger des questions dont certaines attendent une correction humaine n'apporte rien
et brouillerait la lecture du formateur. Cochée par défaut en Millionnaire, où l'ordre fait partie du
jeu ; à activer soi-même dans les deux autres. Stockée dans `chapter_config` (`ordreAleatoire`).

Une seule règle d'ordonnancement, pour les trois modes : **les questions déjà répondues d'abord**, dans
l'ordre où elles l'ont été, **puis les autres tirées au sort**. Rien n'est mémorisé — l'ordre est
recalculé à chaque affichage. Ce qui est fait reste devant, ce qui reste à faire change de place ; et
comme le tirage est propre à chaque apprenant, la copie sur l'écran du voisin devient malcommode.

Les blocs de cours ne bougent pas : seules les questions permutent entre elles. Les vues formateur
(modale de correction, bilan) conservent toujours l'ordre publié — le formateur a besoin d'une référence
stable, pas de l'ordre vu par tel apprenant. Voir `src/js/chapter/chapterOrdre.js`.

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

**Documentation complète : `mode atelier AR.md`** (intention, format des codes, modèle de données,
limites assumées). À lire avant toute modification : plusieurs choix y sont contre-intuitifs et
protègent la fonction du dispositif.

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
| `slug:config:chapter_config` | Verrous, mode, option d'ordre aléatoire, dates limites par chapitre |
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
