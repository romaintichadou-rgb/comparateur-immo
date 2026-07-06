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
      const candidates = Array.isArray(json) ? json : [json];
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
  const price = offers?.price ?? obj.price;
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
  // n'ont donné de prix. Un bien immobilier se chiffre en dizaines/centaines
  // de milliers d'euros — on exige au moins 5 chiffres pour écarter les
  // faux positifs (charges mensuelles, dépôt de garantie, prix au m²...).
  // On garde le plus grand montant trouvé dans la page plutôt que le premier
  // (le prix principal est presque toujours le montant le plus élevé
  // affiché ; les frais annexes sont toujours plus petits).
  const prixMatches = Array.from(text.matchAll(/(\d[\d\s]{4,9})\s?€/g))
    .map((m) => toNumber(m[1]))
    .filter((n): n is number => n != null && n >= 10000);
  if (prixMatches.length > 0) data.prix = Math.max(...prixMatches);

  // Pas de \b après "²" : ce n'est pas un caractère "mot", la frontière ne
  // matche donc jamais quand il est suivi de ponctuation (ex: "65 m²,").
  const surface = firstMatch(text, /(\d+(?:[.,]\d+)?)\s?m(?:2\b|²)/i);
  if (surface) data.surface_m2 = toNumber(surface);

  const pieces = firstMatch(text, /(\d+)\s?pi[eè]ces?\b/i);
  if (pieces) data.nb_pieces = toNumber(pieces);

  const chambres = firstMatch(text, /(\d+)\s?chambres?\b/i);
  if (chambres) data.nb_chambres = toNumber(chambres);

  const etage = firstMatch(text, /(\d+)(?:er|e|ème)?\s?étage/i);
  if (etage) data.etage = etage;
  else if (/rez[\s-]?de[\s-]?chauss[ée]e/i.test(text)) data.etage = "RDC";

  if (/sans ascenseur/i.test(text)) data.ascenseur = false;
  else if (/\bascenseur\b/i.test(text)) data.ascenseur = true;

  const dpe = firstMatch(text, /\bdpe\s*[:\-]?\s*([A-G])\b/i);
  if (dpe) data.dpe = dpe.toUpperCase();

  const ges = firstMatch(text, /\b(?:ges|climat)\s*[:\-]?\s*([A-G])\b/i);
  if (ges) data.ges = ges.toUpperCase();

  const annee = firstMatch(text, /construit\w* en (\d{4})/i);
  if (annee) data.annee_construction = toNumber(annee);

  const charges = firstMatch(
    text,
    /charges?\s+(?:de\s+)?copropri[ée]t[ée][^\d]{0,20}(\d[\d\s]*)\s?€/i
  );
  if (charges) data.charges_copro_annuelles = toNumber(charges);

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
