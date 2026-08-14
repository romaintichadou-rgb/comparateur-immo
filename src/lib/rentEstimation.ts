import { createHash } from "node:crypto";
import { generateGeminiText, getGeminiApiKey } from "./gemini";
import { isImmeuble, type PrecisionLocalisation } from "./types";
import { formatCommune, formatSecteur } from "./adresse";
import { sanitizeJustification } from "./format";
import { lotsEffectifs } from "./estimates";
import { deriveLoyerHC } from "./calculations";
import {
  MAJORATION_MEUBLE,
  estReferenceFiable,
  referenceCCMeuble,
  typologieAnil,
  type ReferenceCC,
  type TypologieAnil,
} from "./anilReference";
import { plafondEncadrementParis, type PlafondLegalParis } from "./encadrementLoyers";
import type { LoyerReference } from "./analyse/sources/loyers";

export interface RentEstimationInput {
  ville: string;
  quartier: string;
  code_postal: string;
  surface_m2: number | null;
  nb_pieces: number | null;
  nb_chambres: number | null;
  type_bien: string;
  nb_lots: number | null;
  charges_copro_annuelles: number | null;
  etage: string;
  ascenseur: boolean | null;
  annee_construction: number | null;
  etat_bien: string;
  dpe: string;
  ges: string;
  travaux: number | null;
  description: string;
  /**
   * Précision de la géolocalisation du bien. `"exacte"` = adresse géocodée
   * jusqu'au numéro de rue ; `"arrondissement"` (ou `null`) = position connue
   * seulement au niveau du quartier/de la commune. Sert à `buildPromptResidu`
   * pour décider si l'IA a le droit de juger la rue, le vis-à-vis ou
   * l'exposition précise (voir `CAVEAT_LOCALISATION_APPROX`) — même principe
   * que le DPE ADEME (jointure par `banId`) dans `run.ts`, qui applique déjà
   * cette règle pour la même raison.
   */
  precisionLocalisation: PrecisionLocalisation | null;
}

/**
 * Un critère qualitatif retenu par le résidu IA — voir `buildPromptResidu`.
 * Exporté pour être réutilisé par `LoyerCalcul` (persistance, `types.ts`).
 */
export interface CritereResidu {
  libelle: string;
  /**
   * `"neutre"` RÉSERVÉ au placeholder « logement ordinaire, conforme à son
   * secteur » (voir RÈGLE DE CALIBRAGE dans `buildPromptResidu`) — la
   * consigne interdit explicitement à l'IA de l'utiliser ailleurs. Sans
   * cette 3ᵉ valeur, ce placeholder devait forcer `"positif"` pour respecter
   * le schéma, ce qui affichait un tag vert alors que RIEN de notable n'a
   * été trouvé — incohérent, corrigé après coup (voir panneau de détail).
   */
  sens: "positif" | "negatif" | "neutre";
  /**
   * Non exploitée en Phase 2 (pas de tags par catégorie tant que le panneau
   * n'a pas été refondu — Phase 4). Collectée dès maintenant pour ne pas
   * avoir à retoucher le prompt/schéma à ce moment-là.
   */
  categorie?: string;
}

/**
 * Détail structuré du calcul, persisté tel quel (colonne JSON
 * `Apartment.loyer_calcul`, migration 0013) pour que le panneau (Phase 4)
 * puisse le rejouer SANS refaire l'appel IA. `null` sur les chemins qui ne
 * passent pas par un résidu (immeuble, logement sans référence ANIL) — un
 * montant absolu n'a rien à décomposer.
 *
 * ⚠️ Choix JSON plutôt que colonnes dédiées : le contenu va évoluer (ex. un
 * indicateur de fiabilité de la référence ANIL, Phase 3) et une colonne JSON
 * absorbe cet ajout sans nouvelle migration — contrairement à des colonnes
 * séparées, qui en demanderaient une à chaque champ.
 */
export interface LoyerCalcul {
  /** Écart NET (%, signé, déjà clampé ±20) retenu pour construire le loyer. */
  ajustementPct: number;
  /** Critères IA retenus, DÉJÀ filtrés du double comptage, ordonnés par importance décroissante. */
  criteres: CritereResidu[];
  /** Ressource ANIL utilisée pour ce calcul (`appartement_t1_t2`, etc.). */
  typologie: TypologieAnil;
  /** Loyer déterministe (avant résidu) — c'est aussi l'ancre donnée au prompt. */
  loyerDeterministe: number;
  /** `true` si l'appel IA a échoué : résidu retombé à 0, déterministe seul retenu. */
  echecIa: boolean;
  /**
   * `false` quand la référence ANIL est de fiabilité réduite (3.4) : niveau
   * `maille`/`epci` (la prédiction ne vient pas de la commune elle-même) ou
   * moins de 30 observations (seuil recommandé par la note méthodologique
   * ANIL). Sert à signaler l'incertitude, pas à écarter la référence — c'est
   * toujours la meilleure donnée disponible.
   */
  referenceFiable: boolean;
  /**
   * Facteurs déterministes (étage, état×travaux, DPE) réellement appliqués,
   * décomposés pour affichage — voir `detailFacteursDeterministes`. Absent
   * (`undefined`) sur les calculs enregistrés avant ce champ : le panneau
   * retombe alors sur l'effet GLOBAL, qu'il déduit de `loyerDeterministe`.
   */
  facteursDeterministes?: FacteurDeterministe[];
  /**
   * Empreinte des données qui alimentent le résidu IA (voir
   * `calculerEmpreinteResidu`) — permet à l'appel SUIVANT de savoir s'il peut
   * réutiliser `ajustementPct`/`criteres` sans rappeler Gemini (plan
   * d'optimisation §6). Absente (`undefined`) sur les calculs enregistrés
   * avant ce champ — traitée comme "jamais égale", donc un premier rappel
   * après mise à jour du code recalcule normalement, sans corrompre rien.
   */
  empreinteResidu?: string;
  /**
   * `true` si ce calcul a RÉUTILISÉ le résidu (`ajustementPct`/`criteres`) du
   * calcul précédent au lieu de rappeler Gemini — l'empreinte n'avait pas
   * changé. Sert au panneau de détail (Phase 4) pour ne pas laisser croire
   * qu'un nouveau calcul a tourné pour rien.
   */
  reutilise: boolean;
  /**
   * Plafond légal de l'encadrement des loyers (Paris uniquement, P1 — voir
   * `encadrementLoyers.ts`), `null` hors Paris ou si aucune donnée ne
   * correspond, `undefined` sur les calculs enregistrés avant ce champ.
   *
   * ⚠️ **INFORMATIF, ne clampe PAS `loyer`** : la loi prévoit un "complément
   * de loyer" pour des prestations exceptionnelles que ce module ne peut pas
   * vérifier — un clamp aveugle réintroduirait, pour les biens au-dessus de
   * la moyenne, le biais à la baisse que P2 corrige par ailleurs. Sert
   * uniquement à afficher un avertissement quand `loyer` le dépasse (voir
   * `justification`).
   */
  plafondLegal?: PlafondLegalParis | null;
}

export interface RentEstimationResult {
  loyer: number | null;
  loyerHC: number | null;
  justification: string;
  ancreAnil: {
    /** €/m² brut de l'ANIL (CC, non meublé) — avant majoration et surface. */
    loyerM2Anil: number;
    /** €/m² CC meublé, corrigé de la surface. */
    loyerM2CC: number;
    surface: number;
    loyerAncre: number;
  } | null;
  /** `true` si le loyer a dû être ramené dans la fourchette ANIL. */
  plafonne: boolean;
  /** Détail structuré du calcul — voir `LoyerCalcul`. `null` hors chemin résidu. */
  calcul: LoyerCalcul | null;
}

export { MAJORATION_MEUBLE };

/**
 * Référence ANIL du bien, convertie en €/m² CC meublé et corrigée de la
 * surface. `null` si aucune référence n'est disponible pour la commune.
 *
 * La surface passée à la correction est celle d'UN LOGEMENT : pour un immeuble,
 * la surface par lot (`lotsEffectifs`), jamais la surface totale du bâtiment —
 * l'élasticité décrit la taille d'un logement, pas celle d'un bâtiment.
 */
function referenceDuBien(input: RentEstimationInput, ref: LoyerReference | null): ReferenceCC | null {
  if (!ref) return null;
  const immeuble = isImmeuble(input.type_bien);
  const typologie = typologieAnil(input.type_bien, input.nb_pieces, immeuble, input.surface_m2);
  const surfaceLogement =
    immeuble && input.surface_m2 != null && input.surface_m2 > 0
      ? input.surface_m2 / lotsEffectifs(input.nb_lots, input.surface_m2)
      : input.surface_m2;
  return referenceCCMeuble(ref, surfaceLogement, typologie);
}

