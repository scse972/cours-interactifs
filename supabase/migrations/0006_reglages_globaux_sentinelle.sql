-- ============================================================================
-- Migration multi-formateur — les réglages globaux ne se dupliquent plus
-- ============================================================================
-- Dépend de 0001 à 0005. Ne concerne QUE le mode Web (base commune).
-- Fichier de référence, jamais exécuté automatiquement par ce dépôt : à copier
-- dans l'éditeur SQL du projet Supabase partagé, à la suite de 0005.
--
-- ── Le problème corrigé ────────────────────────────────────────────────────
-- Les réglages globaux (admin_notification_email, supabase_url — cf. 0004)
-- sont des lignes app_data avec owner_id = NULL. La contrainte
-- app_data_owner_key_unique UNIQUE (owner_id, key), posée en 0001, ne protège
-- PAS ces lignes : PostgreSQL ne considère jamais deux NULL comme égaux, donc
-- deux lignes owner_id NULL portant la même clé ne sont jamais en conflit.
-- L'upsert de superadmin/index.ts (onConflict: 'owner_id,key') ne déclenche
-- alors jamais sa branche UPDATE pour ces lignes : chaque enregistrement d'un
-- réglage global EN AJOUTE une copie au lieu de remplacer l'ancienne. Une
-- lecture ultérieure (SELECT ... WHERE owner_id IS NULL AND key = '...') tombe
-- alors sur une ligne arbitraire parmi les doublons.
--
-- Ce même défaut est déjà documenté et corrigé pour le mode Personnel dans
-- supabase/scripts/retour_mode_personnel.sql (bloc 3) — cette migration fait
-- l'équivalent pour le mode Web, sans avoir à quitter la RLS multi-tenant.
--
-- ── Le choix fait ici ──────────────────────────────────────────────────────
-- Remplacer owner_id NULL par une valeur sentinelle fixe (le nil UUID) pour
-- les réglages globaux. La contrainte UNIQUE (owner_id, key) déjà en place
-- fonctionne alors normalement : deux lignes sentinelle portant la même clé
-- sont bien détectées comme un conflit, et l'upsert remplace au lieu
-- d'empiler. owner_id devient NOT NULL sur app_data pour empêcher qu'un futur
-- appel réintroduise un NULL et fasse revivre le bug.


-- ── 1. Dédoublonner l'existant avant de resserrer la contrainte ────────────
-- En cas de doublons déjà présents (le bug a pu s'exercer avant ce correctif),
-- ne garder que la ligne la plus récente par clé.

DELETE FROM app_data a
      WHERE a.owner_id IS NULL
        AND a.updated_at < (
            SELECT MAX(b.updated_at) FROM app_data b
             WHERE b.owner_id IS NULL AND b.key = a.key
        );


-- ── 2. Migrer les réglages globaux restants vers la sentinelle ─────────────

UPDATE app_data
   SET owner_id = '00000000-0000-0000-0000-000000000000'
 WHERE owner_id IS NULL;

ALTER TABLE app_data ALTER COLUMN owner_id SET NOT NULL;


-- ── 3. Le trigger lit désormais la sentinelle, pas NULL ────────────────────
-- Recopiée en entier comme en 0004 : seule la clause WHERE change.

CREATE OR REPLACE FUNCTION url_notification_formateurs()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_url text;
BEGIN
    v_url := current_setting('app.settings.supabase_url', true);
    IF v_url IS NOT NULL AND v_url <> '' THEN
        RETURN v_url;
    END IF;

    SELECT value #>> '{}' INTO v_url
      FROM app_data
     WHERE owner_id = '00000000-0000-0000-0000-000000000000' AND key = 'supabase_url';

    RETURN NULLIF(v_url, '');
END;
$$;


-- ── 4. Rappel pour le code applicatif (pas exécuté par cette migration) ────
-- Les fonctions serveur suivantes lisent/écrivent ces mêmes réglages avec
-- owner_id NULL et doivent être mises à jour pour utiliser la sentinelle
-- '00000000-0000-0000-0000-000000000000' :
--   - supabase/functions/superadmin/index.ts (getSettings, setGlobalSetting)
--   - supabase/functions/notify-admin-new-teacher/index.ts
-- Voir le commit qui accompagne cette migration.
