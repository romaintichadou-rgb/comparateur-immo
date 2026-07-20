import { generateGeminiText, getGeminiApiKey } from "./gemini";
import { isImmeuble } from "./types";
import { sanitizeJustification } from "./format";
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
}

export interface RentEstimationResult {
  loyer: number | null;
  justification: string;
  ancreAnil: { loyerM2HC: number; loyerM2CC: number; surface: number; loyerAncre: number } | null;
}

const MAJORATION_MEUBLE = 0.12;
const PROVISION_CHARGES_M2_DEFAUT = 2.5;

function provisionChargesM2(input: RentEstimationInput): number {
  if (
    input.charges_copro_annuelles != null &&
    input.charges_copro_annuelles > 0 &&
    input.surface_m2 != null &&
    input.surface_m2 > 0
  ) {
    return input.charges_copro_annuelles / 12 / input.surface_m2;
  }
  return PROVISION_CHARGES_M2_DEFAUT;
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
  const parts = [input.quartier, input.ville, input.code_postal].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "secteur inconnu";
}

const CONSIGNE_RECENCE =
  "Ne retiens QUE des données de loyers publiées ou observées au cours de la DERNIÈRE ANNÉE — écarte toute donnée plus ancienne, même si elle est plus facile à trouver.";

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
  if (input.ges) parts.push(`GES ${input.ges}`);

  return parts.join(", ");
}

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

function buildConsigneDescription(input: RentEstimationInput): string {
  if (!input.description) return "";
  const extrait = input.description.length > 800
    ? input.description.slice(0, 800) + "…"
    : input.description;
  return `DESCRIPTION DU BIEN (extraite de l'annonce) :\n«${extrait}»\nUtilise les éléments de cette description qui influencent le loyer (luminosité, balcon/terrasse, vue, parking, cave, état de la cuisine/salle de bain, calme, exposition, etc.) pour affiner ton estimation.`;
}

function buildAncreAnil(loyerRef: LoyerReference | null, surface: number | null, provM2: number): string {
  if (!loyerRef || !surface || surface <= 0) return "";
  const ccM2 = loyerRef.loyerM2 * (1 + MAJORATION_MEUBLE) + provM2;
  const minCC = loyerRef.min * (1 + MAJORATION_MEUBLE) + provM2;
  const maxCC = loyerRef.max * (1 + MAJORATION_MEUBLE) + provM2;
  const median = Math.round(ccM2 * surface);
  const min = Math.round(minCC * surface);
  const max = Math.round(maxCC * surface);
  return `RÉFÉRENCE MARCHÉ OFFICIELLE (source : Carte des loyers ANIL ${loyerRef.annee}, ${loyerRef.nbObs} observations) :
- Loyer médian pour ce bien (${surface} m²) : ${median} €/mois CC meublé.
- Fourchette : ${min} – ${max} €/mois CC meublé.
UTILISE CETTE RÉFÉRENCE comme point d'ancrage principal. Ajuste à la hausse ou à la baisse selon les caractéristiques du bien (état, étage, prestations) mais reste dans la fourchette sauf justification solide (quartier premium, rénovation exceptionnelle, etc.).`;
}

const FORMAT_JSON = `Réponds UNIQUEMENT avec un objet JSON strict, sans texte avant ni après, de la forme exacte:
{"loyer_mensuel_eur": <nombre entier>, "justification": "<texte>"}

Justification : 2-4 phrases COURTES et FACTUELLES.
- Cite uniquement les facteurs qui MODIFIENT la référence ANIL (quartier, étage, prestations, DPE, travaux…) avec leur impact en %.
- Ne répète PAS le montant de référence (il est déjà affiché) : n'écris jamais "la référence de X €/mois", "X €/mois est proche de…", etc.
- Ne termine PAS par "Résultat : X €/mois".
- NE CITE PAS de prix au m². Tout en €/mois.
- JAMAIS de "moyenne nationale" : utilise toujours l'échelle la plus locale possible (quartier > arrondissement > ville > département).
- Pas de sources, pas de formules.

Si aucune donnée exploitable, réponds {"loyer_mensuel_eur": null, "justification": "<explication courte>"}.`;

