/**
 * Source de faits réels : OpenStreetMap via l'API Overpass. Compte les points
 * d'intérêt réels autour du bien (transports, éducation, commerces) dans un
 * rayon donné — indicateur d'attractivité locative et de profil de locataire
 * (proximité facs/transports = étudiants/jeunes actifs). Fournit aussi, pour
 * le bloc "Quartier" : la gare ferroviaire la plus proche (accessibilité
 * grandes lignes), l'occupation du sol (caractère résidentiel vs zone
 * d'activité), et la vie de quartier (sorties, espaces verts, écoles,
 * santé) — toujours à partir de tags OSM réels, jamais estimé.
 *
 * TOUT est récupéré en UNE SEULE requête Overpass unionnée (fetchOsmBundle) :
 * Overpass est une API publique souvent lente ou saturée, et c'était le poste
 * de latence dominant de l'analyse quand chaque catégorie faisait sa propre
 * requête (4 requêtes × miroirs de secours × timeouts). Chaque sélecteur de
 * l'union garde son propre rayon ; au classement des résultats, une garde de
 * distance par catégorie évite qu'un élément ramené par un sélecteur à grand
 * rayon (ex. gare à 20 km) ne soit compté dans une catégorie à petit rayon.
 * L'appel reste défensif : échec sur tous les miroirs → null, non bloquant.
 */

import { memoAsync } from "./memo";

// Miroirs Overpass essayés dans l'ordre (fallback si l'un est saturé/lent).
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

const RAYON_M = 800;
const RAYON_SORTIES_M = 600;
const RAYON_PARCS_M = 1000;
const RAYON_LANDUSE_M = 1000;
const RAYON_GARE_M = 20000;

export interface Commodites {
  transports: number;
  education: number;
  commerces: number;
  rayonM: number;
}

/** Gare ferroviaire (grandes lignes) la plus proche — accessibilité du quartier. */
export interface GareInfo {
  nom: string;
  distanceKm: number;
}

/** Occupation du sol autour du bien — caractère résidentiel vs zone d'activité. */
export interface LanduseInfo {
  residentiel: number;
  activite: number;
  autre: number;
  total: number;
}

export interface VieQuartierInfo {
  restaurants: number;
  barsEtCafes: number;
  parcs: number;
  parcLePlusProcheKm: number | null;
  ecoles: string[];
  sante: number;
  rayonSortiesM: number;
  rayonParcsM: number;
}

export interface OsmBundle {
  commodites: Commodites;
  gare: GareInfo | null;
  landuse: LanduseInfo;
  vieQuartier: VieQuartierInfo;
}

export const fetchOsmBundle = memoAsync(
  fetchOsmBundleRaw,
  (lat, lon) => `${lat.toFixed(4)},${lon.toFixed(4)}`,
  (r) => r != null
);

async function fetchOsmBundleRaw(lat: number, lon: number): Promise<OsmBundle | null> {
  const at = (r: number) => `(around:${r},${lat},${lon})`;
  // `out center` (et pas `out tags`) : les nodes gardent leurs coordonnées et
  // les ways reçoivent un centre — nécessaires aux gardes de distance et au
  // calcul de la gare/du parc le plus proche.
  const query =
    `[out:json][timeout:25];(` +
    `node${at(RAYON_M)}[public_transport];` +
    `node${at(RAYON_M)}[highway=bus_stop];` +
    `node${at(RAYON_M)}[amenity~"school|university|college"];` +
    `node${at(RAYON_M)}[shop];` +
    `node${at(RAYON_M)}[amenity~"pharmacy|doctors|clinic|hospital"];` +
    `node${at(RAYON_SORTIES_M)}[amenity~"restaurant|fast_food"];` +
    `node${at(RAYON_SORTIES_M)}[amenity~"bar|pub|cafe"];` +
    `node${at(RAYON_PARCS_M)}[leisure~"park|garden"];` +
    `way${at(RAYON_PARCS_M)}[leisure~"park|garden"];` +
    `way${at(RAYON_LANDUSE_M)}[landuse];` +
    `node${at(RAYON_GARE_M)}[railway=station][station!~"subway|light_rail"];` +
    `);out center;`;

  for (const endpoint of ENDPOINTS) {
    const els = await queryOverpass(endpoint, query);
    if (!els) continue; // ce miroir a échoué → on tente le suivant
    return classify(els, lat, lon);
  }
  return null;
}

