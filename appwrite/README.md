# Fonction serveur Appwrite — `student-progress`

Portage Appwrite de `supabase/functions/student-progress/`. Les deux existent
côte à côte : le site choisit son magasin dans `storage/config.json`, et chaque
magasin a besoin de sa propre fonction serveur.

## Pourquoi cette fonction existe

Un apprenant est anonyme. Il ne connaît que son jeton et le slug de son parcours,
jamais le formateur qui le possède. Pour valider son jeton il faut chercher,
parmi tous les formateurs, celui dont le `cours.json` contient ce slug — ce que
seule une clé d'API, qui voit toutes les lignes, permet de faire.

Sans elle, `whoami` répond 404, `user.html` en conclut que le jeton est invalide
et renvoie vers la connexion, qui renvoie vers `user.html` : **boucle infinie**.
C'est exactement ce qui se produisait sur le déploiement Appwrite, où la
fonction n'avait jamais été écrite.

## Déployer

La clé d'API se pose dans l'environnement, jamais dans un fichier du dépôt.

```bash
APPWRITE_ENDPOINT="https://fra.cloud.appwrite.io/v1" APPWRITE_PROJECT_ID="votre-projet" APPWRITE_API_KEY="votre-cle" node appwrite/deploy-student-progress.mjs
```

En PowerShell :

```powershell
$env:APPWRITE_ENDPOINT="https://fra.cloud.appwrite.io/v1"; $env:APPWRITE_PROJECT_ID="votre-projet"; $env:APPWRITE_API_KEY="votre-cle"; node appwrite/deploy-student-progress.mjs
```

Le script crée la fonction si besoin, téléverse le code et l'active. Si
`storage/config.json` porte déjà une section `appwrite` avec de vraies valeurs,
seules `APPWRITE_API_KEY` reste nécessaire.

La clé doit pouvoir lire et écrire les tables, et créer des fonctions. Elle n'est
ni écrite sur disque, ni affichée, ni journalisée.

## Le CORS n'est pas dans le code

Contrairement à Supabase, ce n'est pas la fonction qui accorde l'origine : la
console Appwrite doit déclarer une **plateforme Web** par domaine appelant. Le
script essaie de le faire, mais l'API Console refuse souvent une clé de projet
ordinaire — il vous le dira, et il faudra alors passer par
*Settings → Platforms*.

Sans plateforme déclarée, le navigateur refuse l'appel avant même qu'il parte.

## Trois accords à ne jamais rompre

Ils sont rappelés en tête de `functions/student-progress/src/main.js`, parce que
les rompre ne produit aucune erreur — seulement des données qui ne se retrouvent
plus.

1. **L'identifiant de ligne.** Appwrite n'a pas de clé composite
   `(owner_id, key)` : l'unicité est fabriquée dans l'identifiant, par un hash
   FNV-1a. `idLigne()` doit rester le jumeau exact de
   `AppwriteProvider.prototype._docId` (`storage/provider.appwrite.js`). S'ils
   divergent, la progression écrite par l'apprenant atterrit dans une ligne que
   l'application formateur ne lira jamais.
2. **`value` est une chaîne JSON**, pas du JSON natif comme le `jsonb` de
   Supabase. Parser à la lecture, sérialiser à l'écriture.
3. **Le champ qui porte le jeton est `id`**, jamais `token`. La version Supabase
   garde la trace d'un bug où cette confusion faisait échouer *toutes* les
   autorisations.

## Vérifier sans navigateur

```bash
curl -s -X POST "https://fra.cloud.appwrite.io/v1/functions/student-progress/executions" -H "X-Appwrite-Project: VOTRE_PROJET" -H "Content-Type: application/json" -d '{"body":"{\"action\":\"whoami\",\"slug\":\"VOTRE_SLUG\",\"token\":\"VOTRE_JETON\"}","async":false}'
```

Attendu : `{"found":true,"name":"…","class":"…"}`. Avec un jeton inventé :
`{"found":false}` — et surtout pas une erreur, la distinction compte (voir
ci-dessous).

## Une panne n'est pas un jeton invalide

`studentProgressBridge.js` distingue désormais deux échecs :

- `{ found: false }` — le service a répondu : ce jeton est inconnu.
- `{ found: false, erreur: '…' }` — le service n'a pas pu répondre.

Dans le second cas, les pages s'arrêtent et affichent « service momentanément
indisponible » au lieu de rediriger. C'est ce qui empêche qu'une panne
d'infrastructure se transforme à nouveau en boucle.

## Connu, non traité

`app_data` et `parcours_data` sont lisibles **sans authentification** : avec le
seul identifiant public du projet, on lit la liste des apprenants, jetons
compris, et leurs progressions. Cette fonction ne change rien à cela — elle
permet de le corriger, en rendant possible de fermer ces permissions, mais les
fermer casserait l'application formateur tant qu'elle lit elle aussi
anonymement. À traiter avec la session formateur.
