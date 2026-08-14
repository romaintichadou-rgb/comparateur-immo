import { aAdressePrecise } from "@/lib/adresse";
import type { Apartment, PrecisionLocalisation } from "@/lib/types";
import type { BlocAnalyse } from "./types";

/**
 * Périmètre de comparaison — SOURCE UNIQUE pour toutes les sources dont la
 * finesse dépend de la localisation (DVF, Carte des loyers ANIL).
 *
 * ## Pourquoi un type et une fonction partagés
 *
 * Chaque source décidait auparavant de son périmètre dans son coin, avec un
 * critère différent : `precision_localisation` pour DVF, `aAdressePrecise()`
 * (le champ Adresse est-il rempli ?) pour l'ANIL et pour la jointure DPE. Les
 * deux critères divergent dès que la BAN ne résout l'adresse qu'au niveau de
 * la RUE — cas très courant, une voie sans numéro (« Rue de Thumesnil, 59000
 * Lille ») ressort en `type: "street"`. La divergence était visible à l'écran :
 * sur le même bien, le bloc Prix annonçait « arrondissement/commune » pendant
 * que le bloc Rendement annonçait « rayon 500 m ».
 *
 * ⚠️ **Ne pas réintroduire un type de périmètre par source.** Un seul objet
 * `PerimetreAnalyse` est construit par appelant et passé tel quel à `fetchDvf`
 * et `fetchLoyerRef` : deux sources ne PEUVENT plus recevoir deux périmètres
 * différents pour un même bien. `codeInsee` est porté par les deux variantes
 * — DVF ne l'utilise que dans la variante `commune`, l'ANIL s'en sert aussi
 * comme repli quand le reverse-géocodage ne rend rien.
 *
 * ⚠️ **Le périmètre DEMANDÉ n'est pas le périmètre OBTENU.** Chaque source
 * expose le périmètre qu'elle a réellement couvert (`DvfData.perimetreLabel`,
 * `LoyerData.perimetreLabel`) — l'ANIL, en particulier, ne descend jamais sous
 * la commune. Toujours afficher le libellé rendu par la donnée, jamais
 * redéduire le périmètre depuis `precision`.
 */
export type PerimetreAnalyse =
  | { type: "rayon500"; lat: number; lon: number; codeInsee: string }
  | { type: "commune"; codeInsee: string };

/** Ce qu'on sait de la position du bien, quelle qu'en soit la provenance. */
export interface Localisation {
  lat: number | null;
  lon: number | null;
  codeInsee: string;
  precision: PrecisionLocalisation | null;
}

/**
 * La précision atteint-elle AU MOINS ce niveau ?
 *
 * Le seul endroit où l'ordre des niveaux est écrit. Les blocs d'analyse sont
 * des fonctions pures qui ne reçoivent pas de coordonnées : sans ce prédicat
 * ils recopiaient `precision === "exacte" || precision === "rue"` chacun de
 * leur côté — la duplication même que ce module existe pour supprimer.
 */
export function precisionAuMoins(
  precision: PrecisionLocalisation | null,
  niveau: "exacte" | "rue"
): boolean {
  if (precision === "exacte") return true;
  return niveau === "rue" && precision === "rue";
}

/**
 * Les coordonnées désignent-elles le BÂTIMENT, ou seulement un centroïde de
 * voie / de secteur ?
 *
 * Le critère porte sur ce que valent les COORDONNÉES, jamais sur ce que
 * l'utilisateur a saisi. Exporté à part parce que la jointure DPE (ADEME) a
 * besoin du même verdict sans avoir de périmètre à construire : elle joint sur
 * l'identifiant BAN, et un identifiant de VOIE n'apparie rien dans un dataset
 * indexé à l'adresse.
 */
export function coordsAuBatiment(loc: Localisation): boolean {
  return precisionAuMoins(loc.precision, "exacte") && loc.lat != null && loc.lon != null;
}

