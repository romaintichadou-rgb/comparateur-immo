import { generateGeminiText, getGeminiApiKey } from "./gemini";
import { isImmeuble } from "./types";
import { estimateChargesCopro, TF_JUSTIF_COMMUNE_PREFIX } from "./estimates";
import { estimateTaxeFonciereCommune, getTauxCommune } from "./taxeFonciereCommune";
import { sanitizeJustification } from "./format";

export interface ChargesEstimationInput {
  ville: string;
  quartier: string;
  code_postal: string;
  type_bien: string;
  surface_m2: number | null;
  nb_lots: number | null;
  annee_construction: number | null;
  ascenseur: boolean | null;
  etat_bien: string;
  prix: number | null;
  code_insee?: string | null;
}

export interface ChargesEstimationResult {
  chargesCoproAnnuelles: number | null;
  chargesJustification: string;
  taxeFonciere: number | null;
  taxeJustification: string;
}

function requireApiKey(): string {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY manquant : voir .env.local.example pour activer l'estimation des charges (clé gratuite sur aistudio.google.com/apikey)."
    );
  }
  return apiKey;
}

function buildSecteur(input: ChargesEstimationInput): string {
  const parts = [input.quartier, input.ville, input.code_postal].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "secteur inconnu";
}

function buildConsigneType(input: ChargesEstimationInput): string {
  if (isImmeuble(input.type_bien)) {
    const lots = input.nb_lots != null && input.nb_lots > 0 ? `${input.nb_lots} lots` : "plusieurs lots";
    return `IMMEUBLE DE RAPPORT (${lots}) → "charges_copro_eur_an" = charges d'exploitation (entretien, eau/élec communes, réparations). Pas de syndic.`;
  }
  if (input.type_bien.trim().toLowerCase() === "maison") {
    return `MAISON INDIVIDUELLE → "charges_copro_eur_an" quasi nul sauf lotissement avec charges partagées.`;
  }
  return `COPROPRIÉTÉ → "charges_copro_eur_an" = quote-part courante (syndic, entretien, assurance immeuble). Hors travaux AG.`;
}

function buildAncreDeterministe(input: ChargesEstimationInput, includeTf: boolean): string {
  const detCopro = computeDeterministicCopro(input);
  const immeuble = isImmeuble(input.type_bien);
  const labelCopro = immeuble ? "Charges exploitation" : "Charges copro";

  const lines = [
    `RÉFÉRENCES (déjà ajustées : localisation, surface, ascenseur, ancienneté) :`,
    `- ${labelCopro} : ${detCopro.toLocaleString("fr-FR")} €/an`,
  ];

  if (includeTf) {
    const detTaxe = computeDeterministicTaxe(input);
    const taux = input.code_insee ? getTauxCommune(input.code_insee) : null;
    const tfSource = taux != null ? `taux communal ${taux.toFixed(2)} %` : "taux départemental";
    if (detTaxe != null) lines.push(`- Taxe foncière : ${detTaxe.toLocaleString("fr-FR")} €/an (${tfSource})`);
  }

  lines.push(`Affine ±15 % max. Ne recalcule pas de zéro. Pas de €/m².`);
  return lines.join("\n");
}

function buildTfJustificationDeterministe(input: ChargesEstimationInput): string {
  const taux = input.code_insee ? getTauxCommune(input.code_insee) : null;
  if (taux == null) return "";
  const tauxFr = taux.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  const ville = input.ville?.trim();
  const villePrefix = ville ? `${ville}, ` : "";
  // Le texte DOIT commencer par TF_JUSTIF_COMMUNE_PREFIX : applyLiveEstimates et
  // ApartmentDetail s'en servent pour reconnaître (et figer) une TF communale —
  // ne pas désynchroniser cette constante avec l'ouverture ci-dessous.
  //
  // Cohérence avec le calcul (estimateTaxeFonciereCommune) : SEUL le taux est
  // réel (DGFiP) ; la base cadastrale (RC/m²) est estimée à partir des moyennes
  // DÉPARTEMENTALES, et le calcul n'utilise PAS l'année de construction — ne
  // rien affirmer sur l'âge du bâtiment, ce serait un ajustement fantôme.
  return (
    `${TF_JUSTIF_COMMUNE_PREFIX} : ${tauxFr} % ` +
    `(${villePrefix}source DGFiP 2025 — communal, intercommunal et taxes annexes). ` +
    `La base cadastrale est estimée d'après les moyennes du département ; ` +
    `la taxe définitive dépend de la valeur locative cadastrale propre au bien.`
  );
}

