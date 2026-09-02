# 🧾 Mode de chapitre « Atelier AR »

> **Statut :** implémenté et documenté (lots 1 à 7), vérifié bout en bout sur backend local
> **Version :** 7 — trois surfaces, aucun masquage, un outil de validation autonome
> **Portée :** coursInteractifs et XSpro. Les sept lots sont faits.

---

## 1. Ce que ce mécanisme cherche à produire

Le mécanisme ne sert pas à transporter une note — le stockage partagé le fait déjà, et mieux. **Il sert à rendre un
échange obligatoire entre l'apprenant et le formateur.** Tout le reste en découle. Un lecteur qui verrait dans les
codes une solution technique au transport d'une note conclurait, à raison, qu'ils sont redondants, et les
supprimerait. Ce serait détruire la fonction.

**L'apprenant devient acteur de son suivi et de sa notation.** Il décide du moment où son travail est prêt, va le
faire valider, et rapporte l'AR qui inscrit ses points. Rien ne se débloque sans lui.

**Le formateur est contraint à l'échange, et libéré du suivi.** Il ne relance plus, ne tient plus de liste. La demande
vient à lui.

**La contrainte arrive pendant le travail, pas après la note.** C'est le point d'équilibre trouvé : on ne cache rien à
l'apprenant, on le prévient qu'une consigne rendue sans être passée par la validation vaudra 0. Il ne vient donc pas
chercher un résultat, il vient faire valider un travail — au moment où l'échange sert encore à quelque chose.

### Règle de conception — ne jamais optimiser le rituel

Toute « amélioration » qui supprime un pas humain — validation automatique, attribution automatique des points,
notification à la place du code, génération automatique de l'AR — **détruit la fonction du mécanisme au lieu de
l'améliorer**. À rappeler à toute relecture du code.

---

## 2. Le mode en trois phrases

Nom technique : `atelier` — c'est cette valeur qui part dans `PARCOURS_MODE`, dans `chapterMode` et dans la
configuration de chapitre. Libellé affiché : « Atelier AR ». Icône : 🧾.

> C'est un mode Découverte. Les questions **ouvertes à correction manuelle** y prennent l'allure d'une consigne, avec
> leurs champs de suivi et la place pour l'AR. Au moment de rendre, l'apprenant est averti que ce qui n'a pas été
> validé en main propre comptera pour 0.

| Levier | 📖 Découverte | 🧾 Atelier AR |
|---|---|---|
| Questions auto, courtes, QCM, sélection | feedback immédiat | **inchangé** |
| Questions ouvertes à correction manuelle | textarea, en attente de correction | **consigne + champs de suivi + AR** |
| Déclencheur de la validation | le formateur, après le rendu | **l'apprenant, pendant le travail** |
| Points d'une consigne sans AR au rendu | en attente | **0**, le formateur restant libre d'ajuster ensuite |
| Rendu du chapitre | manuel | inchangé, avec un avertissement nominatif |

### Ce que le mode ne change pas

* aucun nouveau type de question, aucune nouvelle règle, aucune colonne détournée ;
* aucun calcul de score modifié : une consigne sans AR vaut 0 parce qu'aucun point ne lui a été attribué, ce qui est
  déjà le comportement du système ;
* aucun masquage, aucun total à filtrer, aucune note à révéler ;
* rien du côté de XSpro : la correction manuelle y reste ce qu'elle est ;
* le contenu reste rejouable dans n'importe quel autre mode sans modification ;
* la **protection copier-coller** de la page reste celle des autres modes (cf. `README.md`). Elle joue
  même en faveur du dispositif : la zone de compte rendu d'une consigne est une question `ouverte` +
  `manuel`, donc **le coller y est autorisé** — un apprenant peut y déposer un travail rédigé dans un
  traitement de texte. Une fois la validation demandée, le champ est figé et la question ne se pose
  plus. Le glisser-déposer, lui, reste refusé partout.

