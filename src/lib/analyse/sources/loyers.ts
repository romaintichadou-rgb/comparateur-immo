/**
 * Source de faits réels : "Carte des loyers" (ANIL / ministère du Logement),
 * open data data.gouv.fr. Marseille est découpé par arrondissement avec le même
 * code INSEE que celui renvoyé par BAN (ex. 13207) → jointure directe.
 *
 * ⚠️ **`loypredm2` est CHARGES COMPRISES**, pour un logement de référence NON
 * MEUBLÉ. La note méthodologique officielle l'écrit noir sur blanc (« Les
 * indicateurs de loyers proviennent de prédictions de loyers […] et sont
 * charges comprises ») et précise que la base « ne permet pas de distinguer le
 * loyer et les provisions pour charges locatives ». Le commentaire de ce
 * fichier a longtemps annoncé « hors charges », ce qui a fait ajouter une
 * provision par-dessus dans tout le calcul de loyer — un double comptage de
 * +5 % à +12 %. Ne pas réintroduire de provision : voir `anilReference.ts`.
 *
 * ⚠️ `min`/`max` ne sont PAS un intervalle de confiance sur la moyenne mais un
 * intervalle de PRÉDICTION à 95 % sur les logements individuels : sa largeur
 * (~45 points, soit −20 %/+25 %) est constante quel que soit le nombre
 * d'observations (vérifié sur les 34 960 communes). Il décrit donc bien la
 * dispersion réelle du parc, et non l'incertitude statistique.
 *
 * L'édition est résolue AUTOMATIQUEMENT sur l'année N-1 (repli N-2 si pas encore
 * publiée) : on interroge l'API data.gouv pour retrouver la ressource voulue,
 * sans id figé dans le code. Chaque fichier (~5 Mo, France entière) est ensuite
 * parcouru pour extraire la seule ligne de la commune.
 */

import type { TypologieAnil } from "@/lib/anilReference";

const DATAGOUV_API = "https://www.data.gouv.fr/api/1/datasets/";

export interface LoyerReference {
  /** Loyer d'annonce médian prédit, €/m² **charges comprises**, non meublé. */
  loyerM2: number;
  /** Bornes de l'intervalle de prédiction à 95 % (€/m² CC, non meublé). */
  min: number;
  max: number;
  /** Nombre d'observations ayant servi à la prédiction (fiabilité). */
  nbObs: number;
  annee: number;
  /**
   * Niveau de maille sur lequel la prédiction a réellement été faite —
   * colonne `TYPPRED` du CSV, capturée ici (3.4) après avoir été jetée : sur
   * 85,4 % des communes, la prédiction ne vient PAS de la commune elle-même
   * mais d'un groupe de communes jugées similaires (`maille`, < 100 annonces
   * communales). `commune` = prédite au niveau communal (≥ 100 annonces,
   * ou par arrondissement pour Paris/Lyon/Marseille) ; `epci` = au niveau de
   * l'intercommunalité. La note ANIL recommande explicitement la prudence en
   * dessous de 30 observations, quel que soit le niveau.
   */
  niveauPrediction: "commune" | "epci" | "maille";
}

/**
 * Motif de titre de chaque ressource publiée.
 *
 * ⚠️ Ancré sur la FIN du titre, jamais sur son début : l'ANIL alterne
 * « Indicateurs de loyer … » et « Indicateur de loyer … » (singulier) d'une
 * ressource à l'autre. Et « appartement » doit rester ancré en fin de chaîne,
 * sans quoi il capterait aussi « appartement de 1 ou 2 pièces ».
 */
const MOTIF_RESSOURCE: Record<TypologieAnil, RegExp> = {
  appartement: /appartement\s*$/i,
  appartement_t1_t2: /1\s*ou\s*2\s*pi[eè]ces\s*$/i,
  appartement_t3_plus: /3\s*pi[eè]ces\s*ou\s*plus\s*$/i,
  maison: /maison\s*$/i,
};

interface ResolvedResource {
  rid: string;
  annee: number;
}

// Cache de résolution PAR TYPOLOGIE (par process) : quatre ressources
// distinctes, chacune résolue et téléchargée au plus une fois.
const cachedResources = new Map<TypologieAnil, ResolvedResource>();

/**
 * Résout la ressource CSV d'une typologie pour l'édition N-1, sinon N-2.
 * Retourne null si aucune édition trouvée.
 */
async function resolveResource(typologie: TypologieAnil): Promise<ResolvedResource | null> {
  const cached = cachedResources.get(typologie);
  if (cached) return cached;

  const currentYear = new Date().getFullYear();
  for (const annee of [currentYear - 1, currentYear - 2]) {
    const rid = await findResource(annee, typologie);
    if (rid) {
      const resolved = { rid, annee };
      cachedResources.set(typologie, resolved);
      return resolved;
    }
  }
  return null;
}

async function findResource(annee: number, typologie: TypologieAnil): Promise<string | null> {
  const raw = await fetchJson(`${DATAGOUV_API}?q=${encodeURIComponent(`carte des loyers ${annee}`)}&page_size=5`);
  const datasets = (raw?.data ?? []) as Array<{ title?: string; resources?: Array<{ id?: string; title?: string }> }>;
  const motif = MOTIF_RESSOURCE[typologie];
  for (const ds of datasets) {
    if (!ds.title?.includes(String(annee))) continue;
    const res = (ds.resources ?? []).find((r) => motif.test(r.title ?? ""));
    if (res?.id) return res.id;
  }
  return null;
}

type Table = { annee: number; parCommune: Map<string, LoyerReference> };

