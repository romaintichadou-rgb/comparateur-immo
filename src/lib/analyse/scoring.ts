import { DEFAULT_SETTINGS, type AppSettings } from "../settings";
import { BLOC_POIDS_SANS_PRIX, type AnalyseIA, type BlocAnalyse, type BlocKey, type Decision, type Verdict } from "./types";

/**
 * Seuils de rendement net (objectif principal : la rentabilité locative), en
 * fraction (0.04 = 4 %). En dessous du seuil rédhibitoire, un bien ne remplit
 * pas l'objectif : le score global est plafonné ET un verdict d'alerte est
 * émis, quel que soit le reste (un excellent prix ne compense pas un
 * rendement qui ne couvre pas le coût du crédit + la fiscalité).
 *
 * Configurables par l'utilisateur (page Paramètres, persistés dans
 * l'AppSettings) — les valeurs par défaut ci-dessous ne servent que de repli
 * si les réglages n'ont pas pu être chargés.
 */
export interface RendementSeuils {
  redhibitoire: number;
  modeste: number;
}

export const SEUILS_RENDEMENT_DEFAUT: RendementSeuils = {
  redhibitoire: DEFAULT_SETTINGS.rendementSeuilRougePct / 100,
  modeste: DEFAULT_SETTINGS.rendementSeuilVertPct / 100,
};

export function seuilsRendementFromSettings(settings: AppSettings): RendementSeuils {
  return {
    redhibitoire: settings.rendementSeuilRougePct / 100,
    modeste: settings.rendementSeuilVertPct / 100,
  };
}

/**
 * Tonalité du rendement net, dérivée des MÊMES seuils que le score et les
 * verdicts — pour que la couleur affichée corresponde toujours à la même
 * logique de décision, partout dans l'app (Analyse IA, Détails de
 * l'opération, tableau, carte). "neutral" seulement si la donnée est
 * indisponible.
 */
export type RendementTone = "positif" | "attention" | "alerte" | "neutral";

export function rendementNetTone(
  rendementNet: number | null,
  seuils: RendementSeuils = SEUILS_RENDEMENT_DEFAUT
): RendementTone {
  if (rendementNet == null) return "neutral";
  if (rendementNet >= seuils.modeste) return "positif";
  if (rendementNet >= seuils.redhibitoire) return "attention";
  return "alerte";
}

/** Seuils de cash-flow mensuel (€), profil investisseur. Au-dessus du vert =
 * positif ; entre vert et rouge = attention ; sous le rouge = alerte. Mêmes
 * seuils que ceux utilisés pour colorer le cash-flow du bloc Simulation. */
export interface CashflowSeuils {
  vert: number;
  rouge: number;
}

export function cashflowTone(
  cashflow: number | null,
  seuils: CashflowSeuils
): RendementTone {
  if (cashflow == null) return "neutral";
  if (cashflow >= seuils.vert) return "positif";
  if (cashflow >= seuils.rouge) return "attention";
  return "alerte";
}

export function cashflowSeuilsFromSettings(settings: AppSettings): CashflowSeuils {
  return { vert: settings.cashflowSeuilVertEuros, rouge: settings.cashflowSeuilRougeEuros };
}

/**
 * Classe de texte par tonalité — SOURCE UNIQUE. Toute valeur colorée par un
 * seuil du profil investisseur (rendement, cash-flow, écart) passe par ici,
 * pour qu'un même chiffre ne soit jamais peint différemment d'un écran à
 * l'autre. Ne pas redéfinir cette table localement dans un composant.
 */
export const TONE_TEXT_CLASS: Record<RendementTone, string> = {
  positif: "text-emerald-700",
  attention: "text-amber-700",
  alerte: "text-red-600",
  neutral: "text-ink-900",
};

