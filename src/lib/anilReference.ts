import type { LoyerReference } from "./analyse/sources/loyers";

/**
 * Conversion de la référence ANIL vers un loyer CC meublé — SOURCE UNIQUE.
 *
 * Ce module est volontairement PUR (aucune I/O, aucun `fs`, aucun `fetch`) :
 * il est importé aussi bien par le serveur (`rentEstimation`, blocs d'analyse)
 * que par un composant client (`LoyerDetailPanel`), qui recopiait jusqu'ici ses
 * propres constantes `MAJORATION_MEUBLE` / `PROVISION_CHARGES_M2_DEFAUT`. Le
 * `import type` de `LoyerReference` est effacé à la compilation : il ne tire
 * pas le code de téléchargement dans le bundle client.
 *
 * ── Trois corrections que ce module incarne ──────────────────────────────
 *
 * 1. **`loypredm2` est DÉJÀ charges comprises.** La note méthodologique ANIL
 *    l'écrit trois fois (« Les indicateurs de loyers proviennent de prédictions
 *    […] et sont charges comprises », et la base « ne permet pas de distinguer
 *    le loyer et les provisions pour charges locatives »). Le code ajoutait une
 *    provision par-dessus, soit un DOUBLE COMPTAGE de +5 % à +12 % selon la
 *    commune (constant en euros, donc proportionnellement pire là où les loyers
 *    sont bas). Il n'y a plus aucune provision ici — seule la majoration meublé
 *    subsiste, elle légitime (l'édition 2024 est restreinte au non meublé).
 *
 * 2. **La bonne ressource ANIL.** Quatre sont publiées ; l'app n'en lisait
 *    qu'une (« toutes typologies », logement de référence 52 m²), y compris
 *    pour une maison. Mesuré sur les 34 960 communes : un T1-T2 était
 *    sous-estimé de ~19 %, un T3+ surestimé de ~13 %.
 *
 * 3. **Le loyer/m² n'est pas linéaire en surface.** L'ANIL modélise la surface
 *    par une spline ; l'app multipliait platement €/m² × surface. L'élasticité
 *    ci-dessous est le SEUL coefficient de tout le calcul dérivé des données
 *    (régression log-log sur les trois ressources appartement × 34 960
 *    communes) — tous les autres sont conventionnels.
 */

/** Les quatre ressources publiées par l'ANIL, avec leur logement de référence. */
export type TypologieAnil = "appartement" | "appartement_t1_t2" | "appartement_t3_plus" | "maison";

/**
 * Surface du « bien de référence » pour lequel chaque indicateur est prédit
 * (source : dictionnaire des variables ANIL). C'est le pivot de la correction
 * de surface : un indicateur ne vaut exactement que pour cette surface-là.
 */
export const SURFACE_REFERENCE: Record<TypologieAnil, number> = {
  appartement: 52,
  appartement_t1_t2: 37,
  appartement_t3_plus: 72,
  maison: 92,
};

/**
 * Majoration meublé appliquée au loyer ANIL (non meublé par construction
 * depuis l'édition 2024). Un meublé se loue 10 à 20 % plus cher qu'un nu
 * équivalent ; 12 % est une valeur médiane prudente.
 *
 * ⚠️ CONVENTIONNEL, non sourcé — contrairement à `ELASTICITE_SURFACE`.
 */
export const MAJORATION_MEUBLE = 0.12;

/**
 * Élasticité du loyer/m² à la surface : `loyer_m2 ∝ surface ^ ELASTICITE`.
 *
 * **Dérivée des données**, pas choisie : régression log-log sur les trois
 * ressources appartement (surfaces de référence 37 / 52 / 72 m²) pour chacune
 * des 34 960 communes. Médiane des pentes = −0,485 (p25 −0,60 / p75 −0,38).
 *
 * Concrètement, à référence 52 m² : 20 m² → ×1,59 · 40 m² → ×1,14 ·
 * 80 m² → ×0,81 · 120 m² → ×0,67. Les petits logements se louent nettement
 * plus cher au m², ce que l'ancien calcul linéaire ignorait complètement.
 */
export const ELASTICITE_SURFACE = -0.485;

/**
 * Bornes du facteur de surface. La loi puissance diverge sous ~15 m² (un
 * 10 m² donnerait ×1,9), au-delà de ce que le marché pratique réellement.
 */
export const FACTEUR_SURFACE_MIN = 0.75;
export const FACTEUR_SURFACE_MAX = 1.45;

