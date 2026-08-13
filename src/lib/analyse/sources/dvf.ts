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
 *
 * ── Deux périmètres, deux endpoints ──────────────────────────────────────
 *
 * Le périmètre suit la PRÉCISION de localisation du bien (voir `DvfPerimetre`).
 * Sans adresse exacte, les coordonnées ne sont que le centroïde du secteur
 * renvoyé par la BAN : chercher dans un rayon de 500 m autour de ce point
 * renvoie une fraction arbitraire du quartier, dans laquelle le bien réel n'est
 * même pas forcément situé. On bascule alors sur l'endpoint communal.
 */

import { getJson } from "./http";

/** Emprise géographique (`in_bbox`) — exige des coordonnées fiables. */
const BASE_GEO = "https://apidf-preprod.cerema.fr/dvf_opendata/geomutations/";
/** Périmètre administratif (`code_insee`) — commune, ou arrondissement à PLM. */
const BASE_COMMUNE = "https://apidf-preprod.cerema.fr/dvf_opendata/mutations/";

const RAYON_M = 500;

/**
 * ⚠️ L'API PLAFONNE l'emprise de `geomutations` à **0,02° × 0,02°**, et répond
 * 400 (« Emprise demandée trop importante ») au-delà. À la latitude de Paris,
 * cela borne le rayon utilisable à ~730 m d'est en ouest — à peine plus que les
 * 500 m actuels. Élargir le rayon n'est donc PAS une option pour couvrir un
 * quartier : c'est ce qui impose le repli sur l'endpoint communal plutôt qu'un
 * simple `RAYON_M` plus grand.
 */
const EMPRISE_MAX_DEG = 0.02;

/**
 * Budget de pagination, PAR ANNÉE (500 mutations/page).
 *
 * Volontairement plus serré sur le périmètre communal : `mutations/` ignore le
 * paramètre `fields` et renvoie l'objet complet (~245 Ko/page, contre une
 * fraction de ça sur `geomutations/`), et une commune dense produit beaucoup
 * plus de ventes qu'un rayon de 500 m — mesuré sur 2023 : Paris 11e 2 329
 * ventes, Le Mans 1 116, Marseille 1er 679. Mille ventes suffisent largement à
 * une médiane stable ; les pages suivantes coûteraient des mégaoctets pour une
 * décimale.
 */
const MAX_PAGES_RAYON = 4;
const MAX_PAGES_COMMUNE = 2;

const PM2_MIN = 300; // garde anti-aberrations (viager, nue-propriété, erreurs)
const PM2_MAX = 30000;
const ANCIEN_MIN = 2014;
const ANCIEN_MAX = 2016;

/**
 * Périmètre de comparaison, choisi par l'appelant selon `precision_localisation`.
 *
 * ⚠️ Union discriminée volontaire : passer à la fois un point et un code INSEE
 * laisserait le choix du périmètre à cette fonction, alors que seul l'appelant
 * sait si les coordonnées désignent le bâtiment ou un centroïde de secteur.
 */
export type DvfPerimetre =
  | { type: "rayon500"; lat: number; lon: number }
  | { type: "commune"; codeInsee: string };

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
  /** Libellé du périmètre réellement interrogé (`Fait.perimetre`). */
  perimetreLabel: string;
  /** true si le périmètre est le rayon serré (adresse exacte). */
  rayonSerre: boolean;
}

interface Feature {
  properties: { valeurfonc?: string; sbati?: string };
}

/**
 * Page de résultats DVF+ : `next` porte l'URL de la page suivante.
 *
 * Les deux endpoints ne rendent pas les mutations au même endroit —
 * `geomutations/` en GeoJSON (`features[].properties`), `mutations/` en JSON
 * plat (`results[]`) — d'où les deux clés optionnelles.
 */
interface Page {
  features?: Feature[];
  results?: { valeurfonc?: string; sbati?: string }[];
  next?: string | null;
}

