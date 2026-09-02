# 🔳 QRCode de question

> Le format de la charge utile est **figé** : il est imprimé sur tous les écrans, on ne
> pourra plus le changer sans les réimprimer tous. Sa source unique de vérité est
> `src/js/qrCharge.js`, partagée par la page chapitre qui l'écrit et l'outil formateur qui
> la lit — ne pas la réimplémenter d'un côté ou de l'autre.
>
> Ce qui reste à faire est en §6.

---

## 1. Intention

Pour commenter le travail affiché devant lui, le formateur qui circule dans la salle devait
retrouver dans son tableau de bord la classe, l'apprenant, le chapitre, puis la question. Quatre
recherches pour désigner ce qu'il a sous les yeux.

Le bandeau de chaque question porte donc désormais **un QRCode et le nom de l'apprenant**. Scanné
depuis l'outil formateur, le QRCode désigne exactement une question d'un apprenant, et y ouvre la
saisie — commentaire de question, commentaire général de chapitre, points.

Le nom sert à deux choses : identifier de visu l'écran devant lequel on se trouve, et vérifier
après le scan qu'on est bien sur le bon apprenant.

C'est le même service que rend le mode Atelier AR, mais **sans son rituel**. Là-bas la dictée d'un
code à 6 caractères est lente *à dessein* : l'échange oral fait partie de l'objectif pédagogique
(voir `mode atelier AR.md`). Ici on veut l'inverse — aller au plus court, sur toutes les questions
de tous les modes.

---

## 2. Ce que contient le QRCode — format figé

```
XSQ1|{slug}|{empreinte}|{chapitreId}|{questionId}
```

Exemple réel, 65 caractères :

```
XSQ1|_1779807435947|58ad48a4d49b|_1779826730874|_1779826730874_q1
```

| Champ | Rôle |
|---|---|
| `XSQ1` | Marqueur et version. L'outil formateur **refuse** tout ce qui ne commence pas par là ; le `1` permettra d'en changer plus tard sans ambiguïté. |
| `\|` | Séparateur. Surtout pas `_` : les identifiants sont des horodatages préfixés (`_1779826730874`) qui en contiennent déjà. |
| `{slug}` | Le parcours, pour préfixer les clés côté formateur. |
| `{empreinte}` | SHA-256 de `« slug:token »` tronqué à 12 caractères hexadécimaux — **et non le token**. |
| `{chapitreId}` | `ChapterSession.chapterId`. |
| `{questionId}` | `section.dataset.questionId`. |

### Pourquoi une empreinte et pas le token

Le token **est** l'identifiant de connexion de l'apprenant — `findUserByToken()` le compare
littéralement à `u.id` (`src/js/dataStorage.js`). Le publier en lisible-machine sur tous les écrans
de la salle serait gratuitement imprudent : n'importe qui photographiant l'écran d'un camarade
repartirait avec de quoi se connecter à sa place.

L'outil formateur résout l'empreinte en balayant `{slug}:teacher:users_list` et en comparant les
condensats — il possède déjà cette liste, et cette habitude de balayage (`_chercherCodeDirect()`
dans `src/js/atelier/suiviAtelier.js` fait la même chose sur les clés de storage). 12 caractères
hexadécimaux valent 48 bits : aucune collision à l'échelle d'un établissement.

Le condensat est calculé par `QRCharge.empreinte()`, bâtie sur `AtelierCodes.condensat()`
(`src/js/atelier/atelierCodes.js`) — SHA-256 via `crypto.subtle`, déjà éprouvé sur GitHub Pages, en
local et en Electron sur `file:`.

`QRCharge` expose les quatre gestes du format : `empreinte()`, `construire()`, `lire()` — qui refuse
tout ce qui n'a pas le préfixe et les cinq segments — et `resoudre()`, qui retrouve le token en
recalculant l'empreinte de chaque apprenant du parcours. Pas d'index à tenir, donc rien à maintenir
à jour ; une liste de classe se parcourt en quelques millisecondes.

### Rien n'est écrit en base

