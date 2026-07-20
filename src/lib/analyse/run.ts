import { isImmeuble, type Apartment, type PrecisionLocalisation } from "@/lib/types";
import { computeDerived } from "@/lib/calculations";
import { lotsEffectifs } from "@/lib/estimates";
import { geocodeApartmentLocation } from "@/lib/geocoding";
import { getSettings } from "@/lib/db";
import { buildBlocRisque } from "./blocs/risque";
import { buildBlocPrix } from "./blocs/prix";
import { buildBlocLocation } from "./blocs/location";
import { buildBlocPotentiel } from "./blocs/potentiel";
import { buildBlocQuartier } from "./blocs/quartier";
import { buildBlocSimulation } from "./blocs/simulation";
import { fetchDvf } from "./sources/dvf";
import { fetchOsmBundle } from "./sources/osm";
import { fetchLoyerReference, fetchLoyerReferenceLocal } from "./sources/loyers";
import { fetchDpe } from "./sources/ademe";
import { fetchGeorisques } from "./sources/georisques";
import { fetchDelinquance, parentPLM } from "./sources/delinquance";
import { fetchRevenuMedian, fetchProfilCommune } from "./sources/demographie";
import { narrateAll, type NarrationStatus } from "./narration";
import { buildVerdicts, seuilsRendementFromSettings, withScoreGlobal } from "./scoring";
import { ANALYSE_VERSION, type AnalyseIA } from "./types";

/**
 * Assemble l'Analyse IA complète d'un bien.
 *
 * Étape clé : on (re)géocode via BAN pour obtenir les coordonnées, le code
 * INSEE et surtout l'identifiant BAN (clé de jointure ADEME, non stocké).
 * Puis TOUTES les sources de données sont interrogées en UNE SEULE vague
 * parallèle — la latence totale de la collecte est celle de la source la
 * plus lente, pas la somme. Les blocs sont ensuite des fonctions pures sur
 * ces données préchargées, et un unique appel LLM rédige les narrations.
 */
