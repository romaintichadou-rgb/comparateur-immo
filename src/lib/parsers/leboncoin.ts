import * as cheerio from "cheerio";
import type { DomainParser, ParseResult, ParsedListing } from "./types";
import { fetchListingHtml } from "./http";
import {
  champsExtraits,
  extractFromFreeText,
  extractOpenGraphBase,
  fillMissing,
  toNumber,
} from "./common";

/**
 * Leboncoin protège ses pages d'annonce individuelles avec DataDome : en
 * pratique une requête serveur-à-serveur est blocked la quasi-totalité du
 * temps (vérifié : la page de recherche répond 200, la page d'annonce répond
 * 403 + challenge). Le parser tente quand même l'extraction (utile si un
 * jour la protection est plus permissive) mais l'UI doit s'attendre à
 * `blocked: true` la plupart du temps et proposer la saisie manuelle.
 */
export const leboncoinParser: DomainParser = {
  plateforme: "Leboncoin",
  domains: ["leboncoin.fr", "www.leboncoin.fr"],
  async parse(url: string): Promise<ParseResult> {
    const fetched = await fetchListingHtml(url);
    if (!fetched.ok) {
      return {
        ok: false,
        blocked: fetched.blocked,
        message:
          fetched.reason ??
          "Leboncoin a bloqué la récupération automatique de cette annonce.",
        data: {},
        champsExtraits: [],
      };
    }

    const $ = cheerio.load(fetched.html);
    let data = extractOpenGraphBase($);

    try {
      enrichFromNextData($, data);
    } catch {
      // Structure __NEXT_DATA__ non reconnue : on garde le socle OpenGraph.
    }

    data = fillMissing(data, extractFromFreeText($("body").text()));

    return { ok: true, blocked: false, data, champsExtraits: champsExtraits(data) };
  },
};

function enrichFromNextData($: cheerio.CheerioAPI, data: ParsedListing): void {
  const script = $("#__NEXT_DATA__").contents().text();
  if (!script) return;
  const json = JSON.parse(script);
  const ad = json?.props?.pageProps?.ad;
  if (!ad) return;

  if (typeof ad.body === "string") data.description = ad.body;
  const price = Array.isArray(ad.price) ? ad.price[0] : ad.price;
  const parsedPrice = toNumber(price);
  if (parsedPrice) data.prix = parsedPrice;

  if (ad.location) {
    if (ad.location.city) data.ville = ad.location.city;
    if (ad.location.zipcode) data.code_postal = ad.location.zipcode;
    if (ad.location.district) data.quartier = ad.location.district;
  }

  const attributes: Array<{ key: string; value?: string; value_label?: string }> =
    ad.attributes ?? [];
  const attr = (key: string) => attributes.find((a) => a.key === key);

  const surface = toNumber(attr("square")?.value);
  if (surface) data.surface_m2 = surface;

  const rooms = toNumber(attr("rooms")?.value);
  if (rooms) data.nb_pieces = rooms;

  const bedrooms = toNumber(attr("bedrooms")?.value);
  if (bedrooms) data.nb_chambres = bedrooms;

  const floor = attr("floor")?.value;
  if (floor) data.etage = floor;

  const elevator = attr("elevator")?.value;
  if (elevator) data.ascenseur = elevator === "1" || elevator === "true";

  const dpe = attr("energy_rate")?.value_label ?? attr("energy_rate")?.value;
  if (dpe) data.dpe = dpe;

  const ges = attr("ghg")?.value_label ?? attr("ghg")?.value;
  if (ges) data.ges = ges;

  const chargesCopro = toNumber(attr("charges_included")?.value);
  if (chargesCopro) data.charges_copro_annuelles = chargesCopro;

  const images: string[] = ad.images?.urls ?? [];
  if (images[0]) data.photo_url = images[0];
}