function classify(els: OverpassElement[], lat: number, lon: number): OsmBundle {
  let transports = 0;
  let education = 0;
  let commerces = 0;
  let restaurants = 0;
  let barsEtCafes = 0;
  let parcs = 0;
  let sante = 0;
  let landuseRes = 0;
  let landuseAct = 0;
  let landuseAutre = 0;
  let parcLePlusProcheKm: number | null = null;
  let gare: GareInfo | null = null;
  const ecolesSet = new Set<string>();

  for (const e of els) {
    const t = e.tags ?? {};
    const pos = elementLatLon(e);
    const dKm = pos ? haversineKm(lat, lon, pos.lat, pos.lon) : null;
    const within = (rayonM: number) => dKm != null && dKm <= rayonM / 1000;

    // Gare : indépendante des autres catégories (rayon large), on garde la
    // plus proche. Un même node peut aussi compter comme "transport" s'il
    // est dans le petit rayon — même comportement que les anciennes
    // requêtes séparées.
    if (t.railway === "station" && !/subway|light_rail/.test(t.station ?? "") && dKm != null) {
      if (!gare || dKm < gare.distanceKm) {
        gare = { nom: t.name || "Gare", distanceKm: Math.round(dKm * 10) / 10 };
      }
    }

    // Écoles nommées (liste du bloc Quartier) — indépendant du comptage.
    if (t.amenity === "school" && t.name && within(RAYON_M)) ecolesSet.add(t.name);

    // Occupation du sol : seuls les ways du sélecteur [landuse] portent ce tag.
    if (t.landuse) {
      if (t.landuse === "residential") landuseRes++;
      else if (t.landuse === "commercial" || t.landuse === "retail" || t.landuse === "industrial") landuseAct++;
      else landuseAutre++;
      continue;
    }

    // Comptages par catégorie, chacun borné à son rayon d'origine.
    if ((t.public_transport || t.highway === "bus_stop") && within(RAYON_M)) transports++;
    else if (t.amenity && /school|university|college/.test(t.amenity) && within(RAYON_M)) education++;
    else if ((t.amenity === "restaurant" || t.amenity === "fast_food") && within(RAYON_SORTIES_M)) restaurants++;
    else if ((t.amenity === "bar" || t.amenity === "pub" || t.amenity === "cafe") && within(RAYON_SORTIES_M)) barsEtCafes++;
    else if (t.amenity && /pharmacy|doctors|clinic|hospital/.test(t.amenity) && within(RAYON_M)) sante++;
    else if ((t.leisure === "park" || t.leisure === "garden") && within(RAYON_PARCS_M)) {
      parcs++;
      if (dKm != null && (parcLePlusProcheKm == null || dKm < parcLePlusProcheKm)) {
        parcLePlusProcheKm = Math.round(dKm * 10) / 10;
      }
    } else if (t.shop && within(RAYON_M)) commerces++;
  }

  return {
    commodites: { transports, education, commerces, rayonM: RAYON_M },
    gare,
    landuse: {
      residentiel: landuseRes,
      activite: landuseAct,
      autre: landuseAutre,
      total: landuseRes + landuseAct + landuseAutre,
    },
    vieQuartier: {
      restaurants,
      barsEtCafes,
      parcs,
      parcLePlusProcheKm,
      ecoles: Array.from(ecolesSet).slice(0, 4),
      sante,
      rayonSortiesM: RAYON_SORTIES_M,
      rayonParcsM: RAYON_PARCS_M,
    },
  };
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
  const timer = setTimeout(() => controller.abort(), 27000);
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

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