**Restriction assumée :** seules les questions `ouverte` en correction `manuel` sont concernées. Rien n'empêcherait
d'étendre aux autres types, mais la règle se dit alors en une phrase sans exception — et c'est ce qui compte le plus.
Effet secondaire heureux : `ouverte` est déjà l'un des types que le code traite comme relevant de la correction
manuelle, donc **aucune normalisation préalable n'est nécessaire**.

**Sortie explicite du rituel — la règle « Texte non vide » :** la protection copier-coller n'autorise le collé
que dans les questions `ouverte` + `manuel`. Un formateur qui veut simplement une question ouverte où l'apprenant
peut coller un texte doit donc la passer en correction manuelle — et héritait alors du code de validation et de
l'AR, dont il n'a que faire. D'où une porte de sortie prise sur une règle qui existe déjà :

| Type | Correction | Règle | Résultat en mode Atelier |
|---|---|---|---|
| `ouverte` | `manuel` | **Texte** (ou aucune) | **Consigne AR** : code de validation, AR, 0 point sans AR |
| `ouverte` | `manuel` | **Texte non vide** | Question ouverte ordinaire : collé autorisé, **aucun AR**, corrigée à la main comme partout ailleurs |
| `ouverte` | `semi` / `auto` | indifférente | Question ordinaire, collé refusé |

Le choix de la règle porteuse n'est pas arbitraire : une consigne se juge en présence, sur le travail rendu, pas
au compteur de caractères — « Texte non vide » n'avait donc aucun sens sur une consigne, et en fait un discriminant
sans perte. L'exclusion est écrite en négatif dans le code (`AtelierQuestion.REGLE_HORS_CONSIGNE`) : toute question
ouverte manuelle reste une consigne par défaut, y compris sans règle renseignée, et seul un choix explicite l'en sort.

⚠️ Conséquence à connaître : « Texte non vide » impose un **minimum de 10 caractères** avant que la réponse puisse
être enregistrée (`minLength`, contrôlé quelle que soit la correction). C'est le prix de la porte de sortie, et il
est sans effet sur la correction, qui reste manuelle.

---

## 3. Trois surfaces

| Surface | Ampleur | Contenu |
|---|---|---|
| **Vue apprenant** | l'essentiel du travail | La consigne, ses champs de suivi, le code de validation, la saisie de l'AR, l'avertissement au rendu |
| **Vue de correction** (tableau de bord) | mineure | Une ligne d'état par consigne : validée en main propre, quand, combien de points. Le formateur ajuste s'il veut |
| **Outil de validation** | page autonome | Saisie du code, affichage de la consigne et du travail, points, appréciation, AR à dicter |

### 3.1 Vue apprenant

La question ouverte cesse d'être un cadre à remplir : elle devient un travail à faire, avec en dessous quelques
champs faits pour ça.

* **la consigne** — l'énoncé, et les critères de réussite lisibles avant de commencer : l'indication de la question
  est affichée dépliée et intitulée « Critères de réussite », puisqu'on ne peut se positionner sans savoir ce qui est
  attendu ;
* **ce que j'ai fait** — le champ de réponse existant, dont le bouton est simplement renommé « 💾 Enregistrer mon
  compte rendu ». Aucun chemin de sauvegarde n'est dupliqué ;
