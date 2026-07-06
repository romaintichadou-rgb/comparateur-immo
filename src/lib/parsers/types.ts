import type { Plateforme } from "../types";

// Sous-ensemble des champs Apartment que les parsers savent extraire.
// Tout champ non trouvé reste undefined — jamais de valeur inventée.
export interface ParsedListing {
  description?: string;
  prix?: number;
  surface_m2?: number;
  nb_pieces?: number;
  nb_chambres?: number;
  etage?: string;
  ascenseur?: boolean;
  annee_construction?: number;
  etat_bien?: string;
  dpe?: string;
  ges?: string;
  charges_copro_annuelles?: number;
  adresse?: string;
  quartier?: string;
  ville?: string;
  code_postal?: string;
  photo_url?: string;
  contact_telephone?: string;
  contact_email?: string;
}

export interface ParseResult {
  ok: boolean;
  /** true si un dispositif anti-bot a empêché toute extraction */
  blocked: boolean;
  /** message à afficher à l'utilisateur (raison de l'échec/blocage) */
  message?: string;
  data: ParsedListing;
  /** liste des clés de `data` effectivement trouvées, pour le mode debug */
  champsExtraits: (keyof ParsedListing)[];
}

export interface DomainParser {
  plateforme: Plateforme;
  /** domaines gérés par ce parser, ex: ["leboncoin.fr", "www.leboncoin.fr"] */
  domains: string[];
  parse(url: string): Promise<ParseResult>;
}
