// test-identiteSession.js — L'identité de l'élève, une fois par session (dataStorage.js,
// findUserByToken) : mémo de 30 min, promesse partagée, chemin direct ou pont, panne qui remonte.
//
//   node scripts/test-identiteSession.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let echecs = 0;
const ok = (c, m) => { if (!c) echecs++; console.log(c ? 'PASS' : 'FAIL', m); };

function stockage() {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

function creerMonde({ parPont = false, users = [{ id: 'graxa', name: 'GRANDJEAN Xavier', class: 'Test' }], whoami } = {}) {
    const compteurs = { users: 0, whoami: 0 };
    const bac = {
        console, Promise, Date, JSON, Object, Error, setTimeout, clearTimeout,
        sessionStorage: stockage(),
        localStorage: stockage(),
        document: { getElementById: () => null, addEventListener() {} },
        _storageProvider: {},
        _storageBackend: parPont ? 'appwrite' : 'sqlite',
        storage: { init: async () => {} },
        Parcours: {
            slug: 'P1', loginUrl: '/login', homeUrl: '/',
            makeScoped() {},
            scoped: { teacher: { async get(cle) { compteurs.users++; return cle === 'users_list' ? users : null; } }, student: {}, config: {} },
            utiliserPont: async () => parPont,
        },
        StudentProgressBridge: {
            async whoami(slug, token) {
                compteurs.whoami++;
                if (whoami) return whoami(slug, token);
                const u = users.find(x => x.id === token);
                return u ? { found: true, name: u.name, class: u.class } : { found: false };
            },
        },
        compteurs,
    };
    bac.window = bac;
    vm.createContext(bac);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/dataStorage.js'), 'utf8'), bac, { filename: 'dataStorage.js' });
    bac.DataStorage = vm.runInContext('DataStorage', bac);
    return bac;
}

(async () => {
    // ── Direct : une seule lecture pour trois appels, puis le mémo ──
    {
        const m = creerMonde();
        const a = new m.DataStorage();
        const [u1, u2, u3] = await Promise.all([a.findUserByToken('graxa'), a.findUserByToken('graxa'), new m.DataStorage().findUserByToken('graxa')]);
        ok(u1 && u1.name === 'GRANDJEAN Xavier' && u2 === u1 && u3 === u1, 'trois appels simultanés : même identité');
        ok(m.compteurs.users === 1 && m.compteurs.whoami === 0, 'une seule lecture de users_list, jamais le pont en direct');
        const memo = JSON.parse(m.sessionStorage.getItem('parcours:P1:identite'));
        ok(memo && memo.id === 'graxa' && memo.class === 'Test' && typeof memo.at === 'number', 'identité mémorisée dans la session avec son horodatage');
        const u4 = await a.findUserByToken('graxa');
        ok(u4.name === 'GRANDJEAN Xavier' && m.compteurs.users === 1, 'appel suivant : servi par le mémo, aucune lecture');

        // Mémo périmé : revérification
        memo.at = Date.now() - 31 * 60 * 1000;
        m.sessionStorage.setItem('parcours:P1:identite', JSON.stringify(memo));
        await a.findUserByToken('graxa');
        ok(m.compteurs.users === 2, 'mémo de plus de 30 min : revérifié');
        ok(JSON.parse(m.sessionStorage.getItem('parcours:P1:identite')).at > memo.at, 'mémo réécrit avec un horodatage neuf');

        // Autre jeton : le mémo ne vaut que pour le sien
        ok(await a.findUserByToken('inconnu') === null && m.compteurs.users === 3, 'jeton inconnu : lu, null');
        ok(await a.findUserByToken('inconnu') === null && m.compteurs.users === 4, 'jeton inconnu : jamais mémorisé, relu à chaque fois');
        ok(await a.findUserByToken('') === null && m.compteurs.users === 4, 'jeton vide : null sans lecture');

        m.DataStorage.oublierIdentite();
        ok(m.sessionStorage.getItem('parcours:P1:identite') === null, 'oublierIdentite : mémo effacé');
    }

    // ── Pont (multi-formateur) : whoami une fois, puis le mémo ──
    {
        const m = creerMonde({ parPont: true });
        const a = new m.DataStorage();
        const u = await a.findUserByToken('graxa');
        ok(u && u.name === 'GRANDJEAN Xavier' && u.type === 'student', 'pont : identité par whoami');
        ok(m.compteurs.whoami === 1 && m.compteurs.users === 0, 'pont : users_list jamais lue en direct');
        await a.findUserByToken('graxa');
        ok(m.compteurs.whoami === 1, 'pont : second appel servi par le mémo');
    }

    // ── Panne du pont : remonte, rien n'est mémorisé ──
    {
        const m = creerMonde({ parPont: true, whoami: async () => ({ found: false, erreur: 'HTTP 500' }) });
        const a = new m.DataStorage();
        let erreur = null;
        try { await a.findUserByToken('graxa'); } catch (e) { erreur = e; }
        ok(erreur && erreur.serviceIndisponible === true && /500/.test(erreur.message), 'panne : erreur serviceIndisponible');
        ok(m.sessionStorage.getItem('parcours:P1:identite') === null, 'panne : aucun mémo');
        ok(m.DataStorage._identiteEnCours === null || m.DataStorage._identiteEnCours === undefined, 'panne : promesse en cours libérée');
    }

    // ── checkAuth : un jeton inconnu efface session et mémo ──
    {
        const m = creerMonde();
        m.sessionStorage.setItem('current_student_token', 'parti');
        m.sessionStorage.setItem('parcours:P1:identite', JSON.stringify({ id: 'parti', name: 'X', at: Date.now() - 40 * 60 * 1000 }));
        const a = new m.DataStorage();
        await new Promise(r => setTimeout(r, 10));
        ok(m.sessionStorage.getItem('current_student_token') === null && m.sessionStorage.getItem('parcours:P1:identite') === null, 'checkAuth : jeton retiré de la liste → session et mémo effacés');
    }

    console.log(echecs ? echecs + ' FAIL' : 'tout est vert');
    process.exitCode = echecs ? 1 : 0;
})();
