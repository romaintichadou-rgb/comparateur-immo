import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Callback Supabase Auth — echange un token contre une session.
 *
 * Deux formats possibles selon la config du projet Supabase :
 *  - PKCE (defaut @supabase/ssr) : `?code=<code>`
 *  - Ancien format : `?token_hash=<hash>&type=recovery`
 *
 * Le client Supabase est cree DIRECTEMENT sur la reponse de redirection : les
 * cookies de session sont ecrits sur cette reponse-la, pas sur le `cookieStore`
 * de Next.js. Sans ca, `NextResponse.redirect()` cree une reponse vierge et la
 * session se perd.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  // Si c'est une réinitialisation de MDP (recovery) et pas de `next` fourni,
  // rediriger vers le formulaire de reset. Sinon, respecter le `next`.
  const next = searchParams.get("next") ?? (type === "recovery" ? "/auth/reset-password" : "/");

  const redirectUrl = new URL(next, origin);
  const response = NextResponse.redirect(redirectUrl);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return response;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as "recovery" | "email" });
    if (!error) return response;
  }

  return NextResponse.redirect(new URL("/login", origin));
}
