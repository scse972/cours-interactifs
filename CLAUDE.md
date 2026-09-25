# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Le code, les commentaires et les messages de commit sont en **français**. Les messages de
commit du dépôt sont **sans accents** (contrainte de console Windows) — s'y tenir.

## ⚠️ Ce dépôt existe en deux exemplaires

`C:\electron\XSpro\coursInteractifs` est une **copie embarquée complète**, servie dans
l'onglet « Cours Interactifs » de XSpro. Une modification de `src/`, `parcours/` ou des
providers de stockage n'est **pas terminée** tant qu'elle n'y est pas propagée :

```bash
cd C:/electron/XSpro && node scripts/syncCoursInteractifs.js --essai   # voir sans ecrire
cd C:/electron/XSpro && node scripts/syncCoursInteractifs.js           # propager
```

Le script ne supprime rien et ne touche jamais aux fichiers adaptés à Electron
(`index.html`, `backend/**`, `storage/config*.json`, `provider.electron.js`,
`manifestCoursInteractifs.js`). Commiter dans XSpro en ne stageant que `coursInteractifs/` :
son arbre porte souvent des modifications non liées (`recent.ini`, `configuration.ini`).

## Commandes

```bash
npm run dev              # config locale + frontend (8000) + backend SQLite (3000)
npm run frontend         # site seul, http-server sur 8000
npm run backend          # serveur Express + SQLite seul, sur 3000
npm run config:local     # bascule storage/config.json vers SQLite local
npm run config:supabase  # bascule vers Supabase (production)
npm test                 # ping /api/health du backend — ce n'est PAS une suite de tests
```

**Il n'y a aucun framework de test.** Pour vérifier une logique métier sans navigateur,
charger le module dans un bac à sable `vm` : les fichiers de `src/js` sont des scripts
classiques qui s'exposent sur `window`.

```js
const vm = require('vm');
const s = { window: {}, console, URLSearchParams, sessionStorage: { getItem: () => null } };
s.window.location = { search: '' };
vm.createContext(s);
vm.runInContext(require('fs').readFileSync('src/js/progressManager.js', 'utf8'), s);
s.window.ProgressManager.compterAvancement(chapitre, config);
```

**Déploiement** : push sur `main` → GitHub Actions (`.github/workflows/deploy.yml`) publie
la racine du dépôt sur GitHub Pages. Il n'y a pas de script `npm run deploy`, malgré ce
qu'indique le README.

## Contraintes d'architecture

**Aucune étape de build, aucun bundler.** Les pages chargent des `<script src>` et le code
communique par globales (`window.ProgressManager`, `window.ChapterSession`,
`getExamContext`…). Seule l'accueil apprenant est en modules ES — `src/js/index.js` et,
dans `core/`, `chapterRenderer.js`, `chapterRepository.js`, `chapterState.js` — et ces
modules lisent quand même les globales des scripts chargés avant eux. Ajouter un fichier à
`src/js` implique donc d'ajouter sa balise dans **chaque** page qui en a besoin
(`src/html/*.html`, `parcours/src/chapter_template.html`).

Corollaire : un module ne peut pas supposer qu'un autre est chargé. `suiviAtelier.html`,
par exemple, charge `progressManager.js` **sans** `getExamContext.js` — d'où la duplication
assumée de `modeChapitre()` dans progressManager.

**Aucun CDN.** Les bibliothèques tierces vivent dans `src/js/vendor/` : le site doit
fonctionner hors-ligne et sous Electron.

## Les données

**Un seul magasin clé-valeur** (table `app_data`), derrière un provider interchangeable
choisi par `storage/config.json` : `provider.sqlite.js` (dev local), `provider.supabase.js`
(production), `provider.appwrite.js`, `provider.electron.js` (copie XSpro uniquement).
`src/js/storage.js` ajoute cache et synchronisation ; `staticJson` sert les fichiers
statiques.

**Les clés sont préfixées par parcours** : `{slug}:{portée}:{clé}`. Les trois qui comptent :

| Clé | Contenu |
|---|---|
| `{slug}:{studentId}:student_{studentId}_progress` | **toute** la progression d'un apprenant, en un seul objet JSON |
| `{slug}:config:chapter_config` | réglages formateur par chapitre (mode, verrou, date limite) |
| `{slug}:teacher:users_list` | liste des apprenants |

