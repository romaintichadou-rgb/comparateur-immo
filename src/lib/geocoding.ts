import { aAdressePrecise, formatAdressePostale, formatSecteur } from "./adresse";
import { getJson } from "./analyse/sources/http";
import type { PrecisionLocalisation } from "./types";

/**
 * Géocodage via la Base Adresse Nationale (BAN), l'API officielle française
 * (api-adresse.data.gouv.fr). Préférée à Nominatim pour les adresses FR :
 * meilleure précision, et surtout elle renvoie gratuitement le **code INSEE**
 * de la commune (`citycode`) et l'**identifiant BAN** de l'adresse — deux clés
 * de jointure réutilisées par toutes les sources de l'Analyse IA (DVF, ADEME,
 * délinquance, loyers...). Pas de throttle nécessaire (BAN tolère ~50 req/s).
 */

const BAN_URL = "https://api-adresse.data.gouv.fr/search/";

/**
 * Le géocodage s'exécute EN SÉRIE, avant la vague parallèle des sources
 * (voir `analyse/run.ts`) : c'est le seul appel de l'analyse dont la lenteur
 * ne se recouvre avec rien. Il est resté longtemps sans timeout du tout — une
 * BAN lente suspendait l'analyse entière sans plafond. Mesuré entre 1,6 s et
 * 5,9 s selon la charge, d'où ce plafond, large mais fini : au-delà, on
 * retombe sur les coordonnées déjà stockées sur le bien.
 */
const TIMEOUT_MS = 8000;

export interface BanResult {
  latitude: number;
  longitude: number;
  precision_localisation: PrecisionLocalisation;
  /** Code INSEE de la commune (ex. "13201" pour Marseille 1er). */
  code_insee: string;
  /** Identifiant BAN de l'adresse (ex. "13201_3742_00016"). */
  ban_id: string;
  label: string;
}

interface BanFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    label: string;
    type: string; // "housenumber" | "street" | "locality" | "municipality"
    score: number;
    citycode: string;
    id: string;
  };
}

async function banSearch(query: string): Promise<BanResult | null> {
  if (!query.trim()) return null;

  const url = `${BAN_URL}?limit=1&q=${encodeURIComponent(query)}`;
  // Caché comme les autres sources : une même adresse re-géocodée à chaque
  // relance d'analyse donne rigoureusement le même résultat. Le cache est
  // porté par l'URL, donc par l'adresse — corriger l'adresse du bien
  // re-géocode bien, ce qu'une colonne `ban_id` stockée n'aurait pas garanti.
  const json = await getJson<{ features?: BanFeature[] }>(url, {
    timeoutMs: TIMEOUT_MS,
    headers: { "User-Agent": "comparateur-locatif-perso/1.0" },
  });
  const f = json?.features?.[0];
  if (!f) return null;

  const [lon, lat] = f.geometry.coordinates;
  return {
    latitude: lat,
    longitude: lon,
    // Une adresse au numéro près = "exacte" ; rue/quartier/commune = approx.
    precision_localisation:
      f.properties.type === "housenumber" ? "exacte" : "arrondissement",
    code_insee: f.properties.citycode ?? "",
    ban_id: f.properties.id ?? "",
    label: f.properties.label ?? query,
  };
}

/**
 * Géocode un bien : adresse précise si disponible (précision "exacte"),
 * sinon centre du quartier/ville/code postal (précision "arrondissement",
 * à distinguer visuellement sur la carte pour ne pas laisser croire à une
 * précision qu'on n'a pas).
 */
export async function geocodeApartmentLocation(input: {
  adresse: string;
  quartier: string;
  ville: string;
  code_postal: string;
}): Promise<BanResult | null> {
  if (aAdressePrecise(input)) {
    const hit = await banSearch(formatAdressePostale(input));
    if (hit) return hit;
  }

  const hit = await banSearch(formatSecteur(input));
  if (hit) {
    // On ne présente jamais un repli quartier/ville comme une adresse exacte.
    return { ...hit, precision_localisation: "arrondissement" };
  }

  return null;
}

