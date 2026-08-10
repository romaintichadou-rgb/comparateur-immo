import { NextResponse } from "next/server";
import { NonAuthentifieError } from "@/lib/auth";
import { ApartmentIntrouvableError, QuotaDepasseError } from "@/lib/db";

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

  // Limite de plan atteinte. `redirection` accompagne le message : le client
  // envoie l'utilisateur sur l'écran qui explique CETTE limite-là, plutôt que
  // d'afficher un message d'erreur rouge sur un geste qui n'a rien de fautif.
  if (err instanceof QuotaDepasseError) {
    return NextResponse.json(
      { error: err.message, redirection: err.redirection },
      { status: 403 }
    );
  }

  // Bien inexistant OU appartenant à un autre compte : indistinguables de
  // l'extérieur, et c'est voulu (voir `getApartment`).
  if (err instanceof ApartmentIntrouvableError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }

  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Erreur inconnue" },
    { status: 500 }
  );
}
