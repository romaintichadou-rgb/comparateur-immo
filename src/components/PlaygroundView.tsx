"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Banknote, Check, Landmark, RotateCcw, TrendingUp } from "lucide-react";
import type { ApartmentWithComputed } from "@/lib/types";
import { isImmeuble } from "@/lib/types";
import type { AppSettings } from "@/lib/settings";
import { computeDerived } from "@/lib/calculations";
import { estimateFraisNotaire, lotsEffectifs } from "@/lib/estimates";
import {
  planFinancement,
  resolveInputs,
  simulate,
  type InputsResolus,
  type SimulationResult,
} from "@/lib/simulation";
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
import { formatEuros, formatEurosSigned, formatNombre, formatPercent } from "@/lib/format";
import { GroupHeader, LABEL_BLOC } from "@/components/SectionHeader";


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Facteur = "prix" | "loyer" | "apport";
interface DataPoint { x: number; yRendement: number | null; yCashflow: number | null }

interface ThresholdChartProps {
  data: DataPoint[];
  currentX: number;
  getY: (d: DataPoint) => number | null;
  thresholds: { vert: number; rouge: number };
  formatX: (v: number) => string;
  formatY: (v: number) => string;
  title: string;
  hoveredIndex: number | null;
  onHover: (index: number | null) => void;
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

/**
 * Préférence système « animations réduites », lue via `useSyncExternalStore`.
 *
 * ⚠️ Ne pas revenir à `useState` + `useEffect` qui recopie `mq.matches` : c'est
 * exactement le motif que `react-hooks/set-state-in-effect` interdit (rendu
 * initial à `false`, puis second rendu en cascade). `matchMedia` EST un store
 * externe — il a un abonnement et un instantané synchrone, donc le hook prévu
 * pour ça le lit sans frame intermédiaire.
 */
const REQUETE_MOUVEMENT_REDUIT = "(prefers-reduced-motion: reduce)";

function sAbonnerMouvementReduit(auChangement: () => void): () => void {
  const mq = window.matchMedia(REQUETE_MOUVEMENT_REDUIT);
  mq.addEventListener("change", auChangement);
  return () => mq.removeEventListener("change", auChangement);
}

const lireMouvementReduit = () => window.matchMedia(REQUETE_MOUVEMENT_REDUIT).matches;
// Instantané SSR : `matchMedia` n'existe pas côté serveur, et « pas de
// préférence connue » se joue sans réduction, comme le rendu initial d'avant.
const lireMouvementReduitServeur = () => false;

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    sAbonnerMouvementReduit,
    lireMouvementReduit,
    lireMouvementReduitServeur
  );
}

// ---------------------------------------------------------------------------
// Data generation
// ---------------------------------------------------------------------------

/**
 * Bien modifié + plan de financement du simulateur — SOURCE UNIQUE des deux
 * blocs qui l'affichent (`ComboSimulator` et `PlaygroundKpiSummary`).
 *
 * Les deux reconstruisaient chacun leur copie du bien. Tant que seuls le prix
 * et le loyer bougeaient, les deux copies restaient d'accord par hasard ; avec
 * l'apport, elles doivent porter le MÊME `montantEmprunte`, sinon le panneau et
 * les KPIs décrivent deux opérations différentes.
 *
 * ⚠️ L'apport est traduit en `montantEmprunte` (`coutTotal − apport`), jamais
 * stocké tel quel : voir `planFinancement` dans `simulation.ts`. Il est BORNÉ au
 * coût total, sinon `capitalEffectif` plafonne en silence et l'écran affiche un
 * apport que le calcul n'a pas utilisé.
 */
function simulerCombo(
  apt: ApartmentWithComputed,
  settings: AppSettings,
  prix: number,
  loyer: number,
  apport: number,
): { derived: ApartmentWithComputed; coutTotal: number; apport: number; sim: SimulationResult | null } {
  const modified = { ...apt } as ApartmentWithComputed;
  modified.prix = prix;
  modified.frais_notaire_estimes = estimateFraisNotaire(prix, apt.etat_bien ?? "ancien") ?? 0;
  modified.loyer_retenu = loyer;
  const derived = computeDerived(modified);
  const coutTotal = Math.round(derived.budget_total ?? prix);
  const apportBorne = Math.min(Math.max(0, apport), coutTotal);
  const inputs: InputsResolus = {
    ...resolveInputs(apt.simulation_inputs, settings),
    montantEmprunte: coutTotal - apportBorne,
  };
  return { derived, coutTotal, apport: apportBorne, sim: simulate(derived, inputs) };
}

/**
 * Apport du plan ENREGISTRÉ, au prix enregistré.
 *
 * ⚠️ Se dérive de `apartment`, jamais du curseur de prix : une clé de
 * réinitialisation calculée sur `comboPrix` remettrait l'apport à sa valeur
 * d'origine à chaque mouvement du curseur de prix.
 *
 * Ce n'est pas 0 par défaut : en mode auto et financement `hors_notaire`,
 * l'apport vaut déjà les frais de notaire.
 */
function apportDuPlan(apt: ApartmentWithComputed, settings: AppSettings): number {
  return planFinancement(apt, resolveInputs(apt.simulation_inputs, settings)).apport;
}

function generateApportRange(coutTotal: number, apportActuel: number): number[] {
  const step = Math.max(1000, roundTo(coutTotal / 40, 1000) || 1000);
  const pts: number[] = [];
  for (let x = 0; x <= coutTotal; x += step) pts.push(x);
  if (pts[pts.length - 1] !== coutTotal) pts.push(coutTotal);
  if (!pts.includes(apportActuel) && apportActuel <= coutTotal) {
    pts.push(apportActuel);
    pts.sort((a, b) => a - b);
  }
  return pts;
}

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

/**
 * Les courbes passent par `simulerCombo`, comme le panneau : l'apport figé du
 * simulateur doit s'appliquer à CHAQUE point.
 *
 * ⚠️ Avant l'ajout de l'apport, les courbes calculaient en mode financement
 * automatique (l'emprunt suivait le prix) — d'accord avec le panneau par
 * coïncidence, puisque lui aussi était en auto. Dès qu'un apport est fixé, une
 * courbe restée en auto raconterait une autre opération que le panneau juste
 * au-dessus d'elle.
 *
 * ⚠️ `yRendement` est CONSTANT sur l'axe apport (le rendement net ne dépend pas
 * du financement) : la courbe rendement n'est pas affichée pour ce facteur —
 * voir `PlaygroundView`.
 */
