-- ============================================================================
-- Migration multi-formateur — Phases 1 et 3 du plan
-- ============================================================================
-- Fichier de référence, jamais exécuté automatiquement par ce dépôt : à copier
-- dans l'éditeur SQL du projet Supabase partagé (ou via `supabase db push` si
-- un projet Supabase CLI est initialisé un jour). Ne concerne QUE le mode Web
-- (base commune multi-formateur) — le mode personnel (une base Supabase par
-- formateur, hors périmètre de ce fichier) n'a jamais besoin de cette isolation.
--
-- Prérequis : les tables app_data et parcours_data existent déjà (créées par
-- ipcCoursInteractifs.js lors du premier "Vérifier connexion" en mode personnel,
-- ou par ce script si vous partez d'un projet Supabase neuf — cf. bloc 0).
-- ============================================================================


-- ── 0. Tables de base (no-op si déjà créées par le mode personnel) ─────────

CREATE TABLE IF NOT EXISTS app_data (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parcours_data (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ── 1. Isolation par formateur (Phase 1 du plan) ───────────────────────────
-- owner_id identifie le formateur propriétaire de chaque ligne. La contrainte
-- unique globale sur `key` (héritée du mode personnel, un seul formateur) doit
-- céder la place à une contrainte composite (owner_id, key) : en mode Web,
-- deux formateurs peuvent légitimement choisir la même clé logique (ex. deux
-- parcours nommés "cours.json") — c'est la colonne qui les distingue, jamais
-- le contenu de la clé (cf. provider.supabase.js, `_ownerFilter()`).

ALTER TABLE app_data      ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id);
ALTER TABLE parcours_data ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id);

-- Supprime l'ancienne contrainte unique sur `key` seul si elle existe encore
-- (nom par défaut généré par Postgres pour une PRIMARY KEY(key) : à adapter si
-- le nom réel diffère sur votre projet — vérifiable via \d app_data).
ALTER TABLE app_data      DROP CONSTRAINT IF EXISTS app_data_pkey;
ALTER TABLE parcours_data DROP CONSTRAINT IF EXISTS parcours_data_pkey;

ALTER TABLE app_data      ADD CONSTRAINT app_data_owner_key_unique      UNIQUE (owner_id, key);
ALTER TABLE parcours_data ADD CONSTRAINT parcours_data_owner_key_unique UNIQUE (owner_id, key);

CREATE INDEX IF NOT EXISTS idx_app_data_owner      ON app_data(owner_id);
CREATE INDEX IF NOT EXISTS idx_parcours_data_owner ON parcours_data(owner_id);

-- Recherche cross-formateur par la fonction serveur (Phase 3) : retrouver
-- quel formateur possède un `cours.json` contenant tel slug se fait en
-- scannant les lignes de clé 'cours.json' — un index sur `key` seul suffit,
-- le nombre de lignes concerné est borné par le nombre de formateurs.
CREATE INDEX IF NOT EXISTS idx_parcours_data_key ON parcours_data(key);


-- ── 2. Fermeture de la RLS (Phase 3 du plan) ───────────────────────────────
-- Remplace toute policy ouverte existante (`USING (true)`, mode personnel
-- cloud non isolé) par une isolation stricte par formateur. Aucune exception
-- "lecture publique" : un élève anonyme ne peut de toute façon jamais
-- retrouver la bonne ligne par une simple policy (cours.json est un document
-- par formateur, le slug seul ne dit pas lequel) — il passe obligatoirement
-- par la fonction serveur student-progress (clé service_role, qui bypasse la
-- RLS), jamais par un accès table direct à la clé anonyme.

ALTER TABLE app_data      ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcours_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acces public app_data"      ON app_data;
DROP POLICY IF EXISTS "Acces public parcours_data" ON parcours_data;

CREATE POLICY owner_isolation_app_data ON app_data
    FOR ALL
    USING      (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY owner_isolation_parcours_data ON parcours_data
    FOR ALL
    USING      (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

-- TODO (Phase 4 du plan, pas encore implémentée) : une fois la table
-- `formateurs` créée, resserrer ces deux policies pour exiger en plus
-- `EXISTS (SELECT 1 FROM formateurs WHERE id = auth.uid() AND status = 'approved')`
-- — un formateur authentifié mais non encore approuvé par l'administrateur ne
-- doit accéder à aucune donnée, même la sienne.
