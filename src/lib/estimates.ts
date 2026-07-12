import type { Apartment } from "./types";

/**
 * Heuristiques simples pour pré-remplir les champs financiers estimés à
 * l'ajout d'un bien. Volontairement basiques pour la V1 (voir CLAUDE
 * "à affiner") — l'utilisateur peut toujours corriger ces valeurs, ce qui
 * fait disparaître leur badge "estimé" (voir champs_manuels).
 */

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
 * Charges de copropriété annuelles : estimées au m² (~20€/m²/an, ordre de
 * grandeur usuel pour des charges courantes hors travaux exceptionnels), avec
 * un plancher pour les petites surfaces (un studio a des charges fixes de
 * syndic/assurance d'immeuble incompressibles) — à corriger manuellement dès
 * que l'utilisateur a le montant réel (appel de charges, syndic...).
 */
export function estimateChargesCopro(surfaceM2: number | null): number {
  const CHARGES_COPRO_EUR_PAR_M2_AN = 20;
  const CHARGES_COPRO_PLANCHER_EUR_AN = 800;
  if (surfaceM2 == null || surfaceM2 <= 0) return CHARGES_COPRO_PLANCHER_EUR_AN;
  return Math.max(CHARGES_COPRO_PLANCHER_EUR_AN, Math.round(surfaceM2 * CHARGES_COPRO_EUR_PAR_M2_AN));
}

/**
 * Assurance propriétaire (PNO) : montant fixe par défaut (150€/an).
 */
export function estimateAssurance(): number {
  const ASSURANCE_PAR_DEFAUT_EUR_AN = 150;
  return ASSURANCE_PAR_DEFAUT_EUR_AN;
}

/**
 * Recalcule les champs estimables encore en mode "auto" (absents de
 * champs_manuels) à partir des valeurs actuelles du bien, au lieu de se fier
 * à l'estimation figée au moment de la création. Appelé à chaque lecture
 * (liste, fiche, réponses d'API) pour que ces champs — et tout ce qui en
 * dépend (budget_total, rendements) — restent cohérents partout dès que
 * prix/surface/état changent, sans attendre une action explicite sur le
 * champ estimé lui-même.
 */
export function applyLiveEstimates(apt: Apartment): Apartment {
  return {
    ...apt,
    frais_notaire_estimes: apt.champs_manuels.includes("frais_notaire_estimes")
      ? apt.frais_notaire_estimes
      : estimateFraisNotaire(apt.prix, apt.etat_bien),
    taxe_fonciere: apt.champs_manuels.includes("taxe_fonciere")
      ? apt.taxe_fonciere
      : estimateTaxeFonciere(apt.surface_m2),
    charges_copro_annuelles: apt.champs_manuels.includes("charges_copro_annuelles")
      ? apt.charges_copro_annuelles
      : estimateChargesCopro(apt.surface_m2),
    assurance_annuelle: apt.champs_manuels.includes("assurance_annuelle")
      ? apt.assurance_annuelle
      : estimateAssurance(),
  };
}
