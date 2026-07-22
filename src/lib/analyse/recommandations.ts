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
      const dpe = (ctx.baseBlocs.risque.dpeGes?.dpe ?? apt.dpe ?? "").toUpperCase();

      if (ecartPct != null && ecartPct >= 3) {
        const ref =
          nbVentes != null && mediane != null
            ? ` (${nbVentes} ventes à ${fmtEuros(mediane)}/m² sur 3 ans)`
            : mediane != null
              ? ` (médiane ${fmtEuros(mediane)}/m²)`
              : "";
        out.push({
          titre: "Prix au-dessus du marché",
          detail: `Le prix ressort +${ecartPct} % au-dessus de la médiane des ventes réelles du quartier${ref}.`,
          verbatim: `D'après les ventes notariales récentes du secteur (base DVF)${mediane != null ? `, le prix au m² tourne autour de ${fmtEuros(mediane)}` : ""}. Votre bien est ${ecartPct} % au-dessus : je me positionne à ${fmtEuros(cible)}, cohérent avec le marché.`,
          source: "DVF",
        });
      }
      if (["E", "F", "G"].includes(dpe)) {
        const echeance =
          dpe === "G" ? "déjà interdit à la location" : dpe === "F" ? "interdit à la location en 2028" : "interdit à la location en 2034";
        out.push({
          titre: `DPE ${dpe} : levier de décote`,
          detail: `Classe ${dpe} — ${echeance} (loi Climat). Les travaux de rénovation à prévoir se déduisent du prix.`,
          verbatim: `Le DPE ${dpe} impose une rénovation énergétique pour pouvoir louer ; son coût doit être répercuté sur le prix d'achat.`,
          source: "ADEME",
        });
      }
      if (cashflowAvant != null && cashflowAvant < 0) {
        out.push({
          titre: "Opération déficitaire à ce prix",
          detail: `Au prix affiché, le cash-flow est négatif (−${fmtEuros(Math.abs(cashflowAvant))}/mois après crédit et impôts).`,
          verbatim: `À ce niveau de prix, l'opération est déficitaire chaque mois ; pour qu'elle s'équilibre, il faut viser environ ${fmtEuros(cible)}.`,
          source: "Calcul",
        });
      }
      out.push({
        titre: "Fais une offre écrite et argumentée",
        detail:
          "Une offre chiffrée, avec ton plan de financement prêt, pèse plus qu'une négociation orale. Ancre bas mais justifié, et n'annonce jamais ton budget maximum.",
      });
      out.push({
        titre: "Sonde la motivation du vendeur",
        detail:
          "Ancienneté de l'annonce, baisses de prix déjà passées, raison de la vente : plus le vendeur est pressé, plus ta marge de négociation est grande.",
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
      arguments: [
        {
          titre: "Sortie de passoire thermique",
          detail: `Rénover jusqu'à un DPE D lève l'interdiction de louer (classe ${dpeCourant} : ${
            dpeCourant === "G" ? "déjà interdite" : dpeCourant === "F" ? "interdite en 2028" : "interdite en 2034"
          }) et sécurise la revente.`,
          source: "ADEME",
        },
        {
          titre: "Loyer premium après rénovation",
          detail: `Un bien refait à neuf se loue jusqu'à +${Math.round(LOYER_BOOST_RENO * 100)} % (voir le levier Loyer).`,
        },
        {
          titre: "Aides mobilisables",
          detail:
            "MaPrimeRénov', éco-PTZ et primes CEE réduisent la facture des travaux (éligibilité selon ta situation, à vérifier).",
        },
        {
          titre: "Travaux amortissables (LMNP réel)",
          detail: "En LMNP au réel, les travaux s'amortissent et gomment l'impôt pendant plusieurs années.",
        },
        {
          titre: "Priorise l'impact, chiffre avant d'acheter",
          detail:
            "D'abord isolation, chauffage et menuiseries (DPE), puis cuisine et salle de bains (loyer). Demande 2–3 devis : ils servent aussi d'argument pour négocier le prix.",
        },
      ],
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
      arguments: [
        {
          titre: "Marge de revalorisation réelle",
          detail: `Ton loyer est sous le haut du marché local (Carte des loyers ANIL${ctx.loyerRef.annee ? `, ${ctx.loyerRef.annee}` : ""}). Une remise à niveau, surtout à la relocation, est justifiée.`,
          source: "ANIL",
        },
        {
          titre: "Meuble avec qualité (LMNP)",
          detail:
            "Mobilier soigné, électroménager complet, literie neuve : le meublé haut de gamme justifie un loyer premium et attire de meilleurs dossiers.",
        },
        {
          titre: "Rafraîchis à petit budget",
          detail:
            "Peinture claire, luminaires, petits travaux : des photos qui donnent envie = plus de candidats et un loyer tenu dans le temps.",
        },
        {
          titre: "Soigne l'annonce et les atouts",
          detail:
            "Photos lumineuses, description qui met en avant transports, commerces et écoles à proximité, réactivité aux demandes.",
        },
        {
          titre: "Vérifie l'encadrement des loyers",
          detail:
            "Dans certaines communes (Paris, Lille, Lyon, Montpellier…), un loyer plafond légal s'applique : à contrôler avant de fixer le prix.",
        },
      ],
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
      arguments: [
        {
          titre: "Mets les banques en concurrence",
          detail:
            "Fais jouer plusieurs banques, ou passe par un courtier : quelques dixièmes de taux changent nettement le cash-flow.",
        },
        {
          titre: "Délègue l'assurance emprunteur",
          detail:
            "La loi Lemoine permet de changer d'assurance à tout moment : souvent le plus gros gain sur le coût total du crédit.",
        },
        {
          titre: "Ajuste durée, apport et différé",
          detail:
            "Allonger la durée ou renforcer l'apport améliore le cash-flow mensuel (au prix du coût total du crédit ou de l'immobilisation).",
        },
      ],
      pourquoi: "Cash-flow ramené à l'équilibre en empruntant moins.",
      caveat: "Améliore le cash-flow, pas la rentabilité du bien.",
    };
  }
}
