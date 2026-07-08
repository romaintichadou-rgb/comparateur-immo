import { parentPLM } from "./delinquance";

/**
 * Sources de faits réels : deux jeux de données data.gouv.fr (API tabulaire),
 * pour donner une idée du "standing" et du caractère du quartier à quelqu'un
 * qui ne le connaît pas :
 *  - Revenu médian disponible par UC (Filosofi/INSEE, via le dataset "Revenu
 *    des français à la commune") — disponible au niveau de l'arrondissement
 *    pour Paris/Lyon/Marseille, donc interrogé avec le code INSEE du bien
 *    directement (plus précis que la moyenne ville).
 *  - Population et densité de la commune (dataset "Communes et villes de
 *    France") — UNIQUEMENT au niveau commune (pas d'arrondissement dans ce
 *    fichier), donc interrogé avec le code parent pour Paris/Lyon/Marseille.
 *
 * Ce que ces deux jeux de données NE contiennent PAS (vérifié) : répartition
 * par âge, taille des ménages, taux de propriétaires. On ne les affiche donc
 * jamais — pas d'estimation qui masquerait une donnée absente.
 */

const RID_REVENU = "516130bc-4dcb-47f5-8347-ae96553c43ab";
const RID_COMMUNE = "c63fd0b1-7987-46f6-b779-8b3ed889090c";
const COL_REVENU_CODE = "Code géographique";
const COL_REVENU_MEDIANE = "[DISP] Médiane (€)";

export interface RevenuCommune {
  medianeDisponible: number; // €/an par unité de consommation
}

export async function fetchRevenuMedian(codeInsee: string): Promise<RevenuCommune | null> {
  if (!codeInsee) return null;
  const url =
    `https://tabular-api.data.gouv.fr/api/resources/${RID_REVENU}/data/` +
    `?${encodeURIComponent(`${COL_REVENU_CODE}__exact`)}=${encodeURIComponent(codeInsee)}`;
  const raw = await fetchJson(url);
  const row = raw?.data?.[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const mediane = Number(row[COL_REVENU_MEDIANE]);
  if (!Number.isFinite(mediane) || mediane <= 0) return null;
  return { medianeDisponible: Math.round(mediane) };
}

export interface ProfilCommune {
  population: number;
  densite: number; // habitants/km²
  typologie: string; // ex. "Grands centres urbains", "Rural autonome peu dense"
}

export async function fetchProfilCommune(codeInsee: string): Promise<ProfilCommune | null> {
  const codeParent = parentPLM(codeInsee) ?? codeInsee;
  if (!codeParent) return null;
  const url = `https://tabular-api.data.gouv.fr/api/resources/${RID_COMMUNE}/data/?code_insee__exact=${encodeURIComponent(codeParent)}`;
  const raw = await fetchJson(url);
  const row = raw?.data?.[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const population = Number(row.population);
  const densite = Number(row.densite);
  const typologie = typeof row.grille_densite_texte === "string" ? row.grille_densite_texte : "";
  if (!Number.isFinite(population) || !Number.isFinite(densite)) return null;
  return { population: Math.round(population), densite: Math.round(densite), typologie };
}

async function fetchJson(url: string, timeoutMs = 15000): Promise<{ data?: unknown[] } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as { data?: unknown[] };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
