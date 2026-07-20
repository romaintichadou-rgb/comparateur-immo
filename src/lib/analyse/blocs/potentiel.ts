import type { Apartment, PrecisionLocalisation } from "@/lib/types";
import type { DvfData } from "../sources/dvf";
import type { Commodites } from "../sources/osm";
import type { DelinquanceData } from "../sources/delinquance";
import { clampNote } from "../scoring";
import { BLOC_LABELS, BLOC_POIDS, type BlocAnalyse, type Fait, type Source } from "../types";

/**
 * Bloc "Potentiel" (quartier, liquidité, plus-value) — données réelles :
 *  - DVF : dynamique des prix du quartier (~10 ans) + liquidité (volume réel de
 *    ventes d'appartements dans le secteur, proxy de facilité de revente).
 *  - SSMSI : sécurité du secteur, comparée à la moyenne de la ville pour
 *    Paris/Lyon/Marseille (comparaison intra-ville).
 *  - OpenStreetMap : commodités (attractivité durable du quartier).
 *
 * Note /10 = moyenne des sous-notes réellement disponibles (dynamique,
 * liquidité, sécurité), doublée pour être exprimée sur 10. Chaque sous-note
 * est déterministe.
 */

const SRC_DVF: Source = { label: "DVF (DGFiP)", url: "https://app.dvf.etalab.gouv.fr/" };
const SRC_SSMSI: Source = {
  label: "SSMSI — délinquance",
  url: "https://www.data.gouv.fr/fr/datasets/621df2954fa5a3b5a023e23c/",
};
const SRC_OSM: Source = { label: "OpenStreetMap", url: "https://www.openstreetmap.org/" };

// Indicateurs SSMSI mis en avant (les plus parlants pour un résident).
const INDIC_CLES = [
  "Vols sans violence contre des personnes",
  "Cambriolages de logement",
  "Violences physiques hors cadre familial",
];

