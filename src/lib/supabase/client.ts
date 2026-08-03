import { createBrowserClient } from "@supabase/ssr";

/**
 * Client Supabase côté NAVIGATEUR — connexion, inscription, déconnexion.
 *
 * Utilise l'anon key, qui est publique par nature : elle part dans le bundle
 * JavaScript, et c'est normal. Ce qui protège les données, ce sont les policies
 * RLS (migration 0008), pas le secret de cette clé. Ne jamais utiliser la
 * `service_role` key ici : elle contourne RLS.
 *
 * Ce client ne sert QU'À l'authentification. Toute lecture ou écriture de
 * données passe par le serveur (`src/lib/db.ts`), qui reste le point de
 * passage unique.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