/**
 * Variante SUR FOND TEINTÉ — panneaux de détail, cartes statistiques, pills.
 * Distincte de `TONE_TEXT_CLASS` (texte sur blanc) parce que la lisibilité sur
 * un fond `*-50` demande un cran de plus : c'est la règle « 600 sur blanc, 700
 * sur teinte » (voir AGENTS.md), pas une seconde palette.
 *
 * Les quatre slots suivent la même marche pour les trois tonalités — le rouge
 * ne fait pas exception (il restait un cran en dessous dans les copies locales
 * de `RendementDetailPanel` / `CashflowDetailPanel`, corrigé).
 *
 * `sub` sert aux cartes à trois lignes (label / valeur / précision). Ne pas
 * recréer de table teintée locale : c'était le cas dans les deux panneaux de
 * détail (copies identiques), `ApartmentsMap` et `LoyerDetailPanel`.
 */
export interface TonePanelStyle {
  wrap: string;
  label: string;
  value: string;
  sub: string;
}

export const TONE_PANEL_STYLES: Record<RendementTone, TonePanelStyle> = {
  neutral: { wrap: "bg-ink-50", label: "text-ink-500", value: "text-ink-900", sub: "text-ink-500" },
  positif: { wrap: "bg-emerald-50", label: "text-emerald-700", value: "text-emerald-800", sub: "text-emerald-600" },
  attention: { wrap: "bg-amber-50", label: "text-amber-700", value: "text-amber-800", sub: "text-amber-600" },
  alerte: { wrap: "bg-red-50", label: "text-red-700", value: "text-red-800", sub: "text-red-600" },
};

/**
 * Tonalité d'une note /10 — SOURCE UNIQUE (≥ 7 → vert). Utilisée par les
 * sous-scores du verdict, les FlatSections et l'anneau de score du tableau :
 * un 7,5 doit être vert PARTOUT, jamais vert sur une page et ambre sur une
 * autre. Ne pas réintroduire de seuil local.
 */
export type ScoreTone = "emerald" | "amber" | "red" | "neutral";

export function noteTone(note: number | null): ScoreTone {
  if (note == null) return "neutral";
  if (note >= 7) return "emerald";
  if (note >= 5) return "amber";
  return "red";
}

export const NOTE_TEXT_CLASS: Record<ScoreTone, string> = {
  emerald: "text-emerald-700",
  amber: "text-amber-700",
  red: "text-red-600",
  neutral: "text-ink-400",
};

/**
 * Couleur des ANNEAUX DE SCORE — pilotée par la DÉCISION, pas par la note.
 *
 * L'anneau de l'accueil (`ScoreRing`) et la jauge de la fiche (`VerdictGauge`)
 * sont le même objet visuel : un cercle, le score /10 au centre, rempli à
 * `score / 10`. Ils doivent donc dire la même chose. Or score et décision ne
 * coïncident pas : un bien à 7,5 surcoté est « Négocie », alors que sa note
 * seule le ferait passer pour vert. C'est la DÉCISION qui prime — c'est
 * l'information qu'on cherche en parcourant une liste d'annonces.
 *
 * Ne PAS recolorer ces anneaux avec `noteTone()` : ce dernier reste réservé aux
 * notes affichées comme telles (sous-scores du verdict, FlatSections), qui ne
 * portent pas de décision.
 *
 * Le fond de piste (`track`) n'est pas ici : il dépend du support (fond blanc
 * du tableau vs carte teintée de la fiche), c'est de l'habillage local.
 */
export type DecisionTone = Decision | "inconnu";

export const DECISION_RING_STYLES: Record<DecisionTone, { stroke: string; text: string; fill: string }> = {
  achete: { stroke: "stroke-emerald-500", text: "text-emerald-700", fill: "fill-emerald-700" },
  negocie: { stroke: "stroke-amber-400", text: "text-amber-700", fill: "fill-amber-700" },
  passe: { stroke: "stroke-red-500", text: "text-red-600", fill: "fill-red-600" },
  inconnu: { stroke: "stroke-ink-300", text: "text-ink-400", fill: "fill-ink-400" },
};

