import { generateGeminiText, getGeminiApiKey } from "./gemini";
import { isImmeuble } from "./types";

export interface RentEstimationInput {
  ville: string;
  quartier: string;
  code_postal: string;
  surface_m2: number | null;
  nb_pieces: number | null;
  type_bien: string;
  // Nombre de lots — utilisé uniquement pour un immeuble, où le loyer estimé
  // est le TOTAL de tous les logements, pas le loyer d'un seul.
  nb_lots: number | null;
  // Charges de copropriété/exploitation ANNUELLES actuellement retenues pour
  // ce bien (formule déterministe, estimation IA, ou valeur saisie à la
  // main — peu importe la source, voir applyLiveEstimates). Sert à convertir
  // un loyer trouvé HC en CC avec la MÊME provision que celle affichée dans
  // la section "Charges annuelles" de la fiche, plutôt qu'une moyenne
  // générique déconnectée du bien.
  charges_copro_annuelles: number | null;
}

export interface RentEstimationResult {
  loyer: number | null;
  justification: string;
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

// Contrainte de fraîcheur appliquée aux deux prompts : sans elle, le modèle
// peut ancrer sa recherche sur des baromètres ou annonces vieux de plusieurs
// années, qui sous-estiment le loyer réel actuel dans un marché qui monte.
const CONSIGNE_RECENCE =
  "Ne retiens QUE des données de loyers publiées ou observées au cours des 2 DERNIÈRES ANNÉES — écarte toute donnée plus ancienne, même si elle est plus facile à trouver.";

/**
 * Provision de charges locatives à utiliser pour convertir un loyer HC en CC
 * — dérivée des charges RÉELLEMENT retenues pour ce bien (formule, IA, ou
 * saisie manuelle) quand elles sont connues, pour rester cohérent avec ce
 * qu'affiche la section "Charges annuelles" de la fiche, plutôt qu'une
 * moyenne générique sans rapport avec CE bien précis.
 */
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

const FORMAT_JSON = `Réponds UNIQUEMENT avec un objet JSON strict, sans texte avant ni après, de la forme exacte:
{"loyer_mensuel_eur": <nombre entier>, "justification": "<2-3 phrases en français citant la fourchette de prix/m² trouvée et la ou les sources>"}

Si tu ne trouves vraiment aucune donnée exploitable pour ce secteur, réponds avec {"loyer_mensuel_eur": null, "justification": "<explication>"}.`;

/** Loyer d'un logement unique (studio, appartement, maison...). */
function buildLogementPrompt(input: RentEstimationInput, secteur: string): string {
  return `Tu estimes un loyer mensuel de location vide, charges comprises (CC), pour un bien immobilier situé à: ${secteur}.
Caractéristiques du bien: ${input.type_bien || "appartement"}, ${
    input.surface_m2 ?? "surface inconnue"
  } m², ${input.nb_pieces ?? "nombre de pièces inconnu"} pièce(s).

Cherche sur le web des données de loyers moyens au m² dans ce secteur précis (baromètres type SeLoger, MeilleursAgents, LocService, observatoires des loyers...). ${CONSIGNE_RECENCE}

${buildConsigneCharges(input)} Déduis-en un loyer mensuel CC réaliste pour CE bien précis.

${FORMAT_JSON}`;
}

/**
 * Loyer d'un immeuble de rapport : la valeur attendue est le loyer mensuel
 * TOTAL de tout l'immeuble (somme de tous les lots), pas le loyer d'un seul
 * logement. On raisonne donc lot par lot puis on additionne — un immeuble de
 * petits logements loue souvent à un €/m² PLUS élevé qu'un grand appartement
 * unique, d'où l'importance de ne pas appliquer bêtement un €/m² de grande
 * surface à la surface totale.
 */
function buildImmeublePrompt(input: RentEstimationInput, secteur: string): string {
  const surface = input.surface_m2 ?? "surface totale inconnue";
  const lots =
    input.nb_lots != null && input.nb_lots > 0
      ? `${input.nb_lots} lot(s)/logement(s)`
      : "nombre de lots non précisé (estime un découpage plausible pour cette surface)";

  return `Tu estimes le loyer mensuel TOTAL, charges comprises (CC), d'un IMMEUBLE DE RAPPORT entier (tous les logements loués) situé à: ${secteur}.
Caractéristiques de l'immeuble: surface totale ${surface} m², ${lots}.

IMPORTANT — c'est un immeuble entier, pas un logement unique :
- La valeur demandée est la SOMME des loyers de tous les lots, pas le loyer d'un seul appartement.
- Raisonne lot par lot : estime un découpage réaliste (nombre et taille des logements) à partir de la surface totale et du nombre de lots, un loyer €/m² CC par type de logement (les petits logements se louent plus cher au m²), puis ADDITIONNE.
- Cherche sur le web des loyers moyens au m² dans ce secteur (baromètres type SeLoger, MeilleursAgents, LocService, observatoires des loyers...). ${CONSIGNE_RECENCE}
- ${buildConsigneCharges(input)}
- Ne renvoie pas un loyer de logement unique : le total d'un immeuble se compte en plusieurs milliers d'euros par mois.

${FORMAT_JSON}
Dans la justification, précise le découpage supposé (nombre de logements et loyer par type) qui aboutit au total.`;
}

/**
 * Estime un loyer mensuel de marché, charges comprises (CC), via Gemini +
 * recherche Google, avec une courte justification affichée à l'utilisateur.
 * Cette valeur alimente le champ unique `loyer_retenu`, modifiable
 * librement : dès que l'utilisateur le corrige, il n'est plus jamais écrasé
 * automatiquement (sauf action explicite "Réestimer"). Utilise l'API Gemini
 * (palier gratuit disponible) plutôt qu'Anthropic, qui n'a pas de palier
 * gratuit.
 */
export async function estimateRent(
  input: RentEstimationInput
): Promise<RentEstimationResult> {
  const secteur = buildSecteur(input);
  const model = process.env.GEMINI_RENT_MODEL || "gemini-2.5-flash";

  const prompt = isImmeuble(input.type_bien)
    ? buildImmeublePrompt(input, secteur)
    : buildLogementPrompt(input, secteur);

  // Petit budget de thinking (pas 0) : l'estimation demande un vrai calcul
  // (€/m² trouvé × surface + provision de charges) où le raisonnement réduit
  // nettement les erreurs d'arithmétique, sans exploser la latence.
  const text = await generateGeminiText({
    apiKey: requireApiKey(),
    model,
    prompt,
    googleSearch: true,
    thinkingBudget: 512,
  });

  const parsed = extractJson(text);

  return {
    loyer: typeof parsed?.loyer_mensuel_eur === "number" ? parsed.loyer_mensuel_eur : null,
    justification:
      typeof parsed?.justification === "string"
        ? parsed.justification
        : "Estimation indisponible : réponse IA non exploitable.",
  };
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
