import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy — ex-`middleware.ts`, renommé par Next.js 16 (le nom `middleware` est
 * déprécié ; un codemod existe : `npx @next/codemod@canary middleware-to-proxy`).
 *
 * Deux rôles, et un troisième qu'il n'a PAS :
 *
 * 1. **Rafraîchir le jeton de session.** Les jetons Supabase expirent après une
 *    heure. Un Server Component ne peut pas écrire de cookie (voir
 *    `lib/supabase/server.ts`), donc si personne ne rafraîchit ici, la session
 *    meurt en pleine navigation et l'utilisateur est déconnecté sans raison
 *    visible. C'est la vraie raison d'être de ce fichier.
 *
 * 2. **Rediriger de façon optimiste.** Éviter d'afficher une page vide avant
 *    que le rendu ne redirige. Confort, pas sécurité.
 *
 * 3. **Ce qu'il ne fait pas : protéger les données.** La documentation de
 *    Next.js 16 le dit sans détour — le proxy tourne aussi sur les routes
 *    préchargées et ne lit que le cookie. La barrière réelle est
 *    `requireSession()` (`lib/auth.ts`), appelée dans le Data Access Layer.
 *    Si ce fichier disparaissait, l'app resterait sûre ; elle serait juste
 *    moins agréable.
 */

/** Routes accessibles sans être connecté. */
const ROUTES_PUBLIQUES = ["/login", "/signup", "/mot-de-passe-oublie", "/auth"];

export async function proxy(request: NextRequest) {
  // Cette réponse transporte les cookies rafraîchis. Elle doit être renvoyée
  // TELLE QUELLE : la recréer en fin de fonction perdrait les cookies posés
  // par Supabase, et la session serait rafraîchie côté serveur sans que le
  // navigateur ne le sache jamais.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Ne pas supprimer : c'est cet appel qui déclenche le rafraîchissement du
  // jeton et le dépôt des cookies via `setAll`.
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  const chemin = request.nextUrl.pathname;
  const estPublique = ROUTES_PUBLIQUES.some((r) => chemin.startsWith(r));

  // Les routes d'API ne sont jamais redirigées : un `fetch()` qui reçoit une
  // page HTML de connexion à la place de son JSON échoue de façon obscure.
  // Elles répondent elles-mêmes 401 (lot 3).
  const estApi = chemin.startsWith("/api");

  if (!user && !estPublique && !estApi) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Mémorise la destination pour y revenir après connexion — c'est ce qui
    // fait que le bookmarklet fonctionne sur un compte déconnecté : l'annonce
    // n'est pas perdue en route.
    url.searchParams.set("suivant", chemin + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (user && (chemin === "/login" || chemin === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Toutes les routes SAUF les fichiers statiques et les images — les faire
     * passer par ici ajouterait une validation de jeton à chaque icône.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
