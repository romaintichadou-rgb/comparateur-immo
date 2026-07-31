import type { ApartmentWithComputed } from "@/lib/types";
import type { AppSettings } from "@/lib/settings";
import { resolveInputs, simulate, type AnneeSimulation } from "@/lib/simulation";
import { cashflowSeuilsFromSettings, cashflowTone, clampNote } from "../scoring";
import { formatEurosSigned } from "@/lib/format";
import { BLOC_LABELS, BLOC_POIDS, type BlocAnalyse, type BlocHighlight, type Fait } from "../types";

/**
 * Bloc "Simulation financière" — résume l'onglet du même nom : cash-flow réel
 * en LMNP au réel (crédit amortissable, charges d'exploitation, fiscalité
 * avec amortissements plafonnés art. 39 C). Utilise les hypothèses de crédit
 * et de revalorisation enregistrées par l'utilisateur dans l'onglet
 * Simulation financière (apartment.simulation_inputs) quand elles existent,
 * sinon le scénario standard par défaut (defaultInputs()).
 *
 * Note /10 purement déterministe : dérivée du cash-flow mensuel MOYEN sur
 * toute la durée du crédit (indicateur le plus représentatif, lisse les
 * variations d'une année sur l'autre), situé par rapport aux seuils
 * personnels de cash-flow (page Profil investisseur) — mêmes seuils que ceux
 * utilisés pour colorer le cash-flow dans l'onglet Simulation financière.
 */

const SRC_CALC = "Calcul — simulation LMNP";

export function buildBlocSimulation(apt: ApartmentWithComputed, settings: AppSettings): BlocAnalyse {
  // Utilise les hypothèses réellement enregistrées sur le bien, complétées par
  // le profil emprunteur pour tout ce qui n'y est pas surchargé — pour que le
  // score reflète ce que l'utilisateur a effectivement modélisé.
  const result = simulate(apt, resolveInputs(apt.simulation_inputs, settings));

  if (!result) {
    return {
      cle: "simulation",
      titre: BLOC_LABELS.simulation,
      note: null,
      poids: BLOC_POIDS.simulation,
      disponible: false,
      faits: [],
      sources: [],
      narration: "",
      messageIndisponible:
        "Loyer ou prix manquant : impossible de simuler le crédit et le cash-flow.",
    };
  }

  const seuils = cashflowSeuilsFromSettings(settings);
  const cfAn1 = result.cashflowMensuelAn1;
  const cfMoyen = result.cashflowMensuelMoyen;

  // Source unique (scoring.ts) : mêmes seuils, même tonalité que les
  // MetricCards, l'onglet Optimiser et le tableau de simulation.
  const tone = (v: number) => cashflowTone(v, seuils) as "positif" | "attention" | "alerte";

  const highlights: BlocHighlight[] = [
    { label: "Cash-flow mensuel — année 1", value: formatEurosSigned(cfAn1), tone: tone(cfAn1) },
    { label: "Cash-flow mensuel moyen", value: formatEurosSigned(cfMoyen), tone: tone(cfMoyen) },
  ];

  const faits: Fait[] = [
    {
      label: "Mensualité de crédit",
      value: Math.round(result.mensualiteTotale),
      unit: "€/mois",
      detail: "assurance incluse",
      source: SRC_CALC,
      gravite: "info",
    },
    {
      label: "Apport personnel nécessaire",
      value: Math.round(result.apport),
      unit: "€",
      source: SRC_CALC,
      gravite: "info",
    },
    anneesSansImpotFait(result.annees),
  ];

  // Note /10 = facteur principal (CF année 1 vs seuils profil, 70%) +
  // soutenabilité (dégradation CF moyen vs an1, 30%) + ajustement fiscal.
  const range = Math.max(seuils.vert - seuils.rouge, 50);

  // Facteur principal : cash-flow année 1 situé par rapport aux seuils profil.
  let scoreAn1: number;
  if (cfAn1 >= seuils.vert + range) scoreAn1 = 5;
  else if (cfAn1 >= seuils.vert)
    scoreAn1 = 4 + Math.min((cfAn1 - seuils.vert) / range, 1);
  else if (cfAn1 >= seuils.rouge)
    scoreAn1 = 2 + 2 * ((cfAn1 - seuils.rouge) / (seuils.vert - seuils.rouge));
  else if (cfAn1 >= seuils.rouge - range)
    scoreAn1 = Math.max(0, 2 * ((cfAn1 - (seuils.rouge - range)) / range));
  else scoreAn1 = 0;

  // Facteur secondaire : soutenabilité dans le temps. Si le CF moyen se
  // dégrade par rapport à l'année 1, pénalité proportionnelle ; s'il
  // s'améliore, léger bonus.
  let soutenabilite = 0;
  const delta = cfMoyen - cfAn1;
  if (delta < -range) soutenabilite = -1;
  else if (delta < 0) soutenabilite = -1 * (Math.abs(delta) / range);
  else if (delta > range * 0.5) soutenabilite = 0.5;
  else if (delta > 0) soutenabilite = 0.5 * (delta / (range * 0.5));

  let base = scoreAn1 * 0.7 + (scoreAn1 + soutenabilite) * 0.3;

  // Avantage fiscal LMNP : des années sans impôt améliorent la rentabilité
  // réelle, pas d'avantage fiscal = charge supplémentaire dès le départ.
  const nbAnneesSansImpot = result.annees.findIndex((a) => a.impot >= 1);
  const anneesSansImpotEff = nbAnneesSansImpot === -1 ? result.annees.length : nbAnneesSansImpot;
  if (anneesSansImpotEff >= 10) base += 0.5;
  else if (anneesSansImpotEff >= 5) base += 0.25;
  else if (anneesSansImpotEff === 0) base -= 0.25;

  const note = clampNote(Math.max(0, base) * 2);

  return {
    cle: "simulation",
    titre: BLOC_LABELS.simulation,
    note,
    poids: BLOC_POIDS.simulation,
    highlights,
    disponible: true,
    faits,
    sources: [],
    narration: "",
  };
}

/**
 * Nombre d'années consécutives (depuis l'année 1) où l'impôt LMNP reste nul,
 * grâce aux amortissements (art. 39 C) — plus parlant que le seul montant
 * de l'année 1, qui ne dit rien de la durée pendant laquelle l'avantage joue.
 */
function anneesSansImpotFait(annees: AnneeSimulation[]): Fait {
  let nbAnnees = annees.length;
  for (let i = 0; i < annees.length; i++) {
    if (annees[i].impot >= 1) {
      nbAnnees = i;
      break;
    }
  }

  if (nbAnnees === 0) {
    return {
      label: "Impôt LMNP",
      value: Math.round(annees[0].impot),
      unit: "€/an",
      detail: "dès l'année 1 — IR + prélèvements sociaux, après amortissements plafonnés",
      source: SRC_CALC,
      gravite: "attention",
    };
  }

  return {
    label: "Années sans impôt",
    value: nbAnnees,
    unit: nbAnnees > 1 ? "ans" : "an",
    detail:
      nbAnnees < annees.length
        ? `grâce aux amortissements (art. 39 C) — impôt dès l'année ${nbAnnees + 1}`
        : "grâce aux amortissements (art. 39 C), sur toute la durée simulée",
    source: SRC_CALC,
    gravite: "positif",
  };
}
