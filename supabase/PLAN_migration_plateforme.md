# Plan — passer le site coursInteractifs partagé en mode "plateforme" (Supabase multi-tenant)

## Contexte

`coursInteractifs` existe en deux endroits distincts :

- **A** — `C:\electron\coursInteractifs` : le dépôt source autonome, déployé sur GitHub Pages via `.github\workflows\deploy.yml` (push sur `main` → site public). C'est lui qui doit devenir **la plateforme partagée** (un seul site, une seule base Supabase, plusieurs formateurs/tenants), et non une variante en plus.
- **B** — `C:\electron\XSpro\coursInteractifs` : la copie embarquée dans l'onglet Cours Interactifs de XSpro, utilisée en mode Personnel (`file://` ou serveur local SQLite). Elle est régénérée par `C:\electron\XSpro\scripts\syncCoursInteractifs.js`.

Le sync ne copie que le code partagé (`A_COPIER` : `src/js`, `src/assets`, `src/html`, `parcours/src`, `parcours/cours.json`, les 3 `storage/provider.*.js`) et le nécessaire au site web sous `_siteWeb/` (`A_COPIER_WEB` : `index.html`, `404.html`, `sw.js`, `deploy.yml`, manifest mobile). Tout le reste (`storage/config*.json`, `storage/provider.electron.js`, `backend/**`, `index.html` Electron, `manifestCoursInteractifs.js`) est en `PRESERVE`, jamais touché. **`storage/mode.json` ne figure dans aucune des trois listes** : la copie embarquée B restera donc toujours en mode Personnel, quoi qu'il arrive à A — c'est une propriété du déploiement, pas du code partagé.

