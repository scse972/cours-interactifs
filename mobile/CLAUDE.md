# 📱 Correction en salle — application téléphone (PWA)

> **Lis ce fichier en entier avant d'écrire une ligne.** Il contient des décisions déjà
> prises, un piège d'architecture qui coûterait une session à découvrir seul, et une
> liste de choses qu'il ne faut surtout pas refaire.

---

## Objectif

Faire de l'outil formateur **« ✍️ Correction en salle »** (`src/html/suiviAtelier.html`) une
application installable sur téléphone : icône sur l'écran d'accueil, ouverture en plein écran
sans barre d'adresse, caméra fonctionnelle, et fonctionnement dégradé quand le réseau tombe.

Le formateur circule dans la salle, scanne le QRCode affiché sur l'écran d'un apprenant, et
corrige la question sur place.

**C'est fait.** Ce qui suit décrit ce qui a été construit, pourquoi, et ce qu'il ne faut pas
défaire.

---

## Décisions déjà prises — ne pas les rouvrir sans raison

| | |
|---|---|
| **Forme** | Une **PWA** : manifeste + service worker. Aucune chaîne de compilation, aucun magasin d'applications. Capacitor pourra emballer les mêmes fichiers plus tard si un vrai APK devient nécessaire. |
| **Emplacement** | **Ce dossier**, dans le dépôt `coursInteractifs` — sauf `sw.js`, qui doit être à la racine (voir plus bas). C'est l'application qui est indépendante, pas le code. |
| **Duplication** | **Zéro.** L'appli réutilise `../src/js/…` tel quel. Ne recopie aucun module, ne réimplémente aucun calcul. |

Cette dernière règle n'est pas une préférence de style. Ce projet a déjà payé cher la
duplication : le barème d'une question existait en quatre exemplaires avec deux comportements
différents, le statut de rendu était écrit depuis six endroits sans que cinq d'entre eux posent
la date dont dépendait la lecture, et deux paires de champs portaient la même information sous
des noms différents. Plusieurs sessions ont été consacrées à réconcilier tout cela. **Une
troisième copie des modules nous y ramènerait.**

---

## Ce qui existe déjà, et qu'il ne faut pas refaire

`src/html/suiviAtelier.html` est **complet et fonctionnel**. Il fait déjà :

- l'authentification formateur (mot de passe, session) ;
- trois entrées vers une question : le code de validation dicté du mode Atelier AR, la charge
  d'un QRCode (scan caméra ou collage), et une navigation par liste apprenant → chapitre →
  question ;
- deux chemins de correction : le rituel de l'AR, et l'écriture directe de la note et du
  commentaire ;
- le commentaire général de chapitre ;
- **le scanner caméra**, déjà écrit : chargement du décodeur à la demande, boucle de décodage,
  garde contre le double démarrage, coupure du flux en quittant l'écran.

Sa mise en page est déjà pensée pour un téléphone tenu à une main : largeur maximale 560 px,
un seul écran à la fois, cibles larges. Son CSS vit dans un `<style>` en tête du fichier, il ne
dépend pas de `teacher.css`.

**Il n'y avait donc pas d'interface à écrire.** Le travail était d'emballer l'existant.

---

## Ce qui a été construit

| Fichier | Rôle |
|---|---|
| **`../sw.js`** *(racine du dépôt)* | Le service worker. Sa portée doit couvrir `/src/html/` — voir le piège ci-dessous. |
| `manifest.webmanifest` | Le manifeste : nom, icônes, `display: standalone`, `start_url`, couleurs. |
| `icones/` | `icone-192.png`, `icone-512.png`, `icone-maskable-512.png`, `apple-touch-icon-180.png`. |
| `outils/genererIcones.py` | Produit les quatre icônes (Pillow, aucune autre dépendance). Le dépôt n'avait aucun fichier image ; les regénérer doit rester possible. |

Et trois modifications dans l'existant :

- `src/html/suiviAtelier.html` — les balises PWA dans le `<head>`, le bouton d'aide `?` du titre,
  et l'enregistrement du service worker en fin de `<body>` ;
- `src/js/aide.js` — la fiche **`applicationTelephone`**, celle qu'ouvre le `?` : installation,
  limites du scan, hors-ligne, caméra, réserve iOS. C'est la documentation destinée au formateur ;
  celle-ci s'adresse à qui reprend le code. **Si l'une change, l'autre doit changer avec elle** ;
- `src/js/atelier/suiviAtelier.js` — la coupure de la caméra sur `visibilitychange`. Installé sur
  un écran d'accueil, l'outil a une sortie que le navigateur n'offrait pas : passer en
  arrière-plan. Sans cela le flux survivrait à l'application réduite.

---

## ⚠️ Le piège d'architecture — tranché