/**
 * Pastille compacte de décision — en-tête de la fiche bien (`ApartmentDetail`).
 *
 * Les libellés sont COURTS et donc distincts des titres longs de la carte
 * verdict (`AnalyseIA` : « Achète — si tu négocies »), qui ne tiennent pas dans
 * une pastille. Ce n'est pas une divergence : la décision reste calculée par
 * `computeDecision` seul, seule sa mise en mots change avec la place
 * disponible. Rangée ici avec `DECISION_RING_STYLES` pour que toute la
 * présentation d'une décision vive au même endroit.
 *
 * Teintes en 700 sur fond 50, comme le veut la charte pour du texte sur fond
 * teinté (voir « Intensité du rouge » dans AGENTS.md).
 */
export const DECISION_CHIP: Record<DecisionTone, { label: string; className: string }> = {
  achete: { label: "À acheter", className: "border-emerald-100 bg-emerald-50 text-emerald-700" },
  negocie: { label: "À négocier", className: "border-amber-100 bg-amber-50 text-amber-700" },
  passe: { label: "À écarter", className: "border-red-100 bg-red-50 text-red-700" },
  inconnu: { label: "Non analysé", className: "border-ink-100 bg-ink-50 text-ink-500" },
};

/**
 * Anneau de survol pour un rendement cliquable, dans la teinte de la tonalité
 * affichée (jamais une couleur fixe comme indigo, sans rapport avec la box).
 *
 * Utilisé par les supports qui ont la place : carte mobile, popup de la carte,
 * highlights de l'Analyse. Les contextes denses gardent une autre affordance —
 * soulignement pointillé dans le tableau, fond + bordure sur les tuiles
 * `ResultCard`. Ce qui est commun à tous, c'est que le survol reprend la
 * TONALITÉ ; la forme, elle, suit le support (voir AGENTS.md).
 */
export const RENDEMENT_HOVER_RING: Record<RendementTone, string> = {
  neutral: "hover:ring-2 hover:ring-inset hover:ring-ink-200",
  positif: "hover:ring-2 hover:ring-inset hover:ring-emerald-200",
  attention: "hover:ring-2 hover:ring-inset hover:ring-amber-200",
  alerte: "hover:ring-2 hover:ring-inset hover:ring-red-200",
};


/**
 * Calcul de la note globale /10, pondérée par bloc, avec plafonds rédhibitoires.
 *
 * - Seuls les blocs notés entrent dans la moyenne (poids renormalisés).
 * - Plafond risque : risque <= 4 → global plafonné à 4.
 * - Plafond rendement : rendement net < seuil rédhibitoire → global plafonné
 *   à 5 (l'objectif locatif n'est pas rempli). C'est le garde-fou contre la
 *   "dilution" d'un point rédhibitoire par la moyenne pondérée.
 */
export function computeScoreGlobal(
  blocs: Record<BlocKey, BlocAnalyse>,
  rendementNet: number | null,
  seuils: RendementSeuils = SEUILS_RENDEMENT_DEFAUT
): number | null {
  const prixNote = blocs.prix.note != null;
  const poidsMap = prixNote ? null : BLOC_POIDS_SANS_PRIX;
  const poids = (b: BlocAnalyse) => poidsMap ? poidsMap[b.cle] : b.poids;

  const notes = (Object.values(blocs) as BlocAnalyse[]).filter((b) => b.note != null);
  if (notes.length === 0) return null;

  const poidsTotal = notes.reduce((s, b) => s + poids(b), 0);
  if (poidsTotal === 0) return null;

  let global = notes.reduce((s, b) => s + (b.note as number) * poids(b), 0) / poidsTotal;

  const risque = blocs.risque;
  if (risque.note != null && risque.note <= 4) global = Math.min(global, 4);

  if (rendementNet != null && rendementNet < seuils.redhibitoire) {
    global = Math.min(global, 5);
  }

  return round1(global);
}

