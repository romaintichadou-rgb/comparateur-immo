"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { ApartmentWithComputed } from "@/lib/types";
import { isImmeuble } from "@/lib/types";
import type { AppSettings } from "@/lib/settings";
import { computeDerived } from "@/lib/calculations";
import { estimateFraisNotaire, lotsEffectifs } from "@/lib/estimates";
import { resolveInputs, simulate } from "@/lib/simulation";
import {
  referenceCCMeuble,
  typologieAnil,
  type ReferenceCC,
} from "@/lib/anilReference";
import type { LoyerReference } from "@/lib/analyse/sources/loyers";
import {
  cashflowSeuilsFromSettings,
  cashflowTone,
  rendementNetTone,
  seuilsRendementFromSettings,
  TONE_PANEL_STYLES,
  type CashflowSeuils,
  type RendementSeuils,
  type RendementTone,
} from "@/lib/analyse/scoring";
import { formatEuros, formatPercent } from "@/lib/format";
import { TabHeader } from "@/components/SectionHeader";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Facteur = "prix" | "loyer";
interface DataPoint { x: number; yRendement: number | null; yCashflow: number | null }

interface ThresholdChartProps {
  data: DataPoint[];
  currentX: number;
  getY: (d: DataPoint) => number | null;
  thresholds: { vert: number; rouge: number };
  formatX: (v: number) => string;
  formatY: (v: number) => string;
  title: string;
  yUnit: string;
  hoveredIndex: number | null;
  onHover: (index: number | null) => void;
  invertColors?: boolean;
  ghostPoint?: { x: number; y: number | null };
  anilMarkers?: { min: number; max: number };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roundTo(v: number, step: number) {
  return Math.round(v / step) * step;
}

function formatK(v: number): string {
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)}k`;
  return `${Math.round(v)}`;
}

function formatEurosShort(v: number): string {
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)}k €`;
  return `${Math.round(v)} €`;
}

function formatCashflow(v: number): string {
  const sign = v >= 0 ? "+" : "−";
  return `${sign} ${Math.round(Math.abs(v))} €`;
}

function toneForRendement(v: number | null, seuils: RendementSeuils): RendementTone {
  return rendementNetTone(v, seuils);
}

