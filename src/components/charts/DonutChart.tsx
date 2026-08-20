"use client";

import { useEffect, useState } from "react";
import { arc, pie } from "d3-shape";
import { formatEuros } from "@/lib/format";

/**
 * Donut catégoriel générique (part-to-whole, ≤ 4 segments). Pas de labels sur
 * les arcs — à ce nombre de segments la légende (dot + libellé + valeur) est
 * déjà le label direct, un second système sur l'arc serait redondant (voir
 * docs/reference/graphiques-dataviz.md).
 */
export type DonutSegment = {
  key: string;
  label: string;
  value: number;
  color: string;
};

export function DonutChart({
  segments,
  centerValue,
  size = 168,
  thickness = 20,
}: {
  segments: DonutSegment[];
  centerValue: string;
  size?: number;
  thickness?: number;
}) {
  const [entered, setEntered] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const visible = segments.filter((s) => s.value > 0);

  if (total <= 0) {
    return <p className="text-sm text-ink-400">Données insuffisantes pour ce calcul.</p>;
  }

  const radius = size / 2;
  const pieLayout = pie<DonutSegment>()
    .value((d) => d.value)
    .sort(null)
    .padAngle(0.018);
  const arcGen = arc<{ startAngle: number; endAngle: number; padAngle?: number }>()
    .innerRadius(radius - thickness)
    .outerRadius(radius)
    .cornerRadius(3);

  const arcsData = pieLayout(visible);

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-10">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
          <g transform={`translate(${radius}, ${radius})`}>
            {arcsData.map((d, i) => (
              <path
                key={visible[i].key}
                d={arcGen(d) ?? undefined}
                fill={visible[i].color}
                style={{
                  opacity: entered ? (hovered === null || hovered === visible[i].key ? 1 : 0.45) : 0,
                  transform: entered ? "scale(1)" : "scale(0.85)",
                  transformOrigin: "center",
                  transition: `opacity 200ms ease-out, transform 480ms cubic-bezier(0.22,1,0.36,1) ${i * 60}ms`,
                  transitionDelay: entered ? `${i * 60}ms` : "0ms",
                }}
                onPointerEnter={() => setHovered(visible[i].key)}
                onPointerLeave={() => setHovered(null)}
              />
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-2">
          <span className="text-center text-2xl font-bold leading-tight tabular-nums text-ink-900">
            {centerValue}
          </span>
        </div>
      </div>

      <ul className="w-full space-y-2.5">
        {segments.map((s) => (
          <li
            key={s.key}
            className={`flex items-center justify-between gap-3 rounded-md px-2 py-1 transition-colors ${
              hovered === s.key ? "bg-ink-50" : ""
            }`}
            onPointerEnter={() => setHovered(s.key)}
            onPointerLeave={() => setHovered(null)}
          >
            <span className="flex items-center gap-2 text-sm text-ink-600">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
            {/* Ces montants ne sont jamais négatifs — 0 et absence de saisie
                se valent donc ici et se lisent tous deux "-". */}
            <span className="shrink-0 text-sm font-medium tabular-nums text-ink-800">
              {s.value > 0 ? formatEuros(s.value) : "-"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
