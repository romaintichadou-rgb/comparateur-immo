"use client";

import { useId, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Hammer,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import {
  GroupHeader,
  SectionTitle,
  TITRE_RECOMMANDATION,
} from "@/components/SectionHeader";
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
import { BLOC_ICON, BLOC_COLORS } from "@/lib/analyse/bloc-ui";
import { useRendementDetail } from "@/components/RendementDetailProvider";
import { useCashflowDetail } from "@/components/CashflowDetailProvider";
import { formatEuros, formatEurosSigned, formatPercent } from "@/lib/format";

const LEVIER_ICON: Record<RecommandationLevier, typeof Hammer> = {
  prix: BLOC_ICON.prix,
  travaux: Hammer,
  loyer: BLOC_ICON.location,
  financement: BLOC_ICON.simulation,
};

/**
 * Teinte de chaque levier, portée par la SEULE pastille d'icône.
 *
 * ── Pourquoi elle peut revenir ────────────────────────────────────────────
 * Elle avait été retirée parce qu'elle entrait en collision avec le système
 * sémantique : la charte réserve emerald/amber/red à la QUALITÉ d'un chiffre, et
 * la carte affichait alors des deltas d'impact en emerald juste à côté du levier
 * prix, lui aussi emerald. Le vert disait deux choses à la fois.
 *
 * La carte repliée ne porte plus aucun chiffre — impact et pastilles d'état ont
 * migré dans le dépliant. Il n'y a donc plus de vert sémantique sur la même
 * ligne, et la teinte redevient ce qu'elle doit rester : un repère de FAMILLE,
 * qui aide à retrouver un levier d'un coup d'œil dans la liste.
 *
 * ⚠️ Deux limites à ne pas franchir :
 *  - la teinte reste sur la pastille d'icône, PAS sur un liseré de carte ni sur
 *    du texte — un aplat coloré pleine hauteur relancerait la confusion ;
 *  - ne rien réintroduire de chiffré en emerald/red dans la rangée repliée sans
 *    reconsidérer ces couleurs d'abord.
 */
const LEVIER_COLORS: Record<RecommandationLevier, { bg: string; text: string }> = {
  prix: BLOC_COLORS.prix,
  travaux: { bg: "bg-amber-50", text: "text-amber-600" },
  loyer: BLOC_COLORS.location,
  financement: BLOC_COLORS.simulation,
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

/**
 * LE chiffre de la rangée repliée — un seul, à droite du titre.
 *
 * Règle : **le chiffre qui complète l'action sans la répéter.**
 *
 * - prix et loyer : l'ampleur du mouvement (`−9 %`, `+12 %`). Le titre donne la
 *   cible en euros, jamais l'écart — les deux se complètent.
 * - travaux et financement : `buildPivot` ne rend PAS de delta pour eux, et leur
 *   effort est déjà le titre (« Rénove pour ≈ 24 000 € »). Le répéter à droite
 *   ne dirait rien de neuf : on montre donc ce que le levier RAPPORTE, en
 *   cash-flow mensuel.
 *
 * ⚠️ Sans ce repli, deux cartes sur quatre auraient une colonne droite vide.
 *
 * Rendu en TAG teinté, et la teinte suit le SENS, jamais l'emplacement : vert
 * si le levier améliore, rouge s'il dégrade. Un tag toujours vert finirait par
 * ne plus rien dire — c'est ce qui avait fait retirer les couleurs de levier.
 * Les deltas de pivot (prix, loyer) sont des gains par construction : le moteur
 * ne propose que des mouvements favorables.
 */
function chiffreCle(reco: Recommandation): { valeur: string; tone: "gain" | "perte" } | null {
  const delta = buildPivot(reco)?.delta;
  if (delta) return { valeur: delta, tone: "gain" };
  const dCF = (reco.cashflowApres ?? 0) - (reco.cashflowAvant ?? 0);
  if (Math.abs(dCF) < 1) return null;
  return { valeur: `${formatEurosSigned(dCF)}/mois`, tone: dCF > 0 ? "gain" : "perte" };
}

const CHIFFRE_TONE: Record<"gain" | "perte", string> = {
  gain: "bg-emerald-100/70 text-emerald-800",
  perte: "bg-red-100/70 text-red-800",
};

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
  // Identifiants stables pour `aria-controls` / `aria-labelledby` : un
  // accordéon doit relier sa gâchette à la région qu'il ouvre, sinon un
  // lecteur d'écran annonce un bouton sans dire ce qu'il déploie.
  const chiffre = chiffreCle(reco);
  const uid = useId();
  const titreId = `${uid}-titre`;
  const panneauId = `${uid}-panneau`;
  // L'action EST le titre de la carte, `pourquoi` son sous-titre.
  //
  // ⚠️ Le nom du levier (`reco.titre`) n'est PLUS affiché en surtitre : il
  // répétait le verbe de l'action mot pour mot (« Négocier le prix d'achat » /
  // « Négocie à 190 000 € »), et l'icône colorée identifie déjà la famille. La
  // place ainsi libérée revient à la phrase chiffrée, qui elle JUSTIFIE la
  // recommandation au lieu de la paraphraser.
  const titre = reco.action ?? reco.titre;

  return (
    <div
      // `transition-colors` en plus de l'ombre : la bordure qui fonce au survol
      // dit « cette carte est cliquable » sans texte ni icône supplémentaires.
      className={`overflow-hidden rounded-xl border bg-white transition-[box-shadow,border-color] ${
        expanded ? "border-ink-200 shadow-sm" : "border-ink-100 hover:border-ink-200"
      }`}
    >
      {/* Rangée repliée — UN titre, UN surtitre, rien d'autre.
          ── Ce qui n'y est plus, et où c'est parti ──────────────────────────
          `pourquoi`, les pastilles d'état (« Achète », « Bloqué », « N faits »)
          et le bloc des deux impacts vivaient ici : une carte de liste portait
          sept informations, dont deux chiffres à comparer. Tout est descendu
          dans le dépliant, qui est fait pour ça.
          ⚠️ Conséquence assumée : on ne classe plus les leviers, et un levier
          au caveat rédhibitoire ne se distingue plus, sans ouvrir la carte.
          Ne pas « rattraper » ça en réinjectant une pastille chiffrée sans
          relire le commentaire de `LEVIER_COLORS`.

          Uniquement des `<span>` : le contenu d'un `<button>` est du phrasing
          content, un `<div>` ou un `<h*>` y sont invalides. */}
      <button
        type="button"
        onClick={onToggle}
        // ⚠️ `aria-expanded` est OBLIGATOIRE sur une gâchette d'accordéon : sans
        // lui, un lecteur d'écran annonce « bouton » sans dire si la carte est
        // ouverte ou fermée. `aria-controls` la relie à la région déployée.
        aria-expanded={expanded}
        aria-controls={panneauId}
        // `cursor-pointer` explicite : Tailwind v4 a retiré ce reset sur
        // `button`, le curseur restait donc en flèche sur une carte cliquable.
        // Anneau de focus sur la convention du projet (`ring-2 accent-500/20`) :
        // sans lui, la navigation au clavier ne montre plus où elle est.
        className="flex w-full cursor-pointer items-center gap-4 p-5 text-left transition-colors hover:bg-ink-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:ring-inset"
      >
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${colors.bg}`}>
          <Icon className={`size-5 ${colors.text}`} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          {/* La vraie recommandation, en titre de carte : c'est la phrase pour
              laquelle on ouvre cet écran. */}
          <span id={titreId} className={`block ${TITRE_RECOMMANDATION}`}>
            {titre}
          </span>
          {/* Sous-titre : état chiffré + conséquence chiffrée, rédigé par le
              moteur (`pourquoi`). Une analyse antérieure au chiffrage porte
              encore une phrase générique — c'est du texte PERSISTÉ, il ne
              change qu'à la relance de l'analyse. */}
          {reco.pourquoi && (
            <span className="mt-0.5 block text-xs text-ink-400">
              {reco.pourquoi}
            </span>
          )}
        </span>
        {chiffre && (
          <span
            className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 font-mono text-sm font-semibold tabular-nums ${CHIFFRE_TONE[chiffre.tone]}`}
          >
            {chiffre.valeur}
          </span>
        )}
        {/* La rotation PORTE l'information « ouvert / fermé » : elle reste, mais
            `motion-reduce` la coupe pour qui demande moins d'animation — l'état
            est déjà annoncé par `aria-expanded` et lisible au contenu. */}
        <ChevronDown
          className={`size-5 shrink-0 text-ink-400 transition-transform duration-200 motion-reduce:transition-none ${
            expanded ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      {/* Expanded detail — région nommée par le titre de la carte. */}
      {expanded && (
        <div id={panneauId} role="region" aria-labelledby={titreId}>
        <LevierDetail
          reco={reco}
          apt={apt}
          settings={settings}
          seuilsRendement={seuilsRendement}
          cashflowSeuils={cashflowSeuils}
          onOpenRendement={onOpenRendement}
          onOpenCashflow={onOpenCashflow}
        />
        </div>
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
        {/* Plus de pastille de delta ici : elle est REMONTÉE dans la rangée
            repliée (`chiffreCle`). L'afficher aux deux endroits la dupliquerait
            à quinze pixels d'intervalle une fois la carte ouverte. */}
        <GroupHeader
          as="h4"
          title="Ce que ça change"
          subtitle={pivot?.avant ? `${pivot.label} aujourd'hui : ${pivot.avant}` : undefined}
        />

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

        {/* Trésorerie à sortir. Vivait dans la rangée repliée ; elle descend ici
            plutôt que d'être perdue. NEUTRE, jamais en vert : c'est une SORTIE
            (cf. le commentaire de `montantEngage` dans `analyse/types.ts`). Une
            carte qui ne montre que le gain mentirait sur l'arbitrage. */}
        {reco.montantEngage != null && (
          <p className="mb-4 text-sm text-ink-600">
            Trésorerie à engager :{" "}
            <span className="font-mono font-semibold tabular-nums text-ink-900">
              {fmtEuros(reco.montantEngage)}
            </span>
          </p>
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
 * Carte d'état dégradé ou terminal de l'onglet : pas d'analyse, pas de
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