**La page à installer ne vit pas dans ce dossier.** Elle est à `/src/html/suiviAtelier.html`.

Or un service worker ne contrôle que les pages situées **sous son propre chemin**. Un
`mobile/sw.js` aurait pour portée `/…/mobile/` et **ne contrôlerait jamais**
`/src/html/suiviAtelier.html`. L'en-tête HTTP `Service-Worker-Allowed`, qui permettrait
d'élargir la portée, n'est pas configurable sur GitHub Pages.

**Issue retenue : `sw.js` à la racine du dépôt.** Portée `/cours-interactifs/` en production,
`/` en local. Le manifeste et les icônes restent ici.

Les deux autres issues ont été écartées : déplacer la page est **interdit** (voir la contrainte
sur le nom de fichier), et recopier le balisage dans `mobile/index.html` dupliquerait le HTML.

Le corollaire est la seule vraie difficulté du lot, et il est traité au chapitre suivant.

---

## Le corollaire : ne pas abîmer le site apprenant

Un `sw.js` à la racine voit passer les requêtes de **tout** le site. Une fois installé sur un
profil de navigateur, il contrôle aussi `login.html`, `user.html`, `teacher.html` et
`parcours/src/chapter_template.html` — qui chargent tous `config.js`, `storage.js`, `parcours.js`,
`progressManager.js` et `style.css`. Sur un poste de salle partagé, c'est un scénario banal.

Servir à un apprenant une vieille copie de l'un de ces fichiers serait une régression silencieuse
et **durable** : les écritures fautives dorment ensuite dans `_sync_queue` et se rejouent plus
tard. Deux gardes s'y opposent, et il ne faut retirer ni l'une ni l'autre.

**1. Réseau d'abord** (timeout 2,5 s, repli sur le cache). En ligne, tout vient du réseau ; le
cache n'est qu'un secours. Et **toute réponse valide réécrit son entrée de cache** — le cache suit
donc le réseau tout seul. C'est ce *write-through* qui fait qu'**il n'y a aucun numéro de version
à incrémenter à la main** : le nom du cache est stable (`correction-en-salle`) et l'`activate` le
réconcilie avec la liste. Un cache-first, ou un stale-while-revalidate, auraient tous deux servi
du JavaScript périmé après chaque déploiement.

**2. Garde par référent.** Le worker ne répond qu'aux requêtes dont le référent est
`suiviAtelier.html`. Une page apprenant traverse `sw.js` sans être touchée — vérifié : serveur
coupé, une page apprenant n'obtient **rien** du cache, alors que l'outil formateur obtient tout.
C'est cette garde qui fait tomber le rayon d'action de « tout le site » à « une page ».

---

## Contraintes dures

**Le nom `suiviAtelier.html` est contractuel.** `XSpro/main.js` teste cette URL dans son
`setWindowOpenHandler` pour accorder l'accès au stockage à la popup. Le renommer ou le déplacer
casserait l'intégration XSpro en silence. C'est écrit en tête du fichier.

**`src/html` est recopié dans XSpro** par `syncCoursInteractifs.js` : les modifications de
`suiviAtelier.html` y partent. Tout ce qui y a été ajouté est donc inerte sous `file:` —
l'enregistrement est gardé par `IS_ELECTRON`, et le `<link rel="manifest">` y produit un 404
silencieux, sans conséquence. **Ne pas ajouter `mobile/` à `A_COPIER`** : une PWA n'a aucun sens
dans l'application de bureau.

**La caméra exige un contexte sécurisé — mais elle n'est pas la seule.** `_cameraDisponible()`
ne teste ni le protocole ni `isSecureContext` : il teste `!IS_ELECTRON && !!navigator.mediaDevices
?.getUserMedia`. C'est `mediaDevices`, absent hors contexte sécurisé, qui produit le bon résultat
— par effet de bord, jamais par un test nommé.

**Et le QRCode dépend d'autre chose encore.** La charge porte une empreinte SHA-256
(`qrCharge.js`), calculée par `AtelierCodes.condensat()` via **`crypto.subtle`**, lui aussi réservé
aux contextes sécurisés. Conséquence à retenir :

| Contexte | Données | Caméra | QRCode & AR | Installation |
|---|---|---|---|---|
| GitHub Pages (HTTPS) | oui | **oui** | **oui** | **oui** |
| `localhost` (poste de dev) | oui | oui | oui | oui |
| Réseau local (`http://192.168…`) | oui | non | **non** | non |
| Dans XSpro (`file:`) | base SQLite locale | non | non | non |

Sur une adresse locale en HTTP, **coller la charge à la main ne contourne rien** : c'est
l'empreinte qui manque, pas la caméra. Il reste le code de validation dicté et la navigation par
liste, qui ne calculent aucune empreinte.

