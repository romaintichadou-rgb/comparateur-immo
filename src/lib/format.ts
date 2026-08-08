export function formatEuros(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Montant SIGNÉ, pour tout flux qui peut être négatif (cash-flow avant tout).
 * Source unique : trois composants en avaient chacun leur version, et une
 * quatrième (`signe()` dans SimulationFinanciere) rendait le même montant avec
 * un trait d'union ASCII et une espace ordinaire avant le « € ».
 *
 * Deux détails typographiques que `formatEuros` garantit et qu'une
 * concaténation maison perd : le vrai signe moins (U+2212, pas le trait
 * d'union) et l'espace insécable avant le « € », sans quoi le symbole peut
 * partir seul à la ligne.
 */
export function formatEurosSigned(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const rounded = Math.round(value) || 0; // normalise -0 → 0
  // Espace INSÉCABLE après le signe, même raison que celle de `formatEuros`
  // pour le « € » : sur une colonne étroite (mobile), une espace ordinaire
  // laissait le « − » finir seul sa ligne et le montant passer à la suivante.
  return `${rounded >= 0 ? "+" : "−"} ${formatEuros(Math.abs(rounded))}`;
}

/**
 * Nombre NU (sans unité), groupé par milliers en fr-FR : `4706` → `4 706`.
 *
 * À utiliser dès qu'un nombre est affiché sans que `formatEuros` /
 * `formatEurosSigned` / `formatPercent` s'appliquent — typiquement une valeur
 * dont l'unité est rendue à part (`Fait.unit` : « €/m² », « €/mois », « ventes »).
 *
 * Pourquoi ça existe : rendre `{n}` directement en JSX passe par `String(n)`,
 * qui ne groupe RIEN. Les blocs d'analyse qui pré-formataient leur valeur en
 * chaîne (`toLocaleString`) affichaient donc « 1 849 » pendant que ceux qui
 * passaient le nombre brut affichaient « 4706 » — deux rendus pour le même type
 * de donnée, parfois dans la même liste. Un nombre n'est jamais rendu brut.
 */
export function formatNombre(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Titre court d'un bien (type + surface), sans la localisation — utilisé
 * là où l'adresse doit apparaître séparément, en sous-titre.
 */
/**
 * Arrondit une surface en m² à un entier. Règle simple : arrondi standard (0.5+ monte).
 * Utilisé pour afficher des surfaces "lisibles" en titres et formulaires.
 */
export function roundSurface(surface: number | null | undefined): number | null {
  if (surface == null || Number.isNaN(surface)) return null;
  return Math.round(surface);
}

export function formatApartmentTitle(apt: {
  type_bien: string;
  surface_m2: number | null;
  nb_pieces?: number | null;
}): string {
  const type = apt.type_bien || "Bien";
  const parts = [type];

  // Ajoute le T (nombre de pièces) si disponible
  if (apt.nb_pieces != null && apt.nb_pieces > 0) {
    parts.push(`T${apt.nb_pieces}`);
  }

  // Ajoute la surface arrondie si disponible
  if (apt.surface_m2 != null) {
    const rounded = roundSurface(apt.surface_m2);
    parts.push(`${rounded}m²`);
  }

  return parts.join(" · ");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

/**
 * Remplace toute mention €/m² (ou €/m²/an, €/m²/mois) par la valeur
 * multipliée par la surface dans l'unité cible.
 *
 * Quand le texte contient déjà la conversion ("X €/m², soit Y €/mois"),
 * on garde uniquement la partie convertie.
 */
function replaceEurM2(text: string, surface: number, unit: "€/mois" | "€/an"): string {
  let t = text;
  const unitRe = unit.replace("/", "\\/");
  t = t.replace(
    new RegExp(`\\d+[.,]?\\d*\\s*[–-]\\s*\\d+[.,]?\\d*\\s*€\\/m²[^,]*,\\s*soit\\s+(\\d[\\d\\s]*[–-]\\s*\\d[\\d\\s]*${unitRe})`, "g"),
    "$1",
  );
  t = t.replace(
    new RegExp(`\\d+[.,]?\\d*\\s*€\\/m²[^,]*,\\s*soit\\s+(\\d[\\d\\s]*${unitRe})`, "g"),
    "$1",
  );
  t = t.replace(
    /(\d+[.,]?\d*)\s*[–-]\s*(\d+[.,]?\d*)\s*€\/m²[/\w]*/g,
    (_, a, b) => {
      const va = parseFloat(a.replace(",", "."));
      const vb = parseFloat(b.replace(",", "."));
      return `${Math.round(va * surface).toLocaleString("fr-FR")} – ${Math.round(vb * surface).toLocaleString("fr-FR")} ${unit}`;
    },
  );
  t = t.replace(
    /(\d+[.,]?\d*)\s*€\/m²[/\w]*/g,
    (_, v) => {
      const n = parseFloat(v.replace(",", "."));
      return `${Math.round(n * surface).toLocaleString("fr-FR")} ${unit}`;
    },
  );
  return t;
}

/**
 * Nettoyage commun à toute justification IA (loyer, charges, taxe foncière).
 * Double filet : appliqué au STOCKAGE (génération) ET à l'AFFICHAGE (données
 * anciennes déjà en base). Chaque règle compense une violation récurrente de
 * Gemini malgré les consignes dans le prompt :
 *  1. Convertit les €/m² dans l'unité cible (€/mois ou €/an)
 *  2. Supprime les formules de calcul (X * Y = Z, parenthèses arithmétiques)
 *  3. Supprime "Résultat : X €…" en fin de texte
 *  4. Remplace "moyenne nationale" par "moyenne locale"
 *  5. Groupe les milliers des MONTANTS (« 1551 € » → « 1 551 € »)
 *  6. Tronque à `maxPhrases` phrases
 */
export function sanitizeJustification(
  text: string,
  surface: number | null,
  unit: "€/mois" | "€/an",
  maxPhrases = 4,
): string {
  let t = text;
  if (surface != null && surface > 0) t = replaceEurM2(t, surface, unit);
  t = t.replace(/\([^)]*[×*÷/][^)]*\)/g, "");
  t = t.replace(/\d[\d\s.,]*[×*]\s*\d[\d\s.,]*\s*=\s*[\d\s.,]+\s*€?/g, "");
  t = t.replace(/\.?\s*Résultat\s*:\s*[\d\s ]+\s*€[^.]*\.?/gi, "");
  t = t.replace(/moyenne\s+nationale/gi, "moyenne locale");
  // Gemini écrit « 1551 € » aussi souvent que « 1 551 € ». Le groupage est
  // volontairement conditionné à un « € » qui SUIT : dans de la prose, un
  // nombre à 4 chiffres est tout aussi souvent une année (« interdit en 2028 »)
  // ou une référence, que grouper rendrait absurde. Un montant déjà groupé
  // contient une espace et ne rematche pas — pas de double application.
  t = t.replace(/(?<![\d.,])(\d{4,})(?=\s*€)/g, (m) => formatNombre(Number(m)));
  t = t.replace(/\s{2,}/g, " ").trim();
  const sentences = t.match(/[^.!]+[.!]+/g);
  if (sentences && sentences.length > maxPhrases) {
    t = sentences.slice(0, maxPhrases).join("").trim();
  }
  return t;
}

/** Date + heure, format FR courant ("08/07/2026 à 14:32"). */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const date = new Date(iso);
    const jour = new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
    const heure = new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
    return `${jour} à ${heure}`;
  } catch {
    return "—";
  }
}

export function formatNote(note: number): string {
  return Number.isInteger(note) ? String(note) : note.toFixed(1).replace(".", ",");
}
