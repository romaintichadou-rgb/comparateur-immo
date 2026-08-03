/**
 * Contrôle du bookmarklet GÉNÉRÉ — `npm run check:bookmarklet`.
 *
 * Pourquoi un script dédié plutôt qu'une relecture : `buildBookmarkletHref`
 * supprime tous les sauts de ligne de la source. Un `//` ajouté dans la
 * chaîne annule alors TOUT ce qui suit, et le bookmarklet ne fait plus rien —
 * sans erreur en console, sans échec de build, sans rien de visible avant le
 * prochain test manuel sur une vraie annonce. C'est exactement ce qui est
 * arrivé au lot 4.
 *
 * On importe le vrai module (Node ≥ 22 dépouille les types TS) : découper le
 * fichier à la main laisserait les échappements `\\b` non résolus et
 * validerait un script qui n'existe pas.
 */
import { buildBookmarkletHref } from "../src/lib/bookmarklet.ts";

const ORIGIN = "https://exemple.test";
const href = buildBookmarkletHref(ORIGIN);
const genere = href.replace(/^javascript:/, "");

let ok = true;
const verifier = (bon, texte) => {
  console.log(`${bon ? "  ok  " : "ÉCHEC "} ${texte}`);
  if (!bon) ok = false;
};

verifier(href.startsWith("javascript:"), "préfixe javascript:");

// Une seule ligne : c'est ce qui rend tout `//` mortel.
verifier(!genere.includes("\n"), "une seule ligne après génération");

// `String.replace` sans /g ne substitue que la première occurrence.
verifier(!genere.includes("__APP_ORIGIN__"), "aucun __APP_ORIGIN__ résiduel");
verifier(genere.includes(`${ORIGIN}/appartements/nouveau`), "URL de destination présente");

// Compile sans exécuter : une accolade avalée par un commentaire ou une regex
// tronquée échoue ici. C'est le contrôle qui attrape le cas du lot 4.
try {
  new Function(genere);
  verifier(true, "le script compile");
} catch (e) {
  verifier(false, `le script ne compile pas — ${e.message}`);
}

verifier(genere.trimEnd().endsWith("})();"), "script complet jusqu'à la fermeture");

console.log(`\n${genere.length} caractères`);

if (!ok) {
  console.error("\nBookmarklet cassé — voir les règles en tête de src/lib/bookmarklet.ts");
  process.exit(1);
}
