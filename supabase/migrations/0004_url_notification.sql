-- ============================================================================
-- Migration multi-formateur — l'URL de notification, sans privilège superutilisateur
-- ============================================================================
-- Dépend de 0001, 0002 et 0003.
--
-- ── Le problème corrigé ────────────────────────────────────────────────────
-- La 0002 faisait lire au trigger l'adresse du projet via
-- current_setting('app.settings.supabase_url'), en documentant qu'il fallait
-- exécuter une fois :
--     ALTER DATABASE postgres SET app.settings.supabase_url = '...'
--
-- Sur un projet Supabase HÉBERGÉ, cette commande est refusée :
--     ERROR 42501: permission denied to set parameter "app.settings.supabase_url"
-- et la variante ALTER ROLE l'est tout autant. Le réglage n'était donc
-- réalisable qu'en local ou en auto-hébergement — autrement dit nulle part où
-- ce projet est censé tourner. Le trigger retombait silencieusement sur NULL,
-- l'appel http_post échouait, et l'administrateur n'était jamais prévenu qu'un
-- formateur venait de s'inscrire.
--
-- ── Le choix fait ici ──────────────────────────────────────────────────────
-- L'adresse est désormais lue dans app_data, comme les autres réglages globaux
-- (owner_id NULL, cf. Phase 2bis) : une simple ligne, que n'importe quel rôle
-- disposant de la clé service_role peut poser. Le paramètre de session reste
-- essayé EN PREMIER, pour ne rien casser d'une installation locale qui l'aurait
-- déjà réglé.
--
-- Le trigger étant SECURITY DEFINER, il lit cette ligne malgré la RLS fermée.


-- ── 1. Résolution de l'adresse, en deux temps ──────────────────────────────

CREATE OR REPLACE FUNCTION url_notification_formateurs()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_url text;
BEGIN
    -- 1) Paramètre de session : le chemin d'origine, toujours valable en local
    --    ou en auto-hébergement, où ALTER DATABASE est permis.
    v_url := current_setting('app.settings.supabase_url', true);
    IF v_url IS NOT NULL AND v_url <> '' THEN
        RETURN v_url;
    END IF;

    -- 2) Réglage global en base : le seul chemin praticable sur un projet
    --    hébergé. value est un jsonb ; #>> '{}' en extrait le texte brut.
    SELECT value #>> '{}' INTO v_url
      FROM app_data
     WHERE owner_id IS NULL AND key = 'supabase_url';

    RETURN NULLIF(v_url, '');
END;
$$;


-- ── 2. Le trigger passe par cette résolution ───────────────────────────────
-- Identique à la version de 0003, à l'exception de l'URL. Recopié en entier
-- plutôt que modifié en place : une fonction PL/pgSQL se remplace, elle ne se
-- rapièce pas.

CREATE OR REPLACE FUNCTION handle_new_formateur()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_github_login text := NEW.raw_user_meta_data->>'user_name';
    v_cle          text := lower(COALESCE(NEW.raw_user_meta_data->>'user_name', NEW.email, NEW.id::text));
    v_fusionnees   integer := 0;
    v_url          text;
BEGIN
    -- Cas 1 : ligne pré-créée par l'administrateur, déjà approuvée. On adopte
    -- le vrai id auth.users sans toucher au statut ni notifier : la décision
    -- d'approbation est déjà prise.
    UPDATE formateurs
       SET id                   = NEW.id,
           email                = COALESCE(formateurs.email, NEW.email),
           awaiting_first_login = false
     WHERE lower(formateurs.github_login) = v_cle
       AND formateurs.awaiting_first_login = true;

    GET DIAGNOSTICS v_fusionnees = ROW_COUNT;

    IF v_fusionnees = 0 THEN
        -- Cas 2 : personne ne l'attendait — auto-inscription en attente
        -- d'approbation, et notification de l'administrateur.
        INSERT INTO formateurs (id, github_login, email, status)
        VALUES (NEW.id, COALESCE(v_github_login, NEW.email, NEW.id::text), NEW.email, 'pending')
        ON CONFLICT (lower(github_login)) DO NOTHING;

        v_url := url_notification_formateurs();

        -- Sans adresse, on n'appelle rien plutôt que d'appeler NULL : la ligne
        -- « pending » existe de toute façon, seule la notification manque, et
        -- l'administrateur la verra dans admin-formateurs.html.
        IF v_url IS NOT NULL THEN
            PERFORM net.http_post(
                url     := v_url || '/functions/v1/notify-admin-new-teacher',
                headers := jsonb_build_object('Content-Type', 'application/json'),
                body    := jsonb_build_object('formateur_id', NEW.id, 'github_login', v_github_login, 'email', NEW.email)
            );
        END IF;
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW; -- ne jamais faire échouer la création du compte pour une erreur de notification
END;
$$;

-- Le trigger lui-même (on_auth_user_created_formateur, cf. 0002) est inchangé.
