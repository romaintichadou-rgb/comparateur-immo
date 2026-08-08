import { Suspense } from "react";
import { redirect } from "next/navigation";
import AddApartmentFlow from "@/components/AddApartmentFlow";
import { requireSession } from "@/lib/auth";
import { getUserProfile, LIMITE_BIENS_FREE } from "@/lib/db";

/**
 * Le quota est vérifié À L'ENTRÉE, avant même d'afficher le formulaire.
 *
 * Le gate du DAL (`createApartment`) reste la vraie barrière, mais il ne
 * répond qu'à l'enregistrement : l'utilisateur remplissait tout le formulaire,
 * voyait l'écran « création en cours », et n'apprenait qu'ensuite qu'il ne
 * pouvait pas. Du travail demandé pour rien, et un blocage qui arrive après
 * avoir laissé croire que ça passait.
 *
 * Ce contrôle-ci ne remplace pas celui du DAL, il l'anticipe : deux onglets
 * ouverts, ou un bien créé entre-temps, et c'est encore le 403 qui tranche
 * (voir `redirectionQuota` côté client).
 */
export default async function NouveauApartementPage() {
  await requireSession();
  const profil = await getUserProfile();

  if (profil.plan === "free" && profil.nombreBiens >= LIMITE_BIENS_FREE) {
    redirect("/upgrade/bien-limite");
  }

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
          <div className="h-8 w-56 animate-pulse rounded bg-ink-100" />
          <div className="h-12 w-full animate-pulse rounded-lg bg-ink-100" />
          <div className="h-48 w-full animate-pulse rounded-xl bg-ink-100" />
        </div>
      }
    >
      <AddApartmentFlow />
    </Suspense>
  );
}
