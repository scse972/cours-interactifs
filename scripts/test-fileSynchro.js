// test-fileSynchro.js — Banc de la file de synchronisation hors ligne (src/js/storage.js) et de la
// garde de rejeu (src/js/progressManager.js), fiabilisées le 19/11/2026 : sans navigateur, un
// localStorage en mémoire, un provider réglable et des minuteurs à la main.
//
//   node scripts/test-fileSynchro.js
//
// Ce qui est vérifié : une copie par clé (et la file d'avant compactée) ; la relance automatique
// et son calendrier ; deux synchronisations simultanées (jamais « undefined ») ; ce qui arrive en
// file PENDANT un rejeu ; la garde avant rejeu ; une seule écriture en cours par clé.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let echecs = 0;
const ok = (c, m) => { if (!c) echecs++; console.log(c ? 'PASS' : 'FAIL', m); };
const attendre = () => new Promise(r => setImmediate(r));
async function vider(n = 20) { for (let i = 0; i < n; i++) await attendre(); }

function creerMonde() {
    const donnees = new Map();
    const localStorage = {
        getItem: k => (donnees.has(k) ? donnees.get(k) : null),
        setItem: (k, v) => donnees.set(k, String(v)),
        removeItem: k => donnees.delete(k),
        key: i => [...donnees.keys()][i] ?? null,
        get length() { return donnees.size; },
    };
    // Minuteurs à la main : on ne les déclenche que sur demande.
    const minuteurs = new Map();
    let prochainId = 1;
    const setTimeout_ = (f, d) => { const id = prochainId++; minuteurs.set(id, { f, d, intervalle: false }); return id; };
    const setInterval_ = (f, d) => { const id = prochainId++; minuteurs.set(id, { f, d, intervalle: true }); return id; };
    const clear = id => minuteurs.delete(id);

    const banniere = [];
    const document = {
        readyState: 'loading',            // initStorage attend DOMContentLoaded : jamais émis ici
        addEventListener() {},
        createElement: () => ({ style: {}, appendChild() {}, querySelector: () => null }),
        getElementById: () => null,
        body: { insertBefore() {}, style: {} },
        visibilityState: 'visible',
    };
    const window = { addEventListener() {}, location: { search: '', pathname: '/', hostname: 'localhost', port: '8010', protocol: 'http:' } };
    const bac = {
        window, document, localStorage, console: { ...console, log() {}, warn() {}, info() {} },
        navigator: { onLine: true }, setTimeout: setTimeout_, clearTimeout: clear,
        setInterval: setInterval_, clearInterval: clear, setImmediate, URLSearchParams, Promise, Map, Set, JSON, Date,
        getComputedStyle: () => ({ paddingTop: '0' }), fetch: async () => { throw new Error('pas de réseau'); },
    };
    window.window = window;
    vm.createContext(bac);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/storage.js'), 'utf8'), bac, { filename: 'storage.js' });
    // La bannière : on ne garde que les textes affichés.
    vm.runInContext('StatusBanner.show = (t, m) => __banniere.push(m); StatusBanner.hide = () => {}; StatusBanner.remove = () => {};',
        Object.assign(bac, { __banniere: banniere }));

    // Provider réglable : `panne` vraie → set lève ; `lent` vrai → set attend `liberer()`.
    const provider = {
        panne: false, lent: false, ecrits: [], enVol: 0, maxEnVol: 0, enAttente: [],
        async set(k, v) {
            this.enVol++; this.maxEnVol = Math.max(this.maxEnVol, this.enVol);
            try {
                if (this.lent) await new Promise(r => this.enAttente.push(r));
                if (this.panne) throw new Error('Appwrite ne répond pas (délai dépassé)');
                this.ecrits.push([k, JSON.parse(JSON.stringify(v))]);
            } finally { this.enVol--; }
        },
        async remove(k) { if (this.panne) throw new Error('panne'); this.ecrits.push([k, null]); },
        async get() { return null; },
        liberer() { const r = this.enAttente.splice(0); r.forEach(f => f()); },
    };
    window._storageProvider = provider;
    window.storage._provider = provider;
    window.storage._noCache = false;

    return {
        bac, window, provider, banniere, minuteurs, donnees,
        S: window.SyncManager,
        file: () => window.SyncManager.getQueue(),
        // Déclenche le minuteur de relance (le seul setTimeout programmé par la file).
        async relancer() {
            const relance = [...minuteurs.entries()].find(([, m]) => !m.intervalle);
            if (!relance) return false;
            minuteurs.delete(relance[0]);
            relance[1].f();
            await vider();
            return true;
        },
        delaiRelance() { const m = [...minuteurs.values()].find(x => !x.intervalle); return m ? m.d : null; },
    };
}

