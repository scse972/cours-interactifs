// ============================================================================
// STORAGE.JS — Couche d'abstraction pour le stockage des données
// ============================================================================
// Chargé EN PREMIER avant tout autre script qui utilise le stockage.
//
// Responsabilités de CE fichier uniquement :
//   - Charger config.json et instancier le bon provider
//   - Maintenir le cache localStorage (lecture offline)
//   - Gérer la queue d'opérations hors-ligne et la resynchronisation
//   - Afficher la bannière de statut
//
// Les providers (provider.supabase.js, provider.sqlite.js) sont de simples
// clients HTTP sans logique de cache. Tout le cache est ici.
//
// API publique :
//   await storage.get(key)     → valeur ou null (cache si hors-ligne)
//   await storage.set(key, v)  → upsert (queue si hors-ligne)
//   await storage.remove(key)  → suppression (queue si hors-ligne)
//   await storage.keys()       → clés backend + clés en cache
// ============================================================================

// ============================================================================
// CONSTANTES
// ============================================================================

const STORAGE_KEYS = {
    COURSE_PROGRESS:      'course_progress',
    USER_PROGRESS:        'userProgress',
    USER_ANSWERS:         'userAnswers',
    QUESTION_ATTEMPTS:    'question_attempts',
    CHAPTER_CONFIG:       'chapter_config',
    COURSE_READ_PROGRESS: 'courseProgress'
};

const APP_CONFIG = {
    PASSING_SCORE:            80,
    SUCCESS_FEEDBACK_DURATION: 3000,
    ERROR_FEEDBACK_DURATION:   5000,
    MAX_NOTE:                 20
};

const SYNC_QUEUE_KEY  = '_sync_queue';
const CACHE_PREFIX    = '_cache_';
const ONLINE_BANNER_ID = 'storage-online-banner';

// ============================================================================
// CACHE LOCAL
// ============================================================================

const Cache = {
    get(key) {
        const raw = localStorage.getItem(CACHE_PREFIX + key);
        if (raw === null) return null;
        try { return JSON.parse(raw); } catch { return null; }
    },
    set(key, value) {
        localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
    },
    remove(key) {
        localStorage.removeItem(CACHE_PREFIX + key);
    },
    keys() {
        const result = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(CACHE_PREFIX)) {
                result.push(k.slice(CACHE_PREFIX.length));
            }
        }
        return result;
    }
};

// ============================================================================
// QUEUE DE SYNCHRONISATION HORS-LIGNE
// ============================================================================

const SyncManager = {
    _syncing: false,

    enqueue(operation) {
        const queue = this.getQueue();
        queue.push({ ...operation, timestamp: Date.now() });
        localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    },

    getQueue() {
        try { return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY)) || []; }
        catch { return []; }
    },

    clearQueue() {
        localStorage.removeItem(SYNC_QUEUE_KEY);
    },

    /**
     * Retire de la queue toutes les opérations dont la clé satisfait le prédicat.
     *
     * Nécessaire pour purger réellement des données : supprimer une clé ne suffit pas
     * si une écriture la concernant dort encore dans la queue — elle serait rejouée
     * au prochain chargement de page et recréerait la donnée effacée.
     *
     * @param {(cle: string) => boolean} predicat
     * @returns {number} nombre d'opérations retirées
     */
    dropQueued(predicat) {
        const queue = this.getQueue();
        if (queue.length === 0) return 0;

        const restantes = queue.filter(op => !predicat(op.key));
        const retirees  = queue.length - restantes.length;

        if (retirees > 0) {
            if (restantes.length > 0) localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(restantes));
            else this.clearQueue();
        }
        return retirees;
    },

    hasPending() {
        return this.getQueue().length > 0;
    },

    /**
     * Rejoue toutes les opérations en attente via le provider courant.
     * Les opérations qui échouent restent dans la queue.
     * @returns {Promise<{success: boolean, count: number, failed: number}>}
     */
    async sync() {
        if (this._syncing) return { success: false, count: 0, reason: 'already_syncing' };

        const queue = this.getQueue();
        if (queue.length === 0) return { success: true, count: 0, failed: 0 };

        this._syncing = true;
        let syncedCount = 0;
        const failed = [];
        const provider = window._storageProvider;

        for (const op of queue) {
            try {
                if (op.type === 'set') {
                    await provider.set(op.key, op.value);
                } else if (op.type === 'remove') {
                    await provider.remove(op.key);
                }
                syncedCount++;
            } catch (e) {
                console.warn('[Sync] Échec sync de "' + op.key + '":', e.message);
                failed.push(op);
            }
        }

        if (failed.length > 0) {
            localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(failed));
        } else {
            this.clearQueue();
        }

        this._syncing = false;
        return { success: failed.length === 0, count: syncedCount, failed: failed.length };
    }
};

