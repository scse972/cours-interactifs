/**
 * src/js/config.js — Configuration centralisée pour le routage multi-environnement
 * =======================================================================
 * À inclure EN PREMIER dans toutes les pages HTML, avant tout autre script.
 *
 * Détection d'environnement automatique :
 *   - localhost / 127.0.0.1              → développement (BASE = '')
 *   - *.github.io (GitHub Pages)          → production (BASE = '/cours-interactifs')
 *   - tout autre hostname                 → production dédiée (BASE = '/cours-interactifs')
 *
 * Le provider de stockage est aussi auto-sélectionné :
 *   - local           → SQLite (via le backend Node.js sur :3000)
 *   - GitHub Pages    → Supabase (directement depuis le navigateur)
 *
 * Usage :
 *   <script src="src/js/config.js"></script>
 *   <script>
 *     window.location.replace(BASE + '/src/html/login.html');
 *   </script>
 */
(function () {
  'use strict';

  var repoName = 'cours-interactifs';
  var hostname = window.location.hostname;
  var protocol = window.location.protocol;
  var port     = window.location.port;

  var isElectron    = !hostname || protocol === 'file:';
  var isGithubPages = !isElectron && hostname.includes('github.io');
  var isLocal       = isElectron
                   || hostname === 'localhost'
                   || hostname === '127.0.0.1'
                   || port !== '';

  if (isElectron) {
    var depth = window._ELECTRON_DEPTH || 0;
    var parts = window.location.href
        .replace(/\/[^/]*$/, '')  // supprime le fichier
        .split('/');
    parts.splice(parts.length - depth);
    window.BASE = parts.join('/');
  } else {
    window.BASE = isLocal ? '' : '/' + repoName;
  }

  window.REPO_NAME        = repoName;
  window.IS_LOCAL         = isLocal;
  window.IS_ELECTRON      = isElectron;
  window.IS_GITHUB_PAGES  = isGithubPages;
  window.IS_IFRAME        = (window.self !== window.parent);
  if (window.STORAGE_PROVIDER === undefined) {
    window.STORAGE_PROVIDER = isElectron ? 'electron' : (isLocal ? 'sqlite' : 'supabase');
  }

  var baseTag = document.querySelector('base');
  if (baseTag) baseTag.href = window.BASE + '/';

  console.log('[Config] BASE="' + window.BASE + '" depth=' + depth + ' isElectron=' + isElectron);

  // ── Remplacement global de window.alert / window.confirm / window.prompt ──
  // Évite la perte de focus dans les iframes Electron après fermeture d'une boîte native.
  // alert() est synchrone sans valeur de retour ; confirm() et prompt() retournent
  // une Promise car la modale DOM est asynchrone. Les appelants doivent utiliser await.
  (function () {
    var activeElRef = null; // stocke le focus actif avant ouverture

    function _makeOverlay() {
      var el = document.createElement('div');
      el.style.cssText =
        'position:fixed;top:0;left:0;right:0;bottom:0;' +
        'background:rgba(0,0,0,0.4);z-index:999999;' +
        'display:flex;align-items:center;justify-content:center;' +
        'font-family:Arial,sans-serif;';
      return el;
    }

    function _makeBox() {
      var el = document.createElement('div');
      el.style.cssText =
        'background:white;border-radius:8px;padding:1.5rem 2rem;' +
        'max-width:420px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,0.2);' +
        'text-align:center;';
      return el;
    }

    function _makeMsg(text) {
      var el = document.createElement('p');
      el.style.cssText = 'margin:0 0 1.2rem 0;font-size:1rem;color:#333;white-space:pre-wrap;';
      el.textContent = text;
      return el;
    }

    function _makeBtn(text, color) {
      var el = document.createElement('button');
      el.textContent = text;
      el.style.cssText =
        'padding:0.5rem 2rem;font-size:1rem;margin:0 0.3rem;' +
        'border:none;border-radius:6px;cursor:pointer;' +
        'color:white;background:' + (color || '#007bff') + ';';
      return el;
    }

    function _restoreFocus() {
      if (activeElRef && typeof activeElRef.focus === 'function') {
        try { activeElRef.focus(); } catch (_) {}
      }
    }

    // ── alert(message) ───────────────────────────────────────────
    var originalAlert = window.alert;
    window.alert = function (message) {
      activeElRef = document.activeElement;
      var overlay = _makeOverlay();
      var box = _makeBox();
      box.appendChild(_makeMsg(message));
      var btn = _makeBtn('OK');
      btn.onclick = function () {
        document.body.removeChild(overlay);
        _restoreFocus();
      };
      box.appendChild(btn);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      btn.focus();
    };

    // ── confirm(message) → Promise<boolean> ──────────────────────
    // retours : true (OK) / false (Annuler)
    var originalConfirm = window.confirm;
    window.confirm = function (message) {
      activeElRef = document.activeElement;
      return new Promise(function (resolve) {
        var overlay = _makeOverlay();
        var box = _makeBox();
        box.appendChild(_makeMsg(message));

        var btnOk = _makeBtn('OK', '#007bff');
        btnOk.style.marginRight = '0.5rem';
        btnOk.onclick = function () {
          document.body.removeChild(overlay);
          _restoreFocus();
          resolve(true);
        };

        var btnCancel = _makeBtn('Annuler', '#6c757d');
        btnCancel.onclick = function () {
          document.body.removeChild(overlay);
          _restoreFocus();
          resolve(false);
        };

        var btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display:flex;justify-content:center;gap:0.5rem;';
        btnContainer.appendChild(btnOk);
        btnContainer.appendChild(btnCancel);

        box.appendChild(btnContainer);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        btnOk.focus();
      });
    };

    // ── prompt(message, defaultValue?) → Promise<string|null> ────
    // retours : string (OK) / null (Annuler)
    var originalPrompt = window.prompt;
    window.prompt = function (message, defaultValue) {
      activeElRef = document.activeElement;
      return new Promise(function (resolve) {
        var overlay = _makeOverlay();
        var box = _makeBox();
        box.appendChild(_makeMsg(message));

        var input = document.createElement('input');
        input.type = 'text';
        input.value = defaultValue || '';
        input.style.cssText =
          'width:100%;padding:0.6rem;margin-bottom:1rem;' +
          'border:2px solid #ddd;border-radius:6px;font-size:1rem;' +
          'box-sizing:border-box;';
        box.appendChild(input);

        var btnOk = _makeBtn('OK', '#007bff');
        btnOk.style.marginRight = '0.5rem';
        btnOk.onclick = function () {
          document.body.removeChild(overlay);
          _restoreFocus();
          resolve(input.value);
        };

        var btnCancel = _makeBtn('Annuler', '#6c757d');
        btnCancel.onclick = function () {
          document.body.removeChild(overlay);
          _restoreFocus();
          resolve(null);
        };

        var btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display:flex;justify-content:center;gap:0.5rem;';
        btnContainer.appendChild(btnOk);
        btnContainer.appendChild(btnCancel);

        // Entrée → valider
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') btnOk.click();
          if (e.key === 'Escape') btnCancel.click();
        });

        box.appendChild(btnContainer);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        input.focus();
        input.select();
      });
    };
  })();
})();