function toneForCashflow(v: number | null, seuils: CashflowSeuils): RendementTone {
  return cashflowTone(v, seuils);
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

// ---------------------------------------------------------------------------
// Data generation
// ---------------------------------------------------------------------------

function generatePriceRange(prix: number): number[] {
  const lo = roundTo(prix * 0.7, 5000);
  const hi = roundTo(prix * 1.3, 5000);
  const step = 5000;
  const pts: number[] = [];
  for (let x = lo; x <= hi; x += step) pts.push(x);
  if (!pts.includes(prix)) {
    pts.push(prix);
    pts.sort((a, b) => a - b);
  }
  return pts;
}

function generateLoyerRange(min: number, max: number, loyer: number): number[] {
  const lo = roundTo(min, 10);
  const hi = roundTo(max, 10);
  const step = Math.max(10, roundTo((hi - lo) / 40, 10) || 10);
  const pts: number[] = [];
  for (let x = lo; x <= hi; x += step) pts.push(x);
  if (pts.length > 0 && pts[pts.length - 1] < hi) pts.push(hi);
  if (!pts.includes(loyer)) {
    pts.push(loyer);
    pts.sort((a, b) => a - b);
  }
  if (pts.length < 10) {
    const fineStep = Math.max(5, roundTo((hi - lo) / 20, 5) || 5);
    pts.length = 0;
    for (let x = lo; x <= hi; x += fineStep) pts.push(x);
    if (!pts.includes(loyer)) {
      pts.push(loyer);
      pts.sort((a, b) => a - b);
    }
  }
  return pts;
}

function computeDataPoints(
  apt: ApartmentWithComputed,
  settings: AppSettings,
  facteur: Facteur,
  xValues: number[],
): DataPoint[] {
  const inputs = resolveInputs(apt.simulation_inputs, settings);
  return xValues.map((x) => {
    const modified = { ...apt } as ApartmentWithComputed;
    if (facteur === "prix") {
      modified.prix = x;
      modified.frais_notaire_estimes = estimateFraisNotaire(x, apt.etat_bien ?? "ancien") ?? 0;
    } else {
      modified.loyer_retenu = x;
    }
    const derived = computeDerived(modified);
    const simResult = simulate(derived, inputs);
    return {
      x,
      yRendement: derived.rendement_net,
      yCashflow: simResult?.cashflowMensuelMoyenLMNP ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Threshold crossing
// ---------------------------------------------------------------------------

function findCrossing(
  data: DataPoint[],
  getY: (d: DataPoint) => number | null,
  threshold: number,
  direction: "above" | "below",
): number | null {
  for (let i = 1; i < data.length; i++) {
    const prev = getY(data[i - 1]);
    const curr = getY(data[i]);
    if (prev == null || curr == null) continue;
    if (direction === "above" && prev < threshold && curr >= threshold) {
      const t = (threshold - prev) / (curr - prev);
      return data[i - 1].x + t * (data[i].x - data[i - 1].x);
    }
    if (direction === "below" && prev > threshold && curr <= threshold) {
      const t = (threshold - prev) / (curr - prev);
      return data[i - 1].x + t * (data[i].x - data[i - 1].x);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// DVF extraction from analyse_ia
// ---------------------------------------------------------------------------

function extractDvfMedian(apt: ApartmentWithComputed): number | null {
  const faits = apt.analyse_ia?.blocs?.prix?.faits;
  if (!faits) return null;
  const fait = faits.find((f) => f.label === "Prix/m² médian comparable");
  if (fait?.value == null) return null;
  const n = Number(fait.value);
  return Number.isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Interpolate Y at a given X from data
// ---------------------------------------------------------------------------

function interpolateY(data: DataPoint[], getY: (d: DataPoint) => number | null, targetX: number): number | null {
  if (data.length === 0) return null;
  if (targetX <= data[0].x) return getY(data[0]);
  if (targetX >= data[data.length - 1].x) return getY(data[data.length - 1]);
  for (let i = 1; i < data.length; i++) {
    if (data[i].x >= targetX) {
      const prev = getY(data[i - 1]);
      const curr = getY(data[i]);
      if (prev == null || curr == null) return curr ?? prev;
      const t = (targetX - data[i - 1].x) / (data[i].x - data[i - 1].x);
      return prev + t * (curr - prev);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// SVG ThresholdChart
// ---------------------------------------------------------------------------

const CHART_W = 380;
const CHART_H = 200;
const PAD = { top: 10, right: 12, bottom: 32, left: 44 };
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;

const ZONE_LABELS: Record<string, { text: string; color: string }> = {
  vert: { text: "Vert", color: "#059669" },
  ambre: { text: "Ambre", color: "#d97706" },
  rouge: { text: "Rouge", color: "#dc2626" },
};

function ThresholdChart({
  data,
  currentX,
  getY,
  thresholds,
  formatX,
  formatY,
  title,
  hoveredIndex,
  onHover,
  invertColors,
  ghostPoint,
  anilMarkers,
}: ThresholdChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const reducedMotion = useReducedMotion();

  const yValues = data.map(getY).filter((v): v is number => v != null);
  if (yValues.length === 0) return null;

  const yMin = Math.min(...yValues, thresholds.rouge) - Math.abs(Math.min(...yValues, thresholds.rouge)) * 0.15;
  const yMax = Math.max(...yValues, thresholds.vert) + Math.abs(Math.max(...yValues, thresholds.vert)) * 0.15;
  const xMin = data[0].x;
  const xMax = data[data.length - 1].x;

  const scaleX = (v: number) => PAD.left + ((v - xMin) / (xMax - xMin || 1)) * PLOT_W;
  const scaleY = (v: number) => PAD.top + PLOT_H - ((v - yMin) / (yMax - yMin || 1)) * PLOT_H;

  const seuilVertY = scaleY(thresholds.vert);
  const seuilRougeY = scaleY(thresholds.rouge);

  const validPoints = data
    .map((d, i) => ({ x: d.x, y: getY(d), i }))
    .filter((p): p is { x: number; y: number; i: number } => p.y != null);

  const pathD = validPoints
    .map((p, idx) => `${idx === 0 ? "M" : "L"}${scaleX(p.x).toFixed(1)},${scaleY(p.y).toFixed(1)}`)
    .join(" ");

  const fillD =
    validPoints.length > 1
      ? pathD +
        ` L${scaleX(validPoints[validPoints.length - 1].x).toFixed(1)},${(PAD.top + PLOT_H).toFixed(1)}` +
        ` L${scaleX(validPoints[0].x).toFixed(1)},${(PAD.top + PLOT_H).toFixed(1)} Z`
      : "";

  const currentIdx = data.findIndex((d) => d.x === currentX);
  const currentY = currentIdx >= 0 ? getY(data[currentIdx]) : null;

  const hoverY = hoveredIndex != null && hoveredIndex < data.length ? getY(data[hoveredIndex]) : null;
  const hoverX = hoveredIndex != null && hoveredIndex < data.length ? data[hoveredIndex].x : null;

  const yTicks = [thresholds.vert, thresholds.rouge];
  const yRange = yMax - yMin;
  const topTick = yMin + yRange * 0.95;
  const bottomTick = yMin + yRange * 0.05;
  if (topTick > thresholds.vert + yRange * 0.08) yTicks.push(roundTo(topTick, thresholds.vert > 1 ? 50 : 0.005));
  if (bottomTick < thresholds.rouge - yRange * 0.08) yTicks.push(roundTo(bottomTick, thresholds.vert > 1 ? 50 : 0.005));

  const xTicks: number[] = [];
  const xStep = (xMax - xMin) / 4;
  for (let i = 0; i <= 4; i++) xTicks.push(roundTo(xMin + xStep * i, data[0].x > 1000 ? 5000 : 10));

  const uid = title.replace(/\s/g, "");

  // Gradient colors: for prix (higher X = higher price = worse), green→red (default)
  // For loyer (higher X = higher rent = better), red→green (invertColors)
  const gradLeft = invertColors ? "#dc2626" : "#059669";
  const gradMid = "#d97706";
  const gradRight = invertColors ? "#059669" : "#dc2626";
  const fillLeft = invertColors ? "#dc2626" : "#059669";
  const fillRight = invertColors ? "#059669" : "#dc2626";

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * CHART_W;
      const dataX = xMin + ((mouseX - PAD.left) / PLOT_W) * (xMax - xMin);
      let closest = 0;
      let minDist = Infinity;
      for (let i = 0; i < data.length; i++) {
        const dist = Math.abs(data[i].x - dataX);
        if (dist < minDist) { minDist = dist; closest = i; }
      }
      onHover(closest);
    },
    [data, xMin, xMax, onHover],
  );

  const ariaLabel = `${title} : ${validPoints.length > 0 ? formatY(validPoints[0].y) : "—"} à ${validPoints.length > 0 ? formatY(validPoints[validPoints.length - 1].y) : "—"} pour ${formatX(xMin)} à ${formatX(xMax)}. Valeur actuelle ${formatX(currentX)} : ${currentY != null ? formatY(currentY) : "—"}. Seuil vert : ${formatY(thresholds.vert)}, seuil rouge : ${formatY(thresholds.rouge)}.`;

  const zoneVertMidY = PAD.top + Math.max(0, seuilVertY - PAD.top) / 2;
  const zoneAmbreMidY = seuilVertY + Math.max(0, seuilRougeY - seuilVertY) / 2;
  const zoneRougeMidY = seuilRougeY + Math.max(0, PAD.top + PLOT_H - seuilRougeY) / 2;
  const zoneVertH = seuilVertY - PAD.top;
  const zoneAmbreH = seuilRougeY - seuilVertY;
  const zoneRougeH = PAD.top + PLOT_H - seuilRougeY;

  return (
    <div>
      <h4 className="mb-2 font-display text-sm font-semibold text-ink-900">{title}</h4>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full cursor-crosshair"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={ariaLabel}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => onHover(null)}
        onTouchMove={(e) => {
          const touch = e.touches[0];
          if (!touch || !svgRef.current) return;
          const rect = svgRef.current.getBoundingClientRect();
          const mouseX = ((touch.clientX - rect.left) / rect.width) * CHART_W;
          const dataX = xMin + ((mouseX - PAD.left) / PLOT_W) * (xMax - xMin);
          let closest = 0;
          let minDist = Infinity;
          for (let i = 0; i < data.length; i++) {
            const dist = Math.abs(data[i].x - dataX);
            if (dist < minDist) { minDist = dist; closest = i; }
          }
          onHover(closest);
        }}
      >
        <defs>
          <linearGradient id={`zg-${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#d1fae5" stopOpacity=".12" />
            <stop offset="100%" stopColor="#d1fae5" stopOpacity=".35" />
          </linearGradient>
          <linearGradient id={`za-${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#fef3c7" stopOpacity=".3" />
            <stop offset="100%" stopColor="#fef3c7" stopOpacity=".12" />
          </linearGradient>
          <linearGradient id={`zr-${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#fecaca" stopOpacity=".35" />
            <stop offset="100%" stopColor="#fecaca" stopOpacity=".12" />
          </linearGradient>
          <linearGradient id={`fill-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={fillLeft} stopOpacity=".06" />
            <stop offset="50%" stopColor="#d97706" stopOpacity=".04" />
            <stop offset="100%" stopColor={fillRight} stopOpacity=".06" />
          </linearGradient>
          <linearGradient id={`stroke-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={gradLeft} />
            <stop offset="50%" stopColor={gradMid} />
            <stop offset="100%" stopColor={gradRight} />
          </linearGradient>
        </defs>

        <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={Math.max(0, seuilVertY - PAD.top)} fill={`url(#zg-${uid})`} />
        <rect x={PAD.left} y={seuilVertY} width={PLOT_W} height={Math.max(0, seuilRougeY - seuilVertY)} fill={`url(#za-${uid})`} />
        <rect x={PAD.left} y={seuilRougeY} width={PLOT_W} height={Math.max(0, PAD.top + PLOT_H - seuilRougeY)} fill={`url(#zr-${uid})`} />

        {zoneVertH > 16 && <text x={PAD.left + 4} y={zoneVertMidY + 3} fontSize="7" fill={ZONE_LABELS.vert.color} opacity=".5" fontWeight="600">{ZONE_LABELS.vert.text}</text>}
        {zoneAmbreH > 16 && <text x={PAD.left + 4} y={zoneAmbreMidY + 3} fontSize="7" fill={ZONE_LABELS.ambre.color} opacity=".5" fontWeight="600">{ZONE_LABELS.ambre.text}</text>}
        {zoneRougeH > 16 && <text x={PAD.left + 4} y={zoneRougeMidY + 3} fontSize="7" fill={ZONE_LABELS.rouge.color} opacity=".5" fontWeight="600">{ZONE_LABELS.rouge.text}</text>}

        {yTicks.map((v) => (
          <line key={`grid-${v}`} x1={PAD.left} y1={scaleY(v)} x2={PAD.left + PLOT_W} y2={scaleY(v)} stroke="#ddd8ea" strokeWidth=".5" opacity=".3" />
        ))}

        <line x1={PAD.left} y1={seuilVertY} x2={PAD.left + PLOT_W} y2={seuilVertY} stroke="#059669" strokeWidth="1" strokeDasharray="5 3" opacity=".5" />
        <line x1={PAD.left} y1={seuilRougeY} x2={PAD.left + PLOT_W} y2={seuilRougeY} stroke="#dc2626" strokeWidth="1" strokeDasharray="5 3" opacity=".5" />

        {anilMarkers && (
          <>
            <rect x={scaleX(anilMarkers.min)} y={PAD.top + PLOT_H} width={scaleX(anilMarkers.max) - scaleX(anilMarkers.min)} height="4" fill="#3d3580" opacity=".1" rx="1" />
            <line x1={scaleX(anilMarkers.min)} y1={PAD.top + PLOT_H - 4} x2={scaleX(anilMarkers.min)} y2={PAD.top + PLOT_H + 4} stroke="#3d3580" strokeWidth="1" opacity=".3" />
            <line x1={scaleX(anilMarkers.max)} y1={PAD.top + PLOT_H - 4} x2={scaleX(anilMarkers.max)} y2={PAD.top + PLOT_H + 4} stroke="#3d3580" strokeWidth="1" opacity=".3" />
            <text x={(scaleX(anilMarkers.min) + scaleX(anilMarkers.max)) / 2} y={PAD.top + PLOT_H + 24} textAnchor="middle" fontSize="6.5" fill="#3d3580" opacity=".5" fontFamily="sans-serif">Encadrement loyers</text>
          </>
        )}

        {fillD && <path d={fillD} fill={`url(#fill-${uid})`} />}
        {pathD && <path d={pathD} fill="none" stroke={`url(#stroke-${uid})`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

        {ghostPoint && ghostPoint.y != null && (
          <>
            <line x1={scaleX(ghostPoint.x)} y1={PAD.top} x2={scaleX(ghostPoint.x)} y2={PAD.top + PLOT_H} stroke="#3d3580" strokeWidth=".8" strokeDasharray="2 3" opacity=".25" />
            <circle cx={scaleX(ghostPoint.x)} cy={scaleY(ghostPoint.y)} r="4.5" fill="none" stroke="#3d3580" strokeWidth="1.5" strokeDasharray="2 2" opacity=".5" />
          </>
        )}

        {hoveredIndex != null && hoverX != null && hoverY != null && hoveredIndex !== currentIdx && (
          <>
            <line x1={scaleX(hoverX)} y1={PAD.top} x2={scaleX(hoverX)} y2={PAD.top + PLOT_H} stroke="#c4b9ec" strokeWidth="1" strokeDasharray="3 3" opacity=".6" />
            <circle cx={scaleX(hoverX)} cy={scaleY(hoverY)} r="3.5" fill="#b3a9e8" stroke="white" strokeWidth="1.5" />
            {(() => {
              const cx = Math.max(36, Math.min(CHART_W - 36, scaleX(hoverX)));
              const label = formatY(hoverY);
              const labelW = Math.max(48, label.length * 5.5 + 16);
              return (
                <>
                  <rect x={cx - labelW / 2} y={scaleY(hoverY) - 22} width={labelW} height="18" rx="4" fill="white" stroke="#e3deed" strokeWidth=".8" />
                  <text x={cx} y={scaleY(hoverY) - 10} textAnchor="middle" fontSize="8" fontWeight="600" fill="#332e3a" fontFamily="'Geist Mono', monospace">
                    {label}
                  </text>
                </>
              );
            })()}
          </>
        )}

        {currentIdx >= 0 && currentY != null && (
          <>
            <line x1={scaleX(currentX)} y1={PAD.top} x2={scaleX(currentX)} y2={PAD.top + PLOT_H} stroke="#c4b9ec" strokeWidth="1" strokeDasharray="3 3" opacity=".3" />
            <circle cx={scaleX(currentX)} cy={scaleY(currentY)} r="5" fill="#3d3580" />
            {!reducedMotion && (
              <circle cx={scaleX(currentX)} cy={scaleY(currentY)} r="9" fill="none" stroke="#3d3580" strokeWidth="1.2" opacity=".3">
                <animate attributeName="r" values="7;11;7" dur="2.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" values=".3;.1;.3" dur="2.5s" repeatCount="indefinite" />
              </circle>
            )}
            {(() => {
              const sx = scaleX(currentX);
              const label = formatY(currentY);
              const labelW = Math.max(48, label.length * 5.5 + 16);
              const flipLeft = sx + labelW + 8 > CHART_W;
              const rx = flipLeft ? sx - labelW - 8 : sx + 8;
              return (
                <>
                  <rect x={rx} y={scaleY(currentY) - 10} width={labelW} height="18" rx="4" fill="#3d3580" />
                  <text x={rx + labelW / 2} y={scaleY(currentY) + 2} textAnchor="middle" fill="white" fontSize="8" fontWeight="600" fontFamily="'Geist Mono', monospace">
                    {label}
                  </text>
                </>
              );
            })()}
          </>
        )}

        {yTicks.map((v) => {
          const isVert = v === thresholds.vert;
          const isRouge = v === thresholds.rouge;
          return (
            <text key={v} x={PAD.left - 4} y={scaleY(v) + 3} textAnchor="end" fontSize="8"
              fill={isVert ? "#059669" : isRouge ? "#dc2626" : "#8b8393"}
              fontWeight={isVert || isRouge ? "600" : "400"}
              fontFamily="'Geist Mono', monospace"
            >{formatY(v)}</text>
          );
        })}

        {xTicks.map((v) => (
          <text key={v} x={scaleX(v)} y={PAD.top + PLOT_H + 14} textAnchor="middle" fontSize="8"
            fill={v === currentX ? "#3d3580" : "#8b8393"}
            fontWeight={v === currentX ? "600" : "400"}
            fontFamily="'Geist Mono', monospace"
          >{formatX(v)}</text>
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ComboSimulator
// ---------------------------------------------------------------------------

const SLIDER_THUMB = "[&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-accent-600 [&::-webkit-slider-thumb]:shadow-md";

function ComboSimulator({
  apt,
  settings,
  seuilsRendement,
  cashflowSeuils,
  loyerRange,
  seuilVertPrix,
  comboPrix,
  comboLoyer,
  onComboPrixChange,
  onComboLoyerChange,
  dvfMedianM2,
}: {
  apt: ApartmentWithComputed;
  settings: AppSettings;
  seuilsRendement: RendementSeuils;
  cashflowSeuils: CashflowSeuils;
  loyerRange: [number, number] | null;
  seuilVertPrix: number | null;
  comboPrix: number;
  comboLoyer: number;
  onComboPrixChange: (v: number) => void;
  onComboLoyerChange: (v: number) => void;
  dvfMedianM2: number | null;
}) {
  const comboResult = useMemo(() => {
    const modified = { ...apt } as ApartmentWithComputed;
    modified.prix = comboPrix;
    modified.frais_notaire_estimes = estimateFraisNotaire(comboPrix, apt.etat_bien ?? "ancien") ?? 0;
    modified.loyer_retenu = comboLoyer;
    const derived = computeDerived(modified);
    const inputs = resolveInputs(apt.simulation_inputs, settings);
    const sim = simulate(derived, inputs);
    return {
      rendement: derived.rendement_net,
      cashflow: sim?.cashflowMensuelMoyenLMNP ?? null,
    };
  }, [apt, comboPrix, comboLoyer, settings]);

  const rdtTone = toneForRendement(comboResult.rendement, seuilsRendement);
  const cfTone = toneForCashflow(comboResult.cashflow, cashflowSeuils);

  const ecartPrix = comboPrix - (apt.prix ?? 0);
  const ecartLoyer = comboLoyer - (apt.loyer_retenu ?? 0);
  const hasEcart = ecartPrix !== 0 || ecartLoyer !== 0;

  const prixMin = roundTo((apt.prix ?? 0) * 0.7, 5000);
  const prixMax = roundTo((apt.prix ?? 0) * 1.3, 5000);
  const loyerMin = loyerRange?.[0] ?? 0;
  const loyerMax = loyerRange?.[1] ?? (apt.loyer_retenu ?? 0) * 1.5;

  const resetCombo = () => {
    onComboPrixChange(apt.prix ?? 0);
    onComboLoyerChange(apt.loyer_retenu ?? 0);
  };

  const surface = apt.surface_m2 ?? 0;
  const dvfPrix = dvfMedianM2 != null && surface > 0 ? Math.round(dvfMedianM2 * surface) : null;

  const prixPct = prixMax > prixMin ? ((comboPrix - prixMin) / (prixMax - prixMin)) * 100 : 0;
  const loyerPct = loyerMax > loyerMin ? ((comboLoyer - loyerMin) / (loyerMax - loyerMin)) * 100 : 0;

  return (
    <div className="rounded-xl border border-ink-100 bg-white">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_280px]">
        {/* Left column: title + stacked sliders */}
        <div className="space-y-6 p-5 sm:p-6">
          {/* Title row + scenario pills */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
            <h4 className="mr-auto font-display text-base font-semibold text-ink-900">
              Combinez les leviers
            </h4>
            {seuilVertPrix != null && Math.abs(comboPrix - Math.round(seuilVertPrix)) > 1000 && (
              <button
                onClick={() => onComboPrixChange(roundTo(seuilVertPrix, 1000))}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
              >
                Seuil vert · {formatEurosShort(roundTo(seuilVertPrix, 1000))}
              </button>
            )}
            {(apt.prix ?? 0) > 0 && Math.abs(ecartPrix + (apt.prix ?? 0) * 0.1) > 1000 && (
              <button
                onClick={() => onComboPrixChange(roundTo((apt.prix ?? 0) * 0.9, 1000))}
                className="rounded-full border border-ink-200 px-2.5 py-0.5 text-[11px] font-medium text-ink-500 hover:bg-ink-50"
              >
                −10 %
              </button>
            )}
            {(apt.prix ?? 0) > 0 && Math.abs(ecartPrix + (apt.prix ?? 0) * 0.2) > 1000 && (
              <button
                onClick={() => onComboPrixChange(roundTo((apt.prix ?? 0) * 0.8, 1000))}
                className="rounded-full border border-ink-200 px-2.5 py-0.5 text-[11px] font-medium text-ink-500 hover:bg-ink-50"
              >
                −20 %
              </button>
            )}
            {dvfPrix != null && Math.abs(comboPrix - dvfPrix) > 5000 && (
              <button
                onClick={() => onComboPrixChange(roundTo(dvfPrix, 1000))}
                className="rounded-full border border-ink-200 px-2.5 py-0.5 text-[11px] font-medium text-ink-500 hover:bg-ink-50"
              >
                DVF médian
              </button>
            )}
            {hasEcart && (
              <button
                onClick={resetCombo}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-ink-400 hover:bg-ink-50 hover:text-ink-600"
                aria-label="Réinitialiser"
              >
                <RotateCcw className="size-3" />
              </button>
            )}
          </div>

          {/* Prix d'achat slider */}
          <div>
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-ink-700">Prix d&apos;achat</span>
              <div className="flex items-center gap-0.5 rounded-lg border border-ink-200 bg-ink-50/50 px-1">
                <button
                  onClick={() => onComboPrixChange(Math.max(prixMin, comboPrix - 5000))}
                  className="px-1.5 py-1 text-sm text-ink-400 hover:text-ink-700"
                >&minus;</button>
                <span className="min-w-[80px] text-center font-mono text-sm font-semibold tabular-nums text-ink-900">
                  {formatEuros(comboPrix)}
                </span>
                <button
                  onClick={() => onComboPrixChange(Math.min(prixMax, comboPrix + 5000))}
                  className="px-1.5 py-1 text-sm text-ink-400 hover:text-ink-700"
                >+</button>
                <span className="pr-1 text-xs text-ink-400">€</span>
              </div>
            </div>
            <div className="relative">
              <div className="pointer-events-none absolute top-1/2 h-1.5 w-full -translate-y-1/2 overflow-hidden rounded-full bg-ink-100">
                <div
                  className="h-full rounded-full bg-accent-500 transition-[width] duration-75"
                  style={{ width: `${prixPct}%` }}
                />
              </div>
              <input
                type="range"
                min={prixMin}
                max={prixMax}
                step={1000}
                value={comboPrix}
                onChange={(e) => onComboPrixChange(Number(e.target.value))}
                className={`relative z-10 h-6 w-full cursor-pointer appearance-none bg-transparent ${SLIDER_THUMB}`}
              />
            </div>
            <div className="mt-0.5 flex justify-between text-[11px] text-ink-400">
              <span>{formatEurosShort(prixMin)}</span>
              <span>{formatEurosShort(prixMax)}</span>
            </div>
          </div>

          {/* Loyer mensuel slider */}
          <div>
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-ink-700">Loyer mensuel</span>
              <div className="flex items-center gap-0.5 rounded-lg border border-ink-200 bg-ink-50/50 px-1">
                <button
                  onClick={() => onComboLoyerChange(Math.max(loyerMin, comboLoyer - 10))}
                  className="px-1.5 py-1 text-sm text-ink-400 hover:text-ink-700"
                >&minus;</button>
                <span className="min-w-[64px] text-center font-mono text-sm font-semibold tabular-nums text-ink-900">
                  {formatEuros(comboLoyer)}
                </span>
                <button
                  onClick={() => onComboLoyerChange(Math.min(loyerMax, comboLoyer + 10))}
                  className="px-1.5 py-1 text-sm text-ink-400 hover:text-ink-700"
                >+</button>
                <span className="pr-1 text-xs text-ink-400">€</span>
              </div>
            </div>
            <div className="relative">
              <div className="pointer-events-none absolute top-1/2 h-1.5 w-full -translate-y-1/2 overflow-hidden rounded-full bg-ink-100">
                <div
                  className="h-full rounded-full bg-accent-500 transition-[width] duration-75"
                  style={{ width: `${loyerPct}%` }}
                />
              </div>
              <input
                type="range"
                min={loyerMin}
                max={loyerMax}
                step={5}
                value={comboLoyer}
                onChange={(e) => onComboLoyerChange(Number(e.target.value))}
                className={`relative z-10 h-6 w-full cursor-pointer appearance-none bg-transparent ${SLIDER_THUMB}`}
              />
            </div>
            <div className="mt-0.5 flex justify-between text-[11px] text-ink-400">
              <span>{formatEuros(loyerMin)}</span>
              <span>{formatEuros(loyerMax)}</span>
            </div>
          </div>
        </div>

        {/* Right column: results card */}
        <div className="flex flex-col border-t border-ink-100/50 sm:border-l sm:border-t-0">
          {/* Hero rendement */}
          <div className={`flex flex-1 flex-col items-center justify-center px-5 py-6 ${TONE_PANEL_STYLES[rdtTone].wrap} sm:rounded-tr-xl`}>
            <p className={`mb-1 text-xs font-medium ${TONE_PANEL_STYLES[rdtTone].label}`}>Rendement net simulé</p>
            <p className={`font-mono text-3xl font-bold tabular-nums ${TONE_PANEL_STYLES[rdtTone].value}`}>
              {comboResult.rendement != null ? formatPercent(comboResult.rendement) : "—"}
            </p>
          </div>

          {/* Detail rows */}
          <div className="divide-y divide-ink-100/50 px-5 text-sm">
            <div className="flex items-center justify-between py-2.5">
              <span className="text-ink-500">Cash-flow mensuel</span>
              <span className={`font-mono font-semibold tabular-nums ${TONE_PANEL_STYLES[cfTone].value}`}>
                {comboResult.cashflow != null ? formatCashflow(comboResult.cashflow) : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-ink-500">Δ prix d&apos;achat</span>
              <span className="font-mono text-xs tabular-nums text-ink-600">
                {ecartPrix !== 0
                  ? `${ecartPrix > 0 ? "+" : ""}${formatEuros(ecartPrix)}${apt.prix ? ` (${ecartPrix > 0 ? "+" : ""}${Math.round((ecartPrix / apt.prix) * 100)} %)` : ""}`
                  : "—"
                }
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PlaygroundView({
  apartment,
  settings,
}: {
  apartment: ApartmentWithComputed;
  settings: AppSettings;
}) {
  const [facteur, setFacteur] = useState<Facteur>("prix");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [refCC, setRefCC] = useState<ReferenceCC | null>(null);
  const [anilLoading, setAnilLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const [comboPrix, setComboPrix] = useState(apartment.prix ?? 0);
  const [comboLoyer, setComboLoyer] = useState(apartment.loyer_retenu ?? 0);

  useEffect(() => { setComboPrix(apartment.prix ?? 0); }, [apartment.prix]);
  useEffect(() => { setComboLoyer(apartment.loyer_retenu ?? 0); }, [apartment.loyer_retenu]);

  const apt = apartment;
  const seuilsRendement = seuilsRendementFromSettings(settings);
  const cashflowSeuils = cashflowSeuilsFromSettings(settings);
  const immeuble = isImmeuble(apt.type_bien);
  const surface = apt.surface_m2 ?? 0;
  const hasSurface = surface > 0;
  const hasLoyer = apt.loyer_retenu != null && apt.loyer_retenu > 0;
  const hasPrix = apt.prix != null && apt.prix > 0;

  useEffect(() => {
    if (!apt.code_insee || !hasSurface) { setRefCC(null); return; }
    setAnilLoading(true);
    const typo = typologieAnil(apt.type_bien, apt.nb_pieces, immeuble, apt.surface_m2);
    let cancelled = false;
    fetch(`/api/loyer-reference?code_insee=${encodeURIComponent(apt.code_insee)}&typologie=${typo}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const ref: LoyerReference | null = data.ref ?? null;
        if (ref) {
          const surfaceLogement = immeuble
            ? surface / lotsEffectifs(apt.nb_lots, surface)
            : surface;
          setRefCC(referenceCCMeuble(ref, surfaceLogement, typo));
        } else {
          setRefCC(null);
        }
        setAnilLoading(false);
      })
      .catch(() => { if (!cancelled) { setRefCC(null); setAnilLoading(false); } });
    return () => { cancelled = true; };
  }, [apt.code_insee, apt.type_bien, apt.nb_pieces, apt.surface_m2, apt.nb_lots, immeuble, surface, hasSurface]);

  const loyerRange: [number, number] | null = useMemo(() => {
    if (!refCC || !hasSurface) return null;
    const min = Math.round(refCC.minM2 * surface);
    const max = Math.round(refCC.maxM2 * surface);
    return min < max ? [min, max] : null;
  }, [refCC, surface, hasSurface]);

  const hasLoyerFactor = loyerRange != null && hasLoyer;

  const xValues = useMemo(() => {
    if (facteur === "prix" && hasPrix) return generatePriceRange(apt.prix!);
    if (facteur === "loyer" && loyerRange && hasLoyer) return generateLoyerRange(loyerRange[0], loyerRange[1], apt.loyer_retenu!);
    return [];
  }, [facteur, apt.prix, apt.loyer_retenu, loyerRange, hasPrix, hasLoyer]);

  const dataPoints = useMemo(
    () => xValues.length > 0 ? computeDataPoints(apt, settings, facteur, xValues) : [],
    [apt, settings, facteur, xValues],
  );

  const currentX = facteur === "prix" ? (apt.prix ?? 0) : (apt.loyer_retenu ?? 0);

  const comboHasEcart = comboPrix !== (apt.prix ?? 0) || comboLoyer !== (apt.loyer_retenu ?? 0);
  const ghostRendement = useMemo(() => {
    if (!comboHasEcart || dataPoints.length === 0) return undefined;
    const comboX = facteur === "prix" ? comboPrix : comboLoyer;
    const y = interpolateY(dataPoints, (d) => d.yRendement, comboX);
    return { x: comboX, y };
  }, [facteur, comboPrix, comboLoyer, comboHasEcart, dataPoints]);

  const ghostCashflow = useMemo(() => {
    if (!comboHasEcart || dataPoints.length === 0) return undefined;
    const comboX = facteur === "prix" ? comboPrix : comboLoyer;
    const y = interpolateY(dataPoints, (d) => d.yCashflow, comboX);
    return { x: comboX, y };
  }, [facteur, comboPrix, comboLoyer, comboHasEcart, dataPoints]);

  const anilMarkers = useMemo(() => {
    if (facteur !== "loyer" || !loyerRange) return undefined;
    return { min: loyerRange[0], max: loyerRange[1] };
  }, [facteur, loyerRange]);

  const dvfMedianM2 = useMemo(() => extractDvfMedian(apt), [apt]);

  const seuilVertPrixRdt = useMemo(() => {
    if (facteur !== "prix" || dataPoints.length === 0) return null;
    return findCrossing(dataPoints, (d) => d.yRendement, seuilsRendement.modeste, "above");
  }, [dataPoints, facteur, seuilsRendement.modeste]);

  const formatXFn = useCallback(
    (v: number) => facteur === "prix" ? formatK(v) : `${Math.round(v)} €`,
    [facteur],
  );

  const isLoyerMode = facteur === "loyer";

  const getRendement = useCallback((d: DataPoint) => d.yRendement, []);
  const getCashflow = useCallback((d: DataPoint) => d.yCashflow, []);

  const switchFacteur = useCallback((f: Facteur) => {
    if (f === facteur) return;
    setTransitioning(true);
    setHoveredIndex(null);
    setTimeout(() => {
      setFacteur(f);
      setTimeout(() => setTransitioning(false), 20);
    }, 150);
  }, [facteur]);

  if (!hasPrix) {
    return (
      <div className="space-y-5">
        <TabHeader title="Playground" subtitle="Visualisez à quel prix ou loyer votre investissement s'améliore" />
        <div className="rounded-xl border border-ink-100 bg-white p-8 text-center text-sm text-ink-500">
          Ajoutez un prix d&apos;achat pour utiliser le Playground.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <TabHeader
        title="Playground"
        subtitle="Visualisez à quel prix ou loyer votre investissement s'améliore"
      />

      {/* Combo simulator — above charts */}
      {hasPrix && hasLoyer && (
        <ComboSimulator
          apt={apt}
          settings={settings}
          seuilsRendement={seuilsRendement}
          cashflowSeuils={cashflowSeuils}
          loyerRange={loyerRange}
          seuilVertPrix={seuilVertPrixRdt}
          comboPrix={comboPrix}
          comboLoyer={comboLoyer}
          onComboPrixChange={setComboPrix}
          onComboLoyerChange={setComboLoyer}
          dvfMedianM2={dvfMedianM2}
        />
      )}

      {/* Factor chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => switchFacteur("prix")}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
            facteur === "prix"
              ? "bg-accent-600 text-white"
              : "border border-ink-200 text-ink-500 hover:text-ink-700"
          }`}
        >
          Sensibilité au prix
        </button>
        <button
          onClick={() => { if (hasLoyerFactor) switchFacteur("loyer"); }}
          disabled={!hasLoyerFactor}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
            facteur === "loyer"
              ? "bg-accent-600 text-white"
              : hasLoyerFactor
                ? "border border-ink-200 text-ink-500 hover:text-ink-700"
                : "border border-ink-100 text-ink-300 cursor-not-allowed"
          }`}
        >
          Sensibilité au loyer
        </button>
        {!hasLoyerFactor && apt.code_insee && !anilLoading && (
          <span className="self-center text-xs text-ink-400">Fourchette loyer indisponible</span>
        )}
        {!apt.code_insee && (
          <span className="self-center text-xs text-ink-400">Ajoutez un code postal pour le loyer</span>
        )}
      </div>

      {/* Charts */}
      {dataPoints.length > 0 && (
        <div
          className="grid grid-cols-1 gap-4 transition-opacity duration-150 sm:grid-cols-2"
          style={{ opacity: transitioning ? 0 : 1 }}
        >
          <ThresholdChart
            data={dataPoints}
            currentX={currentX}
            getY={getRendement}
            thresholds={{ vert: seuilsRendement.modeste, rouge: seuilsRendement.redhibitoire }}
            formatX={formatXFn}
            formatY={(v) => `${(v * 100).toFixed(1)} %`}
            title="Rendement net"
            yUnit="%"
            hoveredIndex={hoveredIndex}
            onHover={setHoveredIndex}
            invertColors={isLoyerMode}
            ghostPoint={ghostRendement}
            anilMarkers={anilMarkers}
          />
          <ThresholdChart
            data={dataPoints}
            currentX={currentX}
            getY={getCashflow}
            thresholds={{ vert: cashflowSeuils.vert, rouge: cashflowSeuils.rouge }}
            formatX={formatXFn}
            formatY={(v) => formatCashflow(v)}
            title="Cash-flow mensuel"
            yUnit="€"
            hoveredIndex={hoveredIndex}
            onHover={setHoveredIndex}
            invertColors={isLoyerMode}
            ghostPoint={ghostCashflow}
            anilMarkers={anilMarkers}
          />
        </div>
      )}

      {dataPoints.length === 0 && hasPrix && (
        <div className="rounded-xl border border-ink-100 bg-white p-8 text-center text-sm text-ink-500">
          {!hasLoyer
            ? "Ajoutez un loyer retenu pour voir les courbes."
            : "Données insuffisantes pour générer les courbes."}
        </div>
      )}
    </div>
  );
}
