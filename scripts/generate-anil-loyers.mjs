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
 * contente désormais de lire le JSON produit ici. Il porte aussi le calcul de
 * `elasticiteLocale` (voir plus bas) : dérivé des DEUX ressources appartement
 * (T1-T2 et T3+) déjà téléchargées ici, calculer ça côté application aurait
 * dupliqué un accès aux deux tables qui n'existe autrement que dans ce script.
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

// Repli national — médiane des pentes log-log mesurée sur les 34 960
// communes lors de l'audit initial (voir anilReference.ts). Utilisé pour
// TOUTE commune où l'élasticité locale n'est pas mesurable avec confiance :
// c'est la valeur par défaut historique, pas une approximation nouvelle.
const ELASTICITE_NATIONALE = -0.485;

// En dessous de ce nombre d'observations (d'UN COTÉ ou de l'autre), la pente
// mesurée entre les deux ressources est du bruit statistique, pas un signal
// de marché — même seuil que la note méthodologique ANIL pour la fiabilité
// d'une prédiction (voir SEUIL_NB_OBS_FIABLE, anilReference.ts).
const SEUIL_OBS_ELASTICITE = 30;

// Bornes de plausibilité économique. Une pente positive ou proche de zéro
// impliquerait qu'un logement plus grand ne coûte pas moins cher au m² que
// la référence — jamais observé sur un marché sain, donc traité comme un
// signal de mesure non fiable (petit échantillon d'un côté malgré le seuil
// d'observations) plutôt que comme une élasticité "réelle mais extrême".
const BORNES_ELASTICITE = [-1.2, -0.05];

/**
 * Élasticité de surface PROPRE À CHAQUE COMMUNE — bug corrigé après un audit
 * utilisateur (loyer réel très supérieur à l'estimation sur un T2 parisien) :
 * la constante nationale (-0,485, médiane sur 34 960 communes très
 * majoritairement rurales) surestimait fortement la décote de surface dans
 * les grandes villes. Mesuré sur les données ANIL elles-mêmes : Paris 10e
 * -0,119, Paris 11e -0,137, quand la constante nationale appliquait -0,485 —
 * un studio de 48 m² au lieu de la référence 37 m² perdait ~12 % de trop.
 *
 * Dérivée de la SEULE paire de points dont on dispose par commune : les
 * loyers/m² des ressources "appartement 1-2 pièces" (37 m² réf.) et
 * "appartement 3 pièces et +" (72 m² réf.) donnent une pente log-log —
 * exactement la même méthode que celle qui a produit la constante nationale,
 * appliquée commune par commune plutôt qu'agrégée.
 *
 * Ne s'applique QU'aux typologies appartement (`appartement`,
 * `appartement_t1_t2`, `appartement_t3_plus`) : une seule ressource "maison"
 * existe, aucune paire de points n'est mesurable pour ce marché, qui reste
 * sur la constante nationale (voir `sources/loyers.ts`, `depuisLigneBrute`).
 *
 * Mesuré à l'échelle nationale : ce correctif ne biaise PAS le calcul en
 * moyenne (effet net +0,0 % à +0,5 % selon la surface, sur les 34 900
 * communes) — il corrige les marchés où la pente locale diverge de la
 * médiane nationale, dans les deux sens, sans déplacer la médiane elle-même.
 */
function calculerElasticiteLocale(t12, t3) {
  const elasticite = {};
  for (const insee of Object.keys(t12)) {
    const a = t12[insee];
    const b = t3[insee];
    let e = ELASTICITE_NATIONALE;
    if (a && b && a[3] >= SEUIL_OBS_ELASTICITE && b[3] >= SEUIL_OBS_ELASTICITE && a[0] > 0 && b[0] > 0) {
      const brut = Math.log(b[0] / a[0]) / Math.log(72 / 37);
      if (brut >= BORNES_ELASTICITE[0] && brut <= BORNES_ELASTICITE[1]) e = brut;
    }
    elasticite[insee] = Math.round(e * 1000) / 1000;
  }
  return elasticite;
}

async function main() {
  console.log("Résolution et téléchargement des 4 ressources ANIL (data.gouv.fr)…");
  const annee = {};
  const out = { annee };
  const tables = {};
  for (const typologie of TYPOLOGIES) {
    const table = await downloadAndParse(typologie);
    annee[typologie] = table.annee;
    out[typologie] = table.parCommune;
    tables[typologie] = table.parCommune;
  }

  console.log("Calcul de l'élasticité de surface locale (par commune)…");
  const elasticiteLocale = calculerElasticiteLocale(tables.appartement_t1_t2, tables.appartement_t3_plus);
  const nbLocale = Object.values(elasticiteLocale).filter((e) => e !== ELASTICITE_NATIONALE).length;
  console.log(`  ${nbLocale} communes avec élasticité mesurée localement, ${Object.keys(elasticiteLocale).length - nbLocale} en repli national (${ELASTICITE_NATIONALE})`);
  out.elasticiteLocale = elasticiteLocale;

  const dest = new URL("../src/lib/anil_loyers.json", import.meta.url);
  await writeFile(dest, JSON.stringify(out));
  console.log(`\nÉcrit : src/lib/anil_loyers.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
