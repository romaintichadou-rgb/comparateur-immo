/**
 * Source de faits réels : bases statistiques communales de la délinquance
 * enregistrée (SSMSI, ministère de l'Intérieur), via l'API tabulaire de
 * data.gouv.fr. Taux pour mille habitants par indicateur et par an, par
 * commune (CODGEO). Permet de situer la sécurité du secteur et, pour
 * Paris/Lyon/Marseille, de comparer l'arrondissement à la moyenne de la ville.
 */

import { getJson } from "./http";

const RID = "44ef4323-1097-48d5-8719-3c544b55d294";
const BASE = `https://tabular-api.data.gouv.fr/api/resources/${RID}/data/`;

/**
 * ⚠️ **La colonne du code commune porte le millésime du découpage INSEE et est
 * RENOMMÉE à chaque édition annuelle du jeu** (`CODGEO_2025` → `CODGEO_2026`…).
 * L'API répond alors 400 « column … does not exist », que la source traduit en
 * `null` : le bloc Potentiel perd sa composante sécurité **sans aucune erreur
 * visible**, et le seul symptôme est un fait qui disparaît de l'analyse.
 * Constaté en août 2026, la colonne étant restée sur `CODGEO_2025`.
 *
 * Vérification (les colonnes réelles du jeu sont publiques) :
 * `curl -s https://tabular-api.data.gouv.fr/api/resources/${RID}/profile/`
 *
 * Pas de repli automatique sur le millésime précédent : il ajouterait une
 * requête vouée à l'échec à chaque analyse le reste de l'année, pour un
 * renommage qui survient une fois par an.
 */
const COL_CODGEO = "CODGEO_2026";

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

export async function fetchDelinquance(codeInsee: string): Promise<DelinquanceData | null> {
  if (!codeInsee) return null;

  // Tri décroissant par année + page_size borné (l'API plafonne au-delà de
  // ~100) : les premières lignes couvrent la ou les années les plus récentes,
  // dont on extrait ensuite la plus récente complète.
  const url = `${BASE}?${COL_CODGEO}__exact=${encodeURIComponent(codeInsee)}&annee__sort=desc&page_size=50`;
  const raw = await getJson<{ data?: unknown[] }>(url, { timeoutMs: 15000 });
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
