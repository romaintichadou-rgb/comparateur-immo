"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { ApartmentWithComputed } from "@/lib/types";
import { formatApartmentTitle, formatEuros, formatPercent } from "@/lib/format";
import { rendementNetTone, type RendementSeuils, type RendementTone } from "@/lib/analyse/scoring";
import { isAiEstimated } from "@/lib/estimates";
import { AiEstimatedBadge } from "@/components/form/Fields";

// Doit rester synchronisé avec les classes `duration-300` ci-dessous
// (Tailwind ne supporte pas les classes générées dynamiquement).
const TRANSITION_MS = 300;

// Mêmes 4 tonalités et mêmes couleurs que partout ailleurs dans l'app
// (tableau, carte, fiche détaillée, Analyse IA) : le rendement net doit se
// lire de la même façon, où qu'on l'ouvre depuis.
const TONE_STYLES: Record<RendementTone, { wrap: string; label: string; value: string }> = {
  neutral: { wrap: "bg-ink-50", label: "text-ink-500", value: "text-ink-900" },
  positif: { wrap: "bg-emerald-50", label: "text-emerald-700", value: "text-emerald-800" },
  attention: { wrap: "bg-amber-50", label: "text-amber-700", value: "text-amber-800" },
  alerte: { wrap: "bg-red-50", label: "text-red-700", value: "text-red-700" },
};

