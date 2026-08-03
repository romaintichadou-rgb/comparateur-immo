import type { Metadata } from "next";
import AuthForm from "../AuthForm";
import { inscription } from "../actions";

export const metadata: Metadata = { title: "Créer un compte" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ suivant?: string }>;
}) {
  const { suivant } = await searchParams;

  return (
    <AuthForm
      action={inscription}
      titre="Créer un compte"
      sousTitre="Analyse tes annonces et suis tes biens au même endroit."
      libelleBouton="Créer mon compte"
      suivant={suivant}
      piedDePage={{ texte: "Déjà un compte ?", lienLabel: "Se connecter", lienHref: "/login" }}
    />
  );
}