function requireApiKey(): string {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY manquant : voir .env.local.example pour activer l'estimation de loyer (clé gratuite sur aistudio.google.com/apikey)."
    );
  }
  return apiKey;
}

function buildSecteur(input: RentEstimationInput): string {
  return formatSecteur(input) || "secteur inconnu";
}

/**
 * Consignes de style pour la justification en PROSE (immeuble et logement
 * sans référence ANIL — les deux seuls cas qui redemandent encore un montant
 * absolu plutôt qu'un résidu). `responseSchema` garantit déjà la STRUCTURE
 * JSON : ce texte ne porte plus que le style attendu du contenu.
 */
const REGLES_JUSTIFICATION = `Justification : 2-4 phrases COURTES et FACTUELLES.
- N'écris jamais "la référence de X €/mois", "X €/mois est proche de…", etc.
- NE CITE PAS de prix au m². Tout en €/mois.
- JAMAIS de "moyenne nationale" : reste à l'échelle la plus locale possible (quartier > arrondissement > ville > département).
- Pas de sources, pas de formules.`;

function buildConsigneCharges(input: RentEstimationInput): string {
  if (
    input.charges_copro_annuelles != null &&
    input.charges_copro_annuelles > 0 &&
    input.surface_m2 != null &&
    input.surface_m2 > 0
  ) {
    const provisionM2Mois = input.charges_copro_annuelles / 12 / input.surface_m2;
    return `Ce bien a des charges de copropriété (ou d'exploitation) actuellement retenues de ${Math.round(input.charges_copro_annuelles)} €/an pour ${input.surface_m2} m², soit une provision d'environ ${provisionM2Mois.toFixed(1)} €/m²/mois. UTILISE CETTE PROVISION (pas une moyenne générique) si tu dois convertir un loyer trouvé hors charges (HC) en charges comprises (CC) : elle doit rester cohérente avec la section "Charges annuelles" de la fiche.`;
  }
  return "Ajoute une provision pour charges locatives réaliste (souvent 2 à 4 €/m²/mois) si tu dois convertir un loyer trouvé hors charges (HC) en charges comprises (CC).";
}

/**
 * ⚠️ Le GES n'apparaît plus ici (2.7) : quasi entièrement déterminé par le
 * DPE et le mode de chauffage, donc colinéaire — il ne portait aucune
 * information propre et consommait des tokens pour rien.
 */
function buildCaracteristiques(input: RentEstimationInput): string {
  const parts: string[] = [];

  parts.push(input.type_bien || "appartement");
  parts.push(`${input.surface_m2 ?? "surface inconnue"} m²`);
  if (input.nb_pieces != null) parts.push(`${input.nb_pieces} pièce(s)`);
  if (input.nb_chambres != null) parts.push(`${input.nb_chambres} chambre(s)`);
  if (input.etage) parts.push(`étage ${input.etage}`);
  if (input.ascenseur === true) parts.push("avec ascenseur");
  else if (input.ascenseur === false) parts.push("sans ascenseur");
  if (input.annee_construction != null) parts.push(`construit en ${input.annee_construction}`);
  if (input.etat_bien) parts.push(`état : ${input.etat_bien}`);
  if (input.dpe) parts.push(`DPE ${input.dpe}`);

  return parts.join(", ");
}

/**
 * Consignes étage/travaux données EN CLAIR à l'IA — utilisées UNIQUEMENT
 * quand il n'existe aucun déterministe pour les appliquer à sa place
 * (immeuble, logement sans référence ANIL). Sur le chemin résidu (la
 * majorité des cas), l'IA reçoit l'ordre inverse : ne PAS recompter ces
 * facteurs, déjà dans l'ancre qu'on lui fournit — voir `buildPromptResidu`.
 */
function buildConsigneTravaux(input: RentEstimationInput): string {
  if (input.travaux != null && input.travaux > 0 && input.surface_m2 != null && input.surface_m2 > 0) {
    const travauxM2 = Math.round(input.travaux / input.surface_m2);
    let ampleur: string;
    let fourchette: string;
    if (travauxM2 < 300) {
      ampleur = "légers (rafraîchissement)";
      fourchette = "+3 à +6 %";
    } else if (travauxM2 < 800) {
      ampleur = "moyens (rénovation partielle)";
      fourchette = "+5 à +10 %";
    } else {
      ampleur = "lourds (rénovation complète)";
      fourchette = "+10 à +18 %";
    }
    return `TRAVAUX PRÉVUS : ${input.travaux.toLocaleString("fr-FR")} € (${travauxM2} €/m²), travaux ${ampleur}. Après travaux, le bien sera en meilleur état que la moyenne du parc. Ajuste le loyer À LA HAUSSE de ${fourchette} par rapport à la médiane du secteur.`;
  }
  if (input.travaux != null && input.travaux > 0) {
    return `TRAVAUX PRÉVUS : ${input.travaux.toLocaleString("fr-FR")} € de travaux. Après travaux, le bien sera rénové. Ajuste le loyer à la hausse (+5 à +15 %).`;
  }
  return "";
}

function buildConsigneEtage(input: RentEstimationInput): string {
  const etageNum = input.etage ? parseInt(input.etage, 10) : null;
  if (etageNum == null || isNaN(etageNum)) return "";
  const hasAsc = input.ascenseur === true;
  if (etageNum === 0) {
    return "ÉTAGE : rez-de-chaussée → décote typique de -3 à -8 % vs étages supérieurs (bruit, vis-à-vis, sécurité).";
  }
  if (etageNum >= 3 && hasAsc) {
    return `ÉTAGE : ${etageNum}e avec ascenseur → prime de +3 à +7 % (luminosité, calme, vue dégagée, confort d'accès).`;
  }
  if (etageNum >= 3 && !hasAsc) {
    return `ÉTAGE : ${etageNum}e sans ascenseur → décote de -2 à -5 % (contrainte d'accès aux étages élevés).`;
  }
  // Étages 1-2 : pas d'impact significatif, ascenseur ou non
  return "";
}

// 3.3 : 800 caractères coupait souvent avant la phrase qui décrit les
// prestations (balcon, vue, exposition) — précisément ce que le résidu doit
// repérer. 1500 couvre la quasi-totalité des annonces sans faire exploser le
// prompt (une description dépassant 1500 caractères reste rare).
const TRONCATURE_DESCRIPTION = 1500;

function buildConsigneDescription(input: RentEstimationInput): string {
  if (!input.description) return "";
  const extrait = input.description.length > TRONCATURE_DESCRIPTION
    ? input.description.slice(0, TRONCATURE_DESCRIPTION) + "…"
    : input.description;
  return `DESCRIPTION DU BIEN (extraite de l'annonce) :\n«${extrait}»\nUtilise les éléments de cette description qui influencent le loyer (luminosité, balcon/terrasse, vue, parking, cave, état de la cuisine/salle de bain, calme, exposition, etc.) pour affiner ton estimation.`;
}

// ─────────────────────────────────────────────────────────────────────────
// Facteurs déterministes — étage, état×travaux fusionnés, DPE recalibré.
// Chaque facteur vaut 1,0 (neutre) quand sa donnée d'entrée est absente :
// une donnée manquante n'a JAMAIS le droit de pencher le calcul dans un
// sens plutôt qu'un autre (même principe que le repli de `typologieAnil`
// dans `anilReference.ts`).
// ─────────────────────────────────────────────────────────────────────────

/**
 * Révisé après un aller-retour : la v1 de ce correctif faisait basculer un
 * 5e+ sans ascenseur en PRIME (1,08) directement depuis un malus au 4e
 * (0,97) — un saut de +11 points pour UN étage de plus, économiquement
 * incohérent (grimper une volée d'escalier de plus ne rend pas un logement
 * subitement plus désirable). Cette version reste MONOTONE : plus on monte
 * sans ascenseur, plus la décote se creuse (0,97 puis 0,95), au lieu de
 * s'inverser brutalement. Le "cachet haussmannien" qui justifiait la prime
 * reste une caractéristique du BÂTIMENT, pas de l'étage — il appartient au
 * résidu IA (si la description le mentionne), pas à ce coefficient
 * déterministe qui s'applique à tout logement de France, cachet ou non.
 *
 * ⚠️ Ordre des conditions volontaire : "≥5 sans ascenseur" DOIT être testé
 * AVANT "≥3 sans ascenseur" — sinon cette dernière (qui matche aussi les
 * étages ≥5) absorbe tous les cas avant que la règle plus spécifique
 * s'exécute, la rendant morte.
 */
