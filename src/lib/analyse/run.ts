import type { Apartment } from "@/lib/types";
import { computeDerived } from "@/lib/calculations";
import { geocodeApartmentLocation } from "@/lib/geocoding";
import { getSettings } from "@/lib/sheets";
import { buildBlocRisque } from "./blocs/risque";
import { buildBlocPrix } from "./blocs/prix";
import { buildBlocLocation } from "./blocs/location";
import { buildBlocPotentiel } from "./blocs/potentiel";
import { buildBlocQuartier } from "./blocs/quartier";
import { fetchDvf } from "./sources/dvf";
import { fetchCommodites } from "./sources/osm";
import { narrateAll, type NarrationStatus } from "./narration";
import { buildVerdicts, seuilsRendementFromSettings, withScoreGlobal } from "./scoring";
import { ANALYSE_VERSION, type AnalyseIA } from "./types";

/**
 * Assemble l'Analyse IA complète d'un bien.
 *
 * Étape clé : on (re)géocode via BAN pour obtenir les coordonnées, le code
 * INSEE et surtout l'identifiant BAN (clé de jointure ADEME, non stocké). Puis
 * on construit chaque bloc à partir de données réelles. En Phase 1, seul le
 * bloc Risque est réellement calculé ; les trois autres sont marqués "à venir".
 */
export async function runAnalyse(
  apt: Apartment
): Promise<{ analyse: AnalyseIA; codeInsee: string; narrationStatus: NarrationStatus }> {
  let lat = apt.latitude;
  let lon = apt.longitude;
  let codeInsee = apt.code_insee;
  let banId = "";

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
    }
  } catch {
    // Géocodage best-effort : on retombe sur les coordonnées déjà stockées.
  }

  // Sources partagées entre blocs : récupérées une seule fois. Les seuils de
  // rendement (Paramètres) pilotent à la fois la note du bloc "Potentiel
  // locatif" et le plafond rédhibitoire du score global — même source pour
  // rester cohérent avec ce qui est affiché.
  const [dvf, commodites, settings] = await Promise.all([
    lat != null && lon != null ? fetchDvf({ lat, lon, surface: apt.surface_m2 }) : Promise.resolve(null),
    lat != null && lon != null ? fetchCommodites(lat, lon) : Promise.resolve(null),
    getSettings(),
  ]);
  const seuils = seuilsRendementFromSettings(settings);

  // Les blocs sont indépendants : on les construit en parallèle.
  const [prix, location, risque, potentiel, quartier] = await Promise.all([
    buildBlocPrix(apt, dvf),
    buildBlocLocation(apt, codeInsee, seuils),
    buildBlocRisque(apt, { lat, lon, codeInsee, banId }),
    buildBlocPotentiel(apt, dvf, commodites, codeInsee),
    buildBlocQuartier(codeInsee, { lat, lon }),
  ]);

  // Rendement net réel du bien : pilote le plafond rédhibitoire et les verdicts.
  const rendementNet = computeDerived(apt).rendement_net;

  const analyse: AnalyseIA = {
    version: ANALYSE_VERSION,
    genere_le: new Date().toISOString(),
    score_global: null,
    verdicts: [],
    synthese: "",
    blocs: { prix, location, risque, potentiel, quartier },
  };

  // Score global pondéré (avec plafonds) + verdicts, AVANT la narration (la
  // synthèse doit connaître le score et les verdicts pour mener sur le point
  // rédhibitoire). Un seul appel LLM produit narrations de blocs + synthèse.
  const scored = withScoreGlobal(analyse, rendementNet, seuils);
  scored.verdicts = buildVerdicts(scored.blocs, rendementNet, seuils);

  const narr = await narrateAll(scored, { quartier: apt.quartier, ville: apt.ville });
  prix.narration = narr.blocs.prix ?? "";
  location.narration = narr.blocs.location ?? "";
  risque.narration = narr.blocs.risque ?? "";
  potentiel.narration = narr.blocs.potentiel ?? "";
  quartier.narration = narr.blocs.quartier ?? "";
  scored.synthese = narr.synthese;

  return { analyse: scored, codeInsee, narrationStatus: narr.status };
}
