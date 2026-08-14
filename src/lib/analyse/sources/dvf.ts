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
 * ⚠️ **La maille temporelle de l'API est l'ANNÉE, pas le mois.** `datemut_min`
 * / `datemut_max` sont acceptés puis IGNORÉS (vérifié : même `count` avec et
 * sans, Paris 11e 2025 → 2 386 dans les deux cas) ; seul `anneemut_min/max`
 * filtre. Une fenêtre glissante de 12 mois devrait donc se faire côté client
 * sur `datemut` — sans gain réel : la publication DVF a ~8 mois de retard
 * (au 15/08/2026, l'année 2026 renvoie 0 vente et les données s'arrêtent au
 * 31/12/2025), si bien que « les 12 derniers mois » désignent en pratique le
 * dernier millésime complet. C'est ce que fait la fenêtre adaptative.
 *
 * ── Deux périmètres, deux endpoints ──────────────────────────────────────
 *
 * Le périmètre suit la PRÉCISION de localisation du bien — il est construit en
 * amont par `perimetreAnalyse()` (`analyse/perimetre.ts`), source unique
 * partagée avec la Carte des loyers ANIL.
 * Sans adresse exacte, les coordonnées ne sont que le centroïde du secteur
 * renvoyé par la BAN : chercher dans un rayon de 500 m autour de ce point
 * renvoie une fraction arbitraire du quartier, dans laquelle le bien réel n'est
 * même pas forcément situé. On bascule alors sur l'endpoint communal.
 */

import type { PerimetreAnalyse } from "../perimetre";
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

/**
 * Budget de collecte DVF, toutes fenêtres et toutes pages confondues.
 *
 * ⚠️ **C'est la source la plus lente ET la moins fiable de l'analyse** —
 * `apidf-preprod.cerema.fr`, une instance de PRÉPRODUCTION. Mesuré sur données
 * froides : 38 s sur Bordeaux, 60 s sans réponse du tout sur Toulouse, contre
 * ~300 ms une fois le cache serveur chaud. Comme les autres sources partent en
 * parallèle avec elle, DVF dicte à lui seul la durée de l'analyse.
 *
 * Sans plafond, le pire cas était `maxPages × TIMEOUT_PAGE_MS` par année, soit
 * une minute d'attente pour l'utilisateur. La dégradation est GRACIEUSE : on
 * garde les pages déjà obtenues et on cesse d'en demander. Une médiane sur 500
 * ventes vaut celle sur 3 000 — c'est le nombre de pages qui devient
 * négociable, jamais leur contenu.
 */
const BUDGET_MS = 12000;
const TIMEOUT_PAGE_MS = 15000;

const PM2_MIN = 300; // garde anti-aberrations (viager, nue-propriété, erreurs)
const PM2_MAX = 30000;
const ANCIEN_MIN = 2014;
const ANCIEN_MAX = 2016;

/**
 * Taille d'échantillon au-delà de laquelle une médiane est jugée fiable.
 *
 * ⚠️ **Un seul seuil pour deux décisions couplées**, d'où l'export : ici il
 * arrête la fenêtre adaptative (on cesse de remonter dans le temps), et dans
 * `blocs/prix.ts` il arrête l'atténuation de la note vers la neutralité. Les
 * laisser diverger produirait le pire des deux mondes — une fenêtre élargie
 * jusqu'à un volume que le bloc juge encore trop mince, ou l'inverse.
 */
export const SEUIL_ECHANTILLON_FIABLE = 15;

/** Volume minimal pour conserver une tolérance de surface donnée. */
const SEUIL_TOLERANCE = 8;
const TOL_STRICTE = 0.2;
const TOL_LARGE = 0.4;

interface Vente {
  prixM2: number;
  surface: number;
}

