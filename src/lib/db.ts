import "server-only";

import { v4 as uuidv4 } from "uuid";
import { Apartment, ApartmentInput, emptyApartment } from "./types";
import { AppSettings, DEFAULT_SETTINGS, type FinancementMode } from "./settings";
import { createClient } from "./supabase/server";
import { requireUserId } from "./auth";

/**
 * Data Access Layer — couche d'accès isolée à Supabase/Postgres, ET point de
 * contrôle du cloisonnement entre comptes. Toute la logique métier (calculs,
 * badges "estimé"...) vit en dehors de ce module. Les colonnes de la table
 * `apartments` correspondent 1:1 aux champs de `Apartment` (voir
 * supabase/migrations/0001_init.sql) : pas de couche de sérialisation
 * manuelle, PostgREST fait le typage.
 *
 * ── Deux barrières, pas une ──────────────────────────────────────────────
 *
 * 1. **Le client est celui de la SESSION** (`supabase/server.ts`), plus le
 *    singleton `service_role`. Les policies RLS de la migration 0008
 *    s'appliquent donc réellement : Postgres refuse de lui-même la ligne d'un
 *    autre compte.
 * 2. **Chaque requête filtre malgré tout sur `user_id`.** Redondant avec RLS
 *    — volontairement. Une policy désactivée par erreur dans le dashboard, et
 *    le filtre applicatif tient encore ; un filtre oublié, et RLS tient
 *    encore. C'est le seul endroit du projet où l'on paie une redondance de
 *    plein gré, parce que le mode d'échec est une fuite de données
 *    personnelles.
 *
 * ⚠️ La `service_role` key n'est PLUS utilisée ici. Ne pas la réintroduire
 * pour « simplifier » ou contourner un souci de policy : elle contourne RLS
 * par design et supprimerait la première des deux barrières.
 */

/** Client Supabase porteur de la session + identifiant de l'appelant. */
async function contexte() {
  // `requireUserId()` lève `NonAuthentifieError` s'il n'y a pas de session :
  // aucune fonction de ce module ne peut donc s'exécuter anonymement.
  const [supabase, userId] = await Promise.all([createClient(), requireUserId()]);
  return { supabase, userId };
}

