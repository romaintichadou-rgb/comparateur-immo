import type { ApartmentWithComputed } from "@/lib/types";
import type { AppSettings } from "@/lib/settings";
import { resolveInputs, simulate, type AnneeSimulation } from "@/lib/simulation";
import { cashflowSeuilsFromSettings, cashflowTone } from "../scoring";
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
 * Bloc INFORMATIF (note: null, poids 0) : le cash-flow dépend du montage
 * financier personnel (apport, taux, durée), pas de la qualité intrinsèque
 * du bien. Affiché sans note ni verdict dans l'onglet Analyse.
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

  return {
    cle: "simulation",
    titre: BLOC_LABELS.simulation,
    note: null,
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
