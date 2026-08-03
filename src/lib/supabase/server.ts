import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Client Supabase côté SERVEUR, porteur de la session de l'utilisateur.
 *
 * À la différence du singleton `service_role` de `db.ts`, ce client est créé
 * PAR REQUÊTE : il lit le cookie de session de l'appelant, donc les policies
 * RLS s'appliquent. C'est ce qui rendra le cloisonnement réel au lot 3.
 *
 * ⚠️ Deux pièges de Next.js 16, tous deux vérifiés dans
 * `node_modules/next/dist/docs/` :
 *
 * 1. `cookies()` est ASYNCHRONE — d'où le `await` ci-dessous.
 * 2. `.set()` n'est autorisé que dans un Server Action ou un Route Handler,
 *    JAMAIS dans un Server Component. Or Supabase écrit des cookies dès qu'il
 *    rafraîchit un token expiré, ce qui peut arriver pendant le rendu d'une
 *    page. D'où le try/catch de `setAll` : dans ce cas précis, l'échec est
 *    normal et sans conséquence, parce que `proxy.ts` a déjà rafraîchi la
 *    session avant que la page ne soit rendue. Laisser l'erreur remonter
 *    ferait planter des pages entières pour une écriture de cookie redondante.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Appel depuis un Server Component : voir le point 2 ci-dessus.
          }
        },
      },
    }
  );
}