function facteurEtage(input: RentEstimationInput): number {
  const etage = input.etage ? parseInt(input.etage, 10) : null;
  if (etage == null || isNaN(etage)) return 1;
  if (etage === 0) return 0.92;
  if (etage >= 5 && input.ascenseur === false) return 0.95;
  if (etage >= 3 && input.ascenseur === true) return 1.04;
  if (etage >= 3 && input.ascenseur === false) return 0.97;
  return 1; // étages 1-2 : pas d'impact, ascenseur ou non
}

/**
 * Coefficient de l'état FINAL du bien (après travaux implicites — voir
 * `facteurEtatTravaux`). Clés strictement alignées sur `ETATS_BIEN`
 * (`types.ts`) ; toute autre valeur (champ vide compris) retombe sur 1,0.
 */
// ⚠️ Neuf/Très bon état à ÉGALITÉ (1,10) et Bon état relevé à 1,03 (au lieu
// de 1,00 neutre) — choix utilisateur (audit "booster les critères
// positifs"), CONVENTIONNEL, pas mesuré. Effet de bord assumé : "Bon état"
// n'est plus le pivot neutre de l'échelle — un `etat_bien` VIDE (donnée
// manquante) reste 1,0 via le repli `?? 1.0` de `facteurEtatTravaux`, ce
// qui place désormais "connu, bon état" légèrement AU-DESSUS de "état
// inconnu", plutôt qu'à égalité. Négatifs inchangés (0,96 / 0,92).
const ETAT_COEF: Record<string, number> = {
  "Neuf": 1.10,
  "Très bon état": 1.10,
  "Bon état": 1.03,
  "À rafraîchir": 0.96,
  "À rénover": 0.92,
};
const ETAT_COEF_NEUF = ETAT_COEF["Neuf"];

/**
 * Seuil de €/m² de travaux au-delà duquel la progression sature à 100 % de
 * l'écart restant jusqu'à "Neuf". CONVENTIONNEL — pas mesuré, contrairement à
 * `ELASTICITE_SURFACE` (`anilReference.ts`). Exemples pour un "À rénover"
 * (0,92) sur 60 m² : 10 000 € (167 €/m²) → ×0,954 (+3,7 %) ;
 * 50 000 € (833 €/m²) → ×1,050 (+14,1 %), proche du plafond sans le franchir.
 */
const TRAVAUX_SATURATION_M2 = 900;

/**
 * Bonus rénovation lourde : au-delà de RENO_SEUIL_M2, les travaux poussent
 * le coefficient AU-DELÀ du plafond "Neuf" (1,10). Une rénovation complète
 * (isolation, DPE A/B, prestations haut de gamme) justifie un loyer
 * significativement supérieur au marché médian. Progression linéaire entre
 * le seuil et la saturation, bonus max +18 %.
 */
const RENO_SEUIL_M2 = 400;
const RENO_SATURATION_M2 = 1200;
const RENO_BONUS_MAX = 0.18;

/**
 * État et travaux FUSIONNÉS en un seul facteur (2.6) — ils décrivent la même
 * chose (l'état du bien une fois loué) : les compter séparément revenait à
 * compter deux fois le même effet. Les travaux font PROGRESSER l'état actuel
 * vers "Neuf", de façon saturante — rénover un bien déjà neuf ne rapporte
 * rien, et aucun montant de travaux ne peut dépasser ce plafond.
 *
 * Au-delà de RENO_SEUIL_M2 (400 €/m²), un bonus additionnel pousse le
 * coefficient au-delà de "Neuf" — une rénovation lourde crée un bien
 * supérieur au neuf promoteur standard.
 */
function facteurEtatTravaux(input: RentEstimationInput, surface: number): number {
  const base = ETAT_COEF[input.etat_bien] ?? 1.0;
  if (input.travaux == null || input.travaux <= 0 || surface <= 0) return base;
  const trM2 = input.travaux / surface;
  const progression = Math.min(1, trM2 / TRAVAUX_SATURATION_M2);
  let coef = base + progression * (ETAT_COEF_NEUF - base);

  if (trM2 > RENO_SEUIL_M2) {
    const progressionBonus = Math.min(1, (trM2 - RENO_SEUIL_M2) / (RENO_SATURATION_M2 - RENO_SEUIL_M2));
    coef += progressionBonus * RENO_BONUS_MAX;
  }

  return coef;
}

/**
 * Recalibré (2.7) : l'impact RÉEL du DPE sur un loyer est faible ; son vrai
 * poids est RÉGLEMENTAIRE (gel des loyers F/G, interdictions 2028/2034) et
 * déjà scoré intégralement dans le bloc Risques, avec ses propres plafonds
 * (voir AGENTS.md). Le garder à ±9 % ici double comptait ce même signal.
 * A-D neutres ; E/F/G ne portent plus qu'un malus résiduel.
 */
const DPE_ADJUST: Record<string, number> = {
  A: 1.0, B: 1.0, C: 1.0, D: 1.0, E: 0.99, F: 0.97, G: 0.95,
};

function facteurDpe(input: RentEstimationInput): number {
  return input.dpe ? DPE_ADJUST[input.dpe.toUpperCase()] ?? 1.0 : 1.0;
}

// Les facteurs sont multiplicatifs : ils composent. Le plafond haut a été
// relevé de 1,20 à 1,35 pour laisser passer le bonus rénovation lourde
// (coef état+travaux jusqu'à ~1,28, × étage avec ascenseur 1,04 = ~1,33).
// Côté négatif (À rénover × RDC × DPE G, 0,92 × 0,92 × 0,95 ≈ 0,804) MORD
// toujours sur ce plancher. Borne posée EN PLUS de la fourchette ANIL (2.8).
const FACTEUR_DETERMINISTE_MIN = 0.85;
const FACTEUR_DETERMINISTE_MAX = 1.35;

function facteurDeterministeGlobal(input: RentEstimationInput, surface: number): number {
  const brut = facteurEtage(input) * facteurEtatTravaux(input, surface) * facteurDpe(input);
  return Math.min(FACTEUR_DETERMINISTE_MAX, Math.max(FACTEUR_DETERMINISTE_MIN, brut));
}

/**
 * Décomposition LISIBLE des facteurs ci-dessus, persistée dans `LoyerCalcul`
 * pour que le panneau de détail (Phase 4) puisse les afficher.
 *
 * ⚠️ Persistée, PAS recalculée côté client : les coefficients (`ETAT_COEF`,
 * `DPE_ADJUST`, seuils d'étage) vivent ici et nulle part ailleurs. Les
 * recopier dans un composant recréerait exactement la divergence
 * serveur/client que `anilReference.ts` a été écrit pour supprimer. Le
 * libellé est produit ICI, au même endroit que le coefficient qu'il décrit,
 * pour qu'ils ne puissent pas se contredire.
 *
 * Ne rend QUE les facteurs non neutres : un bien sans étage renseigné, en bon
 * état et sans DPE ne doit afficher aucun tag plutôt que trois tags « 0 % ».
 *
 * ⚠️ La somme des `pct` rendus ici ne reconstitue pas exactement l'écart
 * final : les facteurs sont MULTIPLICATIFS, puis bornés
 * (`FACTEUR_DETERMINISTE_MIN/MAX`), puis suivis du résidu IA et du
 * plafonnement sur la fourchette ANIL. Le panneau les présente donc comme
 * « ce qui a joué », jamais comme une addition à vérifier.
 */
export interface FacteurDeterministe {
  /** Libellé court prêt à afficher (ex. « 3e étage avec ascenseur »). */
  libelle: string;
  /** Effet en %, signé et arrondi (ex. +5 pour un coefficient de 1,05). */
  pct: number;
}