export function buildBlocPotentiel(
  apt: Apartment,
  dvf: DvfData | null,
  commodites: Commodites | null,
  delinq: DelinquanceData | null,
  delinqVille: DelinquanceData | null,
  precision: PrecisionLocalisation | null = null
): BlocAnalyse {
  const faits: Fait[] = [];
  const sources: Source[] = [];
  const donneesManquantes: string[] = [];
  // Sous-notes pondérées : évolution et liquidité (facteurs financiers)
  // pèsent davantage que commodités et sécurité (facteurs de confort).
  let scoreSum = 0;
  let weightSum = 0;
  const adresseExacte = precision === "exacte";

  let invite: BlocAnalyse["invite"];

  // --- Évolution des prix du quartier (DVF) ---
  if (dvf?.evolutionPct != null) {
    if (!sources.includes(SRC_DVF)) sources.push(SRC_DVF);
    const e = dvf.evolutionPct;
    const evoNote = e >= 30 ? 5 : e >= 15 ? 4 : e >= 0 ? 3 : e >= -10 ? 2 : 1;
    scoreSum += evoNote * 0.35; weightSum += 0.35;
    faits.push({
      label: "Évolution des prix",
      value: `${e > 0 ? "+" : ""}${e}`,
      unit: "%",
      detail: `${dvf.ancienMin}–${dvf.ancienMax} → aujourd'hui`,
      perimetre: adresseExacte ? "rayon 500 m" : "arrondissement",
      source: SRC_DVF.label,
      gravite: e >= 15 ? "positif" : e >= 0 ? "info" : "attention",
    });
  }

  if (adresseExacte) {
    // --- Liquidité : volume réel de ventes d'appartements du secteur ---
    if (dvf && dvf.nbVentesTotal > 0) {
      if (!sources.includes(SRC_DVF)) sources.push(SRC_DVF);
      const v = dvf.nbVentesTotal;
      const liqNote = v >= 150 ? 5 : v >= 80 ? 4 : v >= 40 ? 3 : v >= 15 ? 2 : 1;
      scoreSum += liqNote * 0.30; weightSum += 0.30;
      faits.push({
        label: "Liquidité du marché (revente)",
        value: v,
        unit: "ventes",
        detail: `appartements · ${dvf.recentMin}–${dvf.recentMax}`,
        perimetre: "rayon 500 m",
        source: SRC_DVF.label,
        gravite: v >= 80 ? "positif" : v >= 40 ? "info" : "attention",
      });
    }
  }

  // --- Sécurité (SSMSI), comparée à la ville pour Paris/Lyon/Marseille ---
  if (delinq) {
    sources.push(SRC_SSMSI);
    const cles = delinq.indicateurs
      .filter((i) => INDIC_CLES.some((c) => i.label.startsWith(c.slice(0, 20))))
      .map((i) => `${i.label.replace(/ contre des personnes$/, "")} ${fmt(i.taux)}‰`);

    if (delinqVille && delinqVille.tauxAtteintesBiens > 0) {
      const ratio = delinq.tauxAtteintesBiens / delinqVille.tauxAtteintesBiens;
      const ecartPct = Math.round((ratio - 1) * 100);
      const secNote = ratio <= 0.8 ? 5 : ratio <= 1.1 ? 4 : ratio <= 1.5 ? 3 : ratio <= 2.5 ? 2 : 1;
      scoreSum += secNote * 0.15; weightSum += 0.15;
      faits.push({
        label: "Sécurité — atteintes aux biens",
        value: `${ecartPct > 0 ? "+" : ""}${ecartPct}`,
        unit: "% vs ville",
        detail: `${fmt(delinq.tauxAtteintesBiens)}‰ vs ${fmt(delinqVille.tauxAtteintesBiens)}‰ (moyenne ville)`,
        perimetre: "arrondissement",
        source: SRC_SSMSI.label,
        gravite: ratio <= 1.1 ? "positif" : ratio <= 1.5 ? "attention" : "alerte",
      });
    } else {
      faits.push({
        label: "Sécurité — atteintes aux biens",
        value: fmt(delinq.tauxAtteintesBiens),
        unit: "‰",
        detail: cles.length ? cles.join(" · ") : undefined,
        perimetre: "commune",
        source: SRC_SSMSI.label,
        gravite: "info",
      });
    }
  } else {
    donneesManquantes.push("statistiques de délinquance (SSMSI)");
  }

  if (adresseExacte) {
    // --- Commodités (OSM) — restituées en NIVEAU qualitatif, pas en chiffre brut.
    if (commodites) {
      sources.push(SRC_OSM);
      const total = commodites.transports + commodites.education + commodites.commerces;
      const niveau = total >= 300 ? "Excellent" : total >= 120 ? "Bon" : total >= 50 ? "Moyen" : "Mauvais";
      const comNote = total >= 300 ? 5 : total >= 120 ? 4 : total >= 50 ? 3 : 2;
      scoreSum += comNote * 0.20; weightSum += 0.20;
      faits.push({
        label: "Commodités",
        value: niveau,
        detail: `${commodites.transports} transports · ${commodites.education} écoles/facs · ${commodites.commerces} commerces`,
        perimetre: `rayon ${commodites.rayonM} m`,
        source: SRC_OSM.label,
        gravite: total >= 120 ? "positif" : total >= 50 ? "info" : "attention",
      });
    } else {
      donneesManquantes.push("commodités (OpenStreetMap momentanément indisponible)");
    }
  }

  if (!adresseExacte) {
    invite = {
      text: "Renseigne l'adresse exacte du bien pour analyser la liquidité du marché et les commodités du quartier.",
      href: `/appartements/${apt.id}?tab=donnees&edit=1`,
      linkLabel: "Compléter l'adresse",
    };
  }

  const note = weightSum > 0 ? clampNote((scoreSum / weightSum) * 2) : null;

  const disponible = note != null || faits.length > 0;
  return {
    cle: "potentiel",
    titre: BLOC_LABELS.potentiel,
    note,
    poids: BLOC_POIDS.potentiel,
    disponible,
    faits,
    sources,
    narration: "",
    donneesManquantes,
    invite,
    messageIndisponible: disponible ? undefined : "Données de quartier indisponibles pour ce bien.",
  };
}

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}
