import type { Apartment } from "@/lib/types";
import { fetchGeorisques } from "../sources/georisques";
import { fetchDpe } from "../sources/ademe";
import { clampNote } from "../scoring";
import { BLOC_LABELS, BLOC_POIDS, type BlocAnalyse, type Fait, type Source } from "../types";

/**
 * Bloc "Risques" — 100 % basé sur des données réelles :
 *  - ADEME : DPE réel du logement (matché sur la surface) + cohérence avec le
 *    DPE saisi + exposition loi climat (calendrier légal d'interdiction).
 *  - Géorisques : retrait-gonflement des argiles, radon, sismicité, et risques
 *    recensés sur la commune (inondation, feu de forêt...).
 *
 * La note /5 (5 = risque faible) est purement déterministe : on part de 5 et
 * on soustrait des pénalités, chacune adossée à un fait affiché. Aucune
 * pénalité n'existe sans un fait réel correspondant.
 */

const SRC_ADEME: Source = { label: "ADEME — DPE", url: "https://observatoire-dpe-audit.ademe.fr/" };
const SRC_GEORISQUES: Source = { label: "Géorisques", url: "https://www.georisques.gouv.fr/" };

// Calendrier loi Climat & Résilience : interdiction progressive de louer les
// passoires thermiques (dates d'entrée en vigueur).
const LOI_CLIMAT: Record<string, string> = {
  G: "Logement G : interdit à la location depuis 2025.",
  F: "Logement F : interdiction de louer à partir de 2028.",
  E: "Logement E : interdiction de louer à partir de 2034.",
};

// Pénalités par étiquette DPE (impact sur la note de risque).
const DPE_PENALITE: Record<string, number> = {
  G: 2, F: 1.5, E: 0.75, D: 0.25, C: 0, B: 0, A: 0,
};

