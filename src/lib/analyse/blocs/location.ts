import { isImmeuble, type Apartment } from "@/lib/types";
import { computeDerived } from "@/lib/calculations";
import { isAiEstimated } from "@/lib/estimates";
import { formatPercent } from "@/lib/format";
import type { LoyerReference } from "../sources/loyers";
import {
  clampNote,
  rendementNetTone,
  SEUILS_RENDEMENT_DEFAUT,
  type RendementSeuils,
} from "../scoring";
import { BLOC_LABELS, BLOC_POIDS, type BlocAnalyse, type BlocHighlight, type Fait, type Source } from "../types";

/**
 * Bloc "Potentiel locatif" — données réelles :
 *  - Carte des loyers (ANIL) : loyer d'annonce médian réel de l'arrondissement
 *    (€/m² HC). Le loyer retenu (CC) est NORMALISÉ en HC avant comparaison
 *    (via une provision de charges explicite), pour comparer des bases égales.
 *  - Rendement net : calcul déterministe, affiché avec une fourchette dérivée
 *    de l'intervalle de confiance réel du loyer de marché (pas de fausse précision).
 *  - OpenStreetMap : commodités réelles (transports, éducation, commerces).
 */

const SRC_LOYERS: Source = {
  label: "Carte des loyers (ANIL)",
  url: "https://www.data.gouv.fr/fr/datasets/6751be987c09f4be821c6934/",
};

// Provision de charges locatives récupérables, en €/m²/mois, servant à
// convertir un loyer CC (charges comprises) en HC (hors charges) pour comparer
// à la Carte des loyers, qui est en HC. Ordre de grandeur usuel, affiché.
const PROVISION_CHARGES_M2 = 2.5;

