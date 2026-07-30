"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Info, Loader2, Sparkles } from "lucide-react";
import type { ApartmentWithComputed } from "@/lib/types";
import { isImmeuble } from "@/lib/types";
import type { BlocAnalyse, BlocHighlight, BlocKey, Fait, FaitGravite, Verdict, VerdictNiveau } from "@/lib/analyse/types";
import { RENDEMENT_HOVER_RING, SEUILS_RENDEMENT_DEFAUT, scoreCategorie, rendementNetTone, type RendementSeuils } from "@/lib/analyse/scoring";
import { computeDecision, ecartPrixMarche, type Decision } from "@/lib/analyse/decision";
import { simulate, defaultInputs } from "@/lib/simulation";
import { useRendementDetail } from "@/components/RendementDetailProvider";
import { formatDateTime, formatEuros, formatPercent } from "@/lib/format";
import { AiEstimatedBadge } from "@/components/form/Fields";

const CASHFLOW_ROUGE_SEUIL = -200;

const HIGHLIGHTS_RENDEMENT = new Set(["Rendement brut", "Rendement net"]);

const HIGHLIGHT_TONES: Record<BlocHighlight["tone"], { wrap: string; label: string; value: string }> = {
  neutral: { wrap: "bg-white border border-ink-200", label: "text-ink-500", value: "text-ink-900" },
  positif: { wrap: "bg-white border border-ink-200", label: "text-ink-500", value: "text-emerald-700" },
  attention: { wrap: "bg-white border border-ink-200", label: "text-ink-500", value: "text-amber-700" },
  alerte: { wrap: "bg-white border border-ink-200", label: "text-ink-500", value: "text-red-600" },
};

const VERDICT_STYLES: Record<
  VerdictNiveau,
  { chip: string; text: string; icon: typeof AlertTriangle }
> = {
  alerte: { chip: "bg-red-100 text-red-700", text: "text-red-800", icon: AlertTriangle },
  attention: { chip: "bg-amber-100 text-amber-700", text: "text-amber-800", icon: Info },
  positif: { chip: "bg-emerald-100 text-emerald-700", text: "text-emerald-800", icon: CheckCircle2 },
};

const VERDICT_BG: Record<VerdictNiveau, string> = {
  alerte: "bg-red-50/80",
  attention: "bg-amber-50/80",
  positif: "bg-emerald-50/80",
};

type ScoreTone = "emerald" | "amber" | "red" | "neutral";

const CATEGORIE_TAG_STYLES: Record<ScoreTone, string> = {
  emerald: "bg-emerald-50 text-emerald-700 shadow-[inset_0_0_0_1px_rgba(4,120,87,.12)]",
  amber: "bg-amber-50 text-amber-700 shadow-[inset_0_0_0_1px_rgba(180,83,9,.12)]",
  red: "bg-red-50 text-red-700 shadow-[inset_0_0_0_1px_rgba(185,28,28,.12)]",
  neutral: "bg-ink-100 text-ink-500",
};

function scoreTone(note: number | null): ScoreTone {
  if (note == null) return "neutral";
  if (note >= 8) return "emerald";
  if (note >= 5) return "amber";
  return "red";
}

function noteTone(note: number | null): ScoreTone {
  if (note == null) return "neutral";
  if (note >= 8.5) return "emerald";
  if (note >= 7) return "emerald";
  if (note >= 5) return "amber";
  return "red";
}

const DECISION_STYLES: Record<
  Decision,
  { grad: string; border: string; title: string; caption: string; score: string; stroke: string; trackStroke: string; scoreFill: string }
> = {
  achete: { grad: "bg-gradient-to-r from-white to-emerald-50", border: "border-emerald-200", title: "text-emerald-900", caption: "text-emerald-700", score: "text-emerald-700", stroke: "stroke-emerald-500", trackStroke: "stroke-emerald-100", scoreFill: "fill-emerald-700" },
  negocie: { grad: "bg-gradient-to-r from-white to-amber-50", border: "border-amber-200", title: "text-amber-900", caption: "text-amber-700", score: "text-amber-700", stroke: "stroke-amber-400", trackStroke: "stroke-amber-100", scoreFill: "fill-amber-700" },
  passe: { grad: "bg-gradient-to-r from-white to-red-50", border: "border-red-200", title: "text-red-900", caption: "text-red-700", score: "text-red-600", stroke: "stroke-red-500", trackStroke: "stroke-red-100", scoreFill: "fill-red-600" },
};

