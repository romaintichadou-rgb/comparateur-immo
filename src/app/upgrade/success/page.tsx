import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { getUserProfile } from "@/lib/db";
import UpgradeScreen from "@/components/UpgradeScreen";

export const metadata: Metadata = { title: "Bienvenue sur Pro" };

// Le webhook Stripe est ce qui bascule réellement le compte en `pro`, et il
// arrive par un autre canal que la redirection du navigateur : les deux
// courent en parallèle. Cette page ne doit donc jamais AFFIRMER que le plan
// est actif sans l'avoir lu — elle le lit, et dit l'attente si besoin.
export const dynamic = "force-dynamic";

export default async function UpgradeSuccessPage() {
  await requireSession();
  const profil = await getUserProfile();
  const actif = profil.plan !== "free";

  return (
    <UpgradeScreen
      icon={CheckCircle2}
      title={actif ? "Ton compte Pro est actif" : "Paiement bien reçu"}
      message={
        actif
          ? "Biens illimités et 50 analyses par mois. Merci !"
          : "Activation en cours, encore quelques instants — recharge cette page si l'accès n'est pas ouvert."
      }
      action={
        <a
          href="/"
          className="inline-block rounded-lg bg-accent-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-700 active:bg-accent-800"
        >
          Revenir à mes biens
        </a>
      }
      retour={{ href: "/compte", label: "Voir mon compte" }}
    />
  );
}