* **où j'estime en être** — l'auto-positionnement, sur une échelle **fixe à trois niveaux** (pas encore acquis, en
  cours d'acquisition, acquis). Volontairement non paramétrable : c'est un langage commun pour l'échange, pas un
  outil de notation. Il remplace la grille compliquée des versions précédentes ;
* **je me déclare prêt** — le bouton qui produit le code de validation. Il exige un compte rendu enregistré et un
  positionnement : une demande vide n'aurait rien à évaluer ;
* **mon AR** — la case où recopier le code rapporté du formateur.

Une fois la demande faite, le compte rendu est **figé** : c'est l'engagement de l'apprenant et la référence de
l'échange. Il peut **annuler sa demande** tant qu'aucun AR n'a été saisi — sans cette porte de sortie, un apprenant
qui s'est déclaré prêt trop vite resterait bloqué si le formateur ne vient pas.

**Règle non négociable : relire la progression avant de vérifier un AR.** Le formateur évalue sur *son* appareil ;
la page de l'apprenant, restée ouverte, ne connaît pas encore l'AR émis. Sans relecture, un AR valide est refusé — et
ce cas n'est pas rare, c'est le cas **normal** de tout échange en présence. La relecture ne reprend que les champs
écrits par l'outil, pour ne pas écraser avec une version plus ancienne ce que l'apprenant vient de saisir localement.

Une **pastille « 🧾 Atelier »** signale la question. Elle évite le pire malentendu : un apprenant qui rédige et attend
une note qui n'arrivera jamais parce qu'il n'est pas venu la chercher. Attention : cette pastille ne peut pas être
inscrite dans le contenu à la publication, puisque le mode est choisi ensuite par le formateur, parfois pour une
classe et pas pour l'autre. **Elle s'ajoute à l'affichage**, sinon on se retrouve à republier des cours pour changer
un badge.

### 3.2 Vue de correction

Rien ne change dans le fonctionnement. S'ajoute, pour chaque consigne, l'information qu'elle a été validée en main
propre — date, points attribués, par qui. Le formateur voit ce qui a déjà été fait, ne le refait pas, et garde son
dernier mot sur les points.

### 3.3 Outil de validation — autonome par construction

`src/html/suiviAtelier.html` — une page mobile, sans navigation : on saisit le code de l'apprenant, on voit la
consigne et ce qu'il a écrit, on met des points et un mot, on obtient l'AR à dicter.

Le code se tape **avant** de choisir un parcours : c'est une adresse pure (30 bits d'aléa, aucun lien direct
avec le parcours ou la question — voir §4), donc le retrouver demande de balayer les clés de stockage plutôt
que d'en lire une seule. Une fois résolu, le parcours n'a pas besoin d'être connu au préalable — le formateur
l'apprend du code lui-même. Le libellé du parcours (pas son identifiant technique) reste affiché en
permanence dans l'en-tête, avec un lien pour en changer sans se déconnecter.

**Règle d'architecture :** l'outil parle au stockage et aux données du cours, **jamais au tableau de bord**. C'est
cette règle, et elle seule, qui permettra plus tard de l'emballer en application téléphone ou tablette — sur un
téléphone, cette page est déjà l'application, en signet sur l'écran d'accueil.

Conséquence assumée : l'outil n'utilise pas la modale de correction existante. Ce qu'il doit afficher tient en quatre
éléments ; les réécrire coûte moins que de démêler une modale de treize cents lignes qui a besoin du tableau de bord
pour vivre — et l'indépendance est garantie par construction au lieu d'être espérée.

**Sans friction inutile :** le code identifie l'apprenant, donc l'outil affiche **toutes ses consignes en attente**,
pas seulement celle du code. Un passage suffit pour en valider trois, avec un AR par consigne.

**Authentification : le mécanisme existant, pas un nouveau.** L'outil demande le **mot de passe formateur** — le même
que `teacher-login.html`, avec le jeton de récupération en secours — et reconnaît `teacher_authenticated` en
`sessionStorage` : un formateur déjà connecté à son tableau de bord dans le même navigateur n'a rien à ressaisir.
L'outil affiche en permanence sous quel nom il est ouvert et sur quel parcours : il tournera sur des appareils
partagés, et c'est ce nom qui signe les AR.

**Le parcours est choisi en arrivant**, une fois par session, et porté dans l'URL (`?parcours=`) comme le fait le
tableau de bord. Un code de validation seul ne dit pas de quel parcours il vient — la clé du ticket est préfixée par
le parcours — et chercher dans tous les parcours publiés multiplierait les requêtes sur un réseau d'atelier souvent
médiocre.

**Écrans, dans l'ordre :** accès → parcours → code → évaluation → AR à dicter. Un seul à la fois : l'outil est une
suite de gestes, pas un menu.

---

## 4. Les deux codes

Le mot « jeton » est déjà pris dans le projet : c'est l'identifiant de connexion des apprenants. On dit donc **code de
validation** pour ce que l'apprenant donne, et **AR** pour ce que le formateur rend.

