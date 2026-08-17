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
import { GroupHeader, SectionTitle, TITRE_SECTION } from "@/components/SectionHeader";
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

/**
 * ── Pourquoi le levier n'a plus de COULEUR propre ─────────────────────────
 *
 * Chaque levier portait sa teinte (emerald/prix, amber/travaux, sky/loyer,
 * violet/financement) sur un liseré gauche de 4 px et sur sa pastille d'icône.
 * Deux problèmes, pas un :
 *
 *  1. **Collision sémantique.** La charte réserve emerald/amber/red à la
 *     QUALITÉ d'un chiffre. Sur cet écran, les badges d'impact sont eux aussi
 *     en emerald : le vert disait donc à la fois « c'est le levier prix » et
 *     « c'est bon », et l'ambre du levier travaux se lisait comme un
 *     avertissement alors qu'il ne signalait rien.
 *  2. **Redondance.** Le levier est déjà nommé en clair et porte une icône
 *     distincte. La couleur n'ajoutait aucune information.
 *
 * Le levier est donc NEUTRE (`ink`), et la couleur est rendue à son seul job :
 * dire si un chiffre est un gain, une perte ou un blocage. Ne pas rétablir de
 * teinte par levier — le champ `badge` de l'ancienne table n'était d'ailleurs
 * même plus lu.
 */
const SEUIL_DELTA_RENDEMENT = 0.001; // 0,1 point
const SEUIL_DELTA_CASHFLOW = 1; // 1 €/mois

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

type Impact = { label: string; valeur: string; tone: "gain" | "perte" | "neutre" };

/**
 * Les DEUX effets d'un levier, toujours dans le même ordre et toujours les deux.
 *
 * ⚠️ L'ancienne version rendait UN badge, en basculant d'unité selon le levier :
 * « +0,7 % rdt » pour le prix, « + 36 €/mois » pour le financement. Résultat, la
 * colonne mélangeait deux unités et on ne pouvait PAS comparer deux cartes entre
 * elles — alors que ranger les leviers est précisément le job de l'écran.
 *
 * Un levier qui ne bouge pas un indicateur affiche « inchangé » plutôt que
 * « +0,0 % » : c'est une information (le financement ne touche pas le rendement
 * intrinsèque du bien), pas un trou à masquer.
 */
function impacts(reco: Recommandation): Impact[] {
  const dR = (reco.rendementApres ?? 0) - (reco.rendementAvant ?? 0);
  const dCF = (reco.cashflowApres ?? 0) - (reco.cashflowAvant ?? 0);
  const plat = (d: number, seuil: number) => Math.abs(d) < seuil;
  return [
    {
      label: "Rendement net",
      valeur: plat(dR, SEUIL_DELTA_RENDEMENT)
        ? "inchangé"
        // Signe posé à la main sur la valeur absolue : `formatPercent` rendrait
        // un trait d'union ASCII sur un négatif, pas le vrai signe moins.
        : `${dR > 0 ? "+" : "\u2212"}${formatPercent(Math.abs(dR))}`,
      tone: plat(dR, SEUIL_DELTA_RENDEMENT) ? "neutre" : dR > 0 ? "gain" : "perte",
    },
    {
      label: "Cash-flow",
      valeur: plat(dCF, SEUIL_DELTA_CASHFLOW) ? "inchangé" : `${formatEurosSigned(dCF)}/mois`,
      tone: plat(dCF, SEUIL_DELTA_CASHFLOW) ? "neutre" : dCF > 0 ? "gain" : "perte",
    },
  ];
}