export async function fetchDvf(params: {
  perimetre: DvfPerimetre;
  surface: number | null;
}): Promise<DvfData> {
  const { perimetre, surface } = params;
  const rayonSerre = perimetre.type === "rayon500";
  const { prefixe, maxPages, perimetreLabel } = requete(perimetre);

  // Fenêtre récente : 3 dernières années glissantes (inclut l'année en cours,
  // souvent vide selon le décalage de publication DVF — sans conséquence).
  const currentYear = new Date().getFullYear();
  const recentMinTarget = currentYear - 2;

  const [recentesVentes, anciennesVentes] = await Promise.all([
    fetchWindow(prefixe, maxPages, recentMinTarget, currentYear),
    fetchWindow(prefixe, maxPages, ANCIEN_MIN, ANCIEN_MAX),
  ]);

  // Marché actuel : l'effet de taille fausse la comparaison (un petit logement
  // a structurellement un prix/m² plus élevé). On compare donc à surface
  // proche : d'abord ±20 % de la surface du bien, repli ±40 % si trop peu de
  // ventes, sinon toutes surfaces (base affichée pour transparence).
  //
  // ⚠️ **La MÊME tolérance s'applique aux deux fenêtres.** `evolutionPct`
  // compare les deux médianes, et le levier « marché en recul » (voir
  // `recommandations.ts`) affiche la paire ET le pourcentage dans une seule
  // phrase : les trois nombres doivent se réconcilier. La fenêtre ancienne
  // était auparavant laissée TOUTES SURFACES pendant que la récente était
  // filtrée — l'écart mesuré mélangeait alors la hausse réelle des prix et un
  // simple effet de composition (mesuré : −2 pts à Marseille 7e, −1 à Paris
  // 11e, +7 au Mans ; sans direction systématique — le signe dépend de la
  // position de la cohorte du bien dans le mix local des surfaces).
  //
  // C'est la fenêtre RÉCENTE qui choisit la tolérance, jamais l'ancienne : la
  // médiane récente porte la comparaison de prix (poids 0,3 du bloc), et la
  // laisser s'élargir parce que 2014-2016 manque de ventes ferait dégrader la
  // métrique principale de l'écran au profit d'une sous-note. Si la fenêtre
  // ancienne n'a pas assez de ventes à cette tolérance, `medianeAncienne`
  // devient nulle et l'évolution n'est pas affichée — ne pas mesurer vaut
  // mieux que mesurer deux populations différentes.
  const dansTolerance = (ventes: Vente[], tol: number) =>
    surface != null && surface > 0
      ? ventes.filter((v) => Math.abs(v.surface - surface) <= surface * tol)
      : ventes;

  let baseRecente = recentesVentes;
  let baseAncienne = anciennesVentes;
  let baseComparaison = "toutes surfaces";
  if (surface != null && surface > 0) {
    const strict = dansTolerance(recentesVentes, 0.2);
    const large = dansTolerance(recentesVentes, 0.4);
    if (strict.length >= 8) {
      baseRecente = strict;
      baseAncienne = dansTolerance(anciennesVentes, 0.2);
      baseComparaison = `surface ${Math.round(surface * 0.8)}–${Math.round(surface * 1.2)} m²`;
    } else if (large.length >= 8) {
      baseRecente = large;
      baseAncienne = dansTolerance(anciennesVentes, 0.4);
      baseComparaison = `surface ${Math.round(surface * 0.6)}–${Math.round(surface * 1.4)} m²`;
    }
  }

  const medianeRecente = baseRecente.length >= 3 ? Math.round(median(baseRecente.map((v) => v.prixM2))) : null;
  const medianeAncienne = baseAncienne.length >= 3 ? Math.round(median(baseAncienne.map((v) => v.prixM2))) : null;

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
    perimetreLabel,
    rayonSerre,
  };
}

/** Endpoint, filtre de périmètre et budget de pages associés. */
function requete(p: DvfPerimetre): { prefixe: string; maxPages: number; perimetreLabel: string } {
  if (p.type === "commune") {
    return {
      prefixe: `${BASE_COMMUNE}?code_insee=${encodeURIComponent(p.codeInsee)}`,
      maxPages: MAX_PAGES_COMMUNE,
      perimetreLabel: "arrondissement/commune",
    };
  }

  const dLat = RAYON_M / 111000;
  const dLon = RAYON_M / (111000 * Math.cos((p.lat * Math.PI) / 180));
  // Garde-fou : l'API rejette toute emprise dépassant EMPRISE_MAX_DEG par axe.
  // Le rayon de 500 m y tient à toute latitude métropolitaine — ce clamp
  // protège un futur ajustement de RAYON_M, qui échouerait sinon en 400 sur
  // toutes les analyses à la fois.
  const demi = EMPRISE_MAX_DEG / 2;
  const cLat = Math.min(dLat, demi);
  const cLon = Math.min(dLon, demi);
  const bbox = `${p.lon - cLon},${p.lat - cLat},${p.lon + cLon},${p.lat + cLat}`;
  return {
    prefixe: `${BASE_GEO}?in_bbox=${bbox}`,
    maxPages: MAX_PAGES_RAYON,
    perimetreLabel: `rayon ${RAYON_M} m`,
  };
}

/**
 * Une fenêtre = une requête PAR ANNÉE, lancées en parallèle.
 *
 * ⚠️ Ne pas « simplifier » en une seule requête couvrant `anMin..anMax` :
 * l'API renvoie les mutations de la PLUS ANCIENNE à la plus récente et
 * n'honore pas le tri décroissant. Une fenêtre de 3 ans qui sature la
 * pagination ne rend alors que ses premières années — la médiane est calculée
 * sur les prix les plus vieux de la fenêtre, donc sous-estimée, et le bien
 * paraît mécaniquement surcoté. Découper par année borne la troncature à
 * l'intérieur d'une année (quelques mois de décalage, sans effet sensible sur
 * une médiane) au lieu de l'appliquer au millésime entier.
 */
async function fetchWindow(
  prefixe: string,
  maxPages: number,
  anMin: number,
  anMax: number
): Promise<Vente[]> {
  const annees = Array.from({ length: anMax - anMin + 1 }, (_, i) => anMin + i);
  const parAnnee = await Promise.all(annees.map((an) => fetchAnnee(prefixe, maxPages, an)));
  return parAnnee.flat();
}

async function fetchAnnee(prefixe: string, maxPages: number, annee: number): Promise<Vente[]> {
  let url: string | null =
    `${prefixe}&codtypbien=121&anneemut_min=${annee}&anneemut_max=${annee}` +
    `&page_size=500&fields=valeurfonc,sbati`;

  const ventes: Vente[] = [];
  for (let page = 0; page < maxPages && url; page++) {
    // Annotation explicite : `url` est réaffectée depuis `raw.next`, donc son
    // type et celui de `raw` se référencent circulairement si on laisse TS
    // inférer (TS7022).
    const raw: Page | null = await getJson<Page>(url, { timeoutMs: 15000 });
    if (!raw) break;
    const bruts = raw.features ? raw.features.map((f) => f.properties) : (raw.results ?? []);
    for (const b of bruts) {
      const surface = Number(b.sbati);
      const valeur = Number(b.valeurfonc);
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
