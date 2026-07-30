"use client";

import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Check,
  Hammer,
  KeyRound,
  Landmark,
} from "lucide-react";
import type { ApartmentWithComputed } from "@/lib/types";
import { isImmeuble } from "@/lib/types";
import { computeDerived } from "@/lib/calculations";
import type { Argument, Recommandation, RecommandationLevier } from "@/lib/analyse/types";
import {
  TONE_TEXT_CLASS,
  cashflowTone,
  rendementNetTone,
  type CashflowSeuils,
  type RendementSeuils,
} from "@/lib/analyse/scoring";
import { decisionFromAnalyse } from "@/lib/analyse/decision";
import { useRendementDetail } from "@/components/RendementDetailProvider";
import { useCashflowDetail } from "@/components/CashflowDetailProvider";
import { formatEuros, formatEurosSigned, formatPercent } from "@/lib/format";

/**
 * Onglet "Optimiser" — PRESCRIPTIF, orienté DÉCISION + RENTABILITÉ (pas le
 * score). Deux modes selon le verdict actuel :
 *  - verdict ≠ "Achète" → les actions pour EN FAIRE UN ACHAT (le levier prix
 *    dit le prix exact à négocier pour basculer à "Achète").
 *  - verdict = "Achète" → comment ACHETER MIEUX / augmenter la rentabilité.
 * Purement informatif : ne modifie RIEN sur le bien (voir recommandations.ts).
 *
 * Un levier À LA FOIS, sélectionné par onglet. L'écran sert à AGIR sur un
 * levier, pas à les comparer : le moteur les a déjà classés (prix en tête,
 * financement en dernier) et la vue d'ensemble vit dans l'onglet Synthèse.
 * Ordre de lecture imposé : le changement → les chiffres impactés → les
 * arguments.
 */

const LEVIER_ICON: Record<RecommandationLevier, typeof Banknote> = {
  prix: Banknote,
  travaux: Hammer,
  loyer: KeyRound,
  financement: Landmark,
};

const LEVIER_TAB_LABEL: Record<RecommandationLevier, string> = {
  prix: "Prix",
  travaux: "Travaux",
  loyer: "Loyer",
  financement: "Financement",
};

/** Tous les montants passent par `formatEuros` : il pose une espace INSÉCABLE
 * avant le « € », là où `toLocaleString(…) + " €"` met une espace ordinaire —
 * le symbole pouvait alors partir seul à la ligne dans ces colonnes étroites. */
const fmtCashflow = formatEurosSigned;

const fmtRendement = (n: number | null): string => (n == null ? "—" : formatPercent(n));
const fmtEuros = (n: number): string => formatEuros(Math.round(n));
const fmtPrixM2 = (n: number): string => `${formatEuros(Math.round(n))}/m²`;

/**
 * Contexte du chiffre PIVOT — celui que l'investisseur contrôle sur ce levier
 * (le prix qu'il annonce, le loyer qu'il affiche, le budget qu'il fait chiffrer,
 * l'apport qu'il vire). Jamais une conséquence : rendement et cash-flow se
 * constatent, ils ne s'exécutent pas.
 *
 * La VALEUR CIBLE n'est pas ici : elle est portée par `reco.action`, qui est le
 * titre du panneau. Ce helper ne fournit que ce qui l'entoure — la valeur
 * actuelle et l'écart — pour ne jamais répéter la cible à côté du titre.
 *
 * `avant` n'existe que pour les leviers en transition (prix, loyer) : il n'y a
 * pas de budget travaux ni d'apport « avant ».
 */
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
  if (reco.montantEngage != null) {
    // Grandeur sèche : le montant est dans le titre, il n'y a rien à encadrer.
    return null;
  }
  return null;
}

type PairKind = "prixm2" | "loyer" | "rendement" | "cashflow";
type Pair = {
  kind: PairKind;
  label: string;
  avant: string;
  apres: string;
  apresClass: string;
};

