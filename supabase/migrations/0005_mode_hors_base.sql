-- ============================================================================
-- Le mode de la plateforme sort de la base
-- ============================================================================
-- Dépend de 0001 à 0004.
--
-- ── Ce qui change et pourquoi ──────────────────────────────────────────────
-- `platform_mode` vivait dans app_data, et le tableau de bord offrait un bouton
-- « Passer ce site en mode Web ». Un déploiement personnel pouvait donc se
-- convertir en place, ou être converti par accident — et les deux modes, dont
-- les sécurités sont opposées, se mélangeaient dans une même installation.
--
-- Le mode est désormais une propriété du DÉPLOIEMENT : le fichier
-- storage/mode.json, absent par défaut, présent seulement dans le dépôt du site
-- partagé. Un fork de formateur est personnel sans que personne n'ait rien à
-- faire, et rien ne peut le convertir — XSpro lui-même n'écrit jamais ce
-- fichier, contrairement à config.json.
--
-- Conséquence pour la base : la policy taillée en 0002 pour rendre cette seule
-- clé lisible à un visiteur non connecté n'a plus d'objet. Elle était le seul
-- accès anonyme survivant à la fermeture de la RLS ; la retirer referme
-- complètement app_data.


-- ── 1. Retirer l'accès anonyme à platform_mode ─────────────────────────────

DROP POLICY IF EXISTS read_platform_mode_app_data ON app_data;


-- ── 2. Retirer le réglage lui-même ─────────────────────────────────────────
-- Laissé en place, il ne serait plus lu par personne mais laisserait croire,
-- à qui inspecte la base, que le mode s'y règle encore.

DELETE FROM app_data WHERE owner_id IS NULL AND key = 'platform_mode';


-- ── 3. Ce qui subsiste ─────────────────────────────────────────────────────
-- admin_notification_email reste un réglage global légitime (owner_id NULL),
-- écrit et lu par la seule fonction serveur `superadmin`, jamais exposé à
-- l'anonyme. Les opérations set_platform_mode et count_active_formateurs ont
-- été retirées de cette fonction : la première n'a plus d'objet, la seconde ne
-- servait qu'à garder le retour en mode Personnel, qui n'existe plus.