**Le fournisseur de données est choisi par l'adresse et par `storage/config.json`.** Sur GitHub
Pages, `window.BASE` vaut `/cours-interactifs`. Le worker n'y a pas accès : il déduit sa racine de
sa propre adresse (`new URL('./', self.location)`). Le manifeste, lui, n'utilise que des chemins
**relatifs**, qui se résolvent contre son propre URL — justes en production comme en local.

**Le déploiement est automatique.** `.github/workflows/deploy.yml` publie **tout le dépôt** sur
GitHub Pages à chaque poussée sur `main`. Il n'y a pas d'étape de compilation : ce qui est
commité est ce qui est servi.

---

## Ce que le service worker met en cache — et ce qu'il ne fait pas

Dix-sept entrées, ~480 Ko, en deux vagues (la liste fait foi dans `sw.js`) :

```
Légère (~65 Ko)   suiviAtelier.html, style.css, config.js, parcours.js, storage.js,
                  atelierCodes.js, qrCharge.js, aide.js, bareme.js, progressManager.js,
                  atelier/suiviAtelier.js, storage/config.json,
                  provider.supabase.js + provider.appwrite.js + provider.sqlite.js
Lourde (~360 Ko)  vendor/jsqr.js, parcours/cours.json
```

Trois choix qui méritent leur explication :

- **Les trois providers**, pas seulement celui qui sert aujourd'hui. `config.json` choisit au
  runtime, et `deploySite()` (XSpro) peut le basculer — d'Appwrite à Supabase, par exemple.
  Manquer celui qui sera choisi coûterait le hors-ligne, sans prévenir.
- **`jsqr.js` (257 Ko) est précaché**, bien qu'il soit chargé à la demande. Les deux ne s'opposent
  pas : le chargement paresseux protège le chemin critique de rendu de la page, le précache a lieu
  à l'installation du worker, en arrière-plan. Sans lui, pas de scan hors ligne.
- **`cours.json` a un rafraîchissement à part.** `staticJson` interroge le **provider d'abord** et
  ne retombe sur le fichier statique que s'il rend `null` : en ligne, ce fichier n'est donc presque
  jamais demandé, et le write-through ne le toucherait jamais. `sw.js` le re-télécharge à chaque
  navigation vers la page. Sans cela sa copie vieillirait sans fin — et un barème périmé ne produit
  pas un défaut d'affichage, mais une note fausse, rejouée plus tard par `_sync_queue`.

**Ce que le worker ne fait pas, délibérément** — c'est écrit en tête de `sw.js`, ne pas le défaire :

- **aucun mécanisme hors-ligne pour les données.** `storage.js` a déjà son cache localStorage
  (`_cache_*`), sa file d'écritures (`_sync_queue`) et son bandeau d'état. Pas de Background Sync
  non plus : doublon de `SyncManager`, et absent d'iOS ;
- **aucun fallback de navigation générique.** `index.html` et `404.html` portent la logique de
  redirection par slug ; les figer casserait les liens profonds ;
- **aucune interception de Supabase ni d'Appwrite.** `provider.supabase.js` impose
  `cache: 'no-store'` avec une justification explicite. Le filtre d'origine s'en charge.

---

## Les limites d'usage — ce ne sont pas des bugs

À ne pas « réparer » plus tard. Elles sont dites au formateur dans la fiche `applicationTelephone`.

- **Ouvrir l'application en ligne en début de séance.** `QRCharge.resoudre()` a besoin de
  `users_list` ; hors ligne elle ne sort du cache localStorage que si elle a été lue en ligne
  auparavant. Aucune stratégie de cache HTTP ne remplace cela.
- **Sur iOS, le stockage de l'app d'écran d'accueil est cloisonné à part de Safari** : session
  formateur, cache `_cache_*` et file `_sync_queue` ne sont pas partagés. Il faut se reconnecter
  dans l'app, et une file en attente dans Safari ne s'y videra pas. iOS purge par ailleurs les
  données d'un site **non installé** après ~7 jours : le hors-ligne n'y tient que si l'app est
  réellement installée.
- **`start_url` ne porte pas de `?parcours=`** : l'application démarre sur le sélecteur, le
  parcours changeant à chaque séance.
- **La liste des 17 URL de `sw.js` est figée à la main.** Un renommage dans `src/js/` la casse sans
  alerte, et le seul symptôme serait la perte silencieuse du hors-ligne.

---

## Le coupe-circuit

On ne peut pas passer sur chaque téléphone. Pour retirer un worker cassé du parc, **remplacer le
contenu de `sw.js`** par un stub auto-désinscrivant :

```js
self.addEventListener('install',  e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
    for (const n of await caches.keys()) await caches.delete(n);
    await self.registration.unregister();
    await self.clients.claim();
})()));
```

