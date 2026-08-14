import { isImmeuble, type Apartment, type PrecisionLocalisation } from "@/lib/types";
import { computeDerived } from "@/lib/calculations";
import { lotsEffectifs } from "@/lib/estimates";
import { geocodeApartmentLocation } from "@/lib/geocoding";
import { typologieAnil } from "@/lib/anilReference";
import { getSettings } from "@/lib/db";
import { coordsAuBatiment, coordsDansLeSecteur, perimetreAnalyse } from "./perimetre";
import { buildBlocRisque } from "./blocs/risque";
import { buildBlocPrix } from "./blocs/prix";
import { buildBlocLocation } from "./blocs/location";
import { buildBlocPotentiel } from "./blocs/potentiel";
import { buildBlocQuartier } from "./blocs/quartier";
import { buildBlocSimulation } from "./blocs/simulation";
import { fetchDvf } from "./sources/dvf";
import { fetchOsmBundle } from "./sources/osm";
import { fetchLoyerRef } from "./sources/loyers";
import { fetchDpe } from "./sources/ademe";
import { fetchGeorisques } from "./sources/georisques";
import { fetchDelinquance, parentPLM } from "./sources/delinquance";
import { fetchRevenuMedian, fetchProfilCommune } from "./sources/demographie";
import { narrateAll, type NarrationStatus } from "./narration";
import { buildVerdicts, seuilsRendementFromSettings, withScoreGlobal } from "./scoring";
import { buildRecommandations } from "./recommandations";
import { ANALYSE_VERSION, empreinteBien, type AnalyseIA, type BlocAnalyse, type BlocKey } from "./types";

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
): Promise<{
  analyse: AnalyseIA;
  /**
   * Localisation RECALCULÉE par le géocodage de cette exécution, à persister
   * par l'appelant.
   *
   * ⚠️ Ne pas se contenter du `code_insee` : `reestimation.ts`
   * (`/api/estimate-rent`) lit la précision STOCKÉE pour choisir son périmètre
   * ANIL, pendant que l'analyse re-géocode à chaque exécution. Jeter la
   * précision fraîche laissait les deux chemins diverger en silence dès que la
   * BAN enrichissait une voie de ses numéros, ou qu'un géocodage avait échoué à
   * la création — exactement la divergence que `perimetreAnalyse` supprime.
   */
  localisation: {
    code_insee: string;
    latitude: number | null;
    longitude: number | null;
    precision_localisation: PrecisionLocalisation | null;
  };
  narrationStatus: NarrationStatus;
}> {
  // ⚠️ Lancé AVANT le géocodage, pas dans la vague parallèle qui suit : c'est
  // la seule source qui ne dépend d'AUCUNE coordonnée. L'attendre derrière le
  // géocodage ajoutait sa latence en pure perte, alors qu'elle se recouvre
  // gratuitement avec lui. Pas de `await` ici — la promesse est consommée plus
  // bas, une fois la localisation résolue.
  const settingsPromise = getSettings();

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
  const parent = parentPLM(codeInsee);
  // Ressource ANIL adaptée au bien — doit être la MÊME que celle utilisée par
  // `/api/estimate-rent`, sinon l'analyse jugerait le loyer contre une autre
  // référence que celle qui l'a produit. ⚠️ Vaut aussi pour le PÉRIMÈTRE, pas
  // seulement pour la typologie : les deux chemins passent par
  // `perimetreAnalyse()` (voir `reestimation.ts`).
  const typologie = typologieAnil(apt.type_bien, apt.nb_pieces, isImmeuble(apt.type_bien), apt.surface_m2);

  // ⚠️ UN SEUL périmètre pour toute la collecte : le MÊME objet part chez DVF
  // et chez l'ANIL, donc les deux sources ne PEUVENT plus couvrir deux échelles
  // différentes. La jointure DPE partage le même verdict via
  // `coordsAuBatiment()` — elle joint sur l'identifiant BAN, et un identifiant
  // de VOIE n'y apparie rien.
  //
  // Le pourquoi (trois critères concurrents, divergence visible à l'écran entre
  // le bloc Prix et le bloc Rendement) est dans `analyse/perimetre.ts`.
  const localisation = { lat, lon, codeInsee, precision };
  const perimetre = perimetreAnalyse(localisation);
  // ⚠️ Les sources PONCTUELLES (OSM, aléa argile) se gardent ici, pas sur
  // `hasCoords`. Avoir des coordonnées ne dit pas qu'elles valent quelque
  // chose : sans adresse, elles pointent le centre de la commune, et « 3
  // transports à moins de 800 m » devenait un fait sur le centre-ville affiché
  // comme un fait sur le bien. Le niveau `rue` suffit (voir `perimetre.ts`).
  const coordsFines = coordsDansLeSecteur(localisation);

  const [dvf, osm, settings, loyerData, dpeData, georisques, delinq, delinqVille, revenu, profilCommune] =
    await Promise.all([
      perimetre ? fetchDvf({ perimetre, surface: apt.surface_m2 }) : null,
      coordsFines ? fetchOsmBundle(lat as number, lon as number) : null,
      settingsPromise,
      perimetre ? fetchLoyerRef(perimetre, typologie) : null,
      banId && coordsAuBatiment(localisation)
        ? fetchDpe({ banId, surface: apt.surface_m2 })
        : { records: [], meilleurMatch: null },
      hasCoords
        ? fetchGeorisques({ lat: lat as number, lon: lon as number, codeInsee, coordsFines })
        : null,
      fetchDelinquance(codeInsee),
      parent ? fetchDelinquance(parent) : null,
      fetchRevenuMedian(codeInsee),
      fetchProfilCommune(codeInsee),
    ]);
  const loyerRef = loyerData?.ref ?? null;
  // Libellé lu sur la donnée (comme `dvf.perimetreLabel`), jamais redéduit du
  // périmètre DEMANDÉ : l'ANIL ne descend pas sous la commune, un rayon de
  // 500 m qui n'en traverse qu'une seule rend exactement la valeur communale.
  const loyerPerimetre = loyerData?.perimetreLabel ?? "arrondissement/commune";

  // Les seuils de rendement (Paramètres) pilotent à la fois la note du bloc
  // "Rendement" et le plafond rédhibitoire du score global — même
  // source pour rester cohérent avec ce qui est affiché.
  const seuils = seuilsRendementFromSettings(settings);
  const aptComputed = computeDerived(apt);

  // Blocs : fonctions pures sur les données préchargées ci-dessus.
  const prix = buildBlocPrix(apt, dvf, precision);
  const location = buildBlocLocation(apt, loyerRef, seuils, loyerPerimetre);
  const risque = buildBlocRisque(apt, dpeData, georisques, precision);
  const potentiel = buildBlocPotentiel(apt, dvf, osm?.commodites ?? null, delinq, delinqVille, precision);
  const quartier = buildBlocQuartier({
    apt,
    precision,
    revenu,
    profilCommune,
    gare: osm?.gare ?? null,
    landuse: osm?.landuse ?? null,
    vieQuartier: osm?.vieQuartier ?? null,
    // « Géo disponible » = le point vaut quelque chose, pas « on a des
    // coordonnées » : c'est ce qui décide d'annoncer une donnée MANQUANTE
    // (« gare ferroviaire à proximité ») plutôt que de laisser croire qu'elle
    // n'existe pas. Sans adresse, rien n'a été mesuré, il n'y a donc rien à
    // déclarer manquant — l'invite du bloc Potentiel porte déjà la cause.
    geoDisponible: coordsFines,
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
    // Estampille du profil ayant servi au calcul : c'est ce qui permettra plus
    // tard de détecter que les réglages ont changé (bandeau « obsolète »).
    settings,
    // Idem côté BIEN : loyer, charges et hypothèses de crédit se modifient par
    // des chemins qui ne relancent pas l'analyse (`saveField`,
    // `SimulationFinanciere`). L'empreinte est le seul moyen de le voir.
    //
    // ⚠️ Calculée sur `aptComputed`, PAS sur `apt`. La bannière d'obsolescence
    // compare cette empreinte à `empreinteBien(apt)` côté client, où `apt` est
    // toujours passé par `computeDerived` — donc par `applyLiveEstimates`, qui
    // RECALCULE quatre champs présents dans l'empreinte : frais de notaire,
    // taxe foncière, charges de copropriété, assurance.
    //
    // Estampiller la ligne brute rendait donc les deux côtés structurellement
    // incomparables dès qu'un de ces champs était en mode auto : la bannière
    // « les données du bien ont changé » revenait immédiatement après chaque
    // relance, indéfiniment, sans qu'aucune donnée n'ait bougé. Constaté en
    // base : `frais_notaire_estimes` stocké à 18 750 € et recalculé à 20 250 €
    // sur le même bien.
    empreinteBien: empreinteBien(aptComputed),
  };

  // Score global pondéré (avec plafonds) + verdicts, AVANT la narration (la
  // synthèse doit connaître le score et les verdicts pour mener sur le point
  // rédhibitoire). Un seul appel LLM produit narrations de blocs + synthèse.
  const scored = withScoreGlobal(analyse, rendementNet, seuils);
  scored.verdicts = buildVerdicts(scored.blocs, rendementNet, seuils);

  // Recommandations prescriptives (lecture seule) : projections "si tu faisais
  // X → note Y", calculées sur des copies du bien avec les données déjà
  // préchargées. Ne modifie ni le bien ni son analyse (voir recommandations.ts).
  scored.recommandations = buildRecommandations(apt, {
    dvf,
    loyerRef,
    dpeData,
    georisques,
    settings,
    seuils,
    precision,
    loyerPerimetre,
    baseBlocs: scored.blocs,
    baseScore: scored.score_global,
    baseVerdicts: scored.verdicts,
    rendementNetBase: rendementNet,
  });

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

  const narr = await narrateAll(
    scored,
    { quartier: apt.quartier, ville: apt.ville },
    contexteBien,
    precision
  );
  // Les blocs sont mutés en place : `scored.blocs` porte les MÊMES objets, la
  // narration y apparaît donc sans réassignation. Une boucle sur les clés
  // plutôt que six lignes jumelles — ajouter un bloc ne demande plus d'y
  // penser (l'oubli était silencieux : narration vide, aucune erreur).
  for (const [cle, bloc] of Object.entries(scored.blocs) as [BlocKey, BlocAnalyse][]) {
    bloc.narration = narr.blocs[cle] ?? "";
  }
  scored.synthese = narr.synthese;

  return {
    analyse: scored,
    localisation: {
      code_insee: codeInsee,
      latitude: lat,
      longitude: lon,
      precision_localisation: precision,
    },
    narrationStatus: narr.status,
  };
}

/**
 * Patch de localisation à écrire après une analyse — vide si rien n'a bougé.
 *
 * Partagé par les deux appelants de `runAnalyse` (`/api/analyse/[id]` et
 * `/api/apartments/[id]/recalc`) : ils persistaient chacun le seul
 * `code_insee`, avec la même condition recopiée. Toute la localisation
 * recalculée est désormais réconciliée d'un bloc — voir `runAnalyse`.
 *
 * ⚠️ Ne jamais écraser une valeur connue par une valeur nulle : un géocodage
 * en échec retombe sur les champs déjà stockés, les réécrire à `null`
 * effacerait le pin de la carte et le périmètre d'estimation sur un simple
 * incident réseau.
 */
export function patchLocalisation(
  avant: Pick<Apartment, "code_insee" | "latitude" | "longitude" | "precision_localisation">,
  apres: Awaited<ReturnType<typeof runAnalyse>>["localisation"]
): Partial<Apartment> {
  const patch: Partial<Apartment> = {};
  if (apres.code_insee && apres.code_insee !== avant.code_insee) patch.code_insee = apres.code_insee;
  if (apres.latitude != null && apres.latitude !== avant.latitude) patch.latitude = apres.latitude;
  if (apres.longitude != null && apres.longitude !== avant.longitude) patch.longitude = apres.longitude;
  if (
    apres.precision_localisation != null &&
    apres.precision_localisation !== avant.precision_localisation
  ) {
    patch.precision_localisation = apres.precision_localisation;
  }
  return patch;
}
