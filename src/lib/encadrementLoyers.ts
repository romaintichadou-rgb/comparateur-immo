import encadrementRaw from "./encadrement_paris.json";

/**
 * Plafond légal de l'encadrement des loyers — Paris uniquement pour ce
 * premier lot (P1, audit `docs/reference/estimation-loyer-charges.md`).
 *
 * Module PUR (aucune I/O), même pattern que `anilReference.ts` et
 * `taxeFonciereCommune.ts` : les données sont figées au build dans
 * `encadrement_paris.json` (généré par `scripts/generate-encadrement-paris.mjs`,
 * source opendata.paris.fr).
 *
 * ⚠️ **Ce module n'a JAMAIS vocation à remplacer l'ANIL comme ancre du
 * calcul** — voir l'audit : sur l'appartement qui a motivé ce lot, le loyer
 * réel (1950 €, Paris 10e) dépasse déjà le plafond légal calculé ici
 * (~1820 € pour un T2 quelconque du 10e, toute époque confondue) — la loi
 * prévoit un mécanisme de "complément de loyer" pour des caractéristiques
 * exceptionnelles (terrasse, vue, cachet...) que ce module ne peut pas
 * vérifier. Le plafond sert donc de SIGNAL D'ALERTE (voir
 * `LoyerCalcul.plafondLegal` dans `rentEstimation.ts`), jamais de correction
 * numérique silencieuse du loyer estimé — un clamp aveugle aurait
 * réintroduit, pour les biens de qualité au-dessus de la moyenne, exactement
 * le biais à la baisse que ce lot cherche à corriger par ailleurs (P2).
 *
 * ⚠️ **Agrégation à l'ARRONDISSEMENT, pas au quartier administratif** : voir
 * le commentaire de tête de `scripts/generate-encadrement-paris.mjs`. Le
 * plafond retenu est le MAX des maximums parmi les quartiers administratifs
 * de l'arrondissement — le plus permissif disponible sans résolution
 * géographique du quartier exact, pour ne jamais signaler à tort un loyer
 * légal comme hors plafond.
 */

interface EncadrementParisData {
  annee: number;
  // arrondissement ("75010") → pièce ("1"-"4") → époque → meublé/non meublé → [ref, min, max] €/m²
  arrondissements: Record<string, Record<string, Record<string, Record<string, [number, number, number]>>>>;
}

const encadrement = encadrementRaw as unknown as EncadrementParisData;

const REGEX_CODE_POSTAL_PARIS = /^750(0[1-9]|1[0-9]|20)$/;

export function estParisEncadre(codePostal: string | null | undefined): boolean {
  return REGEX_CODE_POSTAL_PARIS.test((codePostal ?? "").trim());
}

interface Epoque {
  key: string;
  min: number;
  max: number;
}

/** Bornes des 4 tranches publiées — voir `EPOQUE_KEY` du script de génération. */
const EPOQUES: Epoque[] = [
  { key: "avant_1946", min: -Infinity, max: 1945 },
  { key: "de_1946_a_1970", min: 1946, max: 1970 },
  { key: "de_1971_a_1990", min: 1971, max: 1990 },
  { key: "apres_1990", min: 1991, max: Infinity },
];

/**
 * Clés à interroger pour une année de construction donnée. `null` → TOUTES
 * les époques (le max des maximums) : une donnée manquante ne doit jamais
 * pencher le calcul dans un sens — même principe que `typologieAnil`
 * (`anilReference.ts`) et `ETAT_COEF` (`rentEstimation.ts`).
 */
function epoqueKeysPour(anneeConstruction: number | null): string[] {
  if (anneeConstruction == null) return EPOQUES.map((e) => e.key);
  const trouvee = EPOQUES.find((e) => anneeConstruction >= e.min && anneeConstruction <= e.max);
  return trouvee ? [trouvee.key] : EPOQUES.map((e) => e.key);
}

/** Idem pour le nombre de pièces : `null` → les 4 tranches (1 à 4+). */
function pieceKeysPour(nbPieces: number | null): string[] {
  if (nbPieces == null) return ["1", "2", "3", "4"];
  const p = Math.min(4, Math.max(1, Math.round(nbPieces)));
  return [String(p)];
}

export interface PlafondLegalParis {
  arrondissement: string;
  /** €/m², meublé — le plus élevé retenu parmi les tranches compatibles avec les données connues du bien. */
  plafondM2: number;
  /** €/mois pour la surface du bien. */
  plafond: number;
  annee: number;
}

/**
 * Plafond légal du bien, `null` si hors Paris ou si aucune donnée ne
 * correspond (arrondissement absent du JSON, surface manquante).
 */
export function plafondEncadrementParis(
  codePostal: string | null | undefined,
  nbPieces: number | null,
  anneeConstruction: number | null,
  surfaceM2: number | null
): PlafondLegalParis | null {
  if (!estParisEncadre(codePostal) || surfaceM2 == null || surfaceM2 <= 0) return null;
  const cp = (codePostal as string).trim();
  const parPiece = encadrement.arrondissements[cp];
  if (!parPiece) return null;

  let maxM2 = -Infinity;
  for (const pieceKey of pieceKeysPour(nbPieces)) {
    const parEpoque = parPiece[pieceKey];
    if (!parEpoque) continue;
    for (const epoqueKey of epoqueKeysPour(anneeConstruction)) {
      const valeurs = parEpoque[epoqueKey]?.meuble;
      if (valeurs) maxM2 = Math.max(maxM2, valeurs[2]);
    }
  }
  if (!isFinite(maxM2)) return null;

  return {
    arrondissement: cp,
    plafondM2: maxM2,
    plafond: Math.round(maxM2 * surfaceM2),
    annee: encadrement.annee,
  };
}