function detailFacteursDeterministes(
  input: RentEstimationInput,
  surface: number
): FacteurDeterministe[] {
  const facteurs: FacteurDeterministe[] = [];
  const enPct = (coef: number) => Math.round((coef - 1) * 100);

  const etage = input.etage ? parseInt(input.etage, 10) : null;
  const pctEtage = enPct(facteurEtage(input));
  if (pctEtage !== 0 && etage != null && !isNaN(etage)) {
    const libelle =
      etage === 0
        ? "Rez-de-chaussée"
        : `${etage}e étage ${input.ascenseur === true ? "avec" : "sans"} ascenseur`;
    facteurs.push({ libelle, pct: pctEtage });
  }

  // État et travaux de base fusionnés (progression vers "Neuf"), puis bonus
  // rénovation lourde affiché SÉPARÉMENT pour que l'investisseur voie l'impact.
  const travauxPrevus = input.travaux != null && input.travaux > 0;
  const trM2 = travauxPrevus && surface > 0 ? input.travaux! / surface : 0;

  const base = ETAT_COEF[input.etat_bien] ?? 1.0;
  const progression = trM2 > 0 ? Math.min(1, trM2 / TRAVAUX_SATURATION_M2) : 0;
  const coefBase = trM2 > 0 ? base + progression * (ETAT_COEF_NEUF - base) : base;
  const pctEtat = enPct(coefBase);
  if (pctEtat !== 0) {
    const libelle = input.etat_bien
      ? travauxPrevus
        ? `${input.etat_bien} + travaux`
        : input.etat_bien
      : "Travaux prévus";
    facteurs.push({ libelle, pct: pctEtat });
  }

  if (trM2 > RENO_SEUIL_M2) {
    const progressionBonus = Math.min(1, (trM2 - RENO_SEUIL_M2) / (RENO_SATURATION_M2 - RENO_SEUIL_M2));
    const pctBonus = Math.round(progressionBonus * RENO_BONUS_MAX * 100);
    if (pctBonus > 0) {
      facteurs.push({ libelle: "Rénovation lourde", pct: pctBonus });
    }
  }

  const pctDpe = enPct(facteurDpe(input));
  if (pctDpe !== 0 && input.dpe) {
    facteurs.push({ libelle: `DPE ${input.dpe.toUpperCase()}`, pct: pctDpe });
  }

  return facteurs;
}

/**
 * Loyer déterministe : référence ANIL corrigée de la surface (Phase 1),
 * ajustée par le facteur déterministe global, puis contenue dans la
 * fourchette ANIL — exactement le même double garde-fou qu'avant Phase 2,
 * appliqué à un calcul qui ne fait plus double emploi avec le résidu IA
 * (voir `buildPromptResidu` : ces mêmes facteurs y sont déclarés "déjà
 * appliqués", l'IA ne doit plus les recompter).
 */
function computeDeterministicRent(input: RentEstimationInput, refCC: ReferenceCC): number {
  const surface = input.surface_m2!;
  const brut = refCC.medianM2 * surface * facteurDeterministeGlobal(input, surface);
  return Math.round(Math.max(refCC.minM2 * surface, Math.min(refCC.maxM2 * surface, brut)));
}

// ─────────────────────────────────────────────────────────────────────────
// Prompt v4 — résidu IA (2.2), sans blend (2.1), sans Google Search (2.3).
// ─────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ Élargi de ±15 à ±20 (audit post-déploiement, voir
 * docs/reference/estimation-loyer-charges.md « Calibrage du résidu — élargi
 * après audit ») : sur 8 biens réels testés, 6 étaient sous-estimés — souvent
 * PAS parce que le résidu butait sur le clamp (peu de cas l'atteignaient),
 * mais parce que la combinaison clamp serré + règle de calibrage
 * conservatrice (voir plus bas) ne laissait quasiment jamais un cumul de
 * critères factuels dépasser 5-8 points. Le clamp reste un GARDE-FOU contre
 * l'hallucination, pas la cause principale du biais — mais un clamp à ±15
 * aurait de toute façon plafonné artificiellement les cas où la règle
 * assouplie ci-dessous laisse enfin le cumul monter plus haut.
 */
const RESIDU_MIN = -20;
const RESIDU_MAX = 20;

/**
 * Amplificateur des résidus POSITIFS uniquement (audit "booster les critères
 * positifs" — le plafond `RESIDU_MAX` n'était pas le facteur limitant :
 * mesuré sur ~30 appels réels, le résidu ne dépassait jamais 10 points même
 * avec plusieurs critères factuels cumulés, très en dessous des ±20
 * disponibles). Le goulot n'est pas le clamp mais le poids que le modèle
 * accorde lui-même à chaque critère — ce facteur le corrige a posteriori.
 *
 * ⚠️ Asymétrique PAR CHOIX : aucun facteur équivalent côté négatif. Justifié
 * par l'audit (biais mesuré unidirectionnel — sous-estimation sur des biens
 * moyens à bons, jamais l'inverse), pas par un principe général comme quoi
 * le positif devrait toujours peser plus. Aucune preuve que les critères
 * négatifs soient mal calibrés : les laisser inchangés n'est pas un oubli.
 *
 * CONVENTIONNEL, pas mesuré — comme `SEUIL_SURFACE_MICRO_LOGEMENT`. Appliqué
 * au résidu BRUT avant clamp, donc toujours borné par `RESIDU_MAX` au final :
 * pas de dérive possible au-delà du plafond déjà en place.
 */
const RESIDU_POSITIF_BOOST = 1.4;

const SCHEMA_RESIDU = {
  type: "OBJECT",
  properties: {
    ajustement_pct: { type: "NUMBER" },
    criteres: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          libelle: { type: "STRING" },
          sens: { type: "STRING", enum: ["positif", "negatif", "neutre"] },
          categorie: {
            type: "STRING",
            enum: ["quartier", "prestations", "exposition", "nuisances", "copropriete"],
          },
        },
        required: ["libelle", "sens", "categorie"],
      },
    },
  },
  required: ["ajustement_pct", "criteres"],
};

const SCHEMA_SIMPLE = {
  type: "OBJECT",
  properties: {
    loyer_mensuel_eur: { type: "NUMBER" },
    justification: { type: "STRING" },
  },
  required: ["loyer_mensuel_eur", "justification"],
};

function buildDescriptionResidu(input: RentEstimationInput): string {
  if (!input.description) return "Aucune description disponible.";
  const extrait = input.description.length > TRONCATURE_DESCRIPTION
    ? input.description.slice(0, TRONCATURE_DESCRIPTION) + "…"
    : input.description;
  return `«${extrait}»`;
}

/**
 * Sans adresse exacte, `latitude`/`longitude` désignent le CENTROÏDE du
 * quartier, pas le bâtiment (voir `precisionLocalisation`). L'IA n'a alors
 * pas le droit de deviner un niveau de précision qu'elle n'a pas.
 */
/**
 * Deux caveats, un par niveau de précision réellement atteint.
 *
 * ⚠️ Interdire « toute affirmation sur la rue » à un bien dont on CONNAÎT la
 * rue bride le modèle sans raison — c'est ce que faisait le caveat unique, qui
 * traitait « milieu de la rue de Thumesnil » comme « centre de Lille ». Ce qui
 * manque au niveau `rue`, c'est le bâtiment : étage réel, vis-à-vis,
 * exposition, cour ou façade sur rue.
 */
const CAVEAT_LOCALISATION_RUE =
  "⚠️ La localisation de ce bien est connue au niveau de la RUE, pas du bâtiment : tu peux tenir compte de la rue et de son environnement immédiat, mais ne fais AUCUNE affirmation sur le vis-à-vis, l'exposition, la vue ou le calme propres à ce logement — ils dépendent du bâtiment et de l'étage, que tu ne connais pas.";

const CAVEAT_LOCALISATION_APPROX =
  "⚠️ La localisation de ce bien n'est connue qu'au niveau du quartier ou de la commune (pas l'adresse exacte) : ne fais AUCUNE affirmation sur la rue, le vis-à-vis, l'exposition précise ou les nuisances de voisinage immédiat — tu ne peux pas les connaître à cette précision.";

