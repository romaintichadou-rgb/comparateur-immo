import { generateGeminiText, getGeminiApiKey } from "./gemini";
import { isImmeuble } from "./types";

export interface ChargesEstimationInput {
  ville: string;
  quartier: string;
  code_postal: string;
  type_bien: string;
  surface_m2: number | null;
  nb_lots: number | null;
  annee_construction: number | null;
  ascenseur: boolean | null;
  etat_bien: string;
  prix: number | null;
}

export interface ChargesEstimationResult {
  chargesCoproAnnuelles: number | null;
  chargesJustification: string;
  taxeFonciere: number | null;
  taxeJustification: string;
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
  const parts = [input.quartier, input.ville, input.code_postal].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "secteur inconnu";
}

/**
 * La notion même de "charges de copropriété" ne s'applique pas de la même
 * façon selon le type de bien — le prompt doit le dire explicitement, sinon
 * le modèle applique par défaut un raisonnement "appartement en copro" à
 * tout, y compris une maison individuelle (qui n'a généralement AUCUNE
 * copropriété) ou un immeuble entier (qui n'a pas de syndic du tout).
 */
function buildConsigneType(input: ChargesEstimationInput): string {
  if (isImmeuble(input.type_bien)) {
    return `Ce bien est un IMMEUBLE DE RAPPORT entier (${
      input.nb_lots != null && input.nb_lots > 0 ? `${input.nb_lots} lot(s)` : "plusieurs lots"
    }), pas un logement en copropriété : il n'y a PAS de syndic ni de charges de copropriété au sens classique. "charges_copro_eur_an" doit donc désigner les CHARGES D'EXPLOITATION de l'immeuble entier à la charge du seul propriétaire (entretien des parties communes, eau/électricité communes, petites réparations) — pas une quote-part de copropriété.`;
  }
  if (input.type_bien.trim().toLowerCase() === "maison") {
    return `Ce bien est une MAISON INDIVIDUELLE : sauf indice contraire, elle n'appartient à AUCUNE copropriété (pas de syndic, pas de charges communes). "charges_copro_eur_an" doit donc rester bas ou nul — ne le calque jamais sur le niveau de charges d'un appartement en immeuble ; ce n'est que si le bien est en lotissement avec charges partagées (rare) qu'un montant notable se justifie.`;
  }
  return `Ce bien est un logement en copropriété : "charges_copro_eur_an" désigne la quote-part de charges de copropriété courantes (entretien, ascenseur le cas échéant, assurance d'immeuble, syndic) — hors travaux exceptionnels votés en AG.`;
}

const FORMAT_JSON = `Réponds UNIQUEMENT avec un objet JSON strict, sans texte avant ni après, de la forme exacte:
{"charges_copro_eur_an": <nombre entier ou null>, "charges_justification": "<1-2 phrases citant la fourchette trouvée et la source>", "taxe_fonciere_eur_an": <nombre entier ou null>, "taxe_justification": "<1-2 phrases citant le taux communal trouvé et la source>"}

Si tu ne trouves vraiment aucune donnée exploitable pour l'un des deux montants, mets sa valeur à null avec une justification expliquant pourquoi (les deux montants sont indépendants : trouver l'un et pas l'autre est normal).`;

/**
 * Estime les charges annuelles à la charge du propriétaire — charges de
 * copropriété (ou d'exploitation pour un immeuble) et taxe foncière — via
 * Gemini + recherche Google, avec une courte justification par montant.
 * Alimente `charges_copro_annuelles`/`taxe_fonciere`, modifiables librement :
 * dès que l'utilisateur les corrige, ils ne sont plus jamais écrasés
 * automatiquement (sauf action explicite "Réestimer"). Contrairement au
 * loyer (comparé à des annonces réelles) ou au prix (comparé à des ventes
 * DVF réelles), il n'existe pas de source de données déjà branchée dans
 * l'app pour ces deux montants : c'est une estimation "au mieux" via
 * recherche web, pas une donnée vérifiée — d'où le badge "Estimation IA"
 * distinct (voir AiEstimatedBadge) plutôt que "Estimé" (formule locale).
 */
export async function estimateCharges(
  input: ChargesEstimationInput
): Promise<ChargesEstimationResult> {
  const secteur = buildSecteur(input);
  const model = process.env.GEMINI_CHARGES_MODEL || process.env.GEMINI_RENT_MODEL || "gemini-2.5-flash";

  const ascenseurTxt =
    input.ascenseur === true ? "avec ascenseur" : input.ascenseur === false ? "sans ascenseur" : "ascenseur inconnu";
  const anneeTxt = input.annee_construction != null ? `construit en ${input.annee_construction}` : "année de construction inconnue";
  const prixTxt = input.prix != null ? `, prix d'achat ${input.prix.toLocaleString("fr-FR")} €` : "";

  const prompt = `Tu estimes deux montants ANNUELS à la charge du propriétaire d'un bien immobilier situé à: ${secteur}.
Caractéristiques du bien: ${input.type_bien || "bien immobilier"}, ${input.surface_m2 ?? "surface inconnue"} m², ${anneeTxt}, ${ascenseurTxt}, état: ${input.etat_bien || "inconnu"}${prixTxt}.

${buildConsigneType(input)}

1) CHARGES DE COPROPRIÉTÉ (OU D'EXPLOITATION) ANNUELLES : cherche sur le web des ordres de grandeur de charges pour ce type de bien dans ce secteur. L'ascenseur et l'ancienneté du bâtiment sont les postes les plus déterminants (chauffage collectif, entretien).

2) TAXE FONCIÈRE ANNUELLE : cherche le taux communal de taxe foncière sur les propriétés bâties de cette commune (mairie, impots.gouv.fr, comparateurs de taux communaux/départementaux), et déduis-en un montant annuel plausible pour ce bien compte tenu de son prix et de sa surface (la valeur locative cadastrale, base du calcul, est grossièrement proportionnelle à la valeur du bien).

${FORMAT_JSON}`;

  const text = await generateGeminiText({
    apiKey: requireApiKey(),
    model,
    prompt,
    googleSearch: true,
    thinkingBudget: 512,
  });

  const parsed = extractJson(text);

  return {
    chargesCoproAnnuelles: typeof parsed?.charges_copro_eur_an === "number" ? parsed.charges_copro_eur_an : null,
    chargesJustification:
      typeof parsed?.charges_justification === "string"
        ? parsed.charges_justification
        : "Estimation indisponible : réponse IA non exploitable.",
    taxeFonciere: typeof parsed?.taxe_fonciere_eur_an === "number" ? parsed.taxe_fonciere_eur_an : null,
    taxeJustification:
      typeof parsed?.taxe_justification === "string"
        ? parsed.taxe_justification
        : "Estimation indisponible : réponse IA non exploitable.",
  };
}

function extractJson(
  text: string
): { charges_copro_eur_an?: number | null; charges_justification?: string; taxe_fonciere_eur_an?: number | null; taxe_justification?: string } | null {
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