/** Applique la note globale à une analyse (mutation-free). */
export function withScoreGlobal(
  analyse: AnalyseIA,
  rendementNet: number | null,
  seuils: RendementSeuils = SEUILS_RENDEMENT_DEFAUT
): AnalyseIA {
  return { ...analyse, score_global: computeScoreGlobal(analyse.blocs, rendementNet, seuils) };
}

/**
 * Verdicts DPE (calendrier loi Climat) — TABLE UNIQUE, lue à deux endroits :
 * `buildVerdicts` les émet tous, et l'en-tête de l'onglet Analyse n'affiche
 * que ceux marqués `enTete`.
 *
 * ⚠️ `enTete` n'est PAS un synonyme de « niveau alerte » : E est écarté de
 * l'en-tête parce que son échéance (2034) ne pèse sur aucun arbitrage d'achat
 * du moment, alors que G est déjà interdit et F l'est à court terme. Le cas E
 * reste documenté dans le bloc Risques (fait « Réglementaire — loi Climat »)
 * et repris comme levier dans Optimiser — il n'est pas perdu, il est rangé
 * au bon niveau de lecture.
 *
 * ⚠️ Invariant tenu par l'UI : `enTete: true` implique `niveau: "alerte"` —
 * l'en-tête d'Analyse peint cet avis en rouge sans consulter le niveau. Passer
 * une entrée `attention` à `enTete: true` afficherait une échéance lointaine
 * dans la couleur du rédhibitoire.
 */
export const VERDICTS_DPE: Record<string, Verdict & { enTete: boolean }> = {
  G: {
    niveau: "alerte",
    titre: "DPE G — interdit à la location",
    detail: "Passoire thermique interdite à la location depuis le 1er janvier 2025 (loi Climat). Des travaux de rénovation énergétique sont obligatoires avant toute mise en location.",
    origine: "critere",
    enTete: true,
  },
  F: {
    niveau: "alerte",
    titre: "DPE F — interdiction de louer en 2028",
    detail: "Passoire thermique interdite à la location à partir de 2028 (loi Climat). Des travaux de rénovation énergétique coûteux seront nécessaires, impactant fortement la rentabilité.",
    origine: "critere",
    enTete: true,
  },
  E: {
    niveau: "attention",
    titre: "DPE E — interdiction de louer en 2034",
    detail: "Logement classé E, interdit à la location à partir de 2034 (loi Climat). Des travaux de rénovation énergétique seront nécessaires à moyen terme.",
    origine: "critere",
    enTete: false,
  },
};

/** Entrée de `VERDICTS_DPE` pour une lettre nullable, casse et espaces libres. */
function entreeDpe(dpe: string | null | undefined) {
  return VERDICTS_DPE[(dpe ?? "").trim().toUpperCase()];
}

/** Verdict DPE d'une lettre, ou `null` si la classe n'est pas concernée. */
export function verdictDpe(dpe: string | null | undefined): Verdict | null {
  const entree = entreeDpe(dpe);
  if (!entree) return null;
  const { enTete: _enTete, ...verdict } = entree;
  return verdict;
}

/**
 * Verdict DPE à afficher en tête de l'onglet Analyse, ou `null`. SEUL avis
 * conservé dans cet en-tête (voir `docs/reference/analyse-optimiser.md`) :
 * tous les autres verdicts y étaient déjà lisibles ailleurs à l'écran.
 */
export function avisDpeEnTete(dpe: string | null | undefined): Verdict | null {
  return entreeDpe(dpe)?.enTete ? verdictDpe(dpe) : null;
}

/**
 * Verdicts textuels indépendants du score : ils nomment explicitement les
 * points rédhibitoires ou de vigilance, en tête d'analyse, pour qu'ils ne
 * soient jamais noyés dans un score composite « visuellement rassurant ».
 */
