import type { Apartment } from "@/lib/types";
import { computeDerived } from "@/lib/calculations";
import { formatPercent } from "@/lib/format";
import { fetchLoyerReference } from "../sources/loyers";
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

export async function buildBlocLocation(
  apt: Apartment,
  codeInsee: string,
  seuils: RendementSeuils = SEUILS_RENDEMENT_DEFAUT
): Promise<BlocAnalyse> {
  const faits: Fait[] = [];
  const sources: Source[] = [];

  const loyerRef = codeInsee ? await fetchLoyerReference(codeInsee) : null;

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
  // Loyer encore en mode "estimé" (jamais repris à la main) : dans les faits,
  // ça signifie presque toujours une estimation IA (recherche web + Gemini,
  // voir estimateRent()) plutôt qu'une donnée déterministe — à ne jamais
  // traiter avec la même confiance qu'un loyer vérifié par l'utilisateur.
  const loyerNonVerifie = !apt.champs_manuels.includes("loyer_retenu");

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
      const auDessusMax = loyerBienM2CC > loyerRef.max + PROVISION_CHARGES_M2;
      const optimisteEtNonVerifie = loyerNonVerifie && ecart != null && ecart > 0.1;
      loyerOptimiste = auDessusMax || optimisteEtNonVerifie;
    }
    const suffixeDetail = [
      loyerOptimiste ? "optimiste" : null,
      loyerNonVerifie ? "estimation IA non vérifiée" : null,
    ]
      .filter(Boolean)
      .join(" · ");
    faits.push({
      label: "Loyer du bien (CC)",
      value: apt.loyer_retenu.toLocaleString("fr-FR"),
      unit: "€/mois CC",
      detail:
        ecart != null
          ? `${ecart > 0 ? "+" : ""}${Math.round(ecart * 100)} % vs marché${suffixeDetail ? " · " + suffixeDetail : ""}`
          : suffixeDetail || undefined,
      source: SRC_LOYERS.label,
      gravite: ecart == null ? (loyerNonVerifie ? "attention" : "info") : loyerOptimiste ? "attention" : ecart <= 0.05 ? "positif" : "info",
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
      label: "Loyer de marché médian",
      value: median.toLocaleString("fr-FR"),
      unit: "€/mois CC",
      detail: `fourchette ${min.toLocaleString("fr-FR")} – ${max.toLocaleString("fr-FR")} €/mois · ${loyerRef.nbObs.toLocaleString("fr-FR")} annonces · ${loyerRef.annee}`,
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
