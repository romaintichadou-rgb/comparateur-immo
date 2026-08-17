import type { ApartmentWithComputed } from "./types";
import type { AppSettings, FinancementMode } from "./settings";
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

/**
 * Hypothèses STOCKÉES sur un bien (`apartments.simulation_inputs`).
 *
 * Les quatre champs du profil emprunteur (taux, durée, assurance, TMI) valent
 * `null` — ou sont absents — tant qu'ils ne sont pas surchargés sur ce bien
 * précis : ils sont alors HÉRITÉS du Profil investisseur. Ne jamais les lire
 * directement pour calculer : passer par `resolveInputs`, qui produit le
 * `InputsResolus` attendu par `simulate`.
 */
export interface SimulationInputs {
  /**
   * Capital emprunté (€). null = automatique : suit en temps réel le coût de
   * l'opération, selon le mode de financement du profil (`cout_total` ou
   * `hors_notaire`), y compris pendant la saisie. Une valeur saisie fige le
   * montant — c'est le « montant libre », propre au bien.
   */
  montantEmprunte: number | null;
  /** Taux nominal annuel du crédit, en % (ex. 3.5). null = hérite du profil. */
  tauxCreditPct: number | null;
  /** Durée du crédit en années. null = hérite du profil. */
  dureeAnnees: number | null;
  /** Assurance emprunteur, en % du capital initial par an. null = hérite du profil. */
  tauxAssurancePct: number | null;
  /** Tranche marginale d'imposition, en % (11/30/41/45). null = hérite du profil. */
  tmiPct: number | null;
  /** Revalorisation annuelle du bien, en %. null = désactivée (hypothèse par défaut, la plus prudente). */
  revalorisationBienPct: number | null;
  /** Revalorisation annuelle du loyer, en % (indexation type IRL). null = désactivée. */
  revalorisationLoyerPct: number | null;
  /** Indexation annuelle des charges de copro + taxe foncière, en %. null = désactivée (figées en euros courants). */
  indexationChargesPct: number | null;
  /** Vacance locative, en % du loyer annuel (ex. 5 = 1 mois vide sur 20). null = désactivée (occupation 100 %). */
  vacanceLocativePct: number | null;
  /** Frais de gestion locative, en % du loyer annuel. null = désactivés (occupation gratuite). */
  gestionPct: number | null;
  /**
   * Frais de revente (agence, diagnostics), en % de la valeur du bien au
   * terme. `null` = désactivés — on revend alors sans frottement.
   *
   * ⚠️ N'entre QUE dans le TRI : ni le cash-flow, ni l'impôt, ni le graphe
   * « Évolution du patrimoine » ne le lisent. Ce dernier annonce d'ailleurs
   * explicitement qu'il ignore la fiscalité de la revente — ne pas l'y brancher
   * en croyant harmoniser, les deux blocs ne racontent pas la même chose.
   */
  fraisReventePct: number | null;
  /**
   * Régime fiscal d'imposition des revenus locatifs.
   *
   * `null` (ou clé absente sur un bien antérieur) = `REGIME_FISCAL_DEFAUT`.
   *
   * ⚠️ **Champ DÉCLARATIF pour l'instant** : `simulate()` calcule toujours en
   * LMNP réel, quelle que soit la valeur. Il est stocké et affiché pour que le
   * choix soit explicite et que l'ajout d'un second régime n'ait pas à migrer
   * les données existantes — mais ajouter une entrée à `REGIMES_FISCAUX` ne
   * suffira PAS à le faire calculer : il faudra brancher `simulate` dessus
   * (amortissements, assiette, prélèvements sociaux, report de déficit).
   */
  regimeFiscal: RegimeFiscal | null;
}

/**
 * Régimes fiscaux proposés. Un seul est géré aujourd'hui — la structure existe
 * pour que l'ajout des revenus fonciers (location nue) ou du micro-BIC soit une
 * entrée de plus ici, plus une refonte du champ.
 */
export const REGIMES_FISCAUX = {
  lmnp_reel: "LMNP au réel",
} as const;

export type RegimeFiscal = keyof typeof REGIMES_FISCAUX;