export async function runAnalyse(
  apt: Apartment
): Promise<{ analyse: AnalyseIA; codeInsee: string; narrationStatus: NarrationStatus }> {
  let lat = apt.latitude;
  let lon = apt.longitude;
  let codeInsee = apt.code_insee;
  let banId = "";
  let precision: PrecisionLocalisation | null = apt.precision_localisation;

  try {
    const geo = await geocodeApartmentLocation({
      adresse: apt.adresse,
      quartier: apt.quartier,
      ville: apt.ville,
      code_postal: apt.code_postal,
    });
    if (geo) {
      lat = geo.latitude;
      lon = geo.longitude;
      codeInsee = geo.code_insee || codeInsee;
      banId = geo.ban_id;
      precision = geo.precision_localisation;
    }
  } catch {
    // Géocodage best-effort : on retombe sur les coordonnées déjà stockées.
  }

  const hasCoords = lat != null && lon != null;
  // La jointure ADEME par identifiant BAN est exacte : sans adresse exacte
  // saisie, le banId désigne le centroïde du quartier (un autre bâtiment) —
  // on ne tente alors pas le DPE (voir buildBlocRisque).
  const adresseExacte = apt.adresse.trim() !== "";
  const parent = parentPLM(codeInsee);

  const [dvf, osm, settings, loyerRefResult, dpeData, georisques, delinq, delinqVille, revenu, profilCommune] =
    await Promise.all([
      hasCoords ? fetchDvf({ lat: lat as number, lon: lon as number, surface: apt.surface_m2 }) : null,
      hasCoords ? fetchOsmBundle(lat as number, lon as number) : null,
      getSettings(),
      adresseExacte && hasCoords
        ? fetchLoyerReferenceLocal(lat as number, lon as number, codeInsee)
        : fetchLoyerReference(codeInsee).then((ref) => (ref ? { ref, nbCommunes: 0 } : null)),
      banId && adresseExacte
        ? fetchDpe({ banId, surface: apt.surface_m2 })
        : { records: [], meilleurMatch: null },
      hasCoords ? fetchGeorisques({ lat: lat as number, lon: lon as number, codeInsee }) : null,
      fetchDelinquance(codeInsee),
      parent ? fetchDelinquance(parent) : null,
      fetchRevenuMedian(codeInsee),
      fetchProfilCommune(codeInsee),
    ]);
  const loyerRef = loyerRefResult?.ref ?? null;
  const loyerPerimetre: "rayon500" | "arrondissement" = adresseExacte && hasCoords ? "rayon500" : "arrondissement";

  // Les seuils de rendement (Paramètres) pilotent à la fois la note du bloc
  // "Potentiel locatif" et le plafond rédhibitoire du score global — même
  // source pour rester cohérent avec ce qui est affiché.
  const seuils = seuilsRendementFromSettings(settings);
  const aptComputed = computeDerived(apt);

  // Blocs : fonctions pures sur les données préchargées ci-dessus.
  const prix = buildBlocPrix(apt, dvf, precision);
  const location = buildBlocLocation(apt, loyerRef, seuils, loyerPerimetre);
  const risque = buildBlocRisque(apt, dpeData, georisques);
  const potentiel = buildBlocPotentiel(apt, dvf, osm?.commodites ?? null, delinq, delinqVille, precision);
  const quartier = buildBlocQuartier({
    revenu,
    profilCommune,
    gare: osm?.gare ?? null,
    landuse: osm?.landuse ?? null,
    vieQuartier: osm?.vieQuartier ?? null,
    geoDisponible: hasCoords,
  });
  const simulation = buildBlocSimulation(aptComputed, settings);

  // Rendement net réel du bien : pilote le plafond rédhibitoire et les verdicts.
  const rendementNet = aptComputed.rendement_net;

  const analyse: AnalyseIA = {
    version: ANALYSE_VERSION,
    genere_le: new Date().toISOString(),
    score_global: null,
    verdicts: [],
    synthese: "",
    blocs: { prix, location, risque, potentiel, quartier, simulation },
  };

  // Score global pondéré (avec plafonds) + verdicts, AVANT la narration (la
  // synthèse doit connaître le score et les verdicts pour mener sur le point
  // rédhibitoire). Un seul appel LLM produit narrations de blocs + synthèse.
  const scored = withScoreGlobal(analyse, rendementNet, seuils);
  scored.verdicts = buildVerdicts(scored.blocs, rendementNet, seuils);

  // Contexte du type de bien pour la narration : un immeuble de rapport
  // change la lecture (loyer = total des lots, prix comparé à des ventes
  // d'appartements avec décote de bloc, pas de copropriété).
  const contexteBien = isImmeuble(apt.type_bien)
    ? `TYPE DE BIEN : Immeuble de rapport${
        apt.nb_lots != null && apt.nb_lots > 0
          ? ` de ${apt.nb_lots} lots`
          : ` (~${lotsEffectifs(apt.nb_lots, apt.surface_m2)} lots estimés)`
      } — le loyer affiché est le TOTAL de tous les logements (pas un loyer unique) ; le prix/m² est comparé à des ventes d'appartements au détail, or un immeuble se vend en bloc avec décote (10-20 %) ; il n'y a pas de copropriété, les charges sont celles d'exploitation de l'immeuble entier. Parle de "cet immeuble", jamais de "cet appartement".`
    : undefined;

  const narr = await narrateAll(scored, { quartier: apt.quartier, ville: apt.ville }, contexteBien);
  prix.narration = narr.blocs.prix ?? "";
  location.narration = narr.blocs.location ?? "";
  risque.narration = narr.blocs.risque ?? "";
  potentiel.narration = narr.blocs.potentiel ?? "";
  quartier.narration = narr.blocs.quartier ?? "";
  simulation.narration = narr.blocs.simulation ?? "";
  scored.synthese = narr.synthese;

  return { analyse: scored, codeInsee, narrationStatus: narr.status };
}
