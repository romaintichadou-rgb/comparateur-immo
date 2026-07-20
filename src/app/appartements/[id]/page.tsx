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
    return (
      <SetupNotice message={err instanceof Error ? err.message : "Erreur inconnue"} />
    );
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
