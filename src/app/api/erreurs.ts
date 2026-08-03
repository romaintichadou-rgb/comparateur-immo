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
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Erreur inconnue" },
    { status: 500 }
  );
}