Contrairement aux tickets du mode Atelier (`{slug}:atelier:code_XXXXXX`, une clé écrite au moment
où l'apprenant se déclare prêt), **la charge utile est autoporteuse** : le scan ne dépend d'aucun
aller-retour préalable, et l'affichage ne coûte aucune écriture.

C'est ce qui rend l'affichage possible sur *toutes* les questions de *tous* les chapitres. Un
ticket par question multiplierait les clés sans rien apporter, et polluerait la file de
synchronisation hors-ligne.

---

## 3. Comment c'est affiché

`src/js/qrQuestion.js`, calqué sur `src/js/atelier/atelierQuestion.js`.

Le HTML des questions est **pré-généré et figé** dans `parcours/cours.json` (`item._html`) : on ne
le touche jamais. On décore le DOM après affichage, en insérant dans `.question-meta` un
`<button class="qr-badge">` puis un `<span class="qr-nom">`.

L'appel est fait depuis `src/js/chapitre.js`, dans le même `setTimeout` que
`AtelierQuestion.init()` — donc après `restoreAllAnswers()` et après le tirage d'ordre : les
sections sont alors en place et à leur position définitive. Le tri de `chapterOrdre` et la
pagination déplacent ou masquent des nœuds sans les recréer, la décoration y survit.

### La vignette n'est pas scannable, et c'est voulu

La vignette du bandeau fait **28 px de QRCode**, soit 31 px avec sa marge et sa bordure — très
exactement la hauteur de `.points-badge`. **Le bandeau garde donc la hauteur qu'il avait** (mesuré :
66,9 px avant comme après). C'est une contrainte de départ : le bandeau ne doit pas devenir plus
imposant.

À cette taille, une charge de 65 caractères (QRCode version 5, 37 modules de côté) est illisible
pour une caméra. La vignette est une **affordance** : un clic ouvre le QRCode en grand — 280 px,
avec le nom et le titre de la question — et c'est celui-là qu'on scanne. Fermeture par la croix, le
fond, ou Échap. Une seule modale, réutilisée : douze questions ne doivent pas faire douze nœuds.

> ⚠️ **Conséquence à assumer** : le formateur ne peut pas scanner un écran sans que quelqu'un ait
> d'abord cliqué la vignette. Si ce geste s'avère gênant à l'usage, il faudra trancher autrement —
> par exemple un QRCode unique et plus grand en pied de page, au prix de perdre la désignation de
> la question.

### Quand le QRCode s'affiche

| Contexte | QRCode | Pourquoi |
|---|---|---|
| Apprenant connecté | affiché | le cas nominal |
| Simulation apprenant (`SIMU001`) | affiché | l'interface y est vivante à dessein — le formateur doit voir ce que l'apprenant voit ; le nom affiché est « Simulation formateur » |
| Vue formateur (`teacher_view=true`) | **masqué** | prévisualisation en lecture seule, sur l'écran du formateur : il n'a rien à se scanner à lui-même |
| Sans token (`_guest`, `anonymous`) | **masqué** | rien à résoudre côté formateur |
| Apprenant absent de `users_list` | **masqué** | pas de nom, donc pas d'identification possible : le module s'abstient entièrement plutôt que d'afficher un QRCode anonyme |
| Impression | **masqué** | `@media print` |

Toute erreur pendant la décoration est avalée avec un `console.warn` : **un QRCode absent ne doit
jamais empêcher de répondre aux questions.**

---

## 4. La bibliothèque QRCode

`src/js/vendor/qrcode-generator.js` — [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)
de Kazuhiko Arase, licence MIT, un seul fichier de 56 Ko, sans dépendance, sortie SVG via
`createSvgTag({ scalable: true })`.

**Vendorée, pas chargée depuis un CDN** : le site doit fonctionner hors-ligne et en Electron sur
`file:`. Pour la mettre à jour :

```bash
npm install --no-save qrcode-generator
cp node_modules/qrcode-generator/dist/qrcode.js src/js/vendor/qrcode-generator.js
```

> **L'emplacement `src/js/vendor/` est volontaire**, et pas `src/vendor/`. Le script de
> synchronisation de la copie embarquée dans XSpro ne reprend que `src/js`, `src/assets`,
> `src/html`, `parcours/src`, `parcours/cours.json` et les providers (constante `A_COPIER` de
> `XSpro/scripts/syncCoursInteractifs.js`). Sous `src/js/vendor/`, le fichier suit tout seul ;
> ailleurs il faudrait modifier le script côté XSpro.

Le SVG est produit en mode `scalable` — aucun attribut `width`/`height`, la taille est laissée au
CSS. La même image sert donc la vignette et l'agrandissement.

---

## 5. L'outil formateur — « ✍️ Correction en salle »

`src/html/suiviAtelier.html` — la page mobile du mode Atelier AR, enrichie plutôt que doublée.
Le rituel AR y est **conservé tel quel** ; ce qui s'ajoute, c'est une autre porte d'entrée et un
second chemin d'écriture.

Le libellé du bouton du tableau de bord a suivi : « 🧾 Suivi Atelier » décrivait ce que l'outil
faisait, pas ce qu'il fait. **Le fichier, lui, garde son nom** — `XSpro/main.js` teste l'URL
`/src/html/suiviAtelier.html` pour accorder l'accès au stockage à la popup ; le renommer casserait
cela en silence.

On y entre désormais de **trois** façons : le code de validation dicté, la charge d'un QRCode, ou la
liste des apprenants.

### 5.1 Entrer par la charge

