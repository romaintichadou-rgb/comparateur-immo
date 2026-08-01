import * as cheerio from "cheerio";
import type { ParsedListing } from "./types";

/**
 * Extraction "de base" commune à tous les sites, via les métadonnées
 * OpenGraph et le JSON-LD (schema.org), présents sur la quasi-totalité des
 * sites d'annonces pour le référencement. Beaucoup plus stable dans le temps
 * que des sélecteurs CSS propres à chaque site, donc utilisée comme socle
 * avant les extractions spécifiques par parser.
 */
export function extractOpenGraphBase($: cheerio.CheerioAPI): ParsedListing {
  const data: ParsedListing = {};

  const ogDescription =
    $('meta[property="og:description"]').attr("content") ??
    $('meta[name="description"]').attr("content");
  if (ogDescription) data.description = cleanText(ogDescription);

  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) data.photo_url = ogImage;

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).contents().text());
      const graph = json && typeof json === "object" && Array.isArray(json["@graph"]) ? json["@graph"] : null;
      const candidates = Array.isArray(json) ? json : (graph ?? [json]);
      for (const item of candidates) {
        mergeJsonLdCandidate(data, item);
      }
    } catch {
      // JSON-LD malformé ou partiel : on ignore ce bloc, ce n'est pas fatal.
    }
  });

  return data;
}

function mergeJsonLdCandidate(data: ParsedListing, item: unknown): void {
  if (!item || typeof item !== "object") return;
  const obj = item as Record<string, unknown>;

  if (typeof obj.description === "string" && !data.description) {
    data.description = cleanText(obj.description);
  }

  const offers = obj.offers as Record<string, unknown> | undefined;
  const priceSpec = offers?.priceSpecification as Record<string, unknown> | undefined;
  const price = offers?.price ?? priceSpec?.price ?? offers?.lowPrice ?? obj.price;
  const parsedPrice = toNumber(price);
  if (parsedPrice && !data.prix) data.prix = parsedPrice;

  const address = obj.address as Record<string, unknown> | undefined;
  if (address) {
    if (typeof address.addressLocality === "string" && !data.ville) {
      data.ville = address.addressLocality;
    }
    if (typeof address.postalCode === "string" && !data.code_postal) {
      data.code_postal = address.postalCode;
    }
    if (typeof address.streetAddress === "string" && !data.adresse) {
      data.adresse = address.streetAddress;
    }
  }

  if (typeof obj.floorSize === "object" && obj.floorSize) {
    const floorSize = obj.floorSize as Record<string, unknown>;
    const surface = toNumber(floorSize.value);
    if (surface && !data.surface_m2) data.surface_m2 = surface;
  }

  if (typeof obj.numberOfRooms !== "undefined" && !data.nb_pieces) {
    const rooms = toNumber(obj.numberOfRooms);
    if (rooms) data.nb_pieces = rooms;
  }

  if (typeof obj.numberOfBedrooms !== "undefined" && !data.nb_chambres) {
    const bedrooms = toNumber(obj.numberOfBedrooms);
    if (bedrooms) data.nb_chambres = bedrooms;
  }

  if (typeof obj.itemCondition === "string" && !data.etat_bien) {
    const ic = obj.itemCondition.toLowerCase();
    if (ic.includes("new")) data.etat_bien = "Neuf";
    else if (ic.includes("used") || ic.includes("refurbished")) data.etat_bien = "Bon état";
  }

  const itemOffered = obj.itemOffered as Record<string, unknown> | undefined;
  if (itemOffered && typeof itemOffered === "object") {
    if (typeof itemOffered.floorSize === "object" && itemOffered.floorSize && !data.surface_m2) {
      const fs = itemOffered.floorSize as Record<string, unknown>;
      const surface = toNumber(fs.value);
      if (surface) data.surface_m2 = surface;
    }
    if (typeof itemOffered.numberOfRooms !== "undefined" && !data.nb_pieces) {
      const rooms = toNumber(itemOffered.numberOfRooms);
      if (rooms) data.nb_pieces = rooms;
    }
    if (typeof itemOffered.numberOfBedrooms !== "undefined" && !data.nb_chambres) {
      const bedrooms = toNumber(itemOffered.numberOfBedrooms);
      if (bedrooms) data.nb_chambres = bedrooms;
    }
  }

  const additionalProperty = obj.additionalProperty;
  if (Array.isArray(additionalProperty)) {
    for (const prop of additionalProperty) {
      if (!prop || typeof prop !== "object") continue;
      const p = prop as Record<string, unknown>;
      const name = typeof p.name === "string" ? p.name.toLowerCase() : "";
      if (name.includes("surface") && !data.surface_m2) {
        const s = toNumber(p.value);
        if (s) data.surface_m2 = s;
      }
      if ((name.includes("pièce") || name.includes("piece")) && !data.nb_pieces) {
        const n = toNumber(p.value);
        if (n) data.nb_pieces = n;
      }
      if (name.includes("chambre") && !data.nb_chambres) {
        const n = toNumber(p.value);
        if (n) data.nb_chambres = n;
      }
      if (name.includes("ascenseur") && data.ascenseur === undefined) {
        const val = String(p.value).toLowerCase();
        data.ascenseur = val === "oui" || val === "true" || val === "1";
      }
    }
  }
}

export function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Parse un nombre depuis un texte type "450 000 €", "65 m²", "3,5" ... */
export function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const cleaned = value
    .replace(/ /g, " ")
    .replace(/[^\d,.\-]/g, "")
    .replace(/\.(\d{3})(?=[.,]|$)/g, "$1")
    .replace(",", ".");
  if (!cleaned) return undefined;
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function firstMatch(text: string, regex: RegExp): string | undefined {
  const m = text.match(regex);
  return m ? m[1] : undefined;
}

