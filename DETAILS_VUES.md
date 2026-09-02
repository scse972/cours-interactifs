# 📋 Document officiel: Vue StudentWorkEditor
> **Version:** 2.1 | **Dernière mise à jour:** 22/04/2026 | **Auteur:** Référence technique

---

## 🎯 Objectif de la vue

`StudentWorkEditor` est le composant **SOURCE DE VÉRITÉ UNIQUE** pour toute la gestion des réponses étudiantes dans le projet.

✅ Rôles et responsabilités:
- ✅ Gestion native de **TOUS** les types de questions
- ✅ Validation automatique et semi-automatique
- ✅ Gestion des états des réponses
- ✅ Gestion du feedback utilisateur
- ✅ Cycle de vie complet des réponses
- ✅ API et évènements pour intégration avec les autres modules

❌ Ce composant **NE FAIT PAS**:
- ❌ Pas de sauvegarde (il émet seulement des évènements)
- ❌ Pas de gestion de la progression globale
- ❌ Pas de logique métier spécifique

---

## 🧩 Types de questions gérés

| Type de question | `correctionType` | Description |
|---|---|---|
| 🔵 Auto | `auto` | Correction 100% automatique (QCM, Select, Réponse courte) |
| 🟡 Semi | `semi` | Correction partiellement automatique |
| 🟠 Manuel | `manuel` | Correction 100% manuelle par le formateur |
| ⚫ Obligatoire | `obligatoire` | Réponse simple pour participation |

---

## 📊 Tableau de vérité officiel définitif

Ce tableau est la **règle absolue** à respecter en toute circonstance. Toute déviation est un bug.

| Type | Condition | Valeur `isCorrect` | Effet |
|---|---|---|---|
| ✅ `auto` | Réponse correcte | `true` | Question verrouillée, feedback vert ✅ |
| ✅ `auto` | Réponse incorrecte | `false` | Feedback rouge ❌, peut réessayer |
| ✅ `semi` + courte | Réponse dans la liste valide | `true` | Question verrouillée, feedback vert ✅ |
| ✅ `semi` + courte | Réponse pas dans la liste | `null` | Feedback jaune ⏳ en attente |
| ✅ `semi` + ouverte | `minLength` défini **ET** `0 < longueur < minLength` | `false` | Feedback rouge ❌ "Réponse trop courte" |
| ✅ `semi` + ouverte | longueur >= minLength | `null` | Feedback jaune ⏳ en attente |
| ✅ `semi` + ouverte | pas de limite définie | `null` | Feedback jaune ⏳ en attente |
| ✅ `manuel` | **TOUS LES CAS, QUEL QUE SOIT LA RÉPONSE** | `null` | Feedback bleu 📝 en attente |
| ✅ `obligatoire` | Réponse saisie | `true` | Points de participation |

---

## 🎚️ Comportement par mode

### 🟢 Mode Normal (défaut)
| Action | Comportement |
|---|---|
| Réponse saisie | Évènement `onAnswerChanged` |
| Clic sur Vérifier | Validation, évènement `onAnswerValidated` |
| `isCorrect = true` | Question verrouillée définitivement |
| `isCorrect = false` | Peut modifier et réessayer |
| `isCorrect = null` | Peut modifier indéfiniment |

### 🔵 Mode Examen
| Action | Comportement |
|---|---|
| Boutons "Vérifier" cachés | ✅ |
| Sauvegarde automatique en temps réel | ✅ |
| Pas de feedback pendant la saisie | ✅ |
| Tout est verrouillé après rendu | ✅ |

