"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { X, ArrowDown, Info, Sparkles, Database, SlidersHorizontal } from "lucide-react";
import type { ApartmentWithComputed } from "@/lib/types";
import { isImmeuble } from "@/lib/types";
import { formatApartmentTitle, formatEuros, sanitizeJustification } from "@/lib/format";
import { isAiEstimated } from "@/lib/estimates";
import { AiEstimatedBadge } from "@/components/form/Fields";

const TRANSITION_MS = 300;

const MAJORATION_MEUBLE = 0.12;
const PROVISION_CHARGES_M2 = 2.5;

interface AnilData {
  loyerM2: number;
  min: number;
  max: number;
  nbObs: number;
  annee: number;
}

export default function LoyerDetailPanel({
  apartment,
  onClose,
}: {
  apartment: ApartmentWithComputed | null;
  onClose: () => void;
}) {
  const [displayed, setDisplayed] = useState<ApartmentWithComputed | null>(null);
  const [show, setShow] = useState(false);
  const [anil, setAnil] = useState<AnilData | null>(null);
  const [anilLoading, setAnilLoading] = useState(false);

  if (apartment && apartment !== displayed) {
    setDisplayed(apartment);
  }
  if (!apartment && show) {
    setShow(false);
  }

  useEffect(() => {
    if (apartment) {
      const raf = requestAnimationFrame(() => setShow(true));
      return () => cancelAnimationFrame(raf);
    }
    const t = setTimeout(() => setDisplayed(null), TRANSITION_MS);
    return () => clearTimeout(t);
  }, [apartment]);

  useEffect(() => {
    if (!apartment?.code_insee) {
      setAnil(null);
      return;
    }
    let cancelled = false;
    setAnilLoading(true);
    fetch(`/api/loyer-reference?code_insee=${encodeURIComponent(apartment.code_insee)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setAnil(data.ref ?? null);
      })
      .catch(() => {
        if (!cancelled) setAnil(null);
      })
      .finally(() => {
        if (!cancelled) setAnilLoading(false);
      });
    return () => { cancelled = true; };
  }, [apartment?.code_insee]);

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

  const apt = displayed;
  const loyer = apt.loyer_retenu;
  const surface = apt.surface_m2;
  const immeuble = isImmeuble(apt.type_bien);
  const hasSurface = surface != null && surface > 0;
  const hasLoyer = loyer != null && loyer > 0;

  const loyerM2 = hasLoyer && hasSurface ? loyer / surface : null;
  const loyerAnnuel = hasLoyer ? loyer * 12 : null;
  const aiEstimated = isAiEstimated(apt, "loyer_retenu");

  const anilCCm2 = anil ? anil.loyerM2 * (1 + MAJORATION_MEUBLE) + PROVISION_CHARGES_M2 : null;
  const anilMinCC = anil ? anil.min * (1 + MAJORATION_MEUBLE) + PROVISION_CHARGES_M2 : null;
  const anilMaxCC = anil ? anil.max * (1 + MAJORATION_MEUBLE) + PROVISION_CHARGES_M2 : null;
  const anilMedian = anilCCm2 != null && hasSurface ? Math.round(anilCCm2 * surface) : null;
  const anilMinTotal = anilMinCC != null && hasSurface ? Math.round(anilMinCC * surface) : null;
  const anilMaxTotal = anilMaxCC != null && hasSurface ? Math.round(anilMaxCC * surface) : null;

  const ecartPct =
    hasLoyer && anilMedian != null && anilMedian > 0
      ? ((loyer - anilMedian) / anilMedian) * 100
      : null;

  const caracteristiques: string[] = [];
  if (apt.type_bien) caracteristiques.push(apt.type_bien);
  if (hasSurface) caracteristiques.push(`${surface} m²`);
  if (apt.nb_pieces != null) caracteristiques.push(`${apt.nb_pieces} pièce(s)`);
  if (apt.etage) caracteristiques.push(`étage ${apt.etage}`);
  if (apt.ascenseur === true) caracteristiques.push("ascenseur");
  if (apt.etat_bien) caracteristiques.push(apt.etat_bien);
  if (apt.dpe) caracteristiques.push(`DPE ${apt.dpe}`);
  if (apt.travaux != null && apt.travaux > 0) caracteristiques.push("travaux prévus");

  return (
    <div className="fixed inset-0 z-[2000]">
      <div
        className={`absolute inset-0 bg-ink-900/40 transition-opacity duration-300 ${
          show ? "opacity-100" : "opacity-0"
        }`}
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
              Détail du calcul du loyer
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

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!hasLoyer ? (
            <p className="text-sm text-ink-500">
              Aucun loyer renseigné — remplis le champ loyer pour voir le détail.
            </p>
          ) : (
            <div className="space-y-5">

              {/* ── ÉTAPE 1 : Ancre ANIL ── */}
              {anilLoading && (
                <div className="rounded-lg bg-ink-50 p-4 text-sm text-ink-400">
                  Chargement des données de marché…
                </div>
              )}
              {anil && anilMedian != null && anilMinTotal != null && anilMaxTotal != null && hasSurface && (
                <section className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex rounded-lg bg-ink-100 p-1.5 text-ink-500">
                      <Database className="h-3.5 w-3.5" />
                    </span>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                      Étape 1 — Référence de marché
                    </h3>
                  </div>
                  <div className="rounded-lg border border-ink-100 bg-white p-4 space-y-3">
                    <p className="text-sm text-ink-600">
                      Point de départ : le loyer médian observé dans la commune (source ANIL {anil.annee}, {anil.nbObs.toLocaleString("fr-FR")} annonces),
                      converti en <strong>CC meublé</strong>.
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-ink-50 p-3">
                        <p className="text-[11px] text-ink-400">HC nu</p>
                        <p className="mt-0.5 font-mono text-base font-semibold text-ink-700">
                          {formatEuros(Math.round(anil.loyerM2 * surface))}
                        </p>
                      </div>
                      <div className="flex items-center justify-center text-ink-300">
                        <ArrowDown className="h-4 w-4 rotate-[-90deg]" />
                      </div>
                      <div className="rounded-lg bg-accent-50 p-3">
                        <p className="text-[11px] text-accent-500">CC meublé</p>
                        <p className="mt-0.5 font-mono text-base font-semibold text-accent-700">
                          {formatEuros(anilMedian)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-ink-400">
                      <span>Majoration meublé +{Math.round(MAJORATION_MEUBLE * 100)}%</span>
                      <span>Charges +{hasSurface ? formatEuros(Math.round(PROVISION_CHARGES_M2 * surface)) : `${PROVISION_CHARGES_M2} €/m²`}/mois</span>
                      <span>{surface} m²</span>
                    </div>
                    <div className="border-t border-ink-100 pt-2">
                      <ul className="divide-y divide-ink-100 text-sm">
                        <Row label="Loyer médian marché CC" value={anilMedian} suffix="/mois" />
                        <li className="flex items-center justify-between gap-3 py-1.5 text-sm text-ink-600">
                          <span>Fourchette</span>
                          <span className="font-medium text-ink-800">
                            {formatEuros(anilMinTotal)} – {formatEuros(anilMaxTotal)}<span className="text-ink-400 text-xs ml-0.5">/mois</span>
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <Info className="h-3 w-3 text-ink-300 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-ink-400">
                      Source : Carte des loyers ANIL {anil.annee}. Conversion en CC meublé (LMNP) par Immoscore.
                    </p>
                  </div>
                </section>
              )}

              {/* ── ÉTAPE 2 : Ajustement IA ── */}
              {aiEstimated && (
                <section className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex rounded-lg bg-ink-100 p-1.5 text-ink-500">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                    </span>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                      Étape 2 — Ajustement IA
                    </h3>
                  </div>
                  <div className="rounded-lg border border-ink-100 bg-white p-4 space-y-3">
                    <p className="text-sm text-ink-600">
                      À partir du loyer médian{anilMedian != null && <> (<strong>{formatEuros(anilMedian)}</strong>)</>},
                      l&apos;IA croise <strong>annonces récentes</strong> du secteur et <strong>caractéristiques du bien</strong> pour
                      ajuster le loyer à la hausse ou à la baisse.
                    </p>
                    {caracteristiques.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {caracteristiques.map((c) => (
                          <span
                            key={c}
                            className="rounded-full bg-ink-50 px-2.5 py-0.5 text-[11px] font-medium text-ink-600"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                    {apt.loyer_justification && (
                      <div className="rounded-lg bg-ink-50 p-3 text-sm text-ink-600 whitespace-pre-line">
                        {renderBold(sanitizeJustification(apt.loyer_justification, apt.surface_m2, "€/mois", 6))}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* ── ÉTAPE 3 : Résultat final ── */}
              <section className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex rounded-lg bg-accent-50 p-1.5 text-accent-500">
                    <Sparkles className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                    {aiEstimated ? "Étape 3 — " : ""}Loyer retenu
                  </h3>
                </div>
                <div className="rounded-lg border border-ink-100 bg-white p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-accent-50 p-4">
                      <p className="text-xs font-medium text-accent-600">Loyer mensuel CC</p>
                      <p className="mt-1 text-3xl font-bold text-accent-800">
                        {formatEuros(loyer)}
                      </p>
                      <p className="mt-1 text-[11px] text-accent-600">
                        {immeuble ? "total tous lots" : "charges comprises"}
                        {aiEstimated && " · estimation IA"}
                      </p>
                    </div>
                    {ecartPct != null ? (
                      <div className={`rounded-xl p-4 ${ecartTone(ecartPct, "bg")}`}>
                        <p className={`text-xs font-medium ${ecartTone(ecartPct, "text")}`}>Écart vs marché</p>
                        <p className={`mt-1 text-3xl font-bold font-mono ${ecartTone(ecartPct, "value")}`}>
                          {ecartPct > 0 ? "+" : ""}{ecartPct.toFixed(0)} %
                        </p>
                        <p className={`mt-1 text-[11px] ${ecartTone(ecartPct, "sub")}`}>
                          vs {anilMedian != null ? formatEuros(anilMedian) : "médian"}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl bg-ink-50 p-4">
                        <p className="text-xs font-medium text-ink-500">Loyer annuel</p>
                        <p className="mt-1 text-3xl font-bold text-ink-900">
                          {formatEuros(loyerAnnuel!)}
                        </p>
                        <p className="mt-1 text-[11px] text-ink-500">× 12 mois</p>
                      </div>
                    )}
                  </div>

                  <ul className="divide-y divide-ink-100 text-sm">
                    <Row
                      label="Loyer mensuel CC"
                      value={loyer}
                      suffix="/mois"
                      badge={aiEstimated && <AiEstimatedBadge />}
                    />
                    <Row label="Loyer annuel" value={loyerAnnuel!} suffix="/an" bold />
                  </ul>
                </div>
              </section>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ecartTone(pct: number, slot: "bg" | "text" | "value" | "sub"): string {
  // Au-dessus du marché (0 à +15%) = bon pour l'investisseur → vert
  // Très au-dessus (>15%) = optimiste/risqué → rouge
  // En-dessous du marché = mauvais → ambre (léger) ou rouge (fort)
  let tone: "emerald" | "amber" | "red";
  if (pct > 15) tone = "red";
  else if (pct >= 0) tone = "emerald";
  else if (pct >= -10) tone = "amber";
  else tone = "red";

  const map = {
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600", value: "text-emerald-700", sub: "text-emerald-500" },
    amber:   { bg: "bg-amber-50",   text: "text-amber-600",   value: "text-amber-700",   sub: "text-amber-500" },
    red:     { bg: "bg-red-50",     text: "text-red-600",     value: "text-red-700",     sub: "text-red-500" },
  };
  return map[tone][slot];
}

function renderBold(text: string): ReactNode {
  return text.split(/(↑[^↓.]*|↓[^↑.]*|\d[\d\s]*€[^\s]*|\d+,?\d*\s*€|\d+[\s,.]?\d*\s*%|fourchette\s+haute|fourchette\s+basse|au-dessus|en-dessous|valorisation|luminosité|balcon|terrasse|rénov\w*|travaux|parking|cave|ascenseur|calme|vue)/gi).map((seg, i) => {
    if (i % 2 === 0) return seg;
    if (seg.startsWith("↑")) {
      return (
        <span key={i} className="font-semibold text-emerald-700">{seg}</span>
      );
    }
    if (seg.startsWith("↓")) {
      return (
        <span key={i} className="font-semibold text-amber-700">{seg}</span>
      );
    }
    return (
      <strong key={i} className="font-semibold text-ink-900">{seg}</strong>
    );
  });
}

function Row({
  label,
  value,
  suffix,
  badge,
  bold,
}: {
  label: string;
  value: number;
  suffix?: string;
  badge?: ReactNode;
  bold?: boolean;
}) {
  return (
    <li className={`flex items-center justify-between gap-3 py-1.5 ${bold ? "border-t border-ink-200 pt-2" : ""}`}>
      <span className={`flex items-center gap-1.5 ${bold ? "font-semibold text-ink-900" : "text-ink-600"}`}>
        {label}
        {badge}
      </span>
      <span className={`shrink-0 ${bold ? "text-base font-bold text-ink-900" : "font-medium text-ink-800"}`}>
        {formatEuros(value)}{suffix ? <span className="text-ink-400 text-xs ml-0.5">{suffix}</span> : null}
      </span>
    </li>
  );
}
