import { getSettings } from "@/lib/db";
import SettingsForm from "@/components/SettingsForm";
import SetupNotice from "@/components/SetupNotice";
import { requireSession } from "@/lib/auth";

export default async function ParametresPage() {
  // Voir src/app/page.tsx : redirige avant que le try/catch ne
  // requalifie une session expirée en panne de configuration.
  await requireSession();

  let settings;
  try {
    settings = await getSettings();
  } catch (err) {
    return (
      <SetupNotice message={err instanceof Error ? err.message : "Erreur inconnue"} />
    );
  }

  return <SettingsForm initial={settings} />;
}
