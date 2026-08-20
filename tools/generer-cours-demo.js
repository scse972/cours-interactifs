#!/usr/bin/env node
// ============================================================================
// generer-cours-demo.js — Régénère parcours/cours.json à partir d'un export XSpro
// ============================================================================
// Remplace l'ancien générateur Python (tools_xlsx/generate_chapters.py), devenu
// obsolète depuis que XSpro sait créer et publier des parcours.
//
// À quoi sert le fichier produit : `parcours/cours.json` est la source
// PRIORITAIRE du contenu pédagogique (cf. staticJson dans src/js/storage.js).
// Le provider (parcours_data) ne sert que de secours. Ce fichier fait donc aussi
// office de jeu de démonstration quand la base est vide.
//
// ⚠️ CE SCRIPT NE RÉIMPLÉMENTE PAS LE FORMAT.
//    Il appelle `buildParcours()` de XSpro (publishParcours.js), qui est la
//    source de vérité unique du format cours.json. Toute copie de cette logique
//    ici finirait par diverger de ce que XSpro publie réellement, et le jour
//    où les deux ne se ressemblent plus, plus rien n'est testable.
//    C'est pourquoi le script exige un dépôt XSpro accessible : il n'est utilisé
//    qu'en développement, jamais au déploiement.
//
// Usage :
//   node tools/generer-cours-demo.js <export.json> [options]
//
//   --xspro <chemin>   Racine du dépôt XSpro          (défaut : ../XSpro)
//   --sortie <chemin>  Fichier à écrire               (défaut : parcours/cours.json)
//   --images           Conserve les images de question (base64, fichier lourd)
//   --remplacer        Écrase tout le fichier au lieu de fusionner par slug
//
// L'export attendu est celui de XSpro : « exporter » sur une ligne de
// listeParcours, ce qui produit un JSON hiérarchique
// listeParcours → listeChapitres → listeQuestions.
// ============================================================================

const fs   = require('fs');
const path = require('path');

// ----------------------------------------------------------------------------
// Arguments
// ----------------------------------------------------------------------------

function lireArguments(argv) {
    const options = {
        export: null,
        xspro: path.resolve(__dirname, '..', '..', 'XSpro'),
        sortie: path.resolve(__dirname, '..', 'parcours', 'cours.json'),
        images: false,
        remplacer: false
    };

    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--xspro')          options.xspro  = path.resolve(argv[++i]);
        else if (arg === '--sortie')    options.sortie = path.resolve(argv[++i]);
        else if (arg === '--images')    options.images = true;
        else if (arg === '--remplacer') options.remplacer = true;
        else if (!options.export)       options.export = path.resolve(arg);
        else throw new Error(`Argument inattendu : ${arg}`);
    }

    if (!options.export) {
        throw new Error('Chemin de l\'export manquant.\n' +
            'Usage : node tools/generer-cours-demo.js <export.json> [--xspro <chemin>] [--sortie <chemin>] [--images] [--remplacer]');
    }
    return options;
}

// ----------------------------------------------------------------------------
// Aplatissement de l'export hiérarchique
// ----------------------------------------------------------------------------
// L'export imbrique les lignes de base sous { table, row, children }. buildParcours
// attend, lui, les lignes brutes séparées — exactement ce que la vue XSpro lui passe.

function aplatir(exportXspro) {
    if (!exportXspro?.root?.row) {
        throw new Error('Ce fichier n\'est pas un export hiérarchique XSpro ' +
                        '(clé "root.row" absente). Exportez une ligne de listeParcours.');
    }
    if (exportXspro.type && exportXspro.type !== 'listeParcours') {
        throw new Error(`Export de type "${exportXspro.type}" : il faut un export de listeParcours.`);
    }

    const parcours   = exportXspro.root.row;
    const chapitres  = (exportXspro.root.children?.listeChapitres || []).map(c => c.row);
    const questionsParChapitre = {};

    (exportXspro.root.children?.listeChapitres || []).forEach(chapitre => {
        questionsParChapitre[chapitre.row.idChapitre] =
            (chapitre.children?.listeQuestions || []).map(q => q.row);
    });

    return { parcours, chapitres, questionsParChapitre };
}

// ----------------------------------------------------------------------------
// Chargement du publieur XSpro
// ----------------------------------------------------------------------------

function chargerPublieur(racineXspro) {
    const chemin = path.join(racineXspro, 'src', 'vuesOnglets', 'vuesOngletsParcours', 'publishParcours.js');

    if (!fs.existsSync(chemin)) {
        throw new Error(
            `publishParcours.js introuvable dans "${racineXspro}".\n` +
            'Indiquez la racine du dépôt XSpro avec --xspro <chemin>.\n' +
            'Ce script réutilise volontairement le publieur de XSpro : le format de ' +
            'cours.json n\'a qu\'une seule implémentation.'
        );
    }

    // publishParcours.js n'utilise ipcRenderer que dans ses fonctions de
    // sauvegarde ; buildParcours() est utilisable tel quel hors d'Electron.
    return require(chemin);
}

// ----------------------------------------------------------------------------
// Programme
// ----------------------------------------------------------------------------

async function principal() {
    const options = lireArguments(process.argv);

    console.log(`→ Export  : ${options.export}`);
    console.log(`→ XSpro   : ${options.xspro}`);
    console.log(`→ Sortie  : ${options.sortie}`);

    const exportXspro = JSON.parse(fs.readFileSync(options.export, 'utf8'));
    const { parcours, chapitres, questionsParChapitre } = aplatir(exportXspro);

    const { buildParcours } = chargerPublieur(options.xspro);

    const nouveau = await buildParcours(parcours, chapitres, questionsParChapitre, options.images);

    // Même fusion que publishParcours : un slug remplace le précédent, tri stable.
    let coursData = { version: null, parcours: [] };
    if (!options.remplacer && fs.existsSync(options.sortie)) {
        try {
            const existant = JSON.parse(fs.readFileSync(options.sortie, 'utf8'));
            if (Array.isArray(existant?.parcours)) coursData = existant;
        } catch (e) {
            console.warn(`⚠️  ${path.basename(options.sortie)} illisible, il sera recréé : ${e.message}`);
        }
    }

    coursData.parcours = coursData.parcours.filter(p => p.slug !== nouveau.slug);
    coursData.parcours.push(nouveau);
    coursData.parcours.sort((a, b) => a.slug.localeCompare(b.slug));
    coursData.version = new Date().toISOString();

    fs.mkdirSync(path.dirname(options.sortie), { recursive: true });
    fs.writeFileSync(options.sortie, JSON.stringify(coursData, null, 1), 'utf8');

    const poids = (fs.statSync(options.sortie).size / 1024).toFixed(0);

    console.log('');
    console.log(`✅ ${nouveau.slug} — ${nouveau.totalChapitres} chapitre(s), ` +
                `${nouveau.totalQuestions} question(s), ${nouveau.totalMaxPoints} point(s)`);
    nouveau.chapitres.forEach(chapitre => {
        console.log(`   • ${chapitre.title} — mode « ${chapitre.chapterMode} », ` +
                    `${chapitre.questionCount} question(s), ${chapitre.courseCount} bloc(s) de cours`);
    });
    console.log('');
    console.log(`📄 ${options.sortie} (${poids} ko) — ${coursData.parcours.length} parcours au total`);
    if (!options.images) {
        console.log('   Images de question ignorées (utilisez --images pour les conserver).');
    }
}

principal().catch(erreur => {
    console.error(`\n❌ ${erreur.message}`);
    process.exit(1);
});