### 🥽 Mode Blind
| Action | Comportement |
|---|---|
| Boutons "Vérifier" cachés | ✅ |
| Réponse saisie | Enregistrée **en silence** : `onAnswerValidated` avec `isCorrect = null` et `points = 0` |
| Feedback | Aucun, ni à la saisie ni à la restauration (`restoreAllAnswers` sort avant l'affichage) |
| Rendu | `validateAllQuestions()` puis **bilan min/max** en modale (`ChapterBilan.showBlindBilan`) |
| Après confirmation | `_finalizeBlindSubmission` — rendu définitif, tout verrouillé |

> Le bilan min/max n'est pas une estimation optimiste : une question auto sans réponse ou fausse
> compte 0 dans les **deux** bornes, c'est définitif. Seules les questions manuelles ou semi avec une
> réponse réelle (et le seuil de caractères atteint, s'il y en a un) font monter la borne haute.

### 💰 Mode Millionnaire
| Action | Comportement |
|---|---|
| Boutons "Vérifier" visibles | ✅ — le mode se joue question par question |
| Réponse auto **fausse** | Modale de choix : **Recommencer** ou **Rendre la copie** |
| Recommencer | `_resetAutoQuestions()` — remet à zéro les questions auto **et semi**, conserve les manuelles, puis re-tire l'ordre |
| Retour sur le chapitre | **Pas de reprise** : la tentative en cours est effacée et l'ordre re-tiré, y compris après un simple rechargement |
| Ordre des questions | Tiré au sort **par défaut** si le chapitre est entièrement auto-corrigé |

> Le rechargement compte comme une nouvelle tentative : c'est ce qui empêche de « sauvegarder » une
> bonne série en quittant la page. Un bandeau prévient l'apprenant, sinon il croirait avoir perdu ses
> réponses par accident.

### 🧾 Mode Atelier AR
| Action | Comportement |
|---|---|
| Questions auto, courtes, QCM, sélection | Identique au mode Découverte |
| Question **ouverte + `manuel`**, règle « Texte » ou aucune | Devient une **consigne** validée en main propre |
| Question **ouverte + `manuel`**, règle « Texte non vide » | **Exclue du rituel** : question ordinaire, collé autorisé, aucun AR |
| Décoration du bloc | Ajoutée à l'affichage par `AtelierQuestion.init()`, jamais à la publication |
| Bouton « Vérifier » | Renommé « 💾 Enregistrer mon compte rendu », comportement inchangé |
| Compte rendu | Figé dès que l'apprenant a demandé la validation |
| Attribution des points | Par saisie de l'AR, qui promeut `arPoints` en `teacherScore` |
| Saisie de l'AR | **Reste active même chapitre verrouillé** — seule exception au verrouillage |

> `AtelierQuestion` ne modifie **jamais** le tableau de vérité : une consigne est une question `manuel`,
> donc `isCorrect` reste `null` et les points ne viennent que du formateur. Voir `mode atelier AR.md`.

> La règle « Texte non vide » (`texte(10)`) est le discriminant assumé (`AtelierQuestion.REGLE_HORS_CONSIGNE`) :
> elle existe pour les questions ouvertes passées en correction manuelle dans le seul but d'autoriser le collé.
> L'exclusion est écrite en négatif — sans règle renseignée, la question reste une consigne.

### 🔴 Chapitre rendu / corrigé
| Action | Comportement |
|---|---|
| **TOUS** les champs sont verrouillés | ✅ |
| Aucune modification possible | ✅ |
| Feedback de correction visible | ✅ |
| Exception | Le champ de saisie de l'AR du mode Atelier reste utilisable |

---

## 🎛️ Options d'affichage, indépendantes du mode

Deux réglages de chapitre s'ajoutent au mode, cochés par le formateur dans le tableau de bord. Ils sont
stockés dans `slug:config:chapter_config` et ne touchent ni les réponses ni les scores : **seul l'ordre
et le découpage de l'affichage changent**.

| Option | Modes concernés | Condition | Défaut |
|---|---|---|---|
| 🎲 Ordre aléatoire | Examen, Blind, Millionnaire | Chapitre **entièrement auto-corrigé** | coché en Millionnaire, décoché ailleurs |
| 📄 Questions par questions | Examen, Blind | aucune | décoché |

**Ordre aléatoire** (`ChapterOrdre`) — questions déjà répondues d'abord, dans l'ordre où elles l'ont
été, puis les autres mélangées. Rien n'est mémorisé : l'ordre est recalculé à chaque affichage. Les
blocs de cours ne bougent pas. Les vues formateur gardent toujours l'ordre publié.

**Questions par questions** (`ChapterPagination`) — un écran = un élément, blocs de cours compris,
navigation libre dans les deux sens. À l'ouverture, on se place sur la première étape non faite. La
pagination s'efface dès que le chapitre est rendu ou verrouillé.

> La **source unique de vérité des cinq modes** est `src/js/core/getExamContext.js`. Le mode effectif
> d'un apprenant est **figé à son premier démarrage** (`frozenChapterMode`) : le formateur qui change
> le mode ensuite n'affecte que ceux qui n'ont pas commencé. Les deux options ci-dessus, elles, sont
> relues à chaque affichage.

---

## 📋 Champs mis en jeu

### 📥 Champs d'entrée
| Attribut HTML | Description |
|---|---|
| `data-question-id` | Identifiant unique de la question |
| `data-correction-type` | Type de correction (`auto`/`semi`/`manuel`) |
| `data-points` | Nombre de points de la question |
| `onclick` | Contient les paramètres de correction |

### 📤 Champs retournés par `checkQuestion()`
| Champ | Type | Valeurs possibles |
|---|---|---|
| `hasAnswer` | `boolean` | `true` si une réponse est saisie |
| `isCorrect` | `boolean|null` | `true` / `false` / `null` |
| `points` | `number` | Points maximum de la question |
| `userAnswer` | `any` | Valeur brute de la réponse |

---

## 🔄 Cycle de vie d'une réponse

```mermaid
flowchart LR
    A[Réponse vide] --> B[Saisie utilisateur]
    B --> C[hasAnswer = true]
    C --> D[Évènement onAnswerChanged]
    D --> E{Click sur Vérifier?}
    E -- Oui --> F[Validation]
    F --> G[Évènement onAnswerValidated]
    G --> H{isCorrect}
    H -- true --> I[🔒 Verrouillée]
    H -- false --> J[❌ Erreur / peut réessayer]
    H -- null --> K[⏳ En attente / peut modifier]
```

---

## 🔌 API publique

### Méthodes
| Méthode | Description |
|---|---|
| `.init()` | Initialiser le composant sur la page |
| `.checkQuestion(questionEl)` | Vérifier l'état d'une question |
| `.handleAnswer(...)` | Valider une réponse standard |
| `.handleOpenAnswer(...)` | Valider une réponse ouverte |
| `.restoreQuestion(id, data)` | Restaurer l'état d'une question |
| `.lockAllQuestions()` | Verrouiller toutes les questions |

### Évènements
| Évènement | Déclenché quand | Paramètres |
|---|---|---|
| `onAnswerChanged` | Chaque modification de champ | `questionId`, `result` |
| `onAnswerValidated` | Clic sur bouton Vérifier | `questionId`, `answer`, `isCorrect`, `points`, `correctionType`, `needsReview` |

---

## 🔒 Protection copier-coller et glisser-déposer

Cette protection **ne vit pas dans `StudentWorkEditor`** : elle est posée par
`src/js/chapterInit.js` (`_applyAntiCopyProtection`) au niveau du `document`, et uniquement en mode
apprenant. Elle ne connaît donc rien du tableau de vérité et ne modifie aucune réponse — elle décide
seulement de laisser passer ou non un évènement du navigateur.

Une seule exemption, identifiée par un sélecteur unique :
`.question-section[data-correction-type="manuel"] textarea`.

| Champ | Copier | Couper | Coller | Menu contextuel | Glisser-déposer |
|---|---|---|---|---|---|
| `textarea` d'une question **ouverte + `manuel`** | ❌ | ❌ | ✅ | ✅ | ❌ |
| `textarea` d'une question ouverte + `semi` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `input` d'une question courte, quel que soit son type de correction | ❌ | ❌ | ❌ | ❌ | ❌ |
| QCM, liste de choix, énoncés, blocs de cours | ❌ | ❌ | ❌ | ❌ | ❌ |

> Ce qui distingue la ligne exemptée n'est **pas** la présence d'un `<textarea>` mais l'attribut
> `data-correction-type="manuel"` **combiné** à un `<textarea>`. Une question `courte` en correction
> manuelle n'a qu'un `<input>` : elle reste bloquée.

Le copier remplace le presse-papiers par un message neutre. Rien n'est journalisé et aucun message ne
prétend qu'une tentative est enregistrée ou signalée — ce serait faux.

---

## 🛡️ Garanties et contrats

✅ **Contrats immuables**:
1.  ✅ `manuel` retourne **JAMAIS** `true` ou `false`
2.  ✅ Seul `auto` retourne `false` systématiquement
3.  ✅ `isCorrect = false` NE VERROUILLE JAMAIS la question
4.  ✅ Seul `isCorrect = true` verrouille une question
5.  ✅ Les questions ouvertes sont **JAMAIS** verrouillées automatiquement

---

> ✅ Ce document est la référence officielle. Tout comportement qui ne correspond pas à ce tableau est un bug à corriger immédiatement.

## ⭐ Barème des questions auto-corrigées

> Source unique : `src/js/core/bareme.js`. Version rédigée pour le formateur : fiche
> « bareme » de `src/js/aide.js`, atteignable par l'icône ⓘ de « Gestion des Chapitres ».

La pénalité d'essais existe pour **dissuader la réponse au hasard**. Sans elle, un apprenant qui
coche n'importe quoi et réessaie finit par tomber juste, et repart avec des points qu'il n'a pas
gagnés.

```
points d'une question réussie = barème − (essais − 1) × pénalité
pénalité par essai raté    = 2 × barème / (options − 1)
plancher                    = −2 × barème
```

**La pénalité dépend du nombre de choix**, et c'est ce qui la rend juste : deviner entre deux
réponses est facile, deviner entre cinq ne l'est pas.

| Options | Pénalité / essai | Sur une question à 5 points | Espérance au hasard |
|---|---|---|---|
| 2 | 2 × barème | +5, −5 | 0 |
| **3** | **barème** | **+5, 0, −5, −10** | 0 |
| 4 | ⅔ barème | +5, +1,67, −1,67, −5 | 0 |
| 5 | ½ barème | +5, +2,5, 0, −2,5, −5 | 0 |

Un apprenant qui répond entièrement au hasard obtient donc **zéro en moyenne**, quel que soit le
nombre de choix. La formule antérieure appliquait la ligne « 3 » à tout : elle était juste sur les
questions à trois choix, et laissait exactement **la moitié des points au hasard sur un vrai/faux**
— le cas le plus courant. Le module actuel généralise, il ne remplace pas : à trois options les
valeurs sont rigoureusement identiques.

Deux réserves assumées : le calcul suppose que l'apprenant ne réessaie pas une réponse déjà
rejetée ; et sur un QCM à réponses multiples, deviner est bien plus difficile que `1/options`, la
pénalité y est donc trop douce — dans le sens qui protège l'apprenant. Une question sans options
(texte court auto ou semi) prend la calibration à trois choix.

### Le plancher du cumul

Une question peut valoir des points négatifs, mais **le total des questions auto ne descend jamais
sous 0**. Un mauvais résultat sur les QCM ne vient pas manger les points gagnés ailleurs. Cette
règle n'appartient pas au barème mais à celui qui somme : `chapterBilan`, `correctionModal` et
`showBlindBilan` l'appliquent chacun chez eux. Quand elle joue, le bilan de l'apprenant l'annonce
(« −5 ramenés à 0 ») — sans quoi le total contredirait le détail affiché juste en dessous.

---

## 📊 Le bilan de chapitre — un intervalle par question

> `src/js/chapter/chapterBilan.js`, fonction `_intervalle()`.

Le bilan répond à une seule question : *entre quelles bornes ma note va-t-elle finir ?* La règle
tient en une phrase — **chaque question apporte un intervalle `[min, max]` de points, et on somme.**

Trois valeurs par question, pas deux : `min` (garanti si tout ce qui reste tourne au pire), `max`
(atteignable si tout tourne au mieux) et `acquis` (déjà en poche). `acquis` diffère de `min` sur une
auto pas encore tentée : elle n'a pas encore coûté ses points, mais elle le peut.

« Chapitre ouvert » = `submissionStatus ∈ {not_submitted, returned_for_revision}`.

| Type | État | min | max | acquis |
|---|---|---|---|---|
| auto | réussie | barème après pénalité | idem | idem |
| auto | ratée | −points | −points | −points |
| auto | à tenter, chapitre ouvert | −points | +points | 0 |
| auto | à tenter, copie rendue | 0 | 0 | 0 |
| semi / manuel | **corrigée par le formateur** | `teacherScore` | idem | idem |
| semi | reconnue automatiquement | points | points | points |
| semi / manuel | **répondue, en attente** | **0** | **points** | 0 |
| semi / manuel | rejetée par la règle | 0 | 0 | 0 |
| semi / manuel | pas répondue, chapitre ouvert | 0 | points | 0 |
| semi / manuel | pas répondue, copie rendue | 0 | 0 | 0 |

**L'ordre de priorité compte** pour les questions non-auto : correction du formateur, puis
`isCorrect === true`, puis `isCorrect === false`, puis répondue, puis non répondue. La correction
passe **avant** la reconnaissance automatique : sur une semi validée d'office, un `teacherScore`
saisi ensuite l'emporte — le dernier mot est au formateur.

**La convergence est automatique.** À mesure que l'apprenant répond et que le formateur corrige, les
intervalles se referment un par un. Quand tout est répondu et corrigé, `min = max` et le bilan
n'affiche plus qu'une note. Aucun cas particulier n'est écrit pour cela.

### La pénalité de cours dans le bilan

−2 sur la note dès qu'un cours **obligatoire** n'est pas validé — même critère que le formateur
(`requiresValidation`), convention de signe alignée sur la sienne. Elle est retranchée des **deux**
bornes ; auparavant elle était affichée sans jamais être comptée, sous un libellé qui prétendait le
contraire.

En revanche, la valeur **discrétionnaire** que le formateur saisit à la correction
(`chapter.coursePenalty`, ±10, bonus compris) **n'est jamais lue par le bilan**. C'est délibéré : ce
que l'apprenant peut déduire de sa fourchette reste une note **théorique**, le geste du formateur
lui appartient et n'est annoncé qu'à la validation.

### Ce qui reste incohérent ailleurs

`progressManager.recomputeChapterStats` et `computeChapterUIStats` gardent leur propre arithmétique
— la seconde produit même une note **centrée sur 10/20** (`20 × (1 + réussite) / 2`), sans rapport
avec la formule proportionnelle. Seule leur pénalité d'essais est mutualisée. À traiter à part.
