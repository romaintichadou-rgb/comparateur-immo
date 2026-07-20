import type { ApartmentWithComputed } from "./types";
import { defaultQuotePartTerrain } from "./taxeFonciereData";

/**
 * Simulation financière complète d'un investissement locatif en LMNP réel
 * (location meublée non professionnelle), année par année sur la durée du
 * prêt. Inspirée du simulateur Excel de référence : crédit amortissable,
 * charges d'exploitation, fiscalité LMNP au réel avec amortissements
 * comptables plafonnés (art. 39 C : l'amortissement ne peut pas créer de
 * déficit BIC ; l'excédent est reporté sans limite de durée).
 *
 * Tout est déterministe et recalculé en direct côté client.
 */

export interface SimulationInputs {
  /**
   * Capital emprunté (€). null = automatique : suit en temps réel le prix
   * d'achat + les travaux (hors frais de notaire, par défaut non financés —
   * pratique bancaire courante, les notaires étant plutôt couverts par
   * l'apport), y compris les modifications en cours de saisie. Une valeur
   * saisie fige le montant.
   */
  montantEmprunte: number | null;
  /** Taux nominal annuel du crédit, en % (ex. 3.5). */
  tauxCreditPct: number;
  /** Durée du crédit en années. */
  dureeAnnees: number;
  /** Taux d'assurance emprunteur, en % du capital initial par an (ex. 0.3). */
  tauxAssurancePct: number;
  /** Tranche marginale d'imposition, en % (11/30/41/45). */
  tmiPct: number;
  /** Revalorisation annuelle du bien, en %. null = désactivée (hypothèse par défaut, la plus prudente). */
  revalorisationBienPct: number | null;
  /** Revalorisation annuelle du loyer, en % (indexation type IRL). null = désactivée. */
  revalorisationLoyerPct: number | null;
  /** Indexation annuelle des charges de copro + taxe foncière, en %. null = désactivée (figées en euros courants). */
  indexationChargesPct: number | null;
  /** Vacance locative, en % du loyer annuel (ex. 5 = 1 mois vide sur 20). null = désactivée (occupation 100 %). */
  vacanceLocativePct: number | null;
}

/** Hypothèses LMNP réel (calées sur le simulateur de référence). */
export const LMNP = {
  /** Amortissement du bâti : 2,5 %/an (40 ans). */
  tauxBati: 0.025,
  /** Amortissement des travaux : 6,67 %/an (15 ans). */
  tauxTravaux: 1 / 15,
  /** Amortissement des frais de notaire : 20 %/an (5 ans). */
  tauxNotaire: 0.2,
  /** Prélèvements sociaux sur le résultat BIC imposable. */
  prelevementsSociauxPct: 17.2,
} as const;

export interface AnneeSimulation {
  annee: number;
  loyers: number;
  interets: number;
  assuranceEmprunteur: number;
  capitalRembourse: number;
  chargesExploitation: number;
  amortissementsUtilises: number;
  resultatImposable: number;
  impot: number;
  cashflowAnnuel: number;
  cashflowMensuel: number;
  capitalRestantDu: number;
  /** Valeur du bien en fin d'année (prix + travaux, revalorisés). */
  valeurBien: number;
  /** Cumul des flux personnels depuis le début (−apport puis + cash-flows). */
  cumulFluxPersonnel: number;
  /** Part de l'apport pas encore "remboursée" par les cash-flows cumulés. */
  effortEpargne: number;
  /** Richesse nette créée par l'opération (plafonnée à 0). */
  enrichissement: number;
}

/** Répartition de ce qui a financé l'opération sur toute sa durée. */
export interface FinancementProjet {
  loyers: number;
  economieFiscale: number;
  participation: number;
  total: number;
}

