import { z } from "zod";

/**
 * Réglages personnels de l'app — le « Profil investisseur ». Deux familles :
 *
 *  1. les SEUILS vert/ambre/rouge, qui colorent le rendement net et le cash-flow
 *     partout où ils sont affichés (tableau, carte, Analyse, Simulation) ;
 *  2. le PROFIL EMPRUNTEUR (taux, durée, assurance, TMI, mode de financement),
 *     qui décrit la personne, pas le bien — une TMI est une tranche
 *     d'imposition, elle ne peut pas varier d'un appartement à l'autre.
 *
 * Les biens HÉRITENT du profil emprunteur : dans `SimulationInputs`, ces champs
 * valent `null` tant qu'ils ne sont pas surchargés sur un bien précis (voir
 * `resolveInputs` dans `lib/simulation.ts`). Ne pas recopier ces valeurs dans
 * `simulation_inputs` à la création d'un bien : ça figerait le profil au moment
 * de la saisie et un changement ultérieur ne se propagerait plus.
 *
 * Persistés dans la table `app_settings` (Supabase), pour rester la seule
 * source de vérité côté serveur (score/verdicts) comme côté client (affichage).
 */

/** Ce que l'emprunt suit tant qu'aucun montant libre n'est saisi sur le bien. */
export type FinancementMode = "cout_total" | "hors_notaire";

/**
 * Description complète d'un mode, pour un choix éclairé. Les trois niveaux sont
 * distincts et complémentaires — ne pas les fusionner :
 *  - `titre`  : ce que l'emprunt couvre, sans jargon ;
 *  - `detail` : la pratique bancaire derrière, en une phrase ;
 *  - `apport` : la CONSÉQUENCE sur la trésorerie à sortir. C'est le seul des
 *    trois qui répond à « lequel me concerne ? », d'où sa mise en avant.
 */
export const FINANCEMENT_MODE_INFOS: Record<
  FinancementMode,
  { titre: string; detail: string; apport: string }
> = {
  hors_notaire: {
    titre: "Le prix du bien et les travaux",
    detail:
      "Les frais de notaire restent à ta charge. C'est la pratique bancaire la plus courante.",
    apport: "Apport ≈ les frais de notaire",
  },
  cout_total: {
    titre: "L'opération entière, frais de notaire compris",
    detail:
      "Le prêt dit « à 110 % » : la banque finance tout, y compris les frais d'acquisition.",
    apport: "Apport = 0 €",
  },
};

export interface AppSettings {
  /** Rendement net (%) à partir duquel c'est vert ("objectif atteint"). */
  rendementSeuilVertPct: number;
  /** Rendement net (%) en dessous duquel c'est rouge ("rédhibitoire"). */
  rendementSeuilRougePct: number;
  /** Cash-flow mensuel (€) à partir duquel c'est vert ("GO"). */
  cashflowSeuilVertEuros: number;
  /** Cash-flow mensuel (€) en dessous duquel c'est rouge ("alerte"). */
  cashflowSeuilRougeEuros: number;
  /** Taux nominal annuel du crédit, en % (ex. 3.5). */
  tauxCreditPct: number;
  /** Durée du crédit en années. */
  dureeAnnees: number;
  /** Taux d'assurance emprunteur, en % du capital initial par an (ex. 0.3). */
  tauxAssurancePct: number;
  /** Tranche marginale d'imposition, en % (11/30/41/45). */
  tmiPct: number;
  /** Ce que couvre l'emprunt par défaut, à défaut de montant libre sur le bien. */
  financementMode: FinancementMode;
}

export const DEFAULT_SETTINGS: AppSettings = {
  rendementSeuilVertPct: 5.5,
  rendementSeuilRougePct: 4,
  cashflowSeuilVertEuros: 0,
  cashflowSeuilRougeEuros: -200,
  tauxCreditPct: 3.5,
  dureeAnnees: 25,
  tauxAssurancePct: 0.3,
  tmiPct: 30,
  // Pratique bancaire courante : le notaire est plutôt couvert par l'apport.
  // C'est le comportement historique de l'app, gardé par défaut.
  financementMode: "hors_notaire",
};

/** Validation de la mise à jour des réglages (PATCH) : tout est optionnel. */
export const settingsPatchSchema = z
  .object({
    rendementSeuilVertPct: z.number(),
    rendementSeuilRougePct: z.number(),
    cashflowSeuilVertEuros: z.number(),
    cashflowSeuilRougeEuros: z.number(),
    tauxCreditPct: z.number(),
    dureeAnnees: z.number(),
    tauxAssurancePct: z.number(),
    tmiPct: z.number(),
    financementMode: z.enum(["cout_total", "hors_notaire"]),
  })
  .partial();

/**
 * Deux profils sont-ils identiques ? Sert à détecter qu'une analyse stockée a
 * été calculée avec d'AUTRES réglages, et donc à afficher le bandeau
 * « analyse obsolète » (voir `ApartmentDetail`).
 *
 * Comparaison champ par champ à partir de `DEFAULT_SETTINGS` plutôt que
 * `JSON.stringify` : l'ordre des clés d'un objet reconstruit n'est pas garanti,
 * et un simple réordonnancement produirait de faux positifs permanents.
 * Corollaire volontaire : tout nouveau champ ajouté à `AppSettings` invalide
 * automatiquement les analyses antérieures, sans code supplémentaire.
 */
export function memeProfil(a: AppSettings, b: AppSettings): boolean {
  return (Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]).every(
    (cle) => a[cle] === b[cle]
  );
}
