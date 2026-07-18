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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
