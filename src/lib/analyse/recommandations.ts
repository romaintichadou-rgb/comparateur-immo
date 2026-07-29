import type { Apartment, ApartmentWithComputed, PrecisionLocalisation } from "@/lib/types";
import type { AppSettings } from "@/lib/settings";
import { computeDerived } from "@/lib/calculations";
import { defaultInputs, simulate } from "@/lib/simulation";
import { buildVerdicts, computeScoreGlobal, type RendementSeuils } from "./scoring";
import { computeDecision, ecartPrixMarche } from "./decision";
import { buildBlocPrix } from "./blocs/prix";
import { buildBlocLocation, MAJORATION_MEUBLE, PROVISION_CHARGES_M2 } from "./blocs/location";
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

const fmtEuros = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

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

  const inputs = apt.simulation_inputs ?? defaultInputs();
  // Emprunt de référence (montant saisi, ou auto = prix + travaux). Sert aux
  // leviers qui font varier le montant financé (prix négocié → on emprunte
  // moins ; travaux → on finance leur coût).
  const loanAvant = inputs.montantEmprunte ?? Math.round((apt.prix ?? 0) + (apt.travaux ?? 0));
  // Utilise les hypothèses de crédit PROPRES au scénario (le levier financement
  // modifie `simulation_inputs.montantEmprunte`) — sinon le cash-flow projeté
  // ignorerait l'apport supplémentaire. Mirroir de `buildBlocSimulation`.
  const cashflowOf = (mod: ApartmentWithComputed): number | null => {
    const s = simulate(mod, mod.simulation_inputs ?? inputs);
    return s ? s.cashflowMensuelMoyen : null;
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

  return [prixReco, ...milieu, financementReco].filter((r): r is Recommandation => r != null);

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
      const cible = Math.min(Math.max(1000, prixCible), apt.prix! - 1000);
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
      let lo = prixTestBas;
      let hi = apt.prix;
      for (let i = 0; i < 28; i++) {
        const mid = (lo + hi) / 2;
        if (decisionAtPrice(mid) === "achete") lo = mid;
        else hi = mid;
      }
      const prixPourAchat = Math.floor(lo / 1000) * 1000; // arrondi bas → reste "achete"
      return carte(prixPourAchat, {
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

    const coutTravaux = Math.round((COUT_RENO_M2 * apt.surface_m2) / 1000) * 1000;
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
    const maxCC_m2 = ctx.loyerRef.max * (1 + MAJORATION_MEUBLE) + PROVISION_CHARGES_M2;
    const loyerMaxAnil = Math.round(maxCC_m2 * apt.surface_m2);
    // On vise le haut de fourchette ANIL, mais borné à une hausse réaliste.
    const plafondRealiste = Math.round(apt.loyer_retenu * (1 + LOYER_UPLIFT_MAX));
    const loyerCible = Math.min(loyerMaxAnil, plafondRealiste);
    if (loyerCible <= apt.loyer_retenu * 1.02) return null;
    const bornéParRealisme = loyerCible < loyerMaxAnil;

    const mod = computeDerived({ ...apt, loyer_retenu: loyerCible });
    const blocs: Record<BlocKey, BlocAnalyse> = {
      ...ctx.baseBlocs,
      location: buildBlocLocation(mod, ctx.loyerRef, ctx.seuils, ctx.loyerPerimetre),
      simulation: buildBlocSimulation(mod, ctx.settings),
    };
    const verdictApres = decisionOf(blocs, mod.rendement_net);
    const pct = Math.round((loyerCible / apt.loyer_retenu - 1) * 100);
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
        const minCC_m2 = ctx.loyerRef.min * (1 + MAJORATION_MEUBLE) + PROVISION_CHARGES_M2;
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
    const capitalActuel = inputs.montantEmprunte ?? Math.round((apt.prix ?? 0) + (apt.travaux ?? 0));
    const cf = (montant: number): number => {
      const s = simulate(aptBase, { ...inputs, montantEmprunte: Math.round(montant) });
      return s ? s.cashflowMensuelMoyen : -Infinity;
    };
    if (cf(0) < 0) return null; // même au comptant le cash-flow reste négatif

    // Plus grand montant emprunté ramenant le cash-flow moyen à l'équilibre.
    let lo = 0;
    let hi = capitalActuel;
    for (let i = 0; i < 26; i++) {
      const mid = (lo + hi) / 2;
      if (cf(mid) >= 0) lo = mid;
      else hi = mid;
    }
    const montantCible = Math.round(lo);
    const apportSupp = capitalActuel - montantCible;
    if (apportSupp <= 500) return null;

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