/**
 * Consigne quartier (correctif audité — bien réel loué 1 950 €, estimé
 * 1 503 € avant le fix élasticité, puis 1 653 € après, écart résiduel
 * attribué au quartier). Avant ce correctif, la référence déclarait
 * l'« attractivité du quartier » comme déjà comptée EN TOUTE CIRCONSTANCE —
 * vrai pour la quasi-totalité des communes françaises (la référence ANIL est
 * déjà au niveau communal, la plus fine maille publiée), FAUX pour Paris,
 * Lyon et Marseille : la référence n'y descend qu'au niveau ARRONDISSEMENT
 * (10e, 3e…), qui peut recouvrir des quartiers très inégaux (Canal
 * Saint-Martin et Gare du Nord sont tous deux "75010 Paris").
 *
 * Gardée UNIQUEMENT sur `input.quartier` non vide, INDÉPENDAMMENT de
 * `precisionLocalisation` : connaître le NOM d'un quartier ne demande pas de
 * connaître l'adresse exacte (on peut savoir qu'on est "Canal Saint-Martin"
 * sans connaître le numéro de rue) — c'est `CAVEAT_LOCALISATION_APPROX`
 * ci-dessus qui restreint déjà les affirmations de rue/vis-à-vis à la seule
 * position exacte, un périmètre plus étroit qui reste inchangé. Les trois cas
 * possibles :
 * - quartier connu (adresse exacte ou non) → cette consigne s'ajoute ;
 * - seul l'arrondissement/la commune est connu (quartier vide) → chaîne
 *   vide, comportement inchangé : rien à nommer, la référence reste la
 *   meilleure estimation disponible à cette échelle.
 *
 * Garde-fous contre l'hallucination (un quartier n'est PAS une donnée
 * mesurée, contrairement à l'ancre ANIL) : exige une identification "avec
 * confiance", interdit explicitement d'inventer une réputation pour un nom
 * trop générique ou inconnu, et le résidu reste borné à
 * [`RESIDU_MIN`, `RESIDU_MAX`] comme tout le reste — un quartier ne peut pas
 * à lui seul faire sortir l'ajustement de cette fourchette.
 *
 * ⚠️ **DÉCOUPLAGE explicite d'avec la description** (v5, bug mesuré après
 * déploiement de v4) : une description contenant "secteur recherché" (langage
 * promotionnel que la règle anti-battage plus bas interdit déjà de
 * récompenser seul) rendait ce critère INSTABLE — 0 %, +5 %, 0 % sur 3 appels
 * identiques à `temperature: 0`, du jamais-vu sur ce prompt jusque-là. Le
 * modèle semblait confondre deux signaux censés être indépendants : "le
 * vendeur ÉCRIT que c'est recherché" (à ignorer, règle anti-battage) et "JE
 * SAIS que ce quartier est recherché" (la vraie connaissance qu'on veut
 * exploiter ici). Sans clarification, tantôt il traitait les deux comme liés
 * (se méfiant du second parce que le premier est suspect), tantôt non — d'où
 * l'instabilité. Fixé en rendant l'indépendance ELLE AUSSI explicite plutôt
 * que de compter sur le modèle pour la déduire — même stratégie de correction
 * que pour l'indépendance à `precisionLocalisation` juste au-dessus. Testé
 * stable après coup (voir docs/reference/estimation-loyer-charges.md).
 */

/**
 * Seuil sous lequel la correction de surface ANIL (`facteurSurface`,
 * `anilReference.ts`) devient une EXTRAPOLATION significative, pas une
 * interpolation. `elasticiteLocale` est mesurée entre les deux seules
 * ressources publiées (37 m² et 72 m² de référence) — c'est une pente
 * "entre populations" (annonces 1-2 pièces vs annonces 3 pièces et +),
 * appliquée comme si c'était une pente "au sein" de la population des petits
 * logements. En dessous de 37 m², c'est déjà une extrapolation ; en dessous
 * de ce seuil-ci, l'écart mesuré (audit P3, docs/reference/
 * estimation-loyer-charges.md) devient trop grand pour l'ignorer : deux
 * studios réels de 18-19 m² étaient sous-estimés de −24 % à −41 % malgré les
 * correctifs P1/P2.
 *
 * ⚠️ CONVENTIONNEL, pas mesuré — contrairement à `elasticiteLocale`. Aucune
 * ressource ANIL n'a de pivot sous 37 m² (voir le script
 * `generate-anil-loyers.mjs`, seulement 4 ressources publiées) : impossible
 * de mesurer une élasticité propre à ce segment avec les données
 * disponibles. Plutôt que d'inventer un coefficient déterministe non mesuré,
 * ce seuil ne fait que DÉBLOQUER le résidu IA sur ce cas précis — voir
 * `buildConsigneMicroLogement` — en s'appuyant sur la connaissance générale
 * du marché du modèle plutôt que sur un chiffre fabriqué.
 */
const SEUIL_SURFACE_MICRO_LOGEMENT = 25;

/**
 * Exception ciblée à "la surface est déjà comptée" (voir le corps du prompt
 * dans `buildPromptResidu`) — SEULE exception à cette règle. Sans elle, le
 * résidu est structurellement empêché de corriger un biais qu'on sait pourtant
 * réel sur ce segment (voir `SEUIL_SURFACE_MICRO_LOGEMENT`) : le prompt lui
 * dit explicitement de ne rien recompter sur la surface, y compris quand
 * l'ancre déterministe est peu fiable pour ce cas.
 *
 * Ne s'applique ni aux maisons (une seule ressource ANIL, pas de pivot à
 * extrapoler de la même façon) ni aux immeubles (la correction de surface y
 * porte sur la surface PAR LOT, pas sur le bien recherché par un locataire).
 */
function buildConsigneMicroLogement(input: RentEstimationInput): string {
  const surface = input.surface_m2;
  if (surface == null || surface >= SEUIL_SURFACE_MICRO_LOGEMENT) return "";
  const typeBien = (input.type_bien ?? "").trim().toLowerCase();
  if (typeBien === "maison" || isImmeuble(input.type_bien)) return "";
  return `EXCEPTION à la consigne "la surface est déjà comptée" ci-dessus : la correction de surface appliquée à l'ancre est calibrée entre 37 et 72 m² (les deux seules références publiées) — pour ce logement de ${surface} m², nettement en dessous, c'est une extrapolation. Les micro-logements bien situés (proches transports, gare, centre, université) se louent SOUVENT au m² sensiblement au-dessus de ce que cette extrapolation prédit — un phénomène de marché réel, pas une erreur à corriger systématiquement. Si ta connaissance du secteur te permet de juger que CE micro-logement s'inscrit dans cette dynamique, tu PEUX ajouter UN critère de catégorie "prestations" en ce sens. C'est la SEULE exception à "ne recompte pas la surface" — elle ne s'applique QU'à ce cas de très petite surface, jamais à un logement de taille standard.`;
}

function buildConsigneQuartier(input: RentEstimationInput): string {
  const quartier = (input.quartier ?? "").trim();
  if (!quartier) return "";
  const commune = formatCommune(input) || "son secteur";
  return `La référence ci-dessus est calculée à l'échelle de ${commune}, PAS à celle du quartier "${quartier}" qui s'y trouve — une même commune ou un même arrondissement peut regrouper des quartiers très inégaux. Que l'adresse exacte du bien soit connue ou non, tu connais le NOM de son quartier : si tu identifies "${quartier}" AVEC CONFIANCE et sais qu'il est structurellement plus recherché OU moins recherché que la moyenne de ${commune}, tu peux l'exprimer via UN critère de catégorie "quartier" — la précision de l'adresse ne change rien à ce que tu sais ou non de la réputation de ce quartier. Cette évaluation vient UNIQUEMENT de ta propre connaissance du quartier nommé ci-dessus, JAMAIS de ce que la description dit ou suggère à son sujet : si la description affirme que le secteur est "recherché", "prisé" ou similaire, ignore-la ENTIÈREMENT pour ce critère — ni preuve, ni raison de te méfier, un argumentaire commercial non vérifiable qui n'a aucun poids ici. N'INVENTE RIEN : si ce nom est trop générique pour être identifié sans ambiguïté, ou si tu n'as pas de connaissance fiable de sa position relative, ne rends AUCUN critère "quartier" — la référence reste la meilleure estimation disponible à cette échelle.`;
}

/**
 * Prompt du chemin RÉSIDU — le cœur de la Phase 2.
 *
 * `ancre` est la valeur APRÈS barème déterministe (`computeDeterministicRent`),
 * PAS le médian ANIL brut : sans ça, l'IA ajusterait un nombre que le
 * déterministe a déjà fait bouger, et le résidu affiché ne correspondrait
 * plus au calcul réellement effectué (c'est l'erreur commise dans le premier
 * prototype de ce prompt — corrigée ici).
 *
 * Deux règles ont été mesurées comme nécessaires sur des appels réels
 * (voir AGENTS.md, section « Reproductibilité ») :
 * - déclarer étage/état/travaux/DPE comme DÉJÀ appliqués (sans quoi l'IA les
 *   recompte, ce qui a rendu un bien instable sur 5 appels identiques :
 *   résidus observés {-5, -5, +3, -5, -5}) — le quartier n'en fait PLUS
 *   partie sans condition, voir `buildConsigneQuartier`, et la SURFACE non
 *   plus en dessous de `SEUIL_SURFACE_MICRO_LOGEMENT`, voir
 *   `buildConsigneMicroLogement` (audit P3) ;
 * - la règle de calibrage « ordinaire = 0 » (sans elle, l'IA ne cite que ce
 *   que l'annonce valorise et ne renvoie jamais de résidu négatif — mesuré
 *   sur 10 biens attractifs : 0 résidu négatif).
 *
 */
function buildPromptResidu(
  input: RentEstimationInput,
  secteur: string,
  ancre: number,
  refCC: ReferenceCC,
  loyerRef: LoyerReference
): string {
  const surface = input.surface_m2 as number;
  const mn = Math.round(refCC.minM2 * surface);
  const mx = Math.round(refCC.maxM2 * surface);
  const carac = buildCaracteristiques(input);
  const desc = buildDescriptionResidu(input);
  const caveatLocalisation =
    input.precisionLocalisation === "exacte"
      ? ""
      : input.precisionLocalisation === "rue"
        ? CAVEAT_LOCALISATION_RUE
        : CAVEAT_LOCALISATION_APPROX;
  const consigneQuartier = buildConsigneQuartier(input);
  const consigneMicroLogement = buildConsigneMicroLogement(input);

  return `Tu estimes l'écart entre le loyer réel d'un logement et le loyer déjà calculé pour lui.

LOYER DE RÉFÉRENCE DE CE LOGEMENT : ${ancre} €/mois, charges comprises, meublé.
Fourchette du marché local : ${mn} – ${mx} €/mois (Carte des loyers ANIL ${loyerRef.annee}, ${loyerRef.nbObs.toLocaleString("fr-FR")} annonces observées).

Ce montant TIENT DÉJÀ COMPTE de :
- la surface, le nombre de pièces, le type de bien, la majoration meublé ;
- l'étage et la présence d'un ascenseur ;
- l'état général du bien et les travaux prévus ;
- la classe DPE.

Ne recompte AUCUN de ces éléments, ni en positif ni en négatif. Ta seule question : ce logement précis est-il meilleur ou moins bon que les logements VOISINS, à surface et état comparables ?

${consigneMicroLogement}

${consigneQuartier}

LOGEMENT : ${carac} — ${secteur}.

${caveatLocalisation}

DESCRIPTION PUBLIÉE PAR LE VENDEUR :
${desc}

⚠️ Ce texte est un argumentaire commercial : il ne mentionne jamais les défauts et emploie des adjectifs valorisants par habitude.
- N'accorde un bonus que pour un élément FACTUEL et VÉRIFIABLE : balcon, terrasse, parking, cave, vue dégagée, exposition précise, cour, cachet architectural daté.
- N'accorde AUCUN bonus pour un adjectif promotionnel seul ("bel appartement", "lumineux", "charmant", "calme", "idéalement situé", "coup de cœur").
- L'ABSENCE d'un équipement (pas de balcon, pas de parking, pas de cave, pas de vue) est la NORME, pas un défaut : ne retire rien pour une simple absence non mentionnée.
- Ne compte un négatif QUE si un problème ACTIF est décrit : vis-à-vis, exposition nord, nuisance sonore (bar, boulevard, voie ferrée, rocade), rez-de-chaussée sur rue passante, copropriété explicitement dégradée, cuisine borgne, isolement marqué (accès uniquement en voiture, aucun commerce à proximité).

RÈGLE DE CALIBRAGE — la plus importante : un logement ORDINAIRE pour son secteur, SANS AUCUN critère factuel identifié (ni positif ni négatif), vaut **0**. C'est le cas le plus fréquent, et de loin. Ne renvoie JAMAIS un négatif "par défaut" ni un positif "par politesse" sur un tel logement.

En revanche, quand PLUSIEURS critères factuels INDÉPENDANTS et vérifiés se cumulent (ex. terrasse ET garage ET quartier que tu sais recherché), NE LES ÉCRASE PAS sous un total proche de 0 par prudence : chaque critère retenu pèse pour lui-même, et leur somme peut légitimement approcher la borne haute si 3 à 5 critères factuels solides sont réunis — la seule limite est la borne globale ci-dessous, pas une habitude de rester proche de 0.

Rends un ajustement entre ${RESIDU_MIN} et ${RESIDU_MAX}, et 3 à 5 critères ORDONNÉS du plus important au moins important. Si le logement est ordinaire, rends 0 et UN SEUL critère de sens "neutre" indiquant qu'il est conforme à son secteur — n'utilise JAMAIS "neutre" pour un autre critère : un critère réellement notable est toujours "positif" ou "negatif".`;
}

/**
 * Empreinte des données qui déterminent le TEXTE de `buildPromptResidu`
 * (plan d'optimisation §6) : si elle est identique à celle du dernier calcul
 * enregistré, le prompt qu'on enverrait à Gemini serait mot pour mot le même,
 * donc `ajustementPct`/`criteres` peuvent être réutilisés SANS le rappeler.
 *
 * Couvre deux catégories de champs, toutes deux nécessaires :
 * - ceux qui apparaissent littéralement dans le prompt (`carac`, la
 *   description, le secteur, le caveat de localisation) ;
 * - ceux qui n'y apparaissent qu'INDIRECTEMENT via `ancre` (le loyer
 *   déterministe affiché en tête du prompt) : étage, état, travaux, DPE
 *   modifient `computeDeterministicRent` sans changer `carac` littéralement,
 *   mais changent bien le nombre "LOYER DE RÉFÉRENCE DE CE LOGEMENT : X" que
 *   l'IA lit. Les oublier ferait réutiliser un résidu calibré sur une ancre
 *   obsolète.
 *
 * La référence ANIL (`loyerRef` + `typologie`) est incluse pour la même
 * raison que `ancre` : un rafraîchissement annuel des données (§3/§5) ou un
 * changement de typologie (`nb_pieces`, `type_bien`) change `ancre` et la
 * fourchette affichées, même si aucun champ du bien n'a bougé.
 *
 * `charges_copro_annuelles` et `nb_lots` sont volontairement ABSENTS : ni
 * l'un ni l'autre n'entre dans `buildPromptResidu` (la conversion HC→CC ne
 * concerne que les chemins sans résidu) ni dans `computeDeterministicRent`.
 *
 * ⚠️ **`PROMPT_RESIDU_VERSION` DOIT être incrémenté à chaque changement du
 * TEXTE ou du SCHÉMA du prompt résidu** (`buildPromptResidu`, `SCHEMA_RESIDU`),
 * même si aucun champ ci-dessous n'a bougé. Bug réel rencontré : l'ajout du
 * sens `"neutre"` (schéma + RÈGLE DE CALIBRAGE) a été déployé SANS bump —
 * les biens dont le résultat était déjà en cache ont continué de servir
 * indéfiniment l'ancien résultat (`sens: "positif"`, tag vert trompeur),
 * puisque l'empreinte ne dépendait que des DONNÉES du bien, jamais de la
 * version du prompt qui les interprète.
 *
 * v3 : `loyerRef.elasticiteLocale` ajouté ci-dessous — l'élasticité de
 * surface locale change l'ANCRE déterministe (`computeDeterministicRent`)
 * sans changer aucun autre champ du bien. Ce champ suffirait normalement à
 * lui seul (une nouvelle clé dans le tableau produit un hash différent, donc
 * invalide déjà tout cache existant) ; le bump documente l'intention pour un
 * futur lecteur du diff, comme convenu depuis le bug ci-dessus.
 *
 * v4 : retrait de la fausse consigne « le quartier est déjà compté » +
 * ajout de `buildConsigneQuartier` — changement du TEXTE du prompt, pas
 * d'un champ : `input.quartier` était déjà dans le tableau ci-dessous, mais
 * seule sa VALEUR entrait dans le hash, pas la façon dont le prompt s'en sert.
 * Sans ce bump, un bien SANS quartier (`buildConsigneQuartier` renvoie "")
 * aurait gardé un résidu calculé sous l'ancien texte, alors que le résultat
 * ne dépend pas que du texte final mais de la version du prompt qui a
 * tourné — cas exactement prévu par le paragraphe ⚠️ ci-dessus.
 *
 * v5 : découplage explicite quartier / description (voir le ⚠️ dans
 * `buildConsigneQuartier`) — corrige l'instabilité mesurée en v4 sur les
 * descriptions contenant "secteur recherché" ou équivalent.
 *
 * v6 : clamp élargi ±15 → ±20 (`RESIDU_MIN`/`RESIDU_MAX`) + RÈGLE DE
 * CALIBRAGE assouplie — audit après signalement utilisateur (biens réels
 * majoritairement sous-estimés, voir docs/reference/estimation-loyer-charges.md
 * « Calibrage du résidu — élargi après audit »). "Ordinaire = 0" reste le
 * défaut, mais plusieurs critères factuels cumulés n'ont plus vocation à
 * être écrasés sous un total proche de 0 par prudence.
 *
 * v7 : exception ciblée « micro-logement » (`buildConsigneMicroLogement`,
 * `SEUIL_SURFACE_MICRO_LOGEMENT`, audit P3) — sous 25 m², le résidu est
 * désormais autorisé à corriger la surface, seule exception à "ne recompte
 * pas la surface" ci-dessus. Motivée par deux studios réels (18-19 m²)
 * sous-estimés de −24 % à −41 % malgré v6, cause identifiée : aucune
 * ressource ANIL n'a de pivot sous 37 m², et le résidu était jusqu'ici
 * explicitement empêché de compenser cette extrapolation.
 *
 * v8 : `RESIDU_POSITIF_BOOST` (×1,4 sur le résidu positif uniquement) —
 * AUCUN changement du TEXTE du prompt, seulement de l'INTERPRÉTATION du
 * nombre renvoyé par Gemini. Bumpé quand même, par précaution : même cas de
 * figure que l'ajout du sens "neutre" en v2 (voir plus haut) — un calcul
 * déjà en cache resterait sinon indéfiniment servi avec l'ancien résidu non
 * amplifié, puisque l'empreinte ne dépend que des DONNÉES du bien, jamais de
 * la façon dont le résultat est ensuite interprété.
 */
