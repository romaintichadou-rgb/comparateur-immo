import { leboncoinParser } from "./leboncoin";
import { selogerParser } from "./seloger";
import { papParser } from "./pap";
import { orpiParser } from "./orpi";
import type { DomainParser, ParseResult } from "./types";

export type { ParseResult, ParsedListing, DomainParser } from "./types";

const PARSERS: DomainParser[] = [leboncoinParser, selogerParser, papParser, orpiParser];

export function findParserForUrl(url: string): DomainParser | null {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  return (
    PARSERS.find((parser) =>
      parser.domains.some((d) => hostname === d || hostname.endsWith(`.${d}`))
    ) ?? null
  );
}

export async function parseListingUrl(url: string): Promise<ParseResult> {
  const parser = findParserForUrl(url);
  if (!parser) {
    return {
      ok: false,
      blocked: false,
      message:
        "Site non reconnu (Leboncoin, SeLoger, PAP et Orpi sont supportés). Utilise la saisie manuelle.",
      data: {},
      champsExtraits: [],
    };
  }
  return parser.parse(url);
}
