import "server-only";

import { updateApartment } from "@/lib/db";
import { computeDerived } from "@/lib/calculations";
import { estimateCharges, type ChargesField } from "@/lib/chargesEstimation";
import { estimateRent } from "@/lib/rentEstimation";
import { getTauxCommune } from "@/lib/taxeFonciereCommune";
import { fetchLoyerRef } from "@/lib/analyse/sources/loyers";
import { perimetreAnalyse } from "@/lib/analyse/perimetre";
import { typologieAnil } from "@/lib/anilReference";
import { estimateAssurance, marquerEstimeIa } from "@/lib/estimates";
import { isImmeuble, type Apartment, type ChampEstimable } from "@/lib/types";

/**
 * Ré-estimations d'un champ, côté serveur — le corps métier partagé entre les
 * routes « un champ à la fois » (`/api/estimate-rent`, `/api/estimate-charges`)
 * et la chaîne complète (`/api/apartments/[id]/recalc`).
 *
 * Chaque fonction prend le bien À JOUR, écrit en base et renvoie la ligne
 * mise à jour : les appeler à la suite enchaîne les recalculs sans repasser
 * par le réseau ni relire la ligne entre deux étapes.
 *
 * ⚠️ L'ordre charges → loyer n'est pas interchangeable : l'estimation de loyer
 * lit les charges retenues pour convertir hors charges → charges comprises
 * (voir `buildConsigneCharges` dans `rentEstimation.ts`). Inverser donnerait un
 * loyer calibré sur les charges de la veille.
 */

/** Toutes ces ré-estimations écrasent une saisie manuelle : c'est l'action explicite « ré-estimer ». */
export async function reestimerLoyer(apartment: Apartment): Promise<Apartment> {
  // Charges ACTUELLEMENT retenues pour ce bien (formule déterministe, IA, ou
  // saisie manuelle — `computeDerived` applique déjà cette priorité) : sert de
  // base à la provision HC→CC du prompt, pour rester cohérent avec ce
  // qu'affiche la section « Charges annuelles ».
  const chargesCoproAnnuelles = computeDerived(apartment).charges_copro_annuelles;

  // La ressource ANIL dépend du bien : maison, T1-T2 ou T3+ n'ont ni le même
  // loyer/m² ni la même surface de référence (voir `anilReference.ts`).
  //
  // ⚠️ **Même périmètre que l'analyse**, via `perimetreAnalyse()` — pas la
  // simple ligne communale. `buildBlocLocation` juge ce loyer contre SA
  // référence et en tire le « +X % vs marché » : deux périmètres différents
  // faisaient comparer le loyer à une autre référence que celle qui l'a
  // produit. Invisible tant qu'une seule commune est traversée (la quasi-
  // totalité des biens), faux dès qu'un bien géocodé au bâtiment est à moins
  // de 500 m d'une limite communale.
  //
  // Le coût réseau est amorti : les reverse-géocodages BAN passent par le Data
  // Cache de Next (`CACHE_SOURCES_S`, 30 jours), donc seule la toute première
  // estimation d'un bien les paie.
  const perimetre = perimetreAnalyse({
    lat: apartment.latitude,
    lon: apartment.longitude,
    codeInsee: apartment.code_insee,
    precision: apartment.precision_localisation,
  });
  const loyerRef = perimetre
    ? (
        await fetchLoyerRef(
          perimetre,
          typologieAnil(apartment.type_bien, apartment.nb_pieces, isImmeuble(apartment.type_bien), apartment.surface_m2)
        )
      )?.ref ?? null
    : null;

  const { loyer, loyerHC, justification, calcul } = await estimateRent(
    {
      ville: apartment.ville,
      quartier: apartment.quartier,
      code_postal: apartment.code_postal,
      surface_m2: apartment.surface_m2,
      nb_pieces: apartment.nb_pieces,
      nb_chambres: apartment.nb_chambres,
      type_bien: apartment.type_bien,
      nb_lots: apartment.nb_lots,
      charges_copro_annuelles: chargesCoproAnnuelles,
      etage: apartment.etage,
      ascenseur: apartment.ascenseur,
      annee_construction: apartment.annee_construction,
      etat_bien: apartment.etat_bien,
      dpe: apartment.dpe,
      ges: apartment.ges,
      travaux: apartment.travaux,
      description: apartment.description,
      precisionLocalisation: apartment.precision_localisation,
    },
    loyerRef,
    apartment.loyer_calcul
  );

  return updateApartment(apartment.id, {
    loyer_retenu: loyer,
    loyer_hc: loyerHC,
    loyer_justification: justification,
    loyer_calcul: calcul,
    ...marquerEstimeIa(apartment, ["loyer_retenu"]),
  });
}

/** `field` absent = les deux champs (charges de copropriété ET taxe foncière). */
export async function reestimerCharges(
  apartment: Apartment,
  field?: ChargesField
): Promise<Apartment> {
  const result = await estimateCharges(
    {
      ville: apartment.ville,
      quartier: apartment.quartier,
      code_postal: apartment.code_postal,
      type_bien: apartment.type_bien,
      surface_m2: apartment.surface_m2,
      nb_lots: apartment.nb_lots,
      annee_construction: apartment.annee_construction,
      etage: apartment.etage,
      ascenseur: apartment.ascenseur,
      etat_bien: apartment.etat_bien,
      prix: apartment.prix,
      code_insee: apartment.code_insee,
    },
    field,
    apartment.charges_calcul,
  );

  if (result.chargesCalcul?.reutilise) {
    return updateApartment(apartment.id, {
      charges_calcul: result.chargesCalcul,
    });
  }

  const wantCopro = field !== "taxe_fonciere";
  const wantTf = field !== "charges_copro_annuelles";

  const patch: Partial<Apartment> = {};
  if (wantCopro) {
    patch.charges_copro_annuelles = result.chargesCoproAnnuelles;
    patch.charges_justification = result.chargesJustification;
  }
  if (wantTf) {
    patch.taxe_fonciere = result.taxeFonciere;
    patch.taxe_fonciere_justification = result.taxeJustification;
  }
  if (result.chargesCalcul) {
    patch.charges_calcul = result.chargesCalcul;
  }

  const touches: ChampEstimable[] = [];
  if (wantCopro) touches.push("charges_copro_annuelles");
  if (wantTf) touches.push("taxe_fonciere");

  // ⚠️ Une taxe foncière issue du taux communal réel (DGFiP) n'est PAS une
  // estimation IA : elle ne doit pas porter le badge correspondant, sans quoi
  // la donnée la plus fiable du bloc s'afficherait comme la moins sûre.
  const tfCommunale = apartment.code_insee != null && getTauxCommune(apartment.code_insee) != null;
  const estimesIa = touches.filter((c) => !(c === "taxe_fonciere" && tfCommunale));

  return updateApartment(apartment.id, {
    ...patch,
    ...marquerEstimeIa(apartment, estimesIa, touches),
  });
}

/**
 * Assurance PNO : calcul déterministe local (aucun appel IA), mais présenté
 * comme les autres champs estimés côté UI — choix UX assumé, voir AGENTS.md.
 */
export async function reestimerAssurance(apartment: Apartment): Promise<Apartment> {
  const valeur = estimateAssurance(
    isImmeuble(apartment.type_bien),
    apartment.nb_lots,
    apartment.surface_m2,
    apartment.type_bien
  );
  return updateApartment(apartment.id, {
    assurance_annuelle: valeur,
    ...marquerEstimeIa(apartment, ["assurance_annuelle"]),
  });
}

