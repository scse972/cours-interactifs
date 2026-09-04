-- ============================================================================
-- Migration multi-formateur — correction de la pré-création manuelle
-- ============================================================================
-- Dépend de 0001_multi_tenant.sql et 0002_formateurs.sql.
-- Fichier de référence, jamais exécuté automatiquement par ce dépôt : à copier
-- dans l'éditeur SQL du projet Supabase partagé, à la suite de 0002.
--
-- ── Le problème corrigé ────────────────────────────────────────────────────
-- En 0002, `formateurs.id` est à la fois la clé primaire ET une clé étrangère
-- vers `auth.users(id)`. Or l'opération `create_formateur` de la fonction
-- `superadmin` sert précisément à inscrire quelqu'un QUI NE S'EST JAMAIS
-- CONNECTÉ : il n'a pas encore de ligne dans auth.users, donc aucun id à
-- poser. L'insertion échouait systématiquement — la pré-création manuelle
-- était inutilisable, seule l'auto-inscription notifiée fonctionnait.
--
-- ── Le choix fait ici ──────────────────────────────────────────────────────
-- On garde `id` comme identifiant unique de bout en bout (les policies RLS le
-- comparent à auth.uid(), la fonction serveur et admin-formateurs.html s'en
-- servent comme clé d'action) et on abandonne la clé étrangère vers
-- auth.users. Une ligne pré-créée porte alors un id PROVISOIRE tiré au hasard,
-- que la première connexion GitHub remplace par le vrai id auth.users.
--
-- L'alternative — `id` nullable plus une clé primaire de substitution — aurait
-- imposé de faire circuler deux identifiants dans la fonction serveur, dans
-- l'écran d'administration et dans les policies. La contrainte perdue ne
-- protégeait que d'une chose (une ligne formateurs orpheline d'auth.users), et
-- c'est justement l'état qu'on veut pouvoir représenter.


-- ── 1. Schéma : id libéré d'auth.users, unicité sur le login GitHub ────────

ALTER TABLE formateurs DROP CONSTRAINT IF EXISTS formateurs_id_fkey;

-- Le login GitHub devient la clé de rapprochement entre la ligne pré-créée et
-- la première connexion : il doit donc être unique. GitHub traite les logins
-- sans distinction de casse, l'index l'imite pour qu'un « Scse972 » pré-créé
-- reconnaisse bien un « scse972 » qui se connecte.
CREATE UNIQUE INDEX IF NOT EXISTS formateurs_github_login_unique
    ON formateurs (lower(github_login));

-- Marqueur explicite de l'état « pré-créé, jamais connecté ». Déductible
-- autrement (un id absent d'auth.users), mais une colonne se lit dans l'écran
-- d'administration et dans le trigger sans jointure sur auth.users.
ALTER TABLE formateurs
    ADD COLUMN IF NOT EXISTS awaiting_first_login boolean NOT NULL DEFAULT false;


-- ── 2. Trigger : fusionner avec la ligne pré-créée, ou en créer une ────────
-- Remplace la version de 0002, dont le `ON CONFLICT (id) DO NOTHING` ne
-- pouvait rien rapprocher : l'id provisoire d'une ligne pré-créée n'est jamais
-- celui que Supabase Auth vient de créer. Le rapprochement se fait donc sur le
-- login GitHub.

CREATE OR REPLACE FUNCTION handle_new_formateur()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_github_login text := NEW.raw_user_meta_data->>'user_name';
    v_cle          text := lower(COALESCE(NEW.raw_user_meta_data->>'user_name', NEW.email, NEW.id::text));
    v_fusionnees   integer := 0;
BEGIN
    -- Cas 1 : l'administrateur avait pré-créé (et déjà approuvé) ce login.
    -- On adopte le vrai id auth.users sans toucher au statut : la décision
    -- d'approbation a déjà été prise, la première connexion ne la rejoue pas,
    -- et l'administrateur n'a pas à être notifié de ce qu'il a lui-même
    -- provoqué.
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
        --
        -- DO NOTHING couvre la reconnexion d'un formateur dont la ligne existe
        -- déjà avec le bon id (Supabase Auth ne réinsère pas dans auth.users
        -- dans ce cas, mais la robustesse ne coûte rien ici).
        INSERT INTO formateurs (id, github_login, email, status)
        VALUES (NEW.id, COALESCE(v_github_login, NEW.email, NEW.id::text), NEW.email, 'pending')
        ON CONFLICT (lower(github_login)) DO NOTHING;

        -- Échoue silencieusement si la fonction ou le réseau est indisponible :
        -- ne doit jamais bloquer la création du compte Supabase Auth elle-même.
        PERFORM net.http_post(
            url     := current_setting('app.settings.supabase_url', true) || '/functions/v1/notify-admin-new-teacher',
            headers := jsonb_build_object('Content-Type', 'application/json'),
            body    := jsonb_build_object('formateur_id', NEW.id, 'github_login', v_github_login, 'email', NEW.email)
        );
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW; -- ne jamais faire échouer la création du compte pour une erreur de notification
END;
$$;

-- Le trigger lui-même (on_auth_user_created_formateur) est inchangé : seule la
-- fonction qu'il appelle est remplacée par le CREATE OR REPLACE ci-dessus.


-- ── 3. Rappel sur les policies RLS ─────────────────────────────────────────
-- Aucune n'est à revoir : elles testent `formateurs.id = auth.uid() AND
-- status = 'approved'`. Une ligne pré-créée porte un id provisoire qui ne
-- correspond à aucun auth.uid() — elle n'ouvre donc aucun accès tant que la
-- première connexion n'a pas posé le vrai id. C'est le comportement voulu.
