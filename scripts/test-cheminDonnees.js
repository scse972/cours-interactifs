// test-cheminDonnees.js — Le chemin des données de l'élève, direct ou pont, constaté par parcours.js
// (deciderCheminDonnees, accesDirect, utiliserPont), sans navigateur : parcours.js chargé dans un
// bac à sable vm avec le strict nécessaire (location, sessionStorage, document).
//
//   node scripts/test-cheminDonnees.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let echecs = 0;
const ok = (c, m) => { if (!c) echecs++; console.log(c ? 'PASS' : 'FAIL', m); };

function stockage() {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } };
}

/** Un monde neuf : parcours.js y est chargé ; backend, provider et staticJson sont posés par l'appelant. */
function creerMonde({ backend = 'appwrite', ownerId = null, source = 'provider', coursJsonEchoue = false } = {}) {
    const bac = {
        console, URLSearchParams, Promise, Date, Object, JSON, Error,
        setTimeout, clearTimeout,
        sessionStorage: stockage(),
        localStorage: stockage(),
        document: { addEventListener() {}, dispatchEvent() { return true; } },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
        history: { replaceState() {} },
        location: { search: '?parcours=P1', pathname: '/src/html/user.html', protocol: 'http:', host: 'localhost:8000', hostname: 'localhost', href: 'http://localhost:8000/src/html/user.html?parcours=P1' },
        BASE: '',
        _storageBackend: backend,
        _storageProvider: ownerId ? { _ownerId: ownerId } : {},
        storage: { init: async () => {} },
        staticJson: {
            appels: 0,
            async getWithInfo(p) {
                this.appels++;
                if (coursJsonEchoue) throw new Error('staticJson en panne');
                return { data: p === '/parcours/cours.json' ? { parcours: [] } : null, source };
            },
        },
    };
    bac.window = bac;
    vm.createContext(bac);
    const source_ = fs.readFileSync(path.join(__dirname, '../src/js/parcours.js'), 'utf8');
    vm.runInContext(source_, bac, { filename: 'parcours.js' });
    return bac;
}

(async () => {
    // ── La décision pure ──
    const m = creerMonde();
    const d = m.Parcours.deciderCheminDonnees;
    ok(typeof d === 'function' && m.Parcours.slug === 'P1', 'parcours.js chargé, slug lu');
    ok(d('electron', false, null) === 'direct' && d('sqlite', false, 'static') === 'direct', 'backend local : direct, quelle que soit la source');
    ok(d('appwrite', true, 'static') === 'direct' && d('supabase', true, null) === 'direct', 'session formateur sur le provider : direct');
    ok(d('appwrite', false, 'provider') === 'direct' && d('supabase', false, 'provider') === 'direct', 'web, cours.json lu dans parcours_data : direct (mono-formateur)');
    ok(d('appwrite', false, 'static') === 'pont' && d('appwrite', false, null) === 'pont', 'web, cours.json refusé ou absent : pont (multi-formateur)');

    // ── Le constat, une fois par page ──
    ok(m.Parcours.cheminDonnees() === null, 'avant tout constat : chemin inconnu');
    const pont1 = await m.Parcours.utiliserPont();
    ok(pont1 === false && m.Parcours.cheminDonnees() === 'direct', 'web mono (source provider) : pas de pont, chemin direct');
    await m.Parcours.utiliserPont(); await m.Parcours.accesDirect();
    ok(m.staticJson.appels === 1, 'le constat n\'est fait qu\'une fois par page (staticJson lu une fois)');

    const multi = creerMonde({ source: 'static' });
    ok(await multi.Parcours.utiliserPont() === true && multi.Parcours.cheminDonnees() === 'pont', 'web multi (repli statique) : pont');

    const panne = creerMonde({ coursJsonEchoue: true });
    ok(await panne.Parcours.utiliserPont() === true, 'cours.json illisible : pont, par prudence');

    const local = creerMonde({ backend: 'sqlite', source: 'static' });
    ok(await local.Parcours.utiliserPont() === false && local.staticJson.appels === 0, 'mode local : direct sans même consulter staticJson');

    const formateur = creerMonde({ ownerId: 'u1', source: 'static' });
    ok(await formateur.Parcours.utiliserPont() === false && formateur.staticJson.appels === 0, 'session formateur : direct sans consulter staticJson');

    // ── logout efface le mémo d'identité ──
    m.sessionStorage.setItem('parcours:P1:identite', '{"id":"t"}');
    m.location.href = '';
    m.Parcours.logout();
    ok(m.sessionStorage.getItem('parcours:P1:identite') === null && m.sessionStorage.getItem('current_student_token') === null, 'logout : mémo d\'identité et session effacés');

    console.log(echecs ? echecs + ' FAIL' : 'tout est vert');
    process.exitCode = echecs ? 1 : 0;
})();
