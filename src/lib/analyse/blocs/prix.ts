import type { Apartment } from "@/lib/types";
import type { DvfData } from "../sources/dvf";
import { clampNote } from "../scoring";
import { BLOC_LABELS, BLOC_POIDS, type BlocAnalyse, type Fait, type Source } from "../types";

/**
 * Bloc "Prix d'achat" — 100 % basé sur des transactions réelles (DVF+ Cerema).
 * On compare le prix/m² d'acquisition du bien (prix affiché / surface, hors
 * travaux, pour rester comparable aux prix de vente DVF) à la médiane réelle
 * du secteur sur les 3 dernières années, et on affiche l'évolution sur ~10 ans.
 *
 * Note /10 (10 = affaire) purement déterministe : elle dépend uniquement de
 * l'écart au prix médian réel du quartier.
 */

const SRC_DVF: Source = {
  label: "DVF (DGFiP)",
  url: "https://app.dvf.etalab.gouv.fr/",
};

export async function buildBlocPrix(
  apt: Apartment,
  dvf: DvfData | null
): Promise<BlocAnalyse> {
  const faits: Fait[] = [];
  const sources: Source[] = [];
  const donneesManquantes: string[] = [];
  let note: number | null = null;

  // Prix/m² d'acquisition TOTAL : prix d'achat + travaux, rapporté à la surface.
  const prixM2Achat =
    apt.prix != null && apt.surface_m2 != null && apt.surface_m2 > 0
      ? Math.round((apt.prix + (apt.travaux ?? 0)) / apt.surface_m2)
      : null;

  faits.push({
    label: "Prix/m² du bien",
    value: prixM2Achat,
    unit: "€/m²",
    detail: "achat + travaux",
    source: "Calcul — données du bien",
    gravite: "info",
  });
  if (prixM2Achat == null) donneesManquantes.push("prix ou surface du bien");

  if (dvf?.medianeRecente != null) {
    sources.push(SRC_DVF);

    faits.push({
      label: "Prix/m² médian comparable",
      value: dvf.medianeRecente,
      unit: "€/m²",
      detail: `${dvf.nbVentesRecent} ventes · ${dvf.baseComparaison} · ${dvf.recentMin}–${dvf.recentMax}`,
      perimetre: "rayon 500 m",
      source: SRC_DVF.label,
      gravite: "info",
    });

    if (prixM2Achat != null) {
      const ecart = (prixM2Achat - dvf.medianeRecente) / dvf.medianeRecente;
      const ecartPct = Math.round(ecart * 100);

      faits.push({
        label: "Écart au prix de marché",
        value: `${ecartPct > 0 ? "+" : ""}${ecartPct}`,
        unit: "%",
        detail: "vs médiane comparable",
        perimetre: "rayon 500 m",
        source: SRC_DVF.label,
        gravite: ecart <= -0.05 ? "positif" : ecart <= 0.05 ? "info" : ecart <= 0.15 ? "attention" : "alerte",
      });

      // Note = écart au marché (10 = nettement sous le marché).
      let penalite: number;
      if (ecart <= -0.15) penalite = 0;
      else if (ecart <= -0.05) penalite = 1;
      else if (ecart <= 0.05) penalite = 2;
      else if (ecart <= 0.15) penalite = 3;
      else penalite = 4;
      note = clampNote((5 - penalite) * 2);
    }
    // Note : l'évolution des prix du secteur est affichée dans le bloc
    // « Potentiel » (dynamique du quartier), pas ici, pour éviter le doublon.
  } else {
    donneesManquantes.push("ventes DVF comparables dans le secteur");
  }

  const disponible = note != null;
  return {
    cle: "prix",
    titre: BLOC_LABELS.prix,
    note,
    poids: BLOC_POIDS.prix,
    disponible,
    faits,
    sources,
    narration: "",
    donneesManquantes,
    messageIndisponible: disponible
      ? undefined
      : prixM2Achat == null
        ? "Prix ou surface manquant : impossible de comparer au marché."
        : "Pas assez de ventes DVF récentes dans le secteur pour situer le prix.",
  };
}
