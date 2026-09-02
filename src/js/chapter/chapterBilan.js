// ============================================================================
// CHAPTER BILAN - Modal de bilan détaillé du chapitre
// ============================================================================
// Responsabilités :
//   - showDetailsBilanChapter (construit et affiche le modal)
//   - closeAutoCorrectDetails (ferme le modal)
// ============================================================================

const ChapterBilan = {

    // ── Gestion du focus : sauver/restaurer autour des modals ──────
    // Corrige le bug où les modals (confirm, alert, HTML) volent le focus
    // et empêchent la saisie dans les champs après fermeture.
    _previousFocus: null,

    _saveFocus() {
        this._previousFocus = document.activeElement;
    },

    _restoreFocus() {
        const el = this._previousFocus;
        // Petit délai pour laisser le navigateur finir le cleanup du modal
        setTimeout(() => {
            if (el && typeof el.focus === 'function') {
                el.focus();
            }
            this._previousFocus = null;
        }, 100);
    },

    async showDetailsBilanChapter(chapterIdParam = null, progressDataParam = null) {
        this._saveFocus();
        let chapterId = chapterIdParam || ChapterSession.chapterId;
        let progress = progressDataParam || ChapterSession.progress;

        if (!progress || !chapterId) {
            console.error('showDetailsBilanChapter: manque progress ou chapterId', { progress, chapterId });
            alert('Erreur: Impossible de charger le bilan, données manquantes.');
            return;
        }

        const chapter = progress.chapters[chapterId];
        if (!chapter) return;

        const submissionStatus = chapter.submissionStatus || 'not_submitted';
        const chapterConfig = window.chaptersIndex?.chapters?.find(ch => ch.id == chapterId);
        if (!chapterConfig) return;

        const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
        let storageConfig = {};
        if (slug) {
            storageConfig = await storage.get(`${slug}:config:chapter_config`) || {};
        }
        const finalConfig = {
            ...chapterConfig,
            ...(storageConfig[chapterId] || {})
        };

        const examContext = getExamContext(chapter, finalConfig, window.globalContext);
        const isAllowed = !examContext.isExamMode || submissionStatus === 'validated';

        if (!isAllowed) {
            alert('⚠️ Le bilan n\'est pas disponible tant que le chapitre n\'a pas été corrigé.');
            return;
        }

        const allQuestions = chapterConfig.questions;
        const totalPossiblePoints = chapterConfig.maxPoints || allQuestions.reduce((sum, q) => sum + q.points, 0);

        let autoScore = 0;
        let autoMaxPossible = 0;
        let autoRemainingRisk = 0;
        let manualCurrentScore = 0;
        let manualRemainingMax = 0;

        const questionDetails = [];

        allQuestions.forEach(q => {
            const qData = chapter.questions[q.id];
            let status = 'unanswered';
            let pointsEarned = 0;

            if (q.correctionType === 'auto') autoMaxPossible += q.points;

            const wasAnswered =
                qData &&
                (qData.answered === true ||
                (typeof qData.answer === 'string' && qData.answer.trim() !== '') ||
                (Array.isArray(qData.answer) && qData.answer.length > 0) ||
                (qData.answer !== null && qData.answer !== undefined && qData.answer !== ''));

            let effectiveIsCorrect = qData ? qData.isCorrect : null;
            let effectiveWasAnswered = wasAnswered;

            if (q.correctionType === 'auto' && qData && qData.attempts > 0 && !wasAnswered) {
                effectiveIsCorrect = false;
                effectiveWasAnswered = true;
            }

            // Une question manuelle notée reste `isCorrect === null` : sans ce cas, le bilan
            // annoncerait « en attente, +0 » une consigne dont le bloc affiche « 8 / 10 »
            // deux écrans plus haut. On ne compte QUE ce que l'apprenant connaît déjà —
            // le corrigé ouvert, ou une consigne Atelier qui montre sa note. Une correction
            // faite en direct sur un chapitre non validé reste, elle, en attente.
            const noteConnue = qData
                && q.correctionType !== 'auto'
                && typeof qData.teacherScore === 'number'
                && (submissionStatus === 'validated'
                    || window.AtelierQuestion?.pointsAffiches?.(q.id) === true);

            if (noteConnue) {
                status = 'corrected';
                pointsEarned = qData.teacherScore;
                manualCurrentScore += pointsEarned;
            } else if (qData) {
                if (effectiveIsCorrect === true) {
                    status = 'correct';
                    pointsEarned = q.points;
                    if (q.correctionType === 'auto') {
                        pointsEarned = q.points - ((qData.attempts - 1) * q.points);
                        const maxPenalty = q.points * 2;
                        pointsEarned = Math.max(-maxPenalty, pointsEarned);
                        autoScore += pointsEarned;
                    } else {
                        manualCurrentScore += pointsEarned;
                    }
                } else if (effectiveIsCorrect === false) {
                    status = 'incorrect';
                    if (q.correctionType === 'auto') {
                        pointsEarned = -q.points;
                        autoScore += pointsEarned;
                    } else {
                        pointsEarned = 0;
                    }
                } else if (effectiveIsCorrect === null && q.correctionType !== 'auto') {
                    if (effectiveWasAnswered) {
                        status = 'pending';
                        manualRemainingMax += q.points;
                    } else {
                        status = 'unanswered';
                        if (submissionStatus === 'not_submitted' || submissionStatus === 'returned_for_revision')
                            manualRemainingMax += q.points;
                    }
                    pointsEarned = 0;
                } else if (
                    q.correctionType === 'auto' &&
                    !effectiveWasAnswered &&
                    (submissionStatus === 'not_submitted' || submissionStatus === 'returned_for_revision')
                ) {
                    autoRemainingRisk += q.points;
                }
            } else {
                status = 'unanswered';
                pointsEarned = 0;
                if (
                    q.correctionType === 'auto' &&
                    (submissionStatus === 'not_submitted' || submissionStatus === 'returned_for_revision')
                ) {
                    autoRemainingRisk += q.points;
                } else if (submissionStatus === 'not_submitted' || submissionStatus === 'returned_for_revision') {
                    manualRemainingMax += q.points;
                }
            }

            questionDetails.push({
                id: q.id,
                title: q.title,
                type: q.correctionType,
                points: q.points,
                status,
                attempts: qData ? qData.attempts : 0,
                pointsEarned
            });
        });

        const noteMax = APP_CONFIG.MAX_NOTE;
        const minAutoScore = Math.max(0, autoScore - autoRemainingRisk);
        const autoProjectedScore = Math.max(0, autoScore);
        const minScore = minAutoScore + manualCurrentScore;
        const currentScore = autoProjectedScore + manualCurrentScore;
        const maxScorePossible = autoProjectedScore + autoRemainingRisk + manualCurrentScore + manualRemainingMax;
        const minNote = totalPossiblePoints > 0 ? (minScore / totalPossiblePoints) * noteMax : 0;
        const maxNote = totalPossiblePoints > 0 ? (maxScorePossible / totalPossiblePoints) * noteMax : 0;

        let coursePenalty = 0;
        const totalCourses = chapterConfig.courseValidationCount;
        const validatedCourses = chapter.answeredCourses || 0;
        if (validatedCourses < totalCourses) coursePenalty = 2;

        let questionsHtml = '';
        questionDetails.forEach(q => {
            let statusIcon = '';
            let statusText = '';
            let statusClass = '';

            if (q.status === 'corrected' || q.manualCorrectionStatus === 'corrected') {
                if (q.pointsEarned >= q.points) {
                    statusIcon = '✅'; statusClass = 'correct';
                } else if (q.pointsEarned > 0) {
                    statusIcon = '🟠'; statusClass = 'partial';
                } else {
                    statusIcon = '❌'; statusClass = 'incorrect';
                }
                statusText = 'Corrigé';
            } else {
                switch (q.status) {
                    case 'correct':
                        statusIcon = '✅';
                        statusText = q.attempts > 1 ? `${q.attempts} essais` : '1 essai';
                        statusClass = 'correct';
                        break;
                    case 'incorrect':
                        statusIcon = '❌';
                        statusText = q.attempts > 0 ? `${q.attempts} essai${q.attempts > 1 ? 's' : ''}` : 'Non réussie';
                        statusClass = 'incorrect';
                        break;
                    case 'unanswered':
                        statusIcon = '⚪'; statusText = 'Non répondue'; statusClass = 'unanswered';
                        break;
                    case 'pending':
                        statusIcon = '⏳'; statusText = 'En attente'; statusClass = 'pending';
                        break;
                    // 'corrected' est traité plus haut, avec une icône proportionnelle
                    // aux points obtenus — la branche attendait ce statut sans qu'aucun
                    // calcul ne le produise jamais.
                }
            }

            questionsHtml += `
                <div class="detail-row">
                    <span class="detail-qid">${q.title}</span>
                    <span class="detail-type">${q.type}</span>
                    <span class="detail-status ${statusClass}">${statusIcon} ${statusText}</span>
                    <span class="detail-attempts">${
                        // Le nombre d'essais n'a de sens que sur une question
                        // auto-corrigée effectivement tentée : ailleurs, « 0 essai »
                        // ou un compteur sur une question corrigée à la main ne
                        // désigne rien.
                        (q.type === 'auto' && q.attempts > 0)
                            ? `Nombre d'essais: ${q.attempts}`
                            : ''
                    }</span>
                    <span class="detail-points">${q.pointsEarned > 0 ? '+' : ''}${q.pointsEarned}/${q.points}</span>
                </div>
            `;
        });

        const modalContent = `
            <div class="modal-overlay" onclick="ChapterBilan.closeAutoCorrectDetails(event)">
                <div class="modal-content bilan-complet">
                    <div class="modal-header">
                        <h3>📊 Bilan du chapitre</h3>
                        <button class="modal-close" onclick="ChapterBilan.closeAutoCorrectDetails(event)">×</button>
                    </div>
                    <div class="modal-body">
                        ${submissionStatus === 'validated' && typeof chapter.noteSur20 !== 'undefined' ? `
                            <div class="note-item">
                                <span class="note-label">Note finale</span>
                                <span class="note-value final">${chapter.noteSur20} sur 20</span>
                            </div>
                        ` : ''}
                        <div class="section-title">📋 Résumé</div>
                        <div class="note-range">
                            ${autoMaxPossible > 0 ? `
                            <div class="note-item">
                                <span class="note-label">Points auto-corrigés</span>
                                <span class="note-value current">${autoProjectedScore} sur ${autoMaxPossible}</span>
                            </div>
                            ` : ''}
                            ${(totalPossiblePoints - autoMaxPossible) > 0 ? `
                            <div class="note-item">
                                <span class="note-label">Points semi/manuels validés</span>
                                <span class="note-value current">${manualCurrentScore} sur ${totalPossiblePoints - autoMaxPossible}</span>
                            </div>
                            ` : ''}
                            <div class="note-item">
                                <span class="note-label">Total acquis actuellement</span>
                                <span class="note-value current">${currentScore} sur ${totalPossiblePoints}</span>
                            </div>
                            ${minScore !== maxScorePossible ? `
                            <div class="note-item">
                                <span class="note-label">Total minimal possible</span>
                                <span class="note-value min">${minScore} sur ${totalPossiblePoints}</span>
                            </div>
                            <div class="note-item">
                                <span class="note-label">Note minimale possible</span>
                                <span class="note-value min">${minNote.toFixed(1)} sur 20</span>
                            </div>
                            <div class="note-item">
                                <span class="note-label">Note maximale possible</span>
                                <span class="note-value max">${maxNote.toFixed(1)} sur 20</span>
                            </div>
                            ` : `
                            <div class="note-item">
                                <span class="note-label">Note</span>
                                <span class="note-value final">${minNote.toFixed(1)} sur 20</span>
                            </div>
                            `}
                        </div>
                        ${chapterConfig.courseValidationCount > 0 ? `
                        <div class="section-title">📚 Cours validés</div>
                        <div class="note-range">
                            <div class="note-item">
                                <span class="note-label">Cours marqués comme lus</span>
                                <span class="note-value current">${chapter.answeredCourses || 0} sur ${chapterConfig.courseValidationCount}</span>
                            </div>
                            ${coursePenalty > 0 ? `
                            <div class="note-item">
                                <span class="note-label">Pénalité appliquée sur la note sur 20</span>
                                <span class="note-value min">-${coursePenalty}</span>
                            </div>
                            ` : ''}
                        </div>
                        ` : ''}
                        <div class="section-title">📝 Détail par question</div>
                        <div class="questions-list">
                            ${questionsHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;

        let existingModal = document.getElementById('auto-correct-details-modal');
        if (existingModal) existingModal.remove();

        const modalDiv = document.createElement('div');
        modalDiv.id = 'auto-correct-details-modal';
        modalDiv.innerHTML = modalContent;
        document.body.appendChild(modalDiv);

        // Focus sur le bouton de fermeture pour accessibilité
        const closeBtn = modalDiv.querySelector('.modal-close');
        if (closeBtn) closeBtn.focus();
    },

    // ------------------------------------------------------------------------
    // BILAN SIMPLIFIÉ POUR LE MODE BLIND (modale avec 2 choix)
    // ------------------------------------------------------------------------

    showBlindBilan(earnedPoints, totalPoints, chapterConfig, chapter) {
        this._saveFocus();
        // Supprimer toute modale existante
        document.getElementById('auto-correct-details-modal')?.remove();

        // --- Calcul des notes min/max en mode "rendu définitif" ---
        // Principe : auto non répondu ou erroné = 0 pt (définitif).
        // Seules les questions manuelles/semi vraiment incertaines
        // (réponse présente ET seuil de caractères atteint si applicable)
        // contribuent à la note maximale.
        const noteMax = APP_CONFIG.MAX_NOTE;
        const allQuestions = chapterConfig.questions;
        const chapterQuestions = (chapter && chapter.questions) ? chapter.questions : {};

        let blindMinScore = 0;
        let blindMaxScore = 0;

        allQuestions.forEach(q => {
            const qData = chapterQuestions[q.id];
            const answerText = (qData && typeof qData.answer === 'string') ? qData.answer : '';
            const answerLength = answerText.trim().length;

            if (q.correctionType === 'auto') {
                // Auto : on ne compte que ce qui est déjà acquis (isCorrect === true)
                if (qData && qData.isCorrect === true) {
                    const penalty = (qData.attempts - 1) * q.points;
                    const pts = Math.max(-q.points * 2, q.points - penalty);
                    blindMinScore += Math.max(0, pts);
                    blindMaxScore += Math.max(0, pts);
                }
                // Non répondu ou incorrect → 0 dans les deux cas (définitif)

            } else {
                // Questions manuelles ou semi-auto
                const hasMinLength = q.minLength && q.minLength > 0;
                const answered = qData && (
                    qData.answered === true ||
                    (typeof qData.answer === 'string' && qData.answer.trim() !== '') ||
                    (Array.isArray(qData.answer) && qData.answer.length > 0)
                );

                if (q.correctionType === 'semi' && hasMinLength) {
                    // Semi avec seuil : incertain seulement si le seuil est atteint
                    if (answered && answerLength >= q.minLength) {
                        // Incertain → contribue à la note max uniquement
                        blindMaxScore += q.points;
                    }
                    // Sous le seuil ou non répondu → faux à coup sûr → 0 partout

                } else {
                    // Manuel (toutes règles) ou semi sans seuil : incertain si répondu
                    if (answered) {
                        blindMaxScore += q.points;
                    }
                    // Non répondu → 0 partout (pas d'espoir si rien n'a été envoyé)
                }
            }
        });

        const blindMinNote = totalPoints > 0 ? (blindMinScore / totalPoints) * noteMax : 0;
        const blindMaxNote = totalPoints > 0 ? (blindMaxScore / totalPoints) * noteMax : 0;

        const modalContent = `
            <div class="modal-overlay" style="cursor: default;">
                <div class="modal-content bilan-reduit">
                    <div class="modal-header">
                        <h3>📋 Bilan — Mode Blind</h3>
                    </div>
                    <div class="modal-body">
                        <div class="section-title">📊 Résumé</div>
                        <div class="note-range">
                            ${blindMinScore !== blindMaxScore ? `
                            <div class="note-item">
                                <span class="note-label">Note minimale</span>
                                <span class="note-value min">${blindMinNote.toFixed(1)} / ${noteMax} (${blindMinScore} pt${blindMinScore > 1 ? 's' : ''})</span>
                            </div>
                            <div class="note-item">
                                <span class="note-label">Note maximale</span>
                                <span class="note-value max">${blindMaxNote.toFixed(1)} / ${noteMax} (${blindMaxScore} pt${blindMaxScore > 1 ? 's' : ''})</span>
                            </div>
                            ` : `
                            <div class="note-item">
                                <span class="note-label">Note</span>
                                <span class="note-value final">${blindMinNote.toFixed(1)} / ${noteMax} (${blindMinScore} pt${blindMinScore > 1 ? 's' : ''})</span>
                            </div>
                            `}
                        </div>
                        ${blindMinScore !== blindMaxScore ? `
                        <p style="text-align:center; font-size:0.85rem; color:#666; margin-top:0.75rem;">
                            L'écart vient des questions qui attendent une correction manuelle.
                        </p>
                        ` : ''}
                        <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 2rem;">
                            <button class="btn btn-success" id="blind-validate-btn" style="padding: 0.75rem 1.5rem; font-size: 1.1rem;">
                                ✅ Valider définitivement
                            </button>
                            <button class="btn btn-warning" id="blind-retry-btn" style="padding: 0.75rem 1.5rem; font-size: 1.1rem;">
                                🔄 Recommencer
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modalDiv = document.createElement('div');
        modalDiv.id = 'auto-correct-details-modal';
        modalDiv.innerHTML = modalContent;
        document.body.appendChild(modalDiv);

        // Cacher le bouton de rendu initial
        const submitBtn = document.getElementById('submit-chapter-btn');
        if (submitBtn) submitBtn.style.display = 'none';

        // Événement "Valider définitivement"
        document.getElementById('blind-validate-btn').addEventListener('click', async () => {
            if (!await ChapterSubmission._confirmModal('✅ Êtes-vous sûr de vouloir VALIDER DÉFINITIVEMENT ce chapitre ?\n\nCette action est irréversible.')) return;
            await ChapterSubmission._finalizeBlindSubmission(chapterConfig);
            // Réafficher le bouton de rendu (mis à jour par updateSubmitButton)
            const submitBtn = document.getElementById('submit-chapter-btn');
            if (submitBtn) submitBtn.style.display = 'block';
            document.getElementById('auto-correct-details-modal')?.remove();
            ChapterBilan._restoreFocus();
        });

        // Événement "Recommencer"
        document.getElementById('blind-retry-btn').addEventListener('click', async () => {
            if (!await ChapterSubmission._confirmModal('🔄 Êtes-vous sûr de vouloir RECOMMENCER ?\n\nToutes les questions auto-corrigées seront remises à zéro.\nLes questions à correction manuelle seront conservées.')) return;
            await ChapterSubmission._resetBlindAttempt();
            document.getElementById('auto-correct-details-modal')?.remove();
            ChapterBilan._restoreFocus();
        });
    },

    closeAutoCorrectDetails(event) {
        if (event) event.stopPropagation();
        document.getElementById('auto-correct-details-modal')?.remove();
        // Remettre le bouton de rendu si la modale est fermée sans valider (mode blind)
        const submitBtn = document.getElementById('submit-chapter-btn');
        if (submitBtn) submitBtn.style.display = 'block';
        // Restaurer le focus sur l'élément actif avant l'ouverture du modal
        this._restoreFocus();
    }
};

window.ChapterBilan = ChapterBilan;
window.showDetailsBilanChapter = (...args) => ChapterBilan.showDetailsBilanChapter(...args);
window.closeAutoCorrectDetails = (event) => ChapterBilan.closeAutoCorrectDetails(event);