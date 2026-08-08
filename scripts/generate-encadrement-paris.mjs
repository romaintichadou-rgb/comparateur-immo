/**
 * Génère `src/lib/encadrement_paris.json` — plafonds légaux de l'encadrement
 * des loyers à Paris (open data ville de Paris), figés au build. Même
 * rationale que `anil_loyers.json`/`taux_tfpb_communes.json` : donnée
 * publiée une fois par an, pas de stockage persistant en prod (fonctions
 * serverless Vercel) pour amortir un refresh au runtime.
 *
 * Contexte (audit P1, docs/reference/estimation-loyer-charges.md) :
 * l'estimation de loyer ignorait que Paris (comme Lille, Lyon,
 * Montpellier...) plafonne légalement les loyers — l'app le savait déjà en
 * texte (`recommandations.ts`, « Vérifie l'encadrement ») mais ne l'utilisait
 * jamais comme donnée de calcul. Ce script ajoute CE plafond, en repli sur
 * l'ANIL (jamais à la place) — voir `encadrementLoyers.ts`.
 *
 * Source : opendata.paris.fr, dataset "logement-encadrement-des-loyers"
 * (Direction du Logement et de l'Habitat). 80 quartiers administratifs ×
 * 4 tranches de pièces (1/2/3/4 et plus) × 4 époques de construction ×
 * 2 statuts meublé/non meublé, publiés annuellement.
 *
 * ⚠️ **Agrégation à l'ARRONDISSEMENT, pas au quartier administratif** :
 * `input.quartier` (saisi par l'utilisateur ou extrait d'une annonce) est un
 * nom de quartier INFORMEL ("Canal Saint-Martin"), pas l'un des 80 noms
 * OFFICIELS de ce dataset ("Hôpital-Saint-Louis"...) — les faire correspondre
 * demanderait une résolution géographique (point dans polygone via
 * `geo_shape`) hors du périmètre de ce premier lot. On agrège donc au niveau
 * de l'arrondissement (`code_postal`, déjà connu précisément) en prenant le
 * MAX des maximums et le MIN des minimums des quartiers qui le composent —
 * le plafond le plus PERMISSIF disponible sans connaître le quartier exact,
 * pour ne jamais signaler à tort un loyer légal comme hors plafond.
 *
 * Usage : `node scripts/generate-encadrement-paris.mjs`
 * Procédure de rafraîchissement annuel : voir
 * docs/reference/estimation-loyer-charges.md.
 */
import { writeFile } from "node:fs/promises";

const API_BASE = "https://opendata.paris.fr/api/records/1.0/search/";
const DATASET = "logement-encadrement-des-loyers";

/** `epoque` brut (dataset) → clé stable utilisée dans le JSON généré. */
const EPOQUE_KEY = {
  "Avant 1946": "avant_1946",
  "1946-1970": "de_1946_a_1970",
  "1971-1990": "de_1971_a_1990",
  "Apres 1990": "apres_1990",
};

const MEUBLE_KEY = {
  "meublé": "meuble",
  "non meublé": "non_meuble",
};

async function fetchAnnee(annee) {
  const url = `${API_BASE}?dataset=${DATASET}&rows=2560&refine.annee=${annee}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

/** Dernière année disponible : tente `annee`, repli sur `annee - 1` si vide (édition pas encore publiée). */
async function fetchDerniereAnnee() {
  const now = new Date().getFullYear();
  for (const annee of [now, now - 1, now - 2]) {
    const data = await fetchAnnee(annee);
    if (data.nhits > 0) return { annee, records: data.records };
  }
  throw new Error("Aucune donnée d'encadrement des loyers trouvée sur les 3 dernières années.");
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

async function main() {
  const { annee, records } = await fetchDerniereAnnee();
  console.log(`Édition ${annee} : ${records.length} lignes.`);

  // arrondissement (ex. "75010") → piece (1-4) → epoque_key → meuble_key → {ref,min,max,nbQuartiers}
  const parArrondissement = {};

  for (const rec of records) {
    const f = rec.fields;
    const codeGrandQuartier = String(f.code_grand_quartier ?? "");
    if (codeGrandQuartier.length !== 7) continue; // format inattendu, on ignore plutôt que de deviner
    // Format vérifié sur des cas connus : "75" + "1" + arrondissement(2) +
    // quartier_local(2) — ex. 7510311 = 75 · 1 · 03 (Archives, 3e) · 11.
    const arr = `750${codeGrandQuartier.slice(3, 5)}`;
    const epoqueKey = EPOQUE_KEY[f.epoque];
    const meubleKey = MEUBLE_KEY[f.meuble_txt];
    if (!epoqueKey || !meubleKey) continue;
    const piece = String(f.piece);

    parArrondissement[arr] ??= {};
    parArrondissement[arr][piece] ??= {};
    parArrondissement[arr][piece][epoqueKey] ??= {};
    const slot = (parArrondissement[arr][piece][epoqueKey][meubleKey] ??= {
      refs: [],
      min: Infinity,
      max: -Infinity,
    });
    slot.refs.push(f.ref);
    slot.min = Math.min(slot.min, f.min);
    slot.max = Math.max(slot.max, f.max);
  }

  const arrondissements = {};
  for (const [arr, parPiece] of Object.entries(parArrondissement)) {
    arrondissements[arr] = {};
    for (const [piece, parEpoque] of Object.entries(parPiece)) {
      arrondissements[arr][piece] = {};
      for (const [epoque, parMeuble] of Object.entries(parEpoque)) {
        arrondissements[arr][piece][epoque] = {};
        for (const [meuble, slot] of Object.entries(parMeuble)) {
          const refMoyen = slot.refs.reduce((s, v) => s + v, 0) / slot.refs.length;
          // Tableau [ref, min, max] — même convention que anil_loyers.json,
          // pour ne pas répéter les noms de champs sur ~640 combinaisons.
          arrondissements[arr][piece][epoque][meuble] = [
            round1(refMoyen),
            round1(slot.min),
            round1(slot.max),
          ];
        }
      }
    }
  }

  const output = { annee, arrondissements };
  const path = new URL("../src/lib/encadrement_paris.json", import.meta.url);
  await writeFile(path, JSON.stringify(output), "utf-8");
  console.log(`Écrit : ${path.pathname} (${Object.keys(arrondissements).length} arrondissements)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
