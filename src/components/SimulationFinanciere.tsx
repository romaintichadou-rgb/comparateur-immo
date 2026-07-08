"use client";

import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Banknote, Calculator, Info, Landmark, PieChart, ReceiptText, TrendingUp } from "lucide-react";
import type { ApartmentWithComputed } from "@/lib/types";
import type { AppSettings } from "@/lib/settings";
import { defaultInputs, simulate, LMNP, type AnneeSimulation, type SimulationInputs } from "@/lib/simulation";
import { NumberField, SelectField } from "@/components/form/Fields";
import { RENDEMENT_HOVER_RING } from "@/lib/analyse/scoring";

/**
 * Onglet "Simulation financière" : cash-flow mensuel réel en LMNP réel,
 * année par année sur la durée du prêt. Le simulateur de crédit est
 * modifiable ; l'exploitation (loyer, charges, taxe foncière…) vient des
 * données du bien. Tout est recalculé en direct, rien n'est stocké.
 */

const TMI_OPTIONS = ["11", "30", "41", "45"] as const;

// Seuils personnels (page Paramètres) : au-dessus du seuil vert c'est "GO",
// en dessous du seuil rouge c'est un point d'alerte, entre les deux c'est
// acceptable.
interface CashflowSeuils {
  vert: number;
  rouge: number;
}

function cashflowTone(monthly: number, seuils: CashflowSeuils): "positif" | "attention" | "alerte" {
  if (monthly >= seuils.vert) return "positif";
  if (monthly >= seuils.rouge) return "attention";
  return "alerte";
}

function cashflowTextClass(monthly: number, seuils: CashflowSeuils): string {
  const tone = cashflowTone(monthly, seuils);
  return tone === "positif" ? "text-emerald-700" : tone === "attention" ? "text-amber-700" : "text-red-600";
}

