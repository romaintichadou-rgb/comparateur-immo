import { createHash } from "crypto";
import { generateGeminiText, getGeminiApiKey } from "./gemini";
import { isImmeuble } from "./types";
import { formatSecteur } from "./adresse";
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
  etage: string | null;
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
  chargesCalcul?: ChargesCalcul | null;
}

export interface ChargesCalcul {
  empreinte: string;
  reutilise: boolean;
  echecIa: boolean;
}

const CHARGES_PROMPT_VERSION = 1;

function calculerEmpreinteCharges(
  input: ChargesEstimationInput,
  wantCopro: boolean,
  wantTf: boolean,
): string {
  const cle = JSON.stringify([
    CHARGES_PROMPT_VERSION,
    input.ville,
    input.quartier,
    input.code_postal,
    input.type_bien,
    input.surface_m2,
    input.nb_lots,
    input.annee_construction,
    input.etage,
    input.ascenseur,
    input.etat_bien,
    input.prix,
    input.code_insee,
    wantCopro,
    wantTf,
  ]);
  return createHash("sha256").update(cle).digest("hex");
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
  return formatSecteur(input) || "secteur inconnu";
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
  return (
    `${TF_JUSTIF_COMMUNE_PREFIX} : ${tauxFr} % ` +
    `(${villePrefix}source DGFiP 2025 — communal, intercommunal et taxes annexes). ` +
    `La base cadastrale est estimée d'après les moyennes du département ; ` +
    `la taxe définitive dépend de la valeur locative cadastrale propre au bien.`
  );
}

const CONSIGNE_RECENCE =
  "N'utilise QUE des données datant de la DERNIÈRE ANNÉE — écarte toute source plus ancienne.";

const AI_WEIGHT = 0.4;

const SCHEMA_BOTH = {
  type: "OBJECT",
  properties: {
    charges_copro_eur_an: { type: "NUMBER" },
    charges_justification: { type: "STRING" },
    taxe_fonciere_eur_an: { type: "NUMBER" },
    taxe_justification: { type: "STRING" },
  },
  required: ["charges_copro_eur_an", "charges_justification", "taxe_fonciere_eur_an", "taxe_justification"],
};

const SCHEMA_COPRO_ONLY = {
  type: "OBJECT",
  properties: {
    charges_copro_eur_an: { type: "NUMBER" },
    charges_justification: { type: "STRING" },
  },
  required: ["charges_copro_eur_an", "charges_justification"],
};

const SCHEMA_TF_ONLY = {
  type: "OBJECT",
  properties: {
    taxe_fonciere_eur_an: { type: "NUMBER" },
    taxe_justification: { type: "STRING" },
  },
  required: ["taxe_fonciere_eur_an", "taxe_justification"],
};

const CONSIGNE_JUSTIFICATION = `Chaque justification : 2-4 phrases COURTES et FACTUELLES.
- Cite uniquement les facteurs qui MODIFIENT la référence (ascenseur, ancienneté, chauffage collectif, gardien, taux communal élevé/bas…) avec leur impact en %.
- Ne répète PAS le montant de référence (il est déjà affiché) : n'écris jamais "la référence de X €/an", "X €/an est proche de…", etc.
- Ne termine PAS par "Résultat : X €/an".
- NE CITE PAS de prix au m² (€/m², €/m²/an). Tout en €/an.
- JAMAIS de "moyenne nationale" : utilise toujours l'échelle la plus locale possible (quartier > arrondissement > ville > département).
- Pas de sources, pas de formules, pas de détails de calcul.`;


