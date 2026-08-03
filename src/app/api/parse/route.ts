import { NextRequest, NextResponse } from "next/server";
import { findParserForUrl, parseListingUrl } from "@/lib/parsers";
import { getApiSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  // Vérification EXPLICITE : cette route ne passe pas par `db.ts`, elle
  // n'hérite donc pas de sa protection. Laissée ouverte, elle irait chercher
  // n'importe quelle URL au nom du serveur — un proxy de scraping gratuit
  // pour qui la découvre, dont le trafic serait imputé à cette app.
  if (!(await getApiSession())) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  const body = await req.json();
  const url = typeof body?.url === "string" ? body.url.trim() : "";

  if (!url) {
    return NextResponse.json({ error: "URL manquante" }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "URL invalide" }, { status: 400 });
  }

  const parser = findParserForUrl(url);
  const result = await parseListingUrl(url);

  return NextResponse.json({
    ...result,
    plateforme: parser?.plateforme ?? "Manuel",
  });
}
