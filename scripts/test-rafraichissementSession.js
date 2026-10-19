// test-rafraichissementSession.js — core/rafraichissementSession.js : une page revue après plus de
// six heures se recharge, sauf file hors ligne non vide ou saisie en cours (bandeau « Recharger »).
//
//   node scripts/test-rafraichissementSession.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let echecs = 0;
const ok = (c, m) => { if (!c) echecs++; console.log(c ? 'PASS' : 'FAIL', m); };
const H = 60 * 60 * 1000;

function creerMonde() {
    const elements = {};
    const ecoutesDoc = {}, ecoutesWin = {};
    const faireElement = () => {
        const el = { style: {}, children: [], attrs: {}, innerHTML: '', id: '',
            setAttribute(n, v) { this.attrs[n] = v; if (n === 'id') this.id = v; },
            remove() { delete elements[this.id]; this.retire = true; },
            addEventListener() {} };
        return el;
    };
    const bac = {
        console, Date, JSON, Array, String, Promise, Object,
        setInterval: () => 0, clearInterval() {},
        localStorage: { _m: new Map(), getItem(k) { return this._m.has(k) ? this._m.get(k) : null; }, setItem(k, v) { this._m.set(k, String(v)); }, removeItem(k) { this._m.delete(k); } },
        location: { reload() { bac.rechargements++; } },
        rechargements: 0,
        champs: [],
        document: {
            hidden: false, activeElement: null,
            addEventListener(t, fn) { (ecoutesDoc[t] ||= []).push(fn); },
            querySelectorAll() { return bac.champs; },
            getElementById(id) { return elements[id] || null; },
            createElement() { return faireElement(); },
            body: { appendChild(el) { elements[el.id] = el; const b1 = faireElement(); b1.id = el.id + '-recharger'; const b2 = faireElement(); b2.id = el.id + '-fermer'; elements[b1.id] = b1; elements[b2.id] = b2; } },
        },
        addEventListener(t, fn) { (ecoutesWin[t] ||= []).push(fn); },
        ecoutesDoc, ecoutesWin, elements,
    };
    bac.window = bac;
    vm.createContext(bac);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/js/core/rafraichissementSession.js'), 'utf8'), bac, { filename: 'rafraichissementSession.js' });
    return bac;
}

{
    const m = creerMonde();
    const R = m.RafraichissementSession;
    ok(R && R.SEUIL_MS === 6 * H, 'module chargé, seuil de six heures');
    ok(m.ecoutesDoc.visibilitychange && m.ecoutesWin.pageshow, 'écoute visibilitychange et pageshow');

    let maintenant = Date.now();
    R._configurer({ horloge: () => maintenant });

    ok(R.verifier() === 'rien' && m.rechargements === 0, 'page revue après peu de temps : rien');

    maintenant += 2 * H;
    ok(R.verifier() === 'rien' && m.rechargements === 0, 'deux heures : rien, et la vie est remarquée');

    maintenant += 7 * H;
    ok(R.verifier() === 'recharge' && m.rechargements === 1, 'sept heures sans vie : la page se recharge');

    // File hors ligne non vide : proposer, ne pas recharger
    maintenant += 7 * H;
    m.localStorage.setItem('_sync_queue', JSON.stringify([{ op: 'set' }]));
    ok(R.fileNonVide() === true, 'file hors ligne détectée');
    ok(R.verifier() === 'propose' && m.rechargements === 1, 'file non vide : bandeau proposé, pas de rechargement');
    ok(!!m.elements['bandeau-rafraichissement-session'], 'le bandeau est dans la page');
    m.elements['bandeau-rafraichissement-session'].remove();
    m.localStorage.removeItem('_sync_queue');

    // Saisie en cours : un champ texte a le focus
    maintenant += 7 * H;
    m.document.activeElement = { tagName: 'TEXTAREA' };
    ok(R.saisieEnCours() === true && R.verifier() === 'propose' && m.rechargements === 1, 'champ texte actif : proposé, pas rechargé');
    m.document.activeElement = { tagName: 'INPUT', type: 'checkbox' };
    ok(R.saisieEnCours() === false, 'une case à cocher active n\'est pas une saisie');
    m.document.activeElement = null;

    // Réponse rédigée non validée
    m.champs = [{ tagName: 'TEXTAREA', value: 'ma réponse', disabled: false, readOnly: false }];
    ok(R.saisieEnCours() === true, 'réponse rédigée dans une question : saisie en cours');
    m.champs = [{ tagName: 'TEXTAREA', value: 'rendue', disabled: true, readOnly: false }, { tagName: 'INPUT', value: '   ', disabled: false, readOnly: false }];
    ok(R.saisieEnCours() === false, 'champ désactivé ou vide : pas de saisie');

    // La page qui passe cachée marque sa vie ; revue dix heures après, elle se recharge
    m.elements['bandeau-rafraichissement-session'] && m.elements['bandeau-rafraichissement-session'].remove();
    maintenant += 1 * H;
    m.document.hidden = true; m.ecoutesDoc.visibilitychange.forEach(fn => fn());
    ok(Math.abs(R._derniereVie() - maintenant) < 5, 'passage caché : horodatage posé');
    maintenant += 10 * H;
    m.document.hidden = false; m.ecoutesDoc.visibilitychange.forEach(fn => fn());
    ok(m.rechargements === 2, 'revue dix heures plus tard : rechargée');

    // pageshow depuis le cache arrière/avant
    maintenant += 7 * H;
    m.ecoutesWin.pageshow.forEach(fn => fn({ persisted: true }));
    ok(m.rechargements === 3, 'pageshow (cache arrière/avant) après sept heures : rechargée');
    m.ecoutesWin.pageshow.forEach(fn => fn({ persisted: false }));
    ok(m.rechargements === 3, 'pageshow d\'un chargement normal : rien');
}

console.log(echecs ? echecs + ' FAIL' : 'tout est vert');
process.exitCode = echecs ? 1 : 0;
