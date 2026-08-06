// ============================================================================
// provider.appwrite.js — Client HTTP Appwrite (sans logique de cache)
// ============================================================================
// Ce fichier est un client HTTP pur vers l'API REST Appwrite (Databases).
// Il ne touche PAS à localStorage. Tout le cache est géré par storage.js.
//
// Interface attendue par storage.js :
//   async get(key)         → valeur parsée ou null
//   async set(key, value)  → upsert (lève une exception si indisponible)
//   async remove(key)      → suppression (lève une exception si indisponible)
//   async keys()           → tableau de strings (lève une exception si indisponible)
//
// Configuration :
//   config.endpoint    — ex: 'https://fra.cloud.appwrite.io/v1' (copié depuis
//                         Appwrite Console → Project Settings, région EU)
//   config.projectId   — ID du projet Appwrite
//   config.databaseId  — ID de la base Appwrite
//   config.collectionId — ID de la collection (défaut 'app_data')
//
// Modèle de données attendu dans la collection :
//   attribut "key"        (string, obligatoire)  — clé logique (ex: 'nsi-term:STU001:progress')
//   attribut "value"      (string, obligatoire)  — JSON.stringify(valeur)
//   attribut "updated_at" (string, optionnel)
// Permissions collection : read/create/update/delete pour le rôle "any",
// avec "Document Security" désactivé (les permissions de la collection
// s'appliquent à tous les documents — équivalent des policies RLS "USING (true)").
//
// L'ID de document Appwrite ne peut pas contenir ':' et doit rester court
// (36 caractères max, ne peut pas commencer par un caractère spécial). On
// dérive donc un ID déterministe à partir de la clé logique via un hash,
// et on conserve la clé d'origine dans l'attribut "key" pour keys().
// ============================================================================

function AppwriteProvider(config) {
    this._endpoint     = (config.endpoint || '').replace(/\/$/, '');
    this._project      = config.projectId;
    this._databaseId   = config.databaseId;
    this._collectionId = config.collectionId || 'app_data';
    this._timeout       = config.timeout || 10000; // 10s par défaut
}

/**
 * Hash déterministe (FNV-1a, 32 bits) → ID de document valide pour Appwrite.
 * Toujours préfixé par une lettre pour respecter la contrainte "ne peut pas
 * commencer par un caractère spécial".
 */
AppwriteProvider.prototype._docId = function (key) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
        hash ^= key.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return 'k' + (hash >>> 0).toString(16);
};

/**
 * Requête à l'API REST Appwrite.
 * Lève une Error en cas d'échec HTTP (hors 404) ou réseau.
 * Protégée contre les erreurs DNS, timeout et refus de connexion.
 */
AppwriteProvider.prototype._fetch = async function (method, path, body) {
    const url = this._endpoint + path;
    const headers = {
        'X-Appwrite-Project': this._project,
        'Content-Type':       'application/json',
        'Accept':             'application/json'
    };

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), this._timeout);

    const options = { method, headers, signal: controller.signal };
    if (body !== undefined && body !== null) options.body = JSON.stringify(body);

    let response;
    try {
        response = await fetch(url, options);
    } catch (e) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') {
            throw new Error('Appwrite ne répond pas (délai dépassé)');
        }
        if (e.message && e.message.includes('Failed to fetch')) {
            throw new Error('Appwrite injoignable');
        }
        throw new Error('Appwrite injoignable (' + e.message + ')');
    }
    clearTimeout(timeoutId);

    if (response.status === 404) {
        const err = new Error('Appwrite HTTP 404');
        err.status = 404;
        throw err;
    }

    if (!response.ok) {
        let msg = 'Appwrite HTTP ' + response.status;
        try { msg += ': ' + JSON.stringify(await response.json()); } catch { msg += ' (' + response.statusText + ')'; }
        const err = new Error(msg);
        err.status = response.status;
        throw err;
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
};

AppwriteProvider.prototype._documentsPath = function (suffix) {
    return '/databases/' + this._databaseId + '/collections/' + this._collectionId + '/documents' + (suffix || '');
};

/**
 * Récupère une valeur par sa clé.
 * Retourne null si la clé n'existe pas.
 * Lève une exception si le réseau est indisponible.
 */
AppwriteProvider.prototype.get = async function (key) {
    try {
        const doc = await this._fetch('GET', this._documentsPath('/' + this._docId(key)));
        return (doc && doc.value !== undefined) ? JSON.parse(doc.value) : null;
    } catch (e) {
        if (e.status === 404) return null;
        throw e;
    }
};

/**
 * Crée ou met à jour une entrée (upsert).
 * Stratégie : PATCH sur l'ID déterministe ; si absent (404), POST en création.
 * Lève une exception si le réseau est indisponible.
 */
AppwriteProvider.prototype.set = async function (key, value) {
    const docId = this._docId(key);
    const data = { key, value: JSON.stringify(value), updated_at: new Date().toISOString() };

    try {
        await this._fetch('PATCH', this._documentsPath('/' + docId), { data });
    } catch (e) {
        if (e.status !== 404) throw e;
        await this._fetch('POST', this._documentsPath(), { documentId: docId, data });
    }
};

/**
 * Supprime une entrée par sa clé.
 * Lève une exception si le réseau est indisponible (une clé déjà absente
 * n'est pas considérée comme une erreur).
 */
AppwriteProvider.prototype.remove = async function (key) {
    try {
        await this._fetch('DELETE', this._documentsPath('/' + this._docId(key)));
    } catch (e) {
        if (e.status !== 404) throw e;
    }
};

/**
 * Retourne toutes les clés présentes dans la collection.
 * Pagine automatiquement au-delà de la limite de page Appwrite (100).
 * Lève une exception si le réseau est indisponible.
 */
AppwriteProvider.prototype.keys = async function () {
    const pageSize = 100;
    const result = [];
    let cursor = null;

    while (true) {
        const queries = [
            JSON.stringify({ method: 'limit', values: [pageSize] }),
            JSON.stringify({ method: 'select', values: ['key'] })
        ];
        if (cursor) queries.push(JSON.stringify({ method: 'cursorAfter', values: [cursor] }));

        const qs = queries.map(q => 'queries[]=' + encodeURIComponent(q)).join('&');
        const data = await this._fetch('GET', this._documentsPath('?' + qs));
        const docs = (data && Array.isArray(data.documents)) ? data.documents : [];

        for (const doc of docs) result.push(doc.key);

        if (docs.length < pageSize) break;
        cursor = docs[docs.length - 1].$id;
    }

    return result;
};

// Export global
window.AppwriteProvider = AppwriteProvider;
