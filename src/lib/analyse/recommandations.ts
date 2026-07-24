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

    // Arguments concrets pour négocier — contextuels (données réelles) puis méthode.
    const argsPrix = (cible: number): Argument[] => {
      const out: Argument[] = [];
      const ecartPct = ecartPrixMarche(ctx.baseBlocs.prix);
      const mediane = ctx.dvf?.medianeRecente ?? null;
      const nbVentes = ctx.dvf?.nbVentesRecent ?? null;
      const prixMin = ctx.dvf?.recentMin ?? null;
      const prixMax = ctx.dvf?.recentMax ?? null;
      const baseComparaison = ctx.dvf?.baseComparaison ?? null;
      const dpe = (ctx.baseBlocs.risque.dpeGes?.dpe ?? apt.dpe ?? "").toUpperCase();
      const surface = apt.surface_m2 ?? 0;
      const prixAchat = apt.prix ?? 0;
      const prixM2Actuel = surface > 0 ? prixAchat / surface : 0;
      const cibleM2 = surface > 0 ? cible / surface : 0;

      // Fourchette DVF détaillée avec contexte.
      if (mediane != null && (prixMin != null || prixMax != null)) {
        const fourchette =
          prixMin != null && prixMax != null
            ? ` (fourchette ${fmtEuros(prixMin)}–${fmtEuros(prixMax)}/m²)`
            : prixMin != null
              ? ` (minimum observé ${fmtEuros(prixMin)}/m²)`
              : prixMax != null
                ? ` (maximum observé ${fmtEuros(prixMax)}/m²)`
                : "";
        const baseRef = baseComparaison ? ` pour ${baseComparaison}` : "";
        out.push({
          titre: "Comparaison marché locale",
          detail: `Le marché récent du secteur : médiane ${fmtEuros(mediane)}/m²${fourchette}${baseRef} (${nbVentes ?? "?"} ventes sur 3 ans). Ton bien : ${fmtEuros(Math.round(prixM2Actuel))}/m², soit +${ecartPct}%.`,
          source: "DVF",
        });
      }

      // DPE avec coût travaux chiffré pour CE bien.
      if (["E", "F", "G"].includes(dpe)) {
        const echeance =
          dpe === "G"
            ? "déjà interdit à la location"
            : dpe === "F"
              ? "interdit à la location en 2028"
              : "interdit à la location en 2034";
        const coutReno = Math.round((COUT_RENO_M2 * surface) / 1000) * 1000;
        const pctBudget = Math.round((coutReno / prixAchat) * 100);
        out.push({
          titre: `DPE ${dpe} : travaux obligatoires`,
          detail: `Classe ${dpe} — ${echeance}. Pour ce bien (${Math.round(surface)} m²), rénovation à ~${fmtEuros(coutReno)} (${COUT_RENO_M2}€/m²), soit ${pctBudget}% du prix d'achat.`,
          verbatim: `Le DPE ${dpe} impose une rénovation énergétique (travaux estimés ${fmtEuros(coutReno)}). Ce coût devrait être déduit du prix d'achat.`,
          source: "ADEME",
        });
      }

      // Décomposition de l'écart marché (si écart significatif).
      if (ecartPct != null && ecartPct >= 5) {
        const facteurs: string[] = [];
        if (["E", "F", "G"].includes(dpe)) facteurs.push(`DPE ${dpe}`);
        if (facteurs.length > 0) {
          const raisons = facteurs.join(", ");
          out.push({
            titre: "Pourquoi ce prix de négociation ?",
            detail: `Écart marché +${ecartPct}% expliqué par : ${raisons}. Le prix cible ${fmtEuros(Math.round(cibleM2))}/m² l'aligne sur ventes comparables moins travaux.`,
          });
        }
      }

      // Cash-flow déficitaire (chiffré).
      if (cashflowAvant != null && cashflowAvant < 0) {
        out.push({
          titre: "Rentabilité à l'équilibre",
          detail: `À ${fmtEuros(Math.round(prixM2Actuel))}/m², le cash-flow est négatif (−${fmtEuros(Math.abs(cashflowAvant))}/mois). À ${fmtEuros(Math.round(cibleM2))}/m², il s'équilibre.`,
          verbatim: `À ce prix de ${fmtEuros(Math.round(prixM2Actuel))}/m², chaque mois tu paies −${fmtEuros(Math.abs(cashflowAvant))} de poche. En négociant à ${fmtEuros(Math.round(cibleM2))}/m², l'opération s'autofinance.`,
          source: "Calcul",
        });
      }

      // Méthode : tactique de négociation.
      out.push({
        titre: "Stratégie : chiffre et ancre bas",
        detail: `Une offre écrite, détaillée (prix de marché + travaux obligatoires + plan de financement), pèse plus qu'une négociation orale. Ancre à ${fmtEuros(Math.round(cibleM2))}/m² avec justification.`,
      });
      out.push({
        titre: "Sonde la motivation du vendeur",
        detail: `Ancienneté de l'annonce, baisses passées, urgence de vendre. Un vendeur pressé laisse plus de marge de négociation.`,
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
        action: `Négocie à ${fmtEuros(cible)} — soit −${pct} % (${fmtEuros(baisse)} de moins)`,
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
    return carte(cible, {
      pourquoi: `${frein} bloque l'achat, quel que soit le prix : traite d'abord ce frein (voir ci-dessous).`,
      caveat: "La négociation seule ne suffit pas à valider l'achat.",
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
      action: `Rénove pour viser un DPE ${dpeCible} et un loyer premium (+${Math.round(LOYER_BOOST_RENO * 100)} %)`,
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
      arguments: (() => {
        const args: Argument[] = [];
        const surface = apt.surface_m2 ?? 0;
        const loyerActuel = apt.loyer_retenu ?? 0;
        const pctBudget = Math.round((coutTravaux / (apt.prix ?? 1)) * 100);
        const loyerGain = loyerCible - loyerActuel;
        const loyerGainAnnuel = loyerGain * 12;
        const dlEquilibre = coutTravaux > 0 ? Math.round(coutTravaux / loyerGain) : 0;
        const echeance =
          dpeCourant === "G" ? "2025 (DÉJÀ INTERDIT)" : dpeCourant === "F" ? "2028" : "2034";

        // Urgence DPE chiffrée.
        args.push({
          titre: `DPE ${dpeCourant} : interdiction louer ${echeance}`,
          detail: `Classe ${dpeCourant} interdit à la location ${echeance}. Rénover jusqu'à D lève l'interdiction ET sécurise la revente.`,
          verbatim: `Le DPE ${dpeCourant} impose une rénovation pour continuer à louer. C'est un coût de restructuration obligatoire, à anticiper.`,
          source: "ADEME",
        });

        // Coût travaux contextualisé.
        args.push({
          titre: `Coût réaliste pour ce bien : ${fmtEuros(coutTravaux)}`,
          detail: `${Math.round(surface)} m² × ${COUT_RENO_M2}€/m² (énergie + standing). = ${pctBudget}% du prix d'achat. À affiner avec 2–3 devis réels (élec, vitrages, chauffage).`,
        });

        // ROI des travaux chiffré.
        args.push({
          titre: `ROI des travaux : ${Math.round(LOYER_BOOST_RENO * 100)}% loyer = +${fmtEuros(loyerGain)}/mois`,
          detail: `Loyer passe de ${fmtEuros(loyerActuel)} à ${fmtEuros(loyerCible)}/mois (+${fmtEuros(loyerGainAnnuel)}/an). Travaux rentabilisés en ~${dlEquilibre} mois.`,
          verbatim: `Un bien refait à neuf se loue nettement plus cher. Ici : passage de ${fmtEuros(loyerActuel)} à ${fmtEuros(loyerCible)}/mois. Les travaux se remboursent vite.`,
        });

        // Aides chiffrées.
        args.push({
          titre: "Aides publiques à explorer",
          detail: `MaPrimeRénov' + éco-PTZ + primes CEE peuvent couvrir 30–50% du coût travaux. LMNP meublé : éligibilité partielle (à vérifier avec un conseiller).`,
        });

        // Amortissement fiscal.
        args.push({
          titre: "Travaux amortis en LMNP réel",
          detail: `${fmtEuros(coutTravaux)} amortis sur 10–20 ans = réduction d'impôt significative. Combiné au loyer premium, l'opération dégage vite du flux.`,
        });

        // Priorisation technique.
        args.push({
          titre: "Par où commencer ? Priorise l'impact",
          detail: `1. Isolation/chauffage/fenêtres (impact DPE + économies d'énergie) → 50–60% du budget. 2. Cuisine/SdB (impact loyer) → 30–40%. 3. Peinture/finitions (photos) → 10%. Demande 2–3 devis détaillés : ils servent aussi d'argument de négociation auprès du vendeur.`,
        });

        return args;
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
      action: bornéParRealisme
        ? `Revalorise à ${fmtEuros(loyerCible)}/mois CC (+${pct} %)`
        : `Vise ${fmtEuros(loyerCible)}/mois CC (+${pct} %), haut de fourchette ANIL`,
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
        const loyerActuelM2 = surface > 0 ? loyerActuel / surface : 0;
        const minCC_m2 = ctx.loyerRef.min * (1 + MAJORATION_MEUBLE) + PROVISION_CHARGES_M2;
        const loyerMinAnil = Math.round(minCC_m2 * surface);
        const loyerMoyAnil = Math.round((minCC_m2 + maxCC_m2) / 2 * surface);
        const cibleM2 = surface > 0 ? loyerCible / surface : 0;
        const pct = Math.round(((loyerCible - loyerActuel) / loyerActuel) * 100);

        // Fourchette ANIL détaillée pour ce bien.
        args.push({
          titre: "Fourchette ANIL pour ce bien",
          detail: `${Math.round(surface)} m² : loyer min ${fmtEuros(loyerMinAnil)}/mois, max ${fmtEuros(loyerMaxAnil)}/mois (Carte ANIL${ctx.loyerRef.annee ? ` ${ctx.loyerRef.annee}` : ""}, ${ctx.loyerPerimetre === "arrondissement" ? "arrondissement" : "rayon 500m"}). Ton loyer actuel ${fmtEuros(loyerActuel)} = ${loyerActuel < loyerMoyAnil ? "−" : "+"}${Math.abs(Math.round(((loyerActuel - loyerMoyAnil) / loyerMoyAnil) * 100))}% vs moyenne.`,
          source: "ANIL",
        });

        // Potentiel de revalorisation chiffré.
        args.push({
          titre: `Potentiel de revalorisation : +${pct}%`,
          detail: `Passer de ${fmtEuros(loyerActuel)}/mois (${Math.round(loyerActuelM2)}€/m²) à ${fmtEuros(loyerCible)}/mois (${Math.round(cibleM2)}€/m²) ${bornéParRealisme ? "réaliste à la relocation" : "(haut de fourchette ANIL)"}. Gain annuel brut : ${fmtEuros((loyerCible - loyerActuel) * 12)}.`,
        });

        // Stratégie qualité.
        args.push({
          titre: "Stratégie qualité pour justifier le premium",
          detail: `Meublé haut de gamme (électroménager, literie neuve, mobilier soigné) + petit rafraîchissement (peinture, luminaires) = photos qui vendent, candidats triés, loyer tenu. Coût : ~1 000–2 000€, rentabilisé en 2–3 mois.`,
        });

        // Annonce et présentation.
        args.push({
          titre: "L'annonce fait 50% du loyer",
          detail: `Photos en lumière naturelle, description des atouts (transports, commerces, proximité écoles), disponibilité rapide, réactivité aux visites = candidats de qualité, loyer négocié vers le haut.`,
        });

        // Réalisme : revalorisation progressive.
        if (bornéParRealisme) {
          args.push({
            titre: "Revalorisation progressive, surtout à la relocation",
            detail: `Un locataire en place : révision annuelle limitée à l'inflation. Potentiel max à la relocation (nouveau locataire payant le marché). Compte 6–12 mois d'adaptation.`,
          });
        }

        // Encadrement légal (caveat si nécessaire).
        args.push({
          titre: "Encadrement légal : à vérifier",
          detail: `Paris, Lille, Lyon, Montpellier ont des loyers plafonnés. Avant de fixer le tien, vérifie la commune sur le portail des loyers.`,
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
      action: `Ajoute ≈ ${fmtEuros(apportSupp)} d'apport (emprunte d'autant moins)`,
      rendementAvant,
      rendementApres: ctx.rendementNetBase,
      cashflowAvant,
      cashflowApres: cashflowOf(mod),
      verdictApres,
      flipVersAchat: !dejaAchat && verdictApres === "achete",
      patch: { simulation_inputs: { ...inputs, montantEmprunte: montantCible } },
      arguments: (() => {
        const args: Argument[] = [];
        const ecartCashflow = Math.abs(cashflowAvant ?? 0);
        const pctCapital = Math.round((apportSupp / capitalActuel) * 100);
        const mensualiteAnte = (capitalActuel * 0.004) / 1; // approx pour contexte
        const mensualitePost = (montantCible * 0.004) / 1; // approx pour contexte
        const gainMensuel = cashflowOf(mod) ?? 0;

        // Diagnostic du cash-flow déficitaire.
        args.push({
          titre: `Cash-flow déficitaire : −${fmtEuros(ecartCashflow)}/mois`,
          detail: `À ce niveau de financement, tu paies ${fmtEuros(ecartCashflow)}/mois de poche. Problème : emprunt trop important (${fmtEuros(capitalActuel)}) vs loyer insuffisant (${fmtEuros(apt.loyer_retenu ?? 0)}/mois).`,
          source: "Calcul",
        });

        // Solution : augmenter l'apport.
        args.push({
          titre: `Solution : +${fmtEuros(apportSupp)} d'apport (${pctCapital}% du capital)`,
          detail: `Emprunt réduit de ${fmtEuros(capitalActuel)} à ${fmtEuros(montantCible)}. Mensualité baisse, cash-flow passe à l'équilibre.`,
          verbatim: `En renforçant mon apport de ${fmtEuros(apportSupp)}, j'emprunte d'autant moins. Ça rend l'opération autofinancée mois par mois.`,
        });

        // Optimisation de l'emprunt (taux, assurance).
        args.push({
          titre: "Optimiser l'emprunt : taux + assurance",
          detail: `Avec un crédit de ${fmtEuros(montantCible)}, négocier 0.2% de baisse de taux = gain ~${fmtEuros(montantCible * 0.002)}/an. Assurance délégable (loi Lemoine) : souvent 30–50% moins cher qu'assurance bancaire.`,
        });

        // Durée vs apport.
        args.push({
          titre: "Durée du crédit : arbitrage emprunt vs apport",
          detail: `Allonger à 25 ans réduit la mensualité. Mais renforcer l'apport réduit aussi l'emprunt ET son coût total. Calcule les 2 : parfois l'apport extra est plus rentable qu'une durée longue.`,
        });

        // Caveat : ce n'est pas une vraie optimisation.
        args.push({
          titre: "⚠️ Apport ≠ optimisation du bien",
          detail: `Renforcer l'apport améliore le cash-flow, pas la rentabilité intrinsèque. C'est un contournement : tu mets plus de capital propre pour compenser un loyer ou prix insuffisant.`,
        });

        return args;
      })(),
      pourquoi: "Cash-flow ramené à l'équilibre en empruntant moins.",
      caveat: "Améliore le cash-flow, pas la rentabilité du bien.",
    };
  }
}