export default function RendementDetailPanel({
  apartment,
  seuils,
  onClose,
}: {
  apartment: ApartmentWithComputed | null;
  seuils: RendementSeuils;
  onClose: () => void;
}) {
  // `displayed` reste renseigné pendant la transition de sortie (apartment
  // repasse à null immédiatement à la fermeture, mais le panneau doit
  // continuer à afficher son contenu le temps de glisser hors champ). Les
  // seuils sont mémorisés avec lui pour rester cohérents pendant cette
  // transition (au lieu de retomber sur des seuils par défaut).
  const [displayed, setDisplayed] = useState<{ apartment: ApartmentWithComputed; seuils: RendementSeuils } | null>(
    null
  );
  const [show, setShow] = useState(false);

  // Miroirs synchrones de la prop, ajustés pendant le rendu (pas dans un
  // effet) : ce sont de simples valeurs dérivées, sans conséquence externe.
  if (apartment && apartment !== displayed?.apartment) {
    setDisplayed({ apartment, seuils });
  }
  if (!apartment && show) {
    setShow(false);
  }

  // Ici, en revanche, un effet est nécessaire : il faut laisser le navigateur
  // peindre une première fois avec `show=false` avant de passer à `true`,
  // sans quoi la transition CSS ne se joue pas. Et à la fermeture, on laisse
  // le temps à l'animation de sortie de se jouer avant de démonter le contenu.
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

  // Bloque le scroll de la page pendant que le panneau est ouvert (juste
  // `overflow: hidden`, sans toucher à `position`/`top` du body). Le panneau
  // est déjà correctement ancré au viewport via `position: fixed` — passer
  // par un décalage négatif de body pour "figer" le scroll n'était pas
  // nécessaire et pouvait provoquer un reflow/repaint visible pendant la
  // transition d'ouverture (bordure haute ou valeurs tronquées sur certaines
  // machines). `useLayoutEffect` pour poser le blocage avant la 1re peinture.
  useLayoutEffect(() => {
    if (!displayed) return;
    const html = document.documentElement.style;
    const prevHtmlOverflow = html.overflow;
    html.overflow = "hidden";
    return () => {
      html.overflow = prevHtmlOverflow;
    };
  }, [displayed]);

  if (!displayed) return null;

  const apt = displayed.apartment;
  const netTone = rendementNetTone(apt.rendement_net, displayed.seuils);
  const prix = apt.prix ?? 0;
  const fraisNotaire = apt.frais_notaire_estimes ?? 0;
  const travaux = apt.travaux ?? 0;
  const budgetTotal = apt.budget_total ?? 0;
  const loyerAnnuel = (apt.loyer_retenu ?? 0) * 12;
  const chargesCopro = apt.charges_copro_annuelles ?? 0;
  const taxeFonciere = apt.taxe_fonciere ?? 0;
  const assurance = apt.assurance_annuelle ?? 0;
  const fraisGestion = loyerAnnuel * (apt.hypothese_gestion_pct / 100);
  const revenuNetAnnuel = loyerAnnuel - chargesCopro - taxeFonciere - assurance - fraisGestion;

  const donneesInsuffisantes = apt.prix == null || apt.loyer_retenu == null;

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
              Détail du calcul du rendement
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

        <div className="flex-1 overflow-hidden px-6 py-5">
          {donneesInsuffisantes ? (
            <p className="text-sm text-ink-500">
              Renseigne le prix d&apos;achat et le loyer pour voir le détail du calcul.
            </p>
          ) : (
            <div className="space-y-5">
              {/* Résultats en premier : les deux chiffres qu'on est venu chercher,
                  visibles sans avoir à parcourir le détail du calcul, avec le
                  calcul exact (mêmes montants que dans le détail ci-dessous)
                  et la même tonalité de couleur qu'ailleurs dans l'app. */}
              <div className="grid grid-cols-2 gap-3">
                <ResultTile
                  label="Rendement brut"
                  formule="Loyer annuel ÷ budget total"
                  calcul={`${formatEuros(loyerAnnuel)} ÷ ${formatEuros(budgetTotal)}`}
                  value={formatPercent(apt.rendement_brut)}
                  tone="neutral"
                />
                <ResultTile
                  label="Rendement net"
                  formule="Revenu net annuel ÷ budget total"
                  calcul={`${formatEuros(revenuNetAnnuel)} ÷ ${formatEuros(budgetTotal)}`}
                  value={formatPercent(apt.rendement_net)}
                  tone={netTone}
                />
              </div>

              <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                <section className="space-y-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                    Budget total de l&apos;opération
                  </h3>
                  <ul className="divide-y divide-ink-100 text-sm">
                    <Row label="Prix d'achat" value={prix} />
                    <Row label="Frais de notaire" value={fraisNotaire} />
                    <Row label="Travaux" value={travaux} />
                    <TotalRow label="Budget total" value={apt.budget_total ?? 0} />
                  </ul>
                </section>

                <section className="space-y-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                    Revenu net annuel
                  </h3>
                  <ul className="divide-y divide-ink-100 text-sm">
                    <Row
                      label="Loyer annuel"
                      value={loyerAnnuel}
                      badge={isAiEstimated(apt, "loyer_retenu") && <AiEstimatedBadge />}
                    />
                    <Row
                      label="Charges copro annuelles"
                      value={-chargesCopro}
                      badge={isAiEstimated(apt, "charges_copro_annuelles") && <AiEstimatedBadge />}
                    />
                    <Row
                      label="Taxe foncière"
                      value={-taxeFonciere}
                      badge={isAiEstimated(apt, "taxe_fonciere") && <AiEstimatedBadge />}
                    />
                    <Row label="Assurance" value={-assurance} />
                    <Row
                      label={`Frais de gestion (${apt.hypothese_gestion_pct} % du loyer)`}
                      value={-fraisGestion}
                    />
                    <TotalRow label="Revenu net annuel" value={revenuNetAnnuel} />
                  </ul>
                </section>
              </div>

              <p className="text-xs text-ink-400">
                Frais de gestion calculés sur le loyer annuel, hors vacance locative.
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
  formule,
  calcul,
  value,
  tone,
}: {
  label: string;
  formule: string;
  calcul: string;
  value: string;
  tone: RendementTone;
}) {
  const t = TONE_STYLES[tone];
  return (
    <div className={`rounded-xl p-4 ${t.wrap}`}>
      <p className={`text-xs font-medium ${t.label}`}>{label}</p>
      <p className={`mt-1 text-3xl font-bold ${t.value}`}>{value}</p>
      <p className={`mt-1.5 text-[11px] ${t.label}`}>{formule}</p>
      <p className={`text-[11px] font-medium ${t.value} opacity-70`}>{calcul}</p>
    </div>
  );
}

function Row({ label, value, badge }: { label: string; value: number; badge?: ReactNode }) {
  const negative = value < 0;
  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <span className="flex items-center gap-1.5 text-ink-600">
        <span className="mr-1.5 inline-block w-3 text-center font-semibold text-ink-400">
          {negative ? "−" : "+"}
        </span>
        {label}
        {badge}
      </span>
      <span className="shrink-0 font-medium text-ink-800">{formatEuros(Math.abs(value))}</span>
    </li>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="font-semibold text-ink-900">{label}</span>
      <span className="shrink-0 text-base font-bold text-ink-900">{formatEuros(value)}</span>
    </li>
  );
}