const GAUGE_SIZE = 100;
const GAUGE_STROKE = 8;
const GAUGE_RADIUS = (GAUGE_SIZE - GAUGE_STROKE) / 2;
const GAUGE_CENTER = GAUGE_SIZE / 2;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

function VerdictGauge({ score, styles: s }: { score: number | null; styles: typeof DECISION_STYLES[Decision] }) {
  const filled = score == null ? 0 : Math.max(0, Math.min(1, score / 10));
  const offset = GAUGE_CIRCUMFERENCE * (1 - filled);
  return (
    <svg
      className="shrink-0"
      width={GAUGE_SIZE}
      height={GAUGE_SIZE}
      viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}
      role="img"
      aria-label={score == null ? "Analyse non générée" : `Score ${formatNote(score)} sur 10`}
    >
      <circle
        cx={GAUGE_CENTER} cy={GAUGE_CENTER} r={GAUGE_RADIUS}
        fill="none" strokeWidth={GAUGE_STROKE}
        className={s.trackStroke}
      />
      {score != null && (
        <circle
          cx={GAUGE_CENTER} cy={GAUGE_CENTER} r={GAUGE_RADIUS}
          fill="none" strokeWidth={GAUGE_STROKE} strokeLinecap="round"
          strokeDasharray={GAUGE_CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${GAUGE_CENTER} ${GAUGE_CENTER})`}
          className={`${s.stroke} transition-[stroke-dashoffset] duration-700 ease-out`}
        />
      )}
      <text
        x={GAUGE_CENTER} y={GAUGE_CENTER}
        textAnchor="middle" dominantBaseline="central"
        style={{ fontFamily: "var(--font-mono)", fontSize: 30, fontWeight: 700 }}
        className={s.scoreFill}
      >
        {score != null ? formatNote(score) : "—"}
      </text>
    </svg>
  );
}

type MetricTone = "positif" | "attention" | "alerte" | "neutral";

const METRIC_VALUE_CLASS: Record<MetricTone, string> = {
  positif: "text-emerald-700",
  attention: "text-amber-700",
  alerte: "text-red-600",
  neutral: "text-ink-900",
};

const BLOC_ORDRE: BlocKey[] = ["prix", "location", "simulation", "potentiel", "risque"];

const GRAVITE_STYLES: Record<FaitGravite, { dot: string; value: string }> = {
  positif: { dot: "bg-emerald-500", value: "text-emerald-700" },
  info: { dot: "bg-ink-300", value: "text-ink-800" },
  attention: { dot: "bg-amber-500", value: "text-amber-700" },
  alerte: { dot: "bg-red-500", value: "text-red-600" },
};

export function formatNote(note: number): string {
  return Number.isInteger(note) ? String(note) : note.toFixed(1).replace(".", ",");
}

/** Rend un texte en interprétant le gras markdown **…** en <strong>. */
export function renderBold(text: string): ReactNode {
  return text.split(/\*\*(.+?)\*\*/g).map((seg, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-ink-900">
        {seg}
      </strong>
    ) : (
      seg
    )
  );
}

function dpeInfo(dpe: string): { sub: string; tone: MetricTone } {
  switch (dpe.trim().toUpperCase()) {
    case "G": return { sub: "Interdit à la location", tone: "alerte" };
    case "F": return { sub: "Interdit dès 2028", tone: "alerte" };
    case "E": return { sub: "Interdit dès 2034", tone: "attention" };
    case "D": return { sub: "OK, pas d'échéance proche", tone: "neutral" };
    case "A": case "B": case "C": return { sub: "Aucune restriction", tone: "positif" };
    default: return { sub: "Non renseigné", tone: "neutral" };
  }
}

type GoTab = (tab: "ia" | "optimiser" | "donnees" | "financiere" | "simulation", anchor?: string) => void;

export default function AnalyseIA({
  apartment,
  seuilsRendement = SEUILS_RENDEMENT_DEFAUT,
  onAnalysed,
  onRelancer,
  onGoTab,
  quotaNotice = false,
}: {
  apartment: ApartmentWithComputed;
  seuilsRendement?: RendementSeuils;
  onAnalysed: (apt: ApartmentWithComputed) => void;
  onRelancer?: () => void;
  onGoTab?: GoTab;
  quotaNotice?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const analyse = apartment.analyse_ia;
  const immeuble = isImmeuble(apartment.type_bien);

  async function lancerPremiere() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analyse/${apartment.id}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        onAnalysed(data.apartment);
      } else {
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
      <section className="rounded-xl border border-ink-200 bg-gradient-to-r from-white to-accent-50 p-8 text-center sm:p-12">
        <Sparkles className="mx-auto h-8 w-8 text-accent-500" />
        <h2 className="mt-3 font-display text-2xl font-semibold text-ink-900">
          Pas encore de bilan pour {immeuble ? "cet immeuble" : "ce bien"}
        </h2>
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

  const faits = analyse.blocs?.prix?.faits ?? [];
  const faitEcart = faits.find((f) => f.label === "Écart au prix de marché");
  const ecartPct = ecartPrixMarche(analyse.blocs?.prix);
  const faitMediane = faits.find((f) => f.label === "Prix/m² médian comparable");
  const medianeM2 = typeof faitMediane?.value === "number" ? faitMediane.value : null;

  const simu = simulate(apartment, apartment.simulation_inputs ?? defaultInputs());
  const cashflow = simu?.cashflowMensuelAn1 ?? null;
  const netTone = rendementNetTone(apartment.rendement_net, seuilsRendement);
  const dpe = dpeInfo(apartment.dpe);

  const cashflowTone: MetricTone =
    cashflow == null ? "neutral"
      : cashflow >= 0 ? "positif"
        : cashflow < CASHFLOW_ROUGE_SEUIL ? "alerte" : "attention";

  const ecartTone: MetricTone =
    faitEcart?.gravite === "positif" ? "positif"
      : faitEcart?.gravite === "attention" ? "attention"
        : faitEcart?.gravite === "alerte" ? "alerte" : "neutral";

  const ecartDisponible = ecartPct != null;

  // --- Decision --------------------------------------------------------------
  const decision: Decision = score != null ? computeDecision(score, verdicts, ecartPct) : "passe";
  const alerte = verdicts.find((v) => v.niveau === "alerte");
  const attention = verdicts.find((v) => v.niveau === "attention");

  let raison: string;
  if (score == null) {
    raison = "Données insuffisantes pour évaluer cette opportunité.";
  } else if (decision === "passe") {
    raison = alerte
      ? `${alerte.titre}. C'est rédhibitoire : une négociation ne le rattrape pas, mieux vaut chercher un autre bien.`
      : `Score global ${formatNote(score)}/10 : trop de points faibles pour un investissement sain.`;
  } else if (decision === "achete") {
    raison = ecartPct != null && ecartPct <= -5
      ? `Aucun frein détecté, et un prix affiché ${Math.abs(ecartPct)} % sous les ventes comparables : un bon dossier, à sécuriser sans traîner.`
      : "Aucun frein détecté : prix, rendement et risques sont alignés pour investir.";
  } else {
    const surcote = ecartPct != null && ecartPct > 5;
    raison = surcote
      ? `Le prix affiché est ${ecartPct} % au-dessus des ventes comparables du secteur. Négocie-le vers le marché : c'est là qu'est ta marge.`
      : attention
        ? `${attention.titre}. Le bien reste intéressant, mais négocie le prix d'achat pour compenser ce point.`
        : "Bon dossier dans l'ensemble, mais la marge est mince. Une négociation du prix d'achat sécurise l'opération.";
  }

  const titres: Record<Decision, string> = {
    achete: "Achète",
    negocie: "Achète — si tu négocies",
    passe: "Passe ton chemin",
  };

  const styles = DECISION_STYLES[decision];

  // Emphasis for MetricCards on negocie/passe
  const emphasize = decision !== "achete";
  const tagLabel = decision === "passe" ? "Rédhibitoire" : "À négocier";
  const driver = (tone: MetricTone): { tone: "alerte" | "attention"; label: string } | undefined =>
    emphasize && (tone === "alerte" || tone === "attention") ? { tone, label: tagLabel } : undefined;

  // Alertes de l'en-tête (critere only)
  const alertes = (analyse.verdicts ?? [])
    .filter((v) =>
      v.origine ? v.origine === "critere" : !/\(\d+([.,]\d+)?\/10\)\s*$/.test(v.titre)
    )
    .slice(0, 3);

  // Blocs for flat sections
  const blocsNotes = BLOC_ORDRE.map((k) => analyse.blocs[k]).filter((b): b is BlocAnalyse => b != null);
  const quartier = analyse.blocs.quartier;
  const blocs = quartier ? [...blocsNotes, quartier] : blocsNotes;

  const goTab = onGoTab ?? (() => {});

  return (
    <div className="space-y-0">
      {/* ── 1. Verdict Card ── */}
      <section className={`rounded-2xl border p-6 sm:p-8 ${styles.border} ${styles.grad}`}>
        <div className="flex items-start justify-between gap-5 sm:gap-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${CATEGORIE_TAG_STYLES[scoreCategorie(score).tone]}`}>
                {scoreCategorie(score).label}
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
              {titres[decision]}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">{raison}</p>
          </div>
          <VerdictGauge score={score} styles={styles} />
        </div>

        {blocsNotes.length > 0 && (
          <div className="mt-6 flex flex-wrap items-baseline gap-x-8 gap-y-2 pt-1">
            {blocsNotes.map((b) => {
              const t = noteTone(b.note);
              const colorClass = t === "emerald" ? "text-emerald-700" : t === "amber" ? "text-amber-700" : t === "red" ? "text-red-600" : "text-ink-300";
              return (
                <span key={b.cle} className="text-xs text-ink-400">
                  {b.titre}
                  <span className={`ml-1.5 font-mono font-bold tabular-nums ${colorClass}`}>
                    {b.note != null ? formatNote(b.note) : "—"}
                  </span>
                </span>
              );
            })}
          </div>
        )}

        {alertes.length > 0 && (
          <ul className={`mt-6 gap-3 ${alertes.length === 1 ? "flex" : "grid grid-cols-1 sm:grid-cols-2"}`}>
            {alertes.map((v, i) => (
              <VerdictRow key={i} verdict={v} />
            ))}
          </ul>
        )}

        {quotaNotice && (
          <p className="mt-5 flex items-start gap-1.5 text-xs text-amber-600">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Résumés IA temporairement indisponibles (quota gratuit atteint). Les scores et données
            chiffrées sont complets — réessayez dans quelques minutes.
          </p>
        )}
      </section>

      {/* ── 2. MetricCards ── */}
      <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard
          label="Cash-flow mensuel"
          value={cashflow == null ? "—" : `${cashflow >= 0 ? "+" : "−"} ${formatEuros(Math.abs(Math.round(cashflow)))}`}
          sub={cashflow == null ? "Simulation incomplète" : "Net en poche chaque mois"}
          tone={cashflowTone}
          emphasis={driver(cashflowTone)}
          linkLabel="Simulation"
          onClick={() => goTab("simulation", "sim-cashflow")}
        />
        <MetricCard
          label="Rendement net"
          value={apartment.rendement_net == null ? "—" : formatPercent(apartment.rendement_net)}
          sub="Loyers − charges − impôts"
          tone={netTone === "neutral" ? "neutral" : netTone}
          emphasis={driver(netTone === "neutral" ? "neutral" : netTone)}
          linkLabel="Détails"
          onClick={() => goTab("financiere", "fin-resultats")}
        />
        <MetricCard
          label="Prix au m²"
          value={apartment.prix_m2 == null ? "—" : `${formatEuros(apartment.prix_m2)}/m²`}
          sub={ecartDisponible
            ? `${ecartPct! > 0 ? "+" : ""}${ecartPct} % vs médiane locale${medianeM2 != null ? ` (${formatEuros(medianeM2)}/m²)` : ""}`
            : "Pas de comparable DVF"}
          tone={ecartDisponible ? ecartTone : "neutral"}
          emphasis={ecartDisponible ? driver(ecartTone) : undefined}
          linkLabel={ecartDisponible ? "Analyse" : "Détails"}
          onClick={() => ecartDisponible ? goTab("ia", "bloc-prix") : goTab("financiere", "fin-achat")}
        />
        <MetricCard
          label="DPE"
          value={apartment.dpe.trim() === "" ? "—" : apartment.dpe.trim().toUpperCase()}
          sub={dpe.sub}
          tone={dpe.tone}
          emphasis={driver(dpe.tone)}
          linkLabel={apartment.dpe.trim() === "" ? "Compléter" : "Risques"}
          onClick={() => apartment.dpe.trim() === "" ? goTab("donnees") : goTab("ia", "bloc-risque")}
        />
      </div>

      {/* ── 3. Synthesis block (option 3 — after MetricCards) ── */}
      {analyse.synthese && (
        <div className="mt-6 rounded-xl bg-ink-100/40 px-5 py-4 text-sm leading-relaxed text-ink-700">
          {renderBold(analyse.synthese)}
        </div>
      )}

      {/* ── 4. Flat section blocs ── */}
      <div className="mt-16 flex flex-col">
        {blocs.map((bloc, i) => (
          <FlatSection
            key={bloc.cle}
            bloc={bloc}
            apartment={apartment}
            seuilsRendement={seuilsRendement}
            isFirst={i === 0}
            isLast={i === blocs.length - 1}
          />
        ))}
      </div>

      {!quartier && (
        <p className="mt-6 rounded-xl border border-dashed border-ink-200 bg-white p-4 text-center text-xs text-ink-400">
          Le bloc Quartier n&apos;existe pas encore pour cette analyse — clique sur « Relancer » pour le générer.
        </p>
      )}
    </div>
  );
}

function VerdictRow({ verdict }: { verdict: Verdict }) {
  const style = VERDICT_STYLES[verdict.niveau];
  const Icon = style.icon;
  return (
    <li className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 ${VERDICT_BG[verdict.niveau]}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.chip.split(" ").pop()}`} aria-hidden />
      <div className="min-w-0">
        <p className={`text-[13px] font-semibold leading-snug ${style.text}`}>{verdict.titre}</p>
        <p className="mt-0.5 text-xs leading-snug text-ink-600">{verdict.detail}</p>
      </div>
    </li>
  );
}

const EMPHASIS_TAG_CLASS: Record<"alerte" | "attention", string> = {
  alerte: "bg-red-100 text-red-700",
  attention: "bg-amber-100 text-amber-700",
};

function MetricCard({
  label,
  value,
  sub,
  tone,
  emphasis,
  linkLabel,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  tone: MetricTone;
  emphasis?: { tone: "alerte" | "attention"; label: string };
  linkLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-ink-200 bg-white p-4">
      <div className="flex min-h-[1.25rem] items-start justify-between gap-2">
        <p className="text-xs font-medium text-ink-500">{label}</p>
        {emphasis && (
          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${EMPHASIS_TAG_CLASS[emphasis.tone]}`}>
            {emphasis.label}
          </span>
        )}
      </div>
      <p className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${METRIC_VALUE_CLASS[tone]}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-ink-400">{sub}</p>
      <button
        type="button"
        onClick={onClick}
        className="group mt-auto self-end pt-3 text-xs text-ink-400 transition-colors hover:text-accent-600"
      >
        <span className="underline underline-offset-2">{linkLabel}</span>{" "}
        <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
      </button>
    </div>
  );
}