export interface DvfData {
  nbVentesRecent: number;
  /**
   * Volume de ventes d'appartements sur TOUTE la fenêtre collectée (avant
   * filtre de surface ET avant resserrement de la fenêtre adaptative).
   *
   * ⚠️ **Ne pas le réaligner sur la fenêtre adaptative.** Ce compteur alimente
   * le critère « liquidité du marché » du bloc Potentiel, dont les seuils
   * (15 / 40 / 80 / 150) sont calibrés sur le volume PLURIANNUEL collecté. Le
   * brancher sur une fenêtre qui se resserre à un an en zone dense diviserait
   * le comptage par deux ou trois et ferait chuter la note d'un secteur devenu
   * … plus liquide. La médiane et la liquidité lisent volontairement deux
   * populations différentes, et donc deux libellés différents.
   */
  nbVentesTotal: number;
  /** Base de comparaison retenue pour la médiane récente (surface). */
  baseComparaison: string;
  /**
   * Millésimes réellement retenus pour la médiane récente, déjà mis en forme
   * (« 2025 » ou « 2023–2025 ») — la fenêtre étant adaptative, sa profondeur
   * varie d'un bien à l'autre et doit être affichée telle qu'elle a servi.
   */
  recentLabel: string | null;
  /**
   * Millésimes couverts par `nbVentesTotal` — TOUTE la fenêtre collectée, donc
   * plus large que `recentLabel` dès que la fenêtre adaptative se resserre.
   * Les deux libellés ne sont pas interchangeables (voir `nbVentesTotal`).
   */
  volumeLabel: string | null;
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
  perimetre: PerimetreAnalyse;
  surface: number | null;
}): Promise<DvfData> {
  const { perimetre, surface } = params;
  const rayonSerre = perimetre.type === "rayon500";
  const { prefixe, maxPages, perimetreLabel } = requete(perimetre);

  // Fenêtre COLLECTÉE : 3 dernières années glissantes. Elle inclut l'année en
  // cours, vide la majeure partie de l'année vu le retard de publication DVF —
  // la requête n'est pas perdue pour autant : c'est par elle qu'arrive le
  // millésime partiel dès sa publication (DVF paraît deux fois par an).
  //
  // ⚠️ Collecter ≠ retenir. La fenêtre RETENUE pour la médiane est choisie plus
  // bas, millésime par millésime.
  const currentYear = new Date().getFullYear();
  const recentMinTarget = currentYear - 2;

  // Échéance PARTAGÉE par les deux fenêtres : le budget porte sur la collecte
  // DVF entière, pas sur chaque fenêtre séparément — sinon deux fenêtres lentes
  // le doublent.
  const echeance = Date.now() + BUDGET_MS;
  const [recentesParAnnee, anciennesVentes] = await Promise.all([
    fetchWindowParAnnee(prefixe, maxPages, recentMinTarget, currentYear, echeance),
    fetchWindow(prefixe, maxPages, ANCIEN_MIN, ANCIEN_MAX, echeance),
  ]);
  const recentesVentes = recentesParAnnee.flatMap((a) => a.ventes);

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

  // ── Fenêtre ADAPTATIVE : on desserre le TEMPS avant la SURFACE ───────────
  //
  // Une fenêtre pluriannuelle fixe estime le prix du MILIEU de la fenêtre, pas
  // celui d'aujourd'hui : son biais vaut à peu près la dérive annuelle du
  // marché. Mesuré (rayon 500 m, comparables ±20 % autour de 60 m², médiane
  // 2023-2025 vs 2025 seul) : +0,8 % à Paris 11e, −1,1 % à Marseille 7e,
  // +2,5 % à Angers, **+8,8 % au Mans** — soit ~1,3 point de note sur un bloc
  // qui pèse 0,3. On part donc du millésime le plus récent et on ne remonte
  // dans le temps QUE si l'échantillon est trop mince.
  //
  // ⚠️ **Ne pas figer la fenêtre à un an « pour la fraîcheur ».** Le biais
  // temporel est maximal là où l'échantillon annuel est le plus maigre, et le
  // bruit y dépasse alors le biais qu'on prétend corriger — erreur-type de la
  // médiane mesurée par bootstrap : Paris ±1,4 % sur un an contre ±1,1 % sur
  // trois, mais Le Mans ±5,5 % contre ±2,8 %. Pire, sous SEUIL_TOLERANCE
  // comparables, l'échelle ci-dessous élargit la SURFACE, et l'effet de taille
  // (studio vs T4 : jusqu'à 30 % d'écart de prix/m²) est un biais bien plus
  // gros que la dérive temporelle qu'on cherchait à supprimer. Comptages
  // mesurés par an à ±20 % : Chartres centre 43-47, Vierzon centre 12-14,
  // Angers périphérie 1-5. C'est pour ces derniers que la fenêtre s'élargit.
  //
  // L'ordre des deux desserrages n'est donc pas arbitraire : temps d'abord,
  // surface en dernier recours.
  const anneesRecentes = recentesParAnnee
    .filter((a) => a.ventes.length > 0)
    .sort((a, b) => b.annee - a.annee); // du plus récent au plus ancien

  // Repli si la boucle n'atteint jamais le palier : tous les millésimes reçus.
  let ventesFenetre = recentesVentes;
  let anneesRetenues = anneesRecentes.map((a) => a.annee);
  const cumul: Vente[] = [];
  const retenues: number[] = [];
  for (const a of anneesRecentes) {
    cumul.push(...a.ventes);
    retenues.push(a.annee);
    if (dansTolerance(cumul, TOL_STRICTE).length >= SEUIL_ECHANTILLON_FIABLE) {
      ventesFenetre = [...cumul];
      anneesRetenues = [...retenues];
      break;
    }
  }

  let baseRecente = ventesFenetre;
  let baseAncienne = anciennesVentes;
  let baseComparaison = "toutes surfaces";
  if (surface != null && surface > 0) {
    const strict = dansTolerance(ventesFenetre, TOL_STRICTE);
    const large = dansTolerance(ventesFenetre, TOL_LARGE);
    if (strict.length >= SEUIL_TOLERANCE) {
      baseRecente = strict;
      baseAncienne = dansTolerance(anciennesVentes, TOL_STRICTE);
      baseComparaison = `surface ${Math.round(surface * 0.8)}–${Math.round(surface * 1.2)} m²`;
    } else if (large.length >= SEUIL_TOLERANCE) {
      baseRecente = large;
      baseAncienne = dansTolerance(anciennesVentes, TOL_LARGE);
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
    // Millésimes RÉELLEMENT couverts, jamais ceux demandés : la requête porte
    // toujours sur `currentYear`, année qui ne contient aucune vente pendant
    // les ~8 premiers mois. Afficher la fenêtre demandée revenait à annoncer
    // « 2024–2026 » sur des données arrêtées fin 2025.
    recentLabel: labelAnnees(anneesRetenues),
    volumeLabel: labelAnnees(anneesRecentes.map((a) => a.annee)),
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
function requete(p: PerimetreAnalyse): { prefixe: string; maxPages: number; perimetreLabel: string } {
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
 * Une fenêtre = une requête PAR ANNÉE, lancées en parallèle, et le résultat
 * reste **découpé par millésime** : c'est ce découpage qui rend possible la
 * fenêtre adaptative de `fetchDvf` (choisir combien d'années retenir se décide
 * après la collecte, sans requête supplémentaire).
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
async function fetchWindowParAnnee(
  prefixe: string,
  maxPages: number,
  anMin: number,
  anMax: number,
  echeance: number
): Promise<{ annee: number; ventes: Vente[] }[]> {
  const annees = Array.from({ length: anMax - anMin + 1 }, (_, i) => anMin + i);
  return Promise.all(
    annees.map(async (annee) => ({ annee, ventes: await fetchAnnee(prefixe, maxPages, annee, echeance) }))
  );
}

/** Variante aplatie, pour la fenêtre ancienne — son découpage ne sert à rien. */
async function fetchWindow(
  prefixe: string,
  maxPages: number,
  anMin: number,
  anMax: number,
  echeance: number
): Promise<Vente[]> {
  const parAnnee = await fetchWindowParAnnee(prefixe, maxPages, anMin, anMax, echeance);
  return parAnnee.flatMap((a) => a.ventes);
}

async function fetchAnnee(
  prefixe: string,
  maxPages: number,
  annee: number,
  echeance: number
): Promise<Vente[]> {
  let url: string | null =
    `${prefixe}&codtypbien=121&anneemut_min=${annee}&anneemut_max=${annee}` +
    `&page_size=500&fields=valeurfonc,sbati`;

  const ventes: Vente[] = [];
  for (let page = 0; page < maxPages && url; page++) {
    // Budget épuisé : on rend ce qui a déjà été collecté plutôt que de faire
    // attendre l'utilisateur pour une décimale de médiane.
    const restant = echeance - Date.now();
    if (restant <= 0) break;
    // Annotation explicite : `url` est réaffectée depuis `raw.next`, donc son
    // type et celui de `raw` se référencent circulairement si on laisse TS
    // inférer (TS7022).
    // Le timeout de page ne peut pas dépasser ce qu'il reste de budget global.
    const raw: Page | null = await getJson<Page>(url, {
      timeoutMs: Math.min(restant, TIMEOUT_PAGE_MS),
    });
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

/**
 * « 2025 » pour un millésime unique, « 2023–2025 » pour une plage. Les années
 * retenues peuvent être non contiguës (millésime intermédiaire vide) : on rend
 * alors l'amplitude, la seule information utile à l'affichage.
 */
function labelAnnees(annees: number[]): string | null {
  if (annees.length === 0) return null;
  const min = Math.min(...annees);
  const max = Math.max(...annees);
  return min === max ? String(min) : `${min}–${max}`;
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
