/**
 * Taxe foncière — données départementales (DGFIP 2025 / UNPI 2024).
 *
 * Sources :
 * - Montant moyen TF par contribuable : DGFiP Statistiques n°46 (2026)
 * - Taux moyens cumulés TFPB : IndiceVille / UNPI Observatoire 2024
 * - €/m² estimé : montant moyen / surface moyenne locale, croisé avec
 *   les données par ville de calculmalin.fr / Meilleurtaux 2024
 *
 * Ces €/m² sont des ESTIMATIONS pour un budget prévisionnel (±30 %).
 * La TF réelle dépend de la valeur locative cadastrale propre à chaque
 * bien — seul l'avis d'imposition fait foi.
 *
 * Plage : ~11 à ~52 €/m²/an. Moyenne nationale appartements : ~20 €/m²/an.
 */

const TF_EUR_M2: Record<string, number> = {
  "01": 16, "02": 19, "03": 16, "04": 19, "05": 17,
  "06": 22, "07": 14, "08": 17, "09": 15, "10": 18,
  "11": 18, "12": 14, "13": 27, "14": 18, "15": 13,
  "16": 18, "17": 16, "18": 15, "19": 15,
  "2A": 17, "2B": 12,
  "21": 19, "22": 13, "23": 11, "24": 15,
  "25": 16, "26": 19, "27": 19, "28": 19, "29": 14,
  "30": 20, "31": 25, "32": 17, "33": 23, "34": 23,
  "35": 18, "36": 12, "37": 18, "38": 25, "39": 16,
  "40": 14, "41": 17, "42": 20, "43": 14, "44": 19,
  "45": 22, "46": 16, "47": 19, "48": 13, "49": 21,
  "50": 16, "51": 22, "52": 14, "53": 14, "54": 18,
  "55": 14, "56": 14, "57": 16, "58": 14, "59": 22,
  "60": 23, "61": 15, "62": 19, "63": 19, "64": 16,
  "65": 16, "66": 18, "67": 17, "68": 16, "69": 23,
  "70": 13, "71": 17, "72": 16, "73": 17, "74": 16,
  "75": 25, "76": 26, "77": 30, "78": 29, "79": 15,
  "80": 18, "81": 19, "82": 21, "83": 23, "84": 22,
  "85": 11, "86": 16, "87": 17, "88": 14, "89": 15,
  "90": 22, "91": 35, "92": 38, "93": 52, "94": 42,
  "95": 33,
  // DOM-TOM
  "971": 28, "972": 24, "973": 34, "974": 28, "976": 40,
};

const NATIONAL_AVERAGE = 20;

export function extractDept(codePostal: string): string {
  const cp = codePostal.trim();
  if (cp.startsWith("20")) {
    const num = parseInt(cp.slice(0, 5), 10);
    return num >= 20200 ? "2B" : "2A";
  }
  if (cp.startsWith("97")) return cp.slice(0, 3);
  return cp.slice(0, 2);
}

export function getTfEurM2(codePostal: string): number {
  if (!codePostal || codePostal.length < 2) return NATIONAL_AVERAGE;
  return TF_EUR_M2[extractDept(codePostal)] ?? NATIONAL_AVERAGE;
}

/**
 * Estimation de la taxe foncière annuelle, ajustée par département (données
 * DGFIP 2025) et par prix du bien (proxy de la valeur locative cadastrale).
 *
 * Deux approches combinées quand les deux inputs sont disponibles :
 * 1. Surface × taux_local_€/m² (donnée DGFIP)
 * 2. Prix × ratio_TF local (le ratio €/m² / prix_moyen_m² reflète le
 *    poids fiscal réel du département)
 */
export function estimateTaxeFonciereLocale(
  surfaceM2: number | null,
  codePostal: string,
  prix: number | null,
): number | null {
  const eurM2 = getTfEurM2(codePostal);

  const parSurface = surfaceM2 != null && surfaceM2 > 0
    ? Math.round(surfaceM2 * eurM2)
    : null;

  // Ratio TF/prix : le taux national moyen est ~0.8% du prix.
  // On ajuste proportionnellement au taux local vs national.
  const ratioLocal = (eurM2 / NATIONAL_AVERAGE) * 0.008;
  const parPrix = prix != null && prix > 0
    ? Math.round(prix * ratioLocal)
    : null;

  if (parSurface != null && parPrix != null) {
    return Math.round(0.5 * parSurface + 0.5 * parPrix);
  }
  return parSurface ?? parPrix ?? null;
}

/**
 * Charges de copropriété €/m²/an estimées par département.
 *
 * Échelle dérivée des données ARC/CLAIRIMM 2024 et corrélée au taux de TF
 * (proxy du niveau d'urbanisation et du coût de la vie locale) :
 *  - IDF dense (TF ≥ 30) : ~32 €/m²/an (syndic cher, gardien, ascenseur fréquent)
 *  - Grandes métropoles (TF ≥ 22) : ~26 €/m²/an
 *  - Villes moyennes (TF ≥ 17) : ~22 €/m²/an
 *  - Rural / petites villes : ~18 €/m²/an
 *
 * Pour un immeuble entier (pas de syndic) : taux réduit de ~40 %.
 */
export function getCoproEurM2(codePostal: string, immeuble: boolean): number {
  const tfRate = getTfEurM2(codePostal);
  if (immeuble) {
    if (tfRate >= 30) return 18;
    if (tfRate >= 22) return 14;
    if (tfRate >= 17) return 12;
    return 10;
  }
  if (tfRate >= 30) return 32;
  if (tfRate >= 22) return 26;
  if (tfRate >= 17) return 22;
  return 18;
}

/**
 * Quote-part terrain par défaut selon la localisation. En zone urbaine dense,
 * le foncier représente une part plus faible du prix (l'essentiel de la
 * valeur est dans le bâti), tandis qu'en zone rurale le terrain pèse plus.
 *
 * Retourne un pourcentage (ex. 10 = 10% de terrain, 90% de bâti amortissable).
 */
export function defaultQuotePartTerrain(codePostal: string): number {
  const eurM2 = getTfEurM2(codePostal);
  // Départements à TF élevée → grandes métropoles → peu de terrain (10%)
  // Départements à TF basse → rural → plus de terrain (20%)
  if (eurM2 >= 25) return 10;
  if (eurM2 >= 17) return 15;
  return 20;
}
