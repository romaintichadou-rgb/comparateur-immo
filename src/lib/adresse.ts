/**
 * Assemblage des quatre champs de localisation (`adresse`, `quartier`,
 * `ville`, `code_postal`) en une chaîne utilisable — SOURCE UNIQUE.
 *
 * Ces quatre champs étaient recollés à la main dans neuf endroits, avec trois
 * ordres différents et deux ponctuations différentes. Conséquences constatées :
 *
 * - le **code postal n'apparaissait nulle part** dans l'UI ni dans les liens
 *   Google Maps — « 12 rue des Lilas, Marseille » désigne autant de rues que la
 *   ville a d'arrondissements ;
 * - la **ville disparaissait du sous-titre de la fiche** dès qu'une adresse
 *   précise était renseignée (`apt.adresse || "quartier, ville"` : le `||`
 *   écarte la ville avec le reste du repli) ;
 * - `[cp, ville].join(", ")` produisait « 75020, Paris », alors que la norme
 *   postale française écrit « 75020 Paris » sans virgule.
 *
 * Trois formes, choisies par CONTEXTE de lecture (pas au jugé) :
 *
 * | Fonction | Rend | Où |
 * |---|---|---|
 * | `formatAdressePostale` | « 12 rue des Lilas, 75020 Paris » | sous-titre de fiche, lien Maps, géocodage exact |
 * | `formatSecteur` | « Belleville, 75020 Paris » | prompts IA (loyer, charges), géocodage approximatif |
 * | `formatLocalisationCourte` | « Belleville, Paris » | listes denses (tableau, cartes, popup de la carte) |
 *
 * Toutes tolèrent n'importe quelle combinaison de champs vides : chaque partie
 * absente est simplement omise, sans laisser de virgule orpheline.
 */

export interface ChampsAdresse {
  adresse?: string | null;
  quartier?: string | null;
  ville?: string | null;
  code_postal?: string | null;
}

/**
 * Trim + espaces internes réduites à une seule.
 *
 * ⚠️ Indispensable AVANT tout `filter(Boolean)` : une chaîne d'espaces est
 * *truthy*, donc `["  ", "Paris"].filter(Boolean).join(", ")` rendait
 * « ␣␣, Paris ». C'est le mode d'échec des neuf assemblages remplacés ici, et
 * il se déclenche au moindre champ saisi puis vidé à coups d'espaces.
 */
function nettoyer(valeur: string | null | undefined): string {
  return (valeur ?? "").trim().replace(/\s+/g, " ");
}

/**
 * Clé de comparaison : minuscules, sans accents, sans ponctuation ni espaces.
 * Sert uniquement à repérer un doublon (« Paris » vs « paris », « Saint-Denis »
 * vs « saint denis »), jamais à produire du texte affiché.
 */