export function buildBlocLocation(
  apt: Apartment,
  loyerRef: LoyerReference | null,
  seuils: RendementSeuils = SEUILS_RENDEMENT_DEFAUT
): BlocAnalyse {
  const faits: Fait[] = [];
  const sources: Source[] = [];

  // Immeuble : loyer_retenu est le TOTAL de tous les lots, et loyerBienM2CC est
  // donc un €/m² MOYEN sur l'ensemble de l'immeuble. Comparé au loyer médian
  // d'un logement unique (Carte des loyers), il ressort légitimement plus haut
  // quand l'immeuble compte de petits logements (qui se louent plus cher au m²).
  // On assouplit donc la détection "loyer optimiste" et on l'explicite.
  const immeuble = isImmeuble(apt.type_bien);
  const derived = computeDerived(apt);
  const rendementNet = derived.rendement_net; // fraction, basé sur le loyer du bien
  const rendementBrut = derived.rendement_brut;
  const surface = apt.surface_m2 != null && apt.surface_m2 > 0 ? apt.surface_m2 : null;
  // Tous les loyers sont en CC (charges comprises / TTC). Le loyer retenu du
  // bien l'est déjà ; le loyer de marché (annonces = hors charges) est ramené
  // en CC en ajoutant une provision de charges explicite, pour comparer sur la
  // même base.
  const loyerBienM2CC = apt.loyer_retenu != null && surface != null ? apt.loyer_retenu / surface : null;
  const marcheM2CC = loyerRef ? loyerRef.loyerM2 + PROVISION_CHARGES_M2 : null;

  const donneesManquantes: string[] = [];
  let loyerOptimiste = false;
  // Loyer dont la valeur actuelle vient d'une estimation IA (recherche web +
  // Gemini, voir estimateRent()) plutôt que d'une donnée vérifiée par
  // l'utilisateur — à ne jamais traiter avec la même confiance.
  const loyerNonVerifie = isAiEstimated(apt, "loyer_retenu");

  // --- 1) Loyer du bien (CC), en valeur mensuelle réelle ---
  if (apt.loyer_retenu != null) {
    const ecart = loyerBienM2CC != null && marcheM2CC != null ? (loyerBienM2CC - marcheM2CC) / marcheM2CC : null;
    // Discount systématique : soit nettement au-dessus du haut de la
    // fourchette ANIL (quelle que soit son origine), soit encore une
    // estimation IA non vérifiée et déjà sensiblement au-dessus de la
    // médiane (pas seulement au-dessus du max) — un loyer IA modérément
    // optimiste ne doit pas passer inaperçu simplement parce qu'il reste
    // dans la fourchette.
    if (loyerRef && loyerBienM2CC != null) {
      // Pour un immeuble, on relève les seuils : dépasser le max (ou la médiane)
      // d'un logement unique est attendu, pas un signal d'excès en soi.
      const seuilMax = immeuble ? (loyerRef.max + PROVISION_CHARGES_M2) * 1.25 : loyerRef.max + PROVISION_CHARGES_M2;
      const seuilEcart = immeuble ? 0.3 : 0.1;
      const auDessusMax = loyerBienM2CC > seuilMax;
      const optimisteEtNonVerifie = loyerNonVerifie && ecart != null && ecart > seuilEcart;
      loyerOptimiste = auDessusMax || optimisteEtNonVerifie;
    }
    // "estimation IA non vérifiée" n'est plus répété ici en texte : le badge
    // visuel estimeParIA (voir FaitRow) porte déjà cette information.
    const suffixeDetail = [
      immeuble ? "total immeuble · €/m² moyen tous lots" : null,
      loyerOptimiste ? "optimiste" : null,
    ]
      .filter(Boolean)
      .join(" · ");
    faits.push({
      label: immeuble ? "Loyer total de l'immeuble (CC)" : "Loyer du bien (CC)",
      value: apt.loyer_retenu.toLocaleString("fr-FR"),
      unit: "€/mois CC",
      detail:
        ecart != null
          ? `${ecart > 0 ? "+" : ""}${Math.round(ecart * 100)} % vs marché${suffixeDetail ? " · " + suffixeDetail : ""}`
          : suffixeDetail || undefined,
      source: SRC_LOYERS.label,
      gravite: ecart == null ? (loyerNonVerifie ? "attention" : "info") : loyerOptimiste ? "attention" : ecart <= 0.05 ? "positif" : "info",
      estimeParIA: loyerNonVerifie,
    });
  } else {
    donneesManquantes.push("loyer du bien");
  }

  // --- 2) Loyer de marché médian (CC), en valeur mensuelle réelle pour cette surface ---
  if (loyerRef && surface != null && marcheM2CC != null) {
    sources.push(SRC_LOYERS);
    const median = Math.round(marcheM2CC * surface);
    const min = Math.round((loyerRef.min + PROVISION_CHARGES_M2) * surface);
    const max = Math.round((loyerRef.max + PROVISION_CHARGES_M2) * surface);
    faits.push({
      // Pour un immeuble, ce médian applique le €/m² d'UN logement à la surface
      // TOTALE : c'est le loyer "si l'immeuble était un seul appartement", un
      // plancher — le total réel est supérieur grâce à la découpe en lots.
      label: immeuble ? "Loyer de marché à surface équivalente" : "Loyer de marché médian",
      value: median.toLocaleString("fr-FR"),
      unit: "€/mois CC",
      detail: `${immeuble ? "surface totale en logement unique · " : ""}fourchette ${min.toLocaleString("fr-FR")} – ${max.toLocaleString("fr-FR")} €/mois · ${loyerRef.nbObs.toLocaleString("fr-FR")} annonces · ${loyerRef.annee}`,
      perimetre: "arrondissement",
      source: SRC_LOYERS.label,
      gravite: "info",
    });
  } else if (!loyerRef) {
    donneesManquantes.push("loyer de marché du secteur");
  }

  // --- 3) Rendement (calcul réel, basé sur le loyer du bien) — cartes en highlights ---
  const highlights: BlocHighlight[] = [];
  let note: number | null = null;
  if (rendementNet != null) {
    if (rendementBrut != null) {
      highlights.push({ label: "Rendement brut", value: formatPercent(rendementBrut), tone: "neutral" });
    }
    highlights.push({
      label: "Rendement net",
      value: formatPercent(rendementNet),
      tone: rendementNetTone(rendementNet, seuils),
    });

    // Les paliers 5 et 2 gardent le même écart (1,5 pt) au-dessus/en dessous
    // des 2 seuils configurables, pour rester cohérents si l'utilisateur les
    // déplace.
    const r = rendementNet;
    let base: number;
    if (r >= seuils.modeste + 0.015) base = 5;
    else if (r >= seuils.modeste) base = 4;
    else if (r >= seuils.redhibitoire) base = 3;
    else if (r >= seuils.redhibitoire - 0.015) base = 2;
    else base = 1;

    if (loyerOptimiste) base = Math.min(base, 3); // loyer optimiste → rendement surestimé
    note = clampNote(base * 2);
  } else {
    donneesManquantes.push("rendement (prix ou loyer manquant)");
  }

  // Commodités : affichées uniquement dans le bloc « Potentiel » (doublon évité).

  const disponible = note != null || faits.length > 0;
  return {
    cle: "location",
    titre: BLOC_LABELS.location,
    note,
    poids: BLOC_POIDS.location,
    highlights,
    disponible,
    faits,
    sources,
    narration: "",
    donneesManquantes,
    messageIndisponible: disponible
      ? undefined
      : "Loyer ou prix manquant, et aucune donnée locative disponible pour situer le bien.",
  };
}