const FORMAT_JSON_BOTH = `Réponds UNIQUEMENT avec un objet JSON strict, sans texte avant ni après, de la forme exacte:
{"charges_copro_eur_an": <nombre entier ou null>, "charges_justification": "<texte>", "taxe_fonciere_eur_an": <nombre entier ou null>, "taxe_justification": "<texte>"}

Chaque justification : 2-4 phrases COURTES et FACTUELLES.
- Cite uniquement les facteurs qui MODIFIENT la référence (ascenseur, ancienneté, chauffage collectif, gardien, taux communal élevé/bas…) avec leur impact en %.
- Ne répète PAS le montant de référence (il est déjà affiché) : n'écris jamais "la référence de X €/an", "X €/an est proche de…", etc.
- Ne termine PAS par "Résultat : X €/an".
- NE CITE PAS de prix au m² (€/m², €/m²/an). Tout en €/an.
- JAMAIS de "moyenne nationale" : utilise toujours l'échelle la plus locale possible (quartier > arrondissement > ville > département).
- Pas de sources, pas de formules, pas de détails de calcul.

Si aucune donnée exploitable, mets la valeur à null avec une justification courte.`;

const FORMAT_JSON_COPRO_ONLY = `Réponds UNIQUEMENT avec un objet JSON strict, sans texte avant ni après, de la forme exacte:
{"charges_copro_eur_an": <nombre entier ou null>, "charges_justification": "<texte>"}

Justification : 2-4 phrases COURTES et FACTUELLES.
- Cite uniquement les facteurs qui MODIFIENT la référence (ascenseur, ancienneté, chauffage collectif, gardien…) avec leur impact en %.
- Ne répète PAS le montant de référence (il est déjà affiché) : n'écris jamais "la référence de X €/an", "X €/an est proche de…", etc.
- Ne termine PAS par "Résultat : X €/an".
- NE CITE PAS de prix au m² (€/m², €/m²/an). Tout en €/an.
- JAMAIS de "moyenne nationale" : utilise toujours l'échelle la plus locale possible (quartier > arrondissement > ville > département).

Si aucune donnée exploitable, mets la valeur à null avec une justification courte.`;

const FORMAT_JSON_TF_ONLY = `Réponds UNIQUEMENT avec un objet JSON strict, sans texte avant ni après, de la forme exacte:
{"taxe_fonciere_eur_an": <nombre entier ou null>, "taxe_justification": "<texte>"}

Justification : 2-4 phrases COURTES et FACTUELLES.
- Cite uniquement les facteurs qui MODIFIENT la référence (taux communal élevé/bas, zone tendue, exonérations…) avec leur impact en %.
- Ne répète PAS le montant de référence (il est déjà affiché) : n'écris jamais "la référence de X €/an", "X €/an est proche de…", etc.
- Ne termine PAS par "Résultat : X €/an".
- NE CITE PAS de prix au m² (€/m², €/m²/an). Tout en €/an.
- JAMAIS de "moyenne nationale" : utilise toujours l'échelle la plus locale possible (commune > département).

Si aucune donnée exploitable, mets la valeur à null avec une justification courte.`;

const CONSIGNE_RECENCE =
  "N'utilise QUE des données datant de la DERNIÈRE ANNÉE — écarte toute source plus ancienne.";

const AI_WEIGHT = 0.4;


function computeDeterministicCopro(input: ChargesEstimationInput): number {
  const immeuble = isImmeuble(input.type_bien);
  let base = estimateChargesCopro(input.surface_m2, immeuble, input.code_postal);

  if (input.ascenseur === true) base *= 1.20;
  else if (input.ascenseur === false) base *= 0.85;

  if (input.annee_construction != null) {
    const age = new Date().getFullYear() - input.annee_construction;
    if (age > 50) base *= 1.15;
    else if (age <= 20) base *= 0.90;
  }

  const plancher = immeuble ? 1500 : 800;
  return Math.max(plancher, Math.round(base));
}

function computeDeterministicTaxe(input: ChargesEstimationInput): number | null {
  const detBase = estimateTaxeFonciereCommune(
    input.surface_m2, input.code_insee, input.code_postal, input.prix,
  );
  if (detBase == null) return null;
  return Math.round(detBase);
}

export type ChargesField = "charges_copro_annuelles" | "taxe_fonciere";