// ============================================================================
// BANNIÈRE DE STATUT
// ============================================================================

const StatusBanner = {
    show(type, message) {
        let banner = document.getElementById(ONLINE_BANNER_ID);
        if (!banner) {
            banner = document.createElement('div');
            banner.id = ONLINE_BANNER_ID;
            banner.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0;
                z-index: 99999; padding: 8px 16px;
                text-align: center; font-size: 14px; font-weight: 600;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                transition: transform 0.3s ease, opacity 0.3s ease;
            `;
            document.body.insertBefore(banner, document.body.firstChild);
            const existingPad = parseInt(getComputedStyle(document.body).paddingTop) || 0;
            document.body.style.paddingTop = (existingPad + 36) + 'px';

            const closeBtn = document.createElement('span');
            closeBtn.textContent = '✕';
            closeBtn.style.cssText = `
                position: absolute; right: 12px; top: 50%;
                transform: translateY(-50%); cursor: pointer; font-size: 16px; opacity: 0.8;
            `;
            closeBtn.onclick = () => this.hide();
            banner.appendChild(closeBtn);
        }

        const colors = {
            offline: { bg: '#fff3cd', text: '#856404', border: '#ffc107' },
            syncing: { bg: '#cce5ff', text: '#004085', border: '#b8daff' },
            success: { bg: '#d4edda', text: '#155724', border: '#c3e6cb' },
            error:   { bg: '#f8d7da', text: '#721c24', border: '#f5c6cb' }
        };
        const c = colors[type] || colors.offline;

        let textSpan = banner.querySelector('.banner-text');
        if (!textSpan) {
            textSpan = document.createElement('span');
            textSpan.className = 'banner-text';
            textSpan.style.marginRight = '24px';
            banner.insertBefore(textSpan, banner.lastChild);
        }
        textSpan.textContent = message;

        banner.style.background = c.bg;
        banner.style.color = c.text;
        banner.style.borderBottom = '2px solid ' + c.border;
        banner.style.transform = 'translateY(0)';
        banner.style.opacity = '1';
    },

    hide() {
        const banner = document.getElementById(ONLINE_BANNER_ID);
        if (!banner) return;
        banner.style.transform = 'translateY(-100%)';
        banner.style.opacity = '0';
        setTimeout(() => {
            banner.remove();
            document.body.style.paddingTop = '';
        }, 300);
    },

    remove() {
        const banner = document.getElementById(ONLINE_BANNER_ID);
        if (banner) banner.remove();
        document.body.style.paddingTop = '';
    }
};

// ============================================================================
// CHARGEMENT DYNAMIQUE DU PROVIDER
// ============================================================================

function injectScript(src) {
    return new Promise(function (resolve, reject) {
        if (document.querySelector('script[src="' + src + '"]')) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Impossible de charger ' + src));
        document.head.appendChild(script);
    });
}

function storagePath(relativePath) {
    const base = (window.BASE || '').replace(/\/$/, '');
    return base + '/storage/' + relativePath;
}

let _loadedConfig = null;

async function loadConfig() {
    if (_loadedConfig) return _loadedConfig;

    var config = null;

    // ── Electron : priorité à parametresCoursServer.json (config Electron) ──
    if (window.IS_ELECTRON) {
        // On demande la config au process main par IPC plutôt que par fetch() :
        // en mode packagé, coursInteractifs/ vit À L'INTÉRIEUR de app.asar alors
        // que parametresCoursServer.json vit EN DEHORS — un fetch sur un chemin
        // file:// calculé depuis window.location (donc toujours relatif à
        // l'intérieur de l'archive) ne peut jamais atteindre le vrai fichier une
        // fois packagé, même si ça fonctionne par coïncidence en dev (les deux
        // chemins coïncident alors). L'IPC, lui, part du process main qui connaît
        // le vrai chemin (Globals.appliPath) dans les deux cas.
        //
        // window.top résout TOUJOURS la fenêtre de plus haut niveau, quelle que
        // soit la profondeur d'imbrication — contrairement à window.parent, qui
        // ne remonte que d'un cran. window.top === window quand la page n'est pas
        // dans une iframe (ex: popup de simulation ouvert par window.open(), cf.
        // simulation.js + setWindowOpenHandler côté XSpro), donc un seul test
        // couvre uniformément : cette fenêtre elle-même, une iframe simple (Suivi
        // des réponses), et une iframe imbriquée à deux niveaux (vue formateur
        // d'une soumission élève, cf. teacherSubmissions.js) — la fenêtre XSpro
        // tout en haut a toujours require, peu importe combien d'iframes séparent
        // cette page d'elle.
        var ipcConfig = null;
        if (window.top && typeof window.top.require === 'function') {
            try { ipcConfig = window.top.require('electron').ipcRenderer; }
            catch (e) { /* ignoré, fallback fetch ci-dessous */ }
        }
        if (ipcConfig) {
            try {
                config = await ipcConfig.invoke('serveur-local:getConfig');
                //console.log('[storage] Config chargée via IPC serveur-local:getConfig (Electron)');
            } catch (e) {
                console.info('[storage] IPC serveur-local:getConfig indisponible, fallback fetch:', e.message);
            }
        }

        // Fallback : page ouverte en file:// sans nodeIntegration accessible
        // (tests directs hors XSpro, sans le setWindowOpenHandler) — valable
        // seulement si window.BASE coïncide avec le dossier réel contenant
        // parametresCoursServer.json (dev).
        if (!config) {
            var base = (window.BASE || '').replace(/\/$/, '');
            var appRoot = base.substring(0, base.lastIndexOf('/'));
            var electronConfigUrl = appRoot + '/parametresCoursServer.json';
            // console.log('[storage] Tentative config Electron : ' + electronConfigUrl);
            try {
                var resp = await fetch(electronConfigUrl);
                if (resp.ok) {
                    config = await resp.json();
                    //console.log('[storage] Config chargée depuis parametresCoursServer.json (Electron)');
                }
            } catch (e) {
                console.info('[storage] parametresCoursServer.json indisponible, fallback config.json');
            }
        }
    }

    // ── Fallback config.json (standalone, ou si Electron sans parametresCoursServer.json) ──
    if (!config) {
        // config.json est la seule source de vérité, y compris sur GitHub Pages :
        // deploySite() (XSpro) le maintient à jour avec le mode réellement configuré
        // (supabase ou appwrite), et le workflow deploy.yml ne l'écrase plus.
        var configFile = 'config.json';
        //console.log('[storage] Chargement config: ' + configFile);
        var resp = await fetch(storagePath(configFile));
        if (!resp.ok) throw new Error(configFile + ': HTTP ' + resp.status);
        config = await resp.json();
    }

    _loadedConfig = config;
    return config;
}

async function loadProvider() {
    try {
        const config = await loadConfig();

        var providerName;
        if (window.IS_ELECTRON) {
            providerName = config.storage || 'electron';
            console.log('[storage] Environnement: Electron | config.storage:', config.storage || '(absent) → forcé "electron"');
        } else if (window.IS_GITHUB_PAGES) {
            providerName = config.storage || 'supabase';
            console.log('[storage] Environnement: GitHub Pages | config.storage:', config.storage || '(absent) → forcé "supabase"');
        } else {
            providerName = config.storage || window.STORAGE_PROVIDER || 'supabase';
            console.log('[storage] Environnement: Standalone | config.storage:', config.storage || '(absent)', '| window.STORAGE_PROVIDER:', window.STORAGE_PROVIDER || '(absent)', '→ provider retenu:', providerName);
        }

        console.log('[storage] ✅ Provider retenu:', providerName);
        console.log('[storage] Config complète:', config);

        let provider;

        if (providerName === 'supabase') {
            if (typeof SupabaseProvider === 'undefined') {
                console.log('[storage] Injection script: provider.supabase.js');
                await injectScript(storagePath('provider.supabase.js'));
            }
            provider = new SupabaseProvider(config.supabase || {});
            console.log('[storage] SupabaseProvider instancié → url:', (config.supabase || {}).url || '(manquante)');

            window._parcoursProvider = new SupabaseProvider(
                Object.assign({}, config.supabase || {}, { table: 'parcours_data' })
            );
            console.log('[storage] _parcoursProvider (Supabase) → table: parcours_data');

        } else if (providerName === 'appwrite') {
            if (typeof AppwriteProvider === 'undefined') {
                console.log('[storage] Injection script: provider.appwrite.js');
                await injectScript(storagePath('provider.appwrite.js'));
            }
            provider = new AppwriteProvider(
                Object.assign({}, config.appwrite || {}, { collectionId: 'app_data' })
            );
            console.log('[storage] AppwriteProvider instancié → endpoint:', (config.appwrite || {}).endpoint || '(manquant)');

            window._parcoursProvider = new AppwriteProvider(
                Object.assign({}, config.appwrite || {}, { collectionId: 'parcours_data' })
            );
            console.log('[storage] _parcoursProvider (Appwrite) → collectionId: parcours_data');

        } else if (providerName === 'sqlite') {
            if (typeof SQLiteProvider === 'undefined') {
                console.log('[storage] Injection script: provider.sqlite.js');
                await injectScript(storagePath('provider.sqlite.js'));
            }
            provider = new SQLiteProvider(config.sqlite || {});
            console.log('[storage] SQLiteProvider instancié → apiBaseUrl:', (config.sqlite || {}).apiBaseUrl || '(manquante)');

            window._parcoursProvider = new SQLiteProvider(
                Object.assign({}, config.sqlite || {}, { table: 'parcours_data' })
            );
            console.log('[storage] _parcoursProvider (SQLite) → table: parcours_data');

        } else if (providerName === 'electron') {
            // Toujours par IPC vers le main process, jamais de connexion SQLite native
            // ici. Le main process (ipcCoursInteractifs.js) possède déjà LA connexion
            // unique (_electronProvider / _parcoursElectronProvider) que publishParcours()
            // utilise pour écrire cours.json ; en ouvrir une seconde ici (ex: ElectronProvider
            // natif dans ce contexte) créerait une désynchronisation — sans compter que
            // ElectronProvider exige config.electron.userDataPath, jamais fourni ici.
            //
            // window.top résout TOUJOURS la fenêtre de plus haut niveau, quelle que soit
            // la profondeur d'imbrication (== window si pas d'iframe). Un seul test couvre
            // donc uniformément : cette fenêtre elle-même (popup de simulation ouvert par
            // window.open(), cf. simulation.js + setWindowOpenHandler côté XSpro), une iframe
            // simple (Suivi des réponses), et une iframe imbriquée à deux niveaux (vue
            // formateur d'une soumission élève, cf. teacherSubmissions.js) — la fenêtre XSpro
            // tout en haut a toujours require, peu importe combien d'iframes séparent cette
            // page d'elle. window.parent.require (un seul niveau) ne suffisait pas pour ce
            // dernier cas.
            var ipcNatif = null;
            if (window.top && typeof window.top.require === 'function') {
                try { ipcNatif = window.top.require('electron').ipcRenderer; }
                catch (e) { /* ignoré, délégation au parent ci-dessous */ }
            }
            if (ipcNatif) {
                console.log('[storage] Electron: IPC via window.top.require → main process');
                provider = {
                    get:    async function (key) { return ipcNatif.invoke('storage:get', key); },
                    set:    async function (key, value) { await ipcNatif.invoke('storage:set', key, value); },
                    remove: async function (key) { await ipcNatif.invoke('storage:remove', key); },
                    keys:   async function () { return ipcNatif.invoke('storage:keys'); },
                };
                window._parcoursProvider = {
                    get:    async function (key) { return ipcNatif.invoke('storage:parcoursGet', key); },
                    set:    async function (key, value) { await ipcNatif.invoke('storage:parcoursSet', key, value); },
                    remove: async function (key) { await ipcNatif.invoke('storage:parcoursRemove', key); },
                    keys:   async function () { return ipcNatif.invoke('storage:parcoursKeys'); },
                };
                console.log('[storage] _parcoursProvider (Electron IPC) → handlers parcoursGet/Set/Remove/Keys');
            } else if (window.parent && window.parent !== window && window.parent._storageProvider) {
                // Filet de secours si window.top.require était indisponible pour une raison
                // quelconque : le parent immédiat est lui-même une page coursInteractifs déjà
                // initialisée (son propre provider a été résolu la même façon) — on le réutilise
                // directement plutôt que de repartir de zéro.
                console.log('[storage] Electron: iframe détectée → délégation au provider du parent');
                provider = window.parent._storageProvider;
                window._parcoursProvider = window.parent._parcoursProvider || null;
                window._storageBackend = window.parent._storageBackend || providerName;
                console.log('[storage] _parcoursProvider délégué au parent:', window._parcoursProvider ? '✅' : '⚠️ absent');
            } else {
                throw new Error('[storage] Electron: aucun accès IPC disponible (ni window.top.require, ni provider du parent)');
            }

        } else {
            throw new Error('Provider inconnu: "' + providerName + '". Valeurs supportées: supabase, appwrite, sqlite, electron.');
        }

        window._storageProvider = provider;
        if (!window._storageBackend) window._storageBackend = providerName;
        console.log('[storage] window._storageProvider prêt:', providerName);
        return provider;

    } catch (e) {
        console.error('[storage] ❌ Erreur chargement provider:', e.message);
        console.warn('[storage] Fallback localStorage uniquement.');

        const fallback = {
            get:    async (key) => { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; },
            set:    async (key, value) => { localStorage.setItem(key, JSON.stringify(value)); },
            remove: async (key) => { localStorage.removeItem(key); },
            keys:   async () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(Boolean)
        };
        window._storageProvider = fallback;
        console.warn('[storage] window._storageProvider → fallback localStorage');
        return fallback;
    }
}
// ============================================================================
// COUCHE D'ABSTRACTION — API PUBLIQUE
// ============================================================================

const storage = {
    _provider:    null,
    _initPromise: null,

    async init() {
        if (this._provider) return;
        if (this._initPromise) return this._initPromise;
        this._initPromise = loadProvider()
            .then(p => {
                this._provider = p;
                this._initPromise = null;
                // ── Désactiver le cache localStorage pour les providers locaux ──
                // En mode Electron ou SQLite, le provider est toujours disponible
                // et fiable — le cache localStorage ne fait que créer des données
                // fantômes qui survivent aux reinit.
                const providerName = (p && p.constructor && p.constructor.name) || '';
                this._noCache = (
                    window.IS_ELECTRON === true        ||  // flag global posé par le shell Electron
                    typeof require !== 'undefined'     ||  // nodeIntegration active
                    providerName === 'ElectronProvider'||
                    providerName === 'SQLiteProvider'
                );
                if (this._noCache) {
                    Cache.keys().forEach(k => Cache.remove(k));
                    console.log('[storage] Mode local détecté (' + (providerName || 'inconnu') + ') — cache localStorage désactivé et vidé.');
                }
            })
            .catch(e => { this._initPromise = null; throw e; });
        return this._initPromise;
    },

    /**
     * Attache une session formateur (posée après connexion GitHub, Phase 2 du
     * plan multi-formateur) aux providers Supabase/Appwrite déjà instanciés —
     * `window._storageProvider` et `window._parcoursProvider`. Sans appel à
     * cette méthode, les providers restent en mode personnel (comportement
     * inchangé) : c'est `teacher-login.html` qui l'appelle juste après une
     * connexion GitHub réussie, jamais le mode personnel.
     * @param {string|null} accessToken — JWT Supabase, ou JWT Appwrite (`account.createJWT()`)
     * @param {string|null} ownerId     — auth.users.id (Supabase) ou user.$id (Appwrite)
     */
    async setOwnerSession(accessToken, ownerId) {
        if (!this._provider) await this.init();
        if (this._provider && typeof this._provider.setSession === 'function') {
            this._provider.setSession(accessToken, ownerId);
        }
        if (window._parcoursProvider && typeof window._parcoursProvider.setSession === 'function') {
            window._parcoursProvider.setSession(accessToken, ownerId);
        }
        // Le cache local mélangerait les données du formateur précédent (mode
        // personnel) avec celles, isolées par owner_id, du formateur qui vient de
        // se connecter — on le vide pour repartir propre.
        Cache.keys().forEach(k => Cache.remove(k));
    },

    /**
     * Récupère une valeur.
     * Si le backend est injoignable, retourne la valeur en cache.
     */
    async get(key) {
        if (!this._provider) await this.init();

        // 1. Retourner le cache local IMMÉDIATEMENT s'il existe (optimistic read)
        //    Cela évite qu'une lecture trop rapide après un set() ne récupère
        //    une donnée périmée du provider (bug "mode examen qui se décoche").
        //    Le cache est considéré comme source de vérité immédiate : il a été
        //    mis à jour par storage.set() juste avant.
        //    ⚠️ Désactivé en mode local (Electron/SQLite) : le provider est la
        //    source de vérité unique — le cache crée des données fantômes.
        if (!this._noCache) {
            const localCached = Cache.get(key);
            if (localCached !== null) {
                return localCached;
            }
        }

        // 2. Pas de cache : interroger le provider
        try {
            const value = await this._provider.get(key);
            if (value !== null) {
                Cache.set(key, value);
            }
            return value;
        } catch (e) {
            console.warn('[storage] get("' + key + '") → null (hors-ligne, pas de cache)');
            return null;
        }
    },

    /**
     * Enregistre une valeur.
     * En cas d'échec : mise en cache local + enqueue pour sync ultérieure.
     */
    async set(key, value) {
        if (!this._provider) await this.init();

        // Écriture cache immédiate dans tous les cas (optimistic update)
        // Sauf en mode local (Electron/SQLite) où le cache est désactivé.
        if (!this._noCache) Cache.set(key, value);

        try {
            await this._provider.set(key, value);

            // Succès → profiter pour vider la queue si besoin
            if (SyncManager.hasPending()) {
                StatusBanner.show('syncing', '🔄 Synchronisation des données en attente…');
                const result = await SyncManager.sync();
                if (result.success) {
                    StatusBanner.hide();
                } else {
                    StatusBanner.show('offline', '⚠️ Mode hors-ligne — ' + result.failed + ' opération(s) en attente');
                }
            }

        } catch (e) {
            console.warn('[storage] set("' + key + '") → hors-ligne, mis en queue:', e.message);
            SyncManager.enqueue({ type: 'set', key, value });
            StatusBanner.show('offline', '⚠️ Mode hors-ligne — ' + SyncManager.getQueue().length + ' opération(s) en attente');
        }
    },

    /**
     * Supprime une entrée.
     * En cas d'échec : suppression locale + enqueue.
     */
    async remove(key) {
        if (!this._provider) await this.init();

        // Suppression cache immédiate (désactivée en mode local)
        if (!this._noCache) Cache.remove(key);

        try {
            await this._provider.remove(key);
        } catch (e) {
            console.warn('[storage] remove("' + key + '") → hors-ligne, mis en queue:', e.message);
            SyncManager.enqueue({ type: 'remove', key });
            StatusBanner.show('offline', '⚠️ Mode hors-ligne — ' + SyncManager.getQueue().length + ' opération(s) en attente');
        }
    },

    /**
     * Retourne toutes les clés (backend + cache local fusionnés).
     */
    async keys() {
        if (!this._provider) await this.init();
        const keysSet = new Set();

        try {
            const backendKeys = await this._provider.keys();
            if (Array.isArray(backendKeys)) backendKeys.forEach(k => keysSet.add(k));
        } catch (e) {
            // Hors-ligne : on continue avec le cache seul
        }

        Cache.keys().forEach(k => keysSet.add(k));
        return Array.from(keysSet);
    }
};

// ============================================================================
// SERVICE SYNCHRONE (compatibilité avec l'existant)
// ============================================================================

class StorageService {
    static get(key, defaultValue = null) {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : defaultValue;
    }
    static set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }
    static remove(key) {
        localStorage.removeItem(key);
    }
}

// ============================================================================
// INITIALISATION AU CHARGEMENT
// ============================================================================

(function initStorage() {
    const run = () => {
        StatusBanner.remove();

        storage.init().then(async () => {
            //console.log('[storage] Provider initialisé');

            // ── Test de connectivité au démarrage ──────────────────────────
            // On tente un get() sur une clé fictive légère pour savoir si le
            // backend est joignable, et on affiche la bannière immédiatement
            // si ce n'est pas le cas — sans attendre une action utilisateur.
            const provider = window._storageProvider;
            if (provider) {
                try {
                    await provider.get('__ping__');
                    // Succès → backend joignable, pas de bannière
                    window._storageOnline = true;
                } catch (e) {
                    window._storageOnline = false;
                    const pending = SyncManager.getQueue().length;
                    StatusBanner.show('offline', pending > 0
                        ? '⚠️ Serveur inaccessible — ' + pending + ' opération(s) en attente'
                        : '⚠️ Serveur de données inaccessible — connexion impossible'
                    );
                }
            }

            // Sync au démarrage si queue en attente et réseau disponible
            if (SyncManager.hasPending() && window._storageOnline !== false) {
                const count = SyncManager.getQueue().length;
                if (navigator.onLine) {
                    StatusBanner.show('syncing', '🔄 Synchronisation de ' + count + ' opération(s) en attente…');
                    SyncManager.sync().then(result => {
                        if (result.success) {
                            StatusBanner.hide();
                        } else {
                            StatusBanner.show('offline', '⚠️ Mode hors-ligne — ' + result.failed + ' opération(s) en attente');
                        }
                    });
                } else {
                    StatusBanner.show('offline', '⚠️ Mode hors-ligne — ' + count + ' opération(s) en attente');
                }
            }
        }).catch(e => {
            console.warn('[storage] Échec init:', e.message);
        });

        window.addEventListener('online', async () => {
            if (!SyncManager.hasPending()) return;
            StatusBanner.show('syncing', '🔄 Connexion rétablie — synchronisation en cours…');
            const result = await SyncManager.sync();
            if (result.success) {
                StatusBanner.show('success', '✅ ' + result.count + ' opération(s) synchronisée(s)');
                setTimeout(() => StatusBanner.hide(), 3000);
            } else {
                StatusBanner.show('error', '❌ Erreur sync — ' + result.failed + ' opération(s) en échec');
            }
        });

        window.addEventListener('offline', () => {
            const pending = SyncManager.getQueue().length;
            StatusBanner.show('offline', pending > 0
                ? '⚠️ Connexion perdue — ' + pending + ' opération(s) en attente'
                : '⚠️ Connexion perdue — les modifications seront synchronisées automatiquement'
            );
        });

        console.log('✅ storage.js chargé (multi-backend + cache + queue offline)');
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();

// ============================================================================
// STATIC JSON — Ressources JSON en lecture seule (cours.json, etc.)
// ============================================================================
// Stratégie de résolution pour un chemin donné (ex: '/parcours/cours.json') :
//
//   1. Cache mémoire session       → retour immédiat, aucun I/O
//   2. Fetch statique              → GET (window.BASE || '') + chemin
//   3. Fallback provider actif     → storage.get('_static:<chemin>')
//      (utile si le fichier statique est absent en mode SQLite local
//       ou si Supabase est le seul backend disponible)
//
// La valeur est mise en cache mémoire dès le premier succès.
// Aucune écriture dans localStorage : ces données ne changent pas.
//
// API publique :
//   await staticJson.get('/parcours/cours.json')  → objet JS ou null
//   staticJson.prefetch('/parcours/cours.json')   → déclenche en arrière-plan
//   staticJson.invalidate('/parcours/cours.json') → vide le cache mémoire
// ============================================================================

const staticJson = (function () {

    // Cache mémoire : chemin → valeur parsée (ou null si introuvable)
    const _cache = new Map();

    // Promesses en cours : évite les doubles fetch simultanés pour le même chemin
    const _pending = new Map();

    // Source d'origine de chaque chemin (provider | static | null)
    const _source = new Map();

    // Préférence de source par chemin : 'auto' (défaut), 'provider', 'static'
    const _sourcePreference = new Map();

    /**
     * Construit l'URL statique complète pour un chemin relatif.
     */
    function _staticUrl(path) {
        const base = (window.BASE || '').replace(/\/$/, '');
        const p    = path.startsWith('/') ? path : '/' + path;
        return base + p;
    }

    /**
     * Tente de charger le fichier statique via HTTP.
     * Retourne l'objet parsé ou null (sans lever d'exception).
     */
    async function _fetchStatic(path) {
        try {
            const url  = _staticUrl(path);
            const resp = await fetch(url);
            if (!resp.ok) return null;
            return await resp.json();
        } catch (e) {
            console.info('[staticJson] Fichier statique indisponible pour "' + path + '":', e.message);
            return null;
        }
    }

    /**
     * Derive la cle de lookup dans parcours_data a partir du chemin.
     * Ex: '/parcours/cours.json' -> 'cours.json'
     */
    function _parcoursKey(filePath) {
        return filePath.split('/').pop();
    }

    /**
     * Tente de charger le JSON depuis parcours_data via _parcoursProvider.
     * Retourne l'objet parse ou null (sans lever d'exception).
     */
    async function _fetchFromProvider(filePath) {
        let provider = window._parcoursProvider;
        if (!provider) {
            // Attendre que storage.init() soit terminé (loadProvider() a créé _parcoursProvider)
            try {
                await storage.init();
            } catch (_) {
                console.warn('[staticJson] storage.init() a echoue.');
                return null;
            }
            provider = window._parcoursProvider;
            if (!provider) {
                console.warn('[staticJson] _parcoursProvider toujours indisponible apres init.');
                return null;
            }
        }
        try {
            const value = await provider.get(_parcoursKey(filePath));
            if (value !== null) {
                console.info('[staticJson] "' + filePath + '" charge depuis parcours_data.');
            }
            return value;
        } catch (e) {
            console.warn('[staticJson] Echec parcours_data pour "' + filePath + '":', e.message);
            return null;
        }
    }

    /**
     * Résolution complète avec mise en cache et suivi de la source.
     * Respecte la préférence de source si définie.
     */
    async function _resolve(path) {
        // 1. Cache mémoire
        if (_cache.has(path)) return _cache.get(path);

        // 2. Si un fetch est déjà en cours pour ce chemin, on attend le même
        if (_pending.has(path)) return _pending.get(path);

        const promise = (async () => {
            const pref = _sourcePreference.get(path) || 'auto';
            let value = null;
            let source = null;

            if (pref === 'static') {
                // Forcer le fichier statique d'abord
                value = await _fetchStatic(path);
                if (value !== null) {
                    source = 'static';
                } else {
                    // Fallback provider
                    value = await _fetchFromProvider(path);
                    if (value !== null) source = 'provider';
                }
            } else if (pref === 'provider') {
                // Forcer le provider d'abord
                value = await _fetchFromProvider(path);
                if (value !== null) {
                    source = 'provider';
                } else {
                    // Fallback fichier statique
                    value = await _fetchStatic(path);
                    if (value !== null) source = 'static';
                }
            } else {
                // Mode 'auto' : comportement d'origine (provider puis statique)
                value = await _fetchFromProvider(path);
                if (value !== null) {
                    source = 'provider';
                } else {
                    value = await _fetchStatic(path);
                    if (value !== null) source = 'static';
                }
            }

            if (value === null) {
                console.warn('[staticJson] "' + path + '" introuvable (provider + statique).');
            } else {
                _source.set(path, source);
            }

            _cache.set(path, value);
            _pending.delete(path);
            return value;
        })();

        _pending.set(path, promise);
        return promise;
    }

    return {
        /**
         * Charge et retourne le JSON pour le chemin donné.
         * Résultat mis en cache mémoire pour toute la session.
         *
         * @param   {string} path  Chemin absolu, ex: '/parcours/cours.json'
         * @returns {Promise<any|null>}
         */
        get(path) {
            return _resolve(path);
        },

        /**
         * Charge le JSON et retourne des métadonnées sur la provenance.
         *
         * @param   {string} path Chemin absolu
         * @returns {Promise<{data: any|null, source: string|null, cached: boolean}>}
         */
        async getWithInfo(path) {
            const inCache = _cache.has(path);
            const data = await _resolve(path);
            const source = _source.get(path) || null;
            return { data, source, cached: inCache };
        },

        /**
         * Définit la préférence de source pour un chemin.
         * Invalide le cache pour forcer un rechargement avec la nouvelle préférence.
         *
         * @param {string} path       Chemin absolu
         * @param {string} preference 'auto' | 'provider' | 'static'
         */
        setSourcePreference(path, preference) {
            const valid = ['auto', 'provider', 'static'];
            if (!valid.includes(preference)) {
                console.warn('[staticJson] Preference invalide:', preference, '→ utilise auto');
                preference = 'auto';
            }
            _sourcePreference.set(path, preference);
            // Invalider le cache pour que le prochain get() applique la nouvelle préférence
            _cache.delete(path);
            _source.delete(path);
        },

        /**
         * Déclenche la résolution en arrière-plan sans attendre.
         * Appeler en début de page pour préchauffer le cache.
         *
         * @param {string|string[]} paths
         */
        prefetch(paths) {
            const list = Array.isArray(paths) ? paths : [paths];
            list.forEach(p => _resolve(p).catch(() => {}));
        },

        /**
         * Vide le cache mémoire pour un chemin (ou tout si omis).
         * Utile en développement ou tests.
         *
         * @param {string} [path]
         */
        invalidate(path) {
            if (path) {
                _cache.delete(path);
                _source.delete(path);
            } else {
                _cache.clear();
                _source.clear();
            }
        },

        /**
         * Retourne la source connue pour un chemin (sans recharger).
         * Utile pour l'affichage après un get() / getWithInfo().
         *
         * @param {string} path
         * @returns {string|null} 'provider' | 'static' | null
         */
        getKnownSource(path) {
            return _source.get(path) || null;
        }
    };

})();

// ============================================================================
// EXPORTS GLOBAUX
// ============================================================================
window.storage        = storage;
window.STORAGE_KEYS   = STORAGE_KEYS;
window.APP_CONFIG     = APP_CONFIG;
window.StorageService = StorageService;
window.SyncManager    = SyncManager; // exposé pour debug console
window.staticJson     = staticJson;