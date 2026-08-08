import type { CritereResidu, LoyerCalcul } from "./rentEstimation";

/**
 * Phrase de synthèse de "ce qui fait varier le loyer" — SOURCE UNIQUE,
 * partagée entre `LoyerDetailPanel` (Étape 2 du panneau de détail) et
 * `ApartmentDetail` (section "Revenus", pied du champ loyer). Les deux
 * affichaient auparavant des textes différents pour le même calcul —
 * `LoyerDetailPanel` sa propre phrase, `ApartmentDetail` la justification
 * brute générée server-side (`apt.loyer_justification`, style
 * "+ X · + Y · + Z") — d'où l'extraction ici plutôt qu'une copie locale à
 * chaque endroit (voir `richText.tsx` pour un précédent exact : deux copies
 * de `renderBoldInline` avaient déjà divergé une fois).
 *
 * Module PUR (aucune I/O), safe à importer depuis un composant client comme
 * depuis un autre module `lib/*` — `import type` sur `rentEstimation.ts`
 * (module SERVEUR : appels Gemini, `fs`) est effacé à la compilation, il ne
 * tire donc rien de ce fichier dans le bundle client.
 */

export interface FacteurBareme {
  libelle: string;
  pct: number;
}

/**
 * Facteurs déterministes EFFECTIFS d'un calcul — gère le repli des calculs
 * enregistrés AVANT `LoyerCalcul.facteursDeterministes` (voir ce champ).
 *
 * `anilMedian` optionnel : ne sert QU'à ce repli. Un appelant qui n'a pas
 * déjà la référence ANIL sous la main (ex. `ApartmentDetail`, qui ne la
 * fetch pas côté client) peut l'omettre — les calculs anciens perdent alors
 * juste la clause "barème" de la phrase, jamais toute la phrase.
 */
export function facteursBaremeEffectifs(
  calcul: LoyerCalcul | null | undefined,
  anilMedian?: number | null
): FacteurBareme[] {
  if (calcul?.facteursDeterministes) return calcul.facteursDeterministes;
  if (!calcul || anilMedian == null || anilMedian <= 0) return [];
  const pct = Math.round((calcul.loyerDeterministe / anilMedian - 1) * 100);
  return pct === 0 ? [] : [{ libelle: "Étage · état · DPE", pct }];
}

function listeAvecEt(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

function minuscule(s: string): string {
  return s.length > 0 ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function majuscule(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Chaque terme important est enveloppé en `**gras**` markdown — à faire passer par `renderMarkdownBold` (richText.tsx) côté appelant, jamais du HTML injecté ici. */
function gras(s: string): string {
  return `**${s}**`;
}

/** Conjugaison du verbe d'effet, par sens et par nombre — table plutôt que radical bricolé, les trois verbes sont irréguliers entre eux. */
const VERBE_EFFET: Record<"positif" | "negatif" | "mixte", [singulier: string, pluriel: string]> = {
  positif: ["majore", "majorent"],
  negatif: ["réduit", "réduisent"],
  mixte: ["ajuste", "ajustent"],
};

/**
 * Phrase de synthèse — remplace une liste de tags "+ X · + Y · + Z" par une
 * VRAIE phrase. Deux clauses distinctes — barème puis résidu IA — plutôt
 * qu'une liste fusionnée : la fiabilité des deux sources reste différente
 * (coefficients reproductibles vs jugement d'un LLM) ; fusionner les MOTS
 * dans une même phrase reste défendable, fusionner la DONNÉE (une seule
 * source indifférenciée) ne l'était pas. Les libellés (facteurs ET critères)
 * sont mis en **gras** — ce sont les termes qui répondent à "pourquoi ce
 * loyer", le reste n'est que la charpente grammaticale de la phrase.
 */
export function phraseSyntheseLoyer(
  facteursBareme: FacteurBareme[],
  criteres: CritereResidu[],
  echecIa: boolean
): string {
  const phrases: string[] = [];

  if (facteursBareme.length > 0) {
    const labels = facteursBareme.map((f) => gras(minuscule(f.libelle)));
    const tousPositifs = facteursBareme.every((f) => f.pct >= 0);
    const tousNegatifs = facteursBareme.every((f) => f.pct < 0);
    const sens = tousPositifs ? "positif" : tousNegatifs ? "negatif" : "mixte";
    const verbe = VERBE_EFFET[sens][facteursBareme.length > 1 ? 1 : 0];
    phrases.push(`${majuscule(listeAvecEt(labels))} ${verbe} légèrement ce loyer.`);
  }

  const notables = criteres.filter((c) => c.sens !== "neutre");
  if (echecIa) {
    phrases.push("L'ajustement lié à l'annonce n'a pas pu être calculé pour ce bien.");
  } else if (notables.length > 0) {
    const positifs = notables.filter((c) => c.sens === "positif").map((c) => gras(minuscule(c.libelle)));
    const negatifs = notables.filter((c) => c.sens === "negatif").map((c) => gras(minuscule(c.libelle)));
    let phrase = "L'annonce met aussi en avant ";
    if (positifs.length > 0) phrase += listeAvecEt(positifs);
    if (positifs.length > 0 && negatifs.length > 0) phrase += ", à nuancer par ";
    if (negatifs.length > 0) phrase += listeAvecEt(negatifs);
    phrases.push(phrase + ".");
  } else if (facteursBareme.length === 0) {
    phrases.push("Aucune particularité ne distingue ce logement de la référence de son secteur.");
  }

  return phrases.join(" ");
}
