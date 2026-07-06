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
  const res = await fetch(url, {
    headers: {
      "User-Agent": "comparateur-locatif-perso/1.0",
    },
  });
  if (!res.ok) return null;

  const json = (await res.json()) as { features?: BanFeature[] };
  const f = json.features?.[0];
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
  if (input.adresse.trim()) {
    const query = [input.adresse, input.code_postal, input.ville]
      .filter(Boolean)
      .join(", ");
    const hit = await banSearch(query);
    if (hit) return hit;
  }

  const approxQuery = [input.quartier, input.code_postal, input.ville]
    .filter(Boolean)
    .join(", ");
  const hit = await banSearch(approxQuery);
  if (hit) {
    // On ne présente jamais un repli quartier/ville comme une adresse exacte.
    return { ...hit, precision_localisation: "arrondissement" };
  }

  return null;
}

// Compat : ancien nom de type utilisé ailleurs dans le code.
export type GeocodeResult = BanResult;
