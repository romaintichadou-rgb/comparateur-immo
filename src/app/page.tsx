import { listApartments, getSettings } from "@/lib/sheets";
import { computeDerived } from "@/lib/calculations";
import { seuilsRendementFromSettings } from "@/lib/analyse/scoring";
import HomeView from "@/components/HomeView";
import SetupNotice from "@/components/SetupNotice";

export default async function HomePage() {
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
