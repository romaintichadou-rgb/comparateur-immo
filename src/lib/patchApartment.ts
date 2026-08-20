import "server-only";

import { requireApartment, updateApartment } from "@/lib/db";
import { computeDerived } from "@/lib/calculations";
import { geocodeApartmentLocation } from "@/lib/geocoding";
import { capitalEffectif } from "@/lib/simulation";
import { CHAMPS_ESTIMABLES, type Apartment, type ApartmentPatch, type ChampEstimable } from "@/lib/types";

/**
 * Application d'une modification du bien — le PASSAGE OBLIGÉ de toute écriture
 * venant d'un formulaire, quel que soit l'écran d'origine.
 *
 * ⚠️ Écrire un patch ne se réduit PAS à `updateApartment(id, patch)` : trois
 * effets de bord y sont attachés (badges « estimé » à retirer, re-géocodage,
 * suivi du montant emprunté). Ils vivaient dans le corps de `PATCH
 * /api/apartments/[id]`, donc une seconde route qui écrivait le même patch les
 * perdait en silence — c'est ce qui serait arrivé au recalcul en chaîne, qui
 * modifie précisément l'adresse et le prix.
 */

// Champs dont dépend le géocodage : les coordonnées de la carte ne sont
// calculées qu'à la création (voir POST /api/apartments). Un bien importé
// sans adresse précise (ex. Leboncoin ne l'affiche pas publiquement) est
// alors géocodé au niveau du quartier ; si l'adresse exacte est renseignée
// plus tard, il faut re-géocoder, sinon le pin reste bloqué sur l'ancienne
// position approximative malgré l'adresse à jour.
const CHAMPS_LOCALISATION = ["adresse", "quartier", "ville", "code_postal"] as const;

// Champs qui changent le COÛT TOTAL de l'opération, donc le plan de financement.
const CHAMPS_COUT_OPERATION = ["prix", "travaux", "frais_notaire_estimes", "ameublement"] as const;

/**
 * Fait suivre un montant emprunté FIGÉ quand le coût de l'opération change.
 *
 * En mode auto (`montantEmprunte == null`), l'emprunt suit déjà le prix : rien
 * à faire. Mais dès que l'utilisateur saisit un montant, celui-ci est stocké en
 * ABSOLU — changer le prix d'achat ensuite laissait un emprunt calibré sur
 * l'ancien prix, donc une mensualité, un impôt et un cash-flow faux, sans le
 * moindre signal.
 *
 * On garde l'APPORT constant et on répercute l'écart sur l'emprunt : c'est ce
 * que l'utilisateur a réellement décidé en figeant le champ (« je mets tant de
 * ma poche »), et c'est déjà la convention du moteur de recommandations, qui
 * répercute une négociation de prix sur le capital à apport inchangé.
 */
function suivreMontantEmprunte(current: Apartment, patch: ApartmentPatch): ApartmentPatch {
  const inputs = current.simulation_inputs;
  const capital = inputs?.montantEmprunte;
  if (inputs == null || capital == null) return {}; // mode auto : déjà dérivé
  if (patch.simulation_inputs !== undefined) return {}; // l'appelant pilote le plan lui-même
  if (!CHAMPS_COUT_OPERATION.some((k) => k in patch)) return {};

  const avant = computeDerived(current).budget_total;
  const apres = computeDerived({ ...current, ...patch }).budget_total;
  if (avant == null || apres == null || avant === apres) return {};

  // On repart du capital EFFECTIF, pas du montant stocké : s'il était déjà
  // incohérent (figé à un prix supérieur), lui appliquer l'écart propagerait
  // la base fausse. Passer par le plafond partagé de `simulate` répare la
  // valeur en base au premier changement de prix.
  const effectif = capitalEffectif(capital, avant, avant);
  return {
    simulation_inputs: {
      ...inputs,
      montantEmprunte: Math.max(0, Math.round(effectif + (apres - avant))),
    },
  };
}

/**
 * @param current bien AVANT modification — relu si non fourni.
 * @returns la ligne à jour.
 */
export async function appliquerPatch(
  id: string,
  patch: ApartmentPatch,
  current?: Apartment
): Promise<Apartment> {
  const avant = current ?? (await requireApartment(id));

  // Toute modification manuelle d'un champ estimable désactive définitivement
  // son badge "estimé" (pas de réestimation automatique future), sauf si le
  // patch fournit explicitement champs_manuels (ex. bouton « réestimer », qui
  // remet au contraire un champ en mode estimé — voir `marquerEstimeIa`).
  let champsManuels: ChampEstimable[];
  if (patch.champs_manuels !== undefined) {
    champsManuels = patch.champs_manuels;
  } else {
    const nouveaux = (Object.keys(patch) as (keyof typeof patch)[])
      .filter((key): key is ChampEstimable => (CHAMPS_ESTIMABLES as readonly string[]).includes(key))
      .filter((key) => patch[key] !== avant[key]);
    champsManuels = Array.from(new Set([...avant.champs_manuels, ...nouveaux]));
  }

  let geoPatch: ApartmentPatch = {};
  if (CHAMPS_LOCALISATION.some((key) => key in patch && patch[key] !== avant[key])) {
    try {
      const fusionne = { ...avant, ...patch };
      const geo = await geocodeApartmentLocation({
        adresse: fusionne.adresse,
        quartier: fusionne.quartier,
        ville: fusionne.ville,
        code_postal: fusionne.code_postal,
      });
      if (geo) {
        geoPatch = {
          latitude: geo.latitude,
          longitude: geo.longitude,
          precision_localisation: geo.precision_localisation,
          code_insee: geo.code_insee,
        };
      }
    } catch {
      // Best-effort : la localisation reste inchangée en cas d'échec.
    }
  }

  return updateApartment(id, {
    ...patch,
    ...suivreMontantEmprunte(avant, patch),
    ...geoPatch,
    champs_manuels: champsManuels,
  });
}
