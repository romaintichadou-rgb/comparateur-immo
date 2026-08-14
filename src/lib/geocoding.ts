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

/**
 * @param codePostal restreint la recherche à ce code postal quand il est connu.
 *
 * ⚠️ **Sans ce filtre, la BAN apparie le quartier à une rue homonyme d'un autre
 * arrondissement.** Cas réel : « Saint-Lambert, 13007 Marseille » (quartier du
 * 7e) ressortait en « Boulevard Lambert, 13004 Marseille » — code INSEE 13204
 * au lieu de 13207. La recherche en texte libre pondère la ressemblance du
 * libellé et ne traite pas le code postal comme une contrainte, alors qu'il en
 * est une.
 *
 * La portée du bug dépasse le pin de la carte : `code_insee` est la clé de
 * jointure de la délinquance, du revenu médian, du profil de commune, de la
 * référence de loyer ANIL et — depuis le passage au périmètre communal — de la
 * comparaison de prix DVF. Un mauvais code fait analyser le bien contre un
 * autre arrondissement, en silence et avec l'aplomb d'un chiffre exact.
 *
 * Repli sans filtre si la requête contrainte ne rend rien : un `code_postal`
 * erroné ou obsolète doit dégrader vers l'ancien comportement, pas supprimer
 * toute localisation.
 */
async function banSearch(query: string, codePostal?: string): Promise<BanResult | null> {
  if (!query.trim()) return null;

  const cp = (codePostal ?? "").trim();
  const base = `${BAN_URL}?limit=1&q=${encodeURIComponent(query)}`;
  const urls = cp ? [`${base}&postcode=${encodeURIComponent(cp)}`, base] : [base];

  for (const url of urls) {
    // Caché comme les autres sources : une même adresse re-géocodée à chaque
    // relance d'analyse donne rigoureusement le même résultat. Le cache est
    // porté par l'URL, donc par l'adresse — corriger l'adresse du bien
    // re-géocode bien, ce qu'une colonne `ban_id` stockée n'aurait pas garanti.
    const json = await getJson<{ features?: BanFeature[] }>(url, {
      timeoutMs: TIMEOUT_MS,
      headers: { "User-Agent": "comparateur-locatif-perso/1.0" },
    });
    const hit = json?.features?.[0];
    if (hit) return versResultat(hit, query);
  }
  return null;
}

function versResultat(f: BanFeature, query: string): BanResult {
  const [lon, lat] = f.geometry.coordinates;
  return {
    latitude: lat,
    longitude: lon,
    // ⚠️ Les trois granularités de la BAN sont reportées telles quelles. Écraser
    // `street` et `municipality` sur une même valeur « approximative » rendait
    // indiscernables le milieu d'une voie et le centre d'une commune — des
    // kilomètres d'écart. Tout ce qui se mesure dans un rayon (OSM, aléa
    // argile) tournait alors autour du centroïde communal en se présentant
    // comme un fait sur le bien.
    precision_localisation:
      f.properties.type === "housenumber"
        ? "exacte"
        : f.properties.type === "street"
          ? "rue"
          : "arrondissement",
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
    const hit = await banSearch(formatAdressePostale(input), input.code_postal);
    if (hit) return hit;
  }

  const hit = await banSearch(formatSecteur(input), input.code_postal);
  if (hit) {
    // ⚠️ Le repli interroge le SECTEUR (quartier, ville), pas la voie du bien.
    // La BAN peut très bien y répondre par une rue — la mieux notée du
    // quartier — mais ce n'est pas celle du bien : on écrase donc toujours en
    // `arrondissement`, sans quoi le niveau `rue` promettrait une proximité
    // qu'aucune donnée ne soutient.
    return { ...hit, precision_localisation: "arrondissement" };
  }

  return null;
}