export const REGIME_FISCAL_DEFAUT: RegimeFiscal = "lmnp_reel";

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
  /** Montant effectivement emprunté, APRÈS plafonnement au coût de l'opération. */
  montantEmprunte: number;
  /** true si le montant suit automatiquement le coût de l'opération. */
  montantAutomatique: boolean;
  /**
   * true si un montant SAISI a dû être ramené au coût de l'opération. Sans ce
   * drapeau, le plafond de `capitalEffectif` s'appliquait en silence : l'écran
   * affichait un montant différent de celui saisi, sans jamais dire pourquoi.
   */
  montantPlafonne: boolean;
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
  /**
   * LMNP : cash-flow mensuel moyen sur les années exonérées d'impôt,
   * année 1 toujours incluse. Fallback sur année 1 si aucune année à 0.
   */
  cashflowMensuelMoyenLMNP: number;
  /** Nombre d'années avec impôt = 0 (pour le label). */
  anneesExonerees: number;
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
  /**
   * Taux de rendement interne annualisé de l'opération, au terme du prêt
   * (ex. 0.087 = 8,7 %/an). `null` quand il n'existe pas — voir
   * `triIndisponible`, et ne JAMAIS le rendre par un tiret muet.
   */
  tri: number | null;
  /**
   * Cause de l'absence de TRI, pour que l'écran l'explique au lieu de la subir.
   *
   * `aucun_capital_engage` : l'opération ne demande JAMAIS d'argent — pas
   * d'apport ET aucun cash-flow négatif. Un taux de retour sur un capital nul
   * n'a pas de valeur définie.
   *
   * ⚠️ Ce n'est PAS la même chose qu'« apport nul » : un montage sans apport
   * dont les premières années sont déficitaires engage bien du capital, étalé
   * dans le temps, et son TRI existe. Ne pas rétablir un test sur le seul
   * `apport === 0`, il masquerait un chiffre parfaitement calculable.
   *
   * `pas_de_racine` : la série ne change pas de signe dans l'autre sens (aucun
   * flux positif), ou la racine sort de l'intervalle exploré.
   */
  triIndisponible: "aucun_capital_engage" | "pas_de_racine" | null;
  /** Produit de la revente au terme : valeur revalorisée − frais − capital restant dû. */
  produitNetRevente: number;
}

/**
 * Taux de rendement interne d'une série de flux annuels — `flux[0]` à la date
 * 0, `flux[t]` à la fin de l'année `t`. Renvoie un taux annuel (0.05 = 5 %/an),
 * ou `null` s'il n'en existe pas.
 *
 * ## Pourquoi une dichotomie, et pas Newton-Raphson
 *
 * Newton converge plus vite mais peut DIVERGER selon l'amorce, et rendre alors
 * un nombre plausible qui n'annule rien. La dichotomie ne peut pas : elle
 * conserve un encadrement de la racine à chaque étape. Sur une série d'au plus
 * ~25 termes, recalculer la VAN 200 fois ne coûte rien de mesurable — la
 * robustesse est gratuite ici, il n'y a aucune raison de l'échanger.
 *
 * ## Ce que `null` protège
 *
 * Un TRI n'existe que si la série change de signe : il faut avoir SORTI de
 * l'argent pour qu'un taux de retour ait un sens. Les cas dégénérés (apport
 * nul avec des cash-flows tous positifs) doivent donc remonter à l'appelant,
 * jamais être comblés par une valeur de repli — un « 0 % » inventé se lirait
 * comme une opération médiocre, alors que c'est le calcul qui ne s'applique pas.
 */
export function tauxRendementInterne(flux: number[]): number | null {
  if (flux.length < 2) return null;
  if (!flux.some((f) => f > 0) || !flux.some((f) => f < 0)) return null;

  // −99,99 % : un taux de −100 % annulerait le dénominateur. Borne haute à
  // +1000 %/an, très au-delà de tout montage immobilier réaliste.
  const van = (r: number) => flux.reduce((somme, f, t) => somme + f / Math.pow(1 + r, t), 0);

  let bas = -0.9999;
  let haut = 10;
  let vBas = van(bas);
  const vHaut = van(haut);
  if (!Number.isFinite(vBas) || !Number.isFinite(vHaut)) return null;
  // Racine hors de l'intervalle : ne rien inventer.
  if (vBas === 0) return bas;
  if (vHaut === 0) return haut;
  if (vBas > 0 === vHaut > 0) return null;

  for (let i = 0; i < 200; i++) {
    const milieu = (bas + haut) / 2;
    const vMilieu = van(milieu);
    if (vMilieu === 0) return milieu;
    if (vBas > 0 !== vMilieu > 0) {
      haut = milieu;
    } else {
      bas = milieu;
      vBas = vMilieu;
    }
  }
  return (bas + haut) / 2;
}

// Valeurs par défaut proposées quand l'utilisateur active une hypothèse
// optionnelle (boutons "+" de l'onglet Simulation financière).
export const REVALORISATION_BIEN_DEFAUT_PCT = 1;
export const REVALORISATION_LOYER_DEFAUT_PCT = 1;
export const INDEXATION_CHARGES_DEFAUT_PCT = 2;
export const VACANCE_LOCATIVE_DEFAUT_PCT = 5;
/** Agence (~5-6 %) + diagnostics obligatoires, ordre de grandeur courant. */
export const FRAIS_REVENTE_DEFAUT_PCT = 8;