function computeDataPoints(
  apt: ApartmentWithComputed,
  settings: AppSettings,
  facteur: Facteur,
  xValues: number[],
  fixed: { prix: number; loyer: number; apport: number },
): DataPoint[] {
  return xValues.map((x) => {
    const prix = facteur === "prix" ? x : fixed.prix;
    const loyer = facteur === "loyer" ? x : fixed.loyer;
    const apport = facteur === "apport" ? x : fixed.apport;
    const { derived, sim } = simulerCombo(apt, settings, prix, loyer, apport);
    return {
      x,
      yRendement: derived.rendement_net,
      yCashflow: sim?.cashflowMensuelMoyenLMNP ?? null,
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
const PAD = { top: 18, right: 12, bottom: 32, left: 44 };
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;


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

  const findCrossingX = (threshold: number): number | null => {
    for (let i = 0; i < data.length - 1; i++) {
      const y0 = getY(data[i]);
      const y1 = getY(data[i + 1]);
      if (y0 == null || y1 == null) continue;
      if ((y0 <= threshold && y1 >= threshold) || (y0 >= threshold && y1 <= threshold)) {
        const t = (threshold - y0) / (y1 - y0);
        return data[i].x + t * (data[i + 1].x - data[i].x);
      }
    }
    return null;
  };
  const crossVertX = findCrossingX(thresholds.vert);
  const crossRougeX = findCrossingX(thresholds.rouge);

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

  const currentY = (() => {
    const exact = data.find((d) => d.x === currentX);
    if (exact) return getY(exact);
    if (currentX <= data[0].x) return getY(data[0]);
    if (currentX >= data[data.length - 1].x) return getY(data[data.length - 1]);
    for (let i = 1; i < data.length; i++) {
      if (data[i].x >= currentX) {
        const prev = getY(data[i - 1]);
        const curr = getY(data[i]);
        if (prev == null || curr == null) return curr ?? prev;
        const t = (currentX - data[i - 1].x) / (data[i].x - data[i - 1].x);
        return prev + t * (curr - prev);
      }
    }
    return null;
  })();

  const hoverY = hoveredIndex != null && hoveredIndex < data.length ? getY(data[hoveredIndex]) : null;
  const hoverX = hoveredIndex != null && hoveredIndex < data.length ? data[hoveredIndex].x : null;

  const yRange = yMax - yMin;
  const yTicks: number[] = [];
  const nTicks = 4;
  const rawStep = yRange / nTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep) || 1)));
  const nice = [1, 2, 2.5, 5, 10].find(m => m * mag >= rawStep) ?? 10;
  const yStep = nice * mag;
  const tickStart = Math.ceil(yMin / yStep) * yStep;
  for (let v = tickStart; v <= yMax + yStep * 0.01; v += yStep) {
    if (v >= yMin - yStep * 0.01 && v <= yMax + yStep * 0.01) yTicks.push(Math.round(v * 1000) / 1000);
  }

  const xTicks: number[] = [];
  const xStep = (xMax - xMin) / 4;
  for (let i = 0; i <= 4; i++) xTicks.push(roundTo(xMin + xStep * i, data[0].x > 1000 ? 5000 : 10));

  const uid = title.replace(/\s/g, "");

  // ⚠️ Fonction simple, PAS un `useCallback` : ce composant retourne tôt
  // (`yValues.length === 0`), donc tout hook placé ici serait appelé de façon
  // conditionnelle — React planterait dès qu'une série passerait de vide à
  // non vide. Et la mémoïsation n'achetait rien : le handler ne part que sur
  // un élément DOM natif, dont l'identité ne déclenche aucun rendu (ses
  // voisins `onMouseLeave`/`onTouchMove` sont d'ailleurs déjà inline).
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
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
  };

  const ariaLabel = `${title} : ${validPoints.length > 0 ? formatY(validPoints[0].y) : "—"} à ${validPoints.length > 0 ? formatY(validPoints[validPoints.length - 1].y) : "—"} pour ${formatX(xMin)} à ${formatX(xMax)}. Valeur actuelle ${formatX(currentX)} : ${currentY != null ? formatY(currentY) : "—"}. Seuil vert : ${formatY(thresholds.vert)}, seuil rouge : ${formatY(thresholds.rouge)}.`;


  return (
    <div>
      <h4 className={`mb-3 ${LABEL_BLOC}`}>{title}</h4>
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
          <linearGradient id={`fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3d3580" stopOpacity=".18" />
            <stop offset="100%" stopColor="#3d3580" stopOpacity=".03" />
          </linearGradient>
        </defs>

        {(() => {
          const C = { green: "#bbf7d0", amber: "#fef08a", red: "#fecaca" };
          const zoneOf = (y: number) => y >= thresholds.vert ? C.green : y >= thresholds.rouge ? C.amber : C.red;

          const edges = [PAD.left];
          const crossVert = crossVertX != null ? scaleX(crossVertX) : null;
          const crossRouge = crossRougeX != null ? scaleX(crossRougeX) : null;
          if (crossVert != null && crossVert > PAD.left && crossVert < PAD.left + PLOT_W) edges.push(crossVert);
          if (crossRouge != null && crossRouge > PAD.left && crossRouge < PAD.left + PLOT_W) edges.push(crossRouge);
          edges.push(PAD.left + PLOT_W);
          edges.sort((a, b) => a - b);

          return edges.slice(0, -1).map((left, i) => {
            const right = edges[i + 1];
            const midX = xMin + (((left + right) / 2 - PAD.left) / PLOT_W) * (xMax - xMin);
            let midY = 0;
            for (let j = 0; j < validPoints.length - 1; j++) {
              if (validPoints[j].x <= midX && validPoints[j + 1].x >= midX) {
                const t = (midX - validPoints[j].x) / (validPoints[j + 1].x - validPoints[j].x);
                midY = validPoints[j].y + t * (validPoints[j + 1].y - validPoints[j].y);
                break;
              }
            }
            if (midY === 0 && validPoints.length > 0) midY = validPoints[0].y;
            return (
              <rect key={i} x={left} y={PAD.top} width={right - left} height={PLOT_H}
                fill={zoneOf(midY)} opacity=".22" />
            );
          });
        })()}

        {yTicks.map((v) => (
          <line key={`grid-${v}`} x1={PAD.left} y1={scaleY(v)} x2={PAD.left + PLOT_W} y2={scaleY(v)} stroke="#ddd8ea" strokeWidth=".5" opacity=".3" />
        ))}

        {anilMarkers && (
          <>
            <rect x={scaleX(anilMarkers.min)} y={PAD.top + PLOT_H} width={scaleX(anilMarkers.max) - scaleX(anilMarkers.min)} height="4" fill="#3d3580" opacity=".1" rx="1" />
            <line x1={scaleX(anilMarkers.min)} y1={PAD.top + PLOT_H - 4} x2={scaleX(anilMarkers.min)} y2={PAD.top + PLOT_H + 4} stroke="#3d3580" strokeWidth="1" opacity=".3" />
            <line x1={scaleX(anilMarkers.max)} y1={PAD.top + PLOT_H - 4} x2={scaleX(anilMarkers.max)} y2={PAD.top + PLOT_H + 4} stroke="#3d3580" strokeWidth="1" opacity=".3" />
            <text x={(scaleX(anilMarkers.min) + scaleX(anilMarkers.max)) / 2} y={PAD.top + PLOT_H + 24} textAnchor="middle" fontSize="6.5" fill="#3d3580" opacity=".5" fontFamily="sans-serif">Encadrement loyers</text>
          </>
        )}

        {fillD && <path d={fillD} fill={`url(#fill-${uid})`} />}
        {pathD && <path d={pathD} fill="none" stroke="#3d3580" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}

        {ghostPoint && ghostPoint.y != null && (
          <>
            <line x1={scaleX(ghostPoint.x)} y1={PAD.top} x2={scaleX(ghostPoint.x)} y2={PAD.top + PLOT_H} stroke="#8b8393" strokeWidth=".75" strokeDasharray="3 4" opacity=".6" />
            <text x={scaleX(ghostPoint.x)} y={PAD.top - 5} textAnchor="middle" fontSize="7.5" fill="#8b8393" fontFamily="sans-serif">Annonce</text>
            <circle cx={scaleX(ghostPoint.x)} cy={scaleY(ghostPoint.y)} r="4" fill="white" stroke="#8b8393" strokeWidth="1.2" />
            {(() => {
              const gx = Math.max(36, Math.min(CHART_W - 36, scaleX(ghostPoint.x)));
              const gLabel = formatY(ghostPoint.y);
              const gLabelW = Math.max(48, gLabel.length * 5.5 + 16);
              return (
                <>
                  <rect x={gx - gLabelW / 2} y={scaleY(ghostPoint.y) - 22} width={gLabelW} height="18" rx="4" fill="white" stroke="#b0a8c0" strokeWidth=".8" />
                  <text x={gx} y={scaleY(ghostPoint.y) - 10} textAnchor="middle" fontSize="8" fontWeight="600" fill="#6b6280" fontFamily="'Geist Mono', monospace">
                    {gLabel}
                  </text>
                </>
              );
            })()}
          </>
        )}

        {hoveredIndex != null && hoverX != null && hoverY != null && (
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

        {currentY != null && (
          <>
            <line x1={scaleX(currentX)} y1={PAD.top} x2={scaleX(currentX)} y2={PAD.top + PLOT_H} stroke="#3d3580" strokeWidth="1" strokeDasharray="3 3" opacity=".5" />
            <line x1={PAD.left} y1={scaleY(currentY)} x2={scaleX(currentX)} y2={scaleY(currentY)} stroke="#3d3580" strokeWidth=".75" strokeDasharray="3 3" opacity=".35" />
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

        {yTicks.map((v) => (
          <text key={v} x={PAD.left - 4} y={scaleY(v) + 3} textAnchor="end" fontSize="8"
            fill="#8b8393" fontWeight="400" fontFamily="'Geist Mono', monospace"
          >{formatY(v)}</text>
        ))}

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

const SLIDER_THUMB = "[&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-[#3d3580] [&::-webkit-slider-thumb]:shadow-[0_0_0_3px_rgba(61,53,128,.15)] [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[#3d3580] [&::-moz-range-thumb]:shadow-[0_0_0_3px_rgba(61,53,128,.15)]";

function ComboSimulator({
  apt,
  settings,
  seuilsRendement,
  cashflowSeuils,
  loyerRange,
  seuilVertPrix,
  seuilVertApport,
  comboPrix,
  comboLoyer,
  comboApport,
  apportPlan,
  combo,
  onComboPrixChange,
  onComboLoyerChange,
  onComboApportChange,
  dvfMedianM2,
}: {
  apt: ApartmentWithComputed;
  settings: AppSettings;
  seuilsRendement: RendementSeuils;
  cashflowSeuils: CashflowSeuils;
  loyerRange: [number, number] | null;
  seuilVertPrix: number | null;
  /** Apport à partir duquel le cash-flow passe au vert, `null` si hors plage. */
  seuilVertApport: number | null;
  comboPrix: number;
  comboLoyer: number;
  comboApport: number;
  /** Apport du plan enregistré — repère fixe du curseur. */
  apportPlan: number;
  /** Résultat partagé avec les KPIs (`simulerCombo`) — jamais recalculé ici. */
  combo: ReturnType<typeof simulerCombo>;
  onComboPrixChange: (v: number) => void;
  onComboLoyerChange: (v: number) => void;
  onComboApportChange: (v: number) => void;
  dvfMedianM2: number | null;
}) {
  const rendementCombo = combo.derived.rendement_net;
  const cashflowCombo = combo.sim?.cashflowMensuelMoyenLMNP ?? null;
  const rdtTone = toneForRendement(rendementCombo, seuilsRendement);
  const cfTone = toneForCashflow(cashflowCombo, cashflowSeuils);

  const ecartPrix = comboPrix - (apt.prix ?? 0);
  const ecartLoyer = comboLoyer - (apt.loyer_retenu ?? 0);
  const ecartApport = comboApport - apportPlan;
  const hasEcart = ecartPrix !== 0 || ecartLoyer !== 0 || ecartApport !== 0;

  const prixMin = roundTo((apt.prix ?? 0) * 0.7, 5000);
  const prixMax = roundTo((apt.prix ?? 0) * 1.3, 5000);
  const loyerMin = loyerRange ? roundTo(loyerRange[0] * 0.9, 10) : 0;
  const loyerMax = loyerRange ? roundTo(loyerRange[1] * 1.1, 10) : roundTo((apt.loyer_retenu ?? 0) * 1.5, 10);
  // Plage d'apport : de 0 (prêt à 110 %) au coût total (achat comptant). La
  // borne haute est le coût total du prix SIMULÉ, donc elle bouge avec le
  // curseur de prix — d'où le `Math.min` sur la valeur affichée plus bas.
  const apportMax = combo.coutTotal;

  const resetCombo = () => {
    onComboPrixChange(apt.prix ?? 0);
    onComboLoyerChange(apt.loyer_retenu ?? 0);
    onComboApportChange(apportPlan);
  };

  const surface = apt.surface_m2 ?? 0;
  const dvfPrix = dvfMedianM2 != null && surface > 0 ? Math.round(dvfMedianM2 * surface) : null;

  const prixPct = prixMax > prixMin ? ((comboPrix - prixMin) / (prixMax - prixMin)) * 100 : 0;
  const loyerPct = loyerMax > loyerMin ? ((comboLoyer - loyerMin) / (loyerMax - loyerMin)) * 100 : 0;
  const origPrixPct = prixMax > prixMin ? (((apt.prix ?? 0) - prixMin) / (prixMax - prixMin)) * 100 : 50;
  const origLoyerPct = loyerMax > loyerMin ? (((apt.loyer_retenu ?? 0) - loyerMin) / (loyerMax - loyerMin)) * 100 : 50;
  // `combo.apport` et non `comboApport` : c'est la valeur BORNÉE au coût total,
  // la seule que le calcul a réellement utilisée. Afficher la valeur brute
  // laisserait la poignée au-delà de la piste quand le prix descend sous
  // l'apport choisi.
  const apportPct = apportMax > 0 ? (combo.apport / apportMax) * 100 : 0;
  const origApportPct = apportMax > 0 ? (Math.min(apportPlan, apportMax) / apportMax) * 100 : 0;

  return (
    <section>
      <GroupHeader
        title="Simulateur prix, loyer et apport"
        subtitle="Déplacez les curseurs : rendement, mensualité et cash-flow se recalculent à chaque mouvement. Rien n'est enregistré."
      />
      <div className="rounded-xl border border-ink-100 bg-white">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_280px]">
          {/* Left column: stacked sliders */}
          <div className="space-y-8 p-5 sm:p-6">
            {/* Prix d'achat slider */}
            <div>
              <div className="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span className={LABEL_BLOC}>Prix d&apos;achat</span>
              {seuilVertPrix != null && Math.abs(comboPrix - Math.round(seuilVertPrix)) > 1000 && (
                <button
                  onClick={() => onComboPrixChange(roundTo(seuilVertPrix, 1000))}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-px text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
                >
                  Seuil vert · {formatEurosShort(roundTo(seuilVertPrix, 1000))}
                </button>
              )}
              {(apt.prix ?? 0) > 0 && Math.abs(ecartPrix + (apt.prix ?? 0) * 0.1) > 1000 && (
                <button
                  onClick={() => onComboPrixChange(roundTo((apt.prix ?? 0) * 0.9, 1000))}
                  className="rounded-full border border-ink-200 px-2 py-px text-[10px] font-medium text-ink-500 hover:bg-ink-50"
                >
                  −10 %
                </button>
              )}
              {(apt.prix ?? 0) > 0 && Math.abs(ecartPrix + (apt.prix ?? 0) * 0.2) > 1000 && (
                <button
                  onClick={() => onComboPrixChange(roundTo((apt.prix ?? 0) * 0.8, 1000))}
                  className="rounded-full border border-ink-200 px-2 py-px text-[10px] font-medium text-ink-500 hover:bg-ink-50"
                >
                  −20 %
                </button>
              )}
              {dvfPrix != null && Math.abs(comboPrix - dvfPrix) > 5000 && (
                <button
                  onClick={() => onComboPrixChange(roundTo(dvfPrix, 1000))}
                  className="rounded-full border border-ink-200 px-2 py-px text-[10px] font-medium text-ink-500 hover:bg-ink-50"
                >
                  DVF médian
                </button>
              )}
              {hasEcart && (
                <button
                  onClick={resetCombo}
                  className="flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] text-ink-400 hover:bg-ink-50 hover:text-ink-600"
                  aria-label="Réinitialiser"
                >
                  <RotateCcw className="size-2.5" />
                </button>
              )}
                <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-ink-200 bg-ink-50/50 px-1">
                  <button
                    onClick={() => onComboPrixChange(Math.max(prixMin, comboPrix - 1000))}
                    className="px-1.5 py-1 text-sm text-ink-400 hover:text-ink-700"
                  >&minus;</button>
                  <span className="min-w-[80px] text-center font-mono text-sm font-semibold tabular-nums text-ink-900">
                    {formatEuros(comboPrix)}
                  </span>
                  <button
                    onClick={() => onComboPrixChange(Math.min(prixMax, comboPrix + 1000))}
                    className="px-1.5 py-1 text-sm text-ink-400 hover:text-ink-700"
                  >+</button>
                  <span className="pr-1 text-xs text-ink-400">€</span>
                </div>
              </div>
              <div className="relative h-6">
                <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full bg-accent-500 transition-[width] duration-75"
                    style={{ width: `${prixPct}%` }}
                  />
                </div>
                <div
                  className="pointer-events-none absolute top-0 z-[5] flex h-full -translate-x-1/2 flex-col items-center justify-center"
                  style={{ left: `${origPrixPct}%` }}
                >
                  <div className="h-3.5 w-px bg-ink-300/60" />
                </div>
                <input
                  type="range"
                  aria-label="Prix d'achat"
                  min={prixMin}
                  max={prixMax}
                  step={1000}
                  value={comboPrix}
                  onChange={(e) => onComboPrixChange(Number(e.target.value))}
                  className={`absolute inset-0 z-10 w-full cursor-pointer appearance-none bg-transparent ${SLIDER_THUMB}`}
                />
              </div>
              <div className="relative mt-0.5 flex justify-between text-[11px] text-ink-400">
                <span>{formatEurosShort(prixMin)}</span>
                <span
                  className="absolute -translate-x-1/2 text-[10px] text-ink-400"
                  style={{ left: `${origPrixPct}%` }}
                >
                  Annonce
                </span>
                <span>{formatEurosShort(prixMax)}</span>
              </div>
            </div>

            {/* Loyer mensuel slider */}
            <div>
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <span className={LABEL_BLOC}>Loyer mensuel</span>
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
              <div className="relative h-6">
                <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full bg-accent-500 transition-[width] duration-75"
                    style={{ width: `${loyerPct}%` }}
                  />
                </div>
                <div
                  className="pointer-events-none absolute top-0 z-[5] flex h-full -translate-x-1/2 flex-col items-center justify-center"
                  style={{ left: `${origLoyerPct}%` }}
                >
                  <div className="h-3.5 w-px bg-ink-300/60" />
                </div>
                <input
                  type="range"
                  aria-label="Loyer mensuel"
                  min={loyerMin}
                  max={loyerMax}
                  step={5}
                  value={comboLoyer}
                  onChange={(e) => onComboLoyerChange(Number(e.target.value))}
                  className={`absolute inset-0 z-10 w-full cursor-pointer appearance-none bg-transparent ${SLIDER_THUMB}`}
                />
              </div>
              <div className="relative mt-0.5 flex justify-between text-[11px] text-ink-400">
                <span>{formatEuros(loyerMin)}</span>
                <span
                  className="absolute -translate-x-1/2 text-[10px] text-ink-400"
                  style={{ left: `${origLoyerPct}%` }}
                >
                  Annonce
                </span>
                <span>{formatEuros(loyerMax)}</span>
              </div>
            </div>

            {/* Apport slider */}
            <div>
              <div className="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span className={LABEL_BLOC}>Apport</span>
                {seuilVertApport != null && Math.abs(combo.apport - Math.round(seuilVertApport)) > 1000 && (
                  <button
                    onClick={() => onComboApportChange(Math.min(apportMax, roundTo(seuilVertApport, 1000)))}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-px text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    Cash-flow vert · {formatEurosShort(roundTo(seuilVertApport, 1000))}
                  </button>
                )}
                {combo.apport !== 0 && (
                  <button
                    onClick={() => onComboApportChange(0)}
                    className="rounded-full border border-ink-200 px-2 py-px text-[10px] font-medium text-ink-500 hover:bg-ink-50"
                  >
                    Prêt à 110 %
                  </button>
                )}
                {combo.apport !== apportMax && (
                  <button
                    onClick={() => onComboApportChange(apportMax)}
                    className="rounded-full border border-ink-200 px-2 py-px text-[10px] font-medium text-ink-500 hover:bg-ink-50"
                  >
                    Comptant
                  </button>
                )}
                <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-ink-200 bg-ink-50/50 px-1">
                  <button
                    onClick={() => onComboApportChange(Math.max(0, combo.apport - 1000))}
                    className="px-1.5 py-1 text-sm text-ink-400 hover:text-ink-700"
                  >&minus;</button>
                  <span className="min-w-[80px] text-center font-mono text-sm font-semibold tabular-nums text-ink-900">
                    {formatEuros(combo.apport)}
                  </span>
                  <button
                    onClick={() => onComboApportChange(Math.min(apportMax, combo.apport + 1000))}
                    className="px-1.5 py-1 text-sm text-ink-400 hover:text-ink-700"
                  >+</button>
                  <span className="pr-1 text-xs text-ink-400">€</span>
                </div>
              </div>
              <div className="relative h-6">
                <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full bg-accent-500 transition-[width] duration-75"
                    style={{ width: `${apportPct}%` }}
                  />
                </div>
                <div
                  className="pointer-events-none absolute top-0 z-[5] flex h-full -translate-x-1/2 flex-col items-center justify-center"
                  style={{ left: `${origApportPct}%` }}
                >
                  <div className="h-3.5 w-px bg-ink-300/60" />
                </div>
                <input
                  type="range"
                  aria-label="Apport personnel"
                  min={0}
                  max={apportMax}
                  step={1000}
                  value={combo.apport}
                  onChange={(e) => onComboApportChange(Number(e.target.value))}
                  className={`absolute inset-0 z-10 w-full cursor-pointer appearance-none bg-transparent ${SLIDER_THUMB}`}
                />
              </div>
              <div className="relative mt-0.5 flex justify-between text-[11px] text-ink-400">
                <span>0 €</span>
                <span
                  className="absolute -translate-x-1/2 text-[10px] text-ink-400"
                  style={{ left: `${origApportPct}%` }}
                >
                  Plan actuel
                </span>
                <span>{formatEurosShort(apportMax)}</span>
              </div>
            </div>
          </div>

          {/* Right column: results card */}
          <div className="flex flex-col border-t border-ink-100/50 sm:border-l sm:border-t-0">
            {/* Hero rendement */}
            <div className={`flex flex-1 flex-col items-center justify-center px-5 py-6 ${TONE_PANEL_STYLES[rdtTone].wrap} sm:rounded-tr-xl`}>
              <p className={`mb-1 text-xs font-medium ${TONE_PANEL_STYLES[rdtTone].label}`}>Rendement net simulé</p>
              <p className={`font-mono text-3xl font-bold tabular-nums ${TONE_PANEL_STYLES[rdtTone].value}`}>
                {rendementCombo != null ? formatPercent(rendementCombo) : "—"}
              </p>
              {/* ⚠️ Le rendement net divise par le coût de l'opération : il ne
                  dépend PAS du financement. Sans cette mention, le curseur
                  d'apport passe pour cassé — on le bouge, le grand chiffre ne
                  bronche pas. Les lignes en dessous sont sa vraie réponse. */}
              {ecartApport !== 0 && (
                <p className={`mt-1.5 text-center text-[10px] leading-tight ${TONE_PANEL_STYLES[rdtTone].label}`}>
                  Inchangé par l&apos;apport — voir mensualité et cash-flow
                </p>
              )}
            </div>

            {/* Detail rows */}
            <div className="divide-y divide-ink-100/50 px-5 text-sm">
              <div className="flex items-center justify-between gap-2 py-2.5">
                <span className="text-ink-500">Cash-flow mensuel</span>
                <span className={`whitespace-nowrap font-mono font-semibold tabular-nums ${TONE_PANEL_STYLES[cfTone].value}`}>
                  {cashflowCombo != null ? formatCashflow(cashflowCombo) : "—"}
                </span>
              </div>
              {/* Les deux grandeurs que l'apport pilote directement. */}
              <div className="flex items-center justify-between gap-2 py-2.5">
                <span className="text-ink-500">Mensualité</span>
                <span className="whitespace-nowrap font-mono text-xs tabular-nums text-ink-600">
                  {combo.sim != null ? `${formatEuros(Math.round(combo.sim.mensualiteTotale))} €` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 py-2.5">
                <span className="text-ink-500">Emprunt</span>
                <span className="whitespace-nowrap font-mono text-xs tabular-nums text-ink-600">
                  {combo.sim != null ? `${formatEuros(combo.sim.montantEmprunte)} €` : "—"}
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
    </section>
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
  const [transitioning, setTransitioning] = useState(false);

  const [comboPrix, setComboPrix] = useState(apartment.prix ?? 0);
  const [comboLoyer, setComboLoyer] = useState(apartment.loyer_retenu ?? 0);
  // Apport du plan ENREGISTRÉ — pas 0 : en mode auto + financement
  // `hors_notaire`, l'apport vaut déjà les frais de notaire.
  const [comboApport, setComboApport] = useState(() => apportDuPlan(apartment, settings));

  // Les curseurs repartent de la valeur du bien dès qu'elle change (sauvegarde,
  // ré-estimation). Ajustement PENDANT LE RENDU plutôt que dans un effet —
  // le motif que React recommande pour « réinitialiser un état sur changement
  // de prop », et le même que celui d'`ApartmentDetail.tsx`. Un effet affichait
  // l'ancienne valeur pendant une frame avant de basculer, ce que
  // `react-hooks/set-state-in-effect` signale comme un rendu en cascade.
  // La garde `!==` est ce qui empêche la boucle : le second rendu ne change
  // plus rien.
  const prixDuBien = apartment.prix ?? 0;
  const [prixDuBienVu, setPrixDuBienVu] = useState(prixDuBien);
  if (prixDuBien !== prixDuBienVu) {
    setPrixDuBienVu(prixDuBien);
    setComboPrix(prixDuBien);
  }

  const loyerDuBien = apartment.loyer_retenu ?? 0;
  const [loyerDuBienVu, setLoyerDuBienVu] = useState(loyerDuBien);
  if (loyerDuBien !== loyerDuBienVu) {
    setLoyerDuBienVu(loyerDuBien);
    setComboLoyer(loyerDuBien);
  }

  // ⚠️ La clé de réinitialisation se dérive du bien ENREGISTRÉ, jamais de
  // `comboPrix` : le coût total dépend du prix, donc une clé calculée sur le
  // curseur remettrait l'apport à sa valeur d'origine à chaque mouvement du
  // curseur de prix.
  const apportPlan = apportDuPlan(apartment, settings);
  const [apportPlanVu, setApportPlanVu] = useState(apportPlan);
  if (apportPlan !== apportPlanVu) {
    setApportPlanVu(apportPlan);
    setComboApport(apportPlan);
  }

  const apt = apartment;
  const seuilsRendement = seuilsRendementFromSettings(settings);
  const cashflowSeuils = cashflowSeuilsFromSettings(settings);
  const immeuble = isImmeuble(apt.type_bien);
  const surface = apt.surface_m2 ?? 0;
  const hasSurface = surface > 0;
  const hasLoyer = apt.loyer_retenu != null && apt.loyer_retenu > 0;
  const hasPrix = apt.prix != null && apt.prix > 0;

  const typoAnil = typologieAnil(apt.type_bien, apt.nb_pieces, immeuble, apt.surface_m2);
  /**
   * Clé du résultat ANIL ATTENDU — `null` s'il n'y a rien à interroger.
   *
   * ⚠️ `apt.id` en fait partie : la route résout le périmètre depuis le bien
   * stocké, la clé ne peut donc pas se réduire à la commune.
   */
  const cleAnil =
    apt.code_insee && hasSurface
      ? `${apt.id}|${typoAnil}|${surface}|${apt.nb_lots ?? ""}|${immeuble}`
      : null;

  // ⚠️ `refCC` et `anilLoading` sont DÉDUITS du couple (clé attendue, clé
  // reçue), ils ne sont plus posés dans le corps de l'effet — ce que
  // `react-hooks/set-state-in-effect` interdit, chaque `setState` synchrone
  // provoquant un rendu en cascade. Deux bugs tombent avec :
  //  - un résultat obtenu pour un bien/une typologie précédente ne peut plus
  //    s'afficher comme s'il concernait la configuration courante ;
  //  - le drapeau de chargement ne peut plus rester bloqué à `true` quand les
  //    conditions tombent en plein vol (la requête était annulée par
  //    `cancelled`, donc plus personne ne le remettait à `false`).
  const [resultatAnil, setResultatAnil] = useState<{ cle: string; ref: ReferenceCC | null } | null>(null);
  const resultatAJour = cleAnil != null && resultatAnil?.cle === cleAnil;
  const refCC = resultatAJour ? (resultatAnil?.ref ?? null) : null;
  const anilLoading = cleAnil != null && !resultatAJour;

  useEffect(() => {
    if (!cleAnil) return;
    let cancelled = false;
    fetch(`/api/loyer-reference?apartment_id=${encodeURIComponent(apt.id)}&typologie=${typoAnil}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const ref: LoyerReference | null = data.ref ?? null;
        const surfaceLogement = immeuble ? surface / lotsEffectifs(apt.nb_lots, surface) : surface;
        setResultatAnil({
          cle: cleAnil,
          ref: ref ? referenceCCMeuble(ref, surfaceLogement, typoAnil) : null,
        });
      })
      .catch(() => { if (!cancelled) setResultatAnil({ cle: cleAnil, ref: null }); });
    return () => { cancelled = true; };
  }, [cleAnil, apt.id, apt.nb_lots, typoAnil, immeuble, surface]);

  const loyerRange: [number, number] | null = useMemo(() => {
    if (!refCC || !hasSurface) return null;
    const min = Math.round(refCC.minM2 * surface);
    const max = Math.round(refCC.maxM2 * surface);
    return min < max ? [min, max] : null;
  }, [refCC, surface, hasSurface]);

  const hasLoyerFactor = loyerRange != null && hasLoyer;

  // Résultat PARTAGÉ entre le panneau du simulateur et les KPIs — un seul bien
  // modifié, un seul plan de financement (cf. `simulerCombo`).
  const combo = useMemo(
    () => hasPrix && hasLoyer ? simulerCombo(apt, settings, comboPrix, comboLoyer, comboApport) : null,
    [apt, settings, comboPrix, comboLoyer, comboApport, hasPrix, hasLoyer],
  );

  const xValues = useMemo(() => {
    if (facteur === "prix" && hasPrix) return generatePriceRange(apt.prix!);
    if (facteur === "loyer" && loyerRange && hasLoyer) return generateLoyerRange(roundTo(loyerRange[0] * 0.9, 10), roundTo(loyerRange[1] * 1.1, 10), apt.loyer_retenu!);
    if (facteur === "apport" && combo != null) return generateApportRange(combo.coutTotal, combo.apport);
    return [];
  }, [facteur, apt.prix, apt.loyer_retenu, loyerRange, hasPrix, hasLoyer, combo]);

  // Les deux autres paramètres restent figés à la valeur du simulateur : les
  // courbes décrivent la MÊME opération que le panneau au-dessus d'elles.
  const fixed = useMemo(
    () => ({ prix: comboPrix, loyer: comboLoyer, apport: comboApport }),
    [comboPrix, comboLoyer, comboApport],
  );

  const dataPoints = useMemo(
    () => xValues.length > 0 ? computeDataPoints(apt, settings, facteur, xValues, fixed) : [],
    [apt, settings, facteur, xValues, fixed],
  );

  const currentX =
    facteur === "prix" ? comboPrix : facteur === "loyer" ? comboLoyer : (combo?.apport ?? comboApport);

  const origX =
    facteur === "prix" ? (apt.prix ?? 0) : facteur === "loyer" ? (apt.loyer_retenu ?? 0) : apportPlan;
  const xAxisMoved = currentX !== origX;

  const ghostRendement = useMemo(() => {
    if (!xAxisMoved || dataPoints.length === 0) return undefined;
    return { x: origX, y: interpolateY(dataPoints, (d) => d.yRendement, origX) };
  }, [xAxisMoved, origX, dataPoints]);

  const ghostCashflow = useMemo(() => {
    if (!xAxisMoved || dataPoints.length === 0) return undefined;
    return { x: origX, y: interpolateY(dataPoints, (d) => d.yCashflow, origX) };
  }, [xAxisMoved, origX, dataPoints]);

  const anilMarkers = useMemo(() => {
    if (facteur !== "loyer" || !loyerRange) return undefined;
    return { min: loyerRange[0], max: loyerRange[1] };
  }, [facteur, loyerRange]);

  const dvfMedianM2 = useMemo(() => extractDvfMedian(apt), [apt]);

  const seuilVertPrixRdt = useMemo(() => {
    if (facteur !== "prix" || dataPoints.length === 0) return null;
    return findCrossing(dataPoints, (d) => d.yRendement, seuilsRendement.modeste, "above");
  }, [dataPoints, facteur, seuilsRendement.modeste]);

  // Pendant du « Seuil vert » du prix, sur le seul indicateur que l'apport
  // déplace : l'apport à partir duquel le cash-flow passe au vert. Calculé sur
  // sa PROPRE plage, sans dépendre du facteur affiché — sinon la pastille du
  // curseur disparaîtrait dès qu'on regarde la courbe des prix.
  const seuilVertApport = useMemo(() => {
    if (combo == null) return null;
    const pts = computeDataPoints(apt, settings, "apport", generateApportRange(combo.coutTotal, combo.apport), {
      prix: comboPrix,
      loyer: comboLoyer,
      apport: combo.apport,
    });
    return findCrossing(pts, (d) => d.yCashflow, cashflowSeuils.vert, "above");
  }, [apt, settings, combo, comboPrix, comboLoyer, cashflowSeuils.vert]);

  const formatXFn = useCallback(
    (v: number) => (facteur === "loyer" ? `${Math.round(v)} €` : formatK(v)),
    [facteur],
  );

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

  const resolus = useMemo(() => resolveInputs(apt.simulation_inputs, settings), [apt.simulation_inputs, settings]);

  if (!hasPrix) {
    return (
      <div className="rounded-xl border border-ink-100 bg-white p-8 text-center text-sm text-ink-500">
        Ajoutez un prix d&apos;achat pour utiliser le Playground.
      </div>
    );
  }

  return (
    // `space-y-10` : les trois groupes (simulateur, projection, courbes) sont
    // des SECTIONS, pas les lignes d'une même liste — à 20 px, le sous-titre
    // d'un groupe semblait appartenir au bloc du dessus.
    <div className="space-y-10">

      {/* Combo simulator — above charts. La garde porte sur `combo` (et non sur
          `hasPrix && hasLoyer`, la même condition) pour que TypeScript sache que
          le résultat partagé est non nul dans le composant. */}
      {combo != null && (
        <ComboSimulator
          apt={apt}
          settings={settings}
          seuilsRendement={seuilsRendement}
          cashflowSeuils={cashflowSeuils}
          loyerRange={loyerRange}
          seuilVertPrix={seuilVertPrixRdt}
          seuilVertApport={seuilVertApport}
          comboPrix={comboPrix}
          comboLoyer={comboLoyer}
          comboApport={comboApport}
          apportPlan={apportPlan}
          combo={combo}
          onComboPrixChange={setComboPrix}
          onComboLoyerChange={setComboLoyer}
          onComboApportChange={setComboApport}
          dvfMedianM2={dvfMedianM2}
        />
      )}

      {/* KPI summary — updates live with sliders */}
      {combo?.sim && (
        <PlaygroundKpiSummary sim={combo.sim} resolus={resolus} />
      )}

      {/* Charts — la bascule prix/loyer est le CONTRÔLE de ce groupe, elle vit
          dans son en-tête plutôt que flottante au-dessus sans libellé. */}
      <section>
        <GroupHeader
          title="Courbes de seuils"
          subtitle={
            facteur === "apport"
              // Une seule courbe ici, et le sous-titre doit DIRE pourquoi : le
              // rendement net ne dépend pas du financement, sa courbe serait une
              // droite horizontale — un graphe qui ne montre rien.
              ? "Cash-flow selon l'apport, avec vos seuils vert et rouge en repère. Le rendement net n'y figure pas : il ne dépend pas du financement."
              : `Rendement net et cash-flow selon le ${facteur === "prix" ? "prix d'achat" : "loyer mensuel"}, avec vos seuils vert et rouge en repère.`
          }
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="inline-flex rounded-lg border border-ink-200 bg-ink-50/50 p-0.5">
            <button
              onClick={() => switchFacteur("prix")}
              className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-all ${
                facteur === "prix"
                  ? "bg-white text-ink-900 shadow-sm"
                  : "text-ink-400 hover:text-ink-600"
              }`}
            >
              Par prix
            </button>
            <button
              onClick={() => { if (hasLoyerFactor) switchFacteur("loyer"); }}
              disabled={!hasLoyerFactor}
              className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-all ${
                facteur === "loyer"
                  ? "bg-white text-ink-900 shadow-sm"
                  : hasLoyerFactor
                    ? "text-ink-400 hover:text-ink-600"
                    : "text-ink-300 cursor-not-allowed"
              }`}
            >
              Par loyer
            </button>
            <button
              onClick={() => switchFacteur("apport")}
              disabled={combo == null}
              className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-all ${
                facteur === "apport"
                  ? "bg-white text-ink-900 shadow-sm"
                  : combo != null
                    ? "text-ink-400 hover:text-ink-600"
                    : "text-ink-300 cursor-not-allowed"
              }`}
            >
              Par apport
            </button>
          </div>
          {!hasLoyerFactor && apt.code_insee && !anilLoading && (
            <span className="text-xs text-ink-400">Fourchette loyer indisponible</span>
          )}
          {!apt.code_insee && (
            <span className="text-xs text-ink-400">Ajoutez un code postal pour le loyer</span>
          )}
          </div>
        </GroupHeader>

        {dataPoints.length > 0 && (
          <div
            // ⚠️ Une seule colonne sur l'axe apport : le rendement net ne dépend
            // pas du financement, sa courbe serait une droite horizontale. Une
            // grille à deux colonnes laisserait un trou, ou pire, un graphe plat
            // qu'on lirait comme « rien ne s'améliore ».
            className={`grid grid-cols-1 gap-8 transition-opacity duration-150 ${
              facteur === "apport" ? "" : "sm:grid-cols-2"
            }`}
            style={{ opacity: transitioning ? 0 : 1 }}
          >
            {facteur !== "apport" && (
            <ThresholdChart
              data={dataPoints}
              currentX={currentX}
              getY={getRendement}
              thresholds={{ vert: seuilsRendement.modeste, rouge: seuilsRendement.redhibitoire }}
              formatX={formatXFn}
              formatY={(v) => `${(v * 100).toFixed(1)} %`}
              title="Rendement net"
              hoveredIndex={hoveredIndex}
              onHover={setHoveredIndex}
              ghostPoint={ghostRendement}
              anilMarkers={anilMarkers}
            />
            )}
            <ThresholdChart
              data={dataPoints}
              currentX={currentX}
              getY={getCashflow}
              thresholds={{ vert: cashflowSeuils.vert, rouge: cashflowSeuils.rouge }}
              formatX={formatXFn}
              formatY={(v) => formatCashflow(v)}
              title="Cash-flow mensuel"
              hoveredIndex={hoveredIndex}
              onHover={setHoveredIndex}
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
      </section>
    </div>
  );
}

function PlaygroundKpiSummary({ sim, resolus }: { sim: SimulationResult; resolus: InputsResolus }) {
  const enrichissementNet = sim.annees[sim.annees.length - 1]?.enrichissement ?? null;
  const pointMort = sim.annees.findIndex((a) => a.enrichissement > 0);

  const kpis: { label: string; value: string; detail: string; icon: React.ReactNode }[] = [
    {
      label: "TRI",
      value: sim.tri != null ? formatPercent(sim.tri) : "—",
      detail: "Taux de rendement interne",
      icon: <TrendingUp className="h-4 w-4 text-accent-500" />,
    },
    {
      label: "Cash-flow moyen",
      value: formatEurosSigned(sim.cashflowMensuelMoyen),
      detail: "Mensuel après impôt",
      icon: <Banknote className="h-4 w-4 text-emerald-500" />,
    },
    {
      label: "Enrichissement net",
      value: enrichissementNet != null ? formatEuros(Math.round(enrichissementNet)) : "—",
      detail: `Au terme (${sim.annees.length} ans)`,
      icon: <Landmark className="h-4 w-4 text-violet-500" />,
    },
    {
      label: "Point mort",
      value: pointMort >= 0 ? `${pointMort + 1} ans` : "—",
      detail: "Enrichissement > 0",
      icon: <Check className="h-4 w-4 text-sky-500" />,
    },
  ];

  return (
    // ⚠️ « Projection financière » et non « Simulation financière » : ce dernier
    // libellé est déjà celui d'un ONGLET de la fiche bien (crédit année par
    // année). Deux écrans différents sous le même titre.
    <section className="space-y-3">
      <GroupHeader
        title="Projection financière"
        subtitle={`Hypothèses de votre profil : taux ${formatNombre(resolus.tauxCreditPct)} %, durée ${resolus.dureeAnnees} ans, TMI ${formatNombre(resolus.tmiPct)} %.`}
        className="mb-0"
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="flex items-start gap-3 rounded-xl border border-ink-100 bg-white p-4">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-50">
              {kpi.icon}
            </div>
            {/* Mêmes tokens que `StatCard` (label `text-xs font-medium ink-500`,
                sous-texte `text-xs ink-500`) : les deux familles de cartes
                cohabitent dans l'onglet Optimiser. Le `text-[10px] ink-400`
                d'avant tombait aussi sous le contraste AA (3,64:1 sur blanc). */}
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink-500">{kpi.label}</p>
              <p className="font-mono text-lg font-semibold tabular-nums text-ink-900">{kpi.value}</p>
              <p className="mt-0.5 text-xs text-ink-500">{kpi.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
