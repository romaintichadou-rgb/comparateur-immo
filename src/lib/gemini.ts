import { readFileSync } from "fs";
import { join } from "path";

/**
 * Appel direct à l'API REST Gemini (generateContent), en contournant le SDK
 * @google/genai : les clés récentes de type "Auth key" (préfixe `AQ.`,
 * générées par défaut depuis peu sur aistudio.google.com) échouent
 * systématiquement via ce SDK avec une erreur "API_KEY_INVALID", alors que
 * la même clé fonctionne normalement en appel REST direct — bug connu,
 * voir https://discuss.ai.google.dev/t/gemini-api-key-start-from-aq/171575
 */
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Lit GEMINI_API_KEY directement dans .env.local plutôt que process.env :
 * sur cette machine, une variable GEMINI_API_KEY obsolète est injectée au
 * niveau de la session (au-delà des simples fichiers rc du shell — voir
 * `launchctl getenv`), et process.env garde cette valeur même après un
 * redémarrage complet du serveur de dev. .env.local reste la source de
 * vérité ; process.env sert de repli pour la prod (Vercel), où ce fichier
 * n'existe pas mais où les variables sont injectées proprement.
 */
export function getGeminiApiKey(): string | undefined {
  try {
    const content = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("GEMINI_API_KEY=")) {
        return trimmed.slice("GEMINI_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // .env.local absent (ex. production) : repli sur process.env ci-dessous.
  }
  return process.env.GEMINI_API_KEY;
}

interface GeminiPart {
  text?: string;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
}

/**
 * Erreur HTTP de l'API Gemini, porteuse du code de statut — c'est ce qui
 * permet à la boucle de retry ci-dessous de distinguer une panne PONCTUELLE
 * (5xx, surcharge côté Google, retenter a du sens) d'une panne QUI SE
 * REPRODUIRA À L'IDENTIQUE (4xx : clé invalide, requête malformée — retenter
 * ne ferait que doubler la latence pour le même échec).
 */
class GeminiHttpError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

// 55 s par tentative, 2 tentatives max (55 × 2 = 110 s) : reste largement
// sous la limite d'exécution des fonctions Vercel (300 s), tout en évitant
// qu'un appel Gemini bloqué indéfiniment (observé : ~3 sur 57 dans les tests
// menés pour ce projet) ne consomme tout le budget de la requête HTTP entière.
const TIMEOUT_MS = 55000;
const MAX_TENTATIVES = 2;

export async function generateGeminiText(params: {
  apiKey: string;
  model: string;
  prompt: string;
  /** Active l'outil de recherche Google (grounding) pour cet appel. */
  googleSearch?: boolean;
  /**
   * Budget de "thinking" (tokens de raisonnement interne, facturés comme de
   * l'output). Les modèles 2.5 l'activent par défaut avec un budget
   * dynamique, ce qui rallonge et renchérit chaque appel : on le fixe
   * explicitement — 0 pour les tâches de rédaction pure (narration), un
   * petit budget pour celles qui demandent un calcul (estimation de loyer).
   */
  thinkingBudget?: number;
  temperature?: number;
  /**
   * Force une réponse JSON conforme à ce schéma (sous-ensemble OpenAPI
   * accepté par l'API Gemini). ⚠️ Incompatible avec `googleSearch` côté API —
   * outils et sortie structurée ne peuvent pas être combinés sur un même
   * appel. Ne jamais passer les deux à la fois.
   */
  responseSchema?: Record<string, unknown>;
}): Promise<string> {
  const { apiKey, model, prompt, googleSearch, thinkingBudget = 0, temperature, responseSchema } = params;

  const generationConfig: Record<string, unknown> = { thinkingConfig: { thinkingBudget } };
  if (temperature != null) generationConfig.temperature = temperature;
  if (responseSchema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = responseSchema;
  }

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig,
  };
  if (googleSearch) {
    body.tools = [{ google_search: {} }];
  }

  let derniereErreur: Error = new Error("Appel Gemini échoué");

  for (let tentative = 1; tentative <= MAX_TENTATIVES; tentative++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const errText = await res.text();
        throw new GeminiHttpError(`Gemini API error (${res.status}): ${errText}`, res.status);
      }

      const data = (await res.json()) as GeminiResponse;
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      return parts.map((p) => p.text ?? "").join("");
    } catch (err) {
      clearTimeout(timer);
      const nonRetenable = err instanceof GeminiHttpError && err.status < 500;
      if (nonRetenable || tentative === MAX_TENTATIVES) {
        throw err;
      }
      derniereErreur = err instanceof Error ? err : new Error(String(err));
    }
  }
  // Inatteignable (la boucle retourne ou lève à chaque itération) — ne sert
  // qu'à satisfaire le typage d'une fonction qui doit toujours résoudre ou
  // rejeter.
  throw derniereErreur;
}