function buildLogementPrompt(input: RentEstimationInput, secteur: string, ancreAnil: string): string {
  const carac = buildCaracteristiques(input);
  const travaux = buildConsigneTravaux(input);
  const etage = buildConsigneEtage(input);
  const desc = buildConsigneDescription(input);

  return `Tu estimes un loyer mensuel de LOCATION MEUBLÉE, charges comprises (CC), pour un bien immobilier situé à : ${secteur}.
Caractéristiques du bien : ${carac}.

CONTEXTE FISCAL : ce bien sera loué en MEUBLÉ (régime LMNP). Un logement meublé se loue en moyenne 10 à 20 % plus cher qu'un logement nu équivalent dans le même secteur. Cherche en priorité des loyers meublés ; si tu ne trouves que des loyers nus, applique une majoration meublé réaliste pour ce secteur.

${ancreAnil}

${etage}

${travaux}

Cherche sur le web des données de loyers récents dans ce secteur précis (baromètres type SeLoger, MeilleursAgents, LocService, observatoires des loyers...). ${CONSIGNE_RECENCE} Compare ce que tu trouves avec la référence ANIL ci-dessus pour valider ta fourchette.

${buildConsigneCharges(input)} Déduis-en un loyer mensuel CC réaliste pour CE bien précis.

${desc}

${FORMAT_JSON}`;
}

function buildImmeublePrompt(input: RentEstimationInput, secteur: string, ancreAnil: string): string {
  const surface = input.surface_m2 ?? "surface totale inconnue";
  const lots =
    input.nb_lots != null && input.nb_lots > 0
      ? `${input.nb_lots} lot(s)/logement(s)`
      : "nombre de lots non précisé (estime un découpage plausible pour cette surface)";
  const travaux = buildConsigneTravaux(input);
  const desc = buildConsigneDescription(input);

  return `Tu estimes le loyer mensuel TOTAL, charges comprises (CC), d'un IMMEUBLE DE RAPPORT entier (tous les logements loués EN MEUBLÉ) situé à : ${secteur}.
Caractéristiques de l'immeuble : surface totale ${surface} m², ${lots}.

CONTEXTE FISCAL : tous les lots seront loués en MEUBLÉ (régime LMNP). Un logement meublé se loue en moyenne 10 à 20 % plus cher qu'un logement nu équivalent. Cherche en priorité des loyers meublés ; si tu ne trouves que des loyers nus, applique une majoration meublé réaliste pour ce secteur.

${ancreAnil}

${travaux}

IMPORTANT — c'est un immeuble entier, pas un logement unique :
- La valeur demandée est la SOMME des loyers de tous les lots, pas le loyer d'un seul appartement.
- Raisonne lot par lot : estime un découpage réaliste (nombre et taille des logements) à partir de la surface totale et du nombre de lots, un loyer €/m² CC par type de logement (les petits logements se louent plus cher au m²), puis ADDITIONNE.
- Cherche sur le web des loyers récents dans ce secteur (baromètres type SeLoger, MeilleursAgents, LocService, observatoires des loyers...). ${CONSIGNE_RECENCE} Compare ce que tu trouves avec la référence ANIL ci-dessus.
- ${buildConsigneCharges(input)}
- Ne renvoie pas un loyer de logement unique : le total d'un immeuble se compte en plusieurs milliers d'euros par mois.

${desc}

${FORMAT_JSON}
Dans la justification, précise le découpage supposé (nombre de logements et loyer par type) qui aboutit au total.`;
}

const DPE_ADJUST: Record<string, number> = {
  A: 1.04, B: 1.03, C: 1.01, D: 1.0, E: 0.97, F: 0.94, G: 0.91,
};

