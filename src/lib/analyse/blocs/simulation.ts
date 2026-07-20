import type { ApartmentWithComputed } from "@/lib/types";
import type { AppSettings } from "@/lib/settings";
import { defaultInputs, simulate, type AnneeSimulation } from "@/lib/simulation";
import { clampNote } from "../scoring";
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
  // Utilise les hypothèses réellement enregistrées par l'utilisateur dans
  // l'onglet Simulation financière (crédit, revalorisations) quand elles
  // existent, plutôt que toujours le scénario standard par défaut — pour que
  // le score reflète ce que l'utilisateur a effectivement modélisé.
  const result = simulate(apt, apt.simulation_inputs ?? defaultInputs());

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

  // Note = cash-flow mensuel moyen (facteur principal, adapté au profil
  // investisseur) + ajustements pour la soutenabilité et l'avantage fiscal.
  const r = cfMoyen;
  const mid = (seuils.vert + seuils.rouge) / 2;
  let base: number;
  if (r >= seuils.vert + 200) base = 5;
  else if (r >= seuils.vert + 100) base = 4.5;
  else if (r >= seuils.vert) base = 4;
  else if (r >= mid) base = 3;
  else if (r >= seuils.rouge) base = 2.5;
  else if (r >= seuils.rouge - 100) base = 2;
  else if (r >= seuils.rouge - 200) base = 1.5;
  else base = 1;

  // Soutenabilité : un cash-flow positif en année 1 qui bascule négatif sur
  // la durée est un signal de fragilité — mais uniquement si le cash-flow
  // moyen sort de la zone acceptable (verte) définie par le profil investisseur.
  if (cfAn1 > 0 && cfMoyen < 0 && cfMoyen < seuils.vert) base -= 0.5;

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
