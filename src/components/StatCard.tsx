import { ArrowRight } from "lucide-react";
import { TONE_TEXT_CLASS, type RendementTone } from "@/lib/analyse/scoring";

export type StatCardTone = RendementTone;

export function StatCard({
  label,
  value,
  avant,
  sub,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  /** When set, renders "avant → value" instead of value alone. */
  avant?: string;
  sub?: string;
  tone: StatCardTone;
  onClick?: () => void;
}) {
  const dotted = onClick
    ? " decoration-dotted decoration-ink-300 decoration-2 underline underline-offset-8"
    : "";

  const inner = (
    <>
      <p className="text-xs font-medium text-ink-500">{label}</p>
      {avant != null ? (
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 font-mono tabular-nums">
          <span className="text-sm text-ink-400">{avant}</span>
          <ArrowRight className="h-3 w-3 shrink-0 self-center text-ink-300" aria-hidden />
          <span className={`text-2xl font-bold ${TONE_TEXT_CLASS[tone]}${dotted}`}>{value}</span>
        </p>
      ) : (
        <p className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${TONE_TEXT_CLASS[tone]}${dotted}`}>
          {value}
        </p>
      )}
    </>
  );

  /* Pied de carte : le sous-titre à gauche, l'affordance « Calcul → » à droite.
     Les deux vivent DANS le flux (et non en `absolute`) — posé en absolu, le
     « Calcul → » se superposait à la valeur sur toute carte sans `sub` (les
     highlights de bloc), la valeur étant alors la dernière ligne de la carte.
     `mt-auto` colle le pied en bas quelle que soit la hauteur des voisines de
     la grille. */
  const footer = (sub || onClick) && (
    <div className="mt-auto flex items-end justify-between gap-2 pt-3">
      {sub ? <p className="text-xs text-ink-400">{sub}</p> : <span aria-hidden />}
      {onClick && (
        <span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[11px] font-medium text-ink-300 transition-colors group-hover:text-ink-500">
          Calcul{" "}
          <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
        </span>
      )}
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title="Voir le détail du calcul"
        className="group flex flex-col rounded-xl border border-ink-200 bg-white p-4 text-left transition-colors hover:border-ink-400"
      >
        {inner}
        {footer}
      </button>
    );
  }

  return (
    <div className="flex flex-col rounded-xl border border-ink-200 bg-white p-4">
      {inner}
      {footer}
    </div>
  );
}
