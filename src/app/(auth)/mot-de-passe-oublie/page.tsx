import type { Metadata } from "next";
import MotDePasseOublieForm from "./MotDePasseOublieForm";

export const metadata: Metadata = { title: "Mot de passe oublie" };

export default function MotDePasseOubliePage() {
  return <MotDePasseOublieForm />;
}
