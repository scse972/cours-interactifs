-- ============================================================================
-- Migration multi-formateur — Phase 4 (workflow d'approbation) et 4bis
-- (désinscription/purge) du plan. Dépend de 0001_multi_tenant.sql.
-- ============================================================================
-- Fichier de référence, jamais exécuté automatiquement par ce dépôt : à copier
-- dans l'éditeur SQL du projet Supabase partagé, à la suite de 0001.


-- ── 1. Table formateurs (liste blanche + statut) ───────────────────────────

CREATE TABLE IF NOT EXISTS formateurs (
    id           uuid PRIMARY KEY REFERENCES auth.users(id),
    github_login text NOT NULL,
    email        text,
    status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'revoked')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    approved_at  timestamptz
);

-- Pas de RLS anonyme sur cette table : elle n'est jamais lue/écrite en direct
-- par un client (ni formateur, ni élève) — uniquement par les fonctions
-- serveur ci-dessous (clé service_role, qui bypass la RLS de toute façon).
ALTER TABLE formateurs ENABLE ROW LEVEL SECURITY;
-- Aucune policy créée : par défaut, RLS activée + 0 policy = 0 accès pour
-- quiconque n'a pas la clé service_role. C'est le comportement voulu ici.


-- ── 2. Auto-inscription : trigger sur la création d'un compte GitHub ───────
-- Dès qu'un utilisateur s'authentifie pour la première fois via le provider
-- GitHub (Supabase Auth crée alors une ligne dans auth.users), on lui ouvre
-- une ligne "pending" dans formateurs et on notifie l'administrateur.

CREATE EXTENSION IF NOT EXISTS pg_net; -- nécessaire pour appeler une Edge Function depuis un trigger SQL

CREATE OR REPLACE FUNCTION handle_new_formateur()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_github_login text := NEW.raw_user_meta_data->>'user_name';
BEGIN
    INSERT INTO formateurs (id, github_login, email, status)
    VALUES (NEW.id, COALESCE(v_github_login, NEW.email, NEW.id::text), NEW.email, 'pending')
    ON CONFLICT (id) DO NOTHING; -- déjà pré-créé manuellement par l'admin (Phase 4, cas "création manuelle")

    -- Notifie l'administrateur — échoue silencieusement si la fonction ou le
    -- réseau est indisponible : ne doit jamais bloquer la création du compte
    -- Supabase Auth elle-même.
    PERFORM net.http_post(
        url     := current_setting('app.settings.supabase_url', true) || '/functions/v1/notify-admin-new-teacher',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := jsonb_build_object('formateur_id', NEW.id, 'github_login', v_github_login, 'email', NEW.email)
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW; -- ne jamais faire échouer la création du compte pour une erreur de notification
END;
$$;

-- Réglage requis une seule fois par projet (remplace <votre-projet>) :
--   ALTER DATABASE postgres SET app.settings.supabase_url = 'https://<votre-projet>.supabase.co';
-- Sans ce réglage, current_setting(...) renvoie NULL et l'appel http_post échoue
-- silencieusement (rattrapé par le EXCEPTION ci-dessus) — la ligne "pending"
-- est tout de même créée, seule la notification manque.

DROP TRIGGER IF EXISTS on_auth_user_created_formateur ON auth.users;
CREATE TRIGGER on_auth_user_created_formateur
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_formateur();


-- ── 3. Resserrement des policies de la Phase 3 ─────────────────────────────
-- Un formateur authentifié mais non "approved" (encore "pending", ou
-- "revoked") ne doit accéder à AUCUNE donnée, même la sienne.

DROP POLICY IF EXISTS owner_isolation_app_data ON app_data;
CREATE POLICY owner_isolation_app_data ON app_data
    FOR ALL
    USING (
        owner_id = auth.uid()
        AND EXISTS (SELECT 1 FROM formateurs WHERE id = auth.uid() AND status = 'approved')
    )
    WITH CHECK (
        owner_id = auth.uid()
        AND EXISTS (SELECT 1 FROM formateurs WHERE id = auth.uid() AND status = 'approved')
    );

DROP POLICY IF EXISTS owner_isolation_parcours_data ON parcours_data;
CREATE POLICY owner_isolation_parcours_data ON parcours_data
    FOR ALL
    USING (
        owner_id = auth.uid()
        AND EXISTS (SELECT 1 FROM formateurs WHERE id = auth.uid() AND status = 'approved')
    )
    WITH CHECK (
        owner_id = auth.uid()
        AND EXISTS (SELECT 1 FROM formateurs WHERE id = auth.uid() AND status = 'approved')
    );

-- Remarque : les réglages "globaux" (platform_mode, admin_notification_email
-- — cf. Phase 2bis) ont owner_id NULL et ne sont donc jamais concernés par ces
-- deux policies (ni lisibles ni modifiables par un formateur, approuvé ou
-- non).


-- ── 4. Correction d'un bug de conception découvert en écrivant cette
--       migration ───────────────────────────────────────────────────────────
-- teacher-login.html doit pouvoir lire platform_mode AVANT toute connexion
-- (anon key seule, auth.uid() = NULL) pour savoir s'il affiche le formulaire
-- mot de passe ou le bouton GitHub. Sans policy dédiée, la fermeture de la RLS
-- ci-dessus le rendrait illisible pour tout le monde, y compris pour décider
-- quoi afficher — cassant le mécanisme même de la Phase 2bis.
--
-- Seule LA LECTURE de cette clé précise est ouverte à l'anonyme — jamais son
-- écriture (qui reste réservée à la fonction serveur "superadmin", clé
-- service_role, plus bas), et jamais les autres réglages globaux
-- (admin_notification_email reste illisible publiquement : c'est une adresse
-- email, pas un flag).

CREATE POLICY read_platform_mode_app_data ON app_data
    FOR SELECT
    USING (owner_id IS NULL AND key = 'platform_mode');