const IMPACT_TONE: Record<Impact["tone"], string> = {
  gain: "text-emerald-700",
  perte: "text-red-700",
  neutre: "text-ink-400",
};

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
  const mesures = impacts(reco);
  const nbFaits = (reco.arguments ?? []).filter((a) => a.source).length;

  // Marqueurs d'état, déclarés une fois et rendus à deux emplacements selon la
  // largeur. « Bloqué » est le plus important des trois : sans lui, un levier
  // dont le caveat est rédhibitoire paraissait aussi attirant que les autres
  // tant qu'on ne l'avait pas déplié.
  const marqueurs = (
    <>
      {reco.flipVersAchat && (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
          Achète
        </span>
      )}
      {reco.caveatBloquant && (
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
          Bloqué
        </span>
      )}
      {nbFaits > 0 && (
        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium text-ink-600">
          {nbFaits} fait{nbFaits > 1 ? "s" : ""}
        </span>
      )}
    </>
  );

  // Bloc d'impact : deux mesures alignées, plus la trésorerie à sortir. Rendu
  // en tableau de données et non en pastille — c'est le chiffre pour lequel on
  // vient, il ne peut pas être l'élément le plus discret de la carte.
  const blocImpact = (
    // Détaché par un SÉPARATEUR, pas par un fond : `ink-50` vaut `#fafafd`,
    // quasi blanc, donc invisible sur une carte blanche. Le trait reprend le
    // token de divider de la charte (`ink-100/50`) et change d'orientation avec
    // la mise en page — au-dessus quand le bloc passe sous le texte en mobile,
    // à gauche quand il devient une colonne à partir de `sm`.
    <span className="block flex-1 border-t border-ink-100/50 pt-3 sm:w-56 sm:flex-none sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
      {mesures.map((m) => (
        <span key={m.label} className="flex items-baseline justify-between gap-3 py-0.5">
          <span className="text-xs text-ink-500">{m.label}</span>
          <span className={`whitespace-nowrap font-mono text-sm font-semibold tabular-nums ${IMPACT_TONE[m.tone]}`}>
            {m.valeur}
          </span>
        </span>
      ))}
      {reco.montantEngage != null && (
        // Sortie de trésorerie : NEUTRE, jamais en vert (cf. le commentaire de
        // `montantEngage` dans `analyse/types.ts`). Une carte qui n'afficherait
        // que le gain sans l'argent à sortir mentirait sur l'arbitrage.
        <span className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-ink-200/60 pt-1.5">
          <span className="text-xs text-ink-500">À engager</span>
          <span className="whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-ink-700">
            {fmtEuros(reco.montantEngage)}
          </span>
        </span>
      )}
    </span>
  );

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-white transition-shadow ${
        expanded ? "border-ink-200 shadow-sm" : "border-ink-100"
      }`}
    >
      {/* Summary row — always visible. Uniquement des `<span>` : le contenu d'un
          `<button>` est du phrasing content, un `<div>` y est invalide. */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-col gap-4 p-5 text-left transition-colors hover:bg-ink-50/50 sm:flex-row sm:items-center sm:gap-5"
      >
        <span className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-ink-50">
            <Icon className="size-5 text-ink-500" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className={`block ${TITRE_SECTION}`}>{reco.titre ?? reco.action}</span>
            {/* L'action chiffrée était enfouie dans le dépliant : c'est LA
                réponse de la carte (« Négocie à 272 800 € »), elle se lit
                maintenant sans clic. En `font-mono`, comme tout chiffre clé. */}
            {reco.titre && reco.action && (
              <span className="mt-1 block font-mono text-sm font-semibold tabular-nums text-accent-700">
                {reco.action}
              </span>
            )}
            {reco.pourquoi && (
              <span className="mt-1.5 block text-sm text-ink-500">{reco.pourquoi}</span>
            )}
            <span className="mt-2.5 flex flex-wrap items-center gap-1.5">{marqueurs}</span>
          </span>
        </span>

        <span className="flex items-center gap-3 sm:shrink-0 sm:gap-4">
          {blocImpact}
          <ChevronDown
            className={`size-4 shrink-0 text-ink-400 transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
            aria-hidden
          />
        </span>
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
    // ── Harmonie des sections ────────────────────────────────────────────────
    // Le dépliant empilait TROIS traitements de fond : un pavé `accent-50/50`,
    // un bandeau ambre ou rouge pleine largeur, puis du blanc. Trois teintes
    // pour un seul contenu, et le caveat coupait la carte en deux alors qu'il ne
    // fait que nuancer les chiffres du dessus.
    //
    // Deux zones désormais, une seule teinte : « Ce que ça change » (les
    // chiffres, sur `accent-50/40`, caveat inclus) puis les arguments sur blanc,
    // séparés par le `border-ink-100/50` de la charte. Les deux portent un
    // `GroupHeader`, comme partout ailleurs dans l'onglet.
    <div className="border-t border-ink-100/50">
      <div className="bg-accent-50/40 p-5 sm:p-6">
        <GroupHeader
          as="h4"
          title="Ce que ça change"
          subtitle={pivot?.avant ? `${pivot.label} aujourd'hui : ${pivot.avant}` : undefined}
        >
          {pivot?.delta && (
            <span className="rounded-md bg-emerald-100/70 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-emerald-800">
              {pivot.delta}
            </span>
          )}
        </GroupHeader>

        {/* Le caveat vit DANS cette zone, sous le titre : il qualifie ces
            chiffres. Rouge uniquement si `caveatBloquant` — une simple réserve
            d'estimation peinte en rouge se lirait comme un blocage. */}
        {reco.caveat && (
          <div
            className={`mb-4 flex gap-2.5 rounded-lg border px-3.5 py-2.5 ${
              reco.caveatBloquant
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="text-sm leading-relaxed">{reco.caveat}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

      {/* Arguments */}
      {(preuves.length > 0 || methode.length > 0) && (
        <div className="space-y-8 border-t border-ink-100/50 p-5 sm:p-6">
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
