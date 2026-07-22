import type { AnalyseIA, BlocAnalyse, Decision, Verdict } from "./types";

/**
 * Décision d'achat à 3 niveaux — SOURCE UNIQUE, partagée par l'onglet Synthèse
 * (`SyntheseView`), l'onglet Optimiser (`OptimiserView`) et le moteur de
 * recommandations. Dérivée des signaux existants (score, verdicts, écart au
 * prix de marché), jamais recalculée à la main ailleurs pour ne pas diverger.
 *
 * - `passe`   : un verdict `alerte` existe OU score < 5.
 * - `achete`  : score ≥ 7 ET aucun verdict `attention` ET pas de surcote
 *               (écart au marché ≤ 5 %). GO volontairement exigeant.
 * - `negocie` : sinon.
 */
export type { Decision };

/** Écart au prix de marché (%) tel que porté par le bloc Prix, ou null. */
export function ecartPrixMarche(prixBloc: BlocAnalyse | undefined): number | null {
  const fait = prixBloc?.faits.find((f) => f.label === "Écart au prix de marché");
  if (fait?.value == null) return null;
  const n = Number(String(fait.value).replace("+", ""));
  return Number.isNaN(n) ? null : n;
}

export function computeDecision(
  score: number | null,
  verdicts: Verdict[],
  ecartPct: number | null
): Decision {
  if (score == null) return "passe";
  const alerte = verdicts.some((v) => v.niveau === "alerte");
  const attention = verdicts.some((v) => v.niveau === "attention");
  const surcote = ecartPct != null && ecartPct > 5;
  if (alerte || score < 5) return "passe";
  if (score >= 7 && !attention && !surcote) return "achete";
  return "negocie";
}

/** Décision + écart marché dérivés d'une analyse complète. */
export function decisionFromAnalyse(analyse: AnalyseIA): {
  decision: Decision;
  ecartPct: number | null;
} {
  const ecartPct = ecartPrixMarche(analyse.blocs.prix);
  return {
    decision: computeDecision(analyse.score_global, analyse.verdicts, ecartPct),
    ecartPct,
  };
}
