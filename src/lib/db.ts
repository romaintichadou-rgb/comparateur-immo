import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import { Apartment, ApartmentInput, emptyApartment } from "./types";
import { AppSettings, DEFAULT_SETTINGS, type FinancementMode } from "./settings";

/**
 * Couche d'accès isolée à la source de données (Supabase/Postgres). Toute la
 * logique métier (calculs, badges "estimé"...) vit en dehors de ce module.
 * Les colonnes de la table `apartments` correspondent 1:1 aux champs de
 * `Apartment` (voir supabase/migrations/0001_init.sql) : pas de couche de
 * sérialisation manuelle, PostgREST fait le typage.
 */

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variable d'environnement manquante: ${name}. Voir .env.local.example pour la config Supabase.`
    );
  }
  return value;
}

let cachedClient: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = requiredEnv("SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return cachedClient;
}

export async function listApartments(): Promise<Apartment[]> {
  const { data, error } = await getClient()
    .from("apartments")
    .select("*")
    .order("date_ajout", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Apartment[];
}

export async function getApartment(id: string): Promise<Apartment | null> {
  const { data, error } = await getClient()
    .from("apartments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Apartment | null;
}

export async function createApartment(input: Partial<Apartment>): Promise<Apartment> {
  const apt: Apartment = {
    ...emptyApartment(),
    ...input,
    id: uuidv4(),
    date_ajout: new Date().toISOString(),
  } as Apartment;

  const { data, error } = await getClient().from("apartments").insert(apt).select().single();
  if (error) throw new Error(error.message);
  return data as Apartment;
}

export async function updateApartment(id: string, patch: Partial<Apartment>): Promise<Apartment> {
  const { data, error } = await getClient()
    .from("apartments")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Appartement introuvable: ${id}`);
  return data as Apartment;
}

export async function deleteApartment(id: string): Promise<void> {
  const { error } = await getClient().from("apartments").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// --- Réglages (seuils + profil emprunteur) : une seule ligne, id fixe. ---

interface SettingsRow {
  id: number;
  rendement_seuil_vert_pct: number;
  rendement_seuil_rouge_pct: number;
  cashflow_seuil_vert_euros: number;
  cashflow_seuil_rouge_euros: number;
  // Ajoutées par la migration 0006 — absentes tant qu'elle n'est pas exécutée.
  taux_credit_pct?: number | null;
  duree_annees?: number | null;
  taux_assurance_pct?: number | null;
  tmi_pct?: number | null;
  financement_mode?: FinancementMode | null;
}

/**
 * Les colonnes du profil emprunteur retombent sur `DEFAULT_SETTINGS` quand elles
 * sont absentes ou nulles. Les migrations de ce projet sont exécutées À LA MAIN
 * sur chaque projet Supabase : sans ce filet, lancer l'app avant d'avoir appliqué
 * la 0006 propagerait des `undefined` jusque dans `simulate()` — donc des `NaN`
 * dans toute la simulation, au lieu de simplement retomber sur les défauts.
 */
function rowToSettings(row: SettingsRow | null): AppSettings {
  if (!row) return DEFAULT_SETTINGS;
  return {
    rendementSeuilVertPct: row.rendement_seuil_vert_pct,
    rendementSeuilRougePct: row.rendement_seuil_rouge_pct,
    cashflowSeuilVertEuros: row.cashflow_seuil_vert_euros,
    cashflowSeuilRougeEuros: row.cashflow_seuil_rouge_euros,
    tauxCreditPct: row.taux_credit_pct ?? DEFAULT_SETTINGS.tauxCreditPct,
    dureeAnnees: row.duree_annees ?? DEFAULT_SETTINGS.dureeAnnees,
    tauxAssurancePct: row.taux_assurance_pct ?? DEFAULT_SETTINGS.tauxAssurancePct,
    tmiPct: row.tmi_pct ?? DEFAULT_SETTINGS.tmiPct,
    financementMode: row.financement_mode ?? DEFAULT_SETTINGS.financementMode,
  };
}

export async function getSettings(): Promise<AppSettings> {
  const { data, error } = await getClient()
    .from("app_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return rowToSettings(data as SettingsRow | null);
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const updated: AppSettings = { ...current, ...patch };

  const { error } = await getClient()
    .from("app_settings")
    .upsert({
      id: 1,
      rendement_seuil_vert_pct: updated.rendementSeuilVertPct,
      rendement_seuil_rouge_pct: updated.rendementSeuilRougePct,
      cashflow_seuil_vert_euros: updated.cashflowSeuilVertEuros,
      cashflow_seuil_rouge_euros: updated.cashflowSeuilRougeEuros,
      taux_credit_pct: updated.tauxCreditPct,
      duree_annees: updated.dureeAnnees,
      taux_assurance_pct: updated.tauxAssurancePct,
      tmi_pct: updated.tmiPct,
      financement_mode: updated.financementMode,
    });
  if (error) throw new Error(error.message);

  return updated;
}

// Ré-export pratique pour les routes API.
export type { ApartmentInput };
