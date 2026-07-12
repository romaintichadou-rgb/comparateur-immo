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

export async function generateGeminiText(params: {
  apiKey: string;
  model: string;
  prompt: string;
  /** Active l'outil de recherche Google (grounding) pour cet appel. */
  googleSearch?: boolean;
}): Promise<string> {
  const { apiKey, model, prompt, googleSearch } = params;

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
  };
  if (googleSearch) {
    body.tools = [{ google_search: {} }];
  }

  const res = await fetch(`${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as GeminiResponse;
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("");
}
