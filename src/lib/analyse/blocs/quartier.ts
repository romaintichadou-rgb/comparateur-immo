import { fetchRevenuMedian, fetchProfilCommune } from "../sources/demographie";
import { fetchGareProche, fetchLanduse, fetchVieQuartier } from "../sources/osm";
import { BLOC_LABELS, type BlocAnalyse, type Fait, type Source } from "../types";

/**
 * Bloc "Quartier" — purement informatif (jamais noté, ne compte pas dans le
 * score global) : une étude du quartier pour quelqu'un qui ne le connaît pas
 * du tout — standing, ambiance, accessibilité, équipements. La sécurité est
 * déjà couverte dans le bloc "Potentiel" (comparaison vs la ville) : pas de
 * doublon ici. 100 % basé sur des données réelles :
 *  - data.gouv.fr (INSEE Filosofi) : revenu médian disponible du secteur.
 *  - data.gouv.fr (Communes et villes de France) : population et densité de
 *    la commune, avec la typologie officielle (grand centre urbain, rural...).
 *  - OpenStreetMap : gare la plus proche, occupation du sol (caractère
 *    résidentiel), vie de quartier (restaurants/bars/cafés), espaces verts,
 *    écoles et équipements de santé à proximité.
 *
 * La synthèse "points forts / points faibles" est rédigée par l'IA à partir
 * de ces faits réels (voir narration.ts) — jamais de donnée inventée ici.
 */

const SRC_REVENU: Source = {
  label: "INSEE Filosofi — revenus",
  url: "https://www.data.gouv.fr/datasets/revenu-des-francais-a-la-commune",
};
const SRC_COMMUNE: Source = {
  label: "Communes et villes de France",
  url: "https://www.data.gouv.fr/datasets/communes-et-villes-de-france-en-csv-excel-json-parquet-et-feather",
};
const SRC_OSM: Source = { label: "OpenStreetMap", url: "https://www.openstreetmap.org/" };

export async function buildBlocQuartier(
  codeInsee: string,
  geo: { lat: number | null; lon: number | null }
): Promise<BlocAnalyse> {
  const faits: Fait[] = [];
  const sources: Source[] = [];
  const donneesManquantes: string[] = [];

  const [revenu, profilCommune, gare, landuse, vieQuartier] = await Promise.all([
    codeInsee ? fetchRevenuMedian(codeInsee) : Promise.resolve(null),
    codeInsee ? fetchProfilCommune(codeInsee) : Promise.resolve(null),
    geo.lat != null && geo.lon != null ? fetchGareProche(geo.lat, geo.lon) : Promise.resolve(null),
    geo.lat != null && geo.lon != null ? fetchLanduse(geo.lat, geo.lon) : Promise.resolve(null),
    geo.lat != null && geo.lon != null ? fetchVieQuartier(geo.lat, geo.lon) : Promise.resolve(null),
  ]);

  // --- Standing du secteur : revenu médian ---
  if (revenu) {
    sources.push(SRC_REVENU);
    faits.push({
      label: "Revenu médian disponible",
      value: fmt(revenu.medianeDisponible),
      unit: "€/an/UC",
      detail: "par unité de consommation, ménages fiscaux du secteur",
      perimetre: "arrondissement/commune",
      source: SRC_REVENU.label,
      gravite: "info",
    });
  } else {
    donneesManquantes.push("revenu médian du secteur (INSEE Filosofi)");
  }

  // --- Profil de la commune : taille, densité, typologie ---
  if (profilCommune) {
    sources.push(SRC_COMMUNE);
    faits.push({
      label: "Typologie de la commune",
      value: profilCommune.typologie || "—",
      detail: `${profilCommune.population.toLocaleString("fr-FR")} habitants · ${fmt(profilCommune.densite)} hab/km²`,
      perimetre: "commune",
      source: SRC_COMMUNE.label,
      gravite: "info",
    });
  } else {
    donneesManquantes.push("profil démographique de la commune");
  }

  // --- Accessibilité : gare la plus proche ---
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
  } else if (geo.lat != null) {
    donneesManquantes.push("gare ferroviaire à proximité");
  }

  // --- Caractère du quartier (résidentiel / mixte / zone d'activité) ---
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
  } else if (geo.lat != null) {
    donneesManquantes.push("occupation du sol (OpenStreetMap)");
  }

  // --- Vie de quartier : sorties, espaces verts, écoles, santé ---
  if (vieQuartier) {
    if (!sources.includes(SRC_OSM)) sources.push(SRC_OSM);

    const sorties = vieQuartier.restaurants + vieQuartier.barsEtCafes;
    const ambiance = sorties >= 25 ? "Très animé" : sorties >= 8 ? "Animé" : sorties >= 2 ? "Calme" : "Très calme";
    faits.push({
      label: "Vie de quartier",
      value: ambiance,
      detail: `${vieQuartier.restaurants} restaurants · ${vieQuartier.barsEtCafes} bars/cafés`,
      perimetre: `rayon ${vieQuartier.rayonSortiesM} m`,
      source: SRC_OSM.label,
      gravite: "info",
    });

    if (vieQuartier.parcs > 0) {
      faits.push({
        label: "Espaces verts",
        value: vieQuartier.parcs,
        unit: vieQuartier.parcs > 1 ? "parcs/jardins" : "parc/jardin",
        detail:
          vieQuartier.parcLePlusProcheKm != null
            ? `le plus proche à ${fmt(vieQuartier.parcLePlusProcheKm)} km`
            : undefined,
        perimetre: `rayon ${vieQuartier.rayonParcsM} m`,
        source: SRC_OSM.label,
        gravite: "positif",
      });
    } else {
      faits.push({
        label: "Espaces verts",
        value: "Aucun recensé",
        perimetre: `rayon ${vieQuartier.rayonParcsM} m`,
        source: SRC_OSM.label,
        gravite: "attention",
      });
    }

    if (vieQuartier.ecoles.length > 0) {
      faits.push({
        label: "Écoles à proximité",
        value: vieQuartier.ecoles.length,
        detail: vieQuartier.ecoles.join(" · "),
        perimetre: `rayon 800 m`,
        source: SRC_OSM.label,
        gravite: "info",
      });
    }

    faits.push({
      label: "Santé de proximité",
      value: vieQuartier.sante,
      unit: "pharmacies/médecins/cliniques",
      perimetre: `rayon 800 m`,
      source: SRC_OSM.label,
      gravite: vieQuartier.sante > 0 ? "info" : "attention",
    });
  } else if (geo.lat != null) {
    donneesManquantes.push("vie de quartier, espaces verts et équipements (OpenStreetMap)");
  }

  if (geo.lat == null) {
    donneesManquantes.push("accessibilité, caractère et vie de quartier (bien non géolocalisé)");
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
