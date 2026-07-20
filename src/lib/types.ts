import { z } from "zod";
import type { AnalyseIA } from "./analyse/types";
import type { SimulationInputs } from "./simulation";

const simulationInputsSchema = z.object({
  montantEmprunte: z.number().nullable(),
  tauxCreditPct: z.number(),
  dureeAnnees: z.number(),
  tauxAssurancePct: z.number(),
  tmiPct: z.number(),
  revalorisationBienPct: z.number().nullable(),
  revalorisationLoyerPct: z.number().nullable(),
  indexationChargesPct: z.number().nullable(),
  vacanceLocativePct: z.number().nullable().optional().transform((v) => v ?? null),
});

export const PLATEFORMES = [
  "Leboncoin",
  "SeLoger",
  "PAP",
  "Orpi",
  "Manuel",
] as const;
export type Plateforme = (typeof PLATEFORMES)[number];

export const STATUTS = ["à visiter", "visité", "abandonné", "acheté"] as const;
export type Statut = (typeof STATUTS)[number];

export const PRECISIONS_LOCALISATION = ["exacte", "arrondissement"] as const;
export type PrecisionLocalisation = (typeof PRECISIONS_LOCALISATION)[number];

export const DPE_GES_VALEURS = ["A", "B", "C", "D", "E", "F", "G"] as const;
export type DpeGesValeur = (typeof DPE_GES_VALEURS)[number];

export const TYPES_BIEN = [
  "Studio",
  "Appartement",
  "Duplex",
  "Loft",
  "Maison",
  "Immeuble",
  "Autre",
] as const;

/**
 * Un immeuble (de rapport) casse les hypothèses "un seul logement" du reste
 * du modèle : le loyer est le TOTAL de tous les lots (pas surface × €/m² d'un
 * logement), il n'y a pas de copropriété (on possède tout l'immeuble), et sa
 * vente en bloc se compare mal aux ventes d'appartements au détail. Ce
 * prédicat centralise le test pour que loyer estimé, charges, assurance et
 * analyse IA s'adaptent au même endroit. Comparaison insensible à la casse et
 * aux espaces pour tolérer une valeur saisie/importée non normalisée.
 */
export function isImmeuble(typeBien: string | null | undefined): boolean {
  return (typeBien ?? "").trim().toLowerCase() === "immeuble";
}

export const ETATS_BIEN = [
  "Neuf",
  "Bon état",
  "À rafraîchir",
  "À rénover",
] as const;

/**
 * Champ pouvant provenir d'une estimation/extraction automatique.
 * Liste des clés Apartment pour lesquelles on suit si l'utilisateur
 * a repris la main manuellement (fait disparaître le badge "estimé").
 */
export const CHAMPS_ESTIMABLES = [
  "frais_notaire_estimes",
  "taxe_fonciere",
  "charges_copro_annuelles",
  "assurance_annuelle",
  "loyer_retenu",
] as const;
export type ChampEstimable = (typeof CHAMPS_ESTIMABLES)[number];

// Champs stockés tels quels dans la table `apartments` (une ligne = un
// appartement). Les champs calculés (prix_m2, budget_total, rendement_brut,
// rendement_net)
// ne sont volontairement PAS stockés : ils sont recalculés à l'affichage
// pour rester toujours cohérents avec les valeurs sources.
export interface Apartment {
  // Identification
  id: string;
  url: string;
  plateforme: Plateforme;
  description: string;
  date_ajout: string; // ISO 8601
  statut: Statut;

  // Localisation
  adresse: string;
  quartier: string;
  ville: string;
  code_postal: string;
  code_insee: string; // code INSEE commune (via BAN) — clé de jointure DVF/ADEME/etc.
  latitude: number | null;
  longitude: number | null;
  precision_localisation: PrecisionLocalisation | null;

  // Caractéristiques du bien
  type_bien: string;
  surface_m2: number | null;
  nb_pieces: number | null;
  nb_chambres: number | null;
  // Nombre de lots/logements — pertinent uniquement pour un Immeuble (voir
  // isImmeuble). Guide l'estimation du loyer total et l'assurance, et permet
  // d'afficher un loyer/lot. null pour un logement unique.
  nb_lots: number | null;
  etage: string;
  ascenseur: boolean | null;
  annee_construction: number | null;
  etat_bien: string;
  dpe: string;
  ges: string;

  // Financier — achat
  prix: number | null;
  frais_notaire_estimes: number | null;
  travaux: number | null;

  // Financier — location
  loyer_retenu: number | null;
  loyer_justification: string;

  // Financier — charges annuelles
  charges_copro_annuelles: number | null;
  charges_justification: string;
  taxe_fonciere: number | null;
  taxe_fonciere_justification: string;
  assurance_annuelle: number | null;
  hypothese_gestion_pct: number;

