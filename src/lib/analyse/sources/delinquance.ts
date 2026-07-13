/**
 * Source de faits réels : bases statistiques communales de la délinquance
 * enregistrée (SSMSI, ministère de l'Intérieur), via l'API tabulaire de
 * data.gouv.fr. Taux pour mille habitants par indicateur et par an, par
 * commune (CODGEO). Permet de situer la sécurité du secteur et, pour
 * Paris/Lyon/Marseille, de comparer l'arrondissement à la moyenne de la ville.
 */

import { memoAsync } from "./memo";

const RID = "44ef4323-1097-48d5-8719-3c544b55d294";
const BASE = `https://tabular-api.data.gouv.fr/api/resources/${RID}/data/`;

export interface Indicateur {
  label: string;
  taux: number; // pour mille habitants
  nombre: number;
}

export interface DelinquanceData {
  annee: number;
  population: number;
  indicateurs: Indicateur[];
  /** Somme des taux "atteintes aux biens" (vols, cambriolages, dégradations). */
  tauxAtteintesBiens: number;
}

interface Row {
  annee?: number;
  indicateur?: string;
  taux_pour_mille?: number;
  nombre?: number;
  insee_pop?: number;
}

export const fetchDelinquance = memoAsync(
  fetchDelinquanceRaw,
  (codeInsee) => codeInsee,
  (r) => r != null
);

async function fetchDelinquanceRaw(codeInsee: string): Promise<DelinquanceData | null> {
  if (!codeInsee) return null;

  // Tri décroissant par année + page_size borné (l'API plafonne au-delà de
  // ~100) : les premières lignes couvrent la ou les années les plus récentes,
  // dont on extrait ensuite la plus récente complète.
  const url = `${BASE}?CODGEO_2025__exact=${encodeURIComponent(codeInsee)}&annee__sort=desc&page_size=50`;
  const raw = await fetchJson(url);
  const rows = (raw?.data ?? []) as Row[];
  if (rows.length === 0) return null;

  const anneeMax = Math.max(...rows.map((r) => Number(r.annee) || 0));
  if (!anneeMax) return null;

  const recentes = rows.filter((r) => Number(r.annee) === anneeMax && r.indicateur);
  if (recentes.length === 0) return null;

  const indicateurs: Indicateur[] = recentes.map((r) => ({
    label: r.indicateur as string,
    taux: Number(r.taux_pour_mille) || 0,
    nombre: Number(r.nombre) || 0,
  }));

  const tauxAtteintesBiens = indicateurs
    .filter((i) => /vol|cambriolage|d[ée]gradation|destruction/i.test(i.label))
    .reduce((s, i) => s + i.taux, 0);

  return {
    annee: anneeMax,
    population: Number(recentes[0].insee_pop) || 0,
    indicateurs,
    tauxAtteintesBiens: Math.round(tauxAtteintesBiens * 10) / 10,
  };
}

/**
 * Code commune "parent" pour les arrondissements de Paris/Lyon/Marseille,
 * afin de comparer le micro-quartier à la moyenne de la ville. null sinon.
 */
export function parentPLM(codeInsee: string): string | null {
  if (/^751\d\d$/.test(codeInsee)) return "75056"; // Paris
  if (/^6938\d$/.test(codeInsee)) return "69123"; // Lyon
  if (/^132\d\d$/.test(codeInsee)) return "13055"; // Marseille
  return null;
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