const PROMPT_RESIDU_VERSION = 9;

function calculerEmpreinteResidu(
  input: RentEstimationInput,
  loyerRef: LoyerReference,
  typologie: TypologieAnil
): string {
  const cle = JSON.stringify([
    PROMPT_RESIDU_VERSION,
    input.ville,
    input.quartier,
    input.code_postal,
    input.surface_m2,
    input.nb_pieces,
    input.nb_chambres,
    input.type_bien,
    input.etage,
    input.ascenseur,
    input.annee_construction,
    input.etat_bien,
    input.dpe,
    input.travaux,
    input.description,
    input.precisionLocalisation,
    typologie,
    loyerRef.loyerM2,
    loyerRef.min,
    loyerRef.max,
    loyerRef.annee,
    loyerRef.niveauPrediction,
    loyerRef.elasticiteLocale,
  ]);
  return createHash("sha256").update(cle).digest("hex");
}

function buildLogementPromptSansReference(input: RentEstimationInput, secteur: string): string {
  const carac = buildCaracteristiques(input);
  const etage = buildConsigneEtage(input);
  const travaux = buildConsigneTravaux(input);
  const desc = buildConsigneDescription(input);

  return `Tu estimes un loyer mensuel de LOCATION MEUBLÉE, charges comprises (CC), pour un bien immobilier situé à : ${secteur}.
Caractéristiques du bien : ${carac}.

Aucune référence de marché officielle (ANIL) n'est disponible pour cette commune. Base ton estimation sur ta connaissance générale des loyers pratiqués dans ce type de secteur en France, à l'échelle la plus locale possible.

CONTEXTE FISCAL : ce bien sera loué en MEUBLÉ (régime LMNP). Un logement meublé se loue en moyenne 10 à 20 % plus cher qu'un logement nu équivalent dans le même secteur.

${etage}

${travaux}

${buildConsigneCharges(input)} Déduis-en un loyer mensuel CC réaliste pour CE bien précis.

${desc}

${REGLES_JUSTIFICATION}`;
}

function buildImmeublePrompt(input: RentEstimationInput, secteur: string): string {
  const surface = input.surface_m2 ?? "surface totale inconnue";
  const lots =
    input.nb_lots != null && input.nb_lots > 0
      ? `${input.nb_lots} lot(s)/logement(s)`
      : "nombre de lots non précisé (estime un découpage plausible pour cette surface)";
  const travaux = buildConsigneTravaux(input);
  const desc = buildConsigneDescription(input);

  return `Tu estimes le loyer mensuel TOTAL, charges comprises (CC), d'un IMMEUBLE DE RAPPORT entier (tous les logements loués EN MEUBLÉ) situé à : ${secteur}.
Caractéristiques de l'immeuble : surface totale ${surface} m², ${lots}.

CONTEXTE FISCAL : tous les lots seront loués en MEUBLÉ (régime LMNP). Un logement meublé se loue en moyenne 10 à 20 % plus cher qu'un logement nu équivalent. Base-toi sur ta connaissance générale des loyers de ce secteur, à l'échelle la plus locale possible.

${travaux}

IMPORTANT — c'est un immeuble entier, pas un logement unique :
- La valeur demandée est la SOMME des loyers de tous les lots, pas le loyer d'un seul appartement.
- Raisonne lot par lot : estime un découpage réaliste (nombre et taille des logements) à partir de la surface totale et du nombre de lots, un loyer €/m² CC par type de logement (les petits logements se louent plus cher au m²), puis ADDITIONNE.
- ${buildConsigneCharges(input)}
- Ne renvoie pas un loyer de logement unique : le total d'un immeuble se compte en plusieurs milliers d'euros par mois.

${desc}

${REGLES_JUSTIFICATION}
Dans la justification, précise le découpage supposé (nombre de logements et loyer par type) qui aboutit au total.`;
}

// ─────────────────────────────────────────────────────────────────────────
// Filtre du double comptage résiduel (2.4) — appliqué au CODE, pas seulement
// à la consigne du prompt. Mesuré : la seule consigne ne suffisait pas
// (l'IA citait encore "rez-de-chaussée" ou "rénovation complète" comme
// critère du résidu, alors que ces deux facteurs sont déjà dans l'ancre).
// Comparaison insensible aux accents et à la casse.
// ─────────────────────────────────────────────────────────────────────────

const MOTIFS_DEJA_COMPTES = [
  /rez.de.chauss/,
  /\betages?\b/,
  /ascenseur/,
  /\bdpe\b/,
  /diagnostic (energ|thermiq)/,
  /classe energ/,
  /\betat (du bien|general)?\b/,
  /\bbon etat\b/,
  /a renover/,
  /a rafraichir/,
  /travaux/,
  /renov/,
];