export function buildVerdicts(
  blocs: Record<BlocKey, BlocAnalyse>,
  rendementNet: number | null,
  seuils: RendementSeuils = SEUILS_RENDEMENT_DEFAUT
): Verdict[] {
  const verdicts: Verdict[] = [];

  // 1) Gate rendement (objectif prioritaire) — en tête.
  if (rendementNet != null) {
    const pct = (rendementNet * 100).toFixed(1).replace(".", ",");
    if (rendementNet < seuils.redhibitoire) {
      verdicts.push({
        niveau: "alerte",
        titre: "Rendement insuffisant",
        detail: `Rendement net ~${pct} %, sous le seuil de ${(seuils.redhibitoire * 100).toFixed(0)} % : ce bien ne remplit pas l'objectif locatif principal. Après coût du crédit et fiscalité, le cash-flow risque d'être négatif.`,
        origine: "critere",
      });
    } else if (rendementNet < seuils.modeste) {
      verdicts.push({
        niveau: "attention",
        titre: "Rendement modeste",
        detail: `Rendement net ~${pct} %, correct mais sans marge : à valider selon ton coût de financement et ta fiscalité.`,
        origine: "critere",
      });
    }
  }

  // 2) DPE passoire thermique — verdict dédié, indépendant du score du bloc.
  const dpeVerdict = verdictDpe(blocs.risque.dpeGes?.dpe);
  if (dpeVerdict) verdicts.push(dpeVerdict);

  // 3) Tout bloc noté ≤ 5/10 remonte comme point d'attention critique.
  //    "simulation" est exclu : le cash-flow dépend du montage financier
  //    personnel, pas de la qualité intrinsèque du bien.
  const BLOCS_INFORMATIFS: Set<string> = new Set(["simulation", "quartier"]);

  const BLOC_VERDICT_FAIBLE: Record<BlocKey, { titre: string; detail: string }> = {
    prix: { titre: "Prix trop élevé", detail: "Le prix affiché est supérieur aux ventes comparables du secteur — la marge de rentabilité est réduite." },
    location: { titre: "Faible rendement", detail: "Demande locative faible ou loyer atteignable insuffisant pour le prix d'achat." },
    simulation: { titre: "Mauvais cash-flow mensuel", detail: "Après crédit et fiscalité, l'effort d'épargne mensuel est élevé — vérifie le financement." },
    potentiel: { titre: "Peu de potentiel", detail: "Peu de marge de plus-value à la revente ou de revalorisation locative." },
    risque: { titre: "Risques élevés", detail: "Un ou plusieurs facteurs de risque pèsent sur cet investissement — voir le détail ci-dessous." },
    quartier: { titre: "Quartier défavorable", detail: "L'environnement du bien présente des faiblesses (services, transports, dynamique)." },
  };

  for (const b of Object.values(blocs) as BlocAnalyse[]) {
    if (BLOCS_INFORMATIFS.has(b.cle)) continue;
    if (b.note != null && b.note <= 5) {
      const labels = BLOC_VERDICT_FAIBLE[b.cle as BlocKey];
      verdicts.push({
        niveau: b.note <= 4 ? "alerte" : "attention",
        titre: labels?.titre ?? `${b.titre} faible`,
        detail: labels?.detail ?? "Un des critères est défavorable — voir le détail du bloc ci-dessous.",
        origine: "bloc",
      });
    }
  }

  // 4) Points forts marquants (note ≥ 9/10) — équilibre, en dernier, max 2.
  const BLOC_VERDICT_FORT: Record<BlocKey, string> = {
    prix: "Prix d'achat très compétitif",
    location: "Rendement élevé",
    simulation: "Cash-flow confortable",
    potentiel: "Fort potentiel de valorisation",
    risque: "Profil de risque très sain",
    quartier: "Quartier attractif",
  };

  const forts = (Object.values(blocs) as BlocAnalyse[])
    .filter((b) => b.note != null && !BLOCS_INFORMATIFS.has(b.cle) && (b.note as number) >= 9)
    .sort((a, b) => (b.note as number) - (a.note as number))
    .slice(0, 2);
  for (const b of forts) {
    verdicts.push({
      niveau: "positif",
      titre: BLOC_VERDICT_FORT[b.cle as BlocKey] ?? b.titre,
      detail: "Point fort du bien — voir le détail du bloc ci-dessous.",
      origine: "bloc",
    });
  }

  return verdicts;
}

