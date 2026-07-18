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

CONTEXTE IMPORTANT : les chiffres bruts (prix/m², rendement, cash-flow, notes...) sont DÉJÀ AFFICHÉS à l'écran juste au-dessus de tes textes. Re-citer un chiffre sans en tirer une conclusion est donc inutile et interdit. Ta valeur ajoutée : l'INTERPRÉTATION — ce que ces chiffres impliquent, ce qu'un œil expérimenté y lit, ce qu'il faut faire ensuite.

Note globale pondérée : ${analyse.score_global}/10.
${nomQuartier ? `\nLOCALISATION DU BIEN : ${nomQuartier}\n` : ""}${contexteBien ? `\n${contexteBien}\n` : ""}
VERDICTS PRIORITAIRES (points rédhibitoires / de vigilance) :
${verdictsTexte}

BLOCS (chacun avec sa note et ses faits réels) :
${blocsTexte}

Réponds UNIQUEMENT avec un objet JSON strict (rien avant ni après), de la forme :
{"prix":"...","location":"...","risque":"...","potentiel":"...","simulation":"...","quartier":"...","synthese":"..."}

Consignes de rédaction (en français) :
- Pour "prix", "location", "risque", "potentiel", "simulation" : 2 à 3 phrases (55 mots max), chacune apportant une lecture d'expert. Mets "" pour un bloc absent. Grille d'analyse par bloc :
  · "prix" : que dit l'écart au marché ? Marge de négociation à tenter (et sur quel argument) ou risque de surpayer ; conséquence à la revente. Si l'échantillon de ventes est mince ou la comparaison approximative, dis en quoi ça fragilise la lecture.
  · "location" : le loyer retenu est-il réaliste ou optimiste (surtout s'il est estimé et au-dessus du marché) ? Quelle tension locative en tirer, et à quel point le rendement est sensible à quelques dizaines d'euros d'écart sur ce loyer.
  · "risque" : hiérarchise — qu'est-ce qui coûte de l'argent ou bloque la location (DPE et calendrier loi Climat : travaux à provisionner, argument de négociation), vs simple point de vigilance (argiles → fissures/assurance, radon, séisme). Conclus sur l'impact concret pour un bailleur.
  · "potentiel" : facilité de revente (liquidité), dynamique des prix → espoir de plus-value ou marché atone, profil de locataire probable d'après les commodités, et ce que la sécurité du secteur implique (vacance, turnover, type de gestion).
  · "simulation" : traduis le cash-flow en décision — quel effort d'épargne mensuel il faut accepter et ce qu'il finance en face (capitalisation, patrimoine), ou quelle marge de sécurité il dégage. Nomme LE levier qui changerait le plus la donne (prix négocié, apport, durée, loyer réel).
- Pour "quartier" (JAMAIS noté, n'entre PAS dans le score — ne parle jamais de note ni de chiffre de rendement pour lui) : rédige une VRAIE description du quartier, 4 à 6 phrases, pensée pour quelqu'un qui ne le connaît pas du tout et veut savoir où il met les pieds — pas une liste de données. NOMME le quartier directement dès la première phrase à partir de LOCALISATION DU BIEN (ex. « Saint-Victor, à Marseille, est... » ou « Le quartier de X est... ») — n'écris JAMAIS "ce quartier" ou "ce secteur" de façon générique tant que le nom n'a pas été donné. Décris avec des mots, pas des chiffres : l'ambiance et la dynamique (animé ou calme, vie de quartier), le standing du secteur (à partir du revenu médian et de la typologie de la commune — traduis-les en impression qualitative, ne répète JAMAIS le chiffre brut), l'accessibilité, et le potentiel général du quartier pour quelqu'un qui s'y installerait. Aucun jugement d'investissement chiffré : uniquement une description, comme si tu présentais le quartier à un ami qui envisage d'y vivre.
- "synthese" : 4 à 6 phrases, structure imposée : (1) verdict tranché dès la première phrase — s'il existe un point rédhibitoire (rendement insuffisant, cash-flow négatif), il OUVRE la synthèse, jamais une formule rassurante qui le masque ; (2) les 2-3 facteurs qui pèsent vraiment dans la décision, hiérarchisés ; (3) ce qui pourrait faire basculer la décision (prix à négocier et pourquoi, donnée à vérifier sur place, levier de financement) ; (4) la prochaine étape concrète que tu recommandes à ton client. Le cash-flow réel (crédit + fiscalité inclus) prime sur un rendement affiché ou un bon score global. Le quartier peut être mentionné mais ne domine jamais.
- Mets en **gras** (syntaxe markdown **texte**) les 1 à 2 éléments décisifs de chaque bloc (le verdict, la conséquence clé) et de la synthèse — pas plus, pour qu'ils ressortent. Pour "quartier", mets en **gras** les 2 à 3 éléments les plus importants (le nom du quartier, l'ambiance/dynamique, le standing ou un atout notable) — jamais un chiffre.

RÈGLES ABSOLUES :
- N'utilise QUE les faits, notes et verdicts ci-dessus. N'invente AUCUN chiffre, aucune donnée, aucun fait de terrain absent des données (pas de "proche des commerces" si les faits ne le disent pas).
- Tu peux citer AU PLUS un chiffre par bloc, uniquement s'il porte ton raisonnement — jamais une énumération de chiffres.
- INTERDIT les tournures de remplissage ("il convient de noter", "la note de X/10 confirme", "ce bien présente") et les généralités valables pour n'importe quel bien ("l'immobilier reste une valeur sûre"). Chaque phrase doit être spécifique à CE bien.
- Un doute ou une donnée manquante se dit franchement ("à vérifier", "donnée manquante"), jamais comblé par une supposition.`;

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
