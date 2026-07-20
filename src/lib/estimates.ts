import { isImmeuble, type Apartment, type ChampEstimable } from "./types";
import { estimateTaxeFonciereLocale, getCoproEurM2 } from "./taxeFonciereData";

/**
 * Préfixe de la justification générée quand la taxe foncière vient du calcul
 * COMMUNAL déterministe (taux DGFiP réel de la commune), par opposition au
 * fallback départemental + IA.
 *
 * Sert de signal CLIENT-SAFE à applyLiveEstimates pour ne PAS recalculer (et
 * donc écraser) une TF communale par la formule départementale : le module
 * communal (taxeFonciereCommune.ts + 473 Ko de JSON) est server-only et ne
 * peut pas être importé ici. Une TF communale est figée en base par
 * /estimate-charges ; on la conserve telle quelle à la lecture.
 *
 * DOIT rester synchronisé avec buildTfJustificationDeterministe
 * (chargesEstimation.ts), qui construit sa phrase à partir de cette constante —
 * couplage volontaire et documenté (chargesEstimation.ts importe déjà
 * ce module ; l'inverse tirerait le JSON communal dans le bundle client).
 */
export const TF_JUSTIF_COMMUNE_PREFIX =
  "Basé sur le taux d'imposition réel de la commune";

/**
 * Heuristiques simples pour pré-remplir les champs financiers estimés à
 * l'ajout d'un bien. Volontairement basiques pour la V1 (voir CLAUDE
 * "à affiner") — l'utilisateur peut toujours corriger ces valeurs, ce qui
 * fait disparaître leur badge "estimé" (voir champs_manuels).
 */

/**
 * Estime le nombre de lots d'un immeuble quand il n'est pas renseigné : ordre
 * de grandeur ~1 logement par 55 m² de surface totale, plancher 2 (un immeuble
 * de rapport a par définition plusieurs lots). Sert d'échelle par défaut pour
 * l'assurance et le loyer, en attendant la valeur réelle saisie par
 * l'utilisateur.
 */
export function lotsEffectifs(nbLots: number | null, surfaceM2: number | null): number {
  if (nbLots != null && nbLots > 0) return nbLots;
  if (surfaceM2 != null && surfaceM2 > 0) return Math.max(2, Math.round(surfaceM2 / 55));
  return 2;
}

/**
 * Frais de notaire (droits de mutation inclus) : barème usuel en France
 * ~7-8% dans l'ancien, ~2-3% dans le neuf.
 */
export function estimateFraisNotaire(
  prix: number | null,
  etatBien: string
): number | null {
  if (prix == null) return null;
  const isNeuf = etatBien.toLowerCase().includes("neuf");
  const taux = isNeuf ? 0.025 : 0.075;
  return Math.round(prix * taux);
}

/**
 * Taxe foncière : estimation ajustée par département (coefficient local)
 * et par prix du bien (proxy de la valeur locative cadastrale). Quand le
 * code postal est fourni, utilise la table de coefficients départementaux
 * pour réduire l'erreur d'estimation de ×5 à ×2. Le prix, quand disponible,
 * sert de second estimateur (TF ≈ 0.8 % du prix × coeff local).
 */
export function estimateTaxeFonciere(
  surfaceM2: number | null,
  codePostal?: string,
  prix?: number | null,
): number | null {
  if (codePostal) {
    return estimateTaxeFonciereLocale(surfaceM2, codePostal, prix ?? null);
  }
  if (surfaceM2 == null) return null;
  const TAUX_MOYEN_EUR_PAR_M2 = 15;
  return Math.round(surfaceM2 * TAUX_MOYEN_EUR_PAR_M2);
}

/**
 * Charges annuelles récurrentes à la charge du propriétaire (hors taxe
 * foncière et assurance, comptées séparément), estimées au m².
 * Le taux €/m² est ajusté par département (proxy urbanisation via TF_EUR_M2).
 */
export function estimateChargesCopro(
  surfaceM2: number | null,
  immeuble = false,
  codePostal?: string,
): number {
  const eurM2 = codePostal ? getCoproEurM2(codePostal, immeuble) : (immeuble ? 12 : 20);
  const PLANCHER_EUR_AN = immeuble ? 1500 : 800;
  if (surfaceM2 == null || surfaceM2 <= 0) return PLANCHER_EUR_AN;
  return Math.max(PLANCHER_EUR_AN, Math.round(surfaceM2 * eurM2));
}

/**
 * Assurance PNO (Propriétaire Non Occupant) annuelle.
 *
 * Tarifs calés sur les barèmes comparateurs 2024-2025 (LeLynx, Assurland) :
 *  - Appartement : ~2.5 €/m²/an, plancher 90 € (studio), plafond 350 €
 *  - Maison : ~3.0 €/m²/an, plancher 180 € (maison standard), plafond 450 €
 *  - Immeuble : par lot avec économie d'échelle (-10 % par lot au-delà du 1er,
 *    plancher 120 €/lot), car une police PNO immeuble coûte moins cher par
 *    logement qu'autant de PNO individuelles.
 *
 * Le type de bien influence le taux : une maison a plus de surface exposée
 * (toiture, jardin, clôture) qu'un appartement en copropriété.
 */
