import { fetchDelinquance } from "../sources/delinquance";
import { fetchGareProche, fetchLanduse } from "../sources/osm";
import { BLOC_LABELS, type BlocAnalyse, type Fait, type Source } from "../types";

/**
 * Bloc "Quartier" — purement informatif (jamais noté, ne compte pas dans le
 * score global) : dresse le portrait du quartier pour éclairer la décision,
 * indépendamment de la rentabilité chiffrée déjà couverte par les autres
 * blocs. 100 % basé sur des données réelles :
 *  - SSMSI : détail des indicateurs de délinquance (pas juste un ratio).
 *  - OpenStreetMap : gare ferroviaire la plus proche, occupation du sol
 *    (caractère résidentiel vs zone d'activité/commerciale).
 *
 * La synthèse "points forts / points faibles" est rédigée par l'IA à partir
 * de ces faits réels (voir narration.ts) — jamais de donnée inventée ici.
 */

const SRC_SSMSI: Source = {
  label: "SSMSI — délinquance",
  url: "https://www.data.gouv.fr/fr/datasets/621df2954fa5a3b5a023e23c/",
};
const SRC_OSM: Source = { label: "OpenStreetMap", url: "https://www.openstreetmap.org/" };

// Nombre d'indicateurs de délinquance affichés (les plus élevés du secteur,
// les plus parlants pour situer le niveau de délinquance réel).
const NB_INDICATEURS = 5;

export async function buildBlocQuartier(
  codeInsee: string,
  geo: { lat: number | null; lon: number | null }
): Promise<BlocAnalyse> {
  const faits: Fait[] = [];
  const sources: Source[] = [];
  const donneesManquantes: string[] = [];

  // --- Délinquance détaillée (au-delà du seul ratio déjà affiché dans le
  // bloc "Potentiel") : les indicateurs les plus élevés du secteur. ---
  const delinq = codeInsee ? await fetchDelinquance(codeInsee) : null;
  if (delinq) {
    sources.push(SRC_SSMSI);
    const top = [...delinq.indicateurs].sort((a, b) => b.taux - a.taux).slice(0, NB_INDICATEURS);
    for (const ind of top) {
      faits.push({
        label: ind.label,
        value: fmt(ind.taux),
        unit: "‰",
        detail: `${ind.nombre.toLocaleString("fr-FR")} cas déclarés en ${delinq.annee} · population ${delinq.population.toLocaleString("fr-FR")}`,
        perimetre: "commune",
        source: SRC_SSMSI.label,
        gravite: "info",
      });
    }
  } else {
    donneesManquantes.push("statistiques de délinquance (SSMSI)");
  }

  // --- Gare ferroviaire la plus proche (accessibilité, mobilité) ---
  if (geo.lat != null && geo.lon != null) {
    const gare = await fetchGareProche(geo.lat, geo.lon);
    if (gare) {
      if (!sources.includes(SRC_OSM)) sources.push(SRC_OSM);
      faits.push({
        label: "Gare ferroviaire la plus proche",
        value: fmt(gare.distanceKm),
        unit: "km",
        detail: gare.nom,
        source: SRC_OSM.label,
        gravite: gare.distanceKm <= 2 ? "positif" : gare.distanceKm <= 8 ? "info" : "attention",
      });
    } else {
      donneesManquantes.push("gare ferroviaire à proximité (aucune trouvée dans un rayon de 20 km, ou service OpenStreetMap momentanément indisponible)");
    }

    // --- Caractère du quartier (résidentiel / mixte / zone d'activité) ---
    const landuse = await fetchLanduse(geo.lat, geo.lon);
    if (landuse && landuse.total > 0) {
      if (!sources.includes(SRC_OSM)) sources.push(SRC_OSM);
      const pctResidentiel = Math.round((landuse.residentiel / landuse.total) * 100);
      const pctActivite = landuse.activite / landuse.total;
      const caractere =
        pctResidentiel >= 65 ? "Résidentiel" : pctActivite >= 0.5 ? "Zone d'activité" : "Mixte";
      faits.push({
        label: "Caractère du quartier",
        value: caractere,
        detail: `${pctResidentiel} % des zones cadastrées à usage résidentiel, sur ${landuse.total} zones recensées`,
        perimetre: "rayon 1 km",
        source: SRC_OSM.label,
        gravite: "info",
      });
    } else {
      donneesManquantes.push("occupation du sol (OpenStreetMap momentanément indisponible)");
    }
  } else {
    donneesManquantes.push("gare et occupation du sol (bien non géolocalisé)");
  }

  const disponible = faits.length > 0;
  return {
    cle: "quartier",
    titre: BLOC_LABELS.quartier,
    note: null,
    poids: 0,
    disponible,
    faits,
    sources,
    narration: "",
    donneesManquantes,
    messageIndisponible: disponible ? undefined : "Données de quartier indisponibles pour ce bien.",
  };
}

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}
