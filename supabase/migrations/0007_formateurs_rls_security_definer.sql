-- ============================================================================
-- Migration multi-formateur — un formateur approuvé peut enfin lire/écrire ses données
-- ============================================================================
-- Dépend de 0001 à 0006. Ne concerne QUE le mode Web (base commune).
-- Fichier de référence, jamais exécuté automatiquement par ce dépôt : à copier
-- dans l'éditeur SQL du projet Supabase partagé, à la suite de 0006.
--
-- ── Le problème corrigé ────────────────────────────────────────────────────
-- Les policies posées en 0002 (bloc 3) testent :
--   EXISTS (SELECT 1 FROM formateurs WHERE id = auth.uid() AND status = 'approved')
-- Ce sous-SELECT s'exécute avec les droits de l'APPELANT, pas d'un rôle
-- privilégié. Or `formateurs` a la RLS activée et AUCUNE policy (0002, bloc 1
-- : accès réservé au service_role, par conception). Un formateur ne voit donc
-- JAMAIS sa propre ligne dans ce sous-SELECT, quel que soit son statut réel —
-- le EXISTS est toujours faux. Conséquence mesurée en conditions réelles
-- (compte "xgrandjean", déjà approuvé en base) : aucune lecture ni écriture
-- de ses propres données n'aboutit jamais, et XSpro affiche à tort "en attente
-- de validation" (lui-même déduit ce message d'un simple refus, sans vérifier
-- qu'une inscription existe — défaut distinct, côté application).
--
-- Seule la fonction serveur `superadmin` (clé service_role, contourne la RLS)
-- a jamais fonctionné, ce qui explique que ce défaut soit passé inaperçu
-- pendant les vérifications de la migration 0006 : elles ne testaient que ce
-- chemin-là, jamais une écriture par un formateur ordinaire.
--
-- ── Le choix fait ici ──────────────────────────────────────────────────────
-- Une fonction SECURITY DEFINER lit `formateurs` avec les droits de son
-- PROPRIÉTAIRE (le rôle qui l'a créée), pas de l'appelant — elle peut donc
-- répondre à "l'appelant est-il un formateur approuvé ?" sans jamais exposer
-- la table elle-même à qui que ce soit. C'est le motif standard pour ce cas
-- (même principe que handle_new_formateur, déjà SECURITY DEFINER).


-- ── 1. La fonction ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION est_formateur_approuve()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM formateurs
         WHERE id = auth.uid() AND status = 'approved'
    );
$$;


-- ── 2. Les deux policies de 0002 s'appuient sur elle au lieu du EXISTS direct

DROP POLICY IF EXISTS owner_isolation_app_data ON app_data;
CREATE POLICY owner_isolation_app_data ON app_data
    FOR ALL
    USING      (owner_id = auth.uid() AND est_formateur_approuve())
    WITH CHECK (owner_id = auth.uid() AND est_formateur_approuve());

DROP POLICY IF EXISTS owner_isolation_parcours_data ON parcours_data;
CREATE POLICY owner_isolation_parcours_data ON parcours_data
    FOR ALL
    USING      (owner_id = auth.uid() AND est_formateur_approuve())
    WITH CHECK (owner_id = auth.uid() AND est_formateur_approuve());

-- Remarque : la policy read_platform_mode_app_data (0002) a été retirée par
-- 0005 et ne réapparaît pas ici — le mode est sorti de la base.
