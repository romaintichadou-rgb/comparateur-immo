/**
 * Contrat de données de l'Analyse IA.
 *
 * Principe directeur (non négociable) : l'IA ne produit JAMAIS un chiffre.
 * Chaque `Fait` provient d'une API publique réelle (BAN, Géorisques, ADEME,
 * DVF...) ou d'un calcul déterministe (simulation financière). Les notes /10
 * sont calculées par des règles déterministes (voir scoring.ts). Le LLM
 * n'intervient que dans `narration` / `synthese`, pour mettre les faits en
 * mots — sans inventer de donnée absente des faits.
 */

export type BlocKey = "prix" | "location" | "risque" | "potentiel" | "quartier" | "simulation";

export const BLOC_LABELS: Record<BlocKey, string> = {
  prix: "Prix d'achat",
  location: "Potentiel locatif",
  risque: "Risques",
  potentiel: "Potentiel",
  quartier: "Quartier",
  simulation: "Simulation financière",
};

// Poids de chaque bloc dans la note globale. Prix + simulation financière
// dominent volontairement (décision produit) : le prix d'achat et le
// cash-flow réel après crédit et fiscalité sont les deux critères les plus
// déterminants pour la décision d'achat. Le total fait 1 sur les 5 blocs
// notés. "quartier" est purement informatif : poids 0, jamais noté, jamais
// compté dans la moyenne (computeScoreGlobal filtre déjà sur note != null).
export const BLOC_POIDS: Record<BlocKey, number> = {
  prix: 0.3,
  location: 0.2,
  risque: 0.15,
  potentiel: 0.15,
  simulation: 0.2,
  quartier: 0,
};

