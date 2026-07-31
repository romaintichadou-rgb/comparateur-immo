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
        <p className="mt-1.5 flex items-baseline gap-2 font-mono tabular-nums">
          <span className="text-sm text-ink-400">{avant}</span>
          <ArrowRight className="h-3 w-3 shrink-0 self-center text-ink-300" aria-hidden />
          <span className={`text-2xl font-bold ${TONE_TEXT_CLASS[tone]}${dotted}`}>{value}</span>
        </p>
      ) : (
        <p className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${TONE_TEXT_CLASS[tone]}${dotted}`}>
          {value}
        </p>
      )}
      {sub && <p className="mt-3 text-xs text-ink-400">{sub}</p>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title="Voir le détail du calcul"
        className="group relative flex flex-col rounded-xl border border-ink-200 bg-white p-4 text-left transition-colors hover:border-ink-400"
      >
        {inner}
        <span className="absolute bottom-2.5 right-3 flex items-center gap-0.5 text-[11px] font-medium text-ink-300 transition-colors group-hover:text-ink-500">
          Calcul{" "}
          <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col rounded-xl border border-ink-200 bg-white p-4">
      {inner}
    </div>
  );
}
