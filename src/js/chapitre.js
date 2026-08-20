// ============================================================================
// CHAPITRE.JS - Orchestration de la page de chapitre
// ============================================================================
// Fichier allégé : la logique métier, DOM et bilan ont été factorisés dans :
//   - core/chapterSession.js    (session, sync progressManager)
//   - chapter/chapterUI.js      (DOM, restauration, indicateurs)
//   - chapter/chapterSubmission.js (rendu, validation, lock)
//   - chapter/chapterBilan.js   (modal bilan détaillé)
// ============================================================================

// ============================================================================
// CHARGEMENT CONFIG
// ============================================================================
async function loadChapterConfig() {
    const isChapterPage = window.location.pathname.includes('chapitre') || 
                        window.location.pathname.includes('chapter_template');
    if (!isChapterPage) return;
    try {
        // Récupérer l'ID du chapitre depuis window.currentChapitreId ou l'URL
        let chapterId = window.currentChapitreId;
        if (!chapterId) {
            const urlParams = new URLSearchParams(window.location.search);
            chapterId = urlParams.get('chapitre');
        }
        
        if (chapterId) {
            // Charger cours.json si pas déjà fait
            if (!window.chaptersIndex) {
                const data = await staticJson.get('/parcours/cours.json');

                if (data && Array.isArray(data.parcours)) {
                    const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
                    const parcours = data.parcours.find(p => p.slug === slug);
                    if (parcours) {
                        window.chaptersIndex = { chapters: parcours.chapitres };
                    }
                } else {
                    console.error('❌ Impossible de charger cours.json.');
                }
            }

            const staticConfig = window.chaptersIndex?.chapters?.find(ch => ch.id == chapterId);
            
            const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
            const configKey = slug ? `${slug}:config:chapter_config` : 'chapter_config';
            const storageConfig = await storage.get(configKey);
            
            window.currentChapterConfig = {
                ...staticConfig,
                ...(storageConfig?.[chapterId] || {})
            };
        }
    } catch (error) {
        console.warn('[ChaptersIndex] Erreur lors du chargement de la configuration:', error);
    }
}

// ============================================================================
// INITIALISATION PROGRESSION
// ============================================================================


async function initProgression() {
    const pm = window.ProgressManager;
    if (!pm || !pm.getOrCreateStudentProgress) return;

    ChapterSession.studentId = pm.getCurrentStudentId ? pm.getCurrentStudentId() : null;
    ChapterSession.chapterId = pm.getCurrentChapterId ? pm.getCurrentChapterId() : null;

    if (!ChapterSession.studentId || !ChapterSession.chapterId) return;

    ChapterSession.progress = await pm.getOrCreateStudentProgress(
        ChapterSession.studentId,
        'Apprenant',
        window.currentChapterConfig || {}
    );

    if (pm.ensureChapterInitialized && window.chaptersIndex) {
        pm.ensureChapterInitialized(ChapterSession.progress, window.chaptersIndex);
    }

    if (pm.restoreSavedAnswers) {
        pm.restoreSavedAnswers(ChapterSession.progress, ChapterSession.chapterId);
    }

    if (pm.saveProgress) {
        await pm.saveProgress(ChapterSession.studentId, ChapterSession.progress);
    }

    // ✅ INITIALISATION UNIQUE DU CONTEXTE EXAMEN
    initChapterExamContext(ChapterSession.progress.chapters[ChapterSession.chapterId]);
}

// ============================================================================
// INITIALISATION UI ET CALLBACKS
// ============================================================================

function initCallbacks() {
    window.studentWorkEditor.options.onAnswerValidated = ({
        questionId,
        answer,
        isCorrect,
        points
    }) => {
        const isEmpty =
            answer === null ||
            answer === undefined ||
            answer === '' ||
            (Array.isArray(answer) && answer.length === 0);

        // 🔥 IMPORTANT : en mode examen/blind on NE bloque PAS
        const isBlindOrExam = window.currentChapterConfig?.chapterMode === 'exam' ||
                              window.currentChapterConfig?.chapterMode === 'blind' ||
                              window.currentChapterConfig?.examMode === true;
        if (isEmpty && !isBlindOrExam) return;

        syncAnswerToProgress(questionId, answer, isCorrect, isCorrect ? points : 0);
        ChapterUI.updateAllProgressIndicators();
    };

    window.studentWorkEditor.init();
}

// ============================================================================
// INITIALISATION GLOBALE
// ============================================================================

