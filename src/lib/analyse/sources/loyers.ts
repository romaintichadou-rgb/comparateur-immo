/**
 * Source de faits réels : "Carte des loyers" (ANIL / ministère du Logement),
 * open data data.gouv.fr. Loyer d'annonce médian prédit au m² (hors charges)
 * par commune, avec intervalle de confiance et nombre d'observations. Marseille
 * est découpé par arrondissement avec le même code INSEE que celui renvoyé par
 * BAN (ex. 13207) → jointure directe.
 *
 * L'édition est résolue AUTOMATIQUEMENT sur l'année N-1 (repli N-2 si pas encore
 * publiée) : on interroge l'API data.gouv pour retrouver la ressource
 * "appartement" de l'année voulue, sans id figé dans le code. Le fichier (~5 Mo,
 * France entière) est ensuite parcouru pour extraire la seule ligne de la
 * commune ; le résultat est mis en cache dans analyse_ia (téléchargement une
 * seule fois par analyse).
 */

const DATAGOUV_API = "https://www.data.gouv.fr/api/1/datasets/";

export interface LoyerReference {
  /** Loyer d'annonce médian prédit, €/m² hors charges. */
  loyerM2: number;
  /** Bornes de l'intervalle de confiance (€/m² HC). */
  min: number;
  max: number;
  /** Nombre d'observations ayant servi à la prédiction (fiabilité). */
  nbObs: number;
  annee: number;
}

interface ResolvedResource {
  rid: string;
  annee: number;
}

// Cache de résolution (par process) pour éviter de réinterroger data.gouv.
let cachedResource: ResolvedResource | null = null;

/**
 * Résout la ressource CSV "Indicateurs de loyer appartement" (toutes surfaces)
 * pour l'édition N-1, sinon N-2. Retourne null si aucune édition trouvée.
 */
async function resolveResource(): Promise<ResolvedResource | null> {
  if (cachedResource) return cachedResource;

  const currentYear = new Date().getFullYear();
  for (const annee of [currentYear - 1, currentYear - 2]) {
    const rid = await findAppartementResource(annee);
    if (rid) {
      cachedResource = { rid, annee };
      return cachedResource;
    }
  }
  return null;
}

async function findAppartementResource(annee: number): Promise<string | null> {
  const raw = await fetchJson(`${DATAGOUV_API}?q=${encodeURIComponent(`carte des loyers ${annee}`)}&page_size=5`);
  const datasets = (raw?.data ?? []) as Array<{ title?: string; resources?: Array<{ id?: string; title?: string }> }>;
  for (const ds of datasets) {
    if (!ds.title?.includes(String(annee))) continue;
    // Ressource "toutes surfaces" : le titre finit par "appartement" (les
    // déclinaisons se terminent par "1 ou 2 pièces" / "3 pièces ou plus").
    const res = (ds.resources ?? []).find((r) => /appartement\s*$/i.test(r.title ?? ""));
    if (res?.id) return res.id;
  }
  return null;
}

// Le CSV fait ~5 Mo pour la France entière : on ne le télécharge et parse
// qu'UNE fois par process, indexé par code INSEE — les analyses suivantes
// (autre bien, relance) lisent la table en mémoire. La promesse est mise en
// cache (et pas seulement le résultat) pour dédupliquer des analyses
// concurrentes ; elle est invalidée en cas d'échec pour permettre un retry.
let cachedTable: Promise<{ annee: number; parCommune: Map<string, LoyerReference> } | null> | null = null;

function loadTable(): Promise<{ annee: number; parCommune: Map<string, LoyerReference> } | null> {
  if (!cachedTable) {
    cachedTable = doLoadTable().then((table) => {
      if (!table) cachedTable = null; // échec → pas de cache, retry possible
      return table;
    });
  }
  return cachedTable;
}

async function doLoadTable(): Promise<{ annee: number; parCommune: Map<string, LoyerReference> } | null> {
  const resource = await resolveResource();
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
    parCommune.set(insee, {
      loyerM2: round1(loyerM2),
      min: round1(num(cols[7]) ?? loyerM2),
      max: round1(num(cols[8]) ?? loyerM2),
      nbObs: Math.round(num(cols[10]) ?? 0),
      annee: resource.annee,
    });
  }
  return { annee: resource.annee, parCommune };
}

export async function fetchLoyerReference(codeInsee: string): Promise<LoyerReference | null> {
  if (!codeInsee) return null;
  const table = await loadTable();
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
  fallbackCodeInsee: string
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

  const table = await loadTable();
  if (!table) return null;

  const refs = uniqueCodes
    .map((code) => table.parCommune.get(code))
    .filter((r): r is LoyerReference => r != null);

  if (refs.length === 0) return null;
  if (refs.length === 1) return { ref: refs[0], nbCommunes: 1 };

  const totalObs = refs.reduce((s, r) => s + r.nbObs, 0);
  return {
    ref: {
      loyerM2: round1(refs.reduce((s, r) => s + r.loyerM2 * r.nbObs, 0) / totalObs),
      min: round1(Math.min(...refs.map((r) => r.min))),
      max: round1(Math.max(...refs.map((r) => r.max))),
      nbObs: totalObs,
      annee: refs[0].annee,
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