export async function estimateCharges(
  input: ChargesEstimationInput,
  field?: ChargesField,
): Promise<ChargesEstimationResult> {
  const hasTauxCommune = input.code_insee != null && getTauxCommune(input.code_insee) != null;

  // TF-only with commune rate: purely deterministic, no Gemini call needed.
  if (field === "taxe_fonciere" && hasTauxCommune) {
    return {
      chargesCoproAnnuelles: null,
      chargesJustification: "",
      taxeFonciere: computeDeterministicTaxe(input),
      taxeJustification: buildTfJustificationDeterministe(input),
    };
  }

  const secteur = buildSecteur(input);
  const model = process.env.GEMINI_CHARGES_MODEL || process.env.GEMINI_RENT_MODEL || "gemini-2.5-flash";

  const ascenseurTxt = input.ascenseur === true ? "avec ascenseur" : input.ascenseur === false ? "sans ascenseur" : "";
  const anneeTxt = input.annee_construction != null ? `${input.annee_construction}` : "année inconnue";
  const prixTxt = input.prix != null ? `, ${input.prix.toLocaleString("fr-FR")} €` : "";

  const wantCopro = field !== "taxe_fonciere";
  const wantTf = field !== "charges_copro_annuelles" && !hasTauxCommune;

  const ancreDeterministe = buildAncreDeterministe(input, wantTf);

  let consigne: string;
  let format: string;
  if (wantCopro && wantTf) {
    consigne = `Estime deux montants ANNUELS :
1) CHARGES COPRO/EXPLOITATION : affine la référence selon les spécificités locales (chauffage collectif, gardien, prestations du quartier).
2) TAXE FONCIÈRE : affine selon le taux communal exact si tu le trouves sur le web.`;
    format = FORMAT_JSON_BOTH;
  } else if (wantTf) {
    consigne = `Estime le montant ANNUEL de la TAXE FONCIÈRE : affine selon le taux communal exact si tu le trouves sur le web.`;
    format = FORMAT_JSON_TF_ONLY;
  } else {
    consigne = `Estime le montant ANNUEL des CHARGES COPRO/EXPLOITATION : affine la référence selon les spécificités locales (chauffage collectif, gardien, prestations du quartier).`;
    format = FORMAT_JSON_COPRO_ONLY;
  }

  const prompt = `Bien situé à ${secteur} : ${input.type_bien || "bien"}, ${input.surface_m2 ?? "?"} m², ${anneeTxt}, ${ascenseurTxt}, état ${input.etat_bien || "inconnu"}${prixTxt}.

${buildConsigneType(input)}

${ancreDeterministe}

${consigne}

${CONSIGNE_RECENCE}
${format}`;

  const text = await generateGeminiText({
    apiKey: requireApiKey(),
    model,
    prompt,
    googleSearch: true,
    thinkingBudget: 512,
    temperature: 0,
  });

  const parsed = extractJson(text);

  let finalCopro: number | null = null;
  let chargesJustif = "";
  if (wantCopro) {
    const aiCopro = typeof parsed?.charges_copro_eur_an === "number" ? parsed.charges_copro_eur_an : null;
    finalCopro = aiCopro;
    if (aiCopro != null && input.surface_m2 != null && input.surface_m2 > 0) {
      const detCopro = computeDeterministicCopro(input);
      const blended = Math.round((1 - AI_WEIGHT) * detCopro + AI_WEIGHT * aiCopro);
      const minCopro = Math.round(detCopro * 0.7);
      const maxCopro = Math.round(detCopro * 1.4);
      finalCopro = Math.round(Math.max(minCopro, Math.min(maxCopro, blended)));
    }
    chargesJustif = typeof parsed?.charges_justification === "string"
      ? sanitizeJustification(parsed.charges_justification, input.surface_m2, "€/an")
      : "Estimation indisponible : réponse IA non exploitable.";
  }

  let finalTaxe: number | null = null;
  let taxeJustif = "";
  if (field !== "charges_copro_annuelles") {
    if (hasTauxCommune) {
      finalTaxe = computeDeterministicTaxe(input);
      taxeJustif = buildTfJustificationDeterministe(input);
    } else if (wantTf) {
      const aiTaxe = typeof parsed?.taxe_fonciere_eur_an === "number" ? parsed.taxe_fonciere_eur_an : null;
      finalTaxe = aiTaxe;
      if (aiTaxe != null && input.surface_m2 != null && input.surface_m2 > 0) {
        const detTaxe = computeDeterministicTaxe(input);
        if (detTaxe != null) {
          const blended = Math.round((1 - AI_WEIGHT) * detTaxe + AI_WEIGHT * aiTaxe);
          const minTaxe = Math.round(detTaxe * 0.7);
          const maxTaxe = Math.round(detTaxe * 1.4);
          finalTaxe = Math.round(Math.max(minTaxe, Math.min(maxTaxe, blended)));
        }
      }
      taxeJustif = typeof parsed?.taxe_justification === "string"
        ? sanitizeJustification(parsed.taxe_justification, input.surface_m2, "€/an")
        : "Estimation indisponible : réponse IA non exploitable.";
    }
  }

  return {
    chargesCoproAnnuelles: finalCopro,
    chargesJustification: chargesJustif,
    taxeFonciere: finalTaxe,
    taxeJustification: taxeJustif,
  };
}

function extractJson(
  text: string
): { charges_copro_eur_an?: number | null; charges_justification?: string; taxe_fonciere_eur_an?: number | null; taxe_justification?: string } | null {
  try {
    return JSON.parse(text.trim());
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
