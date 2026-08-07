/**
 * Source de faits réels : "Carte des loyers" (ANIL / ministère du Logement),
 * open data data.gouv.fr. Marseille est découpé par arrondissement avec le même
 * code INSEE que celui renvoyé par BAN (ex. 13207) → jointure directe.
 *
 * ⚠️ **`loypredm2` est CHARGES COMPRISES**, pour un logement de référence NON
 * MEUBLÉ. La note méthodologique officielle l'écrit noir sur blanc (« Les
 * indicateurs de loyers proviennent de prédictions de loyers […] et sont
 * charges comprises ») et précise que la base « ne permet pas de distinguer le
 * loyer et les provisions pour charges locatives ». Le commentaire de ce
 * fichier a longtemps annoncé « hors charges », ce qui a fait ajouter une
 * provision par-dessus dans tout le calcul de loyer — un double comptage de
 * +5 % à +12 %. Ne pas réintroduire de provision : voir `anilReference.ts`.
 *
 * ⚠️ `min`/`max` ne sont PAS un intervalle de confiance sur la moyenne mais un
 * intervalle de PRÉDICTION à 95 % sur les logements individuels : sa largeur
 * (~45 points, soit −20 %/+25 %) est constante quel que soit le nombre
 * d'observations (vérifié sur les 34 960 communes). Il décrit donc bien la
 * dispersion réelle du parc, et non l'incertitude statistique.
 *
 * ⚠️ **Données FIGÉES au build**, plus de téléchargement ni de résolution de
 * ressource au runtime (plan-optimisation-loyer.md §3/§5). `anil_loyers.json`
 * est produit par `scripts/generate-anil-loyers.mjs` — c'est CE script qui
 * porte la résolution de ressource data.gouv (édition N-1, repli N-2), le
 * téléchargement et le parsing CSV, plus dans ce module. Procédure de
 * rafraîchissement annuel : voir docs/reference/estimation-loyer-charges.md.
 */

import type { TypologieAnil } from "@/lib/anilReference";
import anilLoyersRaw from "../../anil_loyers.json";

export interface LoyerReference {
  /** Loyer d'annonce médian prédit, €/m² **charges comprises**, non meublé. */
  loyerM2: number;
  /** Bornes de l'intervalle de prédiction à 95 % (€/m² CC, non meublé). */
  min: number;
  max: number;
  /** Nombre d'observations ayant servi à la prédiction (fiabilité). */
  nbObs: number;
  annee: number;
  /**
   * Niveau de maille sur lequel la prédiction a réellement été faite —
   * colonne `TYPPRED` du CSV source. Sur 85,4 % des communes, la prédiction
   * ne vient PAS de la commune elle-même mais d'un groupe de communes jugées
   * similaires (`maille`, < 100 annonces communales). `commune` = prédite au
   * niveau communal (≥ 100 annonces, ou par arrondissement pour
   * Paris/Lyon/Marseille) ; `epci` = au niveau de l'intercommunalité. La note
   * ANIL recommande explicitement la prudence en dessous de 30 observations,
   * quel que soit le niveau.
   */
  niveauPrediction: "commune" | "epci" | "maille";
}

/**
 * Ligne brute d'`anil_loyers.json` : `[loyerM2, min, max, nbObs, niveau]`.
 * Tableau plutôt qu'objet pour ne pas répéter les noms de champs sur les
 * ~35 000 communes × 4 typologies (voir `generate-anil-loyers.mjs`).
 * `niveau` encodé sur un caractère, décodé par `depuisLigneBrute` ci-dessous.
 */
type LigneBrute = [number, number, number, number, string];

type AnilLoyersData = {
  annee: Record<TypologieAnil, number>;
} & Record<TypologieAnil, Record<string, LigneBrute>>;

// `as unknown as` : le type inféré depuis le JSON (35 000+ propriétés
// littérales) n'est utile que le temps de cette conversion — on retombe tout
// de suite sur un type de travail léger (Record<string, LigneBrute>).
const anilLoyers = anilLoyersRaw as unknown as AnilLoyersData;