  // Quote-part terrain (% du prix non amortissable en LMNP).
  // null = automatique selon la zone (urbain 10%, périurbain 15%, rural 20%).
  quote_part_terrain_pct: number | null;

  // Notes
  notes: string;
  score_coup_de_coeur: number | null;
  photo_url: string;

  // Contact (agence ou propriétaire) — tout est facultatif.
  contact_nom: string;
  contact_telephone: string;
  contact_email: string;

  // Suivi des champs modifiés manuellement (désactive le badge "estimé"
  // et empêche toute réestimation automatique future de ce champ).
  champs_manuels: ChampEstimable[];

  // Champs dont la valeur actuelle vient d'une estimation IA (recherche web
  // + Gemini), PAS de la formule déterministe locale de estimates.ts. Tant
  // qu'un champ est ici (et pas dans champs_manuels), applyLiveEstimates ne
  // le recalcule plus en direct — sinon la formule déterministe écraserait
  // silencieusement la valeur IA à la prochaine lecture. Un champ peut
  // sortir de cette liste uniquement via une nouvelle estimation IA ou une
  // édition manuelle (qui bascule alors dans champs_manuels).
  champs_estimes_ia: ChampEstimable[];

  // Analyse IA (blocs de scores + faits réels + narration). Écrite uniquement
  // par la route /api/analyse/[id], jamais via les formulaires. null tant
  // qu'aucune analyse n'a été lancée.
  analyse_ia: AnalyseIA | null;

  // Hypothèses de l'onglet Simulation financière (crédit, revalorisations),
  // enregistrées explicitement par l'utilisateur (bouton dédié, pas à chaque
  // frappe). null tant qu'aucune hypothèse n'a été enregistrée : le bloc
  // "Simulation financière" de l'Analyse IA utilise alors defaultInputs().
  simulation_inputs: SimulationInputs | null;
}

export const DEFAULT_HYPOTHESE_GESTION_PCT = 5;

export function emptyApartment(): Omit<Apartment, "id" | "date_ajout"> {
  return {
    url: "",
    plateforme: "Manuel",
    description: "",
    statut: "à visiter",
    adresse: "",
    quartier: "",
    ville: "",
    code_postal: "",
    code_insee: "",
    latitude: null,
    longitude: null,
    precision_localisation: null,
    type_bien: "Appartement",
    surface_m2: null,
    nb_pieces: null,
    nb_chambres: null,
    nb_lots: null,
    etage: "",
    ascenseur: null,
    annee_construction: null,
    etat_bien: "",
    dpe: "",
    ges: "",
    prix: null,
    frais_notaire_estimes: null,
    travaux: null,
    charges_copro_annuelles: null,
    charges_justification: "",
    taxe_fonciere: null,
    taxe_fonciere_justification: "",
    assurance_annuelle: null,
    loyer_retenu: null,
    loyer_justification: "",
    hypothese_gestion_pct: DEFAULT_HYPOTHESE_GESTION_PCT,
    quote_part_terrain_pct: null,
    notes: "",
    score_coup_de_coeur: null,
    photo_url: "",
    contact_nom: "",
    contact_telephone: "",
    contact_email: "",
    champs_manuels: [],
    champs_estimes_ia: [],
    analyse_ia: null,
    simulation_inputs: null,
  };
}

// Champs "bruts" partagés par les schémas de création et de mise à jour,
// sans `.default()` : c'est le schéma de création qui décide de la valeur
// de repli pour un champ absent (via `.transform`), jamais `.partial()`
// utilisé seul (voir apartmentPatchSchema plus bas).
const apartmentBaseFields = {
  url: z.string(),
  plateforme: z.enum(PLATEFORMES),
  description: z.string(),
  statut: z.enum(STATUTS),
  adresse: z.string(),
  quartier: z.string(),
  ville: z.string(),
  code_postal: z.string(),
  code_insee: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  precision_localisation: z.enum(PRECISIONS_LOCALISATION).nullable(),
  type_bien: z.string(),
  surface_m2: z.number().nullable(),
  nb_pieces: z.number().nullable(),
  nb_chambres: z.number().nullable(),
  nb_lots: z.number().nullable(),
  etage: z.string(),
  ascenseur: z.boolean().nullable(),
  annee_construction: z.number().nullable(),
  etat_bien: z.string(),
  dpe: z.string(),
  ges: z.string(),
  prix: z.number().nullable(),
  frais_notaire_estimes: z.number().nullable(),
  travaux: z.number().nullable(),
  charges_copro_annuelles: z.number().nullable(),
  charges_justification: z.string(),
  taxe_fonciere: z.number().nullable(),
  taxe_fonciere_justification: z.string(),
  assurance_annuelle: z.number().nullable(),
  loyer_retenu: z.number().nullable(),
  loyer_justification: z.string(),
  hypothese_gestion_pct: z.number(),
  quote_part_terrain_pct: z.number().nullable(),
  notes: z.string(),
  score_coup_de_coeur: z.number().min(1).max(5).nullable(),
  photo_url: z.string(),
  contact_nom: z.string(),
  contact_telephone: z.string(),
  contact_email: z.string(),
  champs_manuels: z.array(z.enum(CHAMPS_ESTIMABLES)),
  champs_estimes_ia: z.array(z.enum(CHAMPS_ESTIMABLES)),
  simulation_inputs: simulationInputsSchema.nullable(),
};