/**
 * Les coordonnées sont-elles à quelques centaines de mètres du bien ?
 *
 * Vrai pour `exacte` ET `rue` — le milieu d'une voie est un ancrage légitime
 * pour tout ce qui se mesure dans un rayon : ventes DVF, commodités OSM, aléas
 * à maille fine. Faux pour `arrondissement`, où le point est le centre du
 * quartier ou de la commune et où l'écart au bien se compte en kilomètres.
 *
 * ⚠️ **C'est ce prédicat, pas `coordsAuBatiment`, qui garde les sources
 * ponctuelles.** Elles n'étaient auparavant gardées que par « a-t-on des
 * coordonnées ? » : sans adresse, OSM et l'aléa argile tournaient autour du
 * centroïde communal et le résultat s'affichait comme un fait sur le bien.
 * Mesuré à Lille : argile « Exposition faible » rue de Thumesnil,
 * « Exposition moyenne » au centroïde de la commune — deux codes, donc deux
 * pénalités et deux couleurs.
 *
 * Limite connue et assumée : sur une avenue de plusieurs kilomètres, le milieu
 * de la voie peut rester loin du bien. La BAN ne rend pas la longueur de la
 * voie, il n'y a donc rien à mesurer pour l'exclure — et le cas reste très
 * favorable comparé au centroïde communal qu'il remplace.
 */
export function coordsDansLeSecteur(loc: Localisation): boolean {
  return precisionAuMoins(loc.precision, "rue") && loc.lat != null && loc.lon != null;
}

/**
 * Périmètre à interroger, ou `null` si on ne sait rien situer (ni coordonnées
 * exploitables, ni code INSEE).
 */
export function perimetreAnalyse(loc: Localisation): PerimetreAnalyse | null {
  if (coordsDansLeSecteur(loc)) {
    return {
      type: "rayon500",
      lat: loc.lat as number,
      lon: loc.lon as number,
      codeInsee: loc.codeInsee,
    };
  }
  return loc.codeInsee ? { type: "commune", codeInsee: loc.codeInsee } : null;
}

/**
 * Bannière « complète l'adresse » d'un bloc — SOURCE UNIQUE de sa formulation.
 *
 * Trois blocs perdent en finesse quand la position est trop grossière (Prix,
 * Potentiel, Risques), et les trois l'annonçaient dans des mots différents :
 * deux invites rédigées chacune de leur côté et, pour les Risques, une phrase
 * noyée dans les « données manquantes ». Le lecteur voyait trois messages sans
 * comprendre qu'ils décrivent UNE seule cause.
 *
 * Structure imposée, identique partout : **constat → action → gain propre au
 * bloc**. Seul `gain` varie ; le constat et le verbe d'action sont communs.
 *
 * ⚠️ **`requiert` n'est pas décoratif : les blocs n'ont pas le même besoin.**
 * Prix et Potentiel se contentent du niveau `rue` (un rayon ancré sur la voie
 * est exploitable) — leur invite doit donc se TAIRE en niveau `rue`, sinon elle
 * réclame un numéro qui ne changerait rien. Les Risques exigent `exacte` : la
 * jointure DPE se fait par identifiant BAN, et un identifiant de voie n'apparie
 * rien. Une invite unique pour les trois envoyait forcément un mauvais message
 * à l'un d'eux.
 *
 * @param gain complément de « … pour {gain} », à l'infinitif, sans point final.
 * @returns `undefined` quand la position atteint déjà le niveau requis.
 */
export function inviteAdresse(
  apt: Pick<Apartment, "id" | "adresse">,
  precision: PrecisionLocalisation | null,
  opts: { requiert: "exacte" | "rue"; gain: string }
): BlocAnalyse["invite"] {
  if (precisionAuMoins(precision, opts.requiert)) return undefined;

  // Niveau `rue` alors que le bloc exige le bâtiment : le champ Adresse est
  // rempli et correct, seul le NUMÉRO manque. Lui dire « renseigne l'adresse
  // exacte » l'enverrait corriger un champ sans défaut visible.
  const numeroSeulManquant = precision === "rue";
  const constat = numeroSeulManquant
    ? "L'adresse saisie n'a pu être localisée qu'au niveau de la rue, pas du bâtiment."
    : aAdressePrecise(apt)
      ? "L'adresse saisie n'a pas pu être localisée : le bien n'est situé qu'au niveau de la commune."
      : "Sans adresse, le bien n'est situé qu'au niveau de la commune.";
  const action = numeroSeulManquant ? "Ajoute le numéro de voie" : "Renseigne l'adresse exacte";

  return {
    text: `${constat} ${action} pour ${opts.gain}.`,
    href: `/appartements/${apt.id}?tab=donnees&edit=1`,
    linkLabel: "Compléter l'adresse",
  };
}