Écran `scan`, accessible depuis l'écran du code **et** depuis celui du choix de parcours — la charge
portant son propre `slug`, on peut y arriver sans avoir choisi de parcours.

`SuiviAtelier._ouvrirCharge()` lit la charge, adopte le parcours qu'elle désigne, résout l'empreinte
contre `{slug}:teacher:users_list`, puis appelle `_ouvrir(token, chapitreId, questionId, null)` —
la même méthode que le code dicté. Elle était déjà générique : son paramètre `code` n'était que
rangé dans le contexte, jamais relu.

Deux différences de nature avec le code de validation :

| | Code de validation | Charge du QRCode |
|---|---|---|
| Suppose | un ticket écrit en base par l'apprenant | rien |
| Porte sur | les seules consignes déclarées prêtes | **n'importe quelle question** |
| Le parcours | doit être connu, ou déduit du balayage des clés | est dans la charge |

La saisie se fait dans son propre champ : `#champ-code` ne peut pas servir, `AtelierCodes.normaliser()`
filtre sur l'alphabet Crockford et **supprimerait les `|`**.

### 5.2 Deux chemins de correction, deux boutons

Jamais un bouton qui change de sens :

- **`Valider et générer l'AR`** — affiché **seulement** sur une consigne d'un chapitre joué en
  Atelier. Inchangé : champs d'attente `arPoints` / `arAppreciation`, promus en points par la saisie
  de l'AR chez l'apprenant. La lenteur y est le dispositif, on n'y touche pas.
- **`Enregistrer la correction`** — toujours affiché. `teacherScore`, `teacherComment`,
  `manualCorrectionStatus`, écrits tout de suite par `ProgressManager.teacherCorrectQuestion()`,
  exactement comme depuis le tableau de bord après le rendu d'une copie. Aucun accusé de réception.

Le mode effectif est résolu comme le fait `core/getExamContext.js` : `frozenChapterMode` de
l'apprenant s'il existe, sinon `chapterMode` de `{slug}:config:chapter_config`. Le mode figé prime,
sinon le formateur qui change le mode en cours de route changerait le contrat sous les pieds de ceux
qui ont commencé.

> Le bouton AR est masqué hors rituel, mais **la touche Entrée soumet quand même le formulaire** :
> `_emettre()` redirige alors vers `_enregistrerDirect()`. Sans cette garde, une question ordinaire
> déclencherait un AR.

Un troisième champ, replié, porte le **commentaire général du chapitre**
(`chapters[id].globalComment`) avec son propre bouton : on doit pouvoir commenter l'activité sans
toucher à la note d'une question.

### 5.2 bis  La navigation par liste — apprenant → chapitre → question

Le repli d'origine ne servait qu'une panne : le code vient d'être généré, le réseau est tombé, la clé
du ticket n'est pas encore lisible côté formateur. Il listait donc les apprenants, puis **leurs
seules consignes en attente d'AR** — une question ordinaire n'y apparaissait jamais.

Il compte maintenant trois niveaux, et lit **`cours.json`** plutôt que la progression : un chapitre
que l'apprenant n'a jamais ouvert doit rester atteignable.

| Niveau | Contenu |
|---|---|
| 1 | les apprenants du parcours (les formateurs sont écartés) |
| 2 | les **consignes en attente d'AR** hissées en tête — c'est le geste le plus fréquent — puis tous les chapitres, avec leur état de rendu |
| 3 | toutes les questions du chapitre, avec une pastille : ⚪ non répondue · 🔵 répondue · 🧾 validation demandée · ✍️ corrigée |

Le clic final appelle `_ouvrir(token, chapitreId, questionId, null)`, la même méthode que le scan.

C'est le seul chemin qui n'exige **ni QRCode ni caractères à saisir** : celui qu'on prend devant un
écran en veille, ou depuis son bureau. Les trois niveaux se remplacent dans le même conteneur — la
page reste « un seul écran à la fois », principe posé en tête de sa feuille de style.

### 5.3 Ce que l'apprenant voit — la règle

**Rien de plus qu'avant.** Les règles de visibilité existantes s'appliquent inchangées : une note
manuelle n'apparaît que là où elle apparaissait déjà, et au moment où elle apparaissait déjà.
L'outil est une autre porte d'entrée pour le formateur, **pas un nouveau canal vers l'apprenant**.

Aucune mise à jour en direct non plus : rien n'est poussé, rien ne se rafraîchit sous les yeux de
l'apprenant. S'il ferme et rouvre son chapitre, il retrouve l'état qu'il aurait eu si le formateur
avait commencé à corriger sa copie depuis le tableau de bord.

