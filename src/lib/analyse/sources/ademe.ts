/**
 * Source de faits réels : Observatoire DPE de l'ADEME (data.ademe.fr),
 * open data gratuit. On récupère les DPE réellement établis à l'adresse via
 * l'identifiant BAN (jointure exacte), puis on retient celui dont la surface
 * colle le mieux à celle du bien — c'est le DPE réel du logement, pas une
 * estimation. Permet aussi de détecter une incohérence avec le DPE saisi.
 */

// Dataset "DPE Logements existants (depuis juillet 2021)" — ~15M lignes.
const DATASET = "meg-83tjwtg8dyz4vv7h1dqe";
const BASE = `https://data.ademe.fr/data-fair/api/v1/datasets/${DATASET}/lines`;

export interface DpeRecord {
  etiquette_dpe: string;
  etiquette_ges: string;
  surface: number | null;
  date: string;
  type_batiment: string;
  adresse: string;
}

export interface DpeData {
  /** Tous les DPE trouvés à cette adresse (peut concerner plusieurs lots). */
  records: DpeRecord[];
  /** DPE dont la surface colle le mieux au bien (± tolérance), sinon null. */
  meilleurMatch: DpeRecord | null;
}

interface AdemeLine {
  etiquette_dpe?: string;
  etiquette_ges?: string;
  surface_habitable_logement?: number;
  date_etablissement_dpe?: string;
  type_batiment?: string;
  adresse_ban?: string;
}

export async function fetchDpe(params: {
  banId: string;
  surface: number | null;
}): Promise<DpeData> {
  const { banId, surface } = params;
  if (!banId) return { records: [], meilleurMatch: null };

  const select = [
    "etiquette_dpe",
    "etiquette_ges",
    "surface_habitable_logement",
    "date_etablissement_dpe",
    "type_batiment",
    "adresse_ban",
  ].join(",");
  const url =
    `${BASE}?qs=identifiant_ban:%22${encodeURIComponent(banId)}%22` +
    `&size=50&select=${select}&sort=-date_etablissement_dpe`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let raw: { results?: AdemeLine[] } | null = null;
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.ok) raw = (await res.json()) as { results?: AdemeLine[] };
  } catch {
    raw = null;
  } finally {
    clearTimeout(timer);
  }

  const records: DpeRecord[] = (raw?.results ?? [])
    .filter((r) => r.etiquette_dpe)
    .map((r) => ({
      etiquette_dpe: r.etiquette_dpe ?? "",
      etiquette_ges: r.etiquette_ges ?? "",
      surface: typeof r.surface_habitable_logement === "number" ? r.surface_habitable_logement : null,
      date: r.date_etablissement_dpe ?? "",
      type_batiment: r.type_batiment ?? "",
      adresse: r.adresse_ban ?? "",
    }));

  return { records, meilleurMatch: pickBySurface(records, surface) };
}

/**
 * Choisit le DPE dont la surface est la plus proche (tolérance ~8 m² ou 12 %)
 * de celle du bien. Sans surface connue, retient le plus récent (records est
 * déjà trié décroissant par date). Retourne null si aucun ne colle, pour ne
 * jamais attribuer au bien un DPE d'un autre lot du même immeuble.
 */
function pickBySurface(records: DpeRecord[], surface: number | null): DpeRecord | null {
  if (records.length === 0) return null;
  if (surface == null) return records[0];

  const tolerance = Math.max(8, surface * 0.12);
  let best: DpeRecord | null = null;
  let bestEcart = Infinity;
  for (const r of records) {
    if (r.surface == null) continue;
    const ecart = Math.abs(r.surface - surface);
    if (ecart < bestEcart) {
      bestEcart = ecart;
      best = r;
    }
  }
  return best && bestEcart <= tolerance ? best : null;
}