Il prend effet dès la vérification suivante, sans attendre les dix minutes du cache HTTP de
Pages — c'est à cela que sert `updateViaCache: 'none'` à l'enregistrement.

**Ne pas se contenter de supprimer `sw.js` du dépôt** : le comportement du navigateur face à un
404 pendant la mise à jour est un comportement de bord sur lequel il ne faut pas parier.

Sur un poste : DevTools → Application → Service Workers → *Unregister* + *Clear site data*.

---

## Vérification

### Déjà fait, sur le poste (`npx http-server . -p 8000`)

`http://localhost:8000` est un contexte sécurisé au même titre que HTTPS : worker, caméra et
`crypto.subtle` y fonctionnent. Ce qui a été vérifié :

1. Worker actif, portée `/`, les **17 entrées** en cache, jsQR compris.
2. Manifeste servi en `application/manifest+json` ; `start_url`, `scope`, `id` et les trois icônes
   se résolvent correctement — les chemins relatifs tiennent en local comme en production.
3. Le `?` ouvre la fiche `applicationTelephone`, ses cinq sections comprises.
4. **Hors ligne** (serveur coupé) : `suiviAtelier.html?parcours=essai` se recharge entièrement,
   sept écrans, tous les modules chargés — et le cache ne contient toujours **qu'une** entrée pour
   la page, sans la query string : la normalisation tient.
5. **Non-régression, serveur coupé** : depuis une page apprenant, `storage.js`, `config.js`,
   `style.css` et `cours.json` échouent tous. Depuis l'outil formateur, tous sont servis. La garde
   par référent fait exactement ce pour quoi elle est là.
   *(Ne pas se fier à `workerStart > 0` ni à la colonne Size de DevTools : ils sont renseignés dès
   que la requête est présentée au worker, même quand il refuse d'y répondre. Le seul test probant
   est celui-ci, réseau coupé.)*
6. **Write-through** : un marqueur ajouté à `bareme.js`, un simple rechargement en ligne, **sans
   toucher à aucune version** — la copie en cache porte le marqueur. Marqueur retiré, rechargement,
   il disparaît du cache. C'est la validation de la sûreté de tout le dispositif.
7. Le site apprenant s'ouvre normalement en ligne avec le worker actif, toutes ressources en 200.

### Restant à faire, sur un vrai téléphone

Après déploiement sur
`https://scse972.github.io/cours-interactifs/src/html/suiviAtelier.html` :

8. **Installation** : l'invite apparaît (Android) ou Partager → « Sur l'écran d'accueil » (iOS,
   jamais d'invite). Icône présente, ouverture en plein écran sans barre d'adresse.
9. **Le scan, pour de vrai.** Il n'a **jamais tourné devant une caméra réelle** : la boucle a été
   écrite et déboguée à l'aveugle, en testant les valeurs de retour et les gardes. **C'est la
   vérification la plus importante du lot.** Viser le QRCode agrandi (un clic sur la vignette du
   bandeau apprenant l'ouvre en 280 px — la vignette de 28 px n'est pas scannable, c'est voulu).
   Vérifier aussi qu'un QRCode d'un apprenant inconnu affiche un message **et laisse la boucle
   tourner**.
10. **Le voyant s'éteint** en quittant l'écran de scan, **et** en passant l'application en
    arrière-plan.
11. **Démarrage à froid hors ligne** : ouvrir l'app une fois en ligne, la tuer, mode avion,
    relancer depuis l'icône.
12. **Popup XSpro** : ouvrir l'outil depuis le tableau de bord sous Electron — bloc caméra toujours
    absent, aucun enregistrement tenté, comportement inchangé.

Débogage sur téléphone : Android → `chrome://inspect#devices` en USB, panneau Application complet,
qui marche aussi bien sur la page publiée que sur `localhost`. iOS → Safari macOS, menu
Développement (l'app d'écran d'accueil est une cible distincte).

*(Ne pas compter sur Lighthouse : la catégorie PWA en a été retirée depuis la v12. C'est
DevTools → Application → Manifest qui liste les erreurs d'installabilité.)*

---

## Pour comprendre le reste

| Document | Contenu |
|---|---|
| `qrcode question.md` | Le QRCode de question : format figé de la charge, l'outil formateur, le scanner |
| `mode atelier AR.md` | Le rituel de l'AR — plusieurs choix y sont contre-intuitifs et protègent la fonction du dispositif |
| `DETAILS_VUES.md` | Le barème, le bilan, le statut de rendu |
| `README.md` | L'architecture d'ensemble |

**Le format de la charge `XSQ1|…` est figé** : il est imprimé sur tous les écrans des apprenants.
Sa source unique est `src/js/qrCharge.js`. Ne pas le réimplémenter, ne pas le changer.
