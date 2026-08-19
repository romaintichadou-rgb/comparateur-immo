"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, Clock, Loader2, Sparkles } from "lucide-react";
import { StatCard, type StatCardTone } from "@/components/StatCard";
import type { ApartmentWithComputed } from "@/lib/types";
import { isImmeuble } from "@/lib/types";
import type { BlocAnalyse, BlocHighlight, BlocKey, Fait, FaitGravite, Verdict } from "@/lib/analyse/types";
import {
  NOTE_TEXT_CLASS,
  SEUILS_RENDEMENT_DEFAUT,
  avisDpeEnTete,
  blocCategorie,
  cashflowTone,
  noteTone,
  rendementNetTone,
  DECISION_CHIP,
  TONE_PANEL_STYLES,
  type CashflowSeuils,
  type RendementSeuils,
  type ScoreTone,
} from "@/lib/analyse/scoring";
import { computeDecision, ecartPrixMarche, extractBlocNotes, type Decision } from "@/lib/analyse/decision";
import type { AppSettings } from "@/lib/settings";
import { useRendementDetail } from "@/components/RendementDetailProvider";
import { useCashflowDetail } from "@/components/CashflowDetailProvider";
import { useLoyerDetail } from "@/components/LoyerDetailProvider";
import { formatDateTime, formatEuros, formatEurosSigned, formatNombre, formatNote, formatPercent } from "@/lib/format";
import { AiEstimatedBadge } from "@/components/form/Fields";
import { isAiEstimated } from "@/lib/estimates";
import { renderMarkdownBold } from "@/components/richText";
import { GroupHeader, TITRE_RECOMMANDATION, TITRE_SECTION } from "@/components/SectionHeader";
import { BLOC_COLORS, BLOC_ICON, BLOC_SUBTITLES } from "@/lib/analyse/bloc-ui";
import { redirectionQuota } from "@/lib/quota";
import { resolveInputs, simulate, type SimulationResult } from "@/lib/simulation";

/** Repli si le profil investisseur n'a pas pu être chargé — les seuils réels
 * viennent toujours des réglages (prop `cashflowSeuils`). */
const CASHFLOW_SEUILS_DEFAUT: CashflowSeuils = { vert: 0, rouge: -200 };

const HIGHLIGHTS_RENDEMENT = new Set(["Rendement brut", "Rendement net"]);

/** Libellés produits par `buildBlocSimulation` — les garder synchronisés avec
 * `blocs/simulation.ts`, c'est lui qui fabrique ces chaînes. */
const HIGHLIGHTS_CASHFLOW_RE = /^Cash-flow mensuel/;

/** Les highlights ont un habillage identique quelle que soit la tonalité —
 * seule la couleur de la valeur varie, et elle vient de `TONE_TEXT_CLASS`
 * (source unique). Ne pas réintroduire une table par tonalité ici. */

const CATEGORIE_TAG_STYLES: Record<ScoreTone, string> = {
  emerald: "bg-emerald-50 text-emerald-700 shadow-[inset_0_0_0_1px_rgba(4,120,87,.12)]",
  amber: "bg-amber-50 text-amber-700 shadow-[inset_0_0_0_1px_rgba(180,83,9,.12)]",
  red: "bg-red-50 text-red-700 shadow-[inset_0_0_0_1px_rgba(185,28,28,.12)]",
  neutral: "bg-ink-100 text-ink-500",
};

/** Habillage de la CARTE verdict (fond dégradé, bordure, couleurs de texte). */
const DECISION_STYLES: Record<
  Decision,
  { grad: string; border: string; title: string; caption: string }
> = {
  achete: { grad: "bg-gradient-to-r from-white to-emerald-50", border: "border-emerald-200", title: "text-emerald-900", caption: "text-emerald-700" },
  negocie: { grad: "bg-gradient-to-r from-white to-amber-50", border: "border-amber-200", title: "text-amber-900", caption: "text-amber-700" },
  passe: { grad: "bg-gradient-to-r from-white to-red-50", border: "border-red-200", title: "text-red-900", caption: "text-red-700" },
};


/** Titre-verdict de la card. Registre volontairement différent de
 * `DECISION_CHIP` (« À écarter ») : la pastille CLASSE le bien pour les listes,
 * ce titre ADRESSE le lecteur. Ne pas fusionner les deux tables. */
const DECISION_TITRES: Record<Decision, string> = {
  achete: "Acheter",
  negocie: "Négocier",
  passe: "Passer",
};

/** Repli de `onGoTab` — hors composant, sinon une nouvelle identité par rendu. */
const NO_GO_TAB: GoTab = () => {};

/**
 * Phrase de justification sous le titre-verdict.
 *
 * ⚠️ C'est ELLE qui nomme le point décisif de l'écran, et c'est la raison pour
 * laquelle l'en-tête ne réaffiche plus la liste des verdicts : le verdict
 * rendement est empilé en tête par `buildVerdicts`, donc les deux `find`
 * ci-dessous tombent toujours dessus en premier. Ajouter une branche qui cesse
 * de citer un verdict rend cette information muette — la vérifier ici avant de
 * réintroduire un affichage ailleurs.
 */