// ── Flat Section (no card borders, divider-separated) ────────────────────────

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

function FlatSection({
  bloc,
  apartment,
  seuilsRendement,
  isFirst,
  isLast,
}: {
  bloc: BlocAnalyse;
  apartment: ApartmentWithComputed;
  seuilsRendement: RendementSeuils;
  isFirst: boolean;
  isLast: boolean;
}) {
  const isQuartier = bloc.cle === "quartier";
  const categ = bloc.note != null ? scoreCategorie(bloc.note) : null;
  const tone = bloc.note != null ? noteTone(bloc.note) : "neutral";

  return (
    <section
      id={`bloc-${bloc.cle}`}
      className={`scroll-mt-24 ${isFirst ? "pt-0" : "pt-14"} ${isLast ? "pb-0" : "border-b border-ink-100 pb-14"}`}
    >
      {/* Header: title + tag | score */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <h3 className="font-display text-xl font-semibold text-ink-900">{bloc.titre}</h3>
          {categ && (
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${CATEGORIE_TAG_STYLES[categ.tone]}`}>
              {categ.label}
            </span>
          )}
          {!categ && isQuartier && (
            <span className="text-sm font-medium italic text-ink-400">Informatif</span>
          )}
        </div>
        {bloc.note != null && (
          <div className="flex items-baseline gap-0.5">
            <span className={`font-mono text-[28px] font-bold tabular-nums leading-none ${tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : tone === "red" ? "text-red-600" : "text-ink-400"}`}>
              {formatNote(bloc.note)}
            </span>
            <span className="font-mono text-[13px] font-medium text-ink-400">/10</span>
          </div>
        )}
      </div>

      {!bloc.disponible ? (
        <p className="mt-3 text-sm text-ink-400">{bloc.messageIndisponible}</p>
      ) : (
        <div className="mt-3 space-y-4">
          {/* Narration */}
          {bloc.narration && (
            <p className={
              isQuartier
                ? "text-[15px] leading-relaxed text-ink-700"
                : "rounded-lg bg-ink-100/40 px-4 py-3 text-sm leading-relaxed text-ink-700"
            }>
              {renderBold(bloc.narration)}
            </p>
          )}
          {isQuartier && !bloc.narration && (
            <p className="text-sm text-ink-400">
              Description indisponible — clique sur « Relancer ».
            </p>
          )}

          {/* DPE/GES scales */}
          {bloc.dpeGes && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <EnergyScale label="DPE (énergie)" value={bloc.dpeGes.dpe} palette={DPE_COLORS} />
              <EnergyScale label="GES (climat)" value={bloc.dpeGes.ges} palette={GES_COLORS} />
            </div>
          )}

          {/* Highlights as neutral metric-style cards */}
          {bloc.highlights && bloc.highlights.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {bloc.highlights.map((h, i) => (
                <HighlightCard key={i} highlight={h} apartment={apartment} seuilsRendement={seuilsRendement} />
              ))}
            </div>
          )}

          {/* Facts */}
          {!isQuartier && bloc.faits.length > 0 && (
            <ul className="divide-y divide-ink-100">
              {bloc.faits.map((f, i) => (
                <FaitRow key={i} fait={f} />
              ))}
            </ul>
          )}

          {/* Invite */}
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

          {/* Missing data */}
          {!isQuartier && bloc.donneesManquantes && bloc.donneesManquantes.length > 0 && (
            <p className="text-xs text-ink-400">
              Donnée(s) non disponible(s) : {bloc.donneesManquantes.join(" · ")}.
            </p>
          )}

          {/* Sources */}
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
        </div>
      )}
    </section>
  );
}

function HighlightCard({
  highlight,
  apartment,
  seuilsRendement,
}: {
  highlight: BlocHighlight;
  apartment: ApartmentWithComputed;
  seuilsRendement: RendementSeuils;
}) {
  const { open: openRendementDetail } = useRendementDetail();
  const t = HIGHLIGHT_TONES[highlight.tone];
  const content = (
    <>
      <p className={`text-xs font-medium ${t.label}`}>{highlight.label}</p>
      <p className={`mt-1.5 font-mono text-[22px] font-bold tabular-nums ${t.value}`}>{highlight.value}</p>
    </>
  );

  const isClickable = HIGHLIGHTS_RENDEMENT.has(highlight.label);

  if (!isClickable) {
    return <div className={`rounded-xl p-4 ${t.wrap}`}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => openRendementDetail(apartment, seuilsRendement)}
      title="Voir le détail du calcul"
      className={`rounded-xl p-4 text-left transition hover:border-accent-400 hover:shadow-[0_0_0_3px_var(--accent-50)] ${t.wrap}`}
    >
      {content}
    </button>
  );
}

function FaitRow({ fait }: { fait: Fait }) {
  const style = GRAVITE_STYLES[fait.gravite ?? "info"];
  const hasValue = fait.value != null && fait.value !== "";

  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
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
        <div className={`max-w-[45%] shrink-0 text-right font-mono text-base font-semibold tabular-nums ${style.value}`}>
          {fait.value}
          {fait.unit && <span className="ml-0.5 text-xs font-normal opacity-70">{fait.unit}</span>}
        </div>
      )}
    </li>
  );
}
