import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { getUserProfile } from "@/lib/db";
import ComptePage from "./ComptePage";

export const metadata: Metadata = { title: "Mon compte" };

export default async function Page() {
  const session = await requireSession();
  const profil = await getUserProfile();
  return <ComptePage email={session.email} profil={profil} />;
}