// Schéma de validation pour la création depuis les formulaires et les
// routes API. Tous les champs sont optionnels à la création car un ajout
// par URL ne renseigne que ce que le parser a réussi à extraire ; chaque
// champ absent reçoit ici sa valeur de repli explicite. Exception : le prix
// est obligatoire — sans lui, budget total, rendement et cash-flow ne
// peuvent tout simplement pas être calculés, l'analyse serait vide de sens.
export const apartmentInputSchema = z
  .object(apartmentBaseFields)
  .partial()
  .refine((data) => data.prix != null, {
    message: "Le prix d'achat est obligatoire.",
    path: ["prix"],
  })
  .transform((data) => ({
    url: data.url ?? "",
    plateforme: data.plateforme ?? "Manuel",
    description: data.description ?? "",
    statut: data.statut ?? "à visiter",
    adresse: data.adresse ?? "",
    quartier: data.quartier ?? "",
    ville: data.ville ?? "",
    code_postal: data.code_postal ?? "",
    code_insee: data.code_insee ?? "",
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    precision_localisation: data.precision_localisation ?? null,
    type_bien: data.type_bien ?? "Appartement",
    surface_m2: data.surface_m2 ?? null,
    nb_pieces: data.nb_pieces ?? null,
    nb_chambres: data.nb_chambres ?? null,
    nb_lots: data.nb_lots ?? null,
    etage: data.etage ?? "",
    ascenseur: data.ascenseur ?? null,
    annee_construction: data.annee_construction ?? null,
    etat_bien: data.etat_bien ?? "",
    dpe: data.dpe ?? "",
    ges: data.ges ?? "",
    prix: data.prix ?? null,
    frais_notaire_estimes: data.frais_notaire_estimes ?? null,
    travaux: data.travaux ?? null,
    charges_copro_annuelles: data.charges_copro_annuelles ?? null,
    charges_justification: data.charges_justification ?? "",
    taxe_fonciere: data.taxe_fonciere ?? null,
    taxe_fonciere_justification: data.taxe_fonciere_justification ?? "",
    assurance_annuelle: data.assurance_annuelle ?? null,
    loyer_retenu: data.loyer_retenu ?? null,
    loyer_justification: data.loyer_justification ?? "",
    hypothese_gestion_pct: data.hypothese_gestion_pct ?? DEFAULT_HYPOTHESE_GESTION_PCT,
    quote_part_terrain_pct: data.quote_part_terrain_pct ?? null,
    notes: data.notes ?? "",
    score_coup_de_coeur: data.score_coup_de_coeur ?? null,
    photo_url: data.photo_url ?? "",
    contact_nom: data.contact_nom ?? "",
    contact_telephone: data.contact_telephone ?? "",
    contact_email: data.contact_email ?? "",
    champs_manuels: data.champs_manuels ?? [],
    champs_estimes_ia: data.champs_estimes_ia ?? [],
    simulation_inputs: data.simulation_inputs ?? null,
  }));

export type ApartmentInput = z.infer<typeof apartmentInputSchema>;

// Pour les PATCH depuis la fiche détaillée : tous les champs optionnels,
// SANS valeur par défaut. Construit depuis apartmentBaseFields (pas depuis
// apartmentInputSchema.partial()) : un champ absent du patch doit rester
// absent après parsing, sinon un patch minimal ({unSeulChamp: valeur})
// écraserait tous les autres champs du bien avec des valeurs vides — c'est
// exactement le bug qui faisait "disparaître" un bien après une petite
// modification (ex. l'hypothèse de frais de gestion).
export const apartmentPatchSchema = z.object(apartmentBaseFields).partial();
export type ApartmentPatch = z.infer<typeof apartmentPatchSchema>;

export interface ApartmentWithComputed extends Apartment {
  prix_m2: number | null;
  budget_total: number | null;
  rendement_brut: number | null;
  rendement_net: number | null;
}