export const BLOC_POIDS_SANS_PRIX: Record<BlocKey, number> = {
  prix: 0,
  location: 0.35,
  risque: 0.15,
  potentiel: 0.15,
  simulation: 0.35,
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
  unit?: string; // ex. "€/m²", "%", "‰", "/10"
  detail?: string; // contexte non chiffré (ex. "446 ventes · 2024–2026")
  perimetre?: string; // base de comparaison (ex. "rayon 500 m", "arrondissement")
  source: string; // label de la source (doit correspondre à un Source.label)
  gravite?: FaitGravite;
  // true si `value` vient d'une estimation IA (recherche web + Gemini), pas
  // d'une donnée vérifiée — affiche le badge "Estimation IA" dans FaitRow
  // (voir buildBlocLocation pour le loyer retenu).
  estimeParIA?: boolean;
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
  /** Note /10 (10 = meilleur). null si les données ne sont pas disponibles. */
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
  /** Invitation à l'action (ex. "ajoute l'adresse"), avec lien discret. */
  invite?: { text: string; href: string; linkLabel: string };
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

/** Décision d'achat à 3 niveaux (voir decision.ts, source unique). */
export type Decision = "achete" | "negocie" | "passe";

/** Overrides d'un scénario de recommandation appliqués à une COPIE du bien
 * (jamais au bien réel). Reconstruits côté client via
 * `computeDerived({ ...apt, ...patch })` pour les popups de détail. */
export interface RecommandationPatch {
  prix?: number;
  loyer_retenu?: number;
  dpe?: string;
  ges?: string;
  travaux?: number | null;
  simulation_inputs?: import("@/lib/simulation").SimulationInputs | null;
}

/** Leviers d'optimisation prescriptifs (onglet "Optimiser"). */
export type RecommandationLevier = "prix" | "travaux" | "loyer" | "financement";

/**
 * Argument concret pour passer à l'action sur un levier (négocier, louer plus
 * cher…). 100 % déterministe : `detail`/`verbatim` s'appuient sur un fait réel
 * de l'analyse (chiffres interpolés) ou une bonne pratique — jamais de donnée
 * inventée. `verbatim` = phrase prête à dire au vendeur/locataire (vouvoiement).
 */
export interface Argument {
  /** Titre court (ex. "Prix au-dessus du marché"). */
  titre: string;
  /** Explication en 1 phrase (chiffres du bien interpolés). */
  detail: string;
  /** Phrase prête à l'emploi, affichée entre « » (adressée au vendeur/locataire). */
  verbatim?: string;
  /** Source du fait qui fonde l'argument (crédibilité). */
  source?: "DVF" | "ADEME" | "ANIL" | "Géorisques" | "Calcul";
}

/**
 * Recommandation d'action PRESCRIPTIVE, purement informative et orientée
 * DÉCISION + RENTABILITÉ (pas le score). Chaque entrée dit ce qu'une action
 * change concrètement : rendement net et cash-flow avant → après, et si elle
 * fait basculer le verdict vers "Achète". Calculée par le MÊME moteur
 * déterministe que l'analyse, sur une COPIE de l'appartement — ne modifie jamais
 * le bien réel (prix, loyer, dpe, score, verdicts restent intacts). Voir
 * `buildRecommandations` (recommandations.ts).
 */
export interface Recommandation {
  levier: RecommandationLevier;
  /** Intitulé de l'action (ex. "Négocier le prix d'achat"). */
  titre: string;
  /** Action concrète et chiffrée (ex. "Négocie à 240 000 € — soit −8 % (−20 000 €)"). */
  action: string;
  /** Rendement net avant / après l'action (fraction, ex. 0.051). */
  rendementAvant: number | null;
  rendementApres: number | null;
  /** Cash-flow mensuel moyen avant / après (€/mois). */
  cashflowAvant: number | null;
  cashflowApres: number | null;
  /** Verdict après l'action (permet de signaler un passage à "achete"). */
  verdictApres: Decision;
  /** true si l'action fait passer un bien non-"achète" à "achète". */
  flipVersAchat: boolean;
  /** Levier prix : prix cible et ampleur de la baisse. */
  prixCible?: number;
  baisseEuros?: number;
  baissePct?: number;
  /** Détails "avant → après" spécifiques au levier (affichés si présents). */
  prixAchatAvant?: number;
  prixAchatApres?: number;
  prixM2Avant?: number;
  prixM2Apres?: number;
  loyerAvant?: number;
  loyerApres?: number;
  /** Overrides EXACTS appliqués au bien pour ce scénario (prix, loyer, dpe,
   * travaux, crédit). Permet au client de reconstruire le bien modifié
   * (`computeDerived({ ...apt, ...patch })`) et d'ouvrir les popups de détail
   * du calcul (rendement, cash-flow) avec les nouvelles valeurs, sans dupliquer
   * la logique du moteur. */
  patch?: RecommandationPatch;
  /** Arguments concrets pour passer à l'action (négocier, louer plus cher…).
   * Déterministe, adossé aux faits réels de l'analyse. Absent = accordéon masqué. */
  arguments?: Argument[];
  /** Explication courte et actionnable. */
  pourquoi: string;
  /** Coût ou effort estimé (ex. "≈ 24 000 € de travaux"), optionnel. */
  cout?: string;
  /** Réserve honnête sur l'hypothèse, optionnel. */
  caveat?: string;
}

export interface AnalyseIA {
  version: number;
  genere_le: string; // ISO 8601
  /** Note globale /10 pondérée (avec plafonds rédhibitoires appliqués). */
  score_global: number | null;
  /** Verdicts textuels indépendants du score (dealbreakers en tête). */
  verdicts: Verdict[];
  /** Synthèse transverse rédigée par l'IA. "" tant qu'absente. */
  synthese: string;
  blocs: Record<BlocKey, BlocAnalyse>;
  /** Recommandations d'optimisation prescriptives (lecture seule). Absent des
   * analyses générées avant la v2 → l'onglet "Optimiser" invite à relancer. */
  recommandations?: Recommandation[];
}

export const ANALYSE_VERSION = 3;

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
