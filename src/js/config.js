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
  if (window.STORAGE_PROVIDER === undefined) {
    window.STORAGE_PROVIDER = isElectron ? 'electron' : (isLocal ? 'sqlite' : 'supabase');
  }

  var baseTag = document.querySelector('base');
  if (baseTag) baseTag.href = window.BASE + '/';

  console.log('[Config] BASE="' + window.BASE + '" depth=' + depth + ' isElectron=' + isElectron);
})();