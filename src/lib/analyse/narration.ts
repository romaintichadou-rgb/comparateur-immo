import { generateGeminiText, getGeminiApiKey } from "@/lib/gemini";
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

/** Statut de la génération de narration, remonté à l'UI (non stocké). */
export type NarrationStatus = "ok" | "quota" | "unavailable" | "error";

export interface Narrations {
  blocs: Partial<Record<BlocKey, string>>;
  synthese: string;
  status: NarrationStatus;
}

export async function narrateAll(
  analyse: AnalyseIA,
  localisation?: { quartier: string; ville: string },
  contexteBien?: string
): Promise<Narrations> {
  if (!getGeminiApiKey()) return { blocs: {}, synthese: "", status: "unavailable" };

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

  const prompt = `Tu es un conseiller en investissement locatif chevronné (15 ans de transactions et de gestion), mandaté par ton client pour lui dire s'il doit acheter ce bien. Son objectif : la RENTABILITÉ RÉELLE, cash-flow après crédit et fiscalité inclus. Tu écris comme à un client que tu respectes : franc, précis, orienté décision — jamais de langue de bois.

RÈGLE CARDINALE : les chiffres (prix/m², rendement, cash-flow, notes, fourchettes, %) sont DÉJÀ AFFICHÉS à l'écran juste au-dessus de tes textes. Le lecteur les VOIT. Ton rôle est EXCLUSIVEMENT l'interprétation : ce que ces chiffres IMPLIQUENT pour la décision d'achat, les risques cachés, les leviers d'action. NE CITE AUCUN CHIFFRE qui est déjà affiché dans les faits du bloc. Si tu dois référencer une valeur pour porter un raisonnement, utilise des termes relatifs ("au-dessus du marché", "positif la première année mais négatif sur la durée") au lieu de re-copier le nombre.

Note globale pondérée : ${analyse.score_global}/10.
${nomQuartier ? `\nLOCALISATION DU BIEN : ${nomQuartier}\n` : ""}${contexteBien ? `\n${contexteBien}\n` : ""}
VERDICTS PRIORITAIRES (points rédhibitoires / de vigilance) :
${verdictsTexte}

BLOCS (chacun avec sa note et ses faits réels) :
${blocsTexte}

Réponds UNIQUEMENT avec un objet JSON strict (rien avant ni après), de la forme :
{"prix":"...","location":"...","risque":"...","potentiel":"...","simulation":"...","quartier":"...","synthese":"..."}

FORMAT — COURT, DENSE, ORIENTÉ DÉCISION :
- "prix", "location", "risque", "potentiel", "simulation" : 1 à 2 phrases MAX (30 mots max). Style télégraphique : mots-clés, pas de remplissage. Chaque mot doit apporter une info actionnable ou un risque caché. "" si bloc absent.
  · "prix" : levier de négo concret OU risque revente. Pas de description du prix.
  · "location" : tension locative du secteur, risque si reloué au prix marché. Pas de reformulation du rendement.
  · "risque" : impact financier chiffré (coût travaux, surcoût assurance). Gérable ou rédhibitoire ?
  · "potentiel" : sortie réaliste (revente facile/difficile, plus-value ou marché atone).
  · "simulation" : le seul levier qui change la donne + verdict : ça vaut le coup ou non.
- "quartier" : 2 à 3 phrases. Nomme le quartier, ambiance, type de locataire cible.
- "synthese" : 2 à 3 phrases. (1) Verdict tranché immédiat (2) facteur décisif principal (3) action recommandée.
- **Gras** sur 1 élément décisif par bloc, 1-2 dans la synthèse.

RÈGLES ABSOLUES :
- N'utilise QUE les faits fournis. AUCUNE invention.
- ZÉRO chiffre déjà affiché — termes relatifs uniquement.
- INTERDIT : "il convient de noter", "la note de X/10", "ce bien présente", toute généralité creuse.
- Donnée manquante = le dire franchement.`;

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
  const apiKey = getGeminiApiKey();
  if (!apiKey) return { text: "", status: "unavailable" };
  const model = process.env.GEMINI_ANALYSE_MODEL || process.env.GEMINI_RENT_MODEL || "gemini-2.5-flash";

  let status: NarrationStatus = "error";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = (await generateGeminiText({ apiKey, model, prompt })).trim();
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
