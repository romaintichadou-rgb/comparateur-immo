"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import ErrorScreen from "@/components/ErrorScreen";

/**
 * Filet de sécurité pour le reste de l'app (accueil, paramètres, ajout d'un
 * bien) : sans boundary d'erreur nulle part, une exception non gérée pendant
 * le rendu coupe la réponse en plein flux côté navigateur, au lieu d'un
 * message utilisable. Voir aussi src/app/appartements/[id]/error.tsx, plus
 * spécifique à la fiche.
 */
export default function GlobalRouteError({
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
      title="Une erreur est survenue"
      message="Le chargement de cette page a échoué. Réessaie, ou reviens à l'accueil."
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
