"use client";

import { useState } from "react";
import { scaleBand, scaleLinear } from "d3-scale";
import { formatEuros } from "@/lib/format";
import { ChartTooltip, TooltipRow, type TooltipState } from "@/components/charts/ChartTooltip";
import { useInView } from "@/components/charts/useInView";

export type StackedBarSeries = { key: string; label: string; color: string };
export type StackedBarPoint = { x: number; values: Record<string, number> };

const GAP = 2; // écart surface entre segments empilés (mark spec)
const RADIUS = 4; // coin arrondi du SEUL segment qui touche le bord libre

/** Rectangle carré partout, sauf les deux coins du haut si `roundTop`. */
function segmentPath(x: number, y: number, w: number, h: number, roundTop: boolean): string {
  if (!roundTop || h <= RADIUS) {
    return `M ${x},${y} h ${w} v ${h} h ${-w} Z`;
  }
  const r = Math.min(RADIUS, w / 2);
  return (
    `M ${x},${y + h} V ${y + r} Q ${x},${y} ${x + r},${y} ` +
    `H ${x + w - r} Q ${x + w},${y} ${x + w},${y + r} ` +
    `V ${y + h} Z`
  );
}

/**
 * Barres empilées sur un axe temporel (années). Coin arrondi UNIQUEMENT sur
 * le segment le plus haut de chaque barre (le seul qui touche un bord libre),
 * carré partout ailleurs, séparés par un écart de 2px — un empilement n'a
 * qu'UNE extrémité "donnée" (voir docs/reference/graphiques-dataviz.md).
 */
export function StackedBarChart({
  data,
  series,
  height = 220,
  xLabel = (x: number) => `A${x}`,
}: {
  data: StackedBarPoint[];
  series: StackedBarSeries[];
  height?: number;
  xLabel?: (x: number) => string;
}) {
  // ⚠️ Ces hooks restent AU-DESSUS du `return` anticipé « données
  // insuffisantes » ci-dessous (`react-hooks/rules-of-hooks`).
  const { ref: viewRef, inView: entered } = useInView<HTMLDivElement>();
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [hoveredX, setHoveredX] = useState<number | null>(null);

  if (data.length === 0) {
    return <p className="text-sm text-ink-400">Données insuffisantes pour ce calcul.</p>;
  }

  const padL = 8;
  const padR = 8;
  const padT = 10;
  const padB = 24;
  const barWidth = 22;
  const bandGap = 10;
  const width = data.length * (barWidth + bandGap) + bandGap;
  const plotBottom = padT + height;

  const maxTotal = Math.max(
    1,
    ...data.map((d) => series.reduce((sum, s) => sum + Math.max(0, d.values[s.key] ?? 0), 0))
  );
  const yScale = scaleLinear().domain([0, maxTotal]).nice().range([height, 0]);
  const xScale = scaleBand<number>()
    .domain(data.map((d) => d.x))
    .range([padL, width - padR])
    .paddingInner(bandGap / (barWidth + bandGap))
    .paddingOuter(0.4);

  const skip = Math.ceil(data.length / 15);
  const yTicks = yScale.ticks(4).filter((t) => t > 0);

  function handleHover(d: StackedBarPoint, cx: number) {
    setHoveredX(d.x);
    setTooltip({
      x: cx,
      y: padT,
      content: (
        <div className="space-y-1">
          <p className="mb-1 font-semibold text-white">Année {d.x}</p>
          {series.map((s) => {
            const v = d.values[s.key] ?? 0;
            return <TooltipRow key={s.key} color={s.color} label={s.label} value={v > 0 ? formatEuros(v) : "-"} />;
          })}
        </div>
      ),
    });
  }

  return (
    <div ref={viewRef} className="relative">
      {tooltip && <ChartTooltip tooltip={tooltip} />}
      <svg
        viewBox={`0 0 ${width} ${plotBottom + padB}`}
        preserveAspectRatio="none"
        width="100%"
        height={plotBottom + padB}
        className="block"
      >
        {yTicks.map((t) => {
          const ty = padT + yScale(t);
          return (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={ty} y2={ty} stroke="var(--color-ink-200)" strokeWidth={1} />
              <text x={padL} y={ty - 3} fontSize={9} fill="var(--color-ink-400)">
                {formatEuros(t)}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const x = xScale(d.x) ?? 0;
          const bw = xScale.bandwidth();

          // Empile du bas vers le haut : dette (index 0) en bas, le dernier
          // en haut. `y` suit le curseur d'empilement en coordonnées absolues.
          let cursor = plotBottom;
          const segs = series.map((s) => {
            const v = Math.max(0, d.values[s.key] ?? 0);
            const segHeight = height - yScale(v);
            const y = cursor - segHeight;
            cursor = y;
            return { key: s.key, y, h: segHeight, color: s.color };
          });
          const topKey = [...segs].reverse().find((s) => s.h > GAP * 2)?.key;

          return (
            <g
              key={d.x}
              className="cursor-default"
              style={{
                opacity: hoveredX === null || hoveredX === d.x ? 1 : 0.55,
                transition: "opacity 150ms ease-out",
              }}
              onPointerEnter={() => handleHover(d, x + bw / 2)}
              onPointerMove={() => handleHover(d, x + bw / 2)}
              onPointerLeave={() => {
                setHoveredX(null);
                setTooltip(null);
              }}
            >
              {/* Zone de survol pleine hauteur : plus facile à cibler que les seuls segments visibles. */}
              <rect x={x} y={padT} width={bw} height={height} fill="transparent" />
              {segs.map(
                (s) =>
                  s.h > GAP * 2 && (
                    <path
                      key={s.key}
                      d={segmentPath(x, s.y + GAP / 2, bw, s.h - GAP, s.key === topKey)}
                      fill={s.color}
                      style={{
                        transformOrigin: `${x + bw / 2}px ${plotBottom}px`,
                        transform: entered ? "scaleY(1)" : "scaleY(0.001)",
                        transition: `transform 520ms cubic-bezier(0.22,1,0.36,1) ${i * 25}ms`,
                      }}
                    />
                  )
              )}
              {(data.length <= 15 || i % skip === 0) && (
                <text x={x + bw / 2} y={plotBottom + 16} textAnchor="middle" fontSize={10} fill="var(--color-ink-400)">
                  {xLabel(d.x)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-500">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