Objectif de cette tâche : rendre le dépôt A opérationnel comme plateforme (base Supabase du fournisseur, migration `0006` + correctif d'un trigger existant, 3 Edge Functions à jour), publier ce mode sur `main` de A, et fermer le piège documenté qui écrase la config du site public avec celle d'un formateur.

## Étapes

### 0. Mesures préalables (avant toute écriture)
- Confirmer l'état actuel du site public déployé (`config.json` en ligne = placeholders, à vérifier par `curl`/fetch avant de toucher à quoi que ce soit).
- Demander à l'utilisateur, au moment d'exécuter, l'URL et la clé anon du projet Supabase fournisseur — il les fournira dans le chat ; ne jamais inventer ni réutiliser une config de formateur trouvée dans un fichier local.
- Sur le vrai projet Supabase, confirmer que les policies RLS des migrations `0001`-`0005` (isolation par `owner_id = auth.uid()` + statut `approved`) sont bien celles effectivement appliquées — les fichiers de migration sont des références, pas une garantie que la prod les a reçues telles quelles.
- Relire l'Edge Function `student-progress` (elle utilise une clé `service_role` qui contourne la RLS) pour confirmer qu'elle filtre bien elle-même par tenant avant d'écrire/lire des données élève.

### 1. Migration Supabase `0006` + correctif du trigger existant, dans A
- Relire les migrations `0001`-`0005` pour identifier précisément le trigger défectueux avant d'écrire quoi que ce soit (aucun trigger fautif n'a encore été confirmé — étape d'analyse à part entière, pas une supposition).
- Fichiers : `C:\electron\coursInteractifs\supabase\migrations\0006_*.sql` (nouveau) et un correctif ciblé dans une migration existante ou une migration `0006bis` pour le trigger identifié.
- Exécuter via la CLI Supabase **depuis** `C:\electron\coursInteractifs` (`supabase link` doit être lancé là où vivent les migrations, pas depuis XSpro).
- Redéployer les 3 Edge Functions (`notify-admin-new-teacher`, `student-progress`, `superadmin`) si leur code doit changer pour accompagner la migration.

### 2. Basculer A en mode Web / plateforme
- Créer `storage/mode.json` sur `main` de A (marqueur "plateforme", absent = personnel — ne jamais le mettre sur B).
- Mettre à jour `storage/config.json` de A avec la vraie config Supabase du fournisseur (pas de placeholders).
- Laisser `deploy.yml` faire son travail normal (push sur `main` → GitHub Pages sert le nouveau `main`) — **ne pas** passer par le flux `formulaireGestionServeurDistant_ipc.js` de XSpro pour cette étape : ce formulaire écrit `storage/config.json` depuis `parametresCoursServer.json` **local** vers le repo `login/destName` d'**un formateur**, ce qui est le mécanisme de publication personnelle, pas celui de la plateforme. C'est probablement ce qui a laissé des placeholders sur le site actuel.

### 3. Forks individuels : cas d'usage légitime, pas un risque
- Vérifié : les migrations activent RLS sur toutes les tables sensibles (`app_data`, `parcours_data`) avec isolation stricte par `owner_id = auth.uid()` + statut `approved`, et la table `formateurs` est totalement verrouillée (accès uniquement via le serveur). Un formateur qui fork le dépôt A et le laisse sur la config partagée devient simplement un nouveau tenant isolé — ce n'est pas une fuite de données.
- **Décision : ne pas vider `siteModeleOwner`/`siteModeleRepo`** dans `C:\electron\XSpro\presets\commun.json` — le fork vers la base partagée est un onboarding valide. Un formateur qui veut sa propre base indépendante reste libre de remplacer `storage/config.json` sur son fork.

### 4. Rafraîchir la copie embarquée B et vérifier XSpro
- Lancer `node scripts/syncCoursInteractifs.js` (depuis `C:\electron\XSpro`) pour propager le code partagé mis à jour vers B — sans jamais toucher `storage/mode.json` ni la config du site (hors du champ du sync, par construction).
- Ouvrir l'onglet Cours Interactifs dans XSpro pour confirmer que le mode Personnel local n'est pas affecté.
- Vérifier que le mode Web de XSpro (`sitePartageWeb.js` → `presets/commun.json → sitePartageUrl`, puis `sessionWebSupabase.lireConfigDuSite()` qui fetch `storage/config.json` du site déployé) pointe bien vers le site A maintenant configuré, et affiche des données réelles au lieu de placeholders.

### 5. Nettoyage
- Le fichier `coursInteractifs/storage/config.json` modifié dans B (vu dans `git status`, écrit par un ancien passage du flux de publication personnelle de `formulaireGestionServeurDistant_ipc.js`) est sans conséquence pour le déploiement de A, mais à nettoyer/committer séparément pour clarifier l'état du dépôt XSpro.

## Vérification

- `curl`/fetch sur l'URL publique de `storage/config.json` du site A après publication → doit renvoyer la vraie config Supabase, plus de placeholders.
- Se connecter au site public déployé (navigateur) et vérifier qu'un compte formateur peut se créer/se connecter en mode multi-tenant (test bout en bout de la migration `0006`).
- Dans XSpro, mode Web activé : l'iframe Cours Interactifs doit charger le site public et afficher un parcours réel, pas une erreur de config.
- `git status` dans A et dans XSpro doit être propre après commit des changements (`mode.json`, `config.json`, migrations). `presets/commun.json` reste inchangé (décision de l'étape 3).

## Suites données (exécution réelle, 2026-09-15)

Toutes les étapes ci-dessus ont été exécutées et vérifiées en conditions réelles le même jour :

- Migration `0006` écrite, appliquée sur le projet Supabase (`alvqsatudlbifxnrwzgr`), 3 fonctions déployées.
- `storage/mode.json` + vrai `storage/config.json` publiés sur `main`, site servi par `deploy.yml`.
- Deux bugs supplémentaires trouvés en testant le site déployé pour de vrai (jamais fait avant) et corrigés : CORS absent et `verify_jwt` de la passerelle Supabase bloquant les appels anonymes sur `superadmin` et `student-progress` (`verify_jwt = false` posé dans `supabase/config.toml`, décision assumée : site pilote de démonstration, les seules données en jeu sont des jetons, noms/prénoms et emails).
- Connexion superadmin testée avec un nouveau jeton de récupération, réglage global (email de notification) vérifié non-dupliqué après plusieurs écritures (confirmation directe du correctif `0006`).
- Pré-création d'un formateur de test (`formateur-test-demo`) réalisée puis purgée : confirme que le correctif de la migration `0003` (clé étrangère `formateurs.id` → `auth.users`) fonctionne toujours.