export interface SimulationResult {
  /** Montant effectivement emprunté (saisi, ou automatique = budget total). */
  montantEmprunte: number;
  /** true si le montant suit automatiquement le budget total du bien. */
  montantAutomatique: boolean;
  /** Mensualité de crédit hors assurance (€). */
  mensualiteHorsAssurance: number;
  /** Assurance emprunteur mensuelle (€). */
  assuranceMensuelle: number;
  /** Mensualité totale (crédit + assurance). */
  mensualiteTotale: number;
  /** Détail année par année. */
  annees: AnneeSimulation[];
  /** Cash-flow mensuel de la 1re année (après impôt). */
  cashflowMensuelAn1: number;
  /** Cash-flow mensuel moyen sur toute la durée du prêt (après impôt). */
  cashflowMensuelMoyen: number;
  /** Cash-flow mensuel moyen AVANT impôt (année 1). */
  cashflowMensuelAvantImpotAn1: number;
  /** Total des impôts payés sur la durée. */
  totalImpots: number;
  /** Coût total du crédit (intérêts + assurance). */
  coutCredit: number;
  /** Amortissements annuels théoriques (détail affichage). */
  amortissements: { bati: number; travaux: number; notaire: number };
  /** Charges d'exploitation mensuelles (copro + TF + assurance + gestion). */
  chargesMensuelles: number;
  /** Impôt mensuel moyen année 1. */
  impotMensuelAn1: number;
  /** Quote-part terrain effective utilisée (%, ex. 15 = 15 % terrain). */
  quotePartTerrainPct: number;
  /** Apport personnel = montant total de l'opération − montant emprunté. */
  apport: number;
  /** Financement de l'opération sur toute la durée simulée (pour le camembert). */
  financementProjet: FinancementProjet;
}

// Valeurs par défaut proposées quand l'utilisateur active une hypothèse
// optionnelle (boutons "+" de l'onglet Simulation financière).
export const REVALORISATION_BIEN_DEFAUT_PCT = 1;
export const REVALORISATION_LOYER_DEFAUT_PCT = 1;
export const INDEXATION_CHARGES_DEFAUT_PCT = 2;
export const VACANCE_LOCATIVE_DEFAUT_PCT = 5;

export function defaultInputs(): SimulationInputs {
  return {
    montantEmprunte: null, // auto : suit le budget total en temps réel
    tauxCreditPct: 3.5,
    dureeAnnees: 25,
    tauxAssurancePct: 0.3,
    tmiPct: 30,
    // Désactivées par défaut : hypothèse la plus prudente (aucune inflation
    // supposée) tant que l'utilisateur ne les active pas explicitement.
    revalorisationBienPct: null,
    revalorisationLoyerPct: null,
    indexationChargesPct: null,
    vacanceLocativePct: null,
  };
}

