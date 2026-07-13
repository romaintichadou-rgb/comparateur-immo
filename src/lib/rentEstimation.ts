import { generateGeminiText, getGeminiApiKey } from "./gemini";

export interface RentEstimationInput {
  ville: string;
  quartier: string;
  code_postal: string;
  surface_m2: number | null;
  nb_pieces: number | null;
  type_bien: string;
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

  const prompt = `Tu estimes un loyer mensuel de location vide, charges comprises (CC), pour un bien immobilier situé à: ${secteur}.
Caractéristiques du bien: ${input.type_bien || "appartement"}, ${
    input.surface_m2 ?? "surface inconnue"
  } m², ${input.nb_pieces ?? "nombre de pièces inconnu"} pièce(s).

Cherche sur le web des données de loyers moyens au m² dans ce secteur précis (baromètres type SeLoger, MeilleursAgents, LocService, observatoires des loyers...). Ces baromètres publient généralement des loyers hors charges (HC) : si c'est le cas, ajoute une provision pour charges locatives réaliste (souvent 2 à 4 €/m²/mois) pour obtenir un loyer charges comprises (CC), et déduis-en un loyer mensuel CC réaliste pour CE bien précis.

Réponds UNIQUEMENT avec un objet JSON strict, sans texte avant ni après, de la forme exacte:
{"loyer_mensuel_eur": <nombre entier>, "justification": "<2-3 phrases en français citant la fourchette de prix/m² trouvée et la ou les sources>"}

Si tu ne trouves vraiment aucune donnée exploitable pour ce secteur, réponds avec {"loyer_mensuel_eur": null, "justification": "<explication>"}.`;

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
