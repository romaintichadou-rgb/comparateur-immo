import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import ResetPasswordForm from "./ResetPasswordForm";

export const metadata: Metadata = { title: "Réinitialiser le mot de passe" };

export default async function ResetPasswordPage() {
  // La page n'est accessible que après avoir cliqué le lien du callback
  // et échangé le token contre une session.
  await requireSession();

  return <ResetPasswordForm />;
}