export function simulate(apt: ApartmentWithComputed, inputs: SimulationInputs): SimulationResult | null {
  const loyerMensuel = apt.loyer_retenu;
  if (loyerMensuel == null || loyerMensuel <= 0) return null;

  // Base revalorisable : prix + travaux, hors frais de notaire (qui ne créent
  // pas de valeur patrimoniale), même convention que le simulateur de référence.
  const valeurBienInitiale = (apt.prix ?? 0) + (apt.travaux ?? 0);
  // Montant emprunté par défaut : achat + travaux, SANS les frais de notaire
  // (pratique bancaire courante — le notaire est plutôt couvert par l'apport,
  // pas financé à crédit).
  const montantAuto = Math.round(valeurBienInitiale);
  const capital = Math.max(0, inputs.montantEmprunte ?? montantAuto);
  // Apport personnel = coût total RÉEL de l'opération (achat + notaire +
  // travaux) − montant emprunté (jamais négatif). Inclut donc les frais de
  // notaire par défaut, puisqu'ils ne sont plus dans le capital emprunté.
  const coutTotalReel = Math.round(apt.budget_total ?? apt.prix ?? 0);
  const apport = Math.max(0, coutTotalReel - capital);
  const tauxRevalo = (inputs.revalorisationBienPct ?? 0) / 100;
  const tauxMensuel = inputs.tauxCreditPct / 100 / 12;
  const nbMois = Math.max(1, Math.round(inputs.dureeAnnees * 12));

  // Mensualité d'un prêt amortissable ; cas limite taux 0 → capital / n.
  const mensualiteHorsAssurance =
    capital === 0
      ? 0
      : tauxMensuel === 0
        ? capital / nbMois
        : (capital * tauxMensuel) / (1 - Math.pow(1 + tauxMensuel, -nbMois));
  // Assurance sur capital initial (pratique bancaire la plus courante).
  const assuranceMensuelle = (capital * (inputs.tauxAssurancePct / 100)) / 12;
  const mensualiteTotale = mensualiteHorsAssurance + assuranceMensuelle;

  // Exploitation annuelle (valeurs réelles du bien, déjà live-estimées). Le
  // loyer année 1 sert de base ; il est revalorisé chaque année dans la
  // boucle si l'hypothèse est activée. Les charges de copro et la taxe
  // foncière peuvent elles aussi être indexées (hypothèse séparée) ;
  // l'assurance PNO reste toujours constante.
  const loyersAnnuelsAn1 = loyerMensuel * 12;
  const tauxRevaloLoyer = (inputs.revalorisationLoyerPct ?? 0) / 100;
  const tauxIndexationCharges = (inputs.indexationChargesPct ?? 0) / 100;
  const tauxOccupation = 1 - (inputs.vacanceLocativePct ?? 0) / 100;
  const chargesIndexablesAn1 = (apt.charges_copro_annuelles ?? 0) + (apt.taxe_fonciere ?? 0);

  // Quote-part terrain : valeur saisie par l'utilisateur, ou défaut intelligent
  // selon la zone (urbain 10%, périurbain 15%, rural 20%).
  const terrainPct = apt.quote_part_terrain_pct ?? defaultQuotePartTerrain(apt.code_postal);
  const partBati = 1 - terrainPct / 100;

  // Amortissements LMNP réel annuels théoriques.
  const amortBati = (apt.prix ?? 0) * partBati * LMNP.tauxBati;
  const amortTravaux = (apt.travaux ?? 0) * LMNP.tauxTravaux;
  const amortNotaire = (apt.frais_notaire_estimes ?? 0) * LMNP.tauxNotaire;

  const tauxImposition = (inputs.tmiPct + LMNP.prelevementsSociauxPct) / 100;

  const annees: AnneeSimulation[] = [];
  let crd = capital; // capital restant dû
  let reportAmortissements = 0; // excédent d'amortissements reporté (art. 39 C)
  let totalImpots = 0;
  let totalCashflow = 0;
  let totalInterets = 0;
  let totalLoyers = 0;
  // Cumul des flux personnels depuis le début : −apport initial, puis + le
  // cash-flow (positif ou négatif) de chaque année déjà écoulée.
  let cumulFluxPersonnel = -apport;
  let chargesExploitationAn1 = 0; // capturé à la 1re itération, pour le récap "Détail mensuel — année 1"

  for (let a = 1; a <= inputs.dureeAnnees; a++) {
    // Intérêts et capital remboursé de l'année, mois par mois.
    let interetsAnnee = 0;
    let capitalAnnee = 0;
    for (let m = 0; m < 12; m++) {
      const interetMois = crd * tauxMensuel;
      const capitalMois = Math.min(mensualiteHorsAssurance - interetMois, crd);
      interetsAnnee += interetMois;
      capitalAnnee += capitalMois;
      crd = Math.max(0, crd - capitalMois);
    }
    const assuranceAnnee = assuranceMensuelle * 12;

    // Loyer et frais de gestion (qui en sont un pourcentage) revalorisés
    // année après année.
    const loyersAnnuels = loyersAnnuelsAn1 * Math.pow(1 + tauxRevaloLoyer, a - 1) * tauxOccupation;
    const gestionAnnuelle = loyersAnnuels * (apt.hypothese_gestion_pct / 100);
    const chargesIndexables = chargesIndexablesAn1 * Math.pow(1 + tauxIndexationCharges, a - 1);
    const chargesExploitation = chargesIndexables + (apt.assurance_annuelle ?? 0) + gestionAnnuelle;
    if (a === 1) chargesExploitationAn1 = chargesExploitation;

    // Fiscalité LMNP réel : amortissements disponibles selon leur durée de vie.
    const amortDispo =
      amortBati + // 40 ans > durée du prêt : toujours actif
      (a <= 15 ? amortTravaux : 0) +
      (a <= 5 ? amortNotaire : 0) +
      reportAmortissements;

    const chargesDeductibles = chargesExploitation + interetsAnnee + assuranceAnnee;
    const resultatAvantAmort = loyersAnnuels - chargesDeductibles;
    const amortUtilises = Math.min(amortDispo, Math.max(0, resultatAvantAmort));
    reportAmortissements = amortDispo - amortUtilises;

    const resultatImposable = Math.max(0, resultatAvantAmort - amortUtilises);
    const impot = resultatImposable * tauxImposition;

    const cashflowAnnuel =
      loyersAnnuels - chargesExploitation - mensualiteTotale * 12 - impot;

    totalImpots += impot;
    totalCashflow += cashflowAnnuel;
    totalInterets += interetsAnnee;
    totalLoyers += loyersAnnuels;
    cumulFluxPersonnel += cashflowAnnuel;

    // Patrimoine en fin d'année : valeur du bien revalorisée, effort d'épargne
    // encore "à récupérer" (apport net des cash-flows cumulés), et enrichissement
    // (équité + éventuel surplus de cash-flow déjà généré au-delà de l'apport).
    const valeurBien = valeurBienInitiale * Math.pow(1 + tauxRevalo, a);
    const effortEpargne = Math.max(-cumulFluxPersonnel, 0);
    const enrichissement = Math.max(valeurBien - crd + cumulFluxPersonnel, 0);

    annees.push({
      annee: a,
      loyers: loyersAnnuels,
      interets: interetsAnnee,
      assuranceEmprunteur: assuranceAnnee,
      capitalRembourse: capitalAnnee,
      chargesExploitation,
      amortissementsUtilises: amortUtilises,
      resultatImposable,
      impot,
      cashflowAnnuel,
      cashflowMensuel: cashflowAnnuel / 12,
      capitalRestantDu: crd,
      valeurBien,
      cumulFluxPersonnel,
      effortEpargne,
      enrichissement,
    });
  }

  const an1 = annees[0];
  const anFinale = annees[annees.length - 1];

  // Financement du projet sur toute la durée simulée : la part venant des
  // loyers collectés, d'une économie fiscale (toujours nulle en LMNP réel —
  // l'amortissement est plafonné par le résultat, donc jamais de déficit
  // reportable, art. 39 C), et la part encore portée par l'apport personnel
  // non récupéré au terme (= l'effort d'épargne de la dernière année).
  const participation = anFinale.effortEpargne;
  const economieFiscale = 0;
  const financementProjet: FinancementProjet = {
    loyers: totalLoyers,
    economieFiscale,
    participation,
    total: totalLoyers + economieFiscale + participation,
  };

  return {
    montantEmprunte: capital,
    montantAutomatique: inputs.montantEmprunte == null,
    apport,
    financementProjet,
    mensualiteHorsAssurance,
    assuranceMensuelle,
    mensualiteTotale,
    annees,
    cashflowMensuelAn1: an1.cashflowMensuel,
    cashflowMensuelMoyen: totalCashflow / inputs.dureeAnnees / 12,
    cashflowMensuelAvantImpotAn1: (an1.cashflowAnnuel + an1.impot) / 12,
    totalImpots,
    coutCredit: totalInterets + assuranceMensuelle * 12 * inputs.dureeAnnees,
    amortissements: { bati: amortBati, travaux: amortTravaux, notaire: amortNotaire },
    chargesMensuelles: chargesExploitationAn1 / 12,
    impotMensuelAn1: an1.impot / 12,
    quotePartTerrainPct: terrainPct,
  };
}
