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
 *
 * ⚠️ Interrogé en **GET** (`?data=`), pas en POST : le Data Cache de Next ne
 * mémorise que les GET/HEAD (voir `http.ts`). Overpass accepte les deux, et
 * cette requête est le poste de latence le plus lourd de l'analyse — c'est
 * celui qui a le plus à gagner à être caché.
 */

import { unstable_cache } from "next/cache";
import { CACHE_SOURCES_S, getJson } from "./http";

/**
 * Miroirs Overpass, du plus canonique au plus exotique.
 *
 * ⚠️ Ils ne sont PAS essayés en série. Mesuré sur un point de Marseille
 * (10 août 2026) : 7,6 s de 504 sur le premier, puis 40,8 s sur le deuxième
 * (coupés au timeout), puis 16,7 s de succès sur le troisième — soit ~51 s
 * pour une analyse qui tenait sinon en 20 s. La saturation d'un miroir public
 * est la NORME, pas l'incident : la traiter comme une exception faisait payer
 * son timeout à chaque analyse. Voir `courseMiroirs`.
 */
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

/**
 * Délai avant de doubler un miroir qui n'a pas encore répondu (requête
 * couverte / "hedged request"). Assez long pour qu'un miroir en forme réponde
 * seul — les succès mesurés arrivent entre 7 et 17 s, mais un cache chaud
 * répond en dessous de la seconde — assez court pour ne pas subir un timeout
 * complet avant d'essayer le suivant.
 */
const DELAI_MIROIR_MS = 4000;

/**
 * Timeout par miroir. 27 s auparavant : au-delà, on n'attend plus une réponse,
 * on attend un échec — et on le fait attendre à l'utilisateur. La course
 * ci-dessous rend ce plafond bien moins critique, puisqu'un miroir lent ne
 * bloque plus les autres.
 */
const TIMEOUT_MIROIR_MS = 12000;

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

/**
 * Bundle OSM autour d'un point, mémorisé sur le résultat CLASSÉ et non sur la
 * réponse HTTP.
 *
 * Cacher au niveau `fetch` (comme les autres sources) ne marcherait pas ici :
 * les trois miroirs sont trois URLs, donc trois entrées de cache distinctes.
 * L'analyse suivante repartirait du miroir 1 — le plus souvent saturé — et
 * n'atteindrait le miroir déjà caché qu'après deux délais de course. Mémoriser
 * le bundle rend le cache indifférent au miroir qui a répondu, et stocke
 * quelques centaines d'octets au lieu des ~450 Ko de la réponse brute.
 *
 * Coordonnées arrondies à 4 décimales (~11 m) : deux biens du même immeuble
 * partagent leur voisinage, inutile d'en refaire le tour.
 */
const bundleMemorise = unstable_cache(
  async (lat: number, lon: number): Promise<OsmBundle> => {
    const bundle = await fetchOsmBundleRaw(lat, lon);
    // Lever plutôt que renvoyer `null` : `unstable_cache` mémoriserait le
    // `null`, et une saturation passagère d'Overpass priverait le bien de son
    // bloc Quartier pour 30 jours. Une exception, elle, n'est pas mémorisée —
    // la relance suivante retente. Même intention que le prédicat `cacheable`
    // de l'ancien `memo.ts`.
    if (!bundle) throw new Error("Overpass indisponible sur tous les miroirs");
    return bundle;
  },
  ["osm-bundle"],
  { revalidate: CACHE_SOURCES_S }
);

export async function fetchOsmBundle(lat: number, lon: number): Promise<OsmBundle | null> {
  try {
    return await bundleMemorise(round4(lat), round4(lon));
  } catch {
    return null; // source non bloquante : le bloc Quartier s'affichera sans OSM
  }
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

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

  const els = await courseMiroirs(query);
  return els ? classify(els, lat, lon) : null;
}

/**
 * Course entre les miroirs : le premier démarre tout de suite, chaque suivant
 * n'est lancé que si aucun n'a encore répondu après `DELAI_MIROIR_MS`. Le
 * premier succès gagne et annule les autres.
 *
 * ⚠️ Ce n'est PAS un simple `Promise.any` sur les trois miroirs : lancer trois
 * requêtes de front à chaque analyse triplerait la charge qu'on impose à des
 * APIs publiques gratuites — pour rien, puisque le premier miroir répond seul
 * la plupart du temps. Le décalage fait qu'on ne paie ce coût que quand il
 * achète réellement quelque chose.
 */
async function courseMiroirs(query: string): Promise<OverpassElement[] | null> {
  const abandon = new AbortController();

  const tentatives = ENDPOINTS.map(async (endpoint, i) => {
    if (i > 0) await attendre(i * DELAI_MIROIR_MS, abandon.signal);
    // Un miroir plus rapide a déjà répondu pendant l'attente : ne pas partir.
    if (abandon.signal.aborted) throw new Error("miroir doublé");
    const els = await queryOverpass(endpoint, query, abandon.signal);
    // `Promise.any` ne retient que les promesses TENUES : un miroir en échec
    // doit rejeter, pas résoudre sur `null` — sinon le premier échec gagnerait
    // la course.
    if (!els) throw new Error(`miroir indisponible : ${endpoint}`);
    return els;
  });

  try {
    return await Promise.any(tentatives);
  } catch {
    return null; // tous les miroirs ont échoué
  } finally {
    // Succès comme échec : libère les requêtes encore en vol et les minuteries
    // d'attente, pour ne pas garder la fonction serverless éveillée.
    abandon.abort();
  }
}

/** `setTimeout` annulable — la minuterie est libérée dès que la course est finie. */
function attendre(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
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

async function queryOverpass(
  endpoint: string,
  query: string,
  signal: AbortSignal
): Promise<OverpassElement[] | null> {
  const json = await getJson<{ elements?: OverpassElement[] }>(
    `${endpoint}?data=${encodeURIComponent(query)}`,
    {
      timeoutMs: TIMEOUT_MIROIR_MS,
      revalidate: CACHE_SOURCES_S,
      headers: { "User-Agent": "comparateur-locatif-perso/1.0" },
      signal,
    }
  );
  return json ? json.elements ?? [] : null;
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
