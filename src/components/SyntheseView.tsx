"use client";

import type { ApartmentWithComputed } from "@/lib/types";
import { isImmeuble } from "@/lib/types";
import { formatDate, formatEuros, formatPercent } from "@/lib/format";
import { rendementNetTone, type RendementSeuils } from "@/lib/analyse/scoring";
import { simulate, defaultInputs } from "@/lib/simulation";
import { BLOC_LABELS, type BlocKey } from "@/lib/analyse/types";
import { formatNote } from "@/components/AnalyseIA";

// En-dessous de ce cash-flow mensuel, la ponction est franche : la carte passe
// au rouge (alerte) plutôt qu'au simple ambre. Un léger négatif reste "à
// surveiller", pas un signal rédhibitoire.
const CASHFLOW_ROUGE_SEUIL = -200;

/**
 * Onglet "Synthèse" : le bilan de décision en un coup d'œil. Aucune donnée
 * nouvelle — tout dérive de l'analyse stockée (score, verdicts, bloc prix),
 * des champs calculés (rendement) et de la simulation client (cash-flow).
 * Cet écran tranche (Achète / Négocie / Passe) et renvoie vers les onglets
 * détaillés via des liens discrets ; il n'affiche jamais le détail lui-même.
 */

type Decision = "achete" | "negocie" | "passe";

// Dégradé tonal directionnel repris de la home (lignes du tableau) : la
// couleur porte le verdict avant même la lecture du titre.
const DECISION_STYLES: Record<
  Decision,
  { grad: string; border: string; title: string; caption: string; score: string }
> = {
  achete: {
    grad: "bg-gradient-to-r from-white to-emerald-50",
    border: "border-emerald-200",
    title: "text-emerald-900",
    caption: "text-emerald-700",
    score: "text-emerald-700",
  },
  negocie: {
    grad: "bg-gradient-to-r from-white to-amber-50",
    border: "border-amber-200",
    title: "text-amber-900",
    caption: "text-amber-700",
    score: "text-amber-700",
  },
  passe: {
    grad: "bg-gradient-to-r from-white to-red-50",
    border: "border-red-200",
    title: "text-red-900",
    caption: "text-red-700",
    score: "text-red-600",
  },
};

type MetricTone = "positif" | "attention" | "alerte" | "neutral";

const METRIC_VALUE_CLASS: Record<MetricTone, string> = {
  positif: "text-emerald-700",
  attention: "text-amber-700",
  alerte: "text-red-600",
  neutral: "text-ink-900",
};

const NOTE_CLASS = (note: number | null) =>
  note == null
    ? "text-ink-400"
    : note >= 7
      ? "text-emerald-700"
      : note >= 5
        ? "text-amber-700"
        : "text-red-600";

// Les 5 blocs pondérés, dans l'ordre de la note globale (quartier est
// purement informatif : poids 0, jamais noté — exclu du radar).
const BLOCS_NOTES: BlocKey[] = ["prix", "location", "risque", "potentiel", "simulation"];

function dpeInfo(dpe: string): { sub: string; tone: MetricTone } {
  switch (dpe.trim().toUpperCase()) {
    case "G":
      return { sub: "Interdit à la location", tone: "alerte" };
    case "F":
      return { sub: "Interdiction de louer en 2028", tone: "alerte" };
    case "E":
      return { sub: "Interdiction de louer en 2034", tone: "attention" };
    case "D":
      return { sub: "Correct, aucune échéance proche", tone: "neutral" };
    case "A":
    case "B":
    case "C":
      return { sub: "Aucun risque réglementaire", tone: "positif" };
    default:
      return { sub: "Non renseigné", tone: "neutral" };
  }
}

