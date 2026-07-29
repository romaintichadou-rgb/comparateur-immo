import Link from "next/link";
import { SearchX } from "lucide-react";
import ErrorScreen from "@/components/ErrorScreen";

/** 404 générique pour toute URL qui ne correspond à aucune route de l'app. */
export default function NotFound() {
  return (
    <ErrorScreen
      icon={SearchX}
      title="Page introuvable"
      message="Cette page n'existe pas ou plus."
      actions={
        <Link
          href="/"
          className="rounded-lg bg-accent-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-700"
        >
          Retour à l&apos;accueil
        </Link>
      }
    />
  );
}
