import { z } from "zod";

/**
 * Réglages personnels de l'app : les seuils vert/ambre/rouge utilisés pour
 * colorer le rendement net et le cash-flow mensuel partout où ils sont
 * affichés (tableau, carte, Analyse IA, Simulation financière). Persistés
 * Persistés dans la table `app_settings` (Supabase), pour rester la seule
 * source de vérité côté serveur (score/verdicts) comme côté client (affichage).
 */

export interface AppSettings {
  /** Rendement net (%) à partir duquel c'est vert ("objectif atteint"). */
  rendementSeuilVertPct: number;
  /** Rendement net (%) en dessous duquel c'est rouge ("rédhibitoire"). */
  rendementSeuilRougePct: number;
  /** Cash-flow mensuel (€) à partir duquel c'est vert ("GO"). */
  cashflowSeuilVertEuros: number;
  /** Cash-flow mensuel (€) en dessous duquel c'est rouge ("alerte"). */
  cashflowSeuilRougeEuros: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  rendementSeuilVertPct: 5.5,
  rendementSeuilRougePct: 4,
  cashflowSeuilVertEuros: 0,
  cashflowSeuilRougeEuros: -200,
};

/** Validation de la mise à jour des réglages (PATCH) : tout est optionnel. */
export const settingsPatchSchema = z
  .object({
    rendementSeuilVertPct: z.number(),
    rendementSeuilRougePct: z.number(),
    cashflowSeuilVertEuros: z.number(),
    cashflowSeuilRougeEuros: z.number(),
  })
  .partial();
