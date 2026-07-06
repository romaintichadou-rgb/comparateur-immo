/**
 * Source de faits réels : API Géorisques (georisques.gouv.fr), publique et
 * gratuite. Aléas naturels et technologiques par coordonnées / code INSEE.
 * Tout est défensif : chaque sous-appel échoue silencieusement (→ null) sans
 * bloquer les autres, car aucune de ces données n'est garantie présente.
 */

const BASE = "https://georisques.gouv.fr/api/v1";

export interface GeorisquesData {
  /** Retrait-gonflement des argiles (aléa point précis). */
  argiles: { code: string; libelle: string } | null;
  /** Potentiel radon de la commune (classe 1 à 3). */
  radon: { classe: string } | null;
  /** Zonage sismique (1 très faible → 5 fort). */
  sismique: { code: string; libelle: string } | null;
  /** Libellés des risques recensés sur la commune (catégories parentes). */
  risquesCommune: string[];
}

async function fetchJson(url: string, timeoutMs = 12000): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchGeorisques(params: {
  lat: number;
  lon: number;
  codeInsee: string;
}): Promise<GeorisquesData> {
  const { lat, lon, codeInsee } = params;
  // Géorisques attend latlon au format "lon,lat".
  const latlon = `${lon},${lat}`;

  const [argilesRaw, radonRaw, sismiqueRaw, gasparRaw] = await Promise.all([
    fetchJson(`${BASE}/rga?latlon=${latlon}`),
    codeInsee ? fetchJson(`${BASE}/radon?code_insee=${codeInsee}`) : Promise.resolve(null),
    fetchJson(`${BASE}/zonage_sismique?latlon=${latlon}`),
    fetchJson(`${BASE}/gaspar/risques?latlon=${latlon}`),
  ]);

  return {
    argiles: parseArgiles(argilesRaw),
    radon: parseRadon(radonRaw),
    sismique: parseSismique(sismiqueRaw),
    risquesCommune: parseGaspar(gasparRaw),
  };
}

function parseArgiles(raw: unknown): GeorisquesData["argiles"] {
  const o = raw as { codeExposition?: string; exposition?: string } | null;
  if (!o || !o.exposition) return null;
  return { code: String(o.codeExposition ?? ""), libelle: o.exposition };
}

function parseRadon(raw: unknown): GeorisquesData["radon"] {
  const o = raw as { data?: Array<{ classe_potentiel?: string }> } | null;
  const classe = o?.data?.[0]?.classe_potentiel;
  return classe ? { classe: String(classe) } : null;
}

function parseSismique(raw: unknown): GeorisquesData["sismique"] {
  const o = raw as { data?: Array<{ code_zone?: string; zone_sismicite?: string }> } | null;
  const item = o?.data?.[0];
  if (!item?.zone_sismicite) return null;
  return { code: String(item.code_zone ?? ""), libelle: item.zone_sismicite };
}

function parseGaspar(raw: unknown): string[] {
  const o = raw as {
    data?: Array<{ risques_detail?: Array<{ num_risque?: string; libelle_risque_long?: string }> }>;
  } | null;
  const detail = o?.data?.[0]?.risques_detail ?? [];
  // num_risque à 2 chiffres = catégorie parente (Inondation, Séisme...) ;
  // 3 chiffres = sous-type détaillé, qu'on n'affiche pas pour rester lisible.
  const parents = detail
    .filter((r) => (r.num_risque ?? "").length <= 2 && r.libelle_risque_long)
    .map((r) => r.libelle_risque_long as string);
  return Array.from(new Set(parents));
}
