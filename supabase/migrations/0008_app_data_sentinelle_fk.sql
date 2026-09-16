-- ============================================================================
-- Migration multi-formateur — la sentinelle des réglages globaux existe enfin
-- ============================================================================
-- Dépend de 0001 à 0007. Ne concerne QUE le mode Web (base commune).
-- Fichier de référence, jamais exécuté automatiquement par ce dépôt : à copier
-- dans l'éditeur SQL du projet Supabase partagé, à la suite de 0007.
--
-- ── Le problème corrigé ────────────────────────────────────────────────────
-- La migration 0006 a remplacé owner_id NULL par une sentinelle fixe
-- ('00000000-0000-0000-0000-000000000000') pour les réglages globaux, sans
-- voir que app_data.owner_id porte une clé étrangère vers auth.users(id),
-- posée dès la migration 0001. Cette sentinelle ne correspond à aucun compte
-- réel : chaque écriture d'un réglage global (email de notification, adresse
-- de notification du trigger) était donc rejetée par cette contrainte —
-- silencieusement, car ni superadmin/index.ts ni cette migration ne
-- vérifiaient l'erreur renvoyée par l'upsert. Constaté en conditions réelles :
-- "✅ Adresse enregistrée." affiché côté client, ligne absente en base.
--
-- ── Le choix fait ici ──────────────────────────────────────────────────────
-- Retirer la clé étrangère sur app_data.owner_id. Elle ne protégeait qu'une
-- chose — un owner_id orphelin d'auth.users — et purge_formateur() (fonction
-- superadmin) supprime déjà explicitement les lignes d'un formateur retiré,
-- sans compter sur une suppression en cascade (il n'y en avait d'ailleurs pas :
-- ON DELETE NO ACTION par défaut, jamais CASCADE). Rien ne dépendait de cette
-- contrainte pour fonctionner ; sa seule conséquence concrète, aujourd'hui,
-- est d'empêcher la sentinelle d'exister.

ALTER TABLE app_data DROP CONSTRAINT IF EXISTS app_data_owner_id_fkey;

-- parcours_data n'a jamais eu de ligne "globale" (pas de sentinelle), mais
-- porte la même contrainte héritée de 0001 — retirée par cohérence, pour
-- qu'un futur réglage global sur cette table ne retombe pas dans le même
-- piège.
ALTER TABLE parcours_data DROP CONSTRAINT IF EXISTS parcours_data_owner_id_fkey;
