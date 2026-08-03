import { listApartments, getSettings } from "@/lib/db";
import { computeDerived } from "@/lib/calculations";
import { seuilsRendementFromSettings } from "@/lib/analyse/scoring";
import { requireSession } from "@/lib/auth";
import HomeView from "@/components/HomeView";
import SetupNotice from "@/components/SetupNotice";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Redirige vers /login AVANT le try/catch : sans cet appel, une session
  // expirée ferait remonter `NonAuthentifieError` jusqu'au catch ci-dessous,
  // qui afficherait « config Supabase requise » — un diagnostic faux, qui
  // enverrait chercher une panne d'environnement là où il suffit de se
  // reconnecter. Le proxy couvre déjà ce cas ; ceci couvre l'expiration
  // survenue entre le proxy et le rendu.
  await requireSession();

  let apartments;
  let seuils;
  try {
    [apartments, seuils] = await Promise.all([
      listApartments().then((rows) => rows.map(computeDerived)),
      getSettings().then(seuilsRendementFromSettings),
    ]);
  } catch (err) {
    return (
      <SetupNotice message={err instanceof Error ? err.message : "Erreur inconnue"} />
    );
  }

  return <HomeView apartments={apartments} seuilsRendement={seuils} />;
}
