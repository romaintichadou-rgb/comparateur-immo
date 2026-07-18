import { isImmeuble, type Apartment, type ChampEstimable } from "./types";

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
 * Taxe foncière : pas de source fiable simple par adresse en V1.
 * Estimation grossière basée sur la surface (moyenne nationale ~15€/m²/an),
 * à corriger manuellement dès que l'utilisateur a une valeur réelle
 * (avis d'imposition, agence, etc.).
 */
export function estimateTaxeFonciere(surfaceM2: number | null): number | null {
  if (surfaceM2 == null) return null;
  const TAUX_MOYEN_EUR_PAR_M2 = 15;
  return Math.round(surfaceM2 * TAUX_MOYEN_EUR_PAR_M2);
}

/**
 * Charges annuelles récurrentes à la charge du propriétaire (hors taxe
 * foncière et assurance, comptées séparément), estimées au m² :
 *  - Logement en copropriété (~20€/m²/an) : quote-part de charges courantes de
 *    syndic, avec un plancher (un studio a des charges fixes incompressibles).
 *  - Immeuble entier (~12€/m²/an) : pas de copropriété ni de marge de syndic,
 *    mais l'entretien des parties communes et de l'enveloppe reste à la charge
 *    du seul propriétaire ; plancher plus élevé (immeuble = plusieurs lots).
 * À corriger manuellement dès que l'utilisateur a le montant réel (appel de
 * charges, syndic, comptes d'exploitation...).
 */
export function estimateChargesCopro(surfaceM2: number | null, immeuble = false): number {
  const EUR_PAR_M2_AN = immeuble ? 12 : 20;
  const PLANCHER_EUR_AN = immeuble ? 1500 : 800;
  if (surfaceM2 == null || surfaceM2 <= 0) return PLANCHER_EUR_AN;
  return Math.max(PLANCHER_EUR_AN, Math.round(surfaceM2 * EUR_PAR_M2_AN));
}

/**
 * Assurance propriétaire (PNO) : ~150€/an pour un logement unique. Un immeuble
 * assure chacun de ses lots : on multiplie par le nombre de lots (réel ou
 * estimé depuis la surface, voir lotsEffectifs).
 */
export function estimateAssurance(
  immeuble = false,
  nbLots: number | null = null,
  surfaceM2: number | null = null
): number {
  const ASSURANCE_PAR_LOT_EUR_AN = 150;
  if (!immeuble) return ASSURANCE_PAR_LOT_EUR_AN;
  return ASSURANCE_PAR_LOT_EUR_AN * lotsEffectifs(nbLots, surfaceM2);
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
  return {
    ...apt,
    frais_notaire_estimes: apt.champs_manuels.includes("frais_notaire_estimes")
      ? apt.frais_notaire_estimes
      : estimateFraisNotaire(apt.prix, apt.etat_bien),
    taxe_fonciere: fige("taxe_fonciere")
      ? apt.taxe_fonciere
      : estimateTaxeFonciere(apt.surface_m2),
    charges_copro_annuelles: fige("charges_copro_annuelles")
      ? apt.charges_copro_annuelles
      : estimateChargesCopro(apt.surface_m2, immeuble),
    assurance_annuelle: apt.champs_manuels.includes("assurance_annuelle")
      ? apt.assurance_annuelle
      : estimateAssurance(immeuble, apt.nb_lots, apt.surface_m2),
  };
}
