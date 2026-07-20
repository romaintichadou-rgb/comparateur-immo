/**
 * Taxe foncière — estimation au niveau COMMUNAL (server-only).
 *
 * Source : DGFiP 2025, fichier REI "Fiscalité locale des particuliers"
 * (data.gouv.fr), colonne Taux_Global_TFB = taux communal + intercommunal
 * + TSE/GEMAPI. 34 874 communes.
 *
 * Formule : TF = surface × RC_m2 × taux_commune
 *
 * RC_m2 est estimé à partir du TF/m² départemental et du taux moyen du
 * département, avec un dampening adaptatif pour corriger le biais de
 * covariance (RC et taux corrélés au sein d'un département). Le dampening
 * varie selon l'écart entre le taux communal et la moyenne départementale :
 * - taux communal ≤ moyenne dept → pas de dampening (pas de biais)
 * - taux communal > moyenne dept → dampening proportionnel à l'écart
 * - sans taux communal (fallback) → dampening maximal
 *
 * Quand le taux communal est disponible, la TF est purement déterministe
 * (pas d'appel IA). Le fallback départemental passe par l'IA + blending.
 */

import tauxCommunes from "./taux_tfpb_communes.json";
import tauxMoyenDept from "./taux_moyen_dept.json";
import {
  getTfEurM2,
  extractDept,
  estimateTaxeFonciereLocale,
} from "./taxeFonciereData";

const communes = tauxCommunes as Record<string, number>;
const depts = tauxMoyenDept as Record<string, number>;

const NATIONAL_RC_M2 = 49; // 20 €/m² TF ÷ 0.41 taux moyen national

/**
 * Ramène un code INSEE d'arrondissement municipal à celui de sa commune-mère.
 *
 * Paris (75101–75120), Lyon (69381–69389) et Marseille (13201–13216) sont les
 * trois seules communes de France découpées en arrondissements municipaux : la
 * BAN renvoie le code de l'arrondissement (ex. "13207" pour Marseille 7e),
 * mais le fichier REI de la DGFiP ne connaît que la commune entière ("13055").
 * Sans cette normalisation, getTauxCommune renverrait toujours null pour ces
 * trois villes et la taxe foncière retomberait à tort sur le fallback IA.
 * Le taux TFB est voté au niveau de la commune entière, donc identique pour
 * tous ses arrondissements — ramener au code-mère est exact, pas une approx.
 */
function communeMere(codeInsee: string): string {
  if (codeInsee >= "75101" && codeInsee <= "75120") return "75056"; // Paris
  if (codeInsee >= "69381" && codeInsee <= "69389") return "69123"; // Lyon
  if (codeInsee >= "13201" && codeInsee <= "13216") return "13055"; // Marseille
  return codeInsee;
}

export function getTauxCommune(codeInsee: string): number | null {
  return communes[communeMere(codeInsee)] ?? null;
}

function getTauxMoyenDept(codePostal: string): number {
  const dept = extractDept(codePostal);
  return depts[dept] ?? 41;
}

function rcParM2(codePostal: string, tauxCommune?: number | null): number {
  const tfEurM2 = getTfEurM2(codePostal);
  const tauxDept = getTauxMoyenDept(codePostal) / 100;
  if (tauxDept <= 0) return NATIONAL_RC_M2;

  const deptRC = tfEurM2 / tauxDept;
  if (deptRC <= NATIONAL_RC_M2) return deptRC;

  // Le dampening corrige le biais de covariance : dans les départements
  // urbains, la moyenne simple du taux surestime le RC. Mais l'intensité
  // du biais dépend de l'écart entre le taux communal et la moyenne dept :
  // - taux communal ≤ moyenne → pas de biais pour cette commune → pas de dampening
  // - taux communal > moyenne → biais probable → dampening proportionnel
  // - sans taux communal (fallback) → dampening maximal (0.3)
  let dampFactor = 0.3;
  if (tauxCommune != null && tauxCommune > 0) {
    const ratio = (tauxCommune / 100) / tauxDept;
    if (ratio <= 1) {
      dampFactor = 1.0;
    } else {
      const excess = ratio - 1;
      dampFactor = Math.max(0.3, 1.0 - 0.7 * Math.min(excess / 0.3, 1.0));
    }
  }

  return NATIONAL_RC_M2 + (deptRC - NATIONAL_RC_M2) * dampFactor;
}

/**
 * Estimation de la taxe foncière avec taux communal réel (DGFiP 2025).
 *
 * Quand code_insee est disponible et trouvé dans la table REI, utilise
 * le taux réel de la commune. Sinon retombe sur l'estimation
 * départementale (taxeFonciereData.ts).
 */
export function estimateTaxeFonciereCommune(
  surfaceM2: number | null,
  codeInsee: string | null | undefined,
  codePostal: string,
  prix: number | null,
): number | null {
  const taux = codeInsee ? getTauxCommune(codeInsee) : null;

  if (taux == null) {
    return estimateTaxeFonciereLocale(surfaceM2, codePostal, prix);
  }

  const rc = rcParM2(codePostal, taux);
  const tauxPct = taux / 100;

  if (surfaceM2 != null && surfaceM2 > 0) {
    return Math.round(surfaceM2 * rc * tauxPct);
  }

  if (prix != null && prix > 0) {
    return Math.round(prix * 0.015 * tauxPct);
  }

  return null;
}