function depuisLigneBrute(ligne: LigneBrute, annee: number): LoyerReference {
  const [loyerM2, min, max, nbObs, niveau] = ligne;
  return {
    loyerM2,
    min,
    max,
    nbObs,
    annee,
    niveauPrediction: niveau === "c" ? "commune" : niveau === "e" ? "epci" : "maille",
  };
}

export async function fetchLoyerReference(
  codeInsee: string,
  typologie: TypologieAnil
): Promise<LoyerReference | null> {
  if (!codeInsee) return null;
  const ligne = anilLoyers[typologie][codeInsee];
  if (!ligne) return null;
  return depuisLigneBrute(ligne, anilLoyers.annee[typologie]);
}

const RAYON_LOCAL = 500;

/**
 * Loyer de référence « local » dans un rayon de ~500 m autour du bien.
 * On reverse-géocode 5 points (centre + 4 cardinaux à 500 m) via la BAN
 * pour identifier les communes/arrondissements traversés, puis on calcule
 * une moyenne pondérée par nombre d'observations des loyers ANIL.
 * Si une seule commune ressort (cas courant hors PLM), le résultat est
 * identique à fetchLoyerReference. Retourne aussi le nombre de communes
 * agrégées pour adapter le libellé UI.
 */
export async function fetchLoyerReferenceLocal(
  lat: number,
  lon: number,
  fallbackCodeInsee: string,
  typologie: TypologieAnil
): Promise<{ ref: LoyerReference; nbCommunes: number } | null> {
  const dLat = RAYON_LOCAL / 111000;
  const dLon = RAYON_LOCAL / (111000 * Math.cos((lat * Math.PI) / 180));

  const points: [number, number][] = [
    [lat, lon],
    [lat + dLat, lon],
    [lat - dLat, lon],
    [lat, lon + dLon],
    [lat, lon - dLon],
  ];

  const codes = await Promise.all(points.map(([la, lo]) => reverseGeoCodeInsee(la, lo)));
  const uniqueCodes = [...new Set(codes.filter((c): c is string => c != null))];
  if (uniqueCodes.length === 0 && fallbackCodeInsee) uniqueCodes.push(fallbackCodeInsee);

  const table = anilLoyers[typologie];
  const annee = anilLoyers.annee[typologie];
  const refs = uniqueCodes
    .map((code) => table[code])
    .filter((r): r is LigneBrute => r != null)
    .map((ligne) => depuisLigneBrute(ligne, annee));

  if (refs.length === 0) return null;
  if (refs.length === 1) return { ref: refs[0], nbCommunes: 1 };

  const totalObs = refs.reduce((s, r) => s + r.nbObs, 0);
  // Fiabilité de l'agrégat = la PIRE des communes combinées (conservateur) :
  // mélanger une commune fiable avec une "maille" ne rend pas le résultat
  // plus fiable que son maillon le plus faible.
  const RANG_FIABILITE = { commune: 2, epci: 1, maille: 0 } as const;
  const niveauPrediction = refs.reduce<LoyerReference["niveauPrediction"]>(
    (pire, r) => (RANG_FIABILITE[r.niveauPrediction] < RANG_FIABILITE[pire] ? r.niveauPrediction : pire),
    refs[0].niveauPrediction
  );
  return {
    ref: {
      loyerM2: round1(refs.reduce((s, r) => s + r.loyerM2 * r.nbObs, 0) / totalObs),
      min: round1(Math.min(...refs.map((r) => r.min))),
      max: round1(Math.max(...refs.map((r) => r.max))),
      nbObs: totalObs,
      annee: refs[0].annee,
      niveauPrediction,
    },
    nbCommunes: refs.length,
  };
}

async function reverseGeoCodeInsee(lat: number, lon: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      `https://api-adresse.data.gouv.fr/reverse/?lon=${lon}&lat=${lat}&limit=1`,
      { signal: controller.signal, headers: { "User-Agent": "comparateur-locatif-perso/1.0" } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{ properties?: { citycode?: string } }>;
    };
    return data.features?.[0]?.properties?.citycode ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