export async function buildBlocRisque(
  apt: Apartment,
  geo: { lat: number | null; lon: number | null; codeInsee: string; banId: string }
): Promise<BlocAnalyse> {
  const faits: Fait[] = [];
  const sources: Source[] = [];
  const penalites: number[] = [];

  // --- ADEME : DPE réel + cohérence + loi climat ---
  const dpeData = geo.banId
    ? await fetchDpe({ banId: geo.banId, surface: apt.surface_m2 })
    : { records: [], meilleurMatch: null };

  // Étiquettes de référence : les valeurs officielles ADEME si trouvées, sinon
  // les valeurs saisies (déclaratives) faute de mieux.
  const dpeOfficiel = dpeData.meilleurMatch?.etiquette_dpe || "";
  const gesOfficiel = dpeData.meilleurMatch?.etiquette_ges || "";
  const dpeRef = dpeOfficiel || apt.dpe || "";
  const gesRef = gesOfficiel || apt.ges || "";

  // Échelle colorée A→G affichée dans l'UI (classe mise en avant).
  const dpeGes =
    /^[A-G]$/i.test(dpeRef) || /^[A-G]$/i.test(gesRef)
      ? { dpe: dpeRef.toUpperCase(), ges: gesRef.toUpperCase() }
      : undefined;

  const donneesManquantes: string[] = [];

  if (dpeData.meilleurMatch) {
    // La classe DPE/GES officielle est affichée via l'échelle colorée (dpeGes) ;
    // on garde juste la source ADEME dans le pied du bloc.
    sources.push(SRC_ADEME);
    const m = dpeData.meilleurMatch;

    // Cohérence : DPE/GES saisis vs valeurs officielles enregistrées à l'ADEME.
    const ecarts: string[] = [];
    if (apt.dpe && m.etiquette_dpe && apt.dpe.toUpperCase() !== m.etiquette_dpe.toUpperCase()) {
      ecarts.push(`DPE saisi ${apt.dpe} ≠ ADEME ${m.etiquette_dpe}`);
    }
    if (apt.ges && m.etiquette_ges && apt.ges.toUpperCase() !== m.etiquette_ges.toUpperCase()) {
      ecarts.push(`GES saisi ${apt.ges} ≠ ADEME ${m.etiquette_ges}`);
    }
    if (ecarts.length > 0) {
      faits.push({
        label: "Incohérence diagnostic saisi / officiel",
        value: null,
        detail: `${ecarts.join(" · ")} — probable erreur de saisie, à vérifier`,
        source: SRC_ADEME.label,
        gravite: "attention",
      });
    }
  } else {
    donneesManquantes.push("DPE officiel correspondant à la surface du bien");
    if (dpeData.records.length > 0) {
      sources.push(SRC_ADEME);
      faits.push({
        label: "DPE à cette adresse",
        value: dpeData.records.length,
        unit: "DPE",
        detail: "aucun ne correspond à la surface du bien",
        perimetre: "adresse (ADEME)",
        source: SRC_ADEME.label,
        gravite: "info",
      });
    }
  }

  if (dpeRef && DPE_PENALITE[dpeRef.toUpperCase()] != null) {
    penalites.push(DPE_PENALITE[dpeRef.toUpperCase()]);
  }

  // Loi climat (dérivée du DPE de référence — calendrier légal, pas une estim.)
  const climat = LOI_CLIMAT[dpeRef.toUpperCase()];
  if (climat) {
    faits.push({
      label: "Réglementaire — loi Climat",
      value: null,
      detail: climat,
      source: SRC_ADEME.label,
      gravite: dpeRef.toUpperCase() === "G" ? "alerte" : "attention",
    });
  }

  // --- Géorisques : aléas naturels ---
  if (geo.lat != null && geo.lon != null) {
    const gr = await fetchGeorisques({ lat: geo.lat, lon: geo.lon, codeInsee: geo.codeInsee });
    let usedGeorisques = false;

    if (gr.argiles) {
      usedGeorisques = true;
      const c = Number(gr.argiles.code);
      penalites.push(c >= 3 ? 1 : c === 2 ? 0.5 : 0);
      faits.push({
        label: "Retrait-gonflement des argiles",
        value: gr.argiles.libelle,
        perimetre: "adresse",
        source: SRC_GEORISQUES.label,
        gravite: c >= 3 ? "alerte" : c === 2 ? "attention" : "positif",
      });
    }

    if (gr.radon) {
      usedGeorisques = true;
      const c = Number(gr.radon.classe);
      penalites.push(c >= 3 ? 1 : c === 2 ? 0.5 : 0);
      faits.push({
        label: "Potentiel radon",
        value: ["Faible", "Moyen", "Élevé"][c - 1] ?? `Classe ${c}`,
        detail: `${c} / 3`,
        perimetre: "arrondissement",
        source: SRC_GEORISQUES.label,
        gravite: c >= 3 ? "alerte" : c === 2 ? "attention" : "positif",
      });
    }

    if (gr.sismique) {
      usedGeorisques = true;
      const c = Number(gr.sismique.code);
      penalites.push(c >= 5 ? 1.5 : c === 4 ? 1 : c === 3 ? 0.5 : 0);
      faits.push({
        label: "Zonage sismique",
        value: ["Très faible", "Faible", "Modérée", "Moyenne", "Forte"][c - 1] ?? gr.sismique.libelle,
        detail: `${c} / 5`,
        perimetre: "adresse",
        source: SRC_GEORISQUES.label,
        // Même logique de couleur que le radon : niveau faible → vert (positif).
        gravite: c >= 4 ? "alerte" : c === 3 ? "attention" : "positif",
      });
    }

    if (gr.risquesCommune.length > 0) {
      usedGeorisques = true;
      const inondation = gr.risquesCommune.some((r) => /inondation/i.test(r));
      if (inondation) penalites.push(0.5);
      faits.push({
        label: "Risques recensés sur la commune",
        value: null,
        detail: gr.risquesCommune.join(" · "),
        perimetre: "commune",
        source: SRC_GEORISQUES.label,
        gravite: inondation ? "attention" : "info",
      });
    }

    if (usedGeorisques) sources.push(SRC_GEORISQUES);
  }

  // --- Note déterministe ---
  const aDesDonnees = faits.length > 0 && (dpeRef !== "" || sources.some((s) => s.label === SRC_GEORISQUES.label));
  const note = aDesDonnees
    ? clampNote(5 - penalites.reduce((s, p) => s + p, 0))
    : null;

  return {
    cle: "risque",
    titre: BLOC_LABELS.risque,
    note,
    poids: BLOC_POIDS.risque,
    dpeGes,
    disponible: note != null,
    faits,
    sources,
    narration: "",
    donneesManquantes,
    messageIndisponible:
      note == null
        ? "Données de risque indisponibles (adresse non géolocalisée ou aucun diagnostic/aléa trouvé)."
        : undefined,
  };
}
