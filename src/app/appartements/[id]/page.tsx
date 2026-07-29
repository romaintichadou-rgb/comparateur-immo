import { notFound } from "next/navigation";
import { getApartment, getSettings } from "@/lib/db";
import { computeDerived } from "@/lib/calculations";
import ApartmentDetail from "@/components/ApartmentDetail";
import SetupNotice from "@/components/SetupNotice";

export default async function ApartmentPage({
  params,
  searchParams,
}: PageProps<"/appartements/[id]">) {
  const { id } = await params;
  const sp = await searchParams;

  let apartment;
  let settings;
  try {
    [apartment, settings] = await Promise.all([getApartment(id), getSettings()]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    // Réservé aux vraies erreurs de config (voir requiredEnv() dans db.ts) —
    // pas au fourre-tout de toute erreur de fetch, sinon un ID malformé ou un
    // aléa réseau affiche un message Postgres brut sous un titre "config
    // Supabase requise" qui n'a aucun sens pour un utilisateur en prod.
    if (message.startsWith("Variable d'environnement manquante")) {
      return <SetupNotice message={message} />;
    }
    // ID malformé (lien tronqué/copié) : Postgrest rejette avant même de
    // chercher la ligne. Pour l'utilisateur, c'est équivalent à "introuvable".
    if (message.includes("invalid input syntax for type uuid")) notFound();
    // Toute autre erreur (réseau, DB indisponible) : remonte vers error.tsx —
    // écran stylé avec bouton Réessayer, plutôt qu'un message technique.
    throw err;
  }

  if (!apartment) notFound();

  const initialTab = typeof sp?.tab === "string" ? sp.tab : undefined;
  const initialEdit = sp?.edit === "1";

  return (
    <ApartmentDetail
      apartment={computeDerived(apartment)}
      settings={settings}
      initialTab={initialTab}
      initialEdit={initialEdit}
    />
  );
}
