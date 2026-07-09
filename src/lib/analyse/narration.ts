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

export async function narrateAll(
  analyse: AnalyseIA,
  localisation?: { quartier: string; ville: string }
): Promise<Narrations> {
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
      const note = b.note != null ? `${b.note}/10` : "non noté (informatif)";
      return `### ${b.cle} — « ${b.titre} » — note ${note}\n${[dpeGes, highlights, faits].filter(Boolean).join("\n")}`;
    })
    .join("\n\n");

  const verdictsTexte = analyse.verdicts.length
    ? analyse.verdicts.map((v) => `[${v.niveau.toUpperCase()}] ${v.titre} : ${v.detail}`).join("\n")
    : "Aucun point rédhibitoire détecté.";

  const nomQuartier = [localisation?.quartier, localisation?.ville].filter(Boolean).join(", ");

  const prompt = `Tu es un analyste en investissement immobilier locatif. L'objectif de l'investisseur est la RENTABILITÉ LOCATIVE RÉELLE, cash-flow après crédit et fiscalité inclus (critère prioritaire). Voici l'analyse d'un bien, 100 % à partir de données publiques réelles et d'une simulation financière déterministe. Note globale pondérée : ${analyse.score_global}/10.
${nomQuartier ? `\nLOCALISATION DU BIEN : ${nomQuartier}\n` : ""}
VERDICTS PRIORITAIRES (points rédhibitoires / de vigilance) :
${verdictsTexte}

BLOCS (chacun avec sa note et ses faits réels) :
${blocsTexte}

Réponds UNIQUEMENT avec un objet JSON strict (rien avant ni après), de la forme :
{"prix":"...","location":"...","risque":"...","potentiel":"...","simulation":"...","quartier":"...","synthese":"..."}

Consignes de rédaction (en français) :
- Pour "prix", "location", "risque", "potentiel", "simulation" : un RÉSUMÉ TRÈS COURT de 1 à 2 phrases (25 mots max), qui dit l'essentiel du bloc pour l'investisseur. Mets "" pour un bloc absent. Pour "simulation" (bloc "Simulation financière"), résume le cash-flow mensuel réel (année 1 et moyen sur la durée du crédit) et ce qu'il implique concrètement (effort d'épargne à porter, ou marge dégagée).
- Pour "quartier" (JAMAIS noté, n'entre PAS dans le score — ne parle jamais de note ni de chiffre de rendement pour lui) : rédige une VRAIE description du quartier, 4 à 6 phrases, pensée pour quelqu'un qui ne le connaît pas du tout et veut savoir où il met les pieds — pas une liste de données. NOMME le quartier directement dès la première phrase à partir de LOCALISATION DU BIEN (ex. « Saint-Victor, à Marseille, est... » ou « Le quartier de X est... ») — n'écris JAMAIS "ce quartier" ou "ce secteur" de façon générique tant que le nom n'a pas été donné. Décris avec des mots, pas des chiffres : l'ambiance et la dynamique (animé ou calme, vie de quartier), le standing du secteur (à partir du revenu médian et de la typologie de la commune — traduis-les en impression qualitative, ne répète JAMAIS le chiffre brut), l'accessibilité, et le potentiel général du quartier pour quelqu'un qui s'y installerait. Aucun jugement d'investissement chiffré : uniquement une description, comme si tu présentais le quartier à un ami qui envisage d'y vivre.
- "synthese" : 3 à 4 phrases. COMMENCE par le point le plus important : s'il existe un point rédhibitoire (ex. rendement insuffisant ou cash-flow négatif), énonce-le CLAIREMENT dès la première phrase — n'ouvre JAMAIS sur une formule rassurante qui le masque. Puis les points forts réels, puis les points de vigilance. Le cash-flow réel de la simulation financière (crédit + fiscalité inclus) prime sur un rendement affiché ou un bon score global : un bien avec un bon prix ou un bon rendement brut mais un cash-flow négatif doit être présenté comme tel. Le quartier peut être mentionné mais ne doit jamais dominer la synthèse.
- Mets en **gras** (syntaxe markdown **texte**) les 1 à 2 informations décisives de chaque résumé (le chiffre clé, le verdict) et de la synthèse — pas plus, pour qu'elles ressortent. Pour "quartier", mets en **gras** les 2 à 3 éléments les plus importants de la description (le nom du quartier lui-même, l'ambiance/dynamique, et le standing ou un atout notable) — jamais un chiffre.

RÈGLES ABSOLUES :
- N'utilise QUE les faits, notes et verdicts ci-dessus. N'invente AUCUN chiffre ni donnée absente.
- INTERDIT les tournures de remplissage ("il convient de noter", "la note de X/10 confirme", "ce bien présente"). Va droit au fait, ton sec et factuel.
- Ne répète pas les chiffres déjà affichés en données ; dis ce qu'ils SIGNIFIENT pour la décision.`;

  const { text: raw, status } = await generateText(prompt);
  const parsed = extractJson(raw);
  if (!parsed) return { blocs: {}, synthese: "", status: status === "ok" ? "error" : status };

  const blocs: Partial<Record<BlocKey, string>> = {};
  for (const key of ["prix", "location", "risque", "potentiel", "simulation", "quartier"] as BlocKey[]) {
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
