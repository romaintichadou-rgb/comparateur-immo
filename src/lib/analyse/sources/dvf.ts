/**
 * Source de faits réels : DVF+ (Demandes de Valeurs Foncières) via l'API
 * open data du Cerema. Transactions immobilières réelles (DGFiP) depuis 2014.
 *
 * L'API renvoie les mutations du plus ANCIEN au plus récent et n'honore pas le
 * tri décroissant : on cible donc directement deux fenêtres temporelles via le
 * filtre `anneemut_min/max` — une fenêtre récente (prix de marché actuel) et
 * une fenêtre ancienne 2014-2016 (base de comparaison pour la tendance ~10 ans).
 * On ne garde que les mutations "un appartement" (codtypbien 121) et on calcule
 * des médianes de prix/m², robustes aux valeurs aberrantes. Aucune estimation.
 */

const BASE = "https://apidf-preprod.cerema.fr/dvf_opendata/geomutations/";
const RAYON_M = 500;
const MAX_PAGES = 4; // borne par fenêtre (500 mutations/page)
const PM2_MIN = 300; // garde anti-aberrations (viager, nue-propriété, erreurs)
const PM2_MAX = 30000;
const ANCIEN_MIN = 2014;
const ANCIEN_MAX = 2016;

interface Vente {
  prixM2: number;
  surface: number;
}

export interface DvfData {
  nbVentesRecent: number;
  /** Volume total de ventes d'appartements récentes (avant filtre surface). */
  nbVentesTotal: number;
  /** Base de comparaison retenue pour la médiane récente (surface). */
  baseComparaison: string;
  recentMin: number | null;
  recentMax: number | null;
  /** Médiane prix/m² récente (surfaces comparables si assez d'échantillons). */
  medianeRecente: number | null;
  medianeAncienne: number | null;
  ancienMin: number | null;
  ancienMax: number | null;
  /** Évolution % entre la fenêtre ancienne et la fenêtre récente. */
  evolutionPct: number | null;
}

interface Feature {
  properties: { valeurfonc?: string; sbati?: string };
}

export async function fetchDvf(params: {
  lat: number;
  lon: number;
  surface: number | null;
}): Promise<DvfData> {
  const { lat, lon, surface } = params;
  const dLat = RAYON_M / 111000;
  const dLon = RAYON_M / (111000 * Math.cos((lat * Math.PI) / 180));
  const bbox = `${lon - dLon},${lat - dLat},${lon + dLon},${lat + dLat}`;

  // Fenêtre récente : 3 dernières années glissantes (inclut l'année en cours,
  // souvent vide selon le décalage de publication DVF — sans conséquence).
  const currentYear = new Date().getFullYear();
  const recentMinTarget = currentYear - 2;

  const [recentesVentes, anciennesVentes] = await Promise.all([
    fetchWindow(bbox, recentMinTarget, currentYear),
    fetchWindow(bbox, ANCIEN_MIN, ANCIEN_MAX),
  ]);

  // Marché actuel : l'effet de taille fausse la comparaison (un petit logement
  // a structurellement un prix/m² plus élevé). On compare donc à surface
  // proche : d'abord ±20 % de la surface du bien, repli ±40 % si trop peu de
  // ventes, sinon toutes surfaces (base affichée pour transparence).
  let baseRecente = recentesVentes;
  let baseComparaison = "toutes surfaces";
  if (surface != null && surface > 0) {
    const strict = recentesVentes.filter((v) => Math.abs(v.surface - surface) <= surface * 0.2);
    const large = recentesVentes.filter((v) => Math.abs(v.surface - surface) <= surface * 0.4);
    if (strict.length >= 8) {
      baseRecente = strict;
      baseComparaison = `surface ${Math.round(surface * 0.8)}–${Math.round(surface * 1.2)} m²`;
    } else if (large.length >= 8) {
      baseRecente = large;
      baseComparaison = `surface ${Math.round(surface * 0.6)}–${Math.round(surface * 1.4)} m²`;
    }
  }

  const medianeRecente = baseRecente.length >= 3 ? Math.round(median(baseRecente.map((v) => v.prixM2))) : null;
  const medianeAncienne = anciennesVentes.length >= 3 ? Math.round(median(anciennesVentes.map((v) => v.prixM2))) : null;

  const evolutionPct =
    medianeRecente != null && medianeAncienne != null && medianeAncienne > 0
      ? Math.round(((medianeRecente - medianeAncienne) / medianeAncienne) * 100)
      : null;

  return {
    nbVentesRecent: baseRecente.length,
    nbVentesTotal: recentesVentes.length,
    baseComparaison,
    recentMin: recentMinTarget,
    recentMax: currentYear,
    medianeRecente,
    medianeAncienne,
    ancienMin: ANCIEN_MIN,
    ancienMax: ANCIEN_MAX,
    evolutionPct,
  };
}

async function fetchWindow(bbox: string, anMin: number, anMax: number): Promise<Vente[]> {
  let url: string | null =
    `${BASE}?in_bbox=${bbox}&codtypbien=121&anneemut_min=${anMin}&anneemut_max=${anMax}` +
    `&page_size=500&fields=valeurfonc,sbati`;

  const ventes: Vente[] = [];
  for (let page = 0; page < MAX_PAGES && url; page++) {
    const raw: { features?: Feature[]; next?: string | null } | null = await fetchJson(url);
    if (!raw) break;
    for (const f of raw.features ?? []) {
      const surface = Number(f.properties.sbati);
      const valeur = Number(f.properties.valeurfonc);
      if (!surface || !valeur) continue;
      const prixM2 = valeur / surface;
      if (prixM2 < PM2_MIN || prixM2 > PM2_MAX) continue;
      ventes.push({ prixM2, surface });
    }
    url = raw.next ?? null;
  }
  return ventes;
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function fetchJson(
  url: string,
  timeoutMs = 15000
): Promise<{ features?: Feature[]; next?: string | null } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as { features?: Feature[]; next?: string | null };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
