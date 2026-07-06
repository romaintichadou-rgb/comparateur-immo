/**
 * Contrat de données de l'Analyse IA.
 *
 * Principe directeur (non négociable) : l'IA ne produit JAMAIS un chiffre.
 * Chaque `Fait` provient d'une API publique réelle (BAN, Géorisques, ADEME,
 * DVF...). Les notes /5 sont calculées par des règles déterministes
 * (voir scoring.ts). Le LLM n'intervient que dans `narration` / `synthese`,
 * pour mettre les faits en mots — sans inventer de donnée absente des faits.
 */

export type BlocKey = "prix" | "location" | "risque" | "potentiel" | "quartier";

export const BLOC_LABELS: Record<BlocKey, string> = {
  prix: "Prix d'achat",
  location: "Potentiel locatif",
  risque: "Risques",
  potentiel: "Potentiel",
  quartier: "Quartier",
};

// Poids de chaque bloc dans la note globale. Prix + location dominent
// volontairement (décision produit). Le total fait 1 sur les 4 blocs notés.
// "quartier" est purement informatif : poids 0, jamais noté, jamais compté
// dans la moyenne (computeScoreGlobal filtre déjà sur note != null).
export const BLOC_POIDS: Record<BlocKey, number> = {
  prix: 0.3,
  location: 0.3,
  risque: 0.2,
  potentiel: 0.2,
  quartier: 0,
};

/** Tonalité d'un fait, pour la coloration UI (pas pour le calcul du score). */
export type FaitGravite = "positif" | "info" | "attention" | "alerte";

export interface Source {
  label: string; // ex. "Géorisques", "ADEME — DPE", "BAN"
  url?: string;
}

/**
 * Une donnée réelle unitaire, STRUCTURÉE (pas une phrase). La valeur chiffrée
 * et son unité sont des champs distincts ; la source et le périmètre de
 * comparaison sont eux aussi séparés, jamais noyés dans le texte. `value` peut
 * être null si la donnée est manquante (jamais comblée par une estimation).
 */
export interface Fait {
  label: string; // ex. "Prix/m² médian comparable"
  value: string | number | null; // donnée principale (ex. 4544, "D", "2,9 – 5,7")
  unit?: string; // ex. "€/m²", "%", "‰", "/5"
  detail?: string; // contexte non chiffré (ex. "446 ventes · 2024–2026")
  perimetre?: string; // base de comparaison (ex. "rayon 500 m", "arrondissement")
  source: string; // label de la source (doit correspondre à un Source.label)
  gravite?: FaitGravite;
}

/** Métrique mise en avant sous forme de carte (ex. rendement brut / net). */
export interface BlocHighlight {
  label: string;
  value: string; // ex. "6,2 %"
  tone: "neutral" | "positif" | "attention" | "alerte";
}

export interface BlocAnalyse {
  cle: BlocKey;
  titre: string;
  /** Note /5 (5 = meilleur). null si les données ne sont pas disponibles. */
  note: number | null;
  poids: number;
  /** Métriques mises en avant en cartes, au-dessus des faits (ex. rendement). */
  highlights?: BlocHighlight[];
  /** Étiquettes DPE / GES à afficher en échelle colorée A→G (bloc Risques). */
  dpeGes?: { dpe: string; ges: string };
  /** false = bloc pas encore implémenté (Phase à venir) ou aucune donnée. */
  disponible: boolean;
  faits: Fait[];
  sources: Source[];
  /** Résumé COURT rédigé par l'IA (1-2 phrases, sans remplissage). */
  narration: string;
  /** Données non disponibles pour ce bloc (jamais estimées). */
  donneesManquantes?: string[];
  /** Message affiché quand disponible = false ou note = null. */
  messageIndisponible?: string;
}

export type VerdictNiveau = "alerte" | "attention" | "positif";

/**
 * Verdict textuel INDÉPENDANT du score numérique. Sert à faire remonter un
 * point rédhibitoire (ex. rendement locatif insuffisant) que la moyenne
 * pondérée pourrait masquer. Affiché en évidence, avant/à côté du score.
 */
export interface Verdict {
  niveau: VerdictNiveau;
  titre: string;
  detail: string;
}

export interface AnalyseIA {
  version: number;
  genere_le: string; // ISO 8601
  /** Note globale /5 pondérée (avec plafonds rédhibitoires appliqués). */
  score_global: number | null;
  /** Verdicts textuels indépendants du score (dealbreakers en tête). */
  verdicts: Verdict[];
  /** Synthèse transverse rédigée par l'IA. "" tant qu'absente. */
  synthese: string;
  blocs: Record<BlocKey, BlocAnalyse>;
}

export const ANALYSE_VERSION = 1;

/** Bloc vide "à venir", pour les phases pas encore implémentées. */
export function blocIndisponible(cle: BlocKey, message: string): BlocAnalyse {
  return {
    cle,
    titre: BLOC_LABELS[cle],
    note: null,
    poids: BLOC_POIDS[cle],
    disponible: false,
    faits: [],
    sources: [],
    narration: "",
    messageIndisponible: message,
  };
}
