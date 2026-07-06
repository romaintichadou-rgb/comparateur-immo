/**
 * Source de faits réels : OpenStreetMap via l'API Overpass. Compte les points
 * d'intérêt réels autour du bien (transports, éducation, commerces) dans un
 * rayon donné — indicateur d'attractivité locative et de profil de locataire
 * (proximité facs/transports = étudiants/jeunes actifs). Fournit aussi, pour
 * le bloc "Quartier" : la gare ferroviaire la plus proche (accessibilité
 * grandes lignes) et l'occupation du sol (caractère résidentiel vs zone
 * d'activité), toujours à partir de tags OSM réels — jamais estimé.
 *
 * Overpass est une API publique gratuite souvent lente ou saturée : on essaie
 * plusieurs serveurs miroirs à la suite jusqu'à en trouver un qui répond, et
 * l'appel reste défensif (échec sur tous → null, non bloquant).
 */

// Miroirs Overpass essayés dans l'ordre (fallback si l'un est saturé/lent).
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const RAYON_M = 800;

export interface Commodites {
  transports: number;
  education: number;
  commerces: number;
  rayonM: number;
}

export async function fetchCommodites(lat: number, lon: number): Promise<Commodites | null> {
  const query =
    `[out:json][timeout:20];(` +
    `node(around:${RAYON_M},${lat},${lon})[public_transport];` +
    `node(around:${RAYON_M},${lat},${lon})[highway=bus_stop];` +
    `node(around:${RAYON_M},${lat},${lon})[amenity~"school|university|college"];` +
    `node(around:${RAYON_M},${lat},${lon})[shop];` +
    `);out tags;`;

  for (const endpoint of ENDPOINTS) {
    const els = await queryOverpass(endpoint, query);
    if (!els) continue; // ce miroir a échoué → on tente le suivant

    let transports = 0;
    let education = 0;
    let commerces = 0;
    for (const e of els) {
      const t = e.tags ?? {};
      if (t.public_transport || t.highway === "bus_stop") transports++;
      else if (t.amenity && /school|university|college/.test(t.amenity)) education++;
      else if (t.shop) commerces++;
    }
    return { transports, education, commerces, rayonM: RAYON_M };
  }
  return null;
}

interface OverpassElement {
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  /** Présent sur les ways/relations quand la requête utilise `out center`. */
  center?: { lat: number; lon: number };
}

/** Coordonnées d'un élément Overpass, qu'il s'agisse d'un node (lat/lon
 * directs) ou d'un way/relation interrogé avec `out center`. */
function elementLatLon(e: OverpassElement): { lat: number; lon: number } | null {
  if (e.lat != null && e.lon != null) return { lat: e.lat, lon: e.lon };
  if (e.center) return e.center;
  return null;
}

async function queryOverpass(endpoint: string, query: string): Promise<OverpassElement[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 22000);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "comparateur-locatif-perso/1.0",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { elements?: OverpassElement[] };
    return json.elements ?? [];
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Gare ferroviaire (grandes lignes) la plus proche — accessibilité du quartier. */
export interface GareInfo {
  nom: string;
  distanceKm: number;
}

const RAYON_GARE_M = 20000;

export async function fetchGareProche(lat: number, lon: number): Promise<GareInfo | null> {
  // On exclut les stations de métro/tram (souvent aussi taguées railway=station
  // avec station=subway|light_rail) pour ne garder que les gares ferroviaires
  // classiques (potentiellement grandes lignes/TGV — OSM ne distingue pas ça
  // de façon fiable au niveau du nœud, donc on reste sur "gare" sans le
  // garantir explicitement).
  const query =
    `[out:json][timeout:20];` +
    `node(around:${RAYON_GARE_M},${lat},${lon})[railway=station][station!~"subway|light_rail"];` +
    `out;`;

  for (const endpoint of ENDPOINTS) {
    const els = await queryOverpass(endpoint, query);
    if (!els) continue; // ce miroir a échoué → on tente le suivant

    let nearest: GareInfo | null = null;
    for (const e of els) {
      if (e.lat == null || e.lon == null) continue;
      const d = haversineKm(lat, lon, e.lat, e.lon);
      if (!nearest || d < nearest.distanceKm) {
        nearest = { nom: e.tags?.name || "Gare", distanceKm: Math.round(d * 10) / 10 };
      }
    }
    return nearest;
  }
  return null;
}

/** Occupation du sol autour du bien — caractère résidentiel vs zone d'activité. */
export interface LanduseInfo {
  residentiel: number;
  activite: number;
  autre: number;
  total: number;
}

const RAYON_LANDUSE_M = 1000;

export async function fetchLanduse(lat: number, lon: number): Promise<LanduseInfo | null> {
  const query =
    `[out:json][timeout:20];` +
    `way(around:${RAYON_LANDUSE_M},${lat},${lon})[landuse];` +
    `out tags;`;

  for (const endpoint of ENDPOINTS) {
    const els = await queryOverpass(endpoint, query);
    if (!els) continue;

    let residentiel = 0;
    let activite = 0;
    let autre = 0;
    for (const e of els) {
      const lu = e.tags?.landuse;
      if (lu === "residential") residentiel++;
      else if (lu === "commercial" || lu === "retail" || lu === "industrial") activite++;
      else autre++;
    }
    return { residentiel, activite, autre, total: residentiel + activite + autre };
  }
  return null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