C'est vrai **par construction**, et pas par précaution : `recomputeChapterStats()` appelle
`recomputeSubmissionStatus()`, qui dérive le statut de `approvedAt` / `revisionRequestedAt` /
`submittedAt` **et de rien d'autre**. Corriger une question ne peut donc pas faire basculer un
chapitre en `validated`, seul état qui ouvre le corrigé à l'apprenant.

Deux ajustements ont malgré tout été nécessaires, tous deux internes au mode Atelier — où le contrat
du mode est justement le retour immédiat.

**Un 4ᵉ état de consigne, `corrigee`.** Sans lui, une consigne notée directement continuait
d'afficher « Je me déclare prêt » et l'avertissement au rendu continuait d'annoncer « comptera pour
0 point ». Deux mensonges. L'état est **déduit** de `manualCorrectionStatus`, aucun champ n'est
ajouté en base :

```
brouillon → demandee → validee      le rituel de l'AR
brouillon → corrigee                noté directement, sans rituel
```

`corrigee` passe **après** `validee` et **avant** `demandee` : une consigne notée en direct alors
qu'un code dormait encore doit cesser d'afficher ce code, sinon l'apprenant relancerait un rituel
déjà tranché.

**Le bilan cesse de se contredire.** `chapterBilan.js` comptait les questions manuelles sur
`isCorrect` seul : une consigne validée par AR affichant « 8 / 10 » dans son bloc apparaissait
« ⏳ En attente, +0 » deux écrans plus bas. Le défaut existait déjà. Il compte désormais
`teacherScore` **exactement quand l'apprenant connaît déjà cette note** — corrigé ouvert
(`submissionStatus === 'validated'`), ou bloc Atelier qui l'affiche. Le prédicat est exposé là où il
est déjà vrai, `AtelierQuestion.pointsAffiches()`, plutôt que dupliqué. Hors de ces cas, rien ne
change : une question manuelle notée en direct dans un chapitre Découverte reste « ⏳ En attente ».

Le compteur « ⭐ Points obtenus » du bandeau n'est **pas** touché : `computeChapterUIStats()` ne
parcourt que les questions auto et son titre l'annonce (« Exercices auto-corrigés »).

### 5.4 Le scanner caméra — hors XSpro seulement

Le décodeur `src/js/vendor/jsqr.js` (jsQR, Apache-2.0) pèse 250 Ko pour un geste que la plupart des
ouvertures de l'outil ne feront pas : il est **chargé à la demande**, au démarrage de la caméra, pas
par une balise `<script>`.

Le bloc caméra n'est monté que si `!window.IS_ELECTRON && navigator.mediaDevices?.getUserMedia`.
**Dans XSpro il n'apparaît pas** : la page y tourne en `file:` sous Electron, aucune permission
média n'est accordée, et rien n'a été ajouté à `XSpro/main.js` pour en accorder. Le collage de la
charge reste disponible partout, y compris là.

Le flux est coupé dès qu'on quitte l'écran de scan (`_ecran()` s'en charge) : une lampe témoin qui
reste allumée dans une salle de classe est un problème en soi.

### 5.4 bis  Là où il n'y a pas de caméra : la charge en clair

L'écran de scan propose aussi de **coller** la charge. Encore faut-il pouvoir la lire : la modale
d'agrandissement l'affiche donc sous le QRCode, en monospace, avec un bouton « 📋 Copier »
(`navigator.clipboard` exige un contexte sûr et une activation ; à défaut on sélectionne le texte et
l'utilisateur copie lui-même). La zone est en `user-select: all` — un clic suffit à tout prendre.

**C'est ce qui rend le collage utilisable dans XSpro** : la page chapitre et l'outil y sont deux
fenêtres de la même application, donc le même presse-papier. En vraie salle, en revanche, le
presse-papier ne traverse pas la pièce et 65 caractères ne se dictent pas — c'est la navigation par
liste (§5.2 bis) qui répond, pas le collage.

La charge ne contient **aucun secret** : le token n'y figure pas, seulement son empreinte.

### 5.5 Sur la règle d'architecture

L'en-tête de `suiviAtelier.js` interdit d'y importer `correctionModal` et `teacherDashboard`,
c'est-à-dire le tableau de bord — c'est cette indépendance qui permettra d'emballer l'outil en
application mobile. `progressManager.js` y est désormais chargé : c'est le **modèle de progression**,
même couche que `storage` et `atelierCodes`, sans effet de bord au chargement. Réimplémenter son
recalcul de chapitre aurait produit deux vérités qui dérivent.

---

## 6. Reste à faire

- Le scanner caméra n'a pas encore été essayé sur un vrai téléphone : la boucle de décodage est
  écrite, pas éprouvée.
- Rien n'est prévu pour le cas où plusieurs formateurs corrigent la même copie en même temps : la
  relecture juste avant écriture réduit la fenêtre, elle ne la ferme pas.