export default function SyntheseView({
  apartment: apt,
  seuilsRendement,
  onGoTab,
  onRelancer,
}: {
  apartment: ApartmentWithComputed;
  seuilsRendement: RendementSeuils;
  onGoTab: (tab: "ia" | "donnees" | "financiere" | "simulation", anchor?: string) => void;
  onRelancer: () => void;
}) {
  const analyse = apt.analyse_ia;
  const immeuble = isImmeuble(apt.type_bien);

  // --- États dégradés -----------------------------------------------------
  if (!analyse || analyse.score_global == null) {
    const prixManquant = apt.prix == null;
    return (
      <section className="rounded-xl border border-ink-200 bg-gradient-to-r from-white to-accent-50 p-8 text-center sm:p-12">
        <h2 className="font-display text-2xl font-semibold text-ink-900">
          Pas encore de bilan pour {immeuble ? "cet immeuble" : "ce bien"}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
          La synthèse s&apos;appuie sur l&apos;Analyse IA : score global, comparaison au
          marché et points rédhibitoires.
        </p>
        {prixManquant ? (
          <p className="mt-6 text-sm text-ink-600">
            Renseigne d&apos;abord le prix d&apos;achat dans{" "}
            <button
              type="button"
              onClick={() => onGoTab("donnees")}
              className="font-medium text-accent-600 underline underline-offset-2 hover:text-accent-700"
            >
              la description du bien
            </button>
            .
          </p>
        ) : (
          <button
            type="button"
            onClick={onRelancer}
            className="mt-6 rounded-lg bg-accent-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-700"
          >
            Lancer l&apos;analyse
          </button>
        )}
      </section>
    );
  }

  // --- Données dérivées (aucun nouvel appel) ------------------------------
  const score = analyse.score_global;
  const alerte = analyse.verdicts.find((v) => v.niveau === "alerte");
  const attention = analyse.verdicts.find((v) => v.niveau === "attention");

  const faits = analyse.blocs.prix.faits;
  const faitEcart = faits.find((f) => f.label === "Écart au prix de marché");
  const ecartPct =
    faitEcart?.value != null && !Number.isNaN(Number(String(faitEcart.value).replace("+", "")))
      ? Number(String(faitEcart.value).replace("+", ""))
      : null;
  const faitMediane = faits.find((f) => f.label === "Prix/m² médian comparable");
  const medianeM2 = typeof faitMediane?.value === "number" ? faitMediane.value : null;
  const prixMarche =
    medianeM2 != null && apt.surface_m2 != null
      ? Math.round((medianeM2 * apt.surface_m2) / 1000) * 1000
      : null;

  const simu = simulate(apt, apt.simulation_inputs ?? defaultInputs());
  const cashflow = simu?.cashflowMensuelAn1 ?? null;

  const netTone = rendementNetTone(apt.rendement_net, seuilsRendement);
  const dpe = dpeInfo(apt.dpe);

  // #3 — tonalité du cash-flow calibrée sur la gravité : franchement négatif =
  // rouge, légèrement négatif = ambre, positif = vert.
  const cashflowTone: MetricTone =
    cashflow == null
      ? "neutral"
      : cashflow >= 0
        ? "positif"
        : cashflow < CASHFLOW_ROUGE_SEUIL
          ? "alerte"
          : "attention";

  const ecartTone: MetricTone =
    faitEcart?.gravite === "positif"
      ? "positif"
      : faitEcart?.gravite === "attention"
        ? "attention"
        : faitEcart?.gravite === "alerte"
          ? "alerte"
          : "neutral";

  // #2 — l'écart au marché peut manquer (aucun comparable DVF). Dans ce cas la
  // 3e case bascule sur le prix/m² du bien, toujours calculable : jamais de
  // slot vide sur un écran de décision.
  const ecartDisponible = ecartPct != null;

  // --- Décision (dérivée des signaux existants, jamais recalculée) --------
  // Un GO franc est exigeant : le moindre verdict "attention" (rendement
  // modeste, bloc faible, DPE E...) ou une surcote bascule en "négocie".
  const surcote = ecartPct != null && ecartPct > 5;
  let decision: Decision;
  let raison: string;
  if (alerte || score < 5) {
    decision = "passe";
    raison = alerte
      ? `${alerte.titre}. C'est rédhibitoire : une négociation ne le rattrape pas, mieux vaut chercher un autre bien.`
      : `Score global ${formatNote(score)}/10 : trop de points faibles pour un investissement sain. Passe ton chemin.`;
  } else if (score >= 7 && !attention && !surcote) {
    decision = "achete";
    raison =
      ecartPct != null && ecartPct <= -5
        ? `Aucun frein détecté, et un prix affiché ${Math.abs(ecartPct)} % sous les ventes comparables : un bon dossier, à sécuriser sans traîner.`
        : "Aucun frein détecté : prix, rendement et risques sont alignés pour investir.";
  } else {
    decision = "negocie";
    raison = surcote
      ? `Le prix affiché est ${ecartPct} % au-dessus des ventes comparables du secteur. Négocie-le vers le marché : c'est là qu'est ta marge.`
      : attention
        ? `${attention.titre}. Le bien reste intéressant, mais négocie le prix d'achat pour compenser ce point et sécuriser ta rentabilité.`
        : `Bon dossier dans l'ensemble, mais la marge est mince. Une négociation du prix d'achat sécurise l'opération.`;
  }
  const styles = DECISION_STYLES[decision];

  const titres: Record<Decision, string> = {
    achete: "Achète",
    negocie: "Achète — si tu négocies",
    passe: "Passe ton chemin",
  };

  // #1 — met en évidence la/les métrique(s) qui ont motivé le verdict, pour que
  // l'écran réponde "pourquoi" et pas seulement "quoi". Uniquement sur
  // négocie/passe : sur un GO franc, aucune carte n'est un frein. La couleur
  // suit la gravité (rouge/ambre), le tag suit la décision.
  const emphasize = decision !== "achete";
  const tagLabel = decision === "passe" ? "Rédhibitoire" : "À négocier";
  const driver = (
    tone: MetricTone
  ): { tone: "alerte" | "attention"; label: string } | undefined =>
    emphasize && (tone === "alerte" || tone === "attention")
      ? { tone, label: tagLabel }
      : undefined;

  return (
    <div className="space-y-4">
      {/* Verdict : la seule chose qu'on lit vraiment. Large et aéré. La date de
          l'analyse est un chip discret près du titre ; le radar des blocs
          (décomposition du score) et le lien vers l'analyse vivent en pied. */}
      <section className={`rounded-2xl border p-6 sm:p-9 ${styles.border} ${styles.grad}`}>
        <div className="flex flex-col-reverse gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <p className={`text-xs font-semibold uppercase tracking-wide ${styles.caption}`}>
                Verdict
              </p>
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-ink-400 ring-1 ring-inset ring-ink-200">
                Analysé le {formatDate(analyse.genere_le)}
              </span>
            </div>
            <h2 className={`mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl ${styles.title}`}>
              {titres[decision]}
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-600">{raison}</p>
            {decision === "negocie" && prixMarche != null && apt.prix != null && prixMarche < apt.prix && (
              <p className="mt-3 text-sm text-ink-600">
                Prix aligné sur le marché :{" "}
                <span className="font-mono font-semibold tabular-nums text-ink-900">
                  {formatEuros(prixMarche)}
                </span>{" "}
                <span className="text-xs text-ink-400">(médiane DVF × surface)</span>
              </p>
            )}
          </div>
          <div className="shrink-0 text-left sm:text-right">
            <p className={`font-mono text-5xl font-bold tabular-nums ${styles.score}`}>
              {formatNote(score)}
            </p>
            <p className="mt-1.5 text-xs text-ink-500">score global /10</p>
          </div>
        </div>

        {/* Pied "analyse" : le radar des blocs + le lien vers l'analyse
            détaillée. Volontairement discret, subordonné au verdict. */}
        <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
            {BLOCS_NOTES.map((cle) => {
              const bloc = analyse.blocs[cle];
              return (
                <button
                  key={cle}
                  type="button"
                  onClick={() => onGoTab("ia")}
                  className="group flex items-baseline gap-1.5 text-[13px]"
                >
                  <span className="text-ink-500 transition-colors group-hover:text-accent-700">
                    {BLOC_LABELS[cle]}
                  </span>
                  <span className={`font-mono font-semibold tabular-nums ${NOTE_CLASS(bloc.note)}`}>
                    {bloc.note == null ? "—" : formatNote(bloc.note)}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => onGoTab("ia")}
            className="shrink-0 text-xs text-ink-400 transition-colors hover:text-accent-600"
          >
            <span className="underline underline-offset-2">Analyse complète</span>{" "}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>

      {/* Les 4 chiffres du comité d'investissement */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard
          label="Cash-flow mensuel"
          value={
            cashflow == null
              ? "—"
              : `${cashflow >= 0 ? "+" : "−"} ${formatEuros(Math.abs(Math.round(cashflow)))}`
          }
          sub={cashflow == null ? "Simulation incomplète" : "Après crédit et impôt, an 1"}
          tone={cashflowTone}
          emphasis={driver(cashflowTone)}
          linkLabel="Simulation"
          onClick={() => onGoTab("simulation", "sim-cashflow")}
        />
        <MetricCard
          label="Rendement net"
          value={apt.rendement_net == null ? "—" : formatPercent(apt.rendement_net)}
          sub="Après charges, hors crédit"
          tone={netTone === "neutral" ? "neutral" : netTone}
          emphasis={driver(netTone === "neutral" ? "neutral" : netTone)}
          linkLabel="Détails"
          onClick={() => onGoTab("financiere", "fin-resultats")}
        />
        {ecartDisponible ? (
          <MetricCard
            label="Prix vs marché"
            value={`${ecartPct! > 0 ? "+" : ""}${ecartPct} %`}
            sub={
              medianeM2 != null
                ? `Prix d'achat vs médiane DVF (${formatEuros(medianeM2)}/m²)`
                : "Prix d'achat vs ventes comparables"
            }
            tone={ecartTone}
            emphasis={driver(ecartTone)}
            linkLabel="Analyse du prix"
            onClick={() => onGoTab("ia", "bloc-prix")}
          />
        ) : (
          <MetricCard
            label="Prix au m²"
            value={apt.prix_m2 == null ? "—" : `${formatEuros(apt.prix_m2)}/m²`}
            sub="Achat + travaux · pas de comparable DVF"
            tone="neutral"
            linkLabel="Détails"
            onClick={() => onGoTab("financiere", "fin-achat")}
          />
        )}
        <MetricCard
          label="DPE"
          value={apt.dpe.trim() === "" ? "—" : apt.dpe.trim().toUpperCase()}
          sub={dpe.sub}
          tone={dpe.tone}
          emphasis={driver(dpe.tone)}
          linkLabel={apt.dpe.trim() === "" ? "Compléter" : "Risques"}
          onClick={() => (apt.dpe.trim() === "" ? onGoTab("donnees") : onGoTab("ia", "bloc-risque"))}
        />
      </div>
    </div>
  );
}

const EMPHASIS_CARD_CLASS: Record<"alerte" | "attention", string> = {
  alerte: "border-red-200 bg-red-50/50",
  attention: "border-amber-200 bg-amber-50/50",
};

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
  // #1 — quand renseigné, la carte a motivé le verdict : liseré + fond teinté
  // + petit tag (couleur = gravité, libellé = décision).
  emphasis?: { tone: "alerte" | "attention"; label: string };
  linkLabel: string;
  onClick: () => void;
}) {
  return (
    <div
      className={`flex flex-col rounded-xl border p-4 ${
        emphasis ? EMPHASIS_CARD_CLASS[emphasis.tone] : "border-ink-200 bg-white"
      }`}
    >
      <div className="flex min-h-[1.25rem] items-start justify-between gap-2">
        <p className="text-xs font-medium text-ink-500">{label}</p>
        {emphasis && (
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${EMPHASIS_TAG_CLASS[emphasis.tone]}`}
          >
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
        <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5 inline-block">
          →
        </span>
      </button>
    </div>
  );
}
