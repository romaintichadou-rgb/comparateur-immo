import { NextRequest, NextResponse } from "next/server";
import { fetchLoyerReference } from "@/lib/analyse/sources/loyers";
import type { TypologieAnil } from "@/lib/anilReference";
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

  // La typologie décide de la ressource ANIL lue (maison / T1-T2 / T3+ /
  // générique). Validée contre la liste : un paramètre libre choisirait un
  // fichier arbitraire côté source.
  const brut = req.nextUrl.searchParams.get("typologie");
  const typologie: TypologieAnil =
    brut === "maison" || brut === "appartement_t1_t2" || brut === "appartement_t3_plus"
      ? brut
      : "appartement";

  const ref = await fetchLoyerReference(codeInsee, typologie);
  return NextResponse.json({ ref, typologie });
}
