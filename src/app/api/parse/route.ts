import { NextRequest, NextResponse } from "next/server";
import { findParserForUrl, parseListingUrl } from "@/lib/parsers";

export async function POST(req: NextRequest) {
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