/**
 * Forme STOCKÉE par défaut d'un bien : tout est hérité ou désactivé, rien n'est
 * figé. Ne contient donc AUCUNE valeur d'emprunteur — celles-ci vivent dans le
 * Profil investisseur. Sert aussi de référence de comparaison « non modifié »
 * dans l'onglet Simulation.
 */
export function defaultInputs(): SimulationInputs {
  return {
    montantEmprunte: null, // auto : suit le coût de l'opération en temps réel
    // Hérités du profil investisseur tant qu'ils ne sont pas surchargés.
    tauxCreditPct: null,
    dureeAnnees: null,
    tauxAssurancePct: null,
    tmiPct: null,
    // Désactivées par défaut : hypothèse la plus prudente (aucune inflation
    // supposée) tant que l'utilisateur ne les active pas explicitement.
    revalorisationBienPct: null,
    revalorisationLoyerPct: null,
    indexationChargesPct: null,
    vacanceLocativePct: null,
    gestionPct: null,
    fraisReventePct: null,
    // null = REGIME_FISCAL_DEFAUT. Non figé ici pour la même raison que les
    // champs hérités : un défaut recopié dans la donnée ne suit plus le code.
    regimeFiscal: null,
  };
}

/**
 * Hypothèses RÉSOLUES, prêtes à calculer : le profil emprunteur y est déjà
 * remplacé par des nombres. C'est ce que `simulate` consomme — il n'a jamais
 * connaissance du profil ni de l'héritage.
 */
export interface InputsResolus extends Omit<
  SimulationInputs,
  "tauxCreditPct" | "dureeAnnees" | "tauxAssurancePct" | "tmiPct" | "regimeFiscal"
> {
  tauxCreditPct: number;
  dureeAnnees: number;
  tauxAssurancePct: number;
  tmiPct: number;
  financementMode: FinancementMode;
  /** Toujours renseigné une fois résolu. `simulate()` ne le lit pas ENCORE. */
  regimeFiscal: RegimeFiscal;
}

/**
 * Applique l'héritage du Profil investisseur — POINT DE PASSAGE UNIQUE.
 *
 * Remplace l'ancien idiome `apt.simulation_inputs ?? defaultInputs()`, qui
 * retombait sur des constantes codées en dur et ignorait donc le profil.
 *
 * `null` ET `undefined` valent « hérite » : la migration 0006 SUPPRIME les clés
 * plutôt que de les mettre à `null`, et un bien créé avant elle n'a pas du tout
 * le champ. Utiliser `??` (et non `||`) — un taux à 0 % ou une TMI à 0 % sont
 * des valeurs légitimes qu'il ne faut pas écraser par le profil.
 */
export function resolveInputs(
  stored: SimulationInputs | null | undefined,
  settings: AppSettings
): InputsResolus {
  const base = stored ?? defaultInputs();
  return {
    ...base,
    tauxCreditPct: base.tauxCreditPct ?? settings.tauxCreditPct,
    dureeAnnees: base.dureeAnnees ?? settings.dureeAnnees,
    tauxAssurancePct: base.tauxAssurancePct ?? settings.tauxAssurancePct,
    tmiPct: base.tmiPct ?? settings.tmiPct,
    financementMode: settings.financementMode,
    regimeFiscal: base.regimeFiscal ?? REGIME_FISCAL_DEFAUT,
  };
}

/**
 * Capital réellement emprunté — SOURCE UNIQUE du plafond.
 *
 * `montantSaisi == null` = mode auto : l'emprunt suit le prix + travaux.
 *
 * INVARIANT : on n'emprunte jamais plus que ce que l'opération coûte. Un
 * montant figé est un montant ABSOLU, saisi à un prix donné ; si le prix baisse
 * ensuite, il reste en l'état et devient une aberration (270 000 € empruntés
 * pour un bien à 215 000 € coût total) qui fausse la mensualité, l'impôt, et
 * donc TOUS les chiffres dérivés — sans le moindre signal à l'écran. Le plafond
 * borne le cas y compris pour les données déjà en base, sans migration.
 *
 * Il laisse passer le prêt « à 110 % » (prix + notaire), qui vaut exactement
 * `coutTotal` : ne pas le resserrer sur le seul prix d'achat.
 */
export function capitalEffectif(
  montantSaisi: number | null,
  montantAuto: number,
  coutTotal: number
): number {
  return Math.min(Math.max(0, montantSaisi ?? montantAuto), Math.max(0, coutTotal));
}