export function estimateAssurance(
  immeuble = false,
  nbLots: number | null = null,
  surfaceM2: number | null = null,
  typeBien?: string,
): number {
  if (immeuble) {
    const lots = lotsEffectifs(nbLots, surfaceM2);
    const surfaceParLot = surfaceM2 != null && surfaceM2 > 0 ? surfaceM2 / lots : 45;
    const baseLot = Math.max(120, Math.round(surfaceParLot * 2.5));
    // Économie d'échelle : -10% par lot au-delà du premier (plafonné à -30%)
    const remise = Math.min(0.30, (lots - 1) * 0.10);
    const parLot = Math.round(baseLot * (1 - remise));
    return parLot * lots;
  }

  const isMaison = (typeBien ?? "").trim().toLowerCase() === "maison";
  const tauxM2 = isMaison ? 3.0 : 2.5;
  const plancher = isMaison ? 180 : 90;
  const plafond = isMaison ? 450 : 350;

  if (surfaceM2 == null || surfaceM2 <= 0) return plancher;
  return Math.max(plancher, Math.min(plafond, Math.round(surfaceM2 * tauxM2)));
}

/**
 * Recalcule les champs estimables encore en mode "auto" (absents de
 * champs_manuels ET de champs_estimes_ia) à partir des valeurs actuelles du
 * bien, au lieu de se fier à l'estimation figée au moment de la création.
 * Appelé à chaque lecture (liste, fiche, réponses d'API) pour que ces champs
 * — et tout ce qui en dépend (budget_total, rendements) — restent cohérents
 * partout dès que prix/surface/état changent, sans attendre une action
 * explicite sur le champ estimé lui-même.
 *
 * champs_estimes_ia (charges_copro_annuelles, taxe_fonciere — voir
 * chargesEstimation.ts) est traité comme champs_manuels ici : un champ déjà
 * estimé par IA ne doit PAS être recalculé par cette formule déterministe à
 * la lecture suivante, sinon la valeur IA serait silencieusement écrasée.
 * frais_notaire_estimes et assurance_annuelle n'ont pas d'estimation IA :
 * seul champs_manuels s'applique à eux.
 */
/**
 * Vrai si la valeur ACTUELLE de ce champ vient d'une estimation IA (recherche
 * web + Gemini — loyer, charges copro/exploitation, taxe foncière), pas
 * d'une formule déterministe locale ni d'une saisie manuelle. Source unique
 * pour afficher le badge "Estimation IA" (AiEstimatedBadge) partout où ces
 * valeurs apparaissent — fiche détaillée, détail du calcul de rendement,
 * simulation financière, Analyse IA. Ne pas dupliquer cette condition
 * localement : un champ manuel prime toujours (voir champs_manuels).
 */
export function isAiEstimated(apt: Apartment, key: ChampEstimable): boolean {
  return apt[key] != null && !apt.champs_manuels.includes(key) && apt.champs_estimes_ia.includes(key);
}

export function applyLiveEstimates(apt: Apartment): Apartment {
  const immeuble = isImmeuble(apt.type_bien);
  const fige = (champ: ChampEstimable) =>
    apt.champs_manuels.includes(champ) || apt.champs_estimes_ia.includes(champ);
  // Une TF issue du calcul communal déterministe (taux DGFiP réel) est figée
  // en base : la recalculer ici avec la formule DÉPARTEMENTALE (la seule
  // disponible côté client) l'écraserait par une valeur moins précise. On la
  // détecte via le préfixe de sa justification (signal client-safe).
  const tfCommunaleFigee =
    apt.taxe_fonciere != null &&
    (apt.taxe_fonciere_justification ?? "").startsWith(TF_JUSTIF_COMMUNE_PREFIX);
  return {
    ...apt,
    frais_notaire_estimes: apt.champs_manuels.includes("frais_notaire_estimes")
      ? apt.frais_notaire_estimes
      : estimateFraisNotaire(apt.prix, apt.etat_bien),
    taxe_fonciere: fige("taxe_fonciere") || tfCommunaleFigee
      ? apt.taxe_fonciere
      : estimateTaxeFonciere(apt.surface_m2, apt.code_postal, apt.prix),
    charges_copro_annuelles: fige("charges_copro_annuelles")
      ? apt.charges_copro_annuelles
      : estimateChargesCopro(apt.surface_m2, immeuble, apt.code_postal),
    assurance_annuelle: apt.champs_manuels.includes("assurance_annuelle")
      ? apt.assurance_annuelle
      : estimateAssurance(immeuble, apt.nb_lots, apt.surface_m2, apt.type_bien),
  };
}
