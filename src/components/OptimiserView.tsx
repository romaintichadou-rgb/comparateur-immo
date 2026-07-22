"use client";

import { useState } from "react";
import { Banknote, Hammer, KeyRound, Landmark, ArrowRight, ChevronDown, Quote } from "lucide-react";
import type { ApartmentWithComputed } from "@/lib/types";
import { isImmeuble } from "@/lib/types";
import { computeDerived } from "@/lib/calculations";
import type { Argument, Decision, Recommandation, RecommandationLevier } from "@/lib/analyse/types";
import {
  cashflowTone,
  rendementNetTone,
  type CashflowSeuils,
  type RendementSeuils,
  type RendementTone,
} from "@/lib/analyse/scoring";
import { decisionFromAnalyse } from "@/lib/analyse/decision";
import { useRendementDetail } from "@/components/RendementDetailProvider";
import { useCashflowDetail } from "@/components/CashflowDetailProvider";
import { formatPercent } from "@/lib/format";

// Couleur de texte par tonalité (profil investisseur) — même lecture partout.
const TONE_TEXT: Record<RendementTone, string> = {
  neutral: "text-ink-900",
  positif: "text-emerald-700",
  attention: "text-amber-700",
  alerte: "text-red-600",
};

/**
 * Onglet "Optimiser" — PRESCRIPTIF, orienté DÉCISION + RENTABILITÉ (pas le
 * score). Deux modes selon le verdict actuel :
 *  - verdict ≠ "Achète" → les actions pour EN FAIRE UN ACHAT (le levier prix
 *    dit le prix exact à négocier pour basculer à "Achète").
 *  - verdict = "Achète" → comment ACHETER MIEUX / augmenter la rentabilité.
 * Purement informatif : ne modifie RIEN sur le bien (voir recommandations.ts).
 */

const LEVIER_ICON: Record<RecommandationLevier, typeof Banknote> = {
  prix: Banknote,
  travaux: Hammer,
  loyer: KeyRound,
  financement: Landmark,
};

// Libellé du déclencheur d'arguments (accordéon discret), par levier.
const LEVIER_ARG_LABEL: Record<RecommandationLevier, string> = {
  prix: "Arguments pour négocier",
  travaux: "Par où commencer",
  loyer: "Comment louer plus cher",
  financement: "Optimiser le financement",
};

const fmtCashflow = (n: number | null): string =>
  n == null ? "—" : `${n >= 0 ? "+" : "−"} ${Math.round(Math.abs(n)).toLocaleString("fr-FR")} €`;

const fmtRendement = (n: number | null): string => (n == null ? "—" : formatPercent(n));
const fmtEuros = (n: number): string => `${Math.round(n).toLocaleString("fr-FR")} €`;
const fmtPrixM2 = (n: number): string => `${Math.round(n).toLocaleString("fr-FR")} €/m²`;

type PairKind = "prix" | "prixm2" | "loyer" | "rendement" | "cashflow";
type Pair = {
  kind: PairKind;
  label: string;
  avant: string;
  apres: string;
  avantClass: string;
  apresClass: string;
};

// Construit les métriques "avant → après" propres à chaque levier. Rendement et
// cash-flow sont colorés selon les seuils du profil investisseur (avant ET
// après) ; prix/loyer restent directionnels (baisse/hausse = vert).
function buildPairs(
  reco: Recommandation,
  seuilsRendement: RendementSeuils,
  cashflowSeuils: CashflowSeuils
): Pair[] {
  const pairs: Pair[] = [];
  if (reco.prixAchatAvant != null && reco.prixAchatApres != null) {
    pairs.push({
      kind: "prix",
      label: "Prix d'achat",
      avant: fmtEuros(reco.prixAchatAvant),
      apres: fmtEuros(reco.prixAchatApres),
      avantClass: "text-ink-400",
      apresClass: "text-emerald-700",
    });
  }
  if (reco.prixM2Avant != null && reco.prixM2Apres != null) {
    pairs.push({
      kind: "prixm2",
      label: "Prix au m²",
      avant: fmtPrixM2(reco.prixM2Avant),
      apres: fmtPrixM2(reco.prixM2Apres),
      avantClass: "text-ink-400",
      apresClass: "text-emerald-700",
    });
  }
  if (reco.loyerAvant != null && reco.loyerApres != null) {
    pairs.push({
      kind: "loyer",
      label: "Loyer /mois",
      avant: fmtEuros(reco.loyerAvant),
      apres: fmtEuros(reco.loyerApres),
      avantClass: "text-ink-400",
      apresClass: "text-emerald-700",
    });
  }
  pairs.push({
    kind: "rendement",
    label: "Rendement net",
    avant: fmtRendement(reco.rendementAvant),
    apres: fmtRendement(reco.rendementApres),
    // L'ancienne valeur reste TOUJOURS grise (référence neutre) ; seule la
    // nouvelle valeur proposée porte la couleur du profil investisseur.
    avantClass: "text-ink-400",
    apresClass: TONE_TEXT[rendementNetTone(reco.rendementApres, seuilsRendement)],
  });
  pairs.push({
    kind: "cashflow",
    label: "Cash-flow /mois",
    avant: fmtCashflow(reco.cashflowAvant),
    apres: fmtCashflow(reco.cashflowApres),
    avantClass: "text-ink-400",
    apresClass: TONE_TEXT[cashflowTone(reco.cashflowApres, cashflowSeuils)],
  });
  return pairs;
}