function normaliser(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function filtrerCriteresDejaComptes(criteres: CritereResidu[]): CritereResidu[] {
  return criteres.filter((c) => {
    const n = normaliser(c.libelle);
    return !MOTIFS_DEJA_COMPTES.some((re) => re.test(n));
  });
}

/**
 * Reconstruit un texte de justification à partir des critères FILTRÉS —
 * jamais à partir d'une prose fournie séparément par l'IA, qui pourrait
 * diverger de la liste réellement retenue (et donc du calcul). Stocké dans
 * le champ `loyer_justification` existant : pas de nouvelle colonne pour ces
 * critères en Phase 2, ils ne sont pour l'instant qu'un texte — leur
 * structure (catégories, tags) n'est exploitée qu'à partir de la Phase 4.
 */
function synthetiserJustification(criteres: CritereResidu[]): string {
  // Les critères "neutre" (placeholder "logement ordinaire", voir
  // CritereResidu) n'ont rien à ajouter à une justification — un "+"/"−"
  // devant serait aussi trompeur que le tag vert qu'il a remplacé.
  const notables = criteres.filter((c) => c.sens !== "neutre");
  if (notables.length === 0) {
    return "Logement conforme aux caractéristiques standards de son secteur — aucun ajustement retenu.";
  }
  return notables.map((c) => `${c.sens === "positif" ? "+" : "−"} ${c.libelle}`).join(" · ");
}

function extractJson<T>(text: string): T | null {
  try {
    return JSON.parse(text.trim()) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Point d'entrée
// ─────────────────────────────────────────────────────────────────────────

export async function estimateRent(
  input: RentEstimationInput,
  loyerRef?: LoyerReference | null,
  /**
   * `loyer_calcul` déjà enregistré sur le bien (avant cet appel) — permet au
   * chemin résidu de réutiliser `ajustementPct`/`criteres` sans rappeler
   * Gemini si l'empreinte n'a pas changé (plan §6, voir
   * `calculerEmpreinteResidu`). Sans effet sur l'immeuble ou le chemin sans
   * référence : aucun des deux ne persiste de résidu réutilisable.
   */
  calculPrecedent?: LoyerCalcul | null
): Promise<RentEstimationResult> {
  const secteur = buildSecteur(input);
  const model = process.env.GEMINI_RENT_MODEL || "gemini-2.5-flash";

  if (isImmeuble(input.type_bien)) {
    return estimerImmeuble(input, secteur, model);
  }

  const refCC = referenceDuBien(input, loyerRef ?? null);
  // Sans référence ANIL OU sans surface, aucun calcul déterministe n'est
  // possible (`computeDeterministicRent` a besoin des deux) : on retombe sur
  // une estimation IA absolue, comme avant la Phase 2 pour ce seul cas.
  if (!refCC || !loyerRef || input.surface_m2 == null || input.surface_m2 <= 0) {
    return estimerSansReference(input, secteur, model);
  }
  return estimerAvecReference(input, secteur, model, loyerRef, refCC, calculPrecedent ?? null);
}

async function estimerImmeuble(
  input: RentEstimationInput,
  secteur: string,
  model: string
): Promise<RentEstimationResult> {
  const prompt = buildImmeublePrompt(input, secteur);
  const text = await generateGeminiText({
    apiKey: requireApiKey(),
    model,
    prompt,
    thinkingBudget: 512,
    temperature: 0,
    responseSchema: SCHEMA_SIMPLE,
  });

  const parsed = extractJson<{ loyer_mensuel_eur?: number | null; justification?: string }>(text);
  const aiLoyer = typeof parsed?.loyer_mensuel_eur === "number" ? parsed.loyer_mensuel_eur : null;
  // Aucun barème de repli pour un immeuble : on ne peut pas dégrader
  // gracieusement comme sur le chemin résidu. Lever plutôt qu'écrire un
  // loyer null qui effacerait silencieusement la valeur déjà enregistrée —
  // `estimate-rent/route.ts` n'appelle `updateApartment` qu'après ce point.
  if (aiLoyer == null) {
    throw new Error("Estimation indisponible : réponse IA non exploitable pour cet immeuble.");
  }

  const rawJustif = typeof parsed?.justification === "string" ? parsed.justification : "";
  const justification = sanitizeJustification(
    rawJustif || "Estimation basée sur un découpage lot par lot.",
    input.surface_m2,
    "€/mois",
    6
  );
  const loyerHC = deriveLoyerHC(aiLoyer, input.charges_copro_annuelles ?? 0);
  return { loyer: aiLoyer, loyerHC, justification, ancreAnil: null, plafonne: false, calcul: null };
}

async function estimerSansReference(
  input: RentEstimationInput,
  secteur: string,
  model: string
): Promise<RentEstimationResult> {
  const prompt = buildLogementPromptSansReference(input, secteur);
  const text = await generateGeminiText({
    apiKey: requireApiKey(),
    model,
    prompt,
    thinkingBudget: 512,
    temperature: 0,
    responseSchema: SCHEMA_SIMPLE,
  });

  const parsed = extractJson<{ loyer_mensuel_eur?: number | null; justification?: string }>(text);
  const aiLoyer = typeof parsed?.loyer_mensuel_eur === "number" ? parsed.loyer_mensuel_eur : null;
  if (aiLoyer == null) {
    throw new Error(
      "Estimation indisponible : réponse IA non exploitable (aucune référence de marché pour cette commune)."
    );
  }

  const rawJustif = typeof parsed?.justification === "string" ? parsed.justification : "";
  const justification = sanitizeJustification(rawJustif, input.surface_m2, "€/mois", 6);
  const loyerHC = deriveLoyerHC(aiLoyer, input.charges_copro_annuelles ?? 0);
  return { loyer: aiLoyer, loyerHC, justification, ancreAnil: null, plafonne: false, calcul: null };
}

/**
 * Chemin RÉSIDU — le cas normal (logement, référence ANIL disponible).
 *
 * `det` (loyer déterministe) sert de point d'ancrage à l'IA ET de valeur de
 * repli si l'appel échoue : une panne de l'IA ne doit jamais priver le bien
 * d'un loyer (c'est le bug qui écrivait `loyer_retenu: null` sur un JSON
 * malformé — `responseSchema` le rend rare, mais "rare" n'est pas "jamais").
 */
async function estimerAvecReference(
  input: RentEstimationInput,
  secteur: string,
  model: string,
  loyerRef: LoyerReference,
  refCC: ReferenceCC,
  calculPrecedent: LoyerCalcul | null
): Promise<RentEstimationResult> {
  const surface = input.surface_m2 as number;
  // TOUJOURS recalculé, même en cas de réutilisation ci-dessous : c'est un
  // calcul local (pas d'appel réseau), et il sert de filet de sécurité si un
  // facteur qui influence `det` sans être couvert par l'empreinte avait
  // changé — voir `calculerEmpreinteResidu`.
  const det = computeDeterministicRent(input, refCC);
  const empreinte = calculerEmpreinteResidu(input, loyerRef, refCC.typologie);

  // Plan d'optimisation §6 : ne pas rappeler Gemini si rien n'a changé depuis
  // le dernier calcul enregistré. `echecIa` sur le calcul précédent exclut la
  // réutilisation — un résidu à 0 par échec IA n'est pas un résultat à
  // perpétuer, la prochaine estimation doit retenter l'appel.
  const reutilisable =
    calculPrecedent != null &&
    !calculPrecedent.echecIa &&
    calculPrecedent.empreinteResidu === empreinte;

  let pct: number;
  let criteres: CritereResidu[];
  let echecIa = false;
  let reutilise = false;

  if (reutilisable) {
    pct = calculPrecedent.ajustementPct;
    criteres = calculPrecedent.criteres;
    reutilise = true;
  } else {
    pct = 0;
    criteres = [];
    const prompt = buildPromptResidu(input, secteur, det, refCC, loyerRef);
    try {
      const text = await generateGeminiText({
        apiKey: requireApiKey(),
        model,
        prompt,
        // 0, pas 512 (plan-optimisation-loyer.md §7 — mesuré, voir
        // docs/reference/estimation-loyer-charges.md) : plus rapide (~1 s vs
        // ~2,8 s), et surtout plus FIABLE sous le timeout réduit à 25 s
        // (§4) — 512 y échouait ~27 % du temps sur l'échantillon mesuré,
        // contre 0 % à 0. Ne s'applique QU'à ce prompt (résidu) — le seul
        // mesuré ; `estimerImmeuble`/`estimerSansReference` gardent 512.
        thinkingBudget: 0,
        temperature: 0,
        responseSchema: SCHEMA_RESIDU,
      });
      const parsed = extractJson<{ ajustement_pct?: number | null; criteres?: CritereResidu[] }>(text);
      const pctBrut = typeof parsed?.ajustement_pct === "number" ? parsed.ajustement_pct : null;
      if (pctBrut == null) {
        echecIa = true;
      } else {
        // Amplifie UNIQUEMENT le résidu positif (RESIDU_POSITIF_BOOST) avant
        // le clamp final — un résidu négatif traverse inchangé.
        const pctAmplifie = pctBrut > 0 ? pctBrut * RESIDU_POSITIF_BOOST : pctBrut;
        pct = Math.max(RESIDU_MIN, Math.min(RESIDU_MAX, pctAmplifie));
        criteres = filtrerCriteresDejaComptes(Array.isArray(parsed?.criteres) ? parsed.criteres : []);
      }
    } catch {
      echecIa = true;
    }
  }

  const avantClamp = Math.round(det * (1 + pct / 100));
  const minCC = refCC.minM2 * surface;
  const maxCC = refCC.maxM2 * surface;
  const finalLoyer = Math.round(Math.max(minCC, Math.min(maxCC, avantClamp)));
  const plafonne = avantClamp < minCC || avantClamp > maxCC;

  const justificationBrute = echecIa
    ? "Estimation basée sur le barème déterministe (étage, état, DPE) — ajustement IA indisponible."
    : synthetiserJustification(criteres);
  let justification = sanitizeJustification(justificationBrute, input.surface_m2, "€/mois", 6);

  // P1 (audit encadrement des loyers) : Paris uniquement, INFORMATIF — voir
  // le ⚠️ de `LoyerCalcul.plafondLegal` et `encadrementLoyers.ts`. N'altère
  // jamais `finalLoyer`, seulement la justification affichée.
  const plafondLegal = plafondEncadrementParis(input.code_postal, input.nb_pieces, input.annee_construction, surface);
  if (plafondLegal && finalLoyer > plafondLegal.plafond) {
    justification += ` ⚠️ Dépasse le plafond légal de l'encadrement des loyers du ${plafondLegal.arrondissement} (${plafondLegal.annee}) : ${Math.round(plafondLegal.plafond).toLocaleString("fr-FR")} €/mois, sauf complément de loyer justifiable (prestation exceptionnelle).`;
  }

  const ancreAnil: RentEstimationResult["ancreAnil"] = {
    loyerM2Anil: loyerRef.loyerM2,
    loyerM2CC: Math.round(refCC.medianM2 * 10) / 10,
    surface,
    loyerAncre: Math.round(refCC.medianM2 * surface),
  };
  const calcul: LoyerCalcul = {
    ajustementPct: pct,
    criteres,
    typologie: refCC.typologie,
    loyerDeterministe: det,
    echecIa,
    referenceFiable: estReferenceFiable(loyerRef.niveauPrediction, loyerRef.nbObs),
    facteursDeterministes: detailFacteursDeterministes(input, surface),
    empreinteResidu: empreinte,
    reutilise,
    plafondLegal,
  };
  const loyerHC = deriveLoyerHC(finalLoyer, input.charges_copro_annuelles ?? 0);
  return { loyer: finalLoyer, loyerHC, justification, ancreAnil, plafonne, calcul };
}