**Règle de nommage à tenir dans l'interface :** l'AR ne s'appelle jamais « un code ». L'apprenant a deux suites de
caractères sous les yeux au même endroit — celle qu'il donne et celle qu'il reçoit — et les nommer toutes deux
« code » garantit la confusion. On écrit « ton code de validation : X4T9 » et « saisis ton AR : ____ ».

### 4.1 Code de validation — une adresse

6 caractères base32 Crockford (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`, sans `I`, `L`, `O`, `U`), tirés au hasard par le
navigateur de l'apprenant, qui écrit une clé individuelle :

```
{slug}:atelier:code_{CODE}  →  { token, chapId, questionId, demandeAt }
```

Une clé par code, jamais une liste partagée : aucun conflit d'écriture avec la file de synchronisation hors-ligne.

Le code ne contient rien et ne signe rien. Sa fonction technique : amener le formateur sur la bonne fiche sans
navigation. Sa fonction pédagogique : matérialiser la démarche de l'apprenant.

### 4.2 AR — la validation elle-même

8 caractères base32 Crockford, groupés `X4T9-K2M7` :

```
[ points attribués : 6 ][ aléa : 34 ]
```

L'AR n'est plus un reçu : c'est **le véhicule de l'évaluation**. Le formateur regarde le travail, met ses points,
dicte le code ; l'apprenant le saisit et voit ses points s'inscrire.

**Aucune cryptographie.** Le navigateur de l'apprenant ne doit pas pouvoir fabriquer un AR, et vérifier une signature
c'est pouvoir la produire. D'où un tirage aléatoire dont seul le condensat est enregistré :

* l'AR est émis par l'outil de validation, authentifié formateur — jamais par le navigateur de l'apprenant ;
* à l'émission : `question.arHash = SHA-256(AR)`, et l'AR en clair sous
  `{slug}:atelier:ar_{token}_{chapId}_{questionId}` ;
* à la saisie : l'apprenant **compare**, il ne déchiffre rien.

Les points sont lisibles en clair dans le code, ce qui permet l'affichage immédiat hors ligne (§6). Ils ne prouvent
rien : un AR inventé est rejeté à la comparaison au condensat.

**Réévaluation :** un nouvel AR écrase le condensat, l'ancien cesse de fonctionner. Pas de compteur à tenir.

**Limite, énoncée sans détour.** L'AR en clair vit dans une clé de stockage atteignable avec la clé anonyme par qui en
devine le nom et manipule l'API à la main. C'est un obstacle bien plus raide que réimplémenter une signature dont le
secret est publié, mais ce n'est pas un mur. Le rituel résiste au contournement ordinaire, pas à un apprenant
déterminé et outillé.

**Où est l'autorité :** dans l'authentification formateur de l'outil. Le code de validation ouvre la fiche, le mot de
passe donne le droit de noter, l'AR transporte le résultat.

**Le code de validation est supprimé à la saisie de l'AR** : l'échange est clos, il n'a plus à être résolvable. Un
ajustement ultérieur des points passe par la vue de correction, pas par un nouveau passage.

---

## 5. La règle des 0 points

Au moment de rendre le chapitre, l'apprenant est averti — et l'avertissement **nomme les consignes concernées** et
demande confirmation :

> Deux consignes n'ont pas été validées : *Contrôle du poste*, *Montage*.
> Elles compteront pour 0 point. Rendre quand même ?

Une phrase générale ne suffit pas : on clique sans lire et on découvre le 0 trop tard. Le projet a déjà ce type de
modale de confirmation pour les modes Blind et Millionnaire.

**Le mot compte.** On écrit « non validée — 0 point », jamais « fausse ». Un apprenant qui a fait le travail mais
n'est pas passé lirait « faux » comme un jugement sur son travail, alors que ce n'est qu'un constat de procédure. Le
calcul est le même, le message ne l'est pas — et dans un dispositif dont tout l'objet est la relation, ça compte.

Le formateur reste libre d'attribuer les points après coup depuis sa vue de correction : la règle des 0 points
s'adresse à l'apprenant au moment de sa décision, elle ne lie pas l'évaluateur.

---

## 6. Réseau

Le site dispose déjà d'un cache local et d'une file de synchronisation rejouée au retour du réseau. Il n'y a pas de
« mode hors ligne » à écrire. Le seul cas réaliste est la coupure ponctuelle, et elle ne casse qu'une chose.

| Moment | Coupure ponctuelle |
|---|---|
| Travail, réponses, déclaration « prêt » | transparent — le code est tiré localement, l'écriture part en file |
| Ouverture de l'outil | transparent s'il a déjà été ouvert une fois avec réseau |
| **Résolution du code de validation** | **casse** — la clé a été écrite quelques secondes plus tôt sur un *autre* appareil |
| Attribution des points | transparent — file de synchronisation |
| Saisie de l'AR | dégradé — les points lus dans le code s'affichent à titre provisoire, la comparaison au condensat a lieu à la synchronisation |

**Réponse : la dégradation, pas un second mécanisme.** Si le code ne résout pas, l'outil retombe sur un sélecteur
classe → apprenant → consignes en attente, servi par le cache. Le formateur perd le raccourci sans navigation le
temps de la coupure ; l'échange a lieu, l'écriture part en file. Aucun pré-chargement à écrire, aucun second format de
code auto-porteur.

**Limite connue, non traitée ici.** La progression s'écrit en objet entier : si deux appareils écrivent pendant une
coupure, le dernier arrivé écrase l'autre. C'est une limite du système actuel, pas de ce mode. Ressaisir l'AR répare
l'affichage côté apprenant.

---

## 7. Modèle de données

Le rituel est porté par **la question**, pas par le chapitre. Les champs ne sont pas créés à l'initialisation des
questions : ils n'existent que sur les consignes réellement engagées dans un échange, pour ne pas alourdir la
progression de toutes les questions de tous les parcours.

| Champ | Écrit par | Rôle |
|---|---|---|
| `autoPositionnement` | apprenant | Où il estime en être, sur une échelle fixe à trois niveaux |
| `codeValidation` | apprenant | Code de validation en cours |
| `codeValidationAt` | apprenant | Date de la déclaration « prêt » — c'est lui qui déclenche |
| `arPoints` | outil | **Points en attente** — pas encore dans le calcul |
| `arAppreciation` | outil | Appréciation rédigée pendant l'échange |
| `arHash` | outil | `SHA-256` de l'AR émis. Écrasé à chaque réévaluation |
| `arEmisAt` / `arEmisPar` | outil | Date d'émission et identifiant du formateur |
| `arSaisiAt` | apprenant | Date de saisie de l'AR — trace de la rencontre |
| `arCode` | apprenant | L'AR en clair, une fois validé, pour recopie sur le carnet |

### La promotion — c'est le cœur du dispositif

L'outil de validation **n'écrit pas** `teacherScore`. S'il le faisait, les points entreraient immédiatement dans
`manualScore` et l'apprenant verrait sa note sans jamais venir chercher son AR : le dispositif serait vide.

L'outil écrit donc dans des champs d'attente — `arPoints`, `arAppreciation` — et **c'est la saisie de l'AR qui les
promeut** en `teacherScore` et `teacherComment`, via la fonction existante `teacherCorrectQuestion`, avec
`correctedBy` = identifiant du formateur.

C'est ce qui permet de n'avoir **aucun masquage** : les points ne sont pas cachés, ils ne sont simplement pas encore
dans le champ que le calcul regarde. Rien à filtrer dans les totaux, les bilans ou les badges.

Les points voyagent aussi en clair dans l'AR, en redondance : c'est ce qui permet l'affichage immédiat quand la
progression n'a pas encore été synchronisée. En cas de divergence, `arPoints` fait foi.

### Le 4ᵉ état : `corrigee`

L'outil de validation sait aussi **corriger directement**, hors rituel — c'est le second chemin ouvert avec le QRCode
de question (voir §10 et `qrcode question.md`). Il écrit alors `teacherScore` / `teacherComment` /
`manualCorrectionStatus`, sans aucun champ `ar*`.

La consigne doit donc pouvoir se présenter autrement que par le rituel, d'où un quatrième état :

```
brouillon → demandee → validee      le rituel de l'AR
brouillon → corrigee                noté directement, sans rituel
```

Il est **déduit** de `manualCorrectionStatus === 'corrected'`, aucun champ n'est ajouté au tableau ci-dessus. Son
affichage reprend celui de `validee`, sans le code AR à recopier — il n'y en a pas.

**L'ordre compte** : `corrigee` est testé après `arSaisiAt` et **avant** `codeValidation`. Une consigne notée en direct
alors qu'un code dormait encore doit cesser d'afficher ce code, sinon l'apprenant relancerait un rituel déjà tranché.

Conséquence sur la règle des 0 points (§5) : `consignesNonValidees()` ne filtre plus sur `arSaisiAt` mais sur
`pointsAffiches()`, qui couvre les deux états aboutis. Une consigne corrigée directement ne doit évidemment pas être
annoncée « comptera pour 0 point » au moment du rendu.

### Le bandeau de feedback, dans les états aboutis

`chapterUI.handleNormalMode()` écrit « ⏳ Réponse enregistrée — En attente de vérification » sur toute question
ouverte répondue, et il tourne **avant** nous : `chapitre.js` appelle `restoreAllAnswers()` puis
`AtelierQuestion.init()`. Une consigne aboutie affichait donc un « en attente » posé juste au-dessus de son
« 8 / 10 points ».

`_bandeau()` efface ce bandeau quand `pointsAffiches()` est vrai — donc en `validee` et en `corrigee`, et nulle part
ailleurs. On efface plutôt que de réécrire : le bloc dit déjà tout. Les états `brouillon` et `demandee` le gardent, il
n'y contredit rien — la réponse y est bien enregistrée et en attente.

Le défaut existait depuis le premier jour du mode Atelier. La correction directe rendant l'état abouti beaucoup plus
fréquent, il devenait voyant.

---

## 8. Plan d'implémentation

| Lot | État | Contenu |
|---|---|---|
| 1 | ✅ fait | Le mode existe : valeur ajoutée **en fin** de `PARCOURS_MODE` (l'indice est stocké en base pour les chapitres), badge, icône, sélecteur formateur, filtre, pastille posée à l'affichage |
| 2 | ✅ fait | Vue apprenant : la consigne, ses champs, la déclaration « prêt », le code de validation, la saisie de l'AR |
| 3 | ✅ fait | Outil de validation `suiviAtelier.html` : page autonome mobile, mot de passe formateur, choix du parcours, résolution du code, sélecteur de repli, attribution des points, émission de l'AR |
| 4 | ✅ fait | Avertissement au rendu, nommant les consignes non validées |
| 5 | ✅ fait | Vue de correction : ligne d'état « validé en main propre », ajustement possible |
| 6 | ✅ fait | Documentation : `DETAILS_VUES.md`, `README.md` |
| 7 | ✅ fait | XSpro : `atelier` ajouté en fin de `PARCOURS_MODE`, libellés de la grille des chapitres, badge du suivi apprenant, et script de synchronisation de la copie embarquée du site |

Les lots 1 à 3 forment le premier ensemble testable : sans l'outil, rien ne peut émettre d'AR. Les lots 4 et 5
complètent le dispositif sans rien modifier des précédents.

**Vérifié bout en bout** sur backend SQLite local : demande de l'apprenant → ticket en base → résolution par code
dans l'outil → émission de l'AR → saisie par l'apprenant → points promus dans `manualScore`. Y compris la
réévaluation, qui invalide l'AR précédent.

**Le point le plus facile à rater** est la pastille : posée à la publication au lieu de l'affichage, elle oblige à
republier un cours pour changer de mode.

---

## 9. Décisions et abandons

| Version | Décision |
|---|---|
| v1 → v2 | Le code cesse de faire autorité sur la note |
| v3 | L'intention est pédagogique : forcer l'échange. Règle « ne jamais optimiser le rituel » |
| v4 | La signature disparaît au profit d'un tirage aléatoire à condensat |
| v5 | Un type de question `consigne`, avec grille d'auto-évaluation |
| v6 | Le type est abandonné au profit d'un **mode de chapitre** — la pédagogie devient un choix de diffusion, révocable, au lieu d'être gelée dans le contenu |
| **v7** | **Le masquage des notes est abandonné** au profit de la règle des 0 points au rendu : la contrainte arrive pendant le travail au lieu d'après la note, et il n'y a plus aucun total à filtrer. Le périmètre est **restreint aux questions ouvertes**, ce qui supprime le prérequis de normalisation. L'outil de validation devient **autonome**, ce qui ouvre la voie à une application mobile sans rien changer au reste |

Ce qui a disparu en route, et qu'il ne faut pas réintroduire sans raison : la réconciliation entre deux sources de
vérité, la cryptographie partagée entre deux applications, la grille à parser, le masquage des scores, la
normalisation préalable des statuts de correction, et le second format de code pour le hors-ligne.

---

## 10. Ne pas confondre avec le QRCode de question

Le bandeau de chaque question porte, depuis, **un QRCode** qui rend un service voisin : désigner d'un
geste une question d'un apprenant pour y déposer un commentaire (voir `qrcode question.md`). Il
réutilise `AtelierCodes.condensat()`, et rien d'autre.

Ce sont **deux dispositifs distincts, et il ne faut pas les fusionner** :

| | Atelier AR | QRCode de question |
|---|---|---|
| Ce que ça sert | forcer un échange en présence | supprimer une recherche |
| La lenteur | **voulue** — « ne jamais optimiser le rituel » | à supprimer |
| Périmètre | les consignes d'un chapitre en mode Atelier | toutes les questions, tous les modes |
| Trace en base | un ticket écrit quand l'apprenant se déclare prêt | **aucune** — la charge utile est autoporteuse |
| Ce qui est écrit | `arPoints` / `arAppreciation`, champs d'attente promus par la saisie de l'AR | `teacherScore` / `teacherComment` / `globalComment`, immédiatement |
| Accusé de réception | oui, c'est tout l'objet | non |

Remplacer la dictée du code de validation par un scan reviendrait à démonter le mode Atelier AR : la
dictée **est** le dispositif pédagogique, pas son coût d'usage.

### Ce qui a été fait, et ce qui ne l'a pas été

Les deux dispositifs partagent désormais **le même outil** — `src/html/suiviAtelier.html`, rebaptisé « ✍️ Correction
en salle » dans l'interface puisqu'il ne sert plus le seul Atelier — et c'est tout ce qu'ils partagent. L'écran d'évaluation porte deux boutons :

| Bouton | Quand | Ce qu'il écrit |
|---|---|---|
| `Valider et générer l'AR` | **seulement** sur une consigne d'un chapitre joué en Atelier | `arPoints`, `arAppreciation`, `arHash` — champs d'attente, inchangé |
| `Enregistrer la correction` | toujours | `teacherScore`, `teacherComment`, `manualCorrectionStatus` |

Jamais un bouton qui change de sens : sur une question ordinaire, celui de l'AR n'existe pas.

Le rituel n'a **pas** été optimisé au passage :
- le code de validation se saisit toujours à la main, et la charge du QRCode entre par un champ distinct ;
- l'AR se dicte toujours, et se saisit toujours chez l'apprenant ;
- les champs d'attente restent des champs d'attente, la promotion reste le fait de l'apprenant.

Ce qui a changé pour le rituel se limite à un raccourci d'accès : on peut atteindre une consigne en lisant la charge
d'un QRCode au lieu de saisir le code — **quand l'apprenant a déjà généré le sien**. Ce n'est pas une dispense
d'échange, c'est une frappe en moins pour le formateur qui est déjà devant lui.

Le repli par liste (§3.3) a lui aussi été élargi — apprenant → chapitre → question, pour atteindre n'importe quelle
question sans code. Les **consignes en attente d'AR y restent hissées en tête** : c'est le geste le plus fréquent, et
le repli avait été écrit pour lui.
