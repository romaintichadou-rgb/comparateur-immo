import * as cheerio from "cheerio";
import { leboncoinParser } from "./leboncoin";
import { selogerParser } from "./seloger";
import { papParser } from "./pap";
import { orpiParser } from "./orpi";
import { fetchListingHtml } from "./http";
import {
  champsExtraits,
  extractFromFreeText,
  extractFromPageMeta,
  extractOpenGraphBase,
  fillMissing,
} from "./common";
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
  if (parser) return parser.parse(url);
  return genericParse(url);
}

async function genericParse(url: string): Promise<ParseResult> {
  const fetched = await fetchListingHtml(url);
  if (!fetched.ok) {
    return {
      ok: false,
      blocked: fetched.blocked,
      message:
        fetched.reason ??
        "Le site a bloqué la récupération automatique de cette annonce.",
      data: {},
      champsExtraits: [],
    };
  }

  const $ = cheerio.load(fetched.html);
  let data = extractOpenGraphBase($);
  data = fillMissing(data, extractFromPageMeta($));
  data = fillMissing(data, extractFromFreeText($("body").text()));

  return { ok: true, blocked: false, data, champsExtraits: champsExtraits(data) };
}
