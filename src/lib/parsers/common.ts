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

  if (typeof obj.description === "string") {
    const cleaned = cleanText(obj.description);
    if (!data.description || cleaned.length > data.description.length) {
      data.description = cleaned;
    }
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

  if (typeof obj.yearBuilt !== "undefined" && !data.annee_construction) {
    const yb = toNumber(obj.yearBuilt);
    if (yb && yb >= 1800 && yb <= 2030) data.annee_construction = yb;
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
      if ((name.includes("ann") && name.includes("construction")) && !data.annee_construction) {
        const y = toNumber(p.value);
        if (y && y >= 1800 && y <= 2030) data.annee_construction = y;
      }
      if (name.includes("taxe") && name.includes("fonci") && !data.taxe_fonciere) {
        const tf = toNumber(p.value);
        if (tf && tf >= 100 && tf <= 10000) data.taxe_fonciere = tf;
      }
      if ((name.includes("étage") || name.includes("etage")) && !name.includes("nombre") && !data.etage) {
        const ev = String(p.value).trim();
        if (/^\d+$/.test(ev)) data.etage = ev;
        else if (/rdc|rez/i.test(ev)) data.etage = "RDC";
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

const NOT_CITY_RE =
  /^(?:appartement|maison|studio|duplex|loft|terrain|immeuble|vente|achat|location|bien|annonce|programme|ref|type|prix|surface)$/i;

function extractVilleFromTitle(text: string, data: ParsedListing): void {
  if (data.ville) return;

  const paren = text.match(
    /([A-ZÀ-Ÿ][a-zà-ÿ]+(?:[-\s][a-zà-ÿA-ZÀ-Ÿ][\wà-ÿ'-]*){0,4})\s*\(\s*(\d{5})\s*\)/,
  );
  if (paren && !NOT_CITY_RE.test(paren[1].trim())) {
    data.ville = paren[1].trim();
    if (!data.code_postal) data.code_postal = paren[2];
    return;
  }

  const plain = text.match(
    /([A-ZÀ-Ÿ][a-zà-ÿ]+(?:[\s-][a-zà-ÿA-ZÀ-Ÿ][\wà-ÿ'-]*){0,3}(?:\s+\d{1,2}[eè](?:me|r)?)?)\s+(\d{5})(?!\s*[€m²])/,
  );
  if (plain) {
    const candidate = plain[1].trim();
    const first = candidate.split(/[\s-]/)[0];
    if (!NOT_CITY_RE.test(first) && candidate.length > 1) {
      data.ville = candidate;
      if (!data.code_postal) data.code_postal = plain[2];
      return;
    }
  }

  // Pattern 3: "... Ville | Site Name" — common real estate title format
  const beforePipe = text.split(/\s*[|–—]\s*/)[0];
  if (beforePipe) {
    const lastWord = beforePipe.match(
      /([A-ZÀ-Ÿ][a-zà-ÿ]+(?:[-\s][A-ZÀ-Ÿa-zà-ÿ][\wà-ÿ'-]*){0,3})\s*$/,
    );
    if (lastWord && !NOT_CITY_RE.test(lastWord[1].split(/[\s-]/)[0])) {
      data.ville = lastWord[1].trim();
    }
  }
}

function applyKV(key: string, value: string, data: ParsedListing): void {
  const k = key.toLowerCase().trim();

  if ((k === "ville" || k === "commune" || k === "localisation") && !data.ville && value.length < 60) {
    data.ville = value;
  }
  if ((k === "quartier" || k === "secteur") && !data.quartier && value.length < 60) {
    data.quartier = value;
    if (!data.ville && /[A-ZÀ-Ÿ][a-zà-ÿ]+/.test(value)) {
      const villeFromQ = value.match(/([A-ZÀ-Ÿ][a-zà-ÿ]+(?:[-\s]\d{1,2}[eè](?:me|r)?)?)/);
      if (villeFromQ) data.ville = villeFromQ[1];
    }
  }
  if ((k.includes("chambre") || k === "nb chambres") && !data.nb_chambres) {
    const n = toNumber(value);
    if (n) data.nb_chambres = n;
  }
  if ((k.includes("étage") || k.includes("etage")) && !k.includes("nombre") && !data.etage) {
    if (/^\d+$/.test(value.trim())) data.etage = value.trim();
    else if (/rdc|rez/i.test(value)) data.etage = "RDC";
  }
  if (k.includes("ascenseur") && data.ascenseur === undefined) {
    data.ascenseur = /oui|yes|true|avec/i.test(value);
  }
  if (k.includes("ann") && k.includes("construction") && !data.annee_construction) {
    const y = toNumber(value);
    if (y && y >= 1800 && y <= 2030) data.annee_construction = y;
  }
  if ((k.includes("ges") || (k.includes("gaz") && k.includes("effet"))) && !data.ges) {
    const g = value.match(/([A-G])/);
    if (g) data.ges = g[1].toUpperCase();
  }
  if ((k.includes("dpe") || k.includes("énergie") || k.includes("energie") || k.includes("consommation")) && !data.dpe) {
    const d = value.match(/([A-G])/);
    if (d) data.dpe = d[1].toUpperCase();
  }
  if (k.includes("surface") && !data.surface_m2) {
    const s = toNumber(value);
    if (s && s >= 5 && s <= 5000) data.surface_m2 = s;
  }
  if ((k.includes("pièce") || k.includes("piece") || k === "nb pièces") && !data.nb_pieces) {
    const n = toNumber(value);
    if (n) data.nb_pieces = n;
  }
}

const DESC_SELECTORS = [
  '[itemprop="description"]',
  '[data-qa-id*="description"]',
  '[data-testid*="description"]',
  '[class*="description-content"]',
  '[class*="Description_text"]',
  '[class*="DescriptionTexts"]',
  '[class*="offerDescription"]',
  '[class*="detail-description"]',
  ".item-description",
  "section#details p",
  "div.s-cms",
];

export function extractFullDescription($: cheerio.CheerioAPI): string | undefined {
  let best = "";
  for (const sel of DESC_SELECTORS) {
    $(sel).each((_, el) => {
      const txt = $(el).text()?.trim();
      if (txt && txt.length > best.length) best = txt;
    });
  }
  $("p").each((_, el) => {
    const txt = $(el).text()?.trim();
    if (txt && txt.length > 300 && txt.length > best.length) best = txt;
  });
  return best.length > 100 ? cleanText(best) : undefined;
}

/**
 * Extraction depuis le titre, les balises h1 et les structures clé/valeur du
 * DOM (dt/dd, th/td) — presque tous les sites y exposent ville, quartier et
 * caractéristiques sous une forme plus fiable que le texte libre.
 */
export function extractFromPageMeta($: cheerio.CheerioAPI): ParsedListing {
  const data: ParsedListing = {};

  const ogTitle = $('meta[property="og:title"]').attr("content") ?? "";
  const titleTag = $("title").text() ?? "";
  const h1 = $("h1").first().text() ?? "";
  const titleText = ogTitle || titleTag;

  extractVilleFromTitle(titleText, data);
  if (!data.ville) extractVilleFromTitle(h1, data);

  $("dt").each((_, el) => {
    const label = $(el).text().trim();
    const val = $(el).next("dd").text()?.trim();
    if (label && val) applyKV(label, val, data);
  });

  $("th").each((_, el) => {
    const label = $(el).text().trim();
    const row = $(el).closest("tr");
    const val = row.find("td").first().text()?.trim();
    if (label && val) applyKV(label, val, data);
  });

  $("li").each((_, el) => {
    const txt = $(el).text().trim();
    const kvMatch = txt.match(/^([^:]+?)\s*:\s*(.+)$/);
    if (kvMatch) applyKV(kvMatch[1], kvMatch[2], data);
  });

  const fullDesc = extractFullDescription($);
  if (fullDesc) data.description = fullDesc;

  return data;
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

  const chambres = firstMatch(text, /(\d+)\s?ch(?:ambres?|bres?)\b/i);
  if (chambres) data.nb_chambres = toNumber(chambres);

  if (!data.nb_chambres) {
    const tfNotation = firstMatch(text, /\b[TF](\d)\b/);
    if (tfNotation) {
      const n = parseInt(tfNotation, 10);
      if (n >= 2) data.nb_chambres = n - 1;
    }
  }

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

  if (/\b[àa]\s+r[eé]nover\b/i.test(text)) data.etat_bien = "À rénover";
  else if (/\b[àa]\s+rafra[iî]chir\b/i.test(text)) data.etat_bien = "À rafraîchir";
  else if (/\btr[eè]s\s+bon\s+[eé]tat\b/i.test(text) || /\b(?:excellent|parfait)\s+[eé]tat\b/i.test(text)) data.etat_bien = "Très bon état";
  else if (/\bbon\s+[eé]tat\b/i.test(text) || /\b(?:r[eé]nov[eé]|refait|r[eé]habilit[eé]|restaur[eé]|entretenu)\b/i.test(text)) data.etat_bien = "Bon état";
  else if (/\b(?:programme|bien|logement|construction|[eé]tat|vente\s+de)\s+neuf\b/i.test(text) || /\brefait\s+[àa]\s+neuf\b/i.test(text)) data.etat_bien = "Neuf";

  const annee = firstMatch(text, /construit\w* en (\d{4})/i)
    ?? firstMatch(text, /ann[eé]e de construction\s*[:\-]?\s*(\d{4})/i)
    ?? firstMatch(text, /ann\.?\s*const\.?\s*[:\-]?\s*(\d{4})/i)
    ?? firstMatch(text, /(?:immeuble|r[eé]sidence|b[aâ]timent)\s+(?:de|du)\s+(\d{4})/i)
    ?? firstMatch(text, /(?:b[aâ]ti|[eé]difi[eé]|[eé]rig[eé]|livr[eé])\w*\s+en\s+(\d{4})/i)
    ?? firstMatch(text, /dat\w+\s+(?:de|du)\s+(\d{4})/i)
    ?? firstMatch(text, /(?:des\s+)?ann[ée]es?\s+(\d{4})/i);
  if (annee) data.annee_construction = toNumber(annee);

  const typeBien = firstMatch(text, /\b(studio|appartement|duplex|loft|maison|immeuble)\b/i);
  if (typeBien) {
    const map: Record<string, string> = { studio: "Studio", appartement: "Appartement", duplex: "Duplex", loft: "Loft", maison: "Maison", immeuble: "Immeuble" };
    data.type_bien = map[typeBien.toLowerCase()];
  }

  const chargesMensuellesSimple = firstMatch(text, /charges\s*[:\-]?\s*(\d[\d\s]*)\s*(?:€|euros?)(?:\s*\/\s*mois)/i);
  if (chargesMensuellesSimple) {
    const csv = toNumber(chargesMensuellesSimple);
    if (csv && csv >= 10 && csv <= 2000) data.charges_copro_annuelles = csv * 12;
  }

  if (!data.charges_copro_annuelles) {
    const chargesMensuelles = firstMatch(text, /charges\s+mensuelles\s+copro\s*[:\-]?\s*(\d[\d\s]*)\s*(?:€|euros?)/i);
    if (chargesMensuelles) {
      const cmv = toNumber(chargesMensuelles);
      if (cmv && cmv >= 10 && cmv <= 2000) data.charges_copro_annuelles = cmv * 12;
    }
  }

  if (!data.charges_copro_annuelles) {
    const chargesCopro = firstMatch(text, /charges?\s+(?:de\s+)?copropri[eé]t[eé]\s*[:\-]?\s*(\d[\d\s]*)\s*(?:€|euros?)/i);
    if (chargesCopro) {
      const ccv = toNumber(chargesCopro);
      if (ccv && ccv >= 100 && ccv <= 20000) data.charges_copro_annuelles = ccv;
    }
  }

  const taxeFonciere = firstMatch(text, /taxe\s+fonci[eè]re\s*[:\-]?\s*(\d[\d\s]*)\s*(?:€|euros?)/i)
    ?? firstMatch(text, /T\.?\s*F\.?\s*[:\-]?\s*(\d[\d\s]*)\s*(?:€|euros?)/)
    ?? firstMatch(text, /imp[oô]t\s+foncier\s*[:\-]?\s*(\d[\d\s]*)\s*(?:€|euros?)/i)
    ?? firstMatch(text, /foncier\s+(?:annuel)?\s*[:\-]?\s*(\d[\d\s]*)\s*(?:€|euros?)/i);
  if (taxeFonciere) {
    const tfv = toNumber(taxeFonciere);
    if (tfv && tfv >= 100 && tfv <= 10000) data.taxe_fonciere = tfv;
  }

  const codePostal = firstMatch(text, /\b(\d{5})\b/);
  if (codePostal) data.code_postal = codePostal;

  const villeParenCP = text.match(
    /([A-ZÀ-Ÿ][a-zà-ÿ]+(?:[-\s][a-zà-ÿA-ZÀ-Ÿ][\wà-ÿ'-]*){0,4})\s*\(\s*(\d{5})\s*\)/,
  );
  if (villeParenCP && !NOT_CITY_RE.test(villeParenCP[1].trim())) {
    if (!data.ville) data.ville = villeParenCP[1].trim();
    if (!data.code_postal) data.code_postal = villeParenCP[2];
  }

  if (!data.ville) {
    const villeSitue = firstMatch(
      text,
      /(?:situ[ée]e?|localis[ée]e?|se\s+trouve)\s+(?:à|a|dans|en)\s+([A-ZÀ-Ÿ][a-zà-ÿ]+(?:[-\s][a-zà-ÿA-ZÀ-Ÿ][\wà-ÿ'-]*){0,3})/i,
    );
    if (villeSitue) data.ville = villeSitue;
  }

  if (!data.quartier) {
    const quartier = firstMatch(
      text,
      /quartier\s+(?:de\s+|du\s+|des\s+|d[''])?([A-ZÀ-Ÿ][a-zà-ÿ]+(?:[-\s/][a-zà-ÿA-ZÀ-Ÿ][\wà-ÿ'-]*){0,3})/,
    );
    if (quartier) data.quartier = quartier;
  }

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