(async () => {
    // ── Une copie par clé ──────────────────────────────────────────────────────
    {
        const m = creerMonde();
        m.donnees.set('_sync_queue', JSON.stringify([
            { type: 'set', key: 'A', value: 1, timestamp: 1 },
            { type: 'set', key: 'B', value: 1, timestamp: 2 },
            { type: 'set', key: 'A', value: 2, timestamp: 3 },
            { type: 'set', key: 'A', value: 3, timestamp: 4 },
        ]));
        const f = m.file();
        ok(f.length === 2 && f[0].key === 'B' && f[1].key === 'A' && f[1].value === 3,
            "file d'avant : une copie par clé, la dernière, dans l'ordre de la dernière écriture");
        ok(JSON.parse(m.donnees.get('_sync_queue')).length === 2, 'la file compactée est réécrite');
        m.S.enqueue({ type: 'set', key: 'B', value: 9 });
        ok(m.file().length === 2 && m.file()[1].key === 'B' && m.file()[1].value === 9, 'enqueue remplace la copie de la même clé');
    }

    // ── Échec, relance automatique, file vide sans changer de page ────────────
    {
        const m = creerMonde();
        m.provider.panne = true;
        await m.window.storage.set('p', { n: 1 });
        await vider();
        ok(m.file().length === 1, "écriture en échec : une opération en file");
        ok(m.delaiRelance() === 15000, 'relance programmée à 15 s');
        ok(m.banniere.some(t => /en attente/.test(t)) && !m.banniere.some(t => /undefined/.test(t)), 'bannière « en attente », jamais « undefined »');

        await m.relancer();                       // toujours en panne
        ok(m.file().length === 1 && m.delaiRelance() === 30000, 'deuxième échec : relance à 30 s');
        await m.relancer();
        ok(m.delaiRelance() === 60000, 'puis 1 min');

        m.provider.panne = false;
        await m.relancer();
        ok(m.file().length === 0, 'le serveur répond : la file se vide toute seule');
        ok(m.provider.ecrits.some(([k, v]) => k === 'p' && v.n === 1), 'la valeur en attente est écrite');
        ok(m.S._minuterie === null && m.S._essai === 0, 'plus de relance, rang remis à zéro');
        ok(m.banniere.some(t => /enregistrées/.test(t)), 'la bannière dit que les réponses sont enregistrées');
    }

    // ── Calendrier : plafond à 5 min ──────────────────────────────────────────
    {
        const m = creerMonde();
        m.provider.panne = true;
        await m.window.storage.set('p', 1);
        await vider();
        const delais = [m.delaiRelance()];
        for (let i = 0; i < 6; i++) { await m.relancer(); delais.push(m.delaiRelance()); }
        ok(JSON.stringify(delais) === JSON.stringify([15000, 30000, 60000, 120000, 300000, 300000, 300000]),
            'relances : 15 s, 30 s, 1 min, 2 min, puis 5 min (' + delais.join(', ') + ')');
    }

    // ── Deux synchronisations simultanées ─────────────────────────────────────
    {
        const m = creerMonde();
        m.S.enqueue({ type: 'set', key: 'A', value: 1 });
        m.provider.lent = true;
        const p1 = m.S.sync();
        const p2 = m.S.sync();
        await vider();
        ok(m.provider.enVol === 1, 'un seul rejeu en cours');
        m.provider.liberer();
        const [r1, r2] = await Promise.all([p1, p2]);
        ok(r1 === r2 && typeof r2.failed === 'number' && r2.success === true,
            'le second appel attend le premier et rend un vrai compte (pas « already_syncing »)');
    }

    // ── Ce qui arrive en file pendant un rejeu n'est pas effacé ──────────────
    {
        const m = creerMonde();
        m.S.enqueue({ type: 'set', key: 'A', value: 1 });
        m.provider.lent = true;
        const p = m.S.sync();
        await vider();
        m.S.enqueue({ type: 'set', key: 'B', value: 2 });   // pendant le rejeu de A
        m.provider.liberer();
        await p;
        ok(m.file().length === 1 && m.file()[0].key === 'B', 'B, ajouté pendant le rejeu, reste en file');
    }

    // ── Le rejeu s'arrête au premier échec ────────────────────────────────────
    {
        const m = creerMonde();
        m.S.enqueue({ type: 'set', key: 'A', value: 1 });
        m.S.enqueue({ type: 'set', key: 'B', value: 2 });
        m.provider.panne = true;
        let essais = 0;
        const set = m.provider.set.bind(m.provider);
        m.provider.set = async (k, v) => { essais++; return set(k, v); };
        const r = await m.S.sync();
        ok(essais === 1 && r.failed === 2 && r.success === false, "serveur muet : une seule tentative, les deux restent en file");
    }

    // ── Garde avant rejeu ─────────────────────────────────────────────────────
    {
        const m = creerMonde();
        const vus = [];
        m.window.StorageRejeu = { async avantRejeu(op) { vus.push(op.key); return { ...op.value, garde: true }; } };
        m.S.enqueue({ type: 'set', key: 'P100:abc:student_abc_progress', value: { n: 1 } });
        await m.S.sync();
        ok(vus.length === 1, 'la garde est appelée avant le rejeu');
        ok(m.provider.ecrits[0][1].garde === true, 'la valeur préparée par la garde est celle qui est écrite');
        m.window.StorageRejeu = { async avantRejeu() { throw new Error('lecture impossible'); } };
        m.S.enqueue({ type: 'set', key: 'X', value: { n: 2 } });
        await m.S.sync();
        ok(m.provider.ecrits.some(([k, v]) => k === 'X' && v.n === 2), 'garde en échec : la valeur est rejouée telle quelle');
    }

    // ── Une seule écriture en cours par clé ───────────────────────────────────
    {
        const m = creerMonde();
        m.provider.lent = true;
        const promesses = [];
        for (let i = 1; i <= 10; i++) promesses.push(m.window.storage.set('p', { n: i }));
        await vider();
        ok(m.provider.maxEnVol === 1, 'dix écritures rapides : une seule en vol');
        m.provider.liberer(); await vider();     // la 1re se termine, la dernière (n=10) part
        m.provider.liberer(); await vider();
        await Promise.all(promesses);
        const valeurs = m.provider.ecrits.filter(([k]) => k === 'p').map(([, v]) => v.n);
        ok(JSON.stringify(valeurs) === '[1,10]', 'seules la première et la dernière partent (' + valeurs.join(',') + ')');
        ok(m.provider.maxEnVol === 1, 'jamais deux en même temps');
        ok(m.file().length === 0, 'rien en file');
    }

    // ── Une écriture réussie retire la copie plus ancienne de la file ─────────
    {
        const m = creerMonde();
        m.S.enqueue({ type: 'set', key: 'p', value: { n: 'ancienne' } });
        m.S.enqueue({ type: 'set', key: 'q', value: 1 });
        await m.window.storage.set('p', { n: 'neuve' });
        await vider();
        ok(!m.provider.ecrits.some(([k, v]) => k === 'p' && v.n === 'ancienne'), "l'ancienne copie de p n'est jamais rejouée par-dessus");
        ok(m.file().length === 0, 'et le reste de la file (q) est parti dans la foulée');
    }

    // ── progressManager : la garde ne touche que la progression de CETTE page ─
    {
        const lus = [];
        const bac = {
            window: {}, console: { ...console, log() {}, warn() {} }, URLSearchParams,
            sessionStorage: { getItem: () => null }, location: { search: '', pathname: '/' },
            storage: { set: async () => {}, get: async () => null },
        };
        bac.window.location = bac.location;
        bac.window.Parcours = bac.Parcours = {
            scoped: { student: { prefix: 'P999:esscin:', get: async (k, o) => { lus.push(k); return null; } } },
        };
        vm.createContext(bac);
        vm.runInContext('var ChapterSession = {};', bac);
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/progressManager.js'), 'utf8'), bac, { filename: 'progressManager.js' });
        const garde = bac.window.StorageRejeu;
        const v = { chapters: {} };
        ok(await garde.avantRejeu({ type: 'set', key: 'P999:esscin:student_esscin_progress', value: v }) === v && lus.length === 1,
            'progression de cette page : relue avant rejeu (garde des corrections)');
        await garde.avantRejeu({ type: 'set', key: 'P100:esscin:student_esscin_progress', value: v });
        await garde.avantRejeu({ type: 'set', key: 'P999:teacher:chapter_config', value: v });
        ok(lus.length === 1, "autre parcours ou autre clé : rejoué tel quel, sans relecture");
    }

    console.log(echecs ? `\n${echecs} échec(s)` : '\nTout passe.');
    process.exit(echecs ? 1 : 0);
})();
