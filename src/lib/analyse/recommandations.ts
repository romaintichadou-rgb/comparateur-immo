import { isImmeuble, type Apartment, type ApartmentWithComputed, type PrecisionLocalisation } from "@/lib/types";
import type { AppSettings } from "@/lib/settings";
import { computeDerived } from "@/lib/calculations";
import { capitalEffectif, resolveInputs, simulate } from "@/lib/simulation";
import { buildVerdicts, computeScoreGlobal, type RendementSeuils } from "./scoring";
import { computeDecision, ecartPrixMarche } from "./decision";
import { buildBlocPrix } from "./blocs/prix";
import { buildBlocLocation } from "./blocs/location";
import { referenceCCMeuble, typologieAnil } from "@/lib/anilReference";
import { lotsEffectifs } from "@/lib/estimates";
import { buildBlocRisque } from "./blocs/risque";
import { buildBlocSimulation } from "./blocs/simulation";
import type { Argument, BlocAnalyse, BlocKey, Decision, Recommandation, Verdict } from "./types";
import type { DvfData } from "./sources/dvf";
import type { LoyerReference } from "./sources/loyers";
import type { DpeData } from "./sources/ademe";
import type { GeorisquesData } from "./sources/georisques";

/**
 * Moteur de recommandations PRESCRIPTIVES (onglet "Optimiser"), orienté
 * DÉCISION + RENTABILITÉ (pas le score).
 *
 * Deux modes selon le verdict actuel (source unique : decision.ts) :
 *  - verdict ≠ "Achète" → ce qu'il faut pour EN FAIRE UN ACHAT. Le levier prix
 *    calcule le prix EXACT à négocier pour basculer le verdict à "Achète"
 *    (recherche dichotomique sur des copies du bien).
 *  - verdict = "Achète" → comment ACHETER MIEUX / augmenter la rentabilité.
 *
 * Fidélité : chaque projection sort des VRAIES fonctions de blocs sur les MÊMES
 * données préchargées, appliquées à une COPIE du bien. On ne mute jamais `apt`
 * ni l'analyse réelle. Aucun appel réseau/LLM.
 */

export interface RecommandationContext {
  dvf: DvfData | null;
  loyerRef: LoyerReference | null;
  dpeData: DpeData;
  georisques: GeorisquesData | null;
  settings: AppSettings;
  seuils: RendementSeuils;
  precision: PrecisionLocalisation | null;
  loyerPerimetre: "rayon500" | "arrondissement";
  baseBlocs: Record<BlocKey, BlocAnalyse>;
  baseScore: number | null;
  baseVerdicts: Verdict[];
  rendementNetBase: number | null;
}

const COUT_RENO_M2 = 350; // €/m², rénovation énergie + standing (1-2 classes DPE)
const LOYER_BOOST_RENO = 0.12; // +12 % de loyer après rénovation haut de gamme
// Un loyer ne se revalorise pas de +40 % d'un coup, même très en-dessous du
// marché : au mieux à la relocation. On plafonne la hausse proposée pour rester
// réaliste (on vise le haut de fourchette ANIL, borné à ce palier).
const LOYER_UPLIFT_MAX = 0.15;

// --- MATÉRIALITÉ : ce qui mérite d'être proposé -----------------------------
// Les gardes des leviers portaient toutes sur l'ENTRÉE (« la hausse de loyer
// est-elle > 2 % ? », « l'apport est-il > 500 € ? »), jamais sur le RÉSULTAT.
// Un levier pouvait donc franchir sa garde et ne rien apporter : cas observé,
// 1 662 € d'apport pour +9 €/mois de cash-flow — techniquement exact,
// inutile à proposer. Une reco qui ne bouge rien coûte plus qu'elle ne
// rapporte : elle occupe l'écran et dilue les leviers qui comptent.
const GAIN_CASHFLOW_MIN = 25; // €/mois
const GAIN_RENDEMENT_MIN = 0.0025; // +0.25 point de rendement net (fraction)
/** Rendement annuel minimal du capital qu'on demande d'immobiliser. Sans lui,
 * « immobilise 50 000 € pour gagner 30 €/mois » (0,7 %/an) passerait la barre
 * en cash-flow tout en étant un mauvais emploi de trésorerie. */
const RETOUR_CAPITAL_MIN = 0.03;
/** Sous ce seuil, une négociation n'est plus un levier, c'est un arrondi. */
const BAISSE_PRIX_MIN_PCT = 5;

// --- ARRONDIS LISIBLES ------------------------------------------------------
// Une cible prescriptive est une consigne qu'on répète à un vendeur ou qu'on
// vire à un notaire : « négocie à 272 800 € » ne se retient pas et donne une
// fausse impression de précision, alors que la cible sort d'une dichotomie et
// n'a pas 6 chiffres significatifs. Le pas suit l'ordre de grandeur — 10 000 €
// sur un prix d'achat serait absurde sur un loyer.
function pasArrondi(n: number): number {
  const a = Math.abs(n);
  if (a >= 100_000) return 10_000;
  if (a >= 20_000) return 1_000;
  if (a >= 2_000) return 100;
  if (a >= 200) return 10;
  return 5;
}

/**
 * Arrondi PRUDENT — le sens n'est jamais cosmétique, il protège la promesse :
 *
 * - `"bas"` pour ce qu'on espère OBTENIR (prix négocié, loyer visé). Le prix
 *   cible est le plus HAUT qui bascule encore à « Achète » : arrondir vers le
 *   haut casserait la garantie. Le loyer cible est déjà plafonné au réaliste :
 *   l'arrondi supérieur le ferait sortir de la fourchette validée.
 * - `"haut"` pour ce qu'il faut ENGAGER (travaux, apport). L'apport est le
 *   minimum qui ramène le cash-flow à l'équilibre : arrondir vers le bas
 *   manquerait la cible et rendrait la reco fausse. Un budget travaux
 *   sous-estimé est un piège du même ordre.
 */