/**
 * Extraction par motifs de texte libre (phrasés français courants dans les
 * annonces immobilières), utilisée comme dernier filet par tous les parsers
 * quand les sélecteurs/JSON structurés d'un site ne donnent rien. Ne remplit
 * jamais un champ déjà trouvé par une méthode plus fiable.
 */
export function extractFromFreeText(text: string): ParsedListing {
  const data: ParsedListing = {};

  // Prix : dernier filet quand ni JSON-LD ni les données structurées du site
  // n'ont donné de prix. On prend le PREMIER montant ≥ 10 000 € plutôt que
  // le plus grand : le prix de vente est affiché en premier sur toutes les
  // plateformes, alors qu'un montant plus élevé en bas de page (estimation,
  // prix voisins, honoraires cumulés) créait des faux positifs.
  const prixMatches = Array.from(text.matchAll(/(\d[\d\s]{4,9})\s?€/g))
    .map((m) => toNumber(m[1]))
    .filter((n): n is number => n != null && n >= 10000);
  if (prixMatches.length > 0) data.prix = prixMatches[0];

  // Pas de \b après "²" : ce n'est pas un caractère "mot", la frontière ne
  // matche donc jamais quand il est suivi de ponctuation (ex: "65 m²,").
  const surface = firstMatch(text, /(\d+(?:[.,]\d+)?)\s?m(?:2\b|²)/i);
  if (surface) data.surface_m2 = toNumber(surface);

  const pieces = firstMatch(text, /(\d+)\s?pi[eè]ces?\b/i);
  if (pieces) data.nb_pieces = toNumber(pieces);

  const chambres = firstMatch(text, /(\d+)\s?chambres?\b/i);
  if (chambres) data.nb_chambres = toNumber(chambres);

  const etage = firstMatch(text, /(\d+)(?:er|e|[eè]me)?\s?[eé](?:tage(?!s)|t\.)/i)
    ?? firstMatch(text, /[eé](?:tage(?!s)|t\.)\s*[:\-]?\s*(\d+)/i);
  if (etage) data.etage = etage;
  else if (/rez[\s-]?de[\s-]?chauss[ée]e/i.test(text)) data.etage = "RDC";

  if (/sans ascenseur/i.test(text)) data.ascenseur = false;
  else if (/\bascenseur\b/i.test(text)) data.ascenseur = true;

  const dpe = firstMatch(text, /\(DPE\)\s*([A-G])/i)
    ?? firstMatch(text, /\b(?:dpe|consommation\s+[ée]nerg[ée]tique|classe\s+[ée]nergie)\s*[:\-]?\s*([A-G])\b/i)
    ?? firstMatch(text, /consommation[^A-G]{0,40}classe\s+([A-G])\b/i);
  if (dpe) data.dpe = dpe.toUpperCase();

  const ges = firstMatch(text, /\(GES\)\s*([A-G])/i)
    ?? firstMatch(text, /\b(?:ges|gaz\s+[àa]\s+effet|climat|[ée]missions?)\s*[:\-]?\s*([A-G])\b/i)
    ?? firstMatch(text, /[ée]missions?[^A-G]{0,40}classe\s+([A-G])\b/i);
  if (ges) data.ges = ges.toUpperCase();

  const annee = firstMatch(text, /construit\w* en (\d{4})/i)
    ?? firstMatch(text, /ann[eé]e de construction\s*[:\-]?\s*(\d{4})/i)
    ?? firstMatch(text, /(?:immeuble|r[eé]sidence|b[aâ]timent)\s+(?:de|du)\s+(\d{4})/i)
    ?? firstMatch(text, /(?:b[aâ]ti|[eé]difi[eé]|[eé]rig[eé]|livr[eé])\w*\s+en\s+(\d{4})/i)
    ?? firstMatch(text, /dat\w+\s+(?:de|du)\s+(\d{4})/i);
  if (annee) data.annee_construction = toNumber(annee);

  const codePostal = firstMatch(text, /\b(\d{5})\b/);
  if (codePostal) data.code_postal = codePostal;

  // Téléphone/email : rarement exposés en clair côté serveur (souvent
  // masqués derrière un bouton "Voir le numéro" nécessitant du JS), mais
  // certains sites de particulier à particulier les affichent directement.
  const telephone = firstMatch(
    text,
    /((?:0|\+33\s?)[1-9](?:[\s.-]?\d{2}){4})\b/i
  );
  if (telephone) data.contact_telephone = telephone.trim();

  const email = firstMatch(text, /([\w.+-]+@[\w-]+\.[a-zA-Z]{2,})/);
  if (email) data.contact_email = email.trim();

  return data;
}

/** Complète `base` avec les champs de `fallback` qui manquent encore. */
export function fillMissing(base: ParsedListing, fallback: ParsedListing): ParsedListing {
  const merged: ParsedListing = { ...base };
  for (const key of Object.keys(fallback) as (keyof ParsedListing)[]) {
    if (merged[key] === undefined && fallback[key] !== undefined) {
      // @ts-expect-error - assignation générique champ par champ
      merged[key] = fallback[key];
    }
  }
  return merged;
}

export function champsExtraits(data: ParsedListing): (keyof ParsedListing)[] {
  return (Object.keys(data) as (keyof ParsedListing)[]).filter(
    (k) => data[k] !== undefined && data[k] !== ""
  );
}
