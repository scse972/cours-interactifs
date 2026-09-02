# 🔳 QRCode de question

> État : **étape 1 livrée — l'affichage seul.** La page formateur qui consomme le scan
> n'existe pas encore. Le format de la charge utile, lui, est **figé** : il est imprimé sur
> tous les écrans, on ne pourra plus le changer sans les réimprimer tous.

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

Le condensat est calculé par `AtelierCodes.condensat()`
(`src/js/atelier/atelierCodes.js`) — SHA-256 via `crypto.subtle`, déjà éprouvé sur GitHub Pages, en
local et en Electron sur `file:`.

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

## 5. Reste à faire — la page formateur

Ce qui est décidé :

- **Le scan se fait depuis un scanner intégré à la page formateur**, déjà ouverte et déjà
  authentifiée — pas depuis l'appareil photo du téléphone. C'est pour cela que la charge utile
  n'est **pas** une URL : elle n'a pas à être atteignable depuis un réseau, et tout fonctionne
  hors-ligne comme en Electron.
- Le formateur pourra y renseigner : le **commentaire de la question**, le **commentaire général du
  chapitre**, et des **points**.

Les champs visés existent tous déjà, aucun schéma à créer :

| Ce qu'on écrit | Où | Déjà écrit par |
|---|---|---|
| Commentaire de question | `progress.chapters[chapId].questions[qId].teacherComment` | `correctionModal.js`, `progressManager.teacherCorrectQuestion()` |
| Points de question | `…questions[qId].teacherScore` | idem |
| Commentaire général | `progress.chapters[chapId].globalComment` | `correctionModal.js` |

Points d'attention identifiés :

- **La caméra exige un contexte sécurisé** : `getUserMedia` ne fonctionne qu'en HTTPS ou sur
  `localhost`. À vérifier dans chacun des environnements avant de s'engager.
- Il faudra aussi **vendorer un décodeur** de QRCode (la bibliothèque actuelle ne fait
  qu'encoder).
- La page devra suivre la règle d'architecture de `suiviAtelier.html` : autonome, mobile, chargeant
  le strict minimum, s'authentifiant par mot de passe formateur.
- Contrairement au mode Atelier, il n'y a **pas d'accusé de réception** : ce qui est écrit ici
  compte immédiatement. C'est cohérent avec l'intention (aller au plus court) mais c'est une
  différence de nature qu'il faut garder en tête — le rituel de l'AR protège une fonction
  pédagogique, celui-ci n'en protège aucune.