function arrondiLisible(n: number, sens: "bas" | "haut"): number {
  const pas = pasArrondi(n);
  return (sens === "bas" ? Math.floor(n / pas) : Math.ceil(n / pas)) * pas;
}

/**
 * Plus grande valeur de `[lo, hi]` qui satisfait encore `convient`, par
 * dichotomie.
 *
 * ⚠️ Suppose le prédicat MONOTONE sur l'intervalle (vrai en dessous d'un seuil,
 * faux au-dessus) — c'est le cas des deux usages : la décision s'améliore quand
 * le prix baisse, le cash-flow quand le montant emprunté baisse. Sur un
 * prédicat non monotone, la recherche converge vers un seuil arbitraire.
 *
 * 30 itérations : chacune divise l'intervalle par deux, donc même sur un
 * capital de 1 M€ la précision finale est de l'ordre du millième d'euro — bien
 * en deçà de l'arrondi lisible appliqué ensuite. Les deux copies précédentes
 * (28 et 26 tours) différaient sans raison.
 */
function plusGrandQuiConvient(
  lo: number,
  hi: number,
  convient: (valeur: number) => boolean
): number {
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (convient(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

const fmtEuros = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

const delta = (avant: number | null, apres: number | null): number =>
  avant == null || apres == null ? 0 : apres - avant;

/**
 * Une reco vaut-elle l'écran qu'elle occupe ?
 *
 * Chaque levier peut le prouver sur SON axe — les quatre ne se mesurent pas
 * dans la même unité, et les forcer dans une seule formule aurait caché les
 * deux leviers dont la valeur ne passe pas par le cash-flow.
 */
export function estMateriel(r: Recommandation): boolean {
  // Fait basculer la décision à « Achète » : décisif par définition, quelle que
  // soit l'ampleur des chiffres. C'est la seule question que pose l'écran.
  if (r.flipVersAchat) return true;

  // TRAVAUX : ne se déclenche que sur DPE E/F/G. Sa valeur est RÉGLEMENTAIRE
  // (F interdit à la location en 2028, G l'est déjà) — elle ne passe pas par le
  // cash-flow, et un bien qu'on ne peut plus louer ne se juge pas au retour sur
  // trésorerie. Ne pas le soumettre à la barre chiffrée.
  if (r.levier === "travaux") return true;

  // PRIX : la remise EST la valeur, elle ne transite pas forcément par le
  // cash-flow (qui suppose un loyer connu). Un bien sans loyer renseigné a un
  // rendement et un cash-flow nuls, ce qui masquerait à tort le levier central.
  if (r.levier === "prix" && (r.baissePct ?? 0) >= BAISSE_PRIX_MIN_PCT) return true;

  const gainCashflow = delta(r.cashflowAvant, r.cashflowApres);
  const gainRendement = delta(r.rendementAvant, r.rendementApres);
  if (gainCashflow < GAIN_CASHFLOW_MIN && gainRendement < GAIN_RENDEMENT_MIN) return false;

  // Le levier demande d'immobiliser de la trésorerie : le gain doit payer la
  // mise, pas seulement franchir le seuil absolu.
  if (r.montantEngage != null && r.montantEngage > 0) {
    return (gainCashflow * 12) / r.montantEngage >= RETOUR_CAPITAL_MIN;
  }
  return true;
}

/** Quartier réel du bien, pour ancrer un argument dans le lieu plutôt que dire
 * « le secteur » en générique. `null` si non renseigné. */
const zoneOf = (apt: Apartment): string | null => apt.quartier.trim() || null;

/**
 * Argument "fait" sur les aléas naturels (Géorisques), pour le levier prix —
 * un risque avéré est un point de négociation classique (travaux préventifs,
 * surprime d'assurance). Mêmes seuils que `buildBlocRisque` (argile ≥2,
 * sismique ≥4, radon ≥2) : ne remonte que les niveaux "attention" ou pire,
 * jamais un aléa faible qui n'aiderait pas à négocier. Si plusieurs aléas
 * dépassent le seuil, le plus grave porte l'argument, les autres sont cités en
 * complément plutôt que dupliqués en arguments séparés.
 */
function argGeorisques(gr: GeorisquesData | null): Argument | null {
  if (!gr) return null;
  type Tag = { titre: string; detail: string; chiffre: string; chiffreLabel: string; gravite: 1 | 2 };
  const tags: Tag[] = [];

  if (gr.argiles) {
    const c = Number(gr.argiles.code);
    if (c >= 2) {
      tags.push({
        // `gr.argiles.libelle` contient déjà le mot "Exposition" (ex.
        // "Exposition forte") — ne pas le répéter dans la phrase.
        titre: "Zone argileuse : risque de fissures",
        detail: `${gr.argiles.libelle} au retrait-gonflement des argiles — fondations à surveiller, assurance parfois majorée.`,
        chiffre: gr.argiles.libelle,
        chiffreLabel: "argiles",
        gravite: c >= 3 ? 2 : 1,
      });
    }
  }
  if (gr.sismique) {
    const c = Number(gr.sismique.code);
    if (c >= 4) {
      tags.push({
        titre: "Zone sismique à risque",
        detail: `Zone ${c === 5 ? "de forte" : "de moyenne"} sismicité — des normes parasismiques peuvent s'appliquer à d'éventuels travaux.`,
        chiffre: `Zone ${c}/5`,
        chiffreLabel: "sismicité",
        gravite: c >= 5 ? 2 : 1,
      });
    }
  }
  if (gr.radon) {
    const c = Number(gr.radon.classe);
    if (c >= 2) {
      tags.push({
        titre: "Potentiel radon à ventiler",
        detail: `Commune en classe ${c}/3 — une ventilation renforcée est parfois recommandée, à vérifier avant travaux.`,
        chiffre: `${c}/3`,
        chiffreLabel: "potentiel radon",
        gravite: c >= 3 ? 2 : 1,
      });
    }
  }
  if (gr.risquesCommune.some((r) => /inondation/i.test(r))) {
    tags.push({
      titre: "Risque inondation recensé",
      detail: "La commune recense un risque d'inondation (PPRI) — à vérifier, et un point à faire valoir en négociation.",
      chiffre: "Recensé",
      chiffreLabel: "risque inondation",
      gravite: 1,
    });
  }

  if (tags.length === 0) return null;
  tags.sort((a, b) => b.gravite - a.gravite);
  const [principal, ...autres] = tags;
  const suffixe =
    autres.length > 0 ? ` D'autres aléas sont recensés (${autres.map((t) => t.chiffreLabel).join(", ")}).` : "";
  return {
    titre: principal.titre,
    detail: `${principal.detail}${suffixe}`,
    source: "Géorisques",
    chiffre: principal.chiffre,
    chiffreLabel: principal.chiffreLabel,
  };
}

export function buildRecommandations(apt: Apartment, ctx: RecommandationContext): Recommandation[] {
  if (ctx.baseScore == null) return [];

  // Hypothèses résolues : le profil emprunteur (taux, durée, assurance, TMI,
  // mode de financement) complète ce qui n'est pas surchargé sur le bien.
  const inputs = resolveInputs(apt.simulation_inputs, ctx.settings);
  // Emprunt de référence. Sert aux leviers qui font varier le montant financé
  // (prix négocié → on emprunte moins ; travaux → on finance leur coût). Passe
  // par `capitalEffectif` pour appliquer le mode de financement du profil ET le
  // plafond au coût de l'opération — sans quoi on repartirait d'une base que la
  // simulation, elle, aurait déjà corrigée.
  const budgetAvant = Math.round(computeDerived(apt).budget_total ?? apt.prix ?? 0);
  const loanAvant = capitalEffectif(
    inputs.montantEmprunte,
    inputs.financementMode === "cout_total"
      ? budgetAvant
      : Math.round((apt.prix ?? 0) + (apt.travaux ?? 0)),
    budgetAvant
  );
  // Utilise les hypothèses de crédit PROPRES au scénario (le levier financement
  // modifie `simulation_inputs.montantEmprunte`) — sinon le cash-flow projeté
  // ignorerait l'apport supplémentaire. Mirroir de `buildBlocSimulation`.
  // Année 1 : même définition du "cash-flow mensuel" que les MetricCards de
  // l'onglet Analyse. La colonne "avant" décrit le bien RÉEL non modifié — elle
  // doit afficher exactement le chiffre déjà lu sur l'écran précédent.
  const cashflowOf = (mod: ApartmentWithComputed): number | null => {
    const s = simulate(mod, resolveInputs(mod.simulation_inputs, ctx.settings));
    return s ? s.cashflowMensuelMoyenLMNP : null;
  };

  // Verdict d'un scénario : mêmes fonctions que l'analyse réelle.
  const decisionOf = (blocs: Record<BlocKey, BlocAnalyse>, rendementNet: number | null): Decision =>
    computeDecision(
      computeScoreGlobal(blocs, rendementNet, ctx.seuils),
      buildVerdicts(blocs, rendementNet, ctx.seuils),
      ecartPrixMarche(blocs.prix)
    );

  const aptBase = computeDerived(apt);
  const rendementAvant = aptBase.rendement_net;
  const cashflowAvant = cashflowOf(aptBase);
  const currentDecision = computeDecision(
    ctx.baseScore,
    ctx.baseVerdicts,
    ecartPrixMarche(ctx.baseBlocs.prix)
  );
  const dejaAchat = currentDecision === "achete";

  const prixReco = buildLevierPrix();
  const financementReco = buildLevierFinancement();

  // Travaux + loyer triés entre eux : ce qui fait basculer à "Achète" d'abord,
  // puis par cash-flow. Le prix reste épinglé en tête (levier central) et le
  // financement toujours en dernier (levier d'appoint, pas une vraie optim).
  const milieu = [buildLevierTravaux(), buildLevierLoyer()].filter(
    (r): r is Recommandation => r != null
  );
  milieu.sort((a, b) => {
    if (a.flipVersAchat !== b.flipVersAchat) return a.flipVersAchat ? -1 : 1;
    return (b.cashflowApres ?? -Infinity) - (a.cashflowApres ?? -Infinity);
  });

  // La porte de matérialité s'applique en UN seul endroit, sur les quatre
  // leviers réunis : les gardes internes de chaque `buildLevier*` portent sur
  // la faisabilité (« ce levier a-t-il un sens ici ? »), celle-ci sur l'intérêt
  // (« le résultat vaut-il d'être proposé ? »). Deux questions distinctes, d'où
  // deux endroits — mais une seule définition de l'intérêt.
  // Tout filtrer est un état valide : l'onglet affiche alors « rien de plus à
  // optimiser », ce qui est une réponse, pas un vide.
  return [prixReco, ...milieu, financementReco].filter(
    (r): r is Recommandation => r != null && estMateriel(r)
  );

  // --- Levier PRIX : le prix exact à négocier ----------------------------
  function buildLevierPrix(): Recommandation | null {
    if (apt.prix == null || apt.prix <= 0 || apt.surface_m2 == null || apt.surface_m2 <= 0) return null;

    // Négocier le prix, c'est aussi emprunter d'autant moins (apport constant) :
    // sinon, à emprunt figé, baisser le prix réduit l'amortissement (donc
    // augmente l'impôt) sans alléger la mensualité — le cash-flow se dégraderait
    // à tort. On répercute donc la baisse du prix sur le montant emprunté.
    const inputsAtPrice = (prix: number) => ({
      ...inputs,
      montantEmprunte: Math.max(0, loanAvant - (apt.prix! - prix)),
    });
    const blocsAtPrice = (prix: number) => {
      const mod = computeDerived({ ...apt, prix, simulation_inputs: inputsAtPrice(prix) });
      const blocs: Record<BlocKey, BlocAnalyse> = {
        ...ctx.baseBlocs,
        prix: buildBlocPrix(mod, ctx.dvf, ctx.precision),
        location: buildBlocLocation(mod, ctx.loyerRef, ctx.seuils, ctx.loyerPerimetre),
        simulation: buildBlocSimulation(mod, ctx.settings),
      };
      return { mod, blocs };
    };
    const decisionAtPrice = (prix: number) => {
      const { mod, blocs } = blocsAtPrice(prix);
      return decisionOf(blocs, mod.rendement_net);
    };

    const prixMarche =
      ctx.dvf?.medianeRecente != null
        ? Math.round(ctx.dvf.medianeRecente * apt.surface_m2 - (apt.travaux ?? 0))
        : null;

    // Arguments pour négocier. Les PREUVES (avec `source` + `chiffre`) d'abord,
    // la MÉTHODE (sans source) ensuite : l'onglet Optimiser groupe sur ce critère.
    // Textes volontairement courts — une phrase, le chiffre porte le reste.
    const argsPrix = (cible: number): Argument[] => {
      const out: Argument[] = [];
      const ecartPct = ecartPrixMarche(ctx.baseBlocs.prix);
      const mediane = ctx.dvf?.medianeRecente ?? null;
      const nbVentes = ctx.dvf?.nbVentesRecent ?? null;
      const dpe = (ctx.baseBlocs.risque.dpeGes?.dpe ?? apt.dpe ?? "").toUpperCase();
      const surface = apt.surface_m2 ?? 0;
      const prixAchat = apt.prix ?? 0;
      const prixM2Actuel = surface > 0 ? Math.round(prixAchat / surface) : 0;
      const zone = zoneOf(apt);

      // Contrainte réglementaire d'abord : c'est le levier de décote le plus
      // solide (coût subi, chiffrable, opposable au vendeur).
      if (["E", "F", "G"].includes(dpe) && surface > 0 && prixAchat > 0) {
        const coutReno = Math.round((COUT_RENO_M2 * surface) / 1000) * 1000;
        const pctBudget = Math.round((coutReno / prixAchat) * 100);
        const quand =
          dpe === "G"
            ? "déjà interdit à la location"
            : dpe === "F"
              ? "interdit à la location à partir de 2028"
              : "interdit à la location à partir de 2034";
        // DPE établi avant la réforme de juillet 2021 : méthode de calcul
        // différente, argument supplémentaire pour en exiger un nouveau plutôt
        // que de prendre la classe affichée pour acquise.
        const dateDpe = ctx.dpeData.meilleurMatch?.date || null;
        const anneeDpe = dateDpe ? (dateDpe.match(/^\d{4}/)?.[0] ?? null) : null;
        const dpeAncienneMethode = dateDpe != null && dateDpe < "2021-07-01";
        out.push({
          titre: `Le bien devra être rénové pour rester louable`,
          detail: `Classé ${dpe}, ce logement est ${quand}. Remettre les ${Math.round(surface)} m² en classe D coûte environ ${fmtEuros(coutReno)}, soit ${pctBudget} % du prix affiché — une dépense qui t'incombe après l'achat.${dpeAncienneMethode ? ` Ce diagnostic date de ${anneeDpe}, avant la réforme du DPE (2021) : à refaire pour confirmer la classe réelle.` : ""}`,
          source: "ADEME",
          chiffre: fmtEuros(coutReno),
          chiffreLabel: "de travaux",
        });
      }

      if (ecartPct != null && ecartPct >= 3 && mediane != null) {
        const base = ctx.dvf?.baseComparaison;
        const baseTxt = base && base !== "toutes surfaces" ? ` (${base})` : "";
        // En dessous de 15 ventes, la médiane devient fragile (même seuil que
        // buildBlocPrix, qui ramène alors la note vers la neutralité) : on le
        // dit plutôt que de présenter un chiffre fragile comme acquis.
        const fiabilite =
          nbVentes != null && nbVentes < 15 ? " Échantillon restreint : à confirmer avec l'agent." : "";
        out.push({
          titre: "Le prix dépasse les ventes réelles du quartier",
          detail: `${nbVentes ?? "Plusieurs"} ventes comparables${baseTxt}${zone ? ` à ${zone}` : ""} sur les 3 dernières années : prix médian ${fmtEuros(mediane)}/m², contre ${fmtEuros(prixM2Actuel)}/m² ici.${fiabilite}`,
          source: "DVF",
          chiffre: `+${ecartPct} %`,
          chiffreLabel: "au-dessus du marché",
        });
      }

      // Tendance du marché : seulement quand elle sert la négociation (marché
      // stagnant ou en recul). Un marché en hausse n'est pas un argument pour
      // négocier — on ne le montre pas.
      if (ctx.dvf?.evolutionPct != null && ctx.dvf.evolutionPct <= -3 && ctx.dvf.medianeAncienne != null && mediane != null) {
        const { evolutionPct, medianeAncienne, ancienMin, ancienMax, recentMin, recentMax } = ctx.dvf;
        out.push({
          titre: "Le marché du secteur recule",
          detail: `${zone ? `À ${zone}, le` : "Le"} prix médian est passé de ${fmtEuros(medianeAncienne)}/m² (${ancienMin}–${ancienMax}) à ${fmtEuros(mediane)}/m² (${recentMin}–${recentMax}). Un marché qui recule renforce ta position.`,
          source: "DVF",
          chiffre: `${evolutionPct} %`,
          chiffreLabel: "sur ~10 ans",
        });
      }

      const risqueArg = argGeorisques(ctx.georisques);
      if (risqueArg) out.push(risqueArg);

      if (cashflowAvant != null && cashflowAvant < 0) {
        const cfCible = cashflowOf(blocsAtPrice(cible).mod);
        const apres =
          cfCible != null && cfCible < 0
            ? ` À ${fmtEuros(cible)}, il ne manquerait plus que ${fmtEuros(Math.abs(cfCible))}.`
            : cfCible != null
              ? ` À ${fmtEuros(cible)}, l'opération s'autofinancerait.`
              : "";
        out.push({
          titre: "À ce prix, l'opération te coûte de l'argent",
          detail: `Une fois le crédit remboursé et l'impôt payé, il te manque ${fmtEuros(Math.abs(cashflowAvant))} chaque mois.${apres}`,
          source: "Calcul",
          chiffre: `−${fmtEuros(Math.abs(cashflowAvant))}`,
          chiffreLabel: "chaque mois",
        });
      }

      out.push({
        titre: "Fais une offre écrite et chiffrée",
        detail:
          "Une offre argumentée, avec ton plan de financement déjà prêt, pèse plus lourd qu'une discussion orale. N'annonce jamais ton budget maximum.",
      });
      out.push({
        titre: "Cherche à savoir si le vendeur est pressé",
        detail:
          "Depuis quand l'annonce est-elle en ligne, le prix a-t-il déjà baissé, pourquoi vend-il ? Plus la vente urge, plus ta marge est grande.",
      });
      return out;
    };

    const carte = (prixCible: number, extra: Partial<Recommandation>): Recommandation => {
      // Arrondi AVANT de dériver quoi que ce soit : `blocsAtPrice`, le patch,
      // les arguments et le cash-flow affiché doivent tous décrire le prix
      // réellement annoncé, sinon l'écran promet un impact calculé sur un prix
      // qui n'est plus celui du titre.
      const cible = arrondiLisible(
        Math.min(Math.max(1000, prixCible), apt.prix! - 1000),
        "bas"
      );
      const { mod } = blocsAtPrice(cible);
      const baisse = apt.prix! - cible;
      const pct = Math.round((baisse / apt.prix!) * 100);
      return {
        levier: "prix",
        titre: dejaAchat ? "Négocier pour acheter mieux" : "Négocier le prix d'achat",
        // `action` porte le chiffre PIVOT et rien d'autre : l'écart (−X %) et la
        // valeur actuelle sont rendus à côté par l'UI. Ne pas y remettre « soit
        // −X % (Y de moins) », ce serait dire trois fois la même chose.
        action: `Négocie à ${fmtEuros(cible)}`,
        prixAchatAvant: apt.prix!,
        prixAchatApres: cible,
        prixM2Avant: aptBase.prix_m2 ?? undefined,
        prixM2Apres: mod.prix_m2 ?? undefined,
        rendementAvant,
        rendementApres: mod.rendement_net,
        cashflowAvant,
        cashflowApres: cashflowOf(mod),
        verdictApres: decisionAtPrice(cible),
        flipVersAchat: false,
        prixCible: cible,
        baisseEuros: baisse,
        baissePct: pct,
        patch: { prix: cible, simulation_inputs: inputsAtPrice(cible) },
        arguments: argsPrix(cible),
        pourquoi: "",
        ...extra,
      };
    };

    // Mode "acheter mieux" : le bien est déjà un achat → viser le marché (ou −8 %).
    if (dejaAchat) {
      const cible =
        prixMarche != null && prixMarche < apt.prix
          ? Math.max(prixMarche, Math.round(apt.prix * 0.85))
          : Math.round(apt.prix * 0.92);
      return carte(cible, {
        verdictApres: "achete",
        pourquoi: "Déjà rentable : chaque euro négocié augmente directement rendement et cash-flow.",
      });
    }

    // Mode "en faire un achat" : cherche le prix le PLUS HAUT donnant "achete".
    // La décision s'améliore quand le prix baisse (monotone) → seuil unique.
    const prixTestBas = Math.round(apt.prix * 0.4);
    if (decisionAtPrice(prixTestBas) === "achete") {
      const lo = plusGrandQuiConvient(
        prixTestBas,
        apt.prix,
        (prix) => decisionAtPrice(prix) === "achete"
      );
      // `lo` est brut : `carte` applique l'arrondi lisible, toujours vers le
      // BAS — un prix plus bas que le seuil reste « Achète » (décision
      // monotone), donc la garantie tient. Ne pas pré-arrondir ici : ça faisait
      // deux pas d'arrondi concurrents (1 000 € ici, adaptatif là-bas).
      return carte(lo, {
        verdictApres: "achete",
        flipVersAchat: true,
        pourquoi: "À ce prix, le bien passe en « Achète » : rendement, cash-flow et marché au vert.",
      });
    }

    // Le prix seul ne suffit pas : identifier le frein bloquant (à prix très bas).
    const { mod: modBas, blocs: blocsBas } = blocsAtPrice(prixTestBas);
    const verdictsBas = buildVerdicts(blocsBas, modBas.rendement_net, ctx.seuils);
    const frein =
      verdictsBas.find((v) => v.niveau === "alerte")?.titre ??
      verdictsBas.find((v) => v.niveau === "attention")?.titre ??
      "un frein hors prix";
    const cible =
      prixMarche != null && prixMarche < apt.prix
        ? Math.max(prixMarche, Math.round(apt.prix * 0.88))
        : Math.round(apt.prix * 0.9);
    // `pourquoi` dit ce que le levier apporte, `caveat` porte SEUL le frein :
    // les deux se recouvraient, l'UI affiche l'un sous l'action et l'autre en
    // bandeau d'alerte.
    return carte(cible, {
      pourquoi:
        "Le prix reste le levier le plus direct : chaque euro négocié allège l'emprunt, le rendement et le cash-flow.",
      caveat: `${frein} bloque l'achat quel que soit le prix. Traite ce frein d'abord.`,
      caveatBloquant: true,
    });
  }

  // --- Levier TRAVAUX : rénovation énergie + standing --------------------
  function buildLevierTravaux(): Recommandation | null {
    const dpeCourant = (ctx.baseBlocs.risque.dpeGes?.dpe ?? apt.dpe ?? "").toUpperCase();
    if (
      !["E", "F", "G"].includes(dpeCourant) ||
      apt.surface_m2 == null ||
      apt.surface_m2 <= 0 ||
      apt.loyer_retenu == null
    )
      return null;

    const coutTravaux = arrondiLisible(COUT_RENO_M2 * apt.surface_m2, "haut");
    const dpeCible = "D";
    const gesCible = "D";
    const loyerCible = Math.round(apt.loyer_retenu * (1 + LOYER_BOOST_RENO));
    const mod = computeDerived({
      ...apt,
      dpe: dpeCible,
      ges: gesCible,
      travaux: (apt.travaux ?? 0) + coutTravaux,
      loyer_retenu: loyerCible,
      // Travaux financés (l'emprunt suit leur coût) : la mensualité — et donc le
      // cash-flow — reflète le coût des travaux, pas seulement leur amortissement
      // et le budget total (qui pèsent déjà sur le rendement).
      simulation_inputs: { ...inputs, montantEmprunte: loanAvant + coutTravaux },
    });
    // Le bloc Risque privilégie le DPE officiel ADEME : on force l'étiquette cible.
    const dpeDataMod: DpeData = {
      ...ctx.dpeData,
      meilleurMatch: ctx.dpeData.meilleurMatch
        ? { ...ctx.dpeData.meilleurMatch, etiquette_dpe: dpeCible, etiquette_ges: gesCible }
        : null,
    };
    const blocs: Record<BlocKey, BlocAnalyse> = {
      ...ctx.baseBlocs,
      risque: buildBlocRisque(mod, dpeDataMod, ctx.georisques),
      location: buildBlocLocation(mod, ctx.loyerRef, ctx.seuils, ctx.loyerPerimetre, {
        renovePremium: true,
      }),
      simulation: buildBlocSimulation(mod, ctx.settings),
      prix: buildBlocPrix(mod, ctx.dvf, ctx.precision), // travaux ↑ prix/m² : léger malus
    };
    const verdictApres = decisionOf(blocs, mod.rendement_net);
    return {
      levier: "travaux",
      titre: "Rénover (énergie + standing)",
      // Chiffre pivot seul (le budget) : la cible DPE et le loyer premium sont
      // portés par `pourquoi`, juste en dessous.
      action: `Rénove pour ≈ ${fmtEuros(coutTravaux)}`,
      loyerAvant: apt.loyer_retenu,
      loyerApres: loyerCible,
      rendementAvant,
      rendementApres: mod.rendement_net,
      cashflowAvant,
      cashflowApres: cashflowOf(mod),
      verdictApres,
      flipVersAchat: !dejaAchat && verdictApres === "achete",
      patch: {
        dpe: dpeCible,
        ges: gesCible,
        travaux: (apt.travaux ?? 0) + coutTravaux,
        loyer_retenu: loyerCible,
        simulation_inputs: { ...inputs, montantEmprunte: loanAvant + coutTravaux },
      },
      cout: `≈ ${fmtEuros(coutTravaux)} de travaux`,
      // Trésorerie à engager : sortie, pas gain — affichée en neutre par l'UI.
      montantEngage: coutTravaux,
      arguments: (() => {
        const surface = apt.surface_m2 ?? 0;
        const loyerActuel = apt.loyer_retenu ?? 0;
        const pctBudget = Math.round((coutTravaux / (apt.prix ?? 1)) * 100);
        const loyerGain = loyerCible - loyerActuel;
        const mois = loyerGain > 0 ? Math.round(coutTravaux / loyerGain) : 0;
        // Au-delà de deux ans, un délai en mois ne se lit plus (« ~141 mois »).
        const retour =
          mois <= 0 ? "" : mois < 24 ? `~${mois} mois` : `~${Math.round(mois / 12)} ans`;
        const echeance =
          dpeCourant === "G" ? "depuis 2025" : dpeCourant === "F" ? "à partir de 2028" : "à partir de 2034";
        return [
          {
            titre: "Sans travaux, le bien devient illouable",
            detail: `La loi Climat interdit de louer les logements classés ${dpeCourant} ${echeance}. Passer en classe D lève l'interdiction et sécurise la revente.`,
            source: "ADEME",
            chiffre: dpeCourant === "G" ? "2025" : dpeCourant === "F" ? "2028" : "2034",
            chiffreLabel: "interdiction de louer",
          },
          {
            titre: "Un bien rénové se reloue plus cher",
            // Ton neutre sur le délai : « de quoi rembourser en 12 ans » ferait
            // passer un retour très long pour une bonne nouvelle.
            detail: `Le loyer passerait de ${fmtEuros(loyerActuel)} à ${fmtEuros(loyerCible)}/mois${retour ? ` — à ce rythme, le surloyer rembourse le chantier en ${retour}` : ""}.`,
            source: "Calcul",
            chiffre: `+${fmtEuros(loyerGain)}`,
            chiffreLabel: "de loyer par mois",
          },
          {
            titre: "Chiffre avant d'acheter",
            detail: `${Math.round(surface)} m² × ${COUT_RENO_M2} €/m², soit ${pctBudget} % du prix. Demande 2–3 devis : ils servent aussi à négocier.`,
          },
          {
            titre: "Priorise l'impact",
            detail:
              "Isolation, chauffage et menuiseries d'abord (le DPE), cuisine et salle de bains ensuite (le loyer).",
          },
          {
            titre: "Aides et amortissement",
            detail:
              "MaPrimeRénov', éco-PTZ et CEE allègent la facture. En LMNP réel, les travaux s'amortissent.",
          },
        ];
      })(),
      pourquoi: `DPE ${dpeCourant}→${dpeCible} : lève l'interdiction de louer et justifie un loyer premium.`,
      caveat: "Coût des travaux et loyer premium estimés — à affiner avec des devis.",
    };
  }

  // --- Levier LOYER : viser le haut de la fourchette ANIL ----------------
  function buildLevierLoyer(): Recommandation | null {
    if (!ctx.loyerRef || apt.surface_m2 == null || apt.surface_m2 <= 0 || apt.loyer_retenu == null)
      return null;
    // Même conversion que partout ailleurs (majoration meublé + correction de
    // surface, sans provision) : le levier viserait sinon un haut de fourchette
    // incohérent avec celui que l'analyse affiche.
    const immeubleRef = isImmeuble(apt.type_bien);
    const refCC = referenceCCMeuble(
      ctx.loyerRef,
      immeubleRef ? apt.surface_m2 / lotsEffectifs(apt.nb_lots, apt.surface_m2) : apt.surface_m2,
      typologieAnil(apt.type_bien, apt.nb_pieces, immeubleRef, apt.surface_m2)
    );
    const maxCC_m2 = refCC.maxM2;
    const loyerMaxAnil = Math.round(maxCC_m2 * apt.surface_m2);
    // On vise le haut de fourchette ANIL, mais borné à une hausse réaliste.
    const plafondRealiste = Math.round(apt.loyer_retenu * (1 + LOYER_UPLIFT_MAX));
    // Arrondi vers le BAS : les deux bornes (haut de fourchette ANIL, plafond
    // de hausse réaliste) sont des maxima — les dépasser à l'arrondi ferait
    // sortir la cible de ce que le moteur a validé.
    const loyerCible = arrondiLisible(Math.min(loyerMaxAnil, plafondRealiste), "bas");
    if (loyerCible <= apt.loyer_retenu * 1.02) return null;
    const bornéParRealisme = loyerCible < loyerMaxAnil;

    const mod = computeDerived({ ...apt, loyer_retenu: loyerCible });
    const blocs: Record<BlocKey, BlocAnalyse> = {
      ...ctx.baseBlocs,
      location: buildBlocLocation(mod, ctx.loyerRef, ctx.seuils, ctx.loyerPerimetre),
      simulation: buildBlocSimulation(mod, ctx.settings),
    };
    const verdictApres = decisionOf(blocs, mod.rendement_net);
    return {
      levier: "loyer",
      titre: "Optimiser le loyer",
      // Chiffre pivot seul : l'écart (+X %) et le loyer actuel sont rendus à côté.
      action: `Revalorise à ${fmtEuros(loyerCible)}/mois CC`,
      loyerAvant: apt.loyer_retenu,
      loyerApres: loyerCible,
      rendementAvant,
      rendementApres: mod.rendement_net,
      cashflowAvant,
      cashflowApres: cashflowOf(mod),
      verdictApres,
      flipVersAchat: !dejaAchat && verdictApres === "achete",
      patch: { loyer_retenu: loyerCible },
      arguments: (() => {
        const args: Argument[] = [];
        const surface = apt.surface_m2 ?? 0;
        const loyerActuel = apt.loyer_retenu ?? 0;
        const minCC_m2 = refCC.minM2;
        const loyerMinAnil = Math.round(minCC_m2 * surface);
        const gain = loyerCible - loyerActuel;
        const annee = ctx.loyerRef.annee ? ` ${ctx.loyerRef.annee}` : "";
        const zone = zoneOf(apt);
        const perimetreLabel = ctx.loyerPerimetre === "rayon500" ? "rayon 500 m" : "arrondissement";
        const nbObsTxt =
          ctx.loyerRef.nbObs > 0 ? ` (${ctx.loyerRef.nbObs.toLocaleString("fr-FR")} annonces observées)` : "";

        args.push({
          titre: "Ton loyer est sous le marché du secteur",
          detail: `Pour ${Math.round(surface)} m²${zone ? ` à ${zone}` : ""} (${perimetreLabel}), la carte des loyers ANIL${annee}${nbObsTxt} situe le marché entre ${fmtEuros(loyerMinAnil)} et ${fmtEuros(loyerMaxAnil)}/mois. Tu es à ${fmtEuros(loyerActuel)}.`,
          source: "ANIL",
          chiffre: `+${fmtEuros(gain)}`,
          chiffreLabel: "de marge par mois",
        });

        args.push({
          titre: "Ce que la revalorisation rapporte sur un an",
          detail: `${fmtEuros(gain * 12)} de loyers supplémentaires, sans un euro de capital en plus — c'est ce qui fait monter le rendement.`,
          source: "Calcul",
          chiffre: `+${fmtEuros(gain * 12)}`,
          chiffreLabel: "sur un an",
        });

        args.push({
          titre: "Meublé soigné",
          detail:
            "Électroménager complet, literie neuve, mobilier de qualité : c'est ce qui justifie le premium.",
        });
        args.push({
          titre: "L'annonce fait le loyer",
          detail:
            "Photos en lumière naturelle, atouts du quartier en avant, réactivité aux demandes.",
        });
        if (bornéParRealisme) {
          args.push({
            titre: "Surtout à la relocation",
            detail:
              "Avec un locataire en place, la révision annuelle est limitée à l'indice. Le plein potentiel se prend au changement de locataire.",
          });
        }
        args.push({
          titre: "Vérifie l'encadrement",
          detail: "Paris, Lille, Lyon, Montpellier et d'autres plafonnent les loyers.",
        });
        return args;
      })(),
      pourquoi: bornéParRealisme
        ? "Loyer sous le marché : une revalorisation réaliste rehausse rendement et cash-flow."
        : "Loyer aligné sur le haut du marché : rendement et cash-flow en hausse.",
      caveat: "Réalisable surtout à la relocation, selon l'état et les prestations du bien.",
    };
  }

  // --- Levier FINANCEMENT : renforcer l'apport ---------------------------
  function buildLevierFinancement(): Recommandation | null {
    if (cashflowAvant == null || cashflowAvant >= 0) return null;
    // Même base que `loanAvant` : mode de financement du profil + plafond.
    const capitalActuel = loanAvant;
    const cf = (montant: number): number => {
      const s = simulate(aptBase, { ...inputs, montantEmprunte: Math.round(montant) });
      return s ? s.cashflowMensuelMoyenLMNP : -Infinity;
    };
    if (cf(0) < 0) return null; // même au comptant le cash-flow reste négatif

    // Plus grand montant emprunté ramenant le cash-flow d'année 1 à l'équilibre.
    const lo = plusGrandQuiConvient(0, capitalActuel, (montant) => cf(montant) >= 0);
    // L'apport est le MINIMUM qui ramène le cash-flow à l'équilibre : on
    // l'arrondit vers le HAUT, donc on emprunte d'autant moins. Arrondir
    // l'apport vers le bas repasserait sous l'équilibre et rendrait fausse la
    // promesse du titre. `montantCible` est redérivé de l'apport arrondi pour
    // que la simulation, le patch et l'affichage décrivent la même opération.
    const apportSupp = arrondiLisible(capitalActuel - lo, "haut");
    if (apportSupp <= 500) return null;
    const montantCible = Math.max(0, capitalActuel - apportSupp);

    const mod = computeDerived({
      ...apt,
      simulation_inputs: { ...inputs, montantEmprunte: montantCible },
    });
    const blocs: Record<BlocKey, BlocAnalyse> = {
      ...ctx.baseBlocs,
      simulation: buildBlocSimulation(mod, ctx.settings),
    };
    // Le financement ne change pas le rendement intrinsèque du bien.
    const verdictApres = decisionOf(blocs, ctx.rendementNetBase);
    return {
      levier: "financement",
      titre: "Renforcer l'apport",
      // Chiffre pivot seul : « emprunte d'autant moins » est dans `pourquoi`.
      action: `Ajoute ≈ ${fmtEuros(apportSupp)} d'apport`,
      rendementAvant,
      rendementApres: ctx.rendementNetBase,
      cashflowAvant,
      cashflowApres: cashflowOf(mod),
      verdictApres,
      flipVersAchat: !dejaAchat && verdictApres === "achete",
      patch: { simulation_inputs: { ...inputs, montantEmprunte: montantCible } },
      // Capital immobilisé en plus : sortie de trésorerie, affichée en neutre.
      montantEngage: apportSupp,
      arguments: (() => {
        const deficit = Math.abs(cashflowAvant ?? 0);
        const pctCapital = Math.round((apportSupp / capitalActuel) * 100);
        return [
          {
            titre: "La mensualité dépasse ce que le bien encaisse",
            detail: `${fmtEuros(capitalActuel)} empruntés pour ${fmtEuros(apt.loyer_retenu ?? 0)} de loyer mensuel : la différence sort de ta poche tous les mois.`,
            source: "Calcul",
            chiffre: `−${fmtEuros(deficit)}`,
            chiffreLabel: "chaque mois",
          },
          {
            titre: "L'apport qui ramène l'opération à l'équilibre",
            detail: `En empruntant ${fmtEuros(montantCible)} au lieu de ${fmtEuros(capitalActuel)}, soit ${pctCapital} % de capital en moins, la mensualité redescend au niveau des loyers.`,
            source: "Calcul",
            chiffre: fmtEuros(apportSupp),
            chiffreLabel: "d'apport en plus",
          },
          {
            titre: "Taux et assurance",
            detail:
              "Mets les banques en concurrence, et délègue l'assurance emprunteur (loi Lemoine) : c'est souvent le plus gros gain.",
          },
          {
            titre: "Durée ou apport",
            detail:
              "Allonger la durée allège la mensualité mais alourdit le coût total. Compare les deux avant de trancher.",
          },
        ];
      })(),
      pourquoi: "Cash-flow ramené à l'équilibre en empruntant moins.",
      caveat: "Améliore le cash-flow, pas la rentabilité du bien.",
    };
  }
}