export function simulate(apt: ApartmentWithComputed, inputs: InputsResolus): SimulationResult | null {
  const loyerMensuel = apt.loyer_retenu;
  if (loyerMensuel == null || loyerMensuel <= 0) return null;

  // Base revalorisable : prix + travaux, hors frais de notaire (qui ne créent
  // pas de valeur patrimoniale), même convention que le simulateur de référence.
  const valeurBienInitiale = (apt.prix ?? 0) + (apt.travaux ?? 0);
  // Coût total RÉEL de l'opération (achat + notaire + travaux).
  const coutTotalReel = Math.round(apt.budget_total ?? apt.prix ?? 0);
  // Ce que l'emprunt couvre en mode auto, selon le profil investisseur :
  //  - `hors_notaire` : achat + travaux, le notaire est couvert par l'apport
  //    (pratique bancaire courante, comportement historique de l'app) ;
  //  - `cout_total`   : tout, y compris le notaire — le prêt « à 110 % ».
  const montantAuto =
    inputs.financementMode === "cout_total" ? coutTotalReel : Math.round(valeurBienInitiale);
  const capital = capitalEffectif(inputs.montantEmprunte, montantAuto, coutTotalReel);
  // Apport personnel = coût total − montant emprunté (jamais négatif). Inclut
  // les frais de notaire par défaut, puisqu'ils ne sont pas dans le capital.
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
    const gestionAnnuelle = loyersAnnuels * ((inputs.gestionPct ?? 0) / 100);
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

  // LMNP : moyenne sur les années exonérées (impôt < 1 €), année 1 toujours incluse.
  const anneesExo = annees.filter((a) => a.impot < 1);
  const anneesLMNP = anneesExo.length > 0
    ? (anneesExo[0].annee === 1 ? anneesExo : [an1, ...anneesExo])
    : [an1];
  const cfMoyenLMNP = anneesLMNP.reduce((s, a) => s + a.cashflowMensuel, 0) / anneesLMNP.length;

  // ── TRI : ce que rapporte l'ARGENT ENGAGÉ, pas le bien ────────────────────
  //
  // Le rendement net (`calculations.ts`) divise par le coût total de
  // l'opération, donc il ne bouge pas d'un iota selon le financement. Le TRI
  // part au contraire du seul apport et intègre la revente : c'est le seul
  // chiffre de l'app où l'effet de levier apparaît.
  //
  // ⚠️ La soustraction du `capitalRestantDu` est conservée alors qu'il vaut 0
  // au terme du prêt : elle est ce qui rendra le calcul juste le jour où
  // l'horizon deviendra réglable (le TRI se prendrait alors sur une année où le
  // crédit court encore).
  const produitNetRevente =
    anFinale.valeurBien * (1 - (inputs.fraisReventePct ?? 0) / 100) - anFinale.capitalRestantDu;

  const flux = [-apport, ...annees.map((a) => a.cashflowAnnuel)];
  flux[flux.length - 1] += produitNetRevente;
  const tri = tauxRendementInterne(flux);
  // Distinguer les deux causes permet à l'écran de DIRE pourquoi le chiffre
  // manque, au lieu d'afficher un tiret muet. Le critère est « aucune sortie
  // d'argent », pas « apport nul » — voir l'avertissement sur
  // `triIndisponible`.
  const triIndisponible: SimulationResult["triIndisponible"] =
    tri != null ? null : flux.every((f) => f >= 0) ? "aucun_capital_engage" : "pas_de_racine";

  return {
    montantEmprunte: capital,
    montantAutomatique: inputs.montantEmprunte == null,
    montantPlafonne: inputs.montantEmprunte != null && capital !== inputs.montantEmprunte,
    apport,
    financementProjet,
    mensualiteHorsAssurance,
    assuranceMensuelle,
    mensualiteTotale,
    annees,
    cashflowMensuelAn1: an1.cashflowMensuel,
    cashflowMensuelMoyen: totalCashflow / inputs.dureeAnnees / 12,
    cashflowMensuelMoyenLMNP: cfMoyenLMNP,
    anneesExonerees: anneesExo.length,
    cashflowMensuelAvantImpotAn1: (an1.cashflowAnnuel + an1.impot) / 12,
    totalImpots,
    coutCredit: totalInterets + assuranceMensuelle * 12 * inputs.dureeAnnees,
    amortissements: { bati: amortBati, travaux: amortTravaux, notaire: amortNotaire },
    chargesMensuelles: chargesExploitationAn1 / 12,
    impotMensuelAn1: an1.impot / 12,
    quotePartTerrainPct: terrainPct,
    tri,
    triIndisponible,
    produitNetRevente,
  };
}
