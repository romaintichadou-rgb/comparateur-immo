import { NextResponse } from "next/server";
import { NonAuthentifieError } from "@/lib/auth";

/**
 * Traduction unique erreur → réponse HTTP, pour toutes les routes d'API.
 *
 * Centralisée plutôt que répétée dans chaque `catch` : le jour où une route
 * oublie de distinguer « pas de session » d'une panne serveur, elle répond 500
 * à un utilisateur simplement déconnecté — le client croit à un bug, et le
 * vrai problème (la session expirée) reste invisible.
 *
 * `db.ts` lève `NonAuthentifieError` dès qu'une requête est tentée sans
 * session : il suffit donc à une route d'appeler le DAL pour être protégée,
 * sans avoir à vérifier la session elle-même.
 */
export function reponseErreur(err: unknown): NextResponse {
  if (err instanceof NonAuthentifieError) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  if (err instanceof Error) {
    // Gate quota dépassé (plan gratuit limité à 1 bien)
    if ((err as any).code === "QUOTA_EXCEEDED") {
      return NextResponse.json(
        { error: "Vous avez atteint la limite de biens avec le plan gratuit. Passez à Pro pour en ajouter plus." },
        { status: 403 }
      );
    }

    // Quota d'analyses IA dépassé (pro limité à 50/mois)
    if ((err as any).code === "ANALYSE_QUOTA_EXCEEDED") {
      return NextResponse.json(
        { error: "Vous avez atteint votre limite de 50 analyses ce mois. Réessayez le mois prochain." },
        { status: 403 }
      );
    }

    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({ error: "Erreur inconnue" }, { status: 500 });
}
