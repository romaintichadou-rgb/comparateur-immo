import type { Apartment, ApartmentWithComputed } from "./types";
import { applyLiveEstimates } from "./estimates";

/**
 * Tous les champs de cette fonction sont recalculés à la volée à partir des
 * valeurs sources (prix, loyer_retenu, charges...). Rien ici n'est jamais
 * stocké dans le Sheet, pour rester cohérent si l'utilisateur modifie un
 * prix ou un loyer a posteriori. Les champs estimables encore en mode auto
 * (frais de notaire, taxe foncière, charges copro) sont eux-mêmes
 * recalculés en premier via applyLiveEstimates, pour ne jamais rester figés
 * sur leur valeur de création.
 */
export function computeDerived(apartment: Apartment): ApartmentWithComputed {
  const apt = applyLiveEstimates(apartment);

  // Prix/m² tient compte du prix d'achat ET des travaux (coût réel total
  // rapporté à la surface), pas seulement du prix affiché sur l'annonce.
  const prix_m2 =
    apt.prix != null && apt.surface_m2 != null && apt.surface_m2 > 0
      ? (apt.prix + (apt.travaux ?? 0)) / apt.surface_m2
      : null;

  // Charges de copro et taxe foncière sont des charges récurrentes annuelles,
  // pas un coût d'acquisition : elles n'entrent pas dans le budget_total
  // (cohérent avec rendement_brut = loyer_retenu * 12 / budget_total).
  // Les travaux sont en revanche un coût d'acquisition ponctuel, au même
  // titre que les frais de notaire.
  const budget_total =
    apt.prix != null
      ? apt.prix + (apt.frais_notaire_estimes ?? 0) + (apt.travaux ?? 0)
      : null;

  const loyerAnnuel = apt.loyer_retenu != null ? apt.loyer_retenu * 12 : null;

  const rendement_brut =
    loyerAnnuel != null && budget_total != null && budget_total > 0
      ? loyerAnnuel / budget_total
      : null;

  let rendement_net: number | null = null;
  if (loyerAnnuel != null && budget_total != null && budget_total > 0) {
    const chargesAnnuellesTotales =
      (apt.charges_copro_annuelles ?? 0) +
      (apt.taxe_fonciere ?? 0) +
      (apt.assurance_annuelle ?? 0) +
      loyerAnnuel * (apt.hypothese_gestion_pct / 100);

    rendement_net = (loyerAnnuel - chargesAnnuellesTotales) / budget_total;
  }

  return {
    ...apt,
    prix_m2,
    budget_total,
    rendement_brut,
    rendement_net,
  };
}
