// sync_sqlite_to_supabase.js
// Synchronise SQLite (local) → Supabase (cloud)
// Usage: node sync_sqlite_to_supabase.js

// Identifiants lus dans storage/config.json, et non recopies ici : ce depot
// est le modele que les formateurs forkent, et une constante en dur y voyage
// avec chaque fork. Celle qui s'y trouvait designait de surcroit un projet
// supprime depuis, si bien que ces scripts echouaient sans dire pourquoi.
const path = require('path');
const CONFIG = require(path.join(__dirname, '..', 'storage', 'config.json'));

const SUPABASE_URL = (CONFIG.supabase || {}).url        || '';
const SUPABASE_KEY = (CONFIG.supabase || {}).anonKey    || '';
const SQLITE_API   = (CONFIG.sqlite   || {}).apiBaseUrl || 'http://localhost:3000/api';

if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_URL.indexOf('<') !== -1) {
    console.error('storage/config.json ne porte pas encore vos identifiants Supabase.');
    process.exit(1);
}

// Tables à synchroniser : { sqliteRoute, supabaseTable }
const TABLES = [
    { sqliteRoute: 'app_data',      supabaseTable: 'app_data'      },
    { sqliteRoute: 'parcours_data', supabaseTable: 'parcours_data' }
];

async function fetchAllKeysFromSQLite(sqliteRoute) {
    const response = await fetch(`${SQLITE_API}/${sqliteRoute}/keys`);
    if (!response.ok) throw new Error(`Erreur SQLite: ${response.status}`);
    const data = await response.json();
    return data.map(row => row.key);
}

async function fetchValueFromSQLite(sqliteRoute, key) {
    const response = await fetch(`${SQLITE_API}/${sqliteRoute}/${encodeURIComponent(key)}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.value;
}

async function importToSupabase(supabaseTable, key, value) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${supabaseTable}`, {
        method: 'POST',
        headers: {
            'apikey':        SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type':  'application/json',
            'Prefer':        'resolution=merge-duplicates'
        },
        body: JSON.stringify({ key, value, updated_at: new Date().toISOString() })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
    }
    return true;
}

async function syncTable({ sqliteRoute, supabaseTable }) {
    console.log(`\n📦 Table : ${supabaseTable}`);

    const keys = await fetchAllKeysFromSQLite(sqliteRoute);
    console.log(`   📋 ${keys.length} clé(s) trouvée(s) dans SQLite`);

    if (keys.length === 0) {
        console.log('   ⚠️  Aucune donnée à synchroniser');
        return { success: 0, errors: 0 };
    }

    let success = 0, errors = 0;

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        process.stdout.write(`   ⏳ [${i+1}/${keys.length}] ${key}... `);

        try {
            const value = await fetchValueFromSQLite(sqliteRoute, key);
            if (value !== null && await importToSupabase(supabaseTable, key, value)) {
                success++;
                console.log('✅');
            } else {
                console.log('⚠️  (valeur null ou échec)');
                errors++;
            }
        } catch (e) {
            errors++;
            console.log(`❌ ${e.message}`);
        }
    }

    return { success, errors };
}

async function main() {
    console.log('💾 → ☁️  Synchronisation SQLite → Supabase\n');

    let totalSuccess = 0, totalErrors = 0;

    try {
        for (const table of TABLES) {
            const { success, errors } = await syncTable(table);
            totalSuccess += success;
            totalErrors  += errors;
        }

        console.log(`\n✅ Terminé ! ${totalSuccess} synchronisée(s), ${totalErrors} erreur(s)`);

    } catch (error) {
        console.error('❌ Erreur:', error.message);
        process.exit(1);
    }
}

main();