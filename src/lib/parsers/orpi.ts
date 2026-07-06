import * as cheerio from "cheerio";
import type { DomainParser, ParseResult } from "./types";
import { fetchListingHtml } from "./http";
import {
  champsExtraits,
  extractFromFreeText,
  extractOpenGraphBase,
  fillMissing,
} from "./common";

/**
 * Orpi (réseau d'agences) s'est montré accessible en requête
 * serveur-à-serveur lors des tests (contrairement aux 3 autres sites,
 * bloqués). Le socle OpenGraph/JSON-LD + fallback texte libre est donc
 * particulièrement pertinent ici : il a de bonnes chances de fonctionner.
 */
export const orpiParser: DomainParser = {
  plateforme: "Orpi",
  domains: ["orpi.com", "www.orpi.com"],
  async parse(url: string): Promise<ParseResult> {
    const fetched = await fetchListingHtml(url);
    if (!fetched.ok) {
      return {
        ok: false,
        blocked: fetched.blocked,
        message:
          fetched.reason ??
          "Orpi a bloqué la récupération automatique de cette annonce.",
        data: {},
        champsExtraits: [],
      };
    }

    const $ = cheerio.load(fetched.html);
    let data = extractOpenGraphBase($);
    data = fillMissing(data, extractFromFreeText($("body").text()));

    return { ok: true, blocked: false, data, champsExtraits: champsExtraits(data) };
  },
};