function raisonDecision(
  score: number | null,
  decision: Decision,
  ecartPct: number | null,
  verdicts: Verdict[]
): string {
  if (score == null) return "Données insuffisantes pour évaluer cette opportunité.";

  if (decision === "passe") {
    const alerte = verdicts.find((v) => v.niveau === "alerte");
    return alerte
      ? `${alerte.titre}. C'est rédhibitoire : une négociation ne le rattrape pas, mieux vaut chercher un autre bien.`
      : "Trop de points faibles pour un investissement sain.";
  }

  if (decision === "achete") {
    return ecartPct != null && ecartPct <= -5
      ? `Aucun frein détecté, et un prix affiché ${Math.abs(ecartPct)} % sous les ventes comparables : un bon dossier, à sécuriser sans traîner.`
      : "Aucun frein détecté : prix, rendement et risques sont alignés pour investir.";
  }

  if (ecartPct != null && ecartPct > 0) {
    return `Le prix affiché est ${ecartPct} % au-dessus des ventes comparables du secteur. Négocie-le vers le marché : c'est là qu'est ta marge.`;
  }
  const attention = verdicts.find((v) => v.niveau === "attention");
  return attention
    ? `${attention.titre}. Le bien reste intéressant, mais négocie le prix d'achat pour compenser ce point.`
    : "Un signal n'est pas encore au vert. Une négociation du prix d'achat sécurise l'opération.";
}

/** Couleurs par décision — bordure du curseur et du badge, texte du score. */
const TREND_COLORS: Record<Decision, { border: string; text: string; badgeBorder: string }> = {
  passe: { border: "border-red-500", text: "text-red-600", badgeBorder: "border-red-200" },
  negocie: { border: "border-amber-500", text: "text-amber-600", badgeBorder: "border-amber-200" },
  achete: { border: "border-emerald-500", text: "text-emerald-600", badgeBorder: "border-emerald-200" },
};

/** Zones de la barre : proportions 30 / 28 / 42, frontières à 30 % et 58 %. */
const TREND_ZONES = [
  { key: "passe" as const, label: "Passer", flex: 30, start: 0, labelColor: "text-red-600", align: "text-left" as const },
  { key: "negocie" as const, label: "Négocier", flex: 28, start: 30, labelColor: "text-amber-600", align: "text-center" as const },
  { key: "achete" as const, label: "Acheter", flex: 42, start: 58, labelColor: "text-emerald-600", align: "text-right" as const },
];