function computeDeterministicRent(input: RentEstimationInput, ref: LoyerReference, provM2: number): number {
  const surface = input.surface_m2!;
  const ccM2 = ref.loyerM2 * (1 + MAJORATION_MEUBLE) + provM2;
  let base = ccM2 * surface;

  const etage = input.etage ? parseInt(input.etage, 10) : null;
  if (etage != null && !isNaN(etage)) {
    if (etage === 0) base *= 0.95;
    else if (etage >= 3 && input.ascenseur === true) base *= 1.05;
    else if (etage >= 3 && input.ascenseur === false) base *= 0.97;
    // Étages 1-2 : pas d'impact, ascenseur ou non
  }

  if (input.travaux != null && input.travaux > 0) {
    const trM2 = input.travaux / surface;
    if (trM2 >= 800) base *= 1.12;
    else if (trM2 >= 300) base *= 1.07;
    else base *= 1.04;
  }

  if (input.dpe) {
    base *= DPE_ADJUST[input.dpe.toUpperCase()] ?? 1.0;
  }

  const minCC = (ref.min * (1 + MAJORATION_MEUBLE) + provM2) * surface;
  const maxCC = (ref.max * (1 + MAJORATION_MEUBLE) + provM2) * surface;
  return Math.round(Math.max(minCC, Math.min(maxCC, base)));
}

const AI_WEIGHT = 0.4;

export async function estimateRent(
  input: RentEstimationInput,
  loyerRef?: LoyerReference | null
): Promise<RentEstimationResult> {
  const secteur = buildSecteur(input);
  const model = process.env.GEMINI_RENT_MODEL || "gemini-2.5-flash";
  const provM2 = provisionChargesM2(input);
  const ancreTexte = buildAncreAnil(loyerRef ?? null, input.surface_m2, provM2);

  const prompt = isImmeuble(input.type_bien)
    ? buildImmeublePrompt(input, secteur, ancreTexte)
    : buildLogementPrompt(input, secteur, ancreTexte);

  const text = await generateGeminiText({
    apiKey: requireApiKey(),
    model,
    prompt,
    googleSearch: true,
    thinkingBudget: 512,
    temperature: 0,
  });

  const parsed = extractJson(text);

  let ancreAnil: RentEstimationResult["ancreAnil"] = null;
  if (loyerRef && input.surface_m2 && input.surface_m2 > 0) {
    const ccM2 = loyerRef.loyerM2 * (1 + MAJORATION_MEUBLE) + provM2;
    ancreAnil = {
      loyerM2HC: loyerRef.loyerM2,
      loyerM2CC: Math.round(ccM2 * 10) / 10,
      surface: input.surface_m2,
      loyerAncre: Math.round(ccM2 * input.surface_m2),
    };
  }

  const aiLoyer = typeof parsed?.loyer_mensuel_eur === "number" ? parsed.loyer_mensuel_eur : null;

  let finalLoyer: number | null = aiLoyer;
  if (aiLoyer != null && loyerRef && input.surface_m2 && input.surface_m2 > 0 && !isImmeuble(input.type_bien)) {
    const det = computeDeterministicRent(input, loyerRef, provM2);
    const blended = Math.round((1 - AI_WEIGHT) * det + AI_WEIGHT * aiLoyer);
    const minCC = (loyerRef.min * (1 + MAJORATION_MEUBLE) + provM2) * input.surface_m2;
    const maxCC = (loyerRef.max * (1 + MAJORATION_MEUBLE) + provM2) * input.surface_m2;
    finalLoyer = Math.round(Math.max(minCC, Math.min(maxCC, blended)));
  }

  const rawJustif =
    typeof parsed?.justification === "string"
      ? parsed.justification
      : "Estimation indisponible : réponse IA non exploitable.";

  const justif = sanitizeJustification(rawJustif, input.surface_m2, "€/mois", 6);

  return { loyer: finalLoyer, justification: justif, ancreAnil };
}

function extractJson(text: string): { loyer_mensuel_eur?: number | null; justification?: string } | null {
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
