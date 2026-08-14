import type { AnalyseResume } from "@/lib/types";
import type { BlocAnalyse, Decision, Verdict } from "./types";

/**
 * Décision d'achat à 3 niveaux — SOURCE UNIQUE, partagée par l'onglet Analyse
 * (`AnalyseIA`), l'onglet Optimiser (`OptimiserView`) et le moteur de
 * recommandations. Dérivée des signaux existants (score, verdicts, écart au
 * prix de marché), jamais recalculée à la main ailleurs pour ne pas diverger.
 *
 * - `passe`   : un verdict `alerte` **objectif** existe OU score < 5.
 * - `achete`  : score ≥ 7 ET aucun verdict `attention` ET pas de surcote
 *               (écart au marché ≤ 5 %). GO volontairement exigeant.
 * - `negocie` : sinon.
 */
export type { Decision };

/** Écart au prix de marché (%) tel que porté par le bloc Prix, ou null. */
export function ecartPrixMarche(prixBloc: BlocAnalyse | undefined): number | null {
  // `faits` est typé obligatoire, mais une analyse stockée dans un schéma
  // antérieur peut ne pas l'avoir : le type ne garantit pas la forme réelle du
  // JSON en base. Garde obligatoire (cf. AGENTS.md, causes de panne connues).
  const fait = prixBloc?.faits?.find((f) => f.label === "Écart au prix de marché");
  if (fait?.value == null) return null;
  const n = Number(String(fait.value).replace("+", ""));
  return Number.isNaN(n) ? null : n;
}

/**
 * ⚠️ **Un verdict `origine: "bloc"` ne condamne PAS le bien.**
 *
 * Ces verdicts sont, par construction, la simple relecture d'un sous-score
 * (« Prix trop élevé » = le bloc Prix est à 2/10). Or ce sous-score est DÉJÀ
 * dans la note globale, au poids de son bloc. Le laisser opposer un veto
 * comptait la même information deux fois : une fois comme ingrédient de la
 * moyenne, une fois comme couperet annulant cette moyenne. Constaté en vrai —
 * un bien à 6,6/10 (rendement 7, potentiel 9,5, risques 9,8) affichait « Passe
 * ton chemin » sur le seul motif d'un prix élevé, et le texte affirmait
 * qu'« une négociation ne le rattrape pas » alors que l'onglet Optimiser
 * calculait justement le prix à négocier.
 *
 * Restent bloquants les verdicts `critere` : rendement sous le seuil
 * rédhibitoire du profil, DPE F/G interdit à la location. Ceux-là n'existent
 * nulle part ailleurs dans l'écran et ne se négocient pas.
 *
 * `origine` absente = analyse d'un schéma antérieur : on ne peut pas savoir,
 * on garde donc l'ancien comportement (bloquant) plutôt que d'assouplir à
 * l'aveugle.
 */
export function computeDecision(
  score: number | null,
  verdicts: Verdict[],
  ecartPct: number | null
): Decision {
  if (score == null) return "passe";
  const alerte = verdicts.some((v) => v.niveau === "alerte" && v.origine !== "bloc");
  const attention = verdicts.some((v) => v.niveau === "attention");
  const surcote = ecartPct != null && ecartPct > 5;
  if (alerte || score < 5) return "passe";
  if (score >= 7 && !attention && !surcote) return "achete";
  return "negocie";
}

/** Décision + écart marché dérivés d'une analyse complète. */
/**
 * Prend un `AnalyseResume` et non un `AnalyseIA` complet : la décision ne
 * dépend que du score, des verdicts et du bloc Prix — c'est précisément ce que
 * l'accueil charge (voir `listApartments`). Une analyse complète reste
 * acceptée, elle satisfait ce contrat.
 */
export function decisionFromAnalyse(analyse: AnalyseResume): {
  decision: Decision;
  ecartPct: number | null;
} {
  const ecartPct = ecartPrixMarche(analyse.blocs?.prix);
  return {
    decision: computeDecision(analyse.score_global, analyse.verdicts ?? [], ecartPct),
    ecartPct,
  };
}