function TrendBar({ score, decision }: { score: number | null; decision: Decision }) {
  const zone = TREND_ZONES.find((z) => z.key === decision) ?? TREND_ZONES[0];
  const colors = TREND_COLORS[decision];

  const cursorPct = (() => {
    if (score == null) return zone.start + zone.flex / 2;
    const t = Math.max(0, Math.min(10, score)) / 10;
    return zone.start + t * zone.flex;
  })();

  return (
    <div
      className="w-full"
      role="meter"
      aria-label={`Tendance : ${zone.label}`}
      aria-valuenow={score ?? undefined}
      aria-valuemin={0}
      aria-valuemax={10}
    >
      {/* Labels — toujours tous colorés */}
      <div className="mb-1.5 flex font-mono text-[9px] font-semibold uppercase tracking-wide">
        {TREND_ZONES.map((z) => (
          <span key={z.key} className={`${z.labelColor} ${z.align}`} style={{ width: `${z.flex}%` }}>
            {z.label}
          </span>
        ))}
      </div>

      {/* Barre */}
      <div className="relative h-2.5" style={{ borderRadius: 5 }}>
        {/* Piste fadée — 3 zones à 15 % */}
        <div className="absolute inset-0 flex overflow-hidden" style={{ borderRadius: 5 }}>
          <div className="h-full bg-red-500" style={{ flex: 30, opacity: 0.15 }} />
          <div className="h-full bg-amber-500" style={{ flex: 28, opacity: 0.15 }} />
          <div className="h-full bg-emerald-500" style={{ flex: 42, opacity: 0.15 }} />
        </div>

        {/* Remplissage dégradé opaque jusqu'au curseur */}
        {score != null && (
          <div
            className="absolute left-0 top-0 h-full transition-[width] duration-700 ease-out"
            style={{
              width: `${cursorPct}%`,
              borderRadius: 5,
              background: "linear-gradient(90deg, #dc2626 0%, #d97706 46%, #059669 100%)",
            }}
          />
        )}

        {/* Séparateurs de zones */}
        <div className="absolute border-l border-dashed border-ink-200" style={{ left: "30%", top: -2, bottom: -2 }} />
        <div className="absolute border-l border-dashed border-ink-200" style={{ left: "58%", top: -2, bottom: -2 }} />

        {/* Curseur */}
        {score != null && (
          <div
            className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-white ${colors.border} transition-[left] duration-700 ease-out`}
            style={{ left: `${cursorPct}%`, boxShadow: "0 1px 5px rgba(0,0,0,0.18)", zIndex: 2 }}
          />
        )}
      </div>
    </div>
  );
}

function ScoreBadge({ score, decision }: { score: number | null; decision: Decision }) {
  const colors = TREND_COLORS[decision];
  return (
    <div
      className={`flex shrink-0 flex-col items-center gap-0.5 rounded-[10px] border bg-white px-3.5 py-2 ${colors.badgeBorder}`}
      aria-label={score == null ? "Analyse non générée" : `Score ${formatNote(score)} sur 10`}
    >
      <span className={`font-mono text-[22px] font-semibold leading-none tabular-nums ${colors.text}`}>
        {score != null ? formatNote(score) : "—"}
      </span>
      <span className="text-[9px] font-medium text-ink-400">/10</span>
    </div>
  );
}


const BLOC_ORDRE: BlocKey[] = ["prix", "location", "simulation", "potentiel", "risque"];

/**
 * Gravité d'un FAIT — axe distinct de la tonalité (`TONE_TEXT_CLASS`), d'où
 * une table séparée et non une réutilisation.
 *
 * `info` ≠ `neutral` : "neutral" veut dire "donnée indisponible" (valeur "—"),
 * alors qu'un fait `info` porte une vraie valeur, simplement sans jugement.
 * D'où `text-ink-800` — lisible, un cran sous le `text-ink-900` d'une valeur
 * mise en avant. Ce n'est PAS une 3e définition du neutre qui aurait dérivé :
 * ne pas l'aligner sur ink-900 ni sur ink-400 en "harmonisant".
 */
const GRAVITE_STYLES: Record<FaitGravite, { dot: string; value: string }> = {
  positif: { dot: "bg-emerald-500", value: "text-emerald-700" },
  info: { dot: "bg-ink-300", value: "text-ink-800" },
  attention: { dot: "bg-amber-500", value: "text-amber-700" },
  alerte: { dot: "bg-red-500", value: "text-red-600" },
};


type GoTab = (tab: "ia" | "donnees" | "financiere" | "simulation" | "playground", anchor?: string) => void;

export default function AnalyseIA({
  apartment,
  settings,
  seuilsRendement = SEUILS_RENDEMENT_DEFAUT,
  cashflowSeuils = CASHFLOW_SEUILS_DEFAUT,
  onAnalysed,
  onRelancer,
  onGoTab,
  quotaNotice = false,
}: {
  apartment: ApartmentWithComputed;
  /** Profil investisseur — nécessaire pour résoudre le profil emprunteur hérité
   * avant de rejouer la simulation (MetricCard cash-flow). */
  settings: AppSettings;
  seuilsRendement?: RendementSeuils;
  cashflowSeuils?: CashflowSeuils;
  onAnalysed: (apt: ApartmentWithComputed) => void;
  onRelancer?: () => void;
  onGoTab?: GoTab;
  quotaNotice?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const analyse = apartment.analyse_ia;
  const immeuble = isImmeuble(apartment.type_bien);

  /* ⚠️ Ces trois hooks doivent rester AU-DESSUS du `if (!analyse)` ci-dessous :
     un composant qui retourne tôt ne peut plus déclarer de hook après
     (`react-hooks/rules-of-hooks`). Ils alimentent la rangée de KPI, qui n'est
     rendue que dans la branche « analyse présente ». */
  const { open: openRendementDetail } = useRendementDetail();
  const { open: openCashflowDetail } = useCashflowDetail();
  const { open: openLoyerDetail } = useLoyerDetail();
  const simuKpi = useMemo(
    () => simulate(apartment, resolveInputs(apartment.simulation_inputs, settings)),
    [apartment, settings],
  );

  async function lancerPremiere() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analyse/${apartment.id}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        onAnalysed(data.apartment);
      } else {
        const versUpgrade = redirectionQuota(res, data);
        if (versUpgrade) {
          router.push(versUpgrade);
          return;
        }
        setError(data.error ?? "Échec de l'analyse.");
      }
    } catch {
      setError("Erreur réseau pendant l'analyse.");
    } finally {
      setLoading(false);
    }
  }

  if (!analyse) {
    const prixManquant = apartment.prix == null;
    return (
      <section className="rounded-xl border border-ink-100 bg-gradient-to-r from-white to-accent-50 p-8 text-center sm:p-12">
        <Sparkles className="mx-auto h-8 w-8 text-accent-500" />
        <h1 className="mt-3 heading-h1">
          Pas encore de bilan pour {immeuble ? "cet immeuble" : "ce bien"}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
          L&apos;analyse s&apos;appuie uniquement sur des données publiques réelles (DVF, ADEME, Géorisques, ANIL…) : score global, comparaison au marché et points rédhibitoires.
        </p>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {prixManquant ? (
          <p className="mt-6 text-sm text-ink-600">
            Renseigne d&apos;abord le prix d&apos;achat dans{" "}
            <button
              type="button"
              onClick={() => onGoTab?.("donnees")}
              className="font-medium text-accent-600 underline underline-offset-2 hover:text-accent-700"
            >
              la description du bien
            </button>
            .
          </p>
        ) : (
          <button
            onClick={lancerPremiere}
            disabled={loading}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-70"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Analyse en cours…" : "Lancer l'analyse"}
          </button>
        )}
        {loading && (
          <p className="mt-3 text-xs text-ink-400">
            Collecte des données réelles et rédaction — environ 30 s, ne quittez pas la page.
          </p>
        )}
      </section>
    );
  }

  // --- Données dérivées (aucun nouvel appel) --------------------------------
  const score = analyse.score_global;
  const verdicts = analyse.verdicts ?? [];

  const ecartPct = ecartPrixMarche(analyse.blocs?.prix);

  // --- Decision --------------------------------------------------------------
  const blocNotes = extractBlocNotes(analyse.blocs ?? {});
  const decision: Decision = score != null
    ? computeDecision(score, verdicts, ecartPct, blocNotes, apartment.rendement_net, seuilsRendement)
    : "passe";
  const raison = raisonDecision(score, decision, ecartPct, verdicts);
  const styles = DECISION_STYLES[decision];

  /* ⚠️ L'en-tête n'affiche PLUS la liste des verdicts, seulement l'interdiction
     de louer (DPE F/G) — les autres se lisaient déjà à moins de 100 px : un
     verdict `origine: "bloc"` répète une note de la rangée ci-dessous (rouge
     ET cliquable, elle), et le verdict rendement est cité mot pour mot par
     `raisonDecision`. Pire, `computeDecision` ignorant les alertes `bloc`, un
     bien pouvait afficher « Aucun frein détecté » au-dessus d'une carte rouge.
     Ne PAS remonter ce filtre dans `buildVerdicts` : la décision, la narration
     et le frein d'Optimiser lisent TOUS les verdicts (cf. `types.ts`). */
  const avisDpe = avisDpeEnTete(analyse.blocs?.risque?.dpeGes?.dpe);

  /* Deux listes, pas une : `blocsAffiches` porte TOUS les blocs présents (les
     sections détaillées valent aussi pour un bloc non noté), `blocsAvecNote`
     seulement ceux qui ont un chiffre à mettre dans la rangée de notes. La
     rangée se filtrait elle-même à l'affichage tout en se gardant sur la
     longueur de la liste non filtrée : un bien dont aucun bloc n'était noté
     rendait une rangée vide avec sa marge. */
  const blocsAffiches = BLOC_ORDRE.map((k) => analyse.blocs?.[k]).filter((b): b is BlocAnalyse => b != null);
  const blocsAvecNote = blocsAffiches.filter((b): b is BlocAnalyse & { note: number } => b.note != null);
  const quartier = analyse.blocs?.quartier;
  const blocs = quartier ? [...blocsAffiches, quartier] : blocsAffiches;

  const goTab = onGoTab ?? NO_GO_TAB;

  /* Rangée de KPI — déplacée depuis l'en-tête de `ApartmentDetail`, où elle
     restait visible sur les cinq onglets. Elle réutilise `ecartPct`, déjà
     dérivé plus haut du bloc Prix : l'en-tête en gardait son propre calcul
     (`kpiEcartPct`) sur la même source. */
  const kpiCashflow = simuKpi?.cashflowMensuelMoyenLMNP ?? null;
  const kpiAnneesExo = simuKpi?.anneesExonerees ?? 0;
  const loyerRetenu = apartment.loyer_retenu;
  const loyerManuel = apartment.champs_manuels.includes("loyer_retenu");
  const loyerEstimeIA = apartment.champs_estimes_ia.includes("loyer_retenu");
  const kpiFaitEcart = analyse.blocs?.prix?.faits?.find((f) => f.label === "Écart au prix de marché");
  const kpiEcartTone: StatCardTone =
    kpiFaitEcart?.gravite === "positif" ? "positif"
      : kpiFaitEcart?.gravite === "attention" ? "attention"
        : kpiFaitEcart?.gravite === "alerte" ? "alerte" : "neutral";

  return (
    <div className="space-y-0">
      {/* ── 1. Verdict Card ── */}
      <section className={`rounded-2xl border p-6 sm:p-8 ${styles.border} ${styles.grad}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${DECISION_CHIP[decision].className}`}>
                {DECISION_CHIP[decision].label}
              </span>
              <span className="whitespace-nowrap text-[10px] text-ink-400">
                {formatDateTime(analyse.genere_le)}
              </span>
              <button
                onClick={onRelancer}
                disabled={!onRelancer}
                className="text-[11px] font-medium text-ink-400 underline underline-offset-2 hover:text-accent-600 disabled:opacity-60"
              >
                Relancer
              </button>
            </div>
            <h2 className={`mt-2 font-display text-4xl font-semibold leading-snug sm:text-5xl ${styles.title}`}>
              {DECISION_TITRES[decision]}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">{raison}</p>
          </div>
          <ScoreBadge score={score} decision={decision} />
        </div>

        <div className="mt-5">
          <TrendBar score={score} decision={decision} />
        </div>

        {blocsAvecNote.length > 0 && (
          <div className="mt-6 flex flex-wrap items-baseline gap-x-8 gap-y-2 pt-1">
            {blocsAvecNote.map((b) => {
              const colorClass = NOTE_TEXT_CLASS[noteTone(b.note)];
              return (
                <span key={b.cle} className="text-xs text-ink-400">
                  <button
                    type="button"
                    onClick={() => goTab("ia", `bloc-${b.cle}`)}
                    className="rounded-sm transition-colors hover:text-ink-600 hover:underline hover:decoration-ink-300 hover:underline-offset-2"
                  >
                    {b.titre}
                  </button>
                  <span className={`ml-1.5 font-bold tabular-nums ${colorClass}`}>
                    {formatNote(b.note)}
                  </span>
                </span>
              );
            })}
          </div>
        )}

        {/* Rouge en dur : `enTete` n'est vrai que pour des entrées `alerte`
            (invariant documenté sur `VERDICTS_DPE`), et un DPE F/G force de
            toute façon la décision `passe`. */}
        {avisDpe && (
          <p className="mt-5 flex items-start gap-1.5 text-xs text-red-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {avisDpe.detail}
          </p>
        )}

        {quotaNotice && (
          <p className="mt-5 flex items-start gap-1.5 text-xs text-amber-600">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Résumés IA temporairement indisponibles (quota gratuit atteint). Les scores et données
            chiffrées sont complets — réessayez dans quelques minutes.
          </p>
        )}
      </section>

      {/* ── 2. Rangée de KPI ── */}
      <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Rendement net"
          value={apartment.rendement_net == null ? "—" : formatPercent(apartment.rendement_net)}
          sub="Net après charges et impôts"
          tone={rendementNetTone(apartment.rendement_net, seuilsRendement)}
          onClick={() => openRendementDetail(apartment, seuilsRendement)}
        />
        <StatCard
          label="Cash-flow mensuel"
          value={formatEurosSigned(kpiCashflow)}
          sub={kpiCashflow == null ? "Données manquantes" : kpiAnneesExo > 1 ? `Moyen sur ${kpiAnneesExo} ans sans impôt` : "Net après impôt"}
          tone={cashflowTone(kpiCashflow, cashflowSeuils)}
          onClick={() => openCashflowDetail(apartment, cashflowSeuils, settings)}
        />
        <StatCard
          label="Prix au m²"
          value={apartment.prix_m2 == null ? "—" : `${formatEuros(apartment.prix_m2)}/m²`}
          sub={ecartPct != null
            ? `${ecartPct > 0 ? "+" : ""}${ecartPct} % vs marché local`
            : "Pas de donnée de marché"}
          tone={ecartPct != null ? kpiEcartTone : "neutral"}
        />
        <StatCard
          label="Loyer mensuel"
          value={loyerRetenu != null ? formatEuros(loyerRetenu) : "—"}
          sub={loyerRetenu != null ? "/mois" : "À estimer"}
          badge={loyerEstimeIA ? { text: "IA", color: "yellow", icon: true } : loyerManuel ? { text: "Manuel", color: "blue" } : undefined}
          tone="neutral"
          onClick={() => openLoyerDetail(apartment)}
        />
      </div>

      {/* ── 3. Synthesis block ── */}
      {analyse.synthese && (
        <div className="mt-6 rounded-xl bg-ink-100/40 px-5 py-4 text-sm leading-relaxed text-ink-700">
          {renderMarkdownBold(analyse.synthese)}
        </div>
      )}

      {/* ── 4. Accordion blocs par dimension ── */}
      <div className="mt-16">
        <GroupHeader
          title="Analyse par dimension"
          subtitle="Ce qui fait monter ou baisser le score"
          as="h2"
        />
        <div className="space-y-2">
          {blocs.map((bloc, i) => (
            <AccordionBloc
              key={bloc.cle}
              bloc={bloc}
              apartment={apartment}
              settings={settings}
              seuilsRendement={seuilsRendement}
              cashflowSeuils={cashflowSeuils}
              simuKpi={bloc.cle === "simulation" ? simuKpi : undefined}
              defaultOpen={i === 0}
            />
          ))}
        </div>
      </div>

      {!quartier && (
        <p className="mt-6 rounded-xl border border-dashed border-ink-100 bg-white p-4 text-center text-xs text-ink-400">
          Le bloc Quartier n&apos;existe pas encore pour cette analyse — clique sur « Relancer » pour le générer.
        </p>
      )}

    </div>
  );
}

// ── Accordion Bloc (card per dimension, first open by default) ───────────────

const LETTERS = ["A", "B", "C", "D", "E", "F", "G"] as const;
const DPE_COLORS: Record<string, { bg: string; text: string }> = {
  A: { bg: "#2f9e44", text: "#fff" }, B: { bg: "#66a80f", text: "#fff" },
  C: { bg: "#a9c92f", text: "#1f2937" }, D: { bg: "#f2c811", text: "#1f2937" },
  E: { bg: "#f08c00", text: "#fff" }, F: { bg: "#e8590c", text: "#fff" },
  G: { bg: "#e03131", text: "#fff" },
};
const GES_COLORS: Record<string, { bg: string; text: string }> = {
  A: { bg: "#efe6fb", text: "#4c1d95" }, B: { bg: "#d9c2f0", text: "#4c1d95" },
  C: { bg: "#c19ee6", text: "#3b0764" }, D: { bg: "#a97fd9", text: "#fff" },
  E: { bg: "#9256c9", text: "#fff" }, F: { bg: "#7c3aed", text: "#fff" },
  G: { bg: "#6021a8", text: "#fff" },
};

function EnergyScale({ label, value, palette }: { label: string; value: string; palette: Record<string, { bg: string; text: string }> }) {
  const active = (value || "").toUpperCase();
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <div className="flex items-center gap-0.5">
        {LETTERS.map((l) => {
          const c = palette[l];
          const isActive = l === active;
          return (
            <div
              key={l}
              style={{ backgroundColor: c.bg, color: c.text }}
              className={
                isActive
                  ? "z-10 -my-1 flex h-10 w-10 items-center justify-center rounded-lg text-base font-bold shadow-md ring-2 ring-white"
                  : "flex h-7 flex-1 items-center justify-center text-xs font-semibold opacity-70 first:rounded-l last:rounded-r"
              }
            >
              {l}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AccordionBloc({
  bloc,
  apartment,
  settings,
  seuilsRendement,
  cashflowSeuils,
  simuKpi,
  defaultOpen = false,
}: {
  bloc: BlocAnalyse;
  apartment: ApartmentWithComputed;
  settings: AppSettings;
  seuilsRendement: RendementSeuils;
  cashflowSeuils: CashflowSeuils;
  simuKpi?: SimulationResult | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isQuartier = bloc.cle === "quartier";
  const categ = bloc.note != null ? blocCategorie(bloc.note) : null;
  const tone = bloc.note != null ? noteTone(bloc.note) : "neutral";
  const Icon = BLOC_ICON[bloc.cle];
  const colors = BLOC_COLORS[bloc.cle];

  return (
    <section
      id={`bloc-${bloc.cle}`}
      className="scroll-mt-24 overflow-hidden rounded-xl border border-ink-100 bg-white"
    >
      {/* Accordion header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-4 p-5 text-left transition-colors hover:bg-ink-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:ring-inset"
      >
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${colors.bg}`}>
          <Icon className={`size-5 ${colors.text}`} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block ${TITRE_RECOMMANDATION}`}>{bloc.titre}</span>
          <span className="mt-0.5 block text-xs text-ink-400">{BLOC_SUBTITLES[bloc.cle]}</span>
        </span>
        {bloc.note != null && (
          <span className="flex shrink-0 items-baseline gap-0.5">
            <span className={`font-mono text-xl font-bold tabular-nums leading-none ${NOTE_TEXT_CLASS[tone]}`}>
              {formatNote(bloc.note)}
            </span>
            <span className="font-mono text-[11px] font-medium text-ink-400">/10</span>
          </span>
        )}
        {bloc.note == null && (isQuartier || bloc.cle === "simulation") && (
          <span className="shrink-0 text-xs font-medium italic text-ink-400">Informatif</span>
        )}
        <ChevronDown
          className={`size-5 shrink-0 text-ink-400 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {/* Accordion body */}
      {open && (
        <div className="border-t border-ink-100/50 px-5 pb-5 pt-4 space-y-4">
          {categ && (
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${CATEGORIE_TAG_STYLES[categ.tone]}`}>
              {categ.label}
            </span>
          )}

          {bloc.invite && (
            <div className="rounded-lg border border-dashed border-ink-300 bg-ink-50/50 px-4 py-3 text-sm text-ink-500">
              {bloc.invite.text}{" "}
              <Link
                href={bloc.invite.href}
                className="font-medium text-accent-600 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
              >
                {bloc.invite.linkLabel}
              </Link>
            </div>
          )}

          {!bloc.disponible ? (
            <p className="text-sm text-ink-400">{bloc.messageIndisponible}</p>
          ) : (
            <>
              {bloc.narration && (
                <p className={
                  isQuartier
                    ? "text-[15px] leading-relaxed text-ink-700"
                    : "rounded-lg bg-ink-100/40 px-4 py-3 text-sm leading-relaxed text-ink-700"
                }>
                  {renderMarkdownBold(bloc.narration)}
                </p>
              )}
              {isQuartier && !bloc.narration && !bloc.invite && (
                <p className="text-sm text-ink-400">
                  Description indisponible — clique sur « Relancer ».
                </p>
              )}

              {bloc.dpeGes && (
                <div className="grid max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2">
                  <EnergyScale label="DPE (énergie)" value={bloc.dpeGes.dpe} palette={DPE_COLORS} />
                  <EnergyScale label="GES (climat)" value={bloc.dpeGes.ges} palette={GES_COLORS} />
                </div>
              )}

              {bloc.cle === "simulation" && simuKpi ? (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-10">
                  <CashflowWaterfall apartment={apartment} simuKpi={simuKpi} cashflowSeuils={cashflowSeuils} />
                  <SimulationDetails bloc={bloc} simuKpi={simuKpi} />
                </div>
              ) : (
                <>
                  {bloc.highlights && bloc.highlights.length > 0 && (() => {
                    const filtered = bloc.highlights;
                    return filtered.length > 0 && (
                      <div className={`grid gap-3 ${filtered.length === 1 ? "max-w-[50%]" : "grid-cols-2"}`}>
                        {filtered.map((h, i) => (
                          <HighlightStatCard key={i} highlight={h} apartment={apartment} settings={settings} seuilsRendement={seuilsRendement} cashflowSeuils={cashflowSeuils} />
                        ))}
                      </div>
                    );
                  })()}

                  {!isQuartier && (bloc.faits?.length ?? 0) > 0 && (
                    <ul className="divide-y divide-ink-100/50">
                      {bloc.faits.map((f, i) => (
                        <FaitRow key={i} fait={f} />
                      ))}
                    </ul>
                  )}
                </>
              )}

              {!isQuartier && bloc.donneesManquantes && bloc.donneesManquantes.length > 0 && (
                <p className="text-xs text-ink-400">
                  Donnée(s) non disponible(s) : {bloc.donneesManquantes.join(" · ")}.
                </p>
              )}

              {bloc.sources.length > 0 && (
                <p className="text-xs text-ink-400">
                  Sources :{" "}
                  {bloc.sources.map((s, i) => (
                    <span key={s.label}>
                      {i > 0 && " · "}
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noreferrer" className="underline hover:text-ink-600">{s.label}</a>
                      ) : s.label}
                    </span>
                  ))}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function HighlightStatCard({
  highlight,
  apartment,
  settings,
  seuilsRendement,
  cashflowSeuils,
}: {
  highlight: BlocHighlight;
  apartment: ApartmentWithComputed;
  settings: AppSettings;
  seuilsRendement: RendementSeuils;
  cashflowSeuils: CashflowSeuils;
}) {
  const { open: openRendementDetail } = useRendementDetail();
  const { open: openCashflowDetail } = useCashflowDetail();

  const onClick = HIGHLIGHTS_RENDEMENT.has(highlight.label)
    ? () => openRendementDetail(apartment, seuilsRendement)
    : HIGHLIGHTS_CASHFLOW_RE.test(highlight.label)
      ? () => openCashflowDetail(apartment, cashflowSeuils, settings)
      : undefined;

  return (
    <StatCard
      label={highlight.label}
      value={highlight.value}
      tone={highlight.tone}
      onClick={onClick}
    />
  );
}

function FaitRow({ fait }: { fait: Fait }) {
  const style = GRAVITE_STYLES[fait.gravite ?? "info"];
  const hasValue = fait.value != null && fait.value !== "";

  return (
    <li className="flex items-start justify-between gap-3 py-3.5">
      <div className="flex min-w-0 flex-1 gap-2">
        <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink-800">
            {fait.label}
            {fait.perimetre && (
              <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-400">
                {fait.perimetre}
              </span>
            )}
            {fait.estimeParIA && <AiEstimatedBadge />}
          </p>
          {fait.detail && <p className="text-xs leading-snug text-ink-500">{fait.detail}</p>}
        </div>
      </div>
      {hasValue && (
        <div className={`max-w-[45%] shrink-0 text-right text-base font-semibold tabular-nums ${style.value}`}>
          {/* Un `number` rendu tel quel passe par `String(n)` et sort SANS
              séparateur de milliers (« 4706 »). Le groupage se fait donc ici,
              au point de passage unique, plutôt que dans chaque bloc — c'est
              ce qui manquait et qui faisait cohabiter « 1 849 » (bloc qui
              pré-formatait en chaîne) et « 4706 » (bloc qui passait le nombre).
              Les valeurs déjà en chaîne (fourchettes « 1 145 – 1 846 », lettres
              de DPE) traversent intactes. */}
          {typeof fait.value === "number" ? formatNombre(fait.value) : fait.value}
          {fait.unit && <span className="ml-0.5 text-xs font-normal opacity-70">{fait.unit}</span>}
        </div>
      )}
    </li>
  );
}

// ── Cash-flow waterfall (inline in simulation bloc) ────────────────────────

function CashflowWaterfall({
  apartment,
  simuKpi,
  cashflowSeuils,
}: {
  apartment: ApartmentWithComputed;
  simuKpi: SimulationResult;
  cashflowSeuils: CashflowSeuils;
}) {
  const cfLMNP = simuKpi.cashflowMensuelMoyenLMNP;
  const cfTone = TONE_PANEL_STYLES[cashflowTone(cfLMNP, cashflowSeuils)];

  const exoAnnees = simuKpi.annees.filter((a) => a.impot < 1);
  const lmnpAnnees = exoAnnees.length > 0
    ? (exoAnnees[0].annee === 1 ? exoAnnees : [simuKpi.annees[0], ...exoAnnees])
    : [simuKpi.annees[0]];
  const nLmnp = lmnpAnnees.length;
  const avgM = (f: (a: (typeof simuKpi.annees)[number]) => number) =>
    lmnpAnnees.reduce((s, a) => s + f(a), 0) / nLmnp / 12;
  const loyerMoyenM = avgM((a) => a.loyers);
  const chargesMoyennesM = avgM((a) => a.chargesExploitation);
  const impotMoyenM = avgM((a) => a.impot);

  return (
    <div className="flex flex-col rounded-xl border border-ink-100 bg-white p-4">
      <p className="text-xs font-medium text-ink-500">Cash-flow mensuel</p>
      <ul className="mt-3 divide-y divide-ink-100/50 text-sm">
        <CfRow
          label="Loyers encaissés"
          value={loyerMoyenM}
          plus
          badge={isAiEstimated(apartment, "loyer_retenu") && <AiEstimatedBadge />}
        />
        <CfRow label="Mensualité de crédit" value={-simuKpi.mensualiteTotale} />
        <CfRow label="Charges" value={-chargesMoyennesM} />
        <CfRow label="Impôt LMNP (moy.)" value={-impotMoyenM} />
      </ul>
      <div className={`mt-3 flex flex-1 items-center rounded-xl p-4 ${cfTone.wrap}`}>
        <div className="flex w-full items-center justify-between gap-3">
          <div>
            <span className={`text-sm font-semibold ${cfTone.label}`}>Cash-flow mensuel</span>
            <p className={`mt-0.5 text-xs ${cfTone.sub}`}>
              {simuKpi.anneesExonerees > 1
                ? `Moyen sur ${simuKpi.anneesExonerees} ans sans impôt`
                : simuKpi.anneesExonerees === 1
                  ? "Année 1, sans impôt"
                  : "Année 1, après impôt"}
            </p>
          </div>
          <span className={`font-mono text-2xl font-bold tabular-nums ${cfTone.value}`}>
            {formatEurosSigned(cfLMNP)}
          </span>
        </div>
      </div>
    </div>
  );
}

function CfRow({
  label,
  value,
  plus = false,
  badge,
}: {
  label: string;
  value: number;
  plus?: boolean;
  badge?: React.ReactNode;
}) {
  const abs = Math.round(Math.abs(value)) || 0;
  const formatted = abs.toLocaleString("fr-FR");
  return (
    <li className="flex items-center justify-between py-2">
      <span className="flex items-center gap-1.5 text-ink-600">
        <span className="mr-1.5 inline-block w-3 text-center font-semibold text-ink-400">{plus ? "+" : "−"}</span>
        {label}
        {badge}
      </span>
      <span className="font-medium text-ink-800">{formatted} €</span>
    </li>
  );
}

function SimulationDetails({ bloc, simuKpi }: { bloc: BlocAnalyse; simuKpi: SimulationResult }) {
  const faits = (bloc.faits ?? []).filter((f) => f.label !== "Mensualité de crédit");
  const amort = simuKpi.amortissements;
  const totalAmort = amort.bati + amort.travaux + amort.notaire;
  const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");
  const anneesExo = simuKpi.anneesExonerees;
  const impotAn1 = simuKpi.annees[0]?.impot ?? 0;
  const resultatImposableAn1 = simuKpi.annees[0]?.resultatImposable ?? 0;

  return (
    <div className="flex flex-col gap-4 self-start">
      {faits.length > 0 && (
        <ul className="divide-y divide-ink-100/50">
          {faits.map((f, i) => (
            <FaitRow key={i} fait={f} />
          ))}
        </ul>
      )}

      {totalAmort > 0 && (
        <div className="rounded-xl border border-ink-100 bg-ink-50/40 p-4">
          <p className="text-sm font-semibold text-ink-800">
            {impotAn1 === 0
              ? `Pourquoi 0 € d'impôt ?`
              : `Impôt année 1 : ${fmt(impotAn1)} €`}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-600">
            {impotAn1 === 0 ? (
              <>
                En LMNP au réel, tu déduis l&apos;usure du bien (amortissements) de tes revenus locatifs.
                Ici, <strong className="font-semibold text-ink-800">{fmt(totalAmort)} €/an</strong>{" "}d&apos;amortissements absorbent
                tes revenus nets → résultat imposable = 0 € pendant{" "}
                <strong className="font-semibold text-ink-800">{anneesExo} {anneesExo > 1 ? "ans" : "an"}</strong>.
              </>
            ) : (
              <>
                Les amortissements LMNP (<strong className="font-semibold text-ink-800">{fmt(totalAmort)} €/an</strong>)
                réduisent tes revenus imposables à {fmt(resultatImposableAn1)} €/an.
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-500">
            <span>Bâti {fmt(amort.bati)} €</span>
            {amort.travaux > 0 && <span>Travaux {fmt(amort.travaux)} €</span>}
            {amort.notaire > 0 && <span>Notaire {fmt(amort.notaire)} €</span>}
          </div>
        </div>
      )}
    </div>
  );
}
