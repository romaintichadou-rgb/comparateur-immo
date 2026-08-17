"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Check,
  ChevronDown,
  Hammer,
  KeyRound,
  Landmark,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { GroupHeader, GroupTitle, SectionTitle, TITRE_SECTION } from "@/components/SectionHeader";
import type { ApartmentWithComputed } from "@/lib/types";
import type { AppSettings } from "@/lib/settings";
import { isImmeuble } from "@/lib/types";
import { computeDerived } from "@/lib/calculations";
import type { Argument, Recommandation, RecommandationLevier } from "@/lib/analyse/types";
import {
  cashflowTone,
  rendementNetTone,
  type CashflowSeuils,
  type RendementSeuils,
} from "@/lib/analyse/scoring";
import { decisionFromAnalyse } from "@/lib/analyse/decision";
import { useRendementDetail } from "@/components/RendementDetailProvider";
import { useCashflowDetail } from "@/components/CashflowDetailProvider";
import { formatEuros, formatEurosSigned, formatPercent } from "@/lib/format";

const LEVIER_ICON: Record<RecommandationLevier, typeof Banknote> = {
  prix: Banknote,
  travaux: Hammer,
  loyer: KeyRound,
  financement: Landmark,
};

const LEVIER_COLORS: Record<RecommandationLevier, { bg: string; text: string; border: string; badge: string }> = {
  prix: { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-l-emerald-400", badge: "bg-emerald-50 text-emerald-700" },
  travaux: { bg: "bg-amber-50", text: "text-amber-600", border: "border-l-amber-400", badge: "bg-amber-50 text-amber-700" },
  loyer: { bg: "bg-sky-50", text: "text-sky-600", border: "border-l-sky-400", badge: "bg-sky-50 text-sky-700" },
  financement: { bg: "bg-violet-50", text: "text-violet-600", border: "border-l-violet-400", badge: "bg-violet-50 text-violet-700" },
};

const fmtCashflow = formatEurosSigned;
const fmtRendement = (n: number | null): string => (n == null ? "—" : formatPercent(n));
const fmtEuros = (n: number): string => formatEuros(Math.round(n));
const fmtPrixM2 = (n: number): string => `${formatEuros(Math.round(n))}/m²`;

type Pivot = {
  label: string;
  avant?: string;
  delta?: string;
};

function buildPivot(reco: Recommandation): Pivot | null {
  if (reco.levier === "prix" && reco.prixAchatAvant != null) {
    return {
      label: "Prix affiché",
      avant: fmtEuros(reco.prixAchatAvant),
      delta: reco.baissePct != null ? `−${reco.baissePct} %` : undefined,
    };
  }
  if (reco.levier === "loyer" && reco.loyerAvant != null && reco.loyerApres != null) {
    const pct = Math.round((reco.loyerApres / reco.loyerAvant - 1) * 100);
    return { label: "Loyer actuel", avant: fmtEuros(reco.loyerAvant), delta: `+${pct} %` };
  }
  if (reco.montantEngage != null) return null;
  return null;
}

type PairKind = "prixm2" | "loyer" | "rendement" | "cashflow";
type Pair = {
  kind: PairKind;
  label: string;
  avant: string;
  apres: string;
  tone: "positif" | "attention" | "alerte" | "neutral";
};

function buildPairs(
  reco: Recommandation,
  seuilsRendement: RendementSeuils,
  cashflowSeuils: CashflowSeuils
): Pair[] {
  const pairs: Pair[] = [];
  if (reco.prixM2Avant != null && reco.prixM2Apres != null) {
    pairs.push({
      kind: "prixm2",
      label: "Prix au m²",
      avant: fmtPrixM2(reco.prixM2Avant),
      apres: fmtPrixM2(reco.prixM2Apres),
      tone: "positif",
    });
  }
  if (reco.levier !== "loyer" && reco.loyerAvant != null && reco.loyerApres != null) {
    pairs.push({
      kind: "loyer",
      label: "Loyer /mois",
      avant: fmtEuros(reco.loyerAvant),
      apres: fmtEuros(reco.loyerApres),
      tone: "positif",
    });
  }
  pairs.push({
    kind: "rendement",
    label: "Rendement net",
    avant: fmtRendement(reco.rendementAvant),
    apres: fmtRendement(reco.rendementApres),
    tone: rendementNetTone(reco.rendementApres, seuilsRendement),
  });
  pairs.push({
    kind: "cashflow",
    label: "Cash-flow /mois",
    avant: fmtCashflow(reco.cashflowAvant),
    apres: fmtCashflow(reco.cashflowApres),
    tone: cashflowTone(reco.cashflowApres, cashflowSeuils),
  });
  return pairs;
}

function impactBadge(reco: Recommandation): { label: string; tone: "up" | "down" | "neutral" } {
  const dR = (reco.rendementApres ?? 0) - (reco.rendementAvant ?? 0);
  if (Math.abs(dR) >= 0.001) {
    const sign = dR > 0 ? "+" : "";
    return { label: `${sign}${formatPercent(dR)} rdt`, tone: dR > 0 ? "up" : "down" };
  }
  const dCF = (reco.cashflowApres ?? 0) - (reco.cashflowAvant ?? 0);
  if (Math.abs(dCF) >= 1) {
    return { label: `${formatEurosSigned(dCF)}/mois`, tone: dCF > 0 ? "up" : "down" };
  }
  return { label: "Info", tone: "neutral" };
}

export default function OptimiserView({
  apartment: apt,
  settings,
  seuilsRendement,
  cashflowSeuils,
  onRelancer,
}: {
  apartment: ApartmentWithComputed;
  settings: AppSettings;
  seuilsRendement: RendementSeuils;
  cashflowSeuils: CashflowSeuils;
  onRelancer: () => void;
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const { open: openRendementDetail } = useRendementDetail();
  const { open: openCashflowDetail } = useCashflowDetail();
  const analyse = apt.analyse_ia;
  const immeuble = isImmeuble(apt.type_bien);

  // --- Degraded states -------------------------------------------------------
  if (!analyse || analyse.score_global == null) {
    return (
      <DegradedCard
        titre={`Pas encore d'analyse pour ${immeuble ? "cet immeuble" : "ce bien"}`}
        texte="Les pistes d'optimisation s'appuient sur l'Analyse IA et le verdict d'achat."
        cta={apt.prix == null ? null : { label: "Lancer l'analyse", onClick: onRelancer }}
      />
    );
  }
  if (analyse.recommandations == null) {
    return (
      <DegradedCard
        titre="Pistes d'optimisation indisponibles"
        texte="Cette analyse a été générée avant l'ajout des recommandations. Relance-la pour les obtenir."
        cta={{ label: "Relancer l'analyse", onClick: onRelancer }}
      />
    );
  }

  const recos = analyse.recommandations;
  const dejaAchat = decisionFromAnalyse(analyse).decision === "achete";

  if (recos.length === 0) {
    return (
      <DegradedCard
        titre={dejaAchat ? "Rien de plus à optimiser" : "Pistes indisponibles"}
        texte={
          dejaAchat
            ? "Aucun levier modélisable n'améliorerait nettement la rentabilité — le bien est déjà bien optimisé."
            : "Renseigne le prix et la surface du bien pour obtenir des pistes chiffrées."
        }
        cta={null}
        tone={dejaAchat ? "positif" : "neutre"}
      />
    );
  }

  return (
    <div className="space-y-4">
      {recos.map((reco, i) => (
        <LevierCard
          key={reco.levier + i}
          reco={reco}
          apt={apt}
          settings={settings}
          seuilsRendement={seuilsRendement}
          cashflowSeuils={cashflowSeuils}
          expanded={expandedIndex === i}
          onToggle={() => setExpandedIndex(expandedIndex === i ? null : i)}
          onOpenRendement={openRendementDetail}
          onOpenCashflow={openCashflowDetail}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LevierCard — compact summary + expandable detail
// ---------------------------------------------------------------------------

function LevierCard({
  reco,
  apt,
  settings,
  seuilsRendement,
  cashflowSeuils,
  expanded,
  onToggle,
  onOpenRendement,
  onOpenCashflow,
}: {
  reco: Recommandation;
  apt: ApartmentWithComputed;
  settings: AppSettings;
  seuilsRendement: RendementSeuils;
  cashflowSeuils: CashflowSeuils;
  expanded: boolean;
  onToggle: () => void;
  onOpenRendement: (apt: ApartmentWithComputed, seuils: RendementSeuils) => void;
  onOpenCashflow: (apt: ApartmentWithComputed, seuils: CashflowSeuils, settings: AppSettings) => void;
}) {
  const Icon = LEVIER_ICON[reco.levier];
  const colors = LEVIER_COLORS[reco.levier];
  const badge = impactBadge(reco);

  const badgeStyle =
    badge.tone === "up"
      ? "bg-emerald-50 text-emerald-700"
      : badge.tone === "down"
        ? "bg-red-50 text-red-700"
        : "bg-ink-50 text-ink-500";

  // Un seul jeu de pastilles, rendu à deux emplacements selon la largeur.
  const badges = (
    <>
      {reco.flipVersAchat && (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
          Achète
        </span>
      )}
      <span className={`rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${badgeStyle}`}>
        {badge.label}
      </span>
    </>
  );

  return (
    <div
      className={`overflow-hidden rounded-xl border border-l-4 transition-shadow ${colors.border} ${
        expanded ? "border-ink-200 shadow-sm" : "border-ink-100"
      } bg-white`}
    >
      {/* Summary row — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 p-5 text-left transition-colors hover:bg-ink-50/50 sm:items-center sm:gap-4"
      >
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colors.bg}`}
        >
          <Icon className={`h-5 w-5 ${colors.text}`} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          {/* `TITRE_SECTION` sur un `<p>` et non un heading : le contenu d'un
              `<button>` est du phrasing content, un `<h*>` y serait invalide —
              c'est exactement le cas pour lequel la constante est exportée. */}
          <p className={TITRE_SECTION}>{reco.titre ?? reco.action}</p>
          <p className="mt-1 line-clamp-2 text-sm text-ink-500 sm:line-clamp-1">{reco.pourquoi}</p>
          {/* Sur mobile les pastilles passent SOUS le titre : à 375 px, trois
              éléments `shrink-0` sur la même ligne ne laissaient qu'une
              soixantaine de pixels au titre, qui se cassait sur quatre lignes
              (AGENTS.md, « les quatre pièges du mobile », n°4). */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:hidden">{badges}</div>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">{badges}</div>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-ink-300 transition-transform duration-200 sm:mt-0 ${
            expanded ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      {/* Expanded detail */}
      {expanded && (
        <LevierDetail
          reco={reco}
          apt={apt}
          settings={settings}
          seuilsRendement={seuilsRendement}
          cashflowSeuils={cashflowSeuils}
          onOpenRendement={onOpenRendement}
          onOpenCashflow={onOpenCashflow}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LevierDetail — expanded content (pairs, arguments, caveat)
// ---------------------------------------------------------------------------

function LevierDetail({
  reco,
  apt,
  settings,
  seuilsRendement,
  cashflowSeuils,
  onOpenRendement,
  onOpenCashflow,
}: {
  reco: Recommandation;
  apt: ApartmentWithComputed;
  settings: AppSettings;
  seuilsRendement: RendementSeuils;
  cashflowSeuils: CashflowSeuils;
  onOpenRendement: (apt: ApartmentWithComputed, seuils: RendementSeuils) => void;
  onOpenCashflow: (apt: ApartmentWithComputed, seuils: CashflowSeuils, settings: AppSettings) => void;
}) {
  const pivot = buildPivot(reco);
  const pairs = buildPairs(reco, seuilsRendement, cashflowSeuils);
  const args = reco.arguments ?? [];
  const preuves = args.filter((a) => a.source);
  const methode = args.filter((a) => !a.source);

  const modApt = reco.patch ? computeDerived({ ...apt, ...reco.patch }) : apt;
  const onClickFor = (kind: PairKind): (() => void) | undefined => {
    if (kind === "rendement") return () => onOpenRendement(modApt, seuilsRendement);
    if (kind === "cashflow") return () => onOpenCashflow(modApt, cashflowSeuils, settings);
    return undefined;
  };

  return (
    <div className="border-t border-ink-100">
      {/* Action + pivot + impact cards */}
      <div className="bg-accent-50/50 p-5 sm:p-6">
        {/* Niveau GROUPE (`text-base`) et non section : le titre de la carte
            est déjà en `text-lg`, l'action est ce qu'il contient. En `text-lg`
            ici, l'enfant pesait plus lourd que son parent. */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <GroupTitle>{reco.action}</GroupTitle>
          {pivot?.delta && (
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-emerald-700">
              {pivot.delta}
            </span>
          )}
        </div>

        <div className="mt-1.5 space-y-1">
          {pivot?.avant && (
            <p className="whitespace-nowrap text-sm text-ink-500">
              {pivot.label} :{" "}
              <span className="tabular-nums text-ink-700">{pivot.avant}</span>
            </p>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pairs.map((p) => (
            <StatCard
              key={p.kind}
              label={p.label}
              avant={p.avant}
              value={p.apres}
              tone={p.tone}
              onClick={onClickFor(p.kind)}
            />
          ))}
        </div>
      </div>

      {/* Caveat */}
      {reco.caveat && (
        <div
          className={`flex gap-2.5 border-y px-5 py-4 sm:px-6 ${
            reco.caveatBloquant
              ? "border-red-100 bg-red-50 text-red-700"
              : "border-amber-100 bg-amber-50 text-amber-800"
          }`}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="text-sm leading-relaxed">{reco.caveat}</p>
        </div>
      )}

      {/* Arguments */}
      {(preuves.length > 0 || methode.length > 0) && (
        <div className="space-y-8 p-5 sm:p-6">
          {preuves.length > 0 && (
            <section>
              <GroupHeader
                as="h4"
                title="Les faits"
                count={preuves.length}
                subtitle="Ce sur quoi le levier s'appuie, chiffres à l'appui."
              />
              <ul className="space-y-3">
                {preuves.map((a, i) => (
                  <PreuveItem key={i} arg={a} />
                ))}
              </ul>
            </section>
          )}
          {methode.length > 0 && (
            <section>
              <GroupHeader
                as="h4"
                title="La méthode"
                count={methode.length}
                subtitle="Comment l'appliquer concrètement."
              />
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {methode.map((a, i) => (
                  <li key={i} className="flex gap-3 rounded-xl bg-ink-50 px-4 py-3.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-900">{a.titre}</p>
                      <p className="mt-1 text-xs leading-relaxed text-ink-600">{a.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared small components
// ---------------------------------------------------------------------------

function PreuveItem({ arg }: { arg: Argument }) {
  return (
    <li className="rounded-xl border border-ink-100 bg-white p-4">
      <div className="flex items-start gap-4">
        {arg.chiffre && (
          <div className="flex shrink-0 flex-col items-center justify-center rounded-lg bg-ink-50 px-3.5 py-2.5">
            <span className="whitespace-nowrap font-mono text-lg font-semibold leading-none tabular-nums text-ink-900">
              {arg.chiffre}
            </span>
            {arg.chiffreLabel && (
              <span className="mt-1.5 whitespace-nowrap text-[10px] font-medium leading-tight text-ink-400">
                {arg.chiffreLabel}
              </span>
            )}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-900">{arg.titre}</p>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-ink-600">{arg.detail}</p>
        </div>
      </div>
    </li>
  );
}

/**
 * Carte d'état dégradé ou terminal de la sous-pill : pas d'analyse, pas de
 * recos, ou rien de plus à optimiser.
 *
 * ⚠️ Titre en `SectionTitle` (`text-lg`, `h3`) et non en `text-2xl` : la carte
 * vit SOUS le `TabHeader` « Optimiser » (`text-xl`, `h2`). Un `text-2xl` y
 * faisait un enfant plus gros que son parent, et un second `h2` là où la
 * hiérarchie attend un `h3`.
 */
function DegradedCard({
  titre,
  texte,
  cta,
  tone = "neutre",
}: {
  titre: string;
  texte: string;
  cta: { label: string; onClick: () => void } | null;
  /** `positif` : état terminal souhaitable (rien à optimiser) — dégradé vert. */
  tone?: "neutre" | "positif";
}) {
  return (
    <section
      className={`rounded-xl border p-8 text-center sm:p-12 ${
        tone === "positif"
          ? "border-emerald-200 bg-gradient-to-r from-white to-emerald-50"
          : "border-ink-100 bg-gradient-to-r from-white to-accent-50"
      }`}
    >
      <SectionTitle as="h3">{titre}</SectionTitle>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">{texte}</p>
      {cta && (
        <button
          type="button"
          onClick={cta.onClick}
          className="mt-6 rounded-lg bg-accent-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-700"
        >
          {cta.label}
        </button>
      )}
    </section>
  );
}
