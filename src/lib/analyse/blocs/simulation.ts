import type { ApartmentWithComputed } from "@/lib/types";
import type { AppSettings } from "@/lib/settings";
import { defaultInputs, simulate, type AnneeSimulation } from "@/lib/simulation";
import { clampNote } from "../scoring";
import { BLOC_LABELS, BLOC_POIDS, type BlocAnalyse, type BlocHighlight, type Fait } from "../types";

/**
 * Bloc "Simulation financière" — résume l'onglet du même nom : cash-flow réel
 * en LMNP au réel (crédit amortissable, charges d'exploitation, fiscalité
 * avec amortissements plafonnés art. 39 C), avec les hypothèses de crédit et
 * de fiscalité par défaut (mêmes valeurs que celles pré-remplies dans
 * l'onglet Simulation financière — l'utilisateur peut les personnaliser
 * là-bas, mais l'Analyse IA reste basée sur un scénario standard reproductible).
 *
 * Note /10 purement déterministe : dérivée du cash-flow mensuel MOYEN sur
 * toute la durée du crédit (indicateur le plus représentatif, lisse les
 * variations d'une année sur l'autre), situé par rapport aux seuils
 * personnels de cash-flow (page Profil investisseur) — mêmes seuils que ceux
 * utilisés pour colorer le cash-flow dans l'onglet Simulation financière.
 */

const SRC_CALC = "Calcul — simulation LMNP";

export function buildBlocSimulation(apt: ApartmentWithComputed, settings: AppSettings): BlocAnalyse {
  const result = simulate(apt, defaultInputs());

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

  const seuils = { vert: settings.cashflowSeuilVertEuros, rouge: settings.cashflowSeuilRougeEuros };
  const cfAn1 = result.cashflowMensuelAn1;
  const cfMoyen = result.cashflowMensuelMoyen;

  function tone(v: number): "positif" | "attention" | "alerte" {
    if (v >= seuils.vert) return "positif";
    if (v >= seuils.rouge) return "attention";
    return "alerte";
  }

  const highlights: BlocHighlight[] = [
    { label: "Cash-flow mensuel — année 1", value: `${signe(cfAn1)} €`, tone: tone(cfAn1) },
    { label: "Cash-flow mensuel moyen", value: `${signe(cfMoyen)} €`, tone: tone(cfMoyen) },
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

  // Note = cash-flow mensuel moyen situé par rapport aux seuils personnels,
  // avec les mêmes paliers (et le même écart de 100 €) au-dessus/en dessous
  // des seuils que les autres blocs déterministes.
  const r = cfMoyen;
  let base: number;
  if (r >= seuils.vert + 100) base = 5;
  else if (r >= seuils.vert) base = 4;
  else if (r >= seuils.rouge) base = 3;
  else if (r >= seuils.rouge - 100) base = 2;
  else base = 1;
  const note = clampNote(base * 2);

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

function signe(n: number): string {
  const r = Math.round(n) || 0; // normalise -0 → 0
  return `${r > 0 ? "+" : ""}${r.toLocaleString("fr-FR")}`;
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