async function initChapterPage() {
    const isChapterPage = window.location.pathname.includes('chapitre') ||
                        window.location.pathname.includes('chapter_template');
    if (!isChapterPage) return;

    const urlParams = new URLSearchParams(window.location.search);
    const isTeacherView = urlParams.get('teacher_view') === 'true';

    await loadChapterConfig();
    await initProgression();

    // Mode formateur : lecture seule (verrouillage déjà géré par _lockInterfaceForTeacher).
    // On charge quand même la progression pour afficher les réponses de l'apprenant.
    if (isTeacherView) {
        console.log('👨‍🏫 Mode formateur — affichage de la progression en lecture seule');
        ChapterUI.initializeStats();
        ChapterUI.applyChapterMode();

        setTimeout(() => {
            ChapterUI.restoreAllAnswers();
            ChapterUI.updateAllProgressIndicators();
            window.AtelierQuestion?.init();
        }, 500);
        return;
    }

    // ✅ Vérifier et verrouiller si chapitre déjà rendu, ou verrouillé par le formateur
    //    (verrou manuel global — la date limite ne verrouille pas, elle marque juste le
    //    rendu comme "en retard" au moment où l'élève rend sa copie, voir submitChapter())
    const chapter = ChapterSession.progress?.chapters?.[ChapterSession.chapterId];
    const isSubmitted = chapter?.submissionStatus === 'submitted' ||
                        chapter?.submissionStatus === 'late_submitted';
    const isValidated = chapter?.submissionStatus === 'validated';
    const isTeacherLocked = window.currentExamContext?.isTeacherLocked === true;

    if (isSubmitted || isValidated || isTeacherLocked) {
        console.log('🔒 Chapitre verrouillé (rendu/validé/formateur), verrouillage immédiat');

        // Désactiver tous les boutons et inputs (sauf navigation)
        document.querySelectorAll('input, select, textarea, button').forEach(el => {
            // Ne pas désactiver les boutons de navigation (Retour au menu)
            const isNavButton = el.closest('.chapter-nav') ||
                               el.closest('.progress-actions') ||
                               el.classList.contains('btn-secondary');
            if (!isNavButton) {
                el.disabled = true;
                el.style.opacity = '0.6';
                el.style.cursor = 'not-allowed';
            }
        });

        // Modifier le bouton de soumission
        const submitBtn = document.getElementById('submit-chapter-btn');
        if (submitBtn) {
            if (isValidated) {
                submitBtn.textContent = '✅ Validé par votre évaluateur';
            } else if (isSubmitted) {
                submitBtn.textContent = '📝 Rendu - En attente de correction';
            } else {
                submitBtn.textContent = '🔒 Chapitre verrouillé';
            }
            submitBtn.disabled = true;
        }

        // Ajouter le message de confirmation
        let msgDiv = document.getElementById('submission-confirmation-msg');
        if (!msgDiv) {
            msgDiv = document.createElement('div');
            msgDiv.id = 'submission-confirmation-msg';
            const mainContent = document.querySelector('.chapter-content');
            if (mainContent) mainContent.insertBefore(msgDiv, mainContent.firstChild);
        }
        if (isValidated) {
            msgDiv.innerHTML = '✅ <strong>Chapitre validé</strong> - Félicitations !';
        } else if (isSubmitted) {
            msgDiv.innerHTML = '📝 <strong>Copie rendue</strong> - Plus de modifications possibles.<br>Votre évaluateur la corrigera prochainement.';
        } else {
            msgDiv.innerHTML = '🔒 <strong>Chapitre verrouillé</strong> par votre formateur.';
        }
        msgDiv.style.cssText = 'background: #e8f5e9; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; text-align: center;';
    }

    ChapterUI.initializeStats();
    ChapterUI.applyChapterMode();
    initCallbacks();

    setTimeout(() => {
        ChapterUI.updateSubmitButton();
        ChapterUI.restoreAllAnswers();
        ChapterUI.updateAllProgressIndicators();
        // ⚠️ Après restoreAllAnswers : le bloc Atelier lit l'état restauré, et son champ
        //    de saisie d'AR doit survivre au verrouillage d'un chapitre déjà rendu
        //    (l'AR arrive souvent après le rendu — cf. "mode atelier AR.md" §3.1).
        window.AtelierQuestion?.init();
    }, 500);
}

// ============================================================================
// EXPORTS GLOBAUX (compatibilité)
// ============================================================================

window.initChapterPage = initChapterPage;
