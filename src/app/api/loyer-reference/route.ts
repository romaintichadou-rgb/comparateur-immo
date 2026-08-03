import { NextRequest, NextResponse } from "next/server";
import { fetchLoyerReference } from "@/lib/analyse/sources/loyers";
import { getApiSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  // Comme `/api/parse` : pas d'appel à `db.ts`, donc pas de protection
  // héritée. Les données ANIL sont publiques, mais l'endpoint interroge une
  // source externe à chaque appel — le laisser ouvert offrirait à un tiers un
  // relais gratuit vers cette source, au débit de ce serveur.
  if (!(await getApiSession())) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  const codeInsee = req.nextUrl.searchParams.get("code_insee");
  if (!codeInsee) {
    return NextResponse.json({ error: "code_insee manquant" }, { status: 400 });
  }

  const ref = await fetchLoyerReference(codeInsee);
  return NextResponse.json({ ref });
}
