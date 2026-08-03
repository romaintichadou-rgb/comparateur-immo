"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Server Actions d'authentification.
 *
 * Pourquoi des Server Actions plutôt qu'un composant client qui appellerait
 * `supabase.auth` depuis le navigateur : une Server Action a le droit d'écrire
 * des cookies (un Server Component non — voir `lib/supabase/server.ts`), donc
 * la session est posée côté serveur, immédiatement lisible par le rendu qui
 * suit. Un formulaire HTML classique fonctionne aussi sans JavaScript.
 */

export interface EtatAuth {
  erreur?: string;
  message?: string;
}

/** Destination après connexion : `?suivant=` posé par le proxy, sinon l'accueil. */
function destination(suivant: FormDataEntryValue | null): string {
  const s = typeof suivant === "string" ? suivant : "";
  // N'accepter qu'un chemin interne : une URL absolue ouvrirait une
  // redirection ouverte (`?suivant=https://site-malveillant`), qui donne à un
  // lien d'apparence légitime le pouvoir d'envoyer ailleurs après connexion.
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function connexion(_precedent: EtatAuth, formData: FormData): Promise<EtatAuth> {
  const email = String(formData.get("email") ?? "").trim();
  const motDePasse = String(formData.get("motDePasse") ?? "");

  if (!email || !motDePasse) {
    return { erreur: "Renseigne ton email et ton mot de passe." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });

  if (error) {
    // Message volontairement identique pour « email inconnu » et « mauvais mot
    // de passe » : les distinguer permettrait de découvrir quelles adresses
    // ont un compte ici.
    return { erreur: "Email ou mot de passe incorrect." };
  }

  revalidatePath("/", "layout");
  redirect(destination(formData.get("suivant")));
}

export async function inscription(_precedent: EtatAuth, formData: FormData): Promise<EtatAuth> {
  const email = String(formData.get("email") ?? "").trim();
  const motDePasse = String(formData.get("motDePasse") ?? "");

  if (!email || !motDePasse) {
    return { erreur: "Renseigne ton email et ton mot de passe." };
  }
  if (motDePasse.length < 8) {
    return { erreur: "Le mot de passe doit faire au moins 8 caractères." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password: motDePasse });

  if (error) {
    return { erreur: error.message };
  }

  // Selon le réglage « Confirm email » du projet Supabase, l'inscription
  // ouvre soit une session immédiate, soit une attente de confirmation. Les
  // deux cas sont légitimes — on les distingue par la présence d'une session
  // plutôt que par une supposition sur la configuration.
  if (!data.session) {
    return { message: `Compte créé. Ouvre le lien de confirmation envoyé à ${email}.` };
  }

  revalidatePath("/", "layout");
  redirect(destination(formData.get("suivant")));
}

export async function deconnexion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function motDePasseOublie(_precedent: EtatAuth, formData: FormData): Promise<EtatAuth> {
  const email = String(formData.get("email") ?? "").trim();
  const origin = String(formData.get("origin") ?? "").trim();
  if (!email) return { erreur: "Renseigne ton adresse email." };

  const baseUrl = origin || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${baseUrl}/auth/callback?next=/compte`,
  });

  if (error) {
    if (/rate.?limit/i.test(error.message)) {
      return { erreur: "Trop de demandes d'email. Réessaie dans une heure." };
    }
    return { erreur: error.message };
  }

  return { message: `Si un compte existe pour ${email}, un lien de réinitialisation vient d'être envoyé.` };
}

export async function changerMotDePasse(_precedent: EtatAuth, formData: FormData): Promise<EtatAuth> {
  const motDePasse = String(formData.get("motDePasse") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (!motDePasse) return { erreur: "Saisis un nouveau mot de passe." };
  if (motDePasse.length < 8) return { erreur: "Le mot de passe doit faire au moins 8 caractères." };
  if (motDePasse !== confirmation) return { erreur: "Les deux mots de passe ne correspondent pas." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: motDePasse });

  if (error) return { erreur: error.message };
  return { message: "Mot de passe modifié." };
}

export async function supprimerCompte(): Promise<EtatAuth> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erreur: "Session expirée." };

  // La suppression d'un utilisateur Supabase Auth requiert la service_role key.
  // `on delete cascade` sur profiles/apartments nettoie toutes les données.
  const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${adminUrl}/auth/v1/admin/users/${user.id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${adminKey}`,
      apikey: adminKey,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { erreur: body.message ?? "Erreur lors de la suppression du compte." };
  }

  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