// Chaque CSV fait ~5 Mo pour la France entière : on ne le télécharge et parse
// qu'UNE fois par process ET PAR TYPOLOGIE, indexé par code INSEE — les
// analyses suivantes (autre bien, relance) lisent la table en mémoire. La
// promesse est mise en cache (et pas seulement le résultat) pour dédupliquer
// des analyses concurrentes ; elle est invalidée en cas d'échec pour permettre
// un retry.
const cachedTables = new Map<TypologieAnil, Promise<Table | null>>();

function loadTable(typologie: TypologieAnil): Promise<Table | null> {
  const existing = cachedTables.get(typologie);
  if (existing) return existing;
  const p = doLoadTable(typologie).then((table) => {
    if (!table) cachedTables.delete(typologie); // échec → pas de cache, retry possible
    return table;
  });
  cachedTables.set(typologie, p);
  return p;
}

async function doLoadTable(typologie: TypologieAnil): Promise<Table | null> {
  const resource = await resolveResource(typologie);
  if (!resource) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let text: string;
  try {
    const res = await fetch(`https://www.data.gouv.fr/fr/datasets/r/${resource.rid}`, { signal: controller.signal });
    if (!res.ok) return null;
    text = await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  // Colonnes : id_zone;INSEE_C;LIBGEO;EPCI;DEP;REG;loypredm2;lwr.IPm2;upr.IPm2;
  //            TYPPRED;nbobs_com;nbobs_mail;R2_adj  (séparateur ";", décimale ",")
  const parCommune = new Map<string, LoyerReference>();
  const lines = text.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";").map((c) => c.replace(/^"|"$/g, ""));
    const insee = cols[1];
    if (!insee) continue;
    const loyerM2 = num(cols[6]);
    if (loyerM2 == null) continue;
    const typpred = cols[9];
    parCommune.set(insee, {
      loyerM2: round1(loyerM2),
      min: round1(num(cols[7]) ?? loyerM2),
      max: round1(num(cols[8]) ?? loyerM2),
      nbObs: Math.round(num(cols[10]) ?? 0),
      annee: resource.annee,
      niveauPrediction: typpred === "commune" || typpred === "epci" ? typpred : "maille",
    });
  }
  return { annee: resource.annee, parCommune };
}

export async function fetchLoyerReference(
  codeInsee: string,
  typologie: TypologieAnil
): Promise<LoyerReference | null> {
  if (!codeInsee) return null;
  const table = await loadTable(typologie);
  return table?.parCommune.get(codeInsee) ?? null;
}

const RAYON_LOCAL = 500;

/**
 * Loyer de référence « local » dans un rayon de ~500 m autour du bien.
 * On reverse-géocode 5 points (centre + 4 cardinaux à 500 m) via la BAN
 * pour identifier les communes/arrondissements traversés, puis on calcule
 * une moyenne pondérée par nombre d'observations des loyers ANIL.
 * Si une seule commune ressort (cas courant hors PLM), le résultat est
 * identique à fetchLoyerReference. Retourne aussi le nombre de communes
 * agrégées pour adapter le libellé UI.
 */
export async function fetchLoyerReferenceLocal(
  lat: number,
  lon: number,
  fallbackCodeInsee: string,
  typologie: TypologieAnil
): Promise<{ ref: LoyerReference; nbCommunes: number } | null> {
  const dLat = RAYON_LOCAL / 111000;
  const dLon = RAYON_LOCAL / (111000 * Math.cos((lat * Math.PI) / 180));

  const points: [number, number][] = [
    [lat, lon],
    [lat + dLat, lon],
    [lat - dLat, lon],
    [lat, lon + dLon],
    [lat, lon - dLon],
  ];

  const codes = await Promise.all(points.map(([la, lo]) => reverseGeoCodeInsee(la, lo)));
  const uniqueCodes = [...new Set(codes.filter((c): c is string => c != null))];
  if (uniqueCodes.length === 0 && fallbackCodeInsee) uniqueCodes.push(fallbackCodeInsee);

  const table = await loadTable(typologie);
  if (!table) return null;

  const refs = uniqueCodes
    .map((code) => table.parCommune.get(code))
    .filter((r): r is LoyerReference => r != null);

  if (refs.length === 0) return null;
  if (refs.length === 1) return { ref: refs[0], nbCommunes: 1 };

  const totalObs = refs.reduce((s, r) => s + r.nbObs, 0);
  // Fiabilité de l'agrégat = la PIRE des communes combinées (conservateur) :
  // mélanger une commune fiable avec une "maille" ne rend pas le résultat
  // plus fiable que son maillon le plus faible.
  const RANG_FIABILITE = { commune: 2, epci: 1, maille: 0 } as const;
  const niveauPrediction = refs.reduce<LoyerReference["niveauPrediction"]>(
    (pire, r) => (RANG_FIABILITE[r.niveauPrediction] < RANG_FIABILITE[pire] ? r.niveauPrediction : pire),
    refs[0].niveauPrediction
  );
  return {
    ref: {
      loyerM2: round1(refs.reduce((s, r) => s + r.loyerM2 * r.nbObs, 0) / totalObs),
      min: round1(Math.min(...refs.map((r) => r.min))),
      max: round1(Math.max(...refs.map((r) => r.max))),
      nbObs: totalObs,
      annee: refs[0].annee,
      niveauPrediction,
    },
    nbCommunes: refs.length,
  };
}

async function reverseGeoCodeInsee(lat: number, lon: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      `https://api-adresse.data.gouv.fr/reverse/?lon=${lon}&lat=${lat}&limit=1`,
      { signal: controller.signal, headers: { "User-Agent": "comparateur-locatif-perso/1.0" } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{ properties?: { citycode?: string } }>;
    };
    return data.features?.[0]?.properties?.citycode ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url: string, timeoutMs = 12000): Promise<{ data?: unknown[] } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as { data?: unknown[] };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function num(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
