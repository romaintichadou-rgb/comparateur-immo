import * as cheerio from "cheerio";
import type { DomainParser, ParseResult } from "./types";
import { fetchListingHtml } from "./http";
import {
  champsExtraits,
  extractFromFreeText,
  extractFromPageMeta,
  extractFullDescription,
  extractOpenGraphBase,
  fillMissing,
  toNumber,
} from "./common";

/**
 * PAP (Particulier à Particulier) protège aussi ses pages via Cloudflare
 * (challenge vérifié en test). Même logique que les autres parsers : socle
 * OpenGraph/JSON-LD + fallback texte libre, avec repli sur la saisie
 * manuelle si le challenge anti-bot est détecté.
 */
export const papParser: DomainParser = {
  plateforme: "PAP",
  domains: ["pap.fr", "www.pap.fr"],
  async parse(url: string): Promise<ParseResult> {
    const fetched = await fetchListingHtml(url);
    if (!fetched.ok) {
      return {
        ok: false,
        blocked: fetched.blocked,
        message:
          fetched.reason ??
          "PAP a bloqué la récupération automatique de cette annonce.",
        data: {},
        champsExtraits: [],
      };
    }

    const $ = cheerio.load(fetched.html);
    let data = extractOpenGraphBase($);

    const prixTexte = $("[class*='price']").first().text();
    const prix = toNumber(prixTexte);
    if (prix) data.prix = prix;

    data = fillMissing(data, extractFromPageMeta($));
    data = fillMissing(data, extractFromFreeText($("body").text()));

    const fullDesc = extractFullDescription($);
    if (fullDesc && (!data.description || fullDesc.length > data.description.length)) {
      data.description = fullDesc;
    }

    return { ok: true, blocked: false, data, champsExtraits: champsExtraits(data) };
  },
};
