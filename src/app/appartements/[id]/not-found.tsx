import Link from "next/link";
import { SearchX } from "lucide-react";
import ErrorScreen from "@/components/ErrorScreen";

/**
 * S'affiche quand `getApartment(id)` (page.tsx) renvoie `null` — bien
 * supprimé, ou lien copié/tronqué qui ne correspond plus à un ID existant.
 * Cas "normal" et attendu, pas un crash : tonalité neutre (accent), pas
 * d'échec technique à signaler.
 *
 * Le texte reste générique : Next.js ne passe aucun contexte à not-found.tsx,
 * on ne peut pas distinguer un UUID malformé d'un bien supprimé.
 */
export default function NotFound() {
  return (
    <ErrorScreen
      icon={SearchX}
      title="Bien introuvable"
      message="Ce lien ne correspond à aucun bien. Il a peut-être été supprimé, ou l'adresse est incorrecte."
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
