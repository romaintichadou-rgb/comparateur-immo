import * as cheerio from "cheerio";
import type { DomainParser, ParseResult } from "./types";
import { fetchListingHtml } from "./http";
import {
  champsExtraits,
  extractFromFreeText,
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

    // PAP affiche traditionnellement le prix et la surface dans des blocs
    // avec des classes dédiées ; on tente ces sélecteurs en best-effort
    // avant le fallback texte libre.
    const prixTexte = $("[class*='price']").first().text();
    const prix = toNumber(prixTexte);
    if (prix) data.prix = prix;

    data = fillMissing(data, extractFromFreeText($("body").text()));

    return { ok: true, blocked: false, data, champsExtraits: champsExtraits(data) };
  },
};