function clef(valeur: string | null | undefined): string {
  return nettoyer(valeur)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Bloc commune SEUL, à la norme postale : « 75020 Paris », espace et non
 * virgule — sans le quartier, contrairement à `formatSecteur`. Rend « 75020 »
 * ou « Paris » seul si l'autre manque, « » si les deux manquent.
 *
 * Exporté (pas seulement interne à `formatAdressePostale`/`formatSecteur`) :
 * c'est l'échelle à laquelle la référence ANIL est calculée (commune, ou
 * arrondissement pour Paris/Lyon/Marseille — le code postal la distingue déjà
 * dans ces trois villes) — `rentEstimation.ts` en a besoin pour dire à l'IA
 * QUELLE échelle est déjà couverte par l'ancre, distincte du quartier
 * potentiellement plus fin qu'elle contient.
 */
export function formatCommune(a: ChampsAdresse): string {
  return [nettoyer(a.code_postal), nettoyer(a.ville)].filter(Boolean).join(" ");
}

/**
 * Retire de la fin d'une voie les segments qui répètent la commune.
 *
 * Les extracteurs livrent une `adresse` tantôt réduite à la voie
 * (« 12 rue des Lilas »), tantôt déjà complète (« 12 rue des Lilas, Paris »,
 * `streetAddress` de certains JSON-LD). Sans ce nettoyage, la seconde forme
 * donnait « 12 rue des Lilas, Paris, 75020 Paris ».
 *
 * Le découpage se fait sur les virgules et ne retire QUE des segments de queue,
 * en gardant toujours le premier : une voie ne peut jamais être effacée
 * entièrement, même si elle est homonyme de sa commune (« Paris » à Paris).
 */
function segmentsVoie(voie: string, a: ChampsAdresse): string[] {
  const cp = nettoyer(a.code_postal);
  const ville = nettoyer(a.ville);
  const redondants = new Set(
    [clef(ville), clef(cp), clef(`${cp} ${ville}`), clef(`${ville} ${cp}`)].filter(Boolean)
  );

  const segments = voie.split(",").map(nettoyer).filter(Boolean);
  while (segments.length > 1 && redondants.has(clef(segments[segments.length - 1]))) {
    segments.pop();
  }
  return segments;
}

/** `true` dès qu'une adresse de voie est renseignée (au-delà des espaces). */
export function aAdressePrecise(a: ChampsAdresse): boolean {
  return nettoyer(a.adresse) !== "";
}

/**
 * Adresse postale la plus complète possible, sur une ligne.
 *
 * « 12 rue des Lilas, 75020 Paris ». Sans voie, le quartier prend sa place
 * (« Belleville, 75020 Paris ») : le quartier n'est pas une donnée postale,
 * mais c'est le repère le plus fin dont on dispose quand la rue manque — cas
 * courant, Leboncoin n'affichant pas l'adresse publiquement.
 *
 * Quand la voie EST renseignée, le quartier est volontairement omis : il
 * n'aiderait ni la BAN ni Google Maps, et la fiche l'affiche déjà à part.
 */
export function formatAdressePostale(a: ChampsAdresse): string {
  const voie = nettoyer(a.adresse) || nettoyer(a.quartier);
  const parties = voie ? segmentsVoie(voie, a) : [];
  const commune = formatCommune(a);
  if (commune) parties.push(commune);
  return parties.join(", ");
}

/**
 * Le secteur, sans la voie : « Belleville, 75020 Paris ».
 *
 * C'est l'échelle des estimations (loyer, charges) et du géocodage de repli —
 * aucune des deux n'a affaire à un numéro de rue.
 */
export function formatSecteur(a: ChampsAdresse): string {
  const quartier = nettoyer(a.quartier);
  const parties = quartier ? segmentsVoie(quartier, a) : [];
  const commune = formatCommune(a);
  if (commune) parties.push(commune);
  return parties.join(", ");
}

/**
 * Libellé compact des listes : « Belleville, Paris ».
 *
 * Le code postal est écarté ici, et lui seul : dans une colonne de tableau il
 * n'aide pas à reconnaître un bien parmi d'autres, alors qu'il désambiguïse
 * une requête envoyée à la BAN ou à Google Maps. Repli sur la voie quand ni
 * quartier ni ville ne sont connus.
 */
export function formatLocalisationCourte(a: ChampsAdresse): string {
  const secteur = [nettoyer(a.quartier), nettoyer(a.ville)].filter(Boolean).join(", ");
  if (secteur) return secteur;
  const voie = nettoyer(a.adresse);
  return voie ? segmentsVoie(voie, a).join(", ") : "";
}

/**
 * Lien Google Maps du bien, ou `null` si on ne sait rien le situer.
 *
 * Recherche par adresse dès qu'une voie est connue — c'est ce qui ouvre le bon
 * bâtiment plutôt qu'un point sur une carte, et la requête porte désormais le
 * code postal, sans quoi une rue homonyme d'un autre arrondissement pouvait
 * ressortir. Sinon repli sur les coordonnées, qui montrent exactement où l'app
 * a posé son pin : pour une position approchée (centre de quartier), afficher
 * un résultat de recherche laisserait croire à une précision qu'on n'a pas.
 */
export function lienGoogleMaps(
  a: ChampsAdresse,
  latitude: number | null | undefined,
  longitude: number | null | undefined
): string | null {
  if (aAdressePrecise(a)) {
    const requete = formatAdressePostale(a);
    if (requete) {
      return `https://www.google.com/maps/search/${encodeURIComponent(requete)}`;
    }
  }
  if (latitude != null && longitude != null) {
    return `https://www.google.com/maps/@${latitude},${longitude},17z`;
  }
  return null;
}