export default function SimulationFinanciere({
  apartment,
  settings,
}: {
  apartment: ApartmentWithComputed;
  settings: AppSettings;
}) {
  const cashflowSeuils: CashflowSeuils = {
    vert: settings.cashflowSeuilVertEuros,
    rouge: settings.cashflowSeuilRougeEuros,
  };
  const [inputs, setInputs] = useState<SimulationInputs>(defaultInputs);

  const result = useMemo(() => simulate(apartment, inputs), [apartment, inputs]);

  function set<K extends keyof SimulationInputs>(key: K, value: SimulationInputs[K]) {
    setInputs((i) => ({ ...i, [key]: value }));
  }

  if (!result) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <Calculator className="mx-auto h-8 w-8 text-slate-300" />
        <h2 className="mt-3 text-lg font-semibold text-slate-900">Simulation financière</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Renseigne d&apos;abord un loyer et un prix dans l&apos;onglet « Description de
          l&apos;appartement » pour simuler le cash-flow.
        </p>
      </div>
    );
  }

  const cfMoyen = result.cashflowMensuelMoyen;
  const cfAn1 = result.cashflowMensuelAn1;

  return (
    <div className="space-y-6">
      {/* Résultat principal : le cash-flow mensuel concret */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ResultCard
          label="Mensualité de crédit"
          sub="assurance incluse"
          value={`${euros(result.mensualiteTotale)} €/mois`}
          tone="neutral"
        />
        <ResultCard
          label="Cash-flow mensuel — année 1"
          sub="après impôt LMNP"
          value={`${signe(cfAn1)} €/mois`}
          tone={cashflowTone(cfAn1, cashflowSeuils)}
        />
        <ResultCard
          label={`Cash-flow mensuel moyen — ${inputs.dureeAnnees} ans`}
          sub="après impôt LMNP"
          value={`${signe(cfMoyen)} €/mois`}
          tone={cashflowTone(cfMoyen, cashflowSeuils)}
          emphase
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Simulateur de crédit */}
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <Landmark className="h-4 w-4 text-slate-400" />
            Crédit immobilier
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField
              label="Montant emprunté"
              value={result.montantEmprunte}
              onChange={(v) => set("montantEmprunte", v)}
              suffix="€"
              hint={
                result.montantAutomatique ? (
                  <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
                    auto
                  </span>
                ) : undefined
              }
            />
            <NumberField
              label="Taux du crédit"
              value={inputs.tauxCreditPct}
              onChange={(v) => set("tauxCreditPct", v ?? 0)}
              suffix="%/an"
            />
            <NumberField
              label="Durée"
              value={inputs.dureeAnnees}
              onChange={(v) => set("dureeAnnees", Math.max(1, Math.min(35, v ?? 25)))}
              suffix="ans"
            />
            <NumberField
              label="Assurance emprunteur"
              value={inputs.tauxAssurancePct}
              onChange={(v) => set("tauxAssurancePct", v ?? 0)}
              suffix="%/an"
            />
          </div>
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Mensualité hors assurance : <strong className="text-slate-900">{euros(result.mensualiteHorsAssurance)} €</strong>
            {" · "}assurance : <strong className="text-slate-900">{euros(result.assuranceMensuelle)} €</strong>
            {" · "}coût total du crédit : <strong className="text-slate-900">{euros(result.coutCredit)} €</strong>
            {" · "}apport personnel : <strong className="text-slate-900">{euros(result.apport)} €</strong>
          </div>
          <p className="text-xs text-slate-400">
            En mode <strong className="font-medium text-slate-500">auto</strong>, le montant emprunté
            suit en temps réel le prix d&apos;achat + les travaux (hors frais de notaire, supposés
            couverts par l&apos;apport), y compris pendant la saisie dans les autres onglets. Modifie
            le champ pour le figer (simuler un apport différent) ; vide-le pour repasser en auto.
          </p>
        </section>

        {/* Détail mensuel année 1 — la "participation mensuelle" */}
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <Banknote className="h-4 w-4 text-slate-400" />
            Détail mensuel — année 1
          </h3>
          <ul className="divide-y divide-slate-100 text-sm">
            <WaterfallRow label="Loyer (CC)" value={apartment.loyer_retenu ?? 0} plus />
            <WaterfallRow label="Mensualité de crédit (assurance incl.)" value={-result.mensualiteTotale} />
            <WaterfallRow
              label="Charges (copro, taxe foncière, assurance, gestion)"
              value={-result.chargesMensuelles}
            />
            <WaterfallRow label="Impôt LMNP (IR + prélèvements sociaux)" value={-result.impotMensuelAn1} />
            <li className="flex items-center justify-between py-3">
              <span className="font-semibold text-slate-900">Cash-flow mensuel</span>
              <span className={`text-lg font-bold ${cashflowTextClass(cfAn1, cashflowSeuils)}`}>
                {signe(cfAn1)} €
              </span>
            </li>
          </ul>
          <p className="text-xs text-slate-400">
            Avant impôt : {signe(result.cashflowMensuelAvantImpotAn1)} €/mois.
          </p>
        </section>
      </div>

      {/* Fiscalité LMNP */}
      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <ReceiptText className="h-4 w-4 text-slate-400" />
          Fiscalité — LMNP au réel
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SelectField
            label="Tranche marginale d'imposition (TMI)"
            value={String(inputs.tmiPct) as (typeof TMI_OPTIONS)[number]}
            onChange={(v) => set("tmiPct", Number(v))}
            options={TMI_OPTIONS}
            allowEmpty={false}
            hint={<span className="text-xs font-normal text-slate-400">+ {LMNP.prelevementsSociauxPct} % de prélèvements sociaux</span>}
          />
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm sm:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Amortissements annuels déductibles
            </p>
            <p className="mt-1 text-slate-700">
              Bâti {euros(result.amortissements.bati)} € <span className="text-slate-400">(90 % du prix · 40 ans)</span>
              {result.amortissements.travaux > 0 && (
                <> · Travaux {euros(result.amortissements.travaux)} € <span className="text-slate-400">(15 ans)</span></>
              )}
              {result.amortissements.notaire > 0 && (
                <> · Notaire {euros(result.amortissements.notaire)} € <span className="text-slate-400">(5 ans)</span></>
              )}
            </p>
          </div>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-slate-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Au régime réel, les amortissements ne peuvent pas créer de déficit : ils sont plafonnés au
          résultat de l&apos;année et l&apos;excédent est reporté sans limite (art. 39 C). Résultat
          imposable année 1 : {euros(result.annees[0].resultatImposable)} € → impôt{" "}
          {euros(result.annees[0].impot)} €/an.
        </p>
      </section>

      {/* Tableau année par année */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h3 className="flex items-center gap-2 p-5 pb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <Calculator className="h-4 w-4 text-slate-400" />
          Cash-flow année par année
        </h3>
        <div className="grid grid-cols-2 gap-4 px-5 pb-4">
          <NumberField
            label="Revalorisation du bien"
            value={inputs.revalorisationBienPct}
            onChange={(v) => set("revalorisationBienPct", v ?? 0)}
            suffix="%/an"
          />
          <NumberField
            label="Revalorisation du loyer"
            value={inputs.revalorisationLoyerPct}
            onChange={(v) => set("revalorisationLoyerPct", v ?? 0)}
            suffix="%/an"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2 font-medium">Année</th>
                <th className="px-3 py-2 text-right font-medium">Loyers</th>
                <th className="px-3 py-2 text-right font-medium">Crédit</th>
                <th className="px-3 py-2 text-right font-medium">Charges</th>
                <th className="px-3 py-2 text-right font-medium">Impôt</th>
                <th className="px-3 py-2 text-right font-medium">Cash-flow /an</th>
                <th className="px-5 py-2 text-right font-medium">/mois</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {result.annees.map((a) => (
                <tr key={a.annee} className="hover:bg-slate-50/60">
                  <td className="px-5 py-1.5 text-slate-500">{a.annee}</td>
                  <td className="px-3 py-1.5 text-right text-slate-700">{euros(a.loyers)}</td>
                  <td className="px-3 py-1.5 text-right text-slate-700">
                    {euros(-(result.mensualiteTotale * 12))}
                  </td>
                  <td className="px-3 py-1.5 text-right text-slate-700">{euros(-a.chargesExploitation)}</td>
                  <td className="px-3 py-1.5 text-right text-slate-700">{euros(-a.impot)}</td>
                  <td className={`px-3 py-1.5 text-right font-medium ${cashflowTextClass(a.cashflowMensuel, cashflowSeuils)}`}>
                    {signe(a.cashflowAnnuel)}
                  </td>
                  <td className={`px-5 py-1.5 text-right font-semibold ${cashflowTextClass(a.cashflowMensuel, cashflowSeuils)}`}>
                    {signe(a.cashflowMensuel)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-xs text-slate-400">
          Total impôts sur {inputs.dureeAnnees} ans : {euros(result.totalImpots)} € · loyer revalorisé à{" "}
          {inputs.revalorisationLoyerPct} %/an ; charges de copropriété et taxe foncière supposées
          constantes (pas de revalorisation).
        </p>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr]">
        {/* Financement du projet */}
        <section className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <PieChart className="h-4 w-4 text-slate-400" />
            Financement du projet
          </h3>
          <p className="text-xs text-slate-400">
            {`D'où vient l'argent qui couvre le coût total de l'opération sur ${inputs.dureeAnnees} ans : les loyers collectés, une économie fiscale éventuelle, et la part de l'apport encore non « remboursée » par le cash-flow au terme.`}
          </p>
          <FinancementDonut financement={result.financementProjet} />
        </section>

        {/* Évolution du patrimoine */}
        <section className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <TrendingUp className="h-4 w-4 text-slate-400" />
            Évolution du patrimoine
          </h3>
          <p className="text-xs text-slate-400">
            Chaque année : la dette restante (ce qui reste dû à la banque), l&apos;enrichissement net
            (valeur du bien au-delà de la dette et de l&apos;apport non récupéré), et l&apos;effort
            d&apos;épargne encore porté (apport pas encore compensé par le cash-flow cumulé). Hypothèse
            de revalorisation du bien : {inputs.revalorisationBienPct} %/an — hors fiscalité de la
            plus-value à la revente.
          </p>
          <PatrimoineChart annees={result.annees} />
        </section>
      </div>
    </div>
  );
}

const FINANCEMENT_COLORS = { loyers: "#6366f1", economieFiscale: "#a5b4fc", participation: "#f59e0b" };

interface TooltipState {
  x: number;
  y: number;
  content: ReactNode;
}

/** Tooltip sombre positionnée au-dessus du curseur, dans un conteneur `relative`. */
function ChartTooltip({ tooltip }: { tooltip: TooltipState }) {
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg"
      style={{ left: tooltip.x, top: tooltip.y - 10 }}
    >
      {tooltip.content}
    </div>
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-slate-300">{label}</span>
      <span className="ml-auto font-semibold text-white">{value}</span>
    </div>
  );
}

function FinancementDonut({
  financement,
}: {
  financement: { loyers: number; economieFiscale: number; participation: number; total: number };
}) {
  const { loyers, economieFiscale, participation, total } = financement;
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  if (total <= 0) {
    return <p className="text-sm text-slate-400">Données insuffisantes pour ce calcul.</p>;
  }

  const segments = [
    { key: "loyers", label: "Loyers", value: loyers, color: FINANCEMENT_COLORS.loyers },
    { key: "economieFiscale", label: "Économie fiscale", value: economieFiscale, color: FINANCEMENT_COLORS.economieFiscale },
    { key: "participation", label: "Participation", value: participation, color: FINANCEMENT_COLORS.participation },
  ];

  const size = 140;
  const stroke = 24;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  // Géométrie de chaque segment précalculée une fois : position de départ sur
  // la circonférence (pour le dessin de l'arc) et angle médian (pour placer le
  // pourcentage au centre de l'arc, toujours visible sans survol).
  let cursor = 0;
  const geoSegments = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const frac = s.value / total;
      const dash = frac * c;
      const start = cursor;
      cursor += dash;
      const angle = ((start + dash / 2) / c) * 2 * Math.PI;
      return { ...s, frac, dash, start, angle };
    });

  function showTooltip(e: MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      content: (
        <div className="space-y-1">
          {segments.map((s) => (
            <TooltipRow key={s.key} color={s.color} label={s.label} value={`${euros(s.value)} € (${pct(s.value, total)} %)`} />
          ))}
        </div>
      ),
    });
  }

  return (
    <div ref={containerRef} className="relative flex flex-col items-center gap-4">
      {tooltip && <ChartTooltip tooltip={tooltip} />}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="-rotate-90 cursor-default"
          onMouseMove={showTooltip}
          onMouseLeave={() => setTooltip(null)}
        >
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
          {geoSegments.map((s) => (
            <circle
              key={s.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${s.dash} ${c - s.dash}`}
              strokeDashoffset={-s.start}
            />
          ))}
          {geoSegments
            .filter((s) => s.frac >= 0.06)
            .map((s) => {
              const lx = size / 2 + r * Math.cos(s.angle);
              const ly = size / 2 + r * Math.sin(s.angle);
              return (
                <g key={`pct-${s.key}`} transform={`rotate(90 ${lx} ${ly})`}>
                  <text
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={12}
                    fontWeight={700}
                    fill="#ffffff"
                    stroke="rgba(0,0,0,0.35)"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {pct(s.value, total)}%
                  </text>
                </g>
              );
            })}
        </svg>
      </div>
      <ul className="w-full max-w-[220px] space-y-1.5 text-xs">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
            <span className="whitespace-nowrap font-medium text-slate-800">
              {euros(s.value)} € <span className="text-slate-400">({pct(s.value, total)} %)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const PATRIMOINE_COLORS = { dette: "#93c5fd", enrichissement: "#64748b", effortEpargne: "#1e3a8a" };

function PatrimoineChart({ annees }: { annees: AnneeSimulation[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const maxTotal = Math.max(
    1,
    ...annees.map((a) => a.capitalRestantDu + a.enrichissement + a.effortEpargne)
  );
  const barWidth = 22;
  const gap = 10;
  const chartHeight = 220;
  const width = annees.length * (barWidth + gap) + gap;

  const scale = (v: number) => (v / maxTotal) * chartHeight;

  function showTooltip(e: MouseEvent, a: AnneeSimulation) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      content: (
        <div className="space-y-1">
          <p className="mb-1 font-semibold text-white">Année {a.annee}</p>
          <TooltipRow color={PATRIMOINE_COLORS.dette} label="Dette restante" value={`${euros(a.capitalRestantDu)} €`} />
          <TooltipRow color={PATRIMOINE_COLORS.enrichissement} label="Enrichissement" value={`${euros(a.enrichissement)} €`} />
          <TooltipRow color={PATRIMOINE_COLORS.effortEpargne} label="Effort d'épargne" value={`${euros(a.effortEpargne)} €`} />
        </div>
      ),
    });
  }

  return (
    <div ref={containerRef} className="relative">
      {tooltip && <ChartTooltip tooltip={tooltip} />}
      <svg
        viewBox={`0 0 ${width} ${chartHeight + 30}`}
        preserveAspectRatio="none"
        width="100%"
        height={chartHeight + 30}
        className="block"
      >
        {annees.map((a, i) => {
          const x = gap + i * (barWidth + gap);
          const hDette = scale(a.capitalRestantDu);
          const hEnrichissement = scale(a.enrichissement);
          const hEffort = scale(a.effortEpargne);
          let y = chartHeight;
          const rects: { y: number; h: number; color: string }[] = [];
          y -= hDette;
          rects.push({ y, h: hDette, color: PATRIMOINE_COLORS.dette });
          y -= hEnrichissement;
          rects.push({ y, h: hEnrichissement, color: PATRIMOINE_COLORS.enrichissement });
          y -= hEffort;
          rects.push({ y, h: hEffort, color: PATRIMOINE_COLORS.effortEpargne });

          const showLabel = annees.length <= 15 || i % Math.ceil(annees.length / 15) === 0;

          return (
            <g
              key={a.annee}
              className="cursor-default"
              onMouseMove={(e) => showTooltip(e, a)}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Zone de survol pleine hauteur : plus facile à cibler que les seuls segments visibles. */}
              <rect x={x} y={0} width={barWidth} height={chartHeight} fill="transparent" />
              {rects.map(
                (r, ri) =>
                  r.h > 0.5 && (
                    <rect key={ri} x={x} y={r.y} width={barWidth} height={r.h} fill={r.color} rx={1} />
                  )
              )}
              {showLabel && (
                <text x={x + barWidth / 2} y={chartHeight + 16} textAnchor="middle" fontSize={10} fill="#94a3b8">
                  {a.annee}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
        <LegendDot color={PATRIMOINE_COLORS.dette} label="Dette restante" />
        <LegendDot color={PATRIMOINE_COLORS.enrichissement} label="Enrichissement" />
        <LegendDot color={PATRIMOINE_COLORS.effortEpargne} label="Effort d'épargne" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function pct(value: number, total: number): string {
  return total > 0 ? Math.round((value / total) * 100).toString() : "0";
}

export function ResultCard({
  label,
  sub,
  value,
  tone,
  emphase = false,
  onClick,
}: {
  label: string;
  sub: string;
  value: string;
  tone: "neutral" | "positif" | "attention" | "alerte";
  emphase?: boolean;
  onClick?: () => void;
}) {
  const tones = {
    neutral: "bg-slate-50 text-slate-900",
    positif: "bg-emerald-50 text-emerald-800",
    attention: "bg-amber-50 text-amber-800",
    alerte: "bg-red-50 text-red-700",
  } as const;
  const labelTones = {
    neutral: "text-slate-500",
    positif: "text-emerald-700",
    attention: "text-amber-700",
    alerte: "text-red-700",
  } as const;
  const rings = {
    neutral: "ring-slate-200",
    positif: "ring-emerald-200",
    attention: "ring-amber-200",
    alerte: "ring-red-200",
  } as const;
  const content = (
    <>
      <p className={`text-xs font-medium ${labelTones[tone]}`}>{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className={`mt-0.5 text-[11px] ${labelTones[tone]} opacity-80`}>{sub}</p>
    </>
  );
  const className = `rounded-xl p-5 ${tones[tone]} ${emphase ? `ring-2 ring-inset ${rings[tone]}` : ""}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title="Voir le détail du calcul"
        className={`w-full text-left transition ${RENDEMENT_HOVER_RING[tone]} ${className}`}
      >
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

function WaterfallRow({ label, value, plus = false }: { label: string; value: number; plus?: boolean }) {
  return (
    <li className="flex items-center justify-between py-2">
      <span className="text-slate-600">
        <span className="mr-1.5 inline-block w-3 text-center font-semibold text-slate-400">{plus ? "+" : "−"}</span>
        {label}
      </span>
      <span className="font-medium text-slate-800">{euros(Math.abs(value))} €</span>
    </li>
  );
}

function euros(n: number): string {
  const r = Math.round(n) || 0; // normalise -0 → 0
  return r.toLocaleString("fr-FR");
}

function signe(n: number): string {
  const r = Math.round(n) || 0; // normalise -0 → 0
  return `${r > 0 ? "+" : ""}${r.toLocaleString("fr-FR")}`;
}
