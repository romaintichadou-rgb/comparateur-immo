"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import ErrorScreen from "@/components/ErrorScreen";

/**
 * Filet de sécurité pour toute exception levée en rendant la fiche : sans lui,
 * une erreur pendant `computeDerived()` ou le rendu de `ApartmentDetail` (tous
 * deux hors du try/catch de page.tsx, qui ne couvre que le fetch des données)
 * coupait la réponse en plein flux — d'où l'écran d'erreur brut du NAVIGATEUR
 * (pas de page Next.js) vu en prod, plutôt qu'un message utilisable.
 *
 * Cause la plus probable, déjà corrigée séparément : un bien dont l'analyse
 * stockée provient d'un schéma antérieur à l'ajout d'un bloc ou d'un champ
 * (voir SyntheseView.tsx, l'onglet par défaut). Ce garde reste nécessaire
 * pour toute AUTRE cause imprévue du même genre.
 */
export default function ApartmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorScreen
      icon={AlertTriangle}
      tone="amber"
      title="Le chargement de ce bien a échoué"
      message="Ça peut arriver après une mise à jour du modèle de données, ou pour une fiche enregistrée dans un ancien format. Réessaie, ou reviens à l'accueil."
      reference={error.digest}
      actions={
        <>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-accent-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-700"
          >
            Réessayer
          </button>
          <Link
            href="/"
            className="text-sm font-medium text-ink-600 underline decoration-ink-300 underline-offset-2 transition-colors hover:text-ink-900"
          >
            Retour à l&apos;accueil
          </Link>
        </>
      }
    />
  );
}
