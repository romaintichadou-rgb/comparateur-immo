import { notFound } from "next/navigation";
import { getApartment, getSettings } from "@/lib/sheets";
import { computeDerived } from "@/lib/calculations";
import ApartmentDetail from "@/components/ApartmentDetail";
import SetupNotice from "@/components/SetupNotice";

export default async function ApartmentPage({
  params,
}: PageProps<"/appartements/[id]">) {
  const { id } = await params;

  let apartment;
  let settings;
  try {
    [apartment, settings] = await Promise.all([getApartment(id), getSettings()]);
  } catch (err) {
    return (
      <SetupNotice message={err instanceof Error ? err.message : "Erreur inconnue"} />
    );
  }

  if (!apartment) notFound();
  return <ApartmentDetail apartment={computeDerived(apartment)} settings={settings} />;
}
