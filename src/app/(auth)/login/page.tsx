import type { Metadata } from "next";
import AuthForm from "../AuthForm";
import { connexion } from "../actions";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({
  searchParams,
}: {
  // Next.js 16 : `searchParams` est une PROMESSE dans une page — la lire
  // directement comme un objet renvoie undefined sans erreur explicite.
  searchParams: Promise<{ suivant?: string }>;
}) {
  const { suivant } = await searchParams;

  return (
    <AuthForm
      action={connexion}
      titre="Se connecter"
      sousTitre="Connecte-toi pour retrouver tes biens et tes analyses."
      libelleBouton="Se connecter"
      suivant={suivant}
      piedDePage={{ texte: "Pas encore de compte ?", lienLabel: "Créer un compte", lienHref: "/signup" }}
    />
  );
}