/**
 * Chiffres impactés — les CONSÉQUENCES du levier. On exclut la métrique déjà
 * portée par le pivot pour ne pas la répéter.
 */
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
      apresClass: "text-emerald-700",
    });
  }
  if (reco.levier !== "loyer" && reco.loyerAvant != null && reco.loyerApres != null) {
    pairs.push({
      kind: "loyer",
      label: "Loyer /mois",
      avant: fmtEuros(reco.loyerAvant),
      apres: fmtEuros(reco.loyerApres),
      apresClass: "text-emerald-700",
    });
  }
  pairs.push({
    kind: "rendement",
    label: "Rendement net",
    avant: fmtRendement(reco.rendementAvant),
    apres: fmtRendement(reco.rendementApres),
    apresClass: TONE_TEXT_CLASS[rendementNetTone(reco.rendementApres, seuilsRendement)],
  });
  pairs.push({
    kind: "cashflow",
    label: "Cash-flow /mois",
    avant: fmtCashflow(reco.cashflowAvant),
    apres: fmtCashflow(reco.cashflowApres),
    apresClass: TONE_TEXT_CLASS[cashflowTone(reco.cashflowApres, cashflowSeuils)],
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
  const [actif, setActif] = useState(0);
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
  const dejaAchat = decisionFromAnalyse(analyse).decision === "achete";

  if (recos.length === 0) {
    return (
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
    );
  }

  const index = Math.min(actif, recos.length - 1);
  const reco = recos[index];

  return (
    <LevierPanel
      key={reco.levier + index}
      reco={reco}
      apt={apt}
      seuilsRendement={seuilsRendement}
      cashflowSeuils={cashflowSeuils}
      onOpenRendement={openRendementDetail}
      onOpenCashflow={openCashflowDetail}
      selecteur={<SelecteurLevier recos={recos} index={index} onSelect={setActif} />}
    />
  );
}

/**
 * Sélecteur de levier — contrôle SEGMENTÉ, pas une barre d'onglets.
 *
 * La page porte déjà une navigation par onglets (Synthèse / Analyse IA /
 * Optimiser…). Reprendre ici la même forme — pleine largeur, soulignement actif
 * — créait deux barres identiques à deux niveaux de hiérarchie différents, sans
 * rien pour les départager. Pire, elles ne se comportent pas pareil : les
 * onglets de page sont des liens qui changent l'URL, celui-ci est un état local.
 *
 * D'où : compact, aligné à gauche (largeur du contenu, pas de la page), fond
 * plein plutôt que soulignement, et rendu DANS le bandeau du levier — il
 * appartient visiblement au bloc qu'il pilote. Ne pas le réétirer sur toute la
 * largeur ni le remonter au-dessus du panneau.
 */
function SelecteurLevier({
  recos,
  index,
  onSelect,
}: {
  recos: Recommandation[];
  index: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="-mx-1 mb-4 overflow-x-auto px-1 py-0.5">
      <div
        role="tablist"
        aria-label="Leviers d'optimisation"
        className="inline-flex w-max gap-1 rounded-lg bg-ink-100 p-1"
      >
        {recos.map((r, i) => {
          const Icon = LEVIER_ICON[r.levier];
          const on = i === index;
          return (
            <button
              key={r.levier + i}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onSelect(i)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-600 ${
                on
                  ? "bg-white font-medium text-ink-900 ring-1 ring-ink-200"
                  : "text-ink-600 hover:text-accent-700"
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${on ? "text-accent-600" : "text-ink-400"}`}
                aria-hidden
              />
              {LEVIER_TAB_LABEL[r.levier]}
              {r.flipVersAchat && (
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                  Achète
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LevierPanel({
  reco,
  apt,
  seuilsRendement,
  cashflowSeuils,
  onOpenRendement,
  onOpenCashflow,
  selecteur,
}: {
  reco: Recommandation;
  apt: ApartmentWithComputed;
  seuilsRendement: RendementSeuils;
  cashflowSeuils: CashflowSeuils;
  onOpenRendement: (apt: ApartmentWithComputed, seuils: RendementSeuils) => void;
  onOpenCashflow: (apt: ApartmentWithComputed, seuils: CashflowSeuils) => void;
  /** Sélecteur de levier, rendu DANS le bandeau (voir SelecteurLevier). */
  selecteur: ReactNode;
}) {
  const pivot = buildPivot(reco);
  const pairs = buildPairs(reco, seuilsRendement, cashflowSeuils);
  const args = reco.arguments ?? [];
  // La PRÉSENCE d'une source distingue une preuve (opposable, adossée à une
  // donnée réelle) d'un argument de méthode (playbook). Voir types.ts.
  const preuves = args.filter((a) => a.source);
  const methode = args.filter((a) => !a.source);

  // Bien modifié (COPIE) reconstruit depuis le patch du scénario, pour ouvrir
  // les popups de détail avec les nouvelles valeurs. Jamais persisté.
  const modApt = reco.patch ? computeDerived({ ...apt, ...reco.patch }) : apt;
  const onClickFor = (kind: PairKind): (() => void) | undefined => {
    if (kind === "rendement") return () => onOpenRendement(modApt, seuilsRendement);
    if (kind === "cashflow") return () => onOpenCashflow(modApt, cashflowSeuils);
    return undefined;
  };

  return (
    <section role="tabpanel" className="overflow-hidden rounded-xl border border-ink-200 bg-white">
      {/* UNE seule section pour l'action et son impact.
          1. L'action à faire — elle PORTE le chiffre pivot (`reco.action`), il
             n'y a donc pas de carte pivot à côté : titre et carte auraient dit
             la même chose. L'écart et la valeur actuelle complètent en second
             plan, jamais en répétant la cible.
          2. Les chiffres impactés — uniquement les CONSÉQUENCES, dans la même
             section pour qu'action et impact se lisent d'un bloc. */}
      <div className="border-b border-ink-100 bg-accent-50 p-5">
        {selecteur}

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-display text-2xl font-semibold text-ink-900">{reco.action}</h3>
          {pivot?.delta && (
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-emerald-700">
              {pivot.delta}
            </span>
          )}
        </div>

        <p className="mt-1.5 max-w-2xl text-sm text-ink-600">
          {pivot?.avant && (
            <>
              <span className="whitespace-nowrap">
                {pivot.label}{" "}
                <span className="font-mono tabular-nums text-ink-500">{pivot.avant}</span>
              </span>
              {reco.pourquoi && <span className="px-1.5 text-ink-300">·</span>}
            </>
          )}
          {reco.pourquoi}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {pairs.map((p) => (
            <MetricCard
              key={p.kind}
              label={p.label}
              avant={p.avant}
              apres={p.apres}
              apresClass={p.apresClass}
              onClick={onClickFor(p.kind)}
            />
          ))}
        </div>
      </div>

      {reco.caveat && (
        <div
          className={`flex gap-2.5 border-y px-5 py-3 ${
            reco.caveatBloquant
              ? "border-red-100 bg-red-50 text-red-700"
              : "border-amber-100 bg-amber-50 text-amber-800"
          }`}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="text-sm leading-relaxed">{reco.caveat}</p>
        </div>
      )}

      {/* 3. Les arguments — « Les faits » (sourcés) puis « La méthode ».
          Pas « Preuves » / « Arguments » : les items de méthode SONT aussi des
          arguments, et « preuve » sonne opposable alors que sur le financement
          il s'agit d'un diagnostic. */}
      {(preuves.length > 0 || methode.length > 0) && (
        <div className="space-y-6 p-5">
          {preuves.length > 0 && (
            <section>
              <SectionLabel titre="Les faits" nombre={preuves.length} />
              <ul className="space-y-2.5">
                {preuves.map((a, i) => (
                  <PreuveItem key={i} arg={a} />
                ))}
              </ul>
            </section>
          )}
          {methode.length > 0 && (
            <section>
              <SectionLabel titre="La méthode" nombre={methode.length} />
              <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
    </section>
  );
}

function SectionLabel({ titre, nombre }: { titre: string; nombre: number }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">{titre}</h4>
      <span className="font-mono text-[11px] tabular-nums text-ink-300">{nombre}</span>
    </div>
  );
}

/**
 * Un fait : chiffre-clé extrait en colonne, puis l'énoncé.
 *
 * La colonne du chiffre est de largeur FIXE pour que les chiffres s'alignent
 * d'un fait à l'autre — c'est tout l'intérêt de les sortir de la phrase.
 * Dimensionnée pour le plus long montant plausible (un apport à six chiffres),
 * et en `nowrap` pour qu'un « € » isolé ne tombe jamais à la ligne. Le chiffre
 * est un BADGE à fond teinté (bg-ink-50), pas une colonne bornée par un trait
 * vertical — un diviseur ajoute une ligne à lire sans ajouter d'information.
 */
function PreuveItem({ arg }: { arg: Argument }) {
  return (
    <li className="rounded-xl border border-ink-200 bg-white p-4">
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
 * Reprend le gabarit exact de `MetricCard` (AnalyseIA.tsx) — rounded-xl,
 * p-4, label sans capitales, valeur `text-2xl font-bold` en mono, lien de
 * détail souligné + flèche ancré en bas à droite. Seul ajout : la valeur
 * "avant", puisque ce contexte est un avant/après et non une valeur seule.
 */
function MetricCard({
  label,
  avant,
  apres,
  apresClass,
  onClick,
}: {
  label: string;
  avant: string;
  apres: string;
  apresClass: string;
  onClick?: () => void;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-ink-200 bg-white p-4">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className="mt-1.5 flex items-baseline gap-2 font-mono tabular-nums">
        <span className="text-sm text-ink-400">{avant}</span>
        <ArrowRight className="h-3 w-3 shrink-0 self-center text-ink-300" aria-hidden />
        <span className={`text-2xl font-bold ${apresClass}`}>{apres}</span>
      </p>
      {onClick && (
        <button
          type="button"
          onClick={onClick}
          title="Voir le détail du calcul"
          className="group mt-auto self-end pt-3 text-xs text-ink-400 transition-colors hover:text-accent-600 focus-visible:outline-2 focus-visible:outline-accent-600"
        >
          <span className="underline underline-offset-2">détail</span>{" "}
          <span
            aria-hidden="true"
            className="inline-block transition-transform group-hover:translate-x-0.5"
          >
            →
          </span>
        </button>
      )}
    </div>
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
