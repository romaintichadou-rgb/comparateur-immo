import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Data Access Layer — la vérification de session.
 *
 * C'est LA barrière de sécurité de l'app, pas `proxy.ts`. La documentation de
 * Next.js 16 est explicite sur ce point : le proxy (ex-middleware) ne doit
 * servir qu'à des redirections optimistes, jamais à protéger la donnée, parce
 * qu'il tourne aussi sur les routes préchargées et ne voit que le cookie.
 *
 * ── Pourquoi `getUser()` et jamais `getSession()` ────────────────────────
 * `getSession()` se contente de lire le cookie et de le décoder : un cookie
 * fabriqué à la main passerait. `getUser()` valide le jeton auprès du serveur
 * Auth de Supabase. Sur du multi-tenant, c'est la différence entre une
 * vérification et une formalité.
 *
 * ── Pourquoi `cache()` ───────────────────────────────────────────────────
 * `cache()` de React mémoïse le résultat pour la durée d'UN rendu. Sans lui,
 * une page qui appelle trois fonctions de `db.ts` déclencherait trois
 * validations réseau du même jeton. La mémoïsation ne franchit pas la
 * frontière d'une requête : deux utilisateurs ne peuvent pas se partager un
 * résultat.
 */

export interface Session {
  userId: string;
  email: string;
}

/**
 * Session courante, ou `null` si l'appelant n'est pas connecté.
 * À utiliser quand l'absence de session est un cas normal (page publique,
 * navbar qui affiche « Connexion » ou l'avatar).
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) return null;
  return { userId: data.user.id, email: data.user.email ?? "" };
});

/**
 * Session courante, ou redirection vers `/login`.
 * À utiliser partout où la donnée d'un utilisateur est en jeu — c'est la forme
 * qu'appellera `db.ts` au lot 3.
 *
 * `redirect()` lève une exception interceptée par Next.js : le code qui suit
 * l'appel ne s'exécute jamais. Inutile de gérer le cas « pas de session »
 * après coup.
 */
export const requireSession = cache(async (): Promise<Session> => {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
});

/**
 * Variante pour les Route Handlers : renvoie `null` au lieu de rediriger.
 * Une API doit répondre 401 en JSON — une redirection HTML vers `/login`
 * serait illisible pour un `fetch()`.
 */
export async function getApiSession(): Promise<Session | null> {
  return getSession();
}