export async function listApartments(): Promise<Apartment[]> {
  const { supabase, userId } = await contexte();
  const { data, error } = await supabase
    .from("apartments")
    .select("*")
    .eq("user_id", userId)
    .order("date_ajout", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Apartment[];
}

/**
 * Renvoie `null` aussi bien pour un bien inexistant que pour le bien d'un
 * AUTRE compte — les deux cas sont indistinguables de l'extérieur, et c'est
 * voulu : répondre « ce bien existe mais n'est pas à toi » confirmerait
 * l'existence d'un identifiant à qui le devine.
 */
export async function getApartment(id: string): Promise<Apartment | null> {
  const { supabase, userId } = await contexte();
  const { data, error } = await supabase
    .from("apartments")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Apartment | null;
}

export async function createApartment(input: Partial<Apartment>): Promise<Apartment> {
  const { supabase, userId } = await contexte();

  const apt: Apartment = {
    ...emptyApartment(),
    ...input,
    id: uuidv4(),
    date_ajout: new Date().toISOString(),
    // Écrit APRÈS l'étalement de `input` : un payload client qui contiendrait
    // un `user_id` ne peut donc pas s'attribuer le bien d'un autre compte.
    // L'ordre de ces lignes est une règle de sécurité, pas un style.
    user_id: userId,
  } as Apartment;

  const { data, error } = await supabase.from("apartments").insert(apt).select().single();
  if (error) throw new Error(error.message);
  return data as Apartment;
}

export async function updateApartment(id: string, patch: Partial<Apartment>): Promise<Apartment> {
  const { supabase, userId } = await contexte();

  // `user_id` est retiré du patch : le propriétaire d'un bien ne se change pas
  // par une requête de mise à jour.
  const { user_id: _ignore, ...patchSansProprietaire } = patch;

  const { data, error } = await supabase
    .from("apartments")
    .update(patchSansProprietaire)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  // Sans correspondance : bien inexistant OU appartenant à un autre compte.
  if (!data) throw new Error(`Appartement introuvable: ${id}`);
  return data as Apartment;
}

/**
 * Supprime un bien du compte courant.
 *
 * @returns `false` si rien n'a été supprimé — bien inexistant ou appartenant à
 * un autre compte. Sans ce retour, la suppression filtrée ne touche aucune
 * ligne mais ne lève aucune erreur : l'API répondait « ok » à un appel qui
 * n'avait rien fait, là où `getApartment()` et `updateApartment()` répondent
 * 404 sur le même bien. Incohérence relevée en testant un compte tiers.
 */
export async function deleteApartment(id: string): Promise<boolean> {
  const { supabase, userId } = await contexte();
  const { data, error } = await supabase
    .from("apartments")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

// --- Réglages (seuils + profil emprunteur) : une seule ligne, id fixe. ---

interface SettingsRow {
  /** Clé historique de la ligne unique. Supprimée par la migration 0009, d'où
   * l'optionnalité : le code ne doit plus s'en servir. */
  id?: number;
  user_id: string;
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

/**
 * Réglages du compte courant.
 *
 * Un compte sans ligne de réglages retombe sur `DEFAULT_SETTINGS` via
 * `rowToSettings(null)` — c'est le cas des comptes créés entre les migrations
 * 0008 et 0009, le trigger d'inscription ne provisionnant `app_settings`
 * qu'à partir de la 0009. La première sauvegarde crée la ligne.
 */
export async function getSettings(): Promise<AppSettings> {
  const { supabase, userId } = await contexte();
  const { data, error } = await supabase
    .from("app_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return rowToSettings(data as SettingsRow | null);
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const { supabase, userId } = await contexte();

  const current = await getSettings();
  const updated: AppSettings = { ...current, ...patch };

  // `onConflict: "user_id"` : sans cette précision, PostgREST arbitre le
  // conflit sur la clé primaire. Tant que la 0009 n'est pas passée, celle-ci
  // est encore `id` — l'upsert insérerait alors une seconde ligne pour le même
  // compte au lieu de mettre à jour la sienne.
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      {
        user_id: userId,
        rendement_seuil_vert_pct: updated.rendementSeuilVertPct,
        rendement_seuil_rouge_pct: updated.rendementSeuilRougePct,
        cashflow_seuil_vert_euros: updated.cashflowSeuilVertEuros,
        cashflow_seuil_rouge_euros: updated.cashflowSeuilRougeEuros,
        taux_credit_pct: updated.tauxCreditPct,
        duree_annees: updated.dureeAnnees,
        taux_assurance_pct: updated.tauxAssurancePct,
        tmi_pct: updated.tmiPct,
        financement_mode: updated.financementMode,
      },
      { onConflict: "user_id" }
    );
  if (error) throw new Error(error.message);

  return updated;
}

// --- Profil utilisateur ---

export interface UserProfile {
  plan: "free" | "pro" | "tester";
  nombreBiens: number;
  analysesAuMoisCourant: number;
  periodeCmpteur: string; // ISO date YYYY-MM-01
}

/**
 * Retourne les données de profil de l'utilisateur connecté :
 * plan (gratuit/pro/testeur), nombre de biens, analyses ce mois.
 */
export async function getUserProfile(): Promise<UserProfile> {
  const { supabase, userId } = await contexte();

  // Récupérer le plan et le compteur d'analyses
  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select("plan, analyses_ce_mois, periode_compteur")
    .eq("id", userId)
    .single();

  if (profileError) throw new Error(profileError.message);

  // Compter les biens
  const { count: nombreBiens, error: countError } = await supabase
    .from("apartments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (countError) throw new Error(countError.message);

  return {
    plan: profileRow.plan ?? "free",
    nombreBiens: nombreBiens ?? 0,
    analysesAuMoisCourant: profileRow.analyses_ce_mois ?? 0,
    periodeCmpteur: profileRow.periode_compteur ?? new Date().toISOString().slice(0, 7) + "-01",
  };
}

// Ré-export pratique pour les routes API.
export type { ApartmentInput };