export default function OptimiserView({
  apartment: apt,
  seuilsRendement,
  cashflowSeuils,
  onRelancer,
}: {
  apartment: ApartmentWithComputed;
  seuilsRendement: RendementSeuils;
  cashflowSeuils: CashflowSeuils;
  onRelancer: () => void;
}) {
  const { open: openRendementDetail } = useRendementDetail();
  const { open: openCashflowDetail } = useCashflowDetail();
  const analyse = apt.analyse_ia;
  const immeuble = isImmeuble(apt.type_bien);

  // --- États dégradés -----------------------------------------------------
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
  const { decision } = decisionFromAnalyse(analyse);
  const dejaAchat = decision === "achete";

  const flipPossible = recos.some((r) => r.flipVersAchat);
  const titre = dejaAchat ? "Acheter mieux" : "En faire un achat";
  const sousTitre = dejaAchat
    ? "Le bien est déjà un « Achète ». Voici comment gagner en rentabilité — simulations indicatives, rien n'est modifié."
    : flipPossible
      ? "Voici comment faire passer ce bien en « Achète » — simulations indicatives, rien n'est modifié."
      : "Aucun levier seul ne suffit à passer en « Achète » ; voici ceux qui s'en approchent le plus — simulations indicatives, rien n'est modifié.";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="font-display text-2xl font-semibold text-ink-900">{titre}</h2>
            <VerdictChip decision={decision} />
          </div>
          <p className="mt-1.5 max-w-2xl text-sm text-ink-500">{sousTitre}</p>
        </div>
      </div>

      {recos.length === 0 ? (
        <div
          className={`rounded-xl border p-8 text-center ${
            dejaAchat
              ? "border-emerald-200 bg-gradient-to-r from-white to-emerald-50"
              : "border-ink-200 bg-white"
          }`}
        >
          <p className="font-display text-lg font-semibold text-ink-900">
            {dejaAchat ? "Rien de plus à optimiser" : "Pistes indisponibles"}
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-600">
            {dejaAchat
              ? "Aucun levier modélisable n'améliorerait nettement la rentabilité — le bien est déjà bien optimisé."
              : "Renseigne le prix et la surface du bien pour obtenir des pistes chiffrées."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {recos.map((reco, i) => (
            <RecoCard
              key={reco.levier + i}
              reco={reco}
              hero={reco.levier === "prix"}
              apt={apt}
              seuilsRendement={seuilsRendement}
              cashflowSeuils={cashflowSeuils}
              onOpenRendement={openRendementDetail}
              onOpenCashflow={openCashflowDetail}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RecoCard({
  reco,
  hero,
  apt,
  seuilsRendement,
  cashflowSeuils,
  onOpenRendement,
  onOpenCashflow,
}: {
  reco: Recommandation;
  hero: boolean;
  apt: ApartmentWithComputed;
  seuilsRendement: RendementSeuils;
  cashflowSeuils: CashflowSeuils;
  onOpenRendement: (apt: ApartmentWithComputed, seuils: RendementSeuils) => void;
  onOpenCashflow: (apt: ApartmentWithComputed, seuils: CashflowSeuils) => void;
}) {
  const Icon = LEVIER_ICON[reco.levier];
  const pairs = buildPairs(reco, seuilsRendement, cashflowSeuils);
  // Le héros (prix) porte jusqu'à 4 métriques → une seule rangée sur desktop.
  const gridCols = hero ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2";

  // Bien modifié (COPIE) reconstruit depuis le patch du scénario, pour ouvrir
  // les popups de détail avec les nouvelles valeurs. Jamais persisté.
  const modApt = reco.patch ? computeDerived({ ...apt, ...reco.patch }) : apt;
  const onClickFor = (kind: PairKind): (() => void) | undefined => {
    if (kind === "rendement") return () => onOpenRendement(modApt, seuilsRendement);
    if (kind === "cashflow") return () => onOpenCashflow(modApt, cashflowSeuils);
    return undefined;
  };

  return (
    <section
      className={`flex flex-col rounded-xl border p-5 ${
        hero
          ? "border-accent-200 bg-gradient-to-r from-white to-accent-50 lg:col-span-2"
          : "border-ink-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-800">
          <span className="inline-flex rounded-lg bg-accent-50 p-1.5 text-accent-500">
            <Icon className="h-4 w-4" />
          </span>
          {reco.titre}
        </h3>
        {reco.flipVersAchat && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
            <ArrowRight className="h-3 w-3" />
            Achète
          </span>
        )}
      </div>

      <p className="mt-3 text-base font-semibold text-ink-900">{reco.action}</p>

      {/* Le cœur : les métriques concrètes, avant → après. Rendement et
          cash-flow sont cliquables → popup avec le détail du calcul recalculé. */}
      <div className={`mt-3 grid gap-3 ${gridCols}`}>
        {pairs.map((p) => (
          <MetricPair
            key={p.label}
            label={p.label}
            avant={p.avant}
            apres={p.apres}
            avantClass={p.avantClass}
            apresClass={p.apresClass}
            onClick={onClickFor(p.kind)}
          />
        ))}
      </div>

      <p className="mt-3 border-t border-ink-100 pt-3 text-xs leading-relaxed text-ink-600">
        {reco.pourquoi}
      </p>

      {(reco.cout || reco.caveat) && (
        <div className="mt-2 space-y-1">
          {reco.cout && <p className="text-xs font-medium text-ink-500">{reco.cout}</p>}
          {reco.caveat && <p className="text-xs text-ink-400">{reco.caveat}</p>}
        </div>
      )}

      {reco.arguments && reco.arguments.length > 0 && (
        <ArgumentsAccordion label={LEVIER_ARG_LABEL[reco.levier]} args={reco.arguments} />
      )}
    </section>
  );
}

// Accordéon discret : replié par défaut, révèle les arguments concrets + verbatim.
function ArgumentsAccordion({ label, args }: { label: string; args: Argument[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border-t border-ink-100 pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex w-full items-center gap-1.5 text-xs font-medium text-ink-500 transition-colors hover:text-accent-600"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-ink-400 transition-transform group-hover:text-accent-500 ${open ? "rotate-180" : ""}`}
        />
        {label}
        <span className="rounded-full bg-ink-100 px-1.5 text-[10px] font-semibold text-ink-400">{args.length}</span>
      </button>

      {open && (
        <ul className="mt-3 space-y-3">
          {args.map((arg, i) => (
            <li key={i}>
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink-800">
                {arg.titre}
                {arg.source && (
                  <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-400">
                    {arg.source}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-600">{arg.detail}</p>
              {arg.verbatim && (
                <p className="mt-1.5 flex gap-1.5 rounded-lg border-l-2 border-accent-300 bg-accent-50/50 py-1.5 pl-2.5 pr-3 text-xs italic leading-relaxed text-ink-600">
                  <Quote className="mt-0.5 h-3 w-3 shrink-0 -scale-x-100 text-accent-400" />
                  <span>{arg.verbatim}</span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MetricPair({
  label,
  avant,
  apres,
  avantClass,
  apresClass,
  onClick,
}: {
  label: string;
  avant: string;
  apres: string;
  avantClass: string;
  apresClass: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-ink-400">
        {label}
        {onClick && <span aria-hidden className="text-ink-300">·</span>}
        {onClick && <span className="text-[10px] normal-case tracking-normal text-accent-500">détail</span>}
      </p>
      <div className="mt-0.5 flex items-center gap-1.5 font-mono tabular-nums">
        <span className={`text-sm ${avantClass}`}>{avant}</span>
        <ArrowRight className="h-3 w-3 shrink-0 text-ink-300" />
        <span className={`text-base font-bold ${apresClass}`}>{apres}</span>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title="Voir le détail du calcul"
        className="rounded-lg bg-white/70 px-3 py-2 text-left ring-1 ring-inset ring-ink-100 transition hover:ring-accent-300 hover:ring-2"
      >
        {inner}
      </button>
    );
  }

  return <div className="rounded-lg bg-white/70 px-3 py-2 ring-1 ring-inset ring-ink-100">{inner}</div>;
}

const DECISION_CHIP: Record<Decision, { label: string; cls: string }> = {
  achete: { label: "Achète", cls: "bg-emerald-100 text-emerald-700" },
  negocie: { label: "Négocie", cls: "bg-amber-100 text-amber-700" },
  passe: { label: "Passe", cls: "bg-red-100 text-red-700" },
};

function VerdictChip({ decision }: { decision: Decision }) {
  const c = DECISION_CHIP[decision];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.cls}`}>
      Verdict&nbsp;: {c.label}
    </span>
  );
}

function DegradedCard({
  titre,
  texte,
  cta,
}: {
  titre: string;
  texte: string;
  cta: { label: string; onClick: () => void } | null;
}) {
  return (
    <section className="rounded-xl border border-ink-200 bg-gradient-to-r from-white to-accent-50 p-8 text-center sm:p-12">
      <h2 className="font-display text-2xl font-semibold text-ink-900">{titre}</h2>
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
