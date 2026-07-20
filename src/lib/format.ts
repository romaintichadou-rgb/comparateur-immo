export function formatEuros(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("fr-FR").format(value);
}

/**
 * Libellé d'affichage d'un bien (le champ titre a été retiré du modèle :
 * on compose un nom lisible à partir du type de bien et de la localisation).
 */
export function formatApartmentLabel(apt: {
  type_bien: string;
  surface_m2: number | null;
  adresse: string;
  quartier: string;
  ville: string;
}): string {
  const type = apt.type_bien || "Bien";
  const surface = apt.surface_m2 != null ? ` ${apt.surface_m2}m²` : "";
  const lieu = apt.adresse || [apt.quartier, apt.ville].filter(Boolean).join(", ");
  return lieu ? `${type}${surface} — ${lieu}` : `${type}${surface}`;
}

/**
 * Titre court d'un bien (type + surface), sans la localisation — utilisé
 * là où l'adresse doit apparaître séparément, en sous-titre.
 */
export function formatApartmentTitle(apt: {
  type_bien: string;
  surface_m2: number | null;
}): string {
  const type = apt.type_bien || "Bien";
  const surface = apt.surface_m2 != null ? ` ${apt.surface_m2}m²` : "";
  return `${type}${surface}`;
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
 *  5. Tronque à `maxPhrases` phrases
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
