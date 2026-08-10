import type { ApartmentPatch } from "./types";

/**
 * Ce qu'une modification du bien oblige à recalculer.
 *
 * Partagé entre le CLIENT (qui allume ses skeletons avant l'appel et nomme les
 * étapes dans la bannière) et le SERVEUR (qui exécute réellement la chaîne,
 * voir `/api/apartments/[id]/recalc`). Une seule table de champs pour les
 * deux : les faire diverger afficherait un skeleton pour une étape qui ne
 * tourne pas, ou l'inverse.
 *
 * Pipeline ÉLAGUÉ : on ne rejoue que les appels réellement impactés. Ex.
 * changer le prix seul → seule l'Analyse IA (DVF) est concernée ; le loyer et
 * les charges n'en dépendent pas et ne sont pas re-sollicités.
 */

/** Champs qui changent l'estimation de loyer. */
const RENT_FIELDS = [
  "surface_m2", "type_bien", "nb_lots", "nb_pieces", "nb_chambres", "etage",
  "ascenseur", "annee_construction", "etat_bien", "dpe", "ville", "quartier",
  "code_postal", "adresse", "travaux", "description",
] as const;

/** Champs qui changent les charges de copropriété / la taxe foncière. */
const CHARGES_FIELDS = [
  "surface_m2", "ascenseur", "annee_construction", "type_bien", "nb_lots",
  "ville", "quartier", "code_postal", "adresse",
] as const;

/** Champs qui changent la prime d'assurance PNO (calcul déterministe). */
const ASSURANCE_FIELDS = ["surface_m2", "type_bien", "nb_lots"] as const;

/** Champs qui changent un bloc de l'Analyse IA (prix/DVF, localisation, DPE…). */
const ANALYSIS_FIELDS = [
  "prix", "travaux", "frais_notaire_estimes", "surface_m2", "type_bien",
  "nb_lots", "nb_pieces", "nb_chambres", "etage", "ascenseur",
  "annee_construction", "etat_bien", "dpe", "ges", "ville", "quartier",
  "code_postal", "adresse",
] as const;

export interface RecalcNeeds {
  rent: boolean;
  charges: boolean;
  assurance: boolean;
  analysis: boolean;
}

export function computeRecalcNeeds(patch: ApartmentPatch): RecalcNeeds {
  const keys = Object.keys(patch);
  const touches = (fields: readonly string[]) => keys.some((k) => fields.includes(k));
  return {
    rent: touches(RENT_FIELDS),
    charges: touches(CHARGES_FIELDS),
    assurance: touches(ASSURANCE_FIELDS),
    analysis: touches(ANALYSIS_FIELDS),
  };
}

/** Étapes à annoncer à l'utilisateur, dans l'ordre où le serveur les exécute. */
export function etapesRecalc(needs: RecalcNeeds): string[] {
  return [
    needs.charges && "charges",
    needs.rent && "loyer",
    needs.assurance && "assurance",
    needs.analysis && "analyse IA",
  ].filter((e): e is string => typeof e === "string");
}