/**
 * Choisit la ressource ANIL adaptée au bien.
 *
 * ⚠️ Un IMMEUBLE reste sur « appartement toutes typologies » : ses lots sont
 * des logements de tailles mixtes, et la ressource « maison » comme les
 * ressources par typologie décriraient mal cet assemblage. C'est le seul cas
 * où le repli générique est le bon choix, pas un pis-aller.
 *
 * ⚠️ **`nb_pieces` manquant** : le repli sur la ressource générique (référence
 * 52 m²) n'est PAS neutre — mesuré sur les 34 960 communes, il biaisait un
 * studio de +8 % à +13 % et un grand logement de −7 % à −14 %. Une donnée
 * manquante ne doit jamais pencher le calcul dans un sens plutôt qu'un autre ;
 * ici, la surface (qu'on connaît presque toujours) permet de choisir la
 * ressource dont la surface de référence (37 ou 72 m²) est la plus proche —
 * ce qui minimise l'erreur d'extrapolation, sans inventer un nombre de pièces
 * qu'on ne connaît pas. Le repli générique ne reste utilisé qu'en tout
 * dernier recours, quand ni les pièces ni la surface ne sont connues.
 */
export function typologieAnil(
  typeBien: string,
  nbPieces: number | null,
  immeuble: boolean,
  surfaceM2?: number | null
): TypologieAnil {
  if (immeuble) return "appartement";
  if ((typeBien ?? "").trim().toLowerCase() === "maison") return "maison";
  if (nbPieces != null && nbPieces > 0) return nbPieces <= 2 ? "appartement_t1_t2" : "appartement_t3_plus";
  if (surfaceM2 != null && surfaceM2 > 0) {
    const ecartT12 = Math.abs(surfaceM2 - SURFACE_REFERENCE.appartement_t1_t2);
    const ecartT3 = Math.abs(surfaceM2 - SURFACE_REFERENCE.appartement_t3_plus);
    return ecartT12 <= ecartT3 ? "appartement_t1_t2" : "appartement_t3_plus";
  }
  return "appartement";
}

/**
 * Facteur de correction de surface, borné.
 *
 * `surfaceLogement` est la surface d'UN logement — pour un immeuble, c'est la
 * surface par lot, jamais la surface totale du bâtiment : appliquer
 * l'élasticité à 400 m² produirait une décote massive alors que l'immeuble est
 * composé de logements de taille normale.
 */
export function facteurSurface(surfaceLogement: number | null, typologie: TypologieAnil): number {
  if (surfaceLogement == null || surfaceLogement <= 0) return 1;
  const brut = Math.pow(surfaceLogement / SURFACE_REFERENCE[typologie], ELASTICITE_SURFACE);
  return Math.min(FACTEUR_SURFACE_MAX, Math.max(FACTEUR_SURFACE_MIN, brut));
}

/** Référence de marché en €/m² CC meublé, corrigée de la surface. */
export interface ReferenceCC {
  /** €/m²/mois, CC meublé, corrigé de la surface. */
  medianM2: number;
  minM2: number;
  maxM2: number;
  /** Facteur de surface effectivement appliqué (pour l'affichage du détail). */
  facteurSurface: number;
  typologie: TypologieAnil;
  surfaceReference: number;
}

/**
 * Convertit une référence ANIL brute en €/m² CC meublé corrigé.
 *
 * ⚠️ **`min` et `max` subissent EXACTEMENT la même chaîne que la médiane.**
 * C'est la condition pour que le plafonnement final ait un sens : corriger
 * seulement la médiane rendait, pour un studio de 20 m², la médiane corrigée
 * (580 €) SUPÉRIEURE au haut de fourchette non corrigé (567 €) — le clamp
 * tirait alors le loyer sous sa propre médiane. Ne jamais dissocier les trois.
 */
export function referenceCCMeuble(
  ref: LoyerReference,
  surfaceLogement: number | null,
  typologie: TypologieAnil
): ReferenceCC {
  const f = facteurSurface(surfaceLogement, typologie);
  const conv = (m2: number) => m2 * (1 + MAJORATION_MEUBLE) * f;
  return {
    medianM2: conv(ref.loyerM2),
    minM2: conv(ref.min),
    maxM2: conv(ref.max),
    facteurSurface: f,
    typologie,
    surfaceReference: SURFACE_REFERENCE[typologie],
  };
}
