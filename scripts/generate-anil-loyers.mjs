/**
 * Génère `src/lib/anil_loyers.json` — carte des loyers ANIL, figée au build
 * plutôt que téléchargée/parsée à chaque appel à froid (plan d'optimisation
 * du loyer, §3/§5 : `docs/plan-optimisation-loyer.md`).
 *
 * Même pattern que `src/lib/taux_tfpb_communes.json` (taux DGFiP, figé au
 * build, rafraîchi manuellement une fois par an) : l'ANIL publie une édition
 * annuelle, un cache serverless (Vercel) ne survit pas assez longtemps entre
 * redémarrages pour amortir un refresh automatique, et une tâche planifiée +
 * stockage persistant serait de la nouvelle infrastructure pour un événement
 * qui n'arrive qu'une fois par an.
 *
 * Ce script porte TOUTE la logique de résolution de ressource retirée du
 * runtime applicatif (`MOTIF_RESSOURCE`, `resolveResource`, le parsing CSV) —
 * elle n'a plus sa place dans `src/lib/analyse/sources/loyers.ts`, qui se
 * contente désormais de lire le JSON produit ici.
 *
 * Usage : `node scripts/generate-anil-loyers.mjs`
 * Procédure de rafraîchissement annuel : voir
 * docs/reference/estimation-loyer-charges.md.
 */
import { writeFile } from "node:fs/promises";

const DATAGOUV_API = "https://www.data.gouv.fr/api/1/datasets/";

/**
 * Motif de titre de chaque ressource publiée.
 *
 * ⚠️ Ancré sur la FIN du titre, jamais sur son début : l'ANIL alterne
 * « Indicateurs de loyer … » et « Indicateur de loyer … » (singulier) d'une
 * ressource à l'autre. Et « appartement » doit rester ancré en fin de chaîne,
 * sans quoi il capterait aussi « appartement de 1 ou 2 pièces ».
 */
const MOTIF_RESSOURCE = {
  appartement: /appartement\s*$/i,
  appartement_t1_t2: /1\s*ou\s*2\s*pi[eè]ces\s*$/i,
  appartement_t3_plus: /3\s*pi[eè]ces\s*ou\s*plus\s*$/i,
  maison: /maison\s*$/i,
};

const TYPOLOGIES = Object.keys(MOTIF_RESSOURCE);

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

async function findResource(annee, typologie) {
  const raw = await fetchJson(
    `${DATAGOUV_API}?q=${encodeURIComponent(`carte des loyers ${annee}`)}&page_size=5`
  );
  const datasets = raw?.data ?? [];
  const motif = MOTIF_RESSOURCE[typologie];
  for (const ds of datasets) {
    if (!ds.title?.includes(String(annee))) continue;
    const res = (ds.resources ?? []).find((r) => motif.test(r.title ?? ""));
    if (res?.id) return res.id;
  }
  return null;
}

/**
 * Résout la ressource CSV d'une typologie pour l'édition N-1, sinon N-2 —
 * le filet de sécurité qui évite toute régression si personne ne relance ce
 * script pendant quelques mois après le changement d'année : l'édition la
 * plus récente n'est publiée qu'avec quelques mois de retard sur l'année
 * civile.
 */
async function resolveResource(typologie) {
  const currentYear = new Date().getFullYear();
  for (const annee of [currentYear - 1, currentYear - 2]) {
    const rid = await findResource(annee, typologie);
    if (rid) return { rid, annee };
  }
  return null;
}

function num(s) {
  if (!s) return null;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Chaque commune est stockée en TABLEAU (pas en objet) pour ne pas répéter
 * les noms de champs 35 000 fois : [loyerM2, min, max, nbObs, niveau].
 * `niveau` est encodé sur un caractère ("c"/"e"/"m") plutôt que le mot
 * entier — mêmes valeurs que `LoyerReference.niveauPrediction`, décodées côté
 * lecture dans `sources/loyers.ts`.
 */
async function downloadAndParse(typologie) {
  const resource = await resolveResource(typologie);
  if (!resource) throw new Error(`Aucune édition ANIL trouvée pour la typologie "${typologie}".`);
  console.log(`  ${typologie} → édition ${resource.annee} (ressource ${resource.rid})`);

  const res = await fetch(`https://www.data.gouv.fr/fr/datasets/r/${resource.rid}`);
  if (!res.ok) throw new Error(`Téléchargement échoué (${typologie}) : HTTP ${res.status}`);
  const text = await res.text();

  // Colonnes : id_zone;INSEE_C;LIBGEO;EPCI;DEP;REG;loypredm2;lwr.IPm2;upr.IPm2;
  //            TYPPRED;nbobs_com;nbobs_mail;R2_adj  (séparateur ";", décimale ",")
  const parCommune = {};
  const lines = text.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";").map((c) => c.replace(/^"|"$/g, ""));
    const insee = cols[1];
    if (!insee) continue;
    const loyerM2 = num(cols[6]);
    if (loyerM2 == null) continue;
    const typpred = cols[9];
    const niveau = typpred === "commune" ? "c" : typpred === "epci" ? "e" : "m";
    parCommune[insee] = [
      round1(loyerM2),
      round1(num(cols[7]) ?? loyerM2),
      round1(num(cols[8]) ?? loyerM2),
      Math.round(num(cols[10]) ?? 0),
      niveau,
    ];
  }
  console.log(`    ${Object.keys(parCommune).length} communes`);
  return { annee: resource.annee, parCommune };
}

async function main() {
  console.log("Résolution et téléchargement des 4 ressources ANIL (data.gouv.fr)…");
  const annee = {};
  const out = { annee };
  for (const typologie of TYPOLOGIES) {
    const table = await downloadAndParse(typologie);
    annee[typologie] = table.annee;
    out[typologie] = table.parCommune;
  }

  const dest = new URL("../src/lib/anil_loyers.json", import.meta.url);
  await writeFile(dest, JSON.stringify(out));
  console.log(`\nÉcrit : src/lib/anil_loyers.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