function etageNum(etage: string | null): number | null {
  if (etage == null) return null;
  if (/rdc|rez/i.test(etage)) return 0;
  const m = etage.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function computeDeterministicCopro(input: ChargesEstimationInput): number {
  const immeuble = isImmeuble(input.type_bien);
  let base = estimateChargesCopro(input.surface_m2, immeuble, input.code_postal);

  const floor = etageNum(input.etage);
  if (floor != null && floor >= 3 && input.ascenseur === true) base *= 1.20;

  if (input.annee_construction != null) {
    const age = new Date().getFullYear() - input.annee_construction;
    if (age > 50) base *= 1.10;
    else if (age <= 20) base *= 0.95;
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
  previousCalcul?: ChargesCalcul | null,
): Promise<ChargesEstimationResult> {
  const hasTauxCommune = input.code_insee != null && getTauxCommune(input.code_insee) != null;

  if (field === "taxe_fonciere" && hasTauxCommune) {
    return {
      chargesCoproAnnuelles: null,
      chargesJustification: "",
      taxeFonciere: computeDeterministicTaxe(input),
      taxeJustification: buildTfJustificationDeterministe(input),
    };
  }

  const wantCopro = field !== "taxe_fonciere";
  const wantTf = field !== "charges_copro_annuelles" && !hasTauxCommune;

  const empreinte = calculerEmpreinteCharges(input, wantCopro, wantTf);
  if (
    previousCalcul &&
    previousCalcul.empreinte === empreinte &&
    !previousCalcul.echecIa
  ) {
    return {
      chargesCoproAnnuelles: null,
      chargesJustification: "",
      taxeFonciere: null,
      taxeJustification: "",
      chargesCalcul: { empreinte, reutilise: true, echecIa: false },
    };
  }

  const secteur = buildSecteur(input);
  const model = process.env.GEMINI_CHARGES_MODEL || process.env.GEMINI_RENT_MODEL || "gemini-2.5-flash";

  const etageTxt = input.etage != null ? `étage ${input.etage}` : "";
  const ascenseurTxt = input.ascenseur === true ? "avec ascenseur" : input.ascenseur === false ? "sans ascenseur" : "";
  const anneeTxt = input.annee_construction != null ? `${input.annee_construction}` : "année inconnue";
  const prixTxt = input.prix != null ? `, ${input.prix.toLocaleString("fr-FR")} €` : "";

  const ancreDeterministe = buildAncreDeterministe(input, wantTf);

  let consigne: string;
  let schema: Record<string, unknown>;
  if (wantCopro && wantTf) {
    consigne = `Estime deux montants ANNUELS :
1) CHARGES COPRO/EXPLOITATION : affine la référence selon les spécificités locales (chauffage collectif, gardien, prestations du quartier).
2) TAXE FONCIÈRE : affine selon le taux communal.`;
    schema = SCHEMA_BOTH;
  } else if (wantTf) {
    consigne = `Estime le montant ANNUEL de la TAXE FONCIÈRE : affine selon le taux communal.`;
    schema = SCHEMA_TF_ONLY;
  } else {
    consigne = `Estime le montant ANNUEL des CHARGES COPRO/EXPLOITATION : affine la référence selon les spécificités locales (chauffage collectif, gardien, prestations du quartier).`;
    schema = SCHEMA_COPRO_ONLY;
  }

  const prompt = `Bien situé à ${secteur} : ${input.type_bien || "bien"}, ${input.surface_m2 ?? "?"} m², ${anneeTxt}, ${[etageTxt, ascenseurTxt].filter(Boolean).join(" ")}, état ${input.etat_bien || "inconnu"}${prixTxt}.

${buildConsigneType(input)}

${ancreDeterministe}

${consigne}

${CONSIGNE_RECENCE}
${CONSIGNE_JUSTIFICATION}`;

  let parsed: {
    charges_copro_eur_an?: number | null;
    charges_justification?: string;
    taxe_fonciere_eur_an?: number | null;
    taxe_justification?: string;
  } | null = null;
  let echecIa = false;

  try {
    const text = await generateGeminiText({
      apiKey: requireApiKey(),
      model,
      prompt,
      thinkingBudget: 0,
      temperature: 0,
      responseSchema: schema,
    });
    parsed = JSON.parse(text.trim());
  } catch (err) {
    console.error("[charges] Gemini error:", err instanceof Error ? err.message : err);
    echecIa = true;
  }

  let finalCopro: number | null = null;
  let chargesJustif = "";
  if (wantCopro) {
    const detCopro = computeDeterministicCopro(input);
    const aiCopro = typeof parsed?.charges_copro_eur_an === "number" ? parsed.charges_copro_eur_an : null;
    if (aiCopro != null && input.surface_m2 != null && input.surface_m2 > 0) {
      const blended = Math.round((1 - AI_WEIGHT) * detCopro + AI_WEIGHT * aiCopro);
      const minCopro = Math.round(detCopro * 0.7);
      const maxCopro = Math.round(detCopro * 1.4);
      finalCopro = Math.round(Math.max(minCopro, Math.min(maxCopro, blended)));
    } else {
      finalCopro = detCopro;
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
    chargesCalcul: { empreinte, reutilise: false, echecIa },
  };
}
