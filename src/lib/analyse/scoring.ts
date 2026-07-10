import { DEFAULT_SETTINGS, type AppSettings } from "../settings";
import type { AnalyseIA, BlocAnalyse, BlocKey, Verdict } from "./types";

/**
 * Seuils de rendement net (objectif principal : la rentabilité locative), en
 * fraction (0.04 = 4 %). En dessous du seuil rédhibitoire, un bien ne remplit
 * pas l'objectif : le score global est plafonné ET un verdict d'alerte est
 * émis, quel que soit le reste (un excellent prix ne compense pas un
 * rendement qui ne couvre pas le coût du crédit + la fiscalité).
 *
 * Configurables par l'utilisateur (page Paramètres, persistés dans
 * l'AppSettings) — les valeurs par défaut ci-dessous ne servent que de repli
 * si les réglages n'ont pas pu être chargés.
 */
export interface RendementSeuils {
  redhibitoire: number;
  modeste: number;
}

export const SEUILS_RENDEMENT_DEFAUT: RendementSeuils = {
  redhibitoire: DEFAULT_SETTINGS.rendementSeuilRougePct / 100,
  modeste: DEFAULT_SETTINGS.rendementSeuilVertPct / 100,
};

export function seuilsRendementFromSettings(settings: AppSettings): RendementSeuils {
  return {
    redhibitoire: settings.rendementSeuilRougePct / 100,
    modeste: settings.rendementSeuilVertPct / 100,
  };
}

/**
 * Tonalité du rendement net, dérivée des MÊMES seuils que le score et les
 * verdicts — pour que la couleur affichée corresponde toujours à la même
 * logique de décision, partout dans l'app (Analyse IA, Détails de
 * l'opération, tableau, carte). "neutral" seulement si la donnée est
 * indisponible.
 */
export type RendementTone = "positif" | "attention" | "alerte" | "neutral";

export function rendementNetTone(
  rendementNet: number | null,
  seuils: RendementSeuils = SEUILS_RENDEMENT_DEFAUT
): RendementTone {
  if (rendementNet == null) return "neutral";
  if (rendementNet >= seuils.modeste) return "positif";
  if (rendementNet >= seuils.redhibitoire) return "attention";
  return "alerte";
}

/**
 * Couleur de bordure au survol, pour CHAQUE composant cliquable affichant un
 * rendement (tableau, carte, fiche détaillée, Analyse IA) : source unique
 * pour que cette bordure soit toujours dans la même teinte que la tonalité
 * affichée (jamais une couleur fixe comme indigo, sans rapport avec la box).
 */
export const RENDEMENT_HOVER_RING: Record<RendementTone, string> = {
  neutral: "hover:ring-2 hover:ring-inset hover:ring-ink-200",
  positif: "hover:ring-2 hover:ring-inset hover:ring-emerald-200",
  attention: "hover:ring-2 hover:ring-inset hover:ring-amber-200",
  alerte: "hover:ring-2 hover:ring-inset hover:ring-red-200",
};

/**
 * Calcul de la note globale /10, pondérée par bloc, avec plafonds rédhibitoires.
 *
 * - Seuls les blocs notés entrent dans la moyenne (poids renormalisés).
 * - Plafond risque : risque <= 4 → global plafonné à 4.
 * - Plafond rendement : rendement net < seuil rédhibitoire → global plafonné
 *   à 5 (l'objectif locatif n'est pas rempli). C'est le garde-fou contre la
 *   "dilution" d'un point rédhibitoire par la moyenne pondérée.
 */
export function computeScoreGlobal(
  blocs: Record<BlocKey, BlocAnalyse>,
  rendementNet: number | null,
  seuils: RendementSeuils = SEUILS_RENDEMENT_DEFAUT
): number | null {
  const notes = (Object.values(blocs) as BlocAnalyse[]).filter((b) => b.note != null);
  if (notes.length === 0) return null;

  const poidsTotal = notes.reduce((s, b) => s + b.poids, 0);
  if (poidsTotal === 0) return null;

  let global = notes.reduce((s, b) => s + (b.note as number) * b.poids, 0) / poidsTotal;

  const risque = blocs.risque;
  if (risque.note != null && risque.note <= 4) global = Math.min(global, 4);

  if (rendementNet != null && rendementNet < seuils.redhibitoire) {
    global = Math.min(global, 5);
  }

  return round1(global);
}

/** Applique la note globale à une analyse (mutation-free). */
export function withScoreGlobal(
  analyse: AnalyseIA,
  rendementNet: number | null,
  seuils: RendementSeuils = SEUILS_RENDEMENT_DEFAUT
): AnalyseIA {
  return { ...analyse, score_global: computeScoreGlobal(analyse.blocs, rendementNet, seuils) };
}

/**
 * Verdicts textuels indépendants du score : ils nomment explicitement les
 * points rédhibitoires ou de vigilance, en tête d'analyse, pour qu'ils ne
 * soient jamais noyés dans un score composite « visuellement rassurant ».
 */
export function buildVerdicts(
  blocs: Record<BlocKey, BlocAnalyse>,
  rendementNet: number | null,
  seuils: RendementSeuils = SEUILS_RENDEMENT_DEFAUT
): Verdict[] {
  const verdicts: Verdict[] = [];

  // 1) Gate rendement (objectif prioritaire) — en tête.
  if (rendementNet != null) {
    const pct = (rendementNet * 100).toFixed(1).replace(".", ",");
    if (rendementNet < seuils.redhibitoire) {
      verdicts.push({
        niveau: "alerte",
        titre: "Rendement insuffisant",
        detail: `Rendement net ~${pct} %, sous le seuil de ${(seuils.redhibitoire * 100).toFixed(0)} % : ce bien ne remplit pas l'objectif locatif principal. Après coût du crédit et fiscalité, le cash-flow risque d'être négatif.`,
      });
    } else if (rendementNet < seuils.modeste) {
      verdicts.push({
        niveau: "attention",
        titre: "Rendement modeste",
        detail: `Rendement net ~${pct} %, correct mais sans marge : à valider selon ton coût de financement et ta fiscalité.`,
      });
    }
  }

  // 2) Tout bloc noté ≤ 5/10 remonte comme point d'attention critique.
  for (const b of Object.values(blocs) as BlocAnalyse[]) {
    if (b.note != null && b.note <= 5) {
      verdicts.push({
        niveau: b.note <= 4 ? "alerte" : "attention",
        titre: `${b.titre} faible (${b.note}/10)`,
        detail: "Un des critères est défavorable — voir le détail du bloc ci-dessous.",
      });
    }
  }

  // 3) Points forts marquants (note ≥ 9/10) — équilibre, en dernier, max 2.
  const forts = (Object.values(blocs) as BlocAnalyse[])
    .filter((b) => b.note != null && (b.note as number) >= 9)
    .sort((a, b) => (b.note as number) - (a.note as number))
    .slice(0, 2);
  for (const b of forts) {
    verdicts.push({
      niveau: "positif",
      titre: `${b.titre} (${b.note}/10)`,
      detail: "Point fort du bien — voir le détail du bloc ci-dessous.",
    });
  }

  return verdicts;
}

export function clampNote(n: number): number {
  return round1(Math.max(0, Math.min(10, n)));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
