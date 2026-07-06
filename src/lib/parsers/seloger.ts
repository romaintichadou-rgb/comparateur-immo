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
 * SeLoger protège l'intégralité du site avec DataDome (vérifié : même la
 * page d'accueil renvoie 403 en requête serveur-à-serveur). L'extraction
 * repose donc presque exclusivement sur le fallback de saisie manuelle en
 * pratique ; le parser reste en place pour le jour où l'accès serait moins
 * restreint (ex: depuis un environnement différent).
 */
export const selogerParser: DomainParser = {
  plateforme: "SeLoger",
  domains: ["seloger.com", "www.seloger.com"],
  async parse(url: string): Promise<ParseResult> {
    const fetched = await fetchListingHtml(url);
    if (!fetched.ok) {
      return {
        ok: false,
        blocked: fetched.blocked,
        message:
          fetched.reason ??
          "SeLoger a bloqué la récupération automatique de cette annonce.",
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
