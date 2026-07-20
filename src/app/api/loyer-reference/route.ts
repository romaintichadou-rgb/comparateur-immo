import { NextRequest, NextResponse } from "next/server";
import { fetchLoyerReference } from "@/lib/analyse/sources/loyers";

export async function GET(req: NextRequest) {
  const codeInsee = req.nextUrl.searchParams.get("code_insee");
  if (!codeInsee) {
    return NextResponse.json({ error: "code_insee manquant" }, { status: 400 });
  }

  const ref = await fetchLoyerReference(codeInsee);
  return NextResponse.json({ ref });
}
