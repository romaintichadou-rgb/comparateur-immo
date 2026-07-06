import { getSettings } from "@/lib/sheets";
import SettingsForm from "@/components/SettingsForm";
import SetupNotice from "@/components/SetupNotice";

export default async function ParametresPage() {
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
