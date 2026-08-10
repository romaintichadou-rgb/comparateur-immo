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
  const cfLMNP = result.cashflowMensuelMoyenLMNP;

  // Source unique (scoring.ts) : mêmes seuils, même tonalité que les
  // MetricCards, l'onglet Optimiser et le tableau de simulation.
  const tone = (v: number) => cashflowTone(v, seuils) as "positif" | "attention" | "alerte";

  const highlights: BlocHighlight[] = [
    {
      label: result.anneesExonerees > 1
        ? `Cash-flow mensuel (moyen ${result.anneesExonerees} ans)`
        : "Cash-flow mensuel",
      value: formatEurosSigned(cfLMNP),
      tone: tone(cfLMNP),
    },
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

  // Note /10 = facteur principal (CF LMNP vs seuils profil, 80%) +
  // bonus fiscal (durée exonération, 20%).
  const range = Math.max(seuils.vert - seuils.rouge, 50);

  // Facteur principal : cash-flow moyen LMNP situé par rapport aux seuils profil.
  let scoreCF: number;
  if (cfLMNP >= seuils.vert + range) scoreCF = 5;
  else if (cfLMNP >= seuils.vert)
    scoreCF = 4 + Math.min((cfLMNP - seuils.vert) / range, 1);
  else if (cfLMNP >= seuils.rouge)
    scoreCF = 2 + 2 * ((cfLMNP - seuils.rouge) / (seuils.vert - seuils.rouge));
  else if (cfLMNP >= seuils.rouge - range)
    scoreCF = Math.max(0, 2 * ((cfLMNP - (seuils.rouge - range)) / range));
  else scoreCF = 0;

  // Bonus fiscal : durée d'exonération LMNP.
  let bonusFiscal = 0;
  if (result.anneesExonerees >= 15) bonusFiscal = 0.5;
  else if (result.anneesExonerees >= 10) bonusFiscal = 0.35;
  else if (result.anneesExonerees >= 5) bonusFiscal = 0.15;
  else if (result.anneesExonerees === 0) bonusFiscal = -0.25;

  const base = scoreCF + bonusFiscal;
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
