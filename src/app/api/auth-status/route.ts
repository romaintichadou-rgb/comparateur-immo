import { getSession } from "@/lib/auth";

/**
 * Route publique pour vérifier le statut d'authentification.
 * Utilisée par le bookmarklet pour détecter si l'utilisateur est connecté.
 * Retourne 200 si connecté, 401 sinon.
 */
export async function GET() {
  const session = await getSession();

  if (!session) {
    return new Response(
      JSON.stringify({ authenticated: false }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ authenticated: true, email: session.email }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
