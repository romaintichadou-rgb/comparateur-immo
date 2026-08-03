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
