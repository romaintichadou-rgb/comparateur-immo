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
 *    (€/m² HC, majoritairement location nue). Pour comparer à un loyer meublé
 *    CC (LMNP), on applique une majoration meublé (+12 %) puis une provision
 *    de charges, afin de comparer sur des bases équivalentes.
 *  - Rendement net : calcul déterministe, affiché avec une fourchette dérivée
 *    de l'intervalle de confiance réel du loyer de marché (pas de fausse précision).
 *  - OpenStreetMap : commodités réelles (transports, éducation, commerces).
 */

const SRC_LOYERS: Source = {
  label: "Carte des loyers (ANIL)",
  url: "https://www.data.gouv.fr/fr/datasets/6751be987c09f4be821c6934/",
};

// Provision de charges locatives récupérables, en €/m²/mois, servant à
// convertir un loyer HC en CC pour comparer à la Carte des loyers (HC).
const PROVISION_CHARGES_M2 = 2.5;

// Les données ANIL sont dominées par la location nue (~75 % du parc locatif
// français). En LMNP, le bien est loué meublé : un logement meublé se loue
// typiquement 10-15 % plus cher qu'un logement nu équivalent. On applique
// cette majoration au loyer ANIL avant comparaison, pour ne pas déclencher
// de faux positif "loyer optimiste" à chaque estimation meublée.
const MAJORATION_MEUBLE = 0.12;

export function buildBlocLocation(
  apt: Apartment,
  loyerRef: LoyerReference | null,
  seuils: RendementSeuils = SEUILS_RENDEMENT_DEFAUT,
  perimetre: "rayon500" | "arrondissement" = "arrondissement"
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
  // Le loyer du bien est en CC meublé (LMNP). Le loyer ANIL (HC, dominé par
  // la location nue) est converti en CC meublé : majoration meublé sur le
  // loyer HC, puis ajout de la provision de charges.
  const loyerBienM2CC = apt.loyer_retenu != null && surface != null ? apt.loyer_retenu / surface : null;
  const marcheM2CC = loyerRef ? loyerRef.loyerM2 * (1 + MAJORATION_MEUBLE) + PROVISION_CHARGES_M2 : null;

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
      const seuilMax = immeuble
        ? (loyerRef.max * (1 + MAJORATION_MEUBLE) + PROVISION_CHARGES_M2) * 1.25
        : loyerRef.max * (1 + MAJORATION_MEUBLE) + PROVISION_CHARGES_M2;
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
      label: immeuble ? "Loyer total de l'immeuble" : "Loyer du bien",
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
    const min = Math.round((loyerRef.min * (1 + MAJORATION_MEUBLE) + PROVISION_CHARGES_M2) * surface);
    const max = Math.round((loyerRef.max * (1 + MAJORATION_MEUBLE) + PROVISION_CHARGES_M2) * surface);
    const perimetreLabel = perimetre === "rayon500" ? "rayon 500 m" : "arrondissement";
    faits.push({
      label: immeuble ? "Loyer de marché à surface équivalente" : "Loyer de marché médian",
      value: median.toLocaleString("fr-FR"),
      unit: "€/mois CC",
      detail: `${immeuble ? "surface totale en logement unique · " : ""}${loyerRef.nbObs.toLocaleString("fr-FR")} annonces · ${loyerRef.annee}`,
      perimetre: perimetreLabel,
      source: SRC_LOYERS.label,
      gravite: "info",
    });
    faits.push({
      label: "Fourchette de loyer",
      value: `${min.toLocaleString("fr-FR")} – ${max.toLocaleString("fr-FR")}`,
      unit: "€/mois CC",
      detail: `${(loyerRef.min * (1 + MAJORATION_MEUBLE) + PROVISION_CHARGES_M2).toFixed(1)} – ${(loyerRef.max * (1 + MAJORATION_MEUBLE) + PROVISION_CHARGES_M2).toFixed(1)} €/m² CC meublé · ${surface} m²`,
      perimetre: perimetreLabel,
      source: SRC_LOYERS.label,
      gravite: "info",
    });
  } else if (!loyerRef) {
    donneesManquantes.push("loyer de marché du secteur");
  }

  // Écart loyer/marché au scope de la fonction pour le scoring.
  const ecartLoyerMarche =
    loyerBienM2CC != null && marcheM2CC != null
      ? (loyerBienM2CC - marcheM2CC) / marcheM2CC
      : null;

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

    // Scoring continu adapté au profil investisseur.
    // Le rendement net est le facteur principal (chiffre vérifié), l'écart
    // loyer/marché est un facteur de risque secondaire (proportionnel, pas
    // binaire) — un bon rendement avec un loyer modérément au-dessus du
    // marché reste un bon score, mais un loyer très au-dessus est pénalisé.
    const r = rendementNet;
    const range = Math.max(seuils.modeste - seuils.redhibitoire, 0.005);

    let rendementBase: number;
    if (r >= seuils.modeste + range) rendementBase = 5;
    else if (r >= seuils.modeste)
      rendementBase = 4 + Math.min((r - seuils.modeste) / range, 1);
    else if (r >= seuils.redhibitoire)
      rendementBase = 2 + 2 * ((r - seuils.redhibitoire) / (seuils.modeste - seuils.redhibitoire));
    else if (r >= seuils.redhibitoire - range)
      rendementBase = Math.max(0, 2 * ((r - (seuils.redhibitoire - range)) / range));
    else rendementBase = 0;

    // Pénalité proportionnelle si le loyer retenu est nettement au-dessus du
    // marché. Plafonnée à 0.5 pour ne jamais pousser un rendement « vert »
    // (selon le profil investisseur) sous les 8/10.
    let loyerPenalite = 0;
    if (ecartLoyerMarche != null && ecartLoyerMarche > 0.10) {
      loyerPenalite = Math.min((ecartLoyerMarche - 0.10) * 2, 0.5);
    }
    if (loyerNonVerifie && ecartLoyerMarche != null && ecartLoyerMarche > 0.10) {
      loyerPenalite += 0.15;
    }
    // Immeuble : le loyer/m² moyen sort naturellement plus haut que la
    // médiane d'un logement unique — on réduit la pénalité de moitié.
    if (immeuble) loyerPenalite *= 0.5;

    note = clampNote(Math.max(0, rendementBase - loyerPenalite) * 2);
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