/** Libellé + tonalité d'une pastille de catégorie. */
export interface ScoreCategorieInfo {
  label: string;
  tone: ScoreTone;
}

/**
 * Catégorie qualitative d'un BLOC d'analyse (section individuelle),
 *
 * ⚠️ Il n'existe volontairement PAS d'équivalent pour le score GLOBAL. Un
 * `scoreCategorie(score)` a existé, dont la tranche 5–7 s'intitulait « À
 * négocier » — le vocabulaire de la DÉCISION appliqué à une simple tranche de
 * note. Les deux classements s'affichaient côte à côte et se contredisaient
 * (pastille « À négocier » sous un titre « Passe ton chemin »). Le score global
 * ne porte plus qu'une décision, via `DECISION_CHIP`.
 * distincte du verdict global. Les labels décrivent la qualité du thème
 * évalué, pas le profil d'investissement.
 */
const BLOC_CATEGORIES: Record<string, ScoreCategorieInfo> = {
  excellent: { label: "Excellent", tone: "emerald" },
  favorable: { label: "Favorable", tone: "emerald" },
  moyen: { label: "Moyen", tone: "amber" },
  faible: { label: "Faible", tone: "red" },
  critique: { label: "Critique", tone: "red" },
  inconnu: { label: "Données insuffisantes", tone: "neutral" },
};

export function blocCategorie(note: number | null): ScoreCategorieInfo {
  if (note == null) return BLOC_CATEGORIES.inconnu;
  if (note >= 8.5) return BLOC_CATEGORIES.excellent;
  if (note >= 7) return BLOC_CATEGORIES.favorable;
  if (note >= 5) return BLOC_CATEGORIES.moyen;
  if (note >= 3.5) return BLOC_CATEGORIES.faible;
  return BLOC_CATEGORIES.critique;
}

/**
 * Interpolation linéaire par morceaux sur une table d'ancrages — MÉCANISME
 * UNIQUE de notation des critères CONTINUS (pourcentage, ratio, comptage).
 *
 * ⚠️ **Ne jamais noter un critère continu par une cascade de ternaires.** Une
 * cascade produit un escalier : elle est plate à l'intérieur d'une marche et
 * saute d'un bloc à la frontière. Mesuré sur le bloc Potentiel avant migration,
 * l'évolution des prix du secteur rendait la MÊME note de 0 % à +14 %, puis
 * bondissait de 0,8 point entre +14 % et +15 %. Deux défauts pour le prix d'un :
 * aucune gradation là où elle compte, et une falaise arbitraire au milieu.
 *
 * `points` doit être trié par `x` croissant. En dehors des bornes, la valeur
 * est plafonnée au premier / dernier ancrage — les plateaux extrêmes sont
 * VOLONTAIRES (au-delà d'un certain niveau, « c'est excellent » ne se nuance
 * plus), contrairement aux plateaux intermédiaires qui sont des défauts.
 *
 * Les critères CATÉGORIELS ne passent pas par ici : une étiquette DPE, une
 * classe radon ou une zone sismique n'ont pas de valeurs intermédiaires. Leur
 * escalier reflète le réel, il ne l'invente pas.
 */
export function interpole(x: number, points: readonly (readonly [number, number])[]): number {
  const premier = points[0];
  if (x <= premier[0]) return premier[1];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return points[points.length - 1][1];
}

export function clampNote(n: number): number {
  return round1(Math.max(0, Math.min(10, n)));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
