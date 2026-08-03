import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { requireSession } from "@/lib/auth";
import UpgradeScreen, { BoutonPasserPro, OffrePro } from "@/components/UpgradeScreen";

export const metadata: Metadata = { title: "Passer à Pro" };

/**
 * Écran affiché quand un compte gratuit tente d'ajouter un 2e bien.
 * Atterrissage depuis le 403 `QUOTA_EXCEEDED` de `POST /api/apartments`.
 */
export default async function BienLimitePage() {
  const session = await requireSession();

  return (
    <UpgradeScreen
      icon={Building2}
      title="Un seul bien avec le plan gratuit"
      message="Ton compte gratuit suit un bien à la fois. Pour comparer plusieurs annonces côte à côte, il faut passer à Pro."
      action={
        <div className="space-y-6">
          <OffrePro />
          <BoutonPasserPro userId={session.userId} />
        </div>
      }
      retour={{ href: "/", label: "Revenir à mon bien" }}
    />
  );
}
