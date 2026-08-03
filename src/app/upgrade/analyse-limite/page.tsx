import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { getUserProfile } from "@/lib/db";
import UpgradeScreen, { BoutonPasserPro, OffrePro } from "@/components/UpgradeScreen";

export const metadata: Metadata = { title: "Limite d'analyses atteinte" };

/** 1er du mois suivant, en toutes lettres — la date à laquelle le compteur repart. */
function prochainRenouvellement(): string {
  const maintenant = new Date();
  const suivant = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 1);
  return suivant.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

/**
 * Écran affiché quand le quota mensuel d'analyses IA est atteint.
 * Atterrissage depuis le 403 `ANALYSE_QUOTA_EXCEEDED` de `POST /api/analyse/[id]`.
 *
 * ⚠️ Aujourd'hui SEUL le plan `pro` est plafonné (50/mois) — `free` et
 * `tester` n'ont pas de limite d'analyses. Un abonné Pro qui atteint le
 * plafond n'a donc rien à acheter : lui proposer « Passer à Pro » serait
 * absurde. La page lit le plan et n'affiche l'offre que si elle a un sens.
 */
export default async function AnalyseLimitePage() {
  const session = await requireSession();
  const profil = await getUserProfile();
  const dejaPro = profil.plan !== "free";

  return (
    <UpgradeScreen
      icon={Sparkles}
      title="Limite d'analyses atteinte ce mois"
      message={
        dejaPro
          ? "Tu as utilisé les 50 analyses incluses dans ton abonnement. Le compteur repart au début du mois prochain."
          : "Tu as atteint le nombre d'analyses possible ce mois-ci. Le compteur repart au début du mois prochain."
      }
      note={`Prochain renouvellement : ${prochainRenouvellement()}.`}
      action={
        dejaPro ? null : (
          <div className="space-y-6">
            <OffrePro />
            <BoutonPasserPro userId={session.userId} />
          </div>
        )
      }
      retour={{ href: "/", label: "Revenir à mes biens" }}
    />
  );
}
