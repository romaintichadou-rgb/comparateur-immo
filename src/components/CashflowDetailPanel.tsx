"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { X } from "lucide-react";
import type { ApartmentWithComputed } from "@/lib/types";
import { formatApartmentTitle, formatEuros } from "@/lib/format";
import { cashflowTone, type CashflowSeuils, type RendementTone } from "@/lib/analyse/scoring";
import { defaultInputs, simulate, type AnneeSimulation } from "@/lib/simulation";

const TRANSITION_MS = 300;

// Mêmes 4 tonalités que le rendement / le reste de l'app.
const TONE_STYLES: Record<RendementTone, { wrap: string; label: string; value: string }> = {
  neutral: { wrap: "bg-ink-50", label: "text-ink-500", value: "text-ink-900" },
  positif: { wrap: "bg-emerald-50", label: "text-emerald-700", value: "text-emerald-800" },
  attention: { wrap: "bg-amber-50", label: "text-amber-700", value: "text-amber-800" },
  alerte: { wrap: "bg-red-50", label: "text-red-700", value: "text-red-700" },
};

const fmtSigned = (v: number) => `${v >= 0 ? "+" : "−"} ${formatEuros(Math.abs(Math.round(v)))}`;

export default function CashflowDetailPanel({
  apartment,
  seuils,
  onClose,
}: {
  apartment: ApartmentWithComputed | null;
  seuils: CashflowSeuils;
  onClose: () => void;
}) {
  const [displayed, setDisplayed] = useState<{ apartment: ApartmentWithComputed; seuils: CashflowSeuils } | null>(null);
  const [show, setShow] = useState(false);

  if (apartment && apartment !== displayed?.apartment) setDisplayed({ apartment, seuils });
  if (!apartment && show) setShow(false);

  useEffect(() => {
    if (apartment) {
      const raf = requestAnimationFrame(() => setShow(true));
      return () => cancelAnimationFrame(raf);
    }
    const t = setTimeout(() => setDisplayed(null), TRANSITION_MS);
    return () => clearTimeout(t);
  }, [apartment]);

  useEffect(() => {
    if (!displayed) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [displayed, onClose]);

  useLayoutEffect(() => {
    if (!displayed) return;
    const html = document.documentElement.style;
    const prev = html.overflow;
    html.overflow = "hidden";
    return () => {
      html.overflow = prev;
    };
  }, [displayed]);

  if (!displayed) return null;

  const apt = displayed.apartment;
  const result = simulate(apt, apt.simulation_inputs ?? defaultInputs());

  // Moyennes mensuelles sur toute la durée du crédit (indicateur du cash-flow
  // moyen) : loyers − charges d'exploitation − crédit − impôt = cash-flow.
  const n = result ? result.annees.length : 0;
  const avg = (f: (a: AnneeSimulation) => number) =>
    result && n > 0 ? result.annees.reduce((s, a) => s + f(a), 0) / n : 0;
  const loyersM = avg((a) => a.loyers) / 12;
  const chargesM = avg((a) => a.chargesExploitation) / 12;
  const creditM = result?.mensualiteTotale ?? 0;
  const impotM = avg((a) => a.impot) / 12;
  const cashflowMoyen = result?.cashflowMensuelMoyen ?? 0;
  const cashflowAn1 = result?.cashflowMensuelAn1 ?? 0;

  const toneMoyen = cashflowTone(result ? cashflowMoyen : null, displayed.seuils);
  const toneAn1 = cashflowTone(result ? cashflowAn1 : null, displayed.seuils);

  return (
    <div className="fixed inset-0 z-[2000]">
      <div
        className={`absolute inset-0 bg-ink-900/40 transition-opacity duration-300 ${show ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        className={`absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          show ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-6 py-3.5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
              Détail du cash-flow mensuel
            </h2>
            <p className="mt-0.5 truncate text-sm text-ink-400">{formatApartmentTitle(apt)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
          {!result ? (
            <p className="text-sm text-ink-500">
              Renseigne le prix d&apos;achat et le loyer pour simuler le cash-flow.
            </p>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <ResultTile
                  label="Cash-flow moyen"
                  sub="moyenne sur la durée du crédit"
                  value={fmtSigned(cashflowMoyen)}
                  unit="/mois"
                  tone={toneMoyen}
                />
                <ResultTile
                  label="Cash-flow année 1"
                  sub="première année"
                  value={fmtSigned(cashflowAn1)}
                  unit="/mois"
                  tone={toneAn1}
                />
              </div>

              <section className="rounded-xl border border-ink-200 p-4 sm:p-5">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Financement
                </h3>
                <ul className="divide-y divide-ink-100 text-sm">
                  <Row label="Montant emprunté" value={result.montantEmprunte} sign={false} />
                  <Row label="Apport personnel" value={result.apport} sign={false} />
                  <Row label="Mensualité de crédit (assurance incluse)" value={result.mensualiteTotale} sign={false} />
                </ul>
              </section>

              <section className="rounded-xl border border-ink-200 p-4 sm:p-5">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Flux mensuels moyens
                </h3>
                <ul className="divide-y divide-ink-100 text-sm">
                  <Row label="Loyers encaissés" value={loyersM} />
                  <Row label="Charges d'exploitation" value={-chargesM} />
                  <Row label="Mensualité de crédit" value={-creditM} />
                  <Row label="Impôt LMNP (moyen)" value={-impotM} />
                  <TotalRow label="Cash-flow moyen" value={cashflowMoyen} tone={toneMoyen} />
                </ul>
              </section>

              <p className="text-xs text-ink-400">
                Cash-flow moyen après impôt (régime LMNP réel), lissé sur toute la durée du crédit.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultTile({
  label,
  sub,
  value,
  unit,
  tone,
}: {
  label: string;
  sub: string;
  value: string;
  unit: string;
  tone: RendementTone;
}) {
  const t = TONE_STYLES[tone];
  return (
    <div className={`rounded-xl p-4 ${t.wrap}`}>
      <p className={`text-xs font-medium ${t.label}`}>{label}</p>
      <p className={`mt-1 font-mono text-3xl font-bold tabular-nums ${t.value}`}>
        {value}
        <span className="ml-1 text-sm font-normal opacity-70">{unit}</span>
      </p>
      <p className={`mt-1.5 text-[11px] ${t.label}`}>{sub}</p>
    </div>
  );
}

function Row({ label, value, sign = true }: { label: string; value: number; sign?: boolean }) {
  const negative = value < 0;
  return (
    <li className="flex items-baseline justify-between gap-3 py-2">
      <span className="flex min-w-0 items-baseline gap-2 text-ink-600">
        {sign && (
          <span className="inline-block w-3 shrink-0 text-center font-semibold text-ink-400">
            {negative ? "−" : "+"}
          </span>
        )}
        <span>{label}</span>
      </span>
      <span className="shrink-0 font-mono font-medium tabular-nums text-ink-800">
        {formatEuros(Math.abs(Math.round(value)))}
      </span>
    </li>
  );
}

function TotalRow({ label, value, tone }: { label: string; value: number; tone: RendementTone }) {
  const cls = TONE_STYLES[tone].value;
  return (
    <li className="flex items-baseline justify-between gap-3 py-2">
      <span className="font-semibold text-ink-900">{label}</span>
      <span className={`shrink-0 font-mono text-base font-bold tabular-nums ${cls}`}>
        {fmtSigned(value)} <span className="text-xs font-normal opacity-70">/mois</span>
      </span>
    </li>
  );
}
