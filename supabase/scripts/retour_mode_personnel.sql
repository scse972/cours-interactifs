-- ============================================================================
-- Ramener un projet Supabase du mode Web au mode Personnel
-- ============================================================================
-- CE FICHIER N'EST PAS UNE MIGRATION, et il ne doit pas le devenir : les
-- migrations 0001 à 0004 forment la chaîne du mode Web, et `supabase db push`
-- les applique toutes. Un fichier 0005 qui les défait serait appliqué au projet
-- du site partagé et le casserait.
--
-- À exécuter à la main, dans l'éditeur SQL du projet concerné, quand un projet
-- ayant reçu les migrations multi-formateur doit servir au mode Personnel.
--
-- ── Pourquoi c'est nécessaire ──────────────────────────────────────────────
-- Les deux modes demandent des sécurités OPPOSÉES, et un même projet ne peut
-- pas servir les deux :
--
--   Personnel : aucune session — le formateur EST la clé anonyme, qui doit donc
--               pouvoir tout lire et tout écrire.
--   Web       : chaque formateur a une session, et ne voit que ses lignes.
--
-- Laisser les policies du mode Web sur un projet personnel donne une base
-- joignable où toute écriture échoue en 42501, sans que rien ne l'explique.


-- ── 1. Vérification préalable, avant de toucher à l'unicité ────────────────
-- Le point 3 rétablit UNIQUE (key). S'il existe déjà deux lignes de même clé,
-- l'opération échouerait au milieu du script. On préfère refuser d'emblée, avec
-- un message qui dit quoi faire.
DO $$
DECLARE
    v_doublons integer;
BEGIN
    SELECT count(*) INTO v_doublons FROM (
        SELECT key FROM app_data      GROUP BY key HAVING count(*) > 1
        UNION ALL
        SELECT key FROM parcours_data GROUP BY key HAVING count(*) > 1
    ) d;

    IF v_doublons > 0 THEN
        RAISE EXCEPTION
            'Ce projet contient % clé(s) en double. Elles ont pu naître pendant que la '
            'contrainte était UNIQUE (owner_id, key) : owner_id valant NULL en mode '
            'personnel, PostgreSQL considère deux NULL comme distincts et laisse passer '
            'des doublons. Supprimez les lignes surnuméraires avant de rejouer ce script.',
            v_doublons;
    END IF;
END $$;


-- ── 2. Rendre l'accès à la clé anonyme ─────────────────────────────────────

DROP POLICY IF EXISTS owner_isolation_app_data      ON app_data;
DROP POLICY IF EXISTS owner_isolation_parcours_data ON parcours_data;
DROP POLICY IF EXISTS read_platform_mode_app_data   ON app_data;

DROP POLICY IF EXISTS "Accès public app_data" ON app_data;
CREATE POLICY "Accès public app_data"
    ON app_data FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Accès public parcours_data" ON parcours_data;
CREATE POLICY "Accès public parcours_data"
    ON parcours_data FOR ALL USING (true) WITH CHECK (true);


-- ── 3. Rétablir l'unicité sur la seule clé ─────────────────────────────────
-- Le point le plus important, et le moins visible. La migration 0001 avait
-- remplacé UNIQUE (key) par UNIQUE (owner_id, key) pour que deux formateurs
-- puissent avoir la même clé logique. En mode personnel owner_id vaut toujours
-- NULL, et deux NULL n'entrent jamais en conflit : la contrainte ne protégeait
-- donc plus rien. L'upsert du provider (Prefer: resolution=merge-duplicates)
-- s'appuie sur cette unicité — sans elle, republier créerait un doublon
-- silencieux au lieu de remplacer, et le site lirait l'une ou l'autre ligne.

ALTER TABLE app_data      DROP CONSTRAINT IF EXISTS app_data_owner_key_unique;
ALTER TABLE parcours_data DROP CONSTRAINT IF EXISTS parcours_data_owner_key_unique;

ALTER TABLE app_data      ADD CONSTRAINT app_data_key_unique      UNIQUE (key);
ALTER TABLE parcours_data ADD CONSTRAINT parcours_data_key_unique UNIQUE (key);


-- ── 4. Retirer la machinerie propre au mode Web ────────────────────────────
-- Le trigger d'abord : il se déclenche à chaque création de compte dans
-- auth.users et tenterait d'inscrire un formateur puis d'appeler une fonction
-- serveur, sur un projet où plus rien de tout cela n'a de sens.

DROP TRIGGER  IF EXISTS on_auth_user_created_formateur ON auth.users;
DROP FUNCTION IF EXISTS handle_new_formateur();
DROP FUNCTION IF EXISTS url_notification_formateurs();
DROP TABLE    IF EXISTS formateurs;

-- Réglages globaux du mode Web (owner_id NULL). Sans objet ici, et
-- `platform_mode` laissé à "web" ferait afficher au site une page de connexion
-- GitHub qui ne mènerait nulle part.
DELETE FROM app_data
 WHERE owner_id IS NULL
   AND key IN ('platform_mode', 'admin_notification_email', 'supabase_url');


-- ── 5. Ce qui reste volontairement ─────────────────────────────────────────
-- La colonne owner_id subsiste dans les deux tables : nullable, plus contrainte
-- par rien, elle ne gêne pas et la retirer demanderait de reconstruire les
-- index. Elle permet d'ailleurs de rebasculer ce projet en mode Web plus tard
-- en rejouant simplement les migrations.
--
-- Les fonctions Edge déployées (superadmin, notify-admin-new-teacher,
-- student-progress) ne sont pas concernées par ce script : elles ne s'exécutent
-- que si on les appelle, et le site en mode Personnel ne les appelle jamais.
-- Les supprimer se fait depuis la CLI :
--   supabase functions delete superadmin
