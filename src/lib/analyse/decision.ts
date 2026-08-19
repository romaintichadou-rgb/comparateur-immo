import type { AnalyseResume } from "@/lib/types";
import type { BlocAnalyse, BlocKey, Decision, Verdict } from "./types";
import type { RendementSeuils } from "./scoring";

/**
 * Décision d'achat à 3 niveaux — SOURCE UNIQUE, partagée par l'onglet Analyse
 * (`AnalyseIA`), l'onglet Recommandations (`OptimiserView`) et le moteur de
 * recommandations. Fondée sur les signaux RÉELS du bien et du marché, pas sur
 * un seuil arbitraire du score composite.
 *
 * - `passe`   : un verdict `alerte` objectif existe OU score < 4.
 * - `achete`  : TOUS les signaux convergent — prix vérifié et au marché,
 *               rendement ≥ seuil vert du profil, aucun bloc < 5/10, aucun
 *               verdict attention, données DVF disponibles.
 * - `negocie` : au moins un signal n'est pas au vert, sans être rédhibitoire.
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
 * Notes de tous les blocs pondérés — format léger utilisé par `computeDecision`
 * pour vérifier qu'aucun bloc n'est faible, sans exiger les objets
 * `BlocAnalyse` complets (qui portent faits, narrations, sources…).
 */
export type BlocNotes = Partial<Record<BlocKey, number | null>>;

/** Extrait les notes des blocs pondérés (poids > 0, note non null). */
export function extractBlocNotes(blocs: Partial<Record<BlocKey, BlocAnalyse>>): BlocNotes {
  const out: BlocNotes = {};
  for (const [k, b] of Object.entries(blocs) as [BlocKey, BlocAnalyse | undefined][]) {
    if (b && b.poids > 0 && b.note != null) out[k] = b.note;
  }
  return out;
}

/**
 * ⚠️ **Un verdict `origine: "bloc"` ne condamne PAS le bien.**
 *
 * Restent bloquants les verdicts `critere` : rendement sous le seuil
 * rédhibitoire du profil, DPE F/G interdit à la location. Ceux-là n'existent
 * nulle part ailleurs dans l'écran et ne se négocient pas.
 *
 * `origine` absente = analyse d'un schéma antérieur : on ne peut pas savoir,
 * on garde donc l'ancien comportement (bloquant) plutôt que d'assouplir à
 * l'aveugle.
 *
 * La décision ACHETER est un diagnostic multi-critères : tous les signaux
 * doivent être au vert. Un seuil fixe sur le score composite (ex. ≥ 7)
 * masquait l'hétérogénéité des blocs et ignorait des données clés (rendement
 * vs seuil du profil, disponibilité des données DVF).
 */
export function computeDecision(
  score: number | null,
  verdicts: Verdict[],
  ecartPct: number | null,
  blocNotes: BlocNotes = {},
  rendementNet: number | null = null,
  seuils: RendementSeuils | null = null,
): Decision {
  if (score == null) return "passe";

  // ── PASSER ──
  const alerteCritere = verdicts.some((v) => v.niveau === "alerte" && v.origine !== "bloc");
  if (alerteCritere || score < 4) return "passe";

  // ── ACHETER — tous les signaux doivent converger ──
  const attention = verdicts.some((v) => v.niveau === "attention");
  const prixDisponible = blocNotes.prix !== undefined;
  const prixAuMarche = ecartPct != null && ecartPct <= 0;
  const rendementOk = rendementNet != null && seuils != null && rendementNet >= seuils.modeste;
  const notesPonderees = Object.values(blocNotes).filter((n): n is number => n != null);
  const aucunBlocFaible = notesPonderees.length > 0 && notesPonderees.every((n) => n >= 5);

  if (!attention && prixDisponible && prixAuMarche && rendementOk && aucunBlocFaible) {
    return "achete";
  }

  // ── NÉGOCIER ──
  return "negocie";
}

/**
 * Décision + écart marché dérivés d'une analyse résumée et des données
 * complémentaires (rendement net, seuils).
 *
 * Prend un `AnalyseResume` (ce que l'accueil charge) enrichi du rendement net
 * et des seuils du profil. Les blocs notes sont extraits des blocs du résumé.
 */
export function decisionFromAnalyse(
  analyse: AnalyseResume,
  rendementNet: number | null = null,
  seuils: RendementSeuils | null = null,
): {
  decision: Decision;
  ecartPct: number | null;
} {
  const ecartPct = ecartPrixMarche(analyse.blocs?.prix);
  const notes = extractBlocNotes(analyse.blocs ?? {});
  return {
    decision: computeDecision(
      analyse.score_global,
      analyse.verdicts ?? [],
      ecartPct,
      notes,
      rendementNet,
      seuils,
    ),
    ecartPct,
  };
}
