import { GoogleGenAI } from "@google/genai";
import type { AnalyseIA, BlocAnalyse, BlocKey } from "./types";

/**
 * Couche narration : le LLM met en mots des faits DÉJÀ collectés et des notes
 * DÉJÀ calculées. Contrainte forte (dans le prompt, sans outil de recherche
 * web) : il ne cite QUE les faits fournis, n'invente aucun chiffre, ne produit
 * ni donnée ni note. Non bloquant : sans clé Gemini ou en cas d'échec, on
 * renvoie des narrations vides et les blocs restent exploitables (faits + notes).
 *
 * Un SEUL appel LLM produit toutes les narrations + la synthèse (au lieu d'un
 * appel par bloc) : c'est plus fiable — cinq appels quasi simultanés dépassaient
 * le rate-limit Gemini free tier — plus rapide et moins coûteux.
 */

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

/** Statut de la génération de narration, remonté à l'UI (non stocké). */
export type NarrationStatus = "ok" | "quota" | "unavailable" | "error";

export interface Narrations {
  blocs: Partial<Record<BlocKey, string>>;
  synthese: string;
  status: NarrationStatus;
}

export async function narrateAll(analyse: AnalyseIA): Promise<Narrations> {
  if (!getClient()) return { blocs: {}, synthese: "", status: "unavailable" };

  const blocsDispo = (Object.values(analyse.blocs) as BlocAnalyse[]).filter(
    (b) => b.disponible && b.faits.length > 0
  );
  if (blocsDispo.length === 0) return { blocs: {}, synthese: "", status: "ok" };

  const blocsTexte = blocsDispo
    .map((b) => {
      const highlights = (b.highlights ?? []).map((h) => `  - ${h.label} : ${h.value}`).join("\n");
      const dpeGes = b.dpeGes ? `  - DPE : ${b.dpeGes.dpe || "n/d"} · GES : ${b.dpeGes.ges || "n/d"}` : "";
      const faits = b.faits
        .map((f) => {
          const val = [f.value, f.unit].filter((x) => x != null && x !== "").join(" ");
          const parts = [f.label, val || "n/d", f.detail, f.perimetre ? `[${f.perimetre}]` : "", f.gravite ? `(${f.gravite})` : ""];
          return `  - ${parts.filter(Boolean).join(" · ")}`;
        })
        .join("\n");
      const note = b.note != null ? `${b.note}/5` : "non noté (informatif)";
      return `### ${b.cle} — « ${b.titre} » — note ${note}\n${[dpeGes, highlights, faits].filter(Boolean).join("\n")}`;
    })
    .join("\n\n");

  const verdictsTexte = analyse.verdicts.length
    ? analyse.verdicts.map((v) => `[${v.niveau.toUpperCase()}] ${v.titre} : ${v.detail}`).join("\n")
    : "Aucun point rédhibitoire détecté.";

  const prompt = `Tu es un analyste en investissement immobilier locatif. L'objectif de l'investisseur est la RENTABILITÉ LOCATIVE (critère prioritaire). Voici l'analyse d'un bien, 100 % à partir de données publiques réelles. Note globale pondérée : ${analyse.score_global}/5.

VERDICTS PRIORITAIRES (points rédhibitoires / de vigilance) :
${verdictsTexte}

BLOCS (chacun avec sa note et ses faits réels) :
${blocsTexte}

Réponds UNIQUEMENT avec un objet JSON strict (rien avant ni après), de la forme :
{"prix":"...","location":"...","risque":"...","potentiel":"...","quartier":"...","synthese":"..."}

Consignes de rédaction (en français) :
- Une clé par bloc présent ci-dessus : un RÉSUMÉ TRÈS COURT de 1 à 2 phrases (25 mots max), qui dit l'essentiel du bloc pour l'investisseur. Mets "" pour un bloc absent.
- Le bloc "quartier" n'est PAS noté et n'entre PAS dans le score : ne parle pas de note pour lui. Rédige plutôt un point fort et un point faible du quartier (sécurité, accessibilité, caractère résidentiel/mixte) à partir de ses seuls faits ci-dessus — pas un jugement d'investissement.
- "synthese" : 3 à 4 phrases. COMMENCE par le point le plus important : s'il existe un point rédhibitoire (ex. rendement insuffisant), énonce-le CLAIREMENT dès la première phrase — n'ouvre JAMAIS sur une formule rassurante qui le masque. Puis les points forts réels, puis les points de vigilance. La rentabilité prime sur un bon score global. Le quartier peut être mentionné mais ne doit jamais dominer la synthèse.
- Mets en **gras** (syntaxe markdown **texte**) les 1 à 2 informations décisives de chaque résumé et de la synthèse (le chiffre clé, le verdict) — pas plus, pour qu'elles ressortent.

RÈGLES ABSOLUES :
- N'utilise QUE les faits, notes et verdicts ci-dessus. N'invente AUCUN chiffre ni donnée absente.
- INTERDIT les tournures de remplissage ("il convient de noter", "la note de X/5 confirme", "ce bien présente"). Va droit au fait, ton sec et factuel.
- Ne répète pas les chiffres déjà affichés en données ; dis ce qu'ils SIGNIFIENT pour la décision.`;

  const { text: raw, status } = await generateText(prompt);
  const parsed = extractJson(raw);
  if (!parsed) return { blocs: {}, synthese: "", status: status === "ok" ? "error" : status };

  const blocs: Partial<Record<BlocKey, string>> = {};
  for (const key of ["prix", "location", "risque", "potentiel", "quartier"] as BlocKey[]) {
    if (typeof parsed[key] === "string") blocs[key] = parsed[key] as string;
  }
  return { blocs, synthese: typeof parsed.synthese === "string" ? parsed.synthese : "", status };
}

/** Génération de texte avec un retry après délai (rate-limit ponctuel). */
async function generateText(prompt: string): Promise<{ text: string; status: NarrationStatus }> {
  const ai = getClient();
  if (!ai) return { text: "", status: "unavailable" };
  const model = process.env.GEMINI_ANALYSE_MODEL || process.env.GEMINI_RENT_MODEL || "gemini-2.5-flash";

  let status: NarrationStatus = "error";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({ model, contents: prompt });
      const text = (response.text ?? "").trim();
      if (text) return { text, status: "ok" };
    } catch (e) {
      // Quota / rate-limit Gemini (429) : cas à signaler discrètement à l'UI.
      const msg = e instanceof Error ? e.message : String(e);
      if (/\b429\b|quota|rate.?limit|resource.?exhausted/i.test(msg)) status = "quota";
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 2500));
  }
  return { text: "", status };
}

function extractJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
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