Passer par `Parcours.scoped.student` / `.teacher` plutôt que de recomposer les clés à la
main. Écrire une progression réécrit l'objet entier : relire juste avant d'écrire, pour ne
pas écraser le travail que l'apprenant vient d'enregistrer.

**`parcours/cours.json` est généré par XSpro** (tout le contenu pédagogique de tous les
parcours : chapitres, questions, réponses, HTML des cours). Ne jamais l'éditer à la main.
La config effective d'un chapitre = config statique de `cours.json` **fusionnée** avec les
overrides de `chapter_config` ; c'est ce que fait `loadChapterConfig()` (chapitre.js) et,
côté formateur, `TeacherDashboard.loadChapters()`.

## Règles du domaine à ne pas contourner

Ces invariants ont chacun coûté un bug. Les commentaires du code expliquent le pourquoi.

- **Le contexte est figé par apprenant.** Au premier démarrage, `initChapter()` fige
  `frozenChapterMode` / `frozenDateLimitEnabled` / `frozenEndDate` / `frozenAt`. Le mode
  effectif se lit par `getExamContext(chapter, config)` — figé d'abord, config ensuite —
  jamais directement dans la config. Plusieurs classes démarrent le même chapitre à des
  dates différentes.
- **Les dates font foi, `submissionStatus` en découle.** Il est reconstruit par
  `recomputeSubmissionStatus()` à partir de `submittedAt` / `revisionRequestedAt` /
  `validatedAt`. `setSubmissionStatus()` est le **seul** écrivain légitime : écrire
  l'étiquette seule, c'est écrire ce que le premier recalcul effacera.
- **`compterAvancement()` (progressManager.js) est le seul calcul d'avancement.** Tout
  écran qui montre un pourcentage passe par là, jamais par le champ stocké
  `completionPercent` — un champ figé peut mentir, et faisait afficher « 📤 Rendu » et
  « 0 % » sur la même ligne. Une question compte comme répondue si `answered === true` ou
  si `answer` est non vide ; en modes **consigne** et **atelier AR** seulement, une
  question traitée par le formateur compte aussi (copie papier, cf. `aUnVerdictFormateur`).
- **Une entrée de chapitre se crée par `initChapter(config)`, jamais à la main.** Un objet
  littéral sans `progressItemCount` condamne l'avancement du chapitre à 0 %. Si le geste
  est un geste formateur (statut forcé, appréciation), appeler ensuite
  `degelerContexteChapitre()` : poser un statut n'est pas démarrer le chapitre.
- **`updatedAt` appartient à l'apprenant.** C'est la source de la colonne « Dernière
  activité ». Aucune action du formateur ne doit y toucher.

## Les six modes de chapitre

`normal` (Découverte), `exam`, `blind`, `millionnaire`, `atelier`, `consigne` — tous
dérivés par `src/js/core/getExamContext.js`, qui est la source unique. `atelier` et
`consigne` sont des modes Découverte côté apprenant : ils ne changent que la correction et
la validation. Avant d'y toucher, lire **`mode atelier AR.md`** (codes, AR, modèle de
données) et **`qrcode question.md`** (format figé de la charge du QRCode).

## Vocabulaire

Le domaine ne connaît ni « élève » ni « professeur » : on dit **apprenant** et
**formateur** (le rôle s'appelle « formateur », l'acte d'évaluer revient à l'évaluateur).
Des « élève » subsistent dans de vieux commentaires ; ne pas en ajouter.

## Documentation de référence

À lire avant d'intervenir sur le domaine concerné, plutôt que de déduire du code :

- `principe flux.md` — flux de données, connexion, parcours de l'apprenant et du formateur
- `DETAILS_VUES.md` — `studentWorkEditor`, types de questions, comportement par mode,
  cycle de vie d'une réponse (tableau de vérité)
- `mode atelier AR.md`, `qrcode question.md` — les deux mécanismes les plus subtils
- `deploiement.md` — Supabase, GitHub Pages, mode local, synchronisation
- `mobile/CLAUDE.md` — l'application mobile, dont `src/html` est lui aussi recopié vers XSpro
