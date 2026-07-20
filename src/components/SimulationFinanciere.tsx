"use client";

import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Banknote, Calculator, Info, Landmark, PieChart, Plus, ReceiptText, TrendingUp, X } from "lucide-react";
import type { ApartmentWithComputed } from "@/lib/types";
import type { AppSettings } from "@/lib/settings";
import {
  defaultInputs,
  simulate,
  LMNP,
  INDEXATION_CHARGES_DEFAUT_PCT,
  REVALORISATION_BIEN_DEFAUT_PCT,
  REVALORISATION_LOYER_DEFAUT_PCT,
  VACANCE_LOCATIVE_DEFAUT_PCT,
  type AnneeSimulation,
  type SimulationInputs,
} from "@/lib/simulation";
import { AiEstimatedBadge, NumberField, SelectField } from "@/components/form/Fields";
import Skeleton from "@/components/Skeleton";
import { isAiEstimated } from "@/lib/estimates";

/**
 * Onglet "Simulation financière" : cash-flow mensuel réel en LMNP réel,
 * année par année sur la durée du prêt. Le simulateur de crédit est
 * modifiable ; l'exploitation (loyer, charges, taxe foncière…) vient des
 * données du bien. Se recalcule en direct ; les hypothèses (crédit,
 * revalorisations) sont enregistrées explicitement (bouton dédié) pour que
 * le score de l'Analyse IA reflète ce que l'utilisateur a réellement modélisé.
 */

/** Petit contrôle "+" discret pour activer une hypothèse optionnelle
 * (désactivée par défaut = la plus prudente), avec une valeur de repli au clic. */
function OptionalRateField({
  label,
  value,
  defaut,
  onChange,
  suffix = "%/an",
}: {
  label: string;
  value: number | null;
  defaut: number;
  onChange: (v: number | null) => void;
  suffix?: string;
}) {
  if (value == null) {
    return (
      <button
        type="button"
        onClick={() => onChange(defaut)}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-ink-300 px-2.5 py-2 text-xs font-medium text-ink-400 transition-colors hover:border-ink-400 hover:text-ink-600"
      >
        <Plus className="h-3 w-3" />
        {label}
      </button>
    );
  }
  return (
    <div className="flex items-end gap-1">
      <NumberField label={label} value={value} onChange={(v) => onChange(v ?? 0)} suffix={suffix} />
      <button
        type="button"
        onClick={() => onChange(null)}
        title="Désactiver cette hypothèse"
        aria-label={`Désactiver ${label}`}
        className="mb-[3px] shrink-0 rounded-md p-2 text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-600"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

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
  onSaved,
  onPatchApartment,
}: {
  apartment: ApartmentWithComputed;
  settings: AppSettings;
  /** Appelé après l'enregistrement des hypothèses, pour resynchroniser le bien côté parent. */
  onSaved?: (apartment: ApartmentWithComputed) => void;
  /** Patch un champ du bien (quote-part terrain). */
  onPatchApartment?: (patch: Partial<ApartmentWithComputed>) => void;
}) {
  const cashflowSeuils: CashflowSeuils = {
    vert: settings.cashflowSeuilVertEuros,
    rouge: settings.cashflowSeuilRougeEuros,
  };

  // `simulation_inputs` (persisté) est la source de vérité utilisée par le
  // score de l'Analyse IA. `inputs` est l'état local édité en direct ; il se
  // resynchronise dès que la valeur enregistrée change (après un save, ou si
  // le bien affiché change), via le pattern "ajuster l'état pendant le rendu"
  // déjà utilisé dans NumberField.
  const [savedInputs, setSavedInputs] = useState(apartment.simulation_inputs);
  const [inputs, setInputs] = useState<SimulationInputs>(() => apartment.simulation_inputs ?? defaultInputs());
  if (apartment.simulation_inputs !== savedInputs) {
    setSavedInputs(apartment.simulation_inputs);
    setInputs(apartment.simulation_inputs ?? defaultInputs());
  }
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(inputs) !== JSON.stringify(savedInputs ?? defaultInputs());

  const result = useMemo(() => simulate(apartment, inputs), [apartment, inputs]);

  function set<K extends keyof SimulationInputs>(key: K, value: SimulationInputs[K]) {
    setInputs((i) => ({ ...i, [key]: value }));
  }

  async function handleSaveInputs() {
    setSaving(true);
    try {
      const res = await fetch(`/api/apartments/${apartment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulation_inputs: inputs }),
      });
      if (res.ok) {
        const { apartment: updated } = await res.json();
        onSaved?.(updated);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!result) {
    return (
      <div className="rounded-xl border border-ink-200 bg-white p-10 text-center">
        <Calculator className="mx-auto h-8 w-8 text-ink-300" />
        <h2 className="mt-3 text-lg font-semibold text-ink-900">Simulation financière</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
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
      {dirty && (
        <div className="flex items-center justify-between gap-3 rounded-md bg-accent-50 px-4 py-2.5">
          <p className="text-xs text-accent-700">
            Hypothèses modifiées, non enregistrées — le score de l&apos;Analyse IA se base sur les
            dernières hypothèses enregistrées.
          </p>
          <button
            onClick={handleSaveInputs}
            disabled={saving}
            className="shrink-0 rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {saving ? "Enregistrement..." : "Enregistrer les hypothèses"}
          </button>
        </div>
      )}

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
          emphase
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
        <section className="space-y-4 rounded-xl border border-ink-200 bg-white p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
            <span className="inline-flex rounded-lg bg-accent-50 p-1.5 text-accent-400"><Landmark className="h-3.5 w-3.5" /></span>
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
                  <span className="rounded-full bg-accent-50 px-1.5 py-0.5 text-[10px] font-medium text-accent-600">
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
          <div className="rounded-lg bg-ink-50 px-4 py-3 text-sm text-ink-600">
            Mensualité hors assurance : <strong className="text-ink-900">{euros(result.mensualiteHorsAssurance)} €</strong>
            {" · "}assurance : <strong className="text-ink-900">{euros(result.assuranceMensuelle)} €</strong>
            {" · "}coût total du crédit : <strong className="text-ink-900">{euros(result.coutCredit)} €</strong>
            {" · "}apport personnel : <strong className="text-ink-900">{euros(result.apport)} €</strong>
          </div>
          <p className="text-xs text-ink-400">
            En mode <strong className="font-medium text-ink-500">auto</strong>, le montant emprunté
            suit en temps réel le prix d&apos;achat + les travaux (hors frais de notaire, supposés
            couverts par l&apos;apport), y compris pendant la saisie dans les autres onglets. Modifie
            le champ pour le figer (simuler un apport différent) ; vide-le pour repasser en auto.
          </p>
        </section>

        {/* Détail mensuel année 1 — la "participation mensuelle" */}
        <section className="space-y-4 rounded-xl border border-ink-200 bg-white p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
            <span className="inline-flex rounded-lg bg-accent-50 p-1.5 text-accent-400"><Banknote className="h-3.5 w-3.5" /></span>
            Détail mensuel — année 1
          </h3>
          <ul className="divide-y divide-ink-100 text-sm">
            <WaterfallRow
              label="Loyer (CC)"
              value={apartment.loyer_retenu ?? 0}
              plus
              badge={isAiEstimated(apartment, "loyer_retenu") && <AiEstimatedBadge />}
            />
            <WaterfallRow label="Mensualité de crédit (assurance incl.)" value={-result.mensualiteTotale} />
            <WaterfallRow
              label="Charges (copro, taxe foncière, assurance, gestion)"
              value={-result.chargesMensuelles}
            />
            <WaterfallRow label="Impôt LMNP (IR + prélèvements sociaux)" value={-result.impotMensuelAn1} />
            <li className="flex items-center justify-between py-3">
              <span className="font-semibold text-ink-900">Cash-flow mensuel</span>
              <span className={`text-lg font-bold ${cashflowTextClass(cfAn1, cashflowSeuils)}`}>
                {signe(cfAn1)} €
              </span>
            </li>
          </ul>
          <p className="text-xs text-ink-400">
            Avant impôt : {signe(result.cashflowMensuelAvantImpotAn1)} €/mois.
          </p>
        </section>
      </div>

      {/* Fiscalité LMNP */}
      <section className="space-y-5 rounded-xl border border-ink-200 bg-white p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
          <span className="inline-flex rounded-lg bg-accent-50 p-1.5 text-accent-400"><ReceiptText className="h-3.5 w-3.5" /></span>
          Fiscalité — LMNP au réel
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="Tranche marginale d'imposition (TMI)"
            value={String(inputs.tmiPct) as (typeof TMI_OPTIONS)[number]}
            onChange={(v) => set("tmiPct", Number(v))}
            options={TMI_OPTIONS}
            allowEmpty={false}
            hint={<span className="text-xs font-normal text-ink-400">+ {LMNP.prelevementsSociauxPct} % de prélèvements sociaux</span>}
          />
          <NumberField
            label="Quote-part terrain"
            value={result.quotePartTerrainPct}
            onChange={(v) => onPatchApartment?.({ quote_part_terrain_pct: v })}
            suffix="% du prix"
            hint={
              apartment.quote_part_terrain_pct == null ? (
                <span className="rounded-full bg-accent-50 px-1.5 py-0.5 text-[10px] font-medium text-accent-600">
                  auto
                </span>
              ) : undefined
            }
          />
        </div>

        <div className="rounded-lg bg-ink-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Amortissements annuels déductibles</p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <AmortRow label="Bâti" amount={result.amortissements.bati} detail={`${100 - result.quotePartTerrainPct} % du prix · 40 ans`} />
            {result.amortissements.travaux > 0 && (
              <AmortRow label="Travaux" amount={result.amortissements.travaux} detail="15 ans" />
            )}
            {result.amortissements.notaire > 0 && (
              <AmortRow label="Frais de notaire" amount={result.amortissements.notaire} detail="5 ans" />
            )}
          </div>
          <p className="mt-3 text-xs font-medium text-ink-600">
            Total : {euros(result.amortissements.bati + result.amortissements.travaux + result.amortissements.notaire)} €/an
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-ink-100 bg-white px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-300" />
          <div className="text-xs leading-relaxed text-ink-500">
            <p>
              Les amortissements ne peuvent pas créer de déficit — ils sont plafonnés au résultat
              de l&apos;année, l&apos;excédent est reporté sans limite <span className="text-ink-400">(art. 39 C)</span>.
            </p>
            <p className="mt-1.5 font-medium text-ink-600">
              Année 1 : résultat imposable {euros(result.annees[0].resultatImposable)} € → impôt {euros(result.annees[0].impot)} €/an
            </p>
          </div>
        </div>
      </section>

      {/* Tableau année par année */}
      <section className="rounded-xl border border-ink-200 bg-white">
        <h3 className="flex items-center gap-2 p-5 pb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
          <span className="inline-flex rounded-lg bg-accent-50 p-1.5 text-accent-400"><Calculator className="h-3.5 w-3.5" /></span>
          Cash-flow année par année
        </h3>
        <div className="flex flex-wrap items-end gap-3 px-5 pb-4">
          <OptionalRateField
            label="Revalorisation du bien"
            value={inputs.revalorisationBienPct}
            defaut={REVALORISATION_BIEN_DEFAUT_PCT}
            onChange={(v) => set("revalorisationBienPct", v)}
          />
          <OptionalRateField
            label="Revalorisation du loyer"
            value={inputs.revalorisationLoyerPct}
            defaut={REVALORISATION_LOYER_DEFAUT_PCT}
            onChange={(v) => set("revalorisationLoyerPct", v)}
          />
          <OptionalRateField
            label="Indexation charges (copro + taxe foncière)"
            value={inputs.indexationChargesPct}
            defaut={INDEXATION_CHARGES_DEFAUT_PCT}
            onChange={(v) => set("indexationChargesPct", v)}
          />
          <OptionalRateField
            label="Vacance locative"
            value={inputs.vacanceLocativePct}
            defaut={VACANCE_LOCATIVE_DEFAUT_PCT}
            onChange={(v) => set("vacanceLocativePct", v)}
            suffix="% du loyer"
          />
        </div>
        <p className="px-5 pb-4 text-xs text-ink-400">
          Par défaut, aucune revalorisation, indexation ni vacance n&apos;est supposée (hypothèse la plus
          prudente) — active-les au besoin.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-ink-100 bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="px-5 py-2 font-medium">Année</th>
                <th className="px-3 py-2 text-right font-medium">Loyers</th>
                <th className="px-3 py-2 text-right font-medium">Crédit</th>
                <th className="px-3 py-2 text-right font-medium">Charges</th>
                <th className="px-3 py-2 text-right font-medium">Impôt</th>
                <th className="px-3 py-2 text-right font-medium">Cash-flow /an</th>
                <th className="px-5 py-2 text-right font-medium">/mois</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {result.annees.map((a) => (
                <tr key={a.annee} className="hover:bg-ink-50/60">
                  <td className="px-5 py-1.5 text-ink-500">{a.annee}</td>
                  <td className="px-3 py-1.5 text-right text-ink-700">{euros(a.loyers)}</td>
                  <td className="px-3 py-1.5 text-right text-ink-700">
                    {euros(-(result.mensualiteTotale * 12))}
                  </td>
                  <td className="px-3 py-1.5 text-right text-ink-700">{euros(-a.chargesExploitation)}</td>
                  <td className="px-3 py-1.5 text-right text-ink-700">{euros(-a.impot)}</td>
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
        <p className="px-5 py-3 text-xs text-ink-400">
          Total impôts sur {inputs.dureeAnnees} ans : {euros(result.totalImpots)} € · loyer{" "}
          {inputs.revalorisationLoyerPct != null
            ? `revalorisé à ${inputs.revalorisationLoyerPct} %/an`
            : "supposé constant (pas de revalorisation)"}{" "}
          ; charges de copropriété et taxe foncière{" "}
          {inputs.indexationChargesPct != null
            ? `indexées à ${inputs.indexationChargesPct} %/an`
            : "supposées constantes (pas d'indexation)"}
          {inputs.vacanceLocativePct != null
            ? ` ; vacance locative ${inputs.vacanceLocativePct} %`
            : ""}
          .
        </p>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr]">
        {/* Financement du projet */}
        <section className="min-w-0 space-y-3 rounded-xl border border-ink-200 bg-white p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
            <span className="inline-flex rounded-lg bg-accent-50 p-1.5 text-accent-400"><PieChart className="h-3.5 w-3.5" /></span>
            Financement du projet
          </h3>
          <p className="text-xs text-ink-400">
            {`D'où vient l'argent qui couvre le coût total de l'opération sur ${inputs.dureeAnnees} ans : les loyers collectés, une économie fiscale éventuelle, et la part de l'apport encore non « remboursée » par le cash-flow au terme.`}
          </p>
          <FinancementDonut financement={result.financementProjet} />
        </section>

        {/* Évolution du patrimoine */}
        <section className="min-w-0 space-y-4 rounded-xl border border-ink-200 bg-white p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
            <span className="inline-flex rounded-lg bg-accent-50 p-1.5 text-accent-400"><TrendingUp className="h-3.5 w-3.5" /></span>
            Évolution du patrimoine
          </h3>
          <p className="text-xs text-ink-400">
            Chaque année : la dette restante (ce qui reste dû à la banque), l&apos;enrichissement net
            (valeur du bien au-delà de la dette et de l&apos;apport non récupéré), et l&apos;effort
            d&apos;épargne encore porté (apport pas encore compensé par le cash-flow cumulé).{" "}
            {inputs.revalorisationBienPct != null
              ? `Hypothèse de revalorisation du bien : ${inputs.revalorisationBienPct} %/an`
              : "Aucune revalorisation du bien supposée"}{" "}
            — hors fiscalité de la plus-value à la revente.
          </p>
          <PatrimoineChart annees={result.annees} />
        </section>
      </div>
    </div>
  );
}

const FINANCEMENT_COLORS = { loyers: "#3d3580", economieFiscale: "#b3a9e8", participation: "#f59e0b" };

interface TooltipState {
  x: number;
  y: number;
  content: ReactNode;
}

/** Tooltip sombre positionnée au-dessus du curseur, dans un conteneur `relative`. */
function ChartTooltip({ tooltip }: { tooltip: TooltipState }) {
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-ink-900 px-3 py-2 text-xs text-white shadow-lg"
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
      <span className="text-ink-300">{label}</span>
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
    return <p className="text-sm text-ink-400">Données insuffisantes pour ce calcul.</p>;
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
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e6e1f0" strokeWidth={stroke} />
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
            <span className="flex items-center gap-1.5 text-ink-600">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
            <span className="whitespace-nowrap font-medium text-ink-800">
              {euros(s.value)} € <span className="text-ink-400">({pct(s.value, total)} %)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const PATRIMOINE_COLORS = { dette: "#c9c2d9", enrichissement: "#10b981", effortEpargne: "#3d3580" };

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
                <text x={x + barWidth / 2} y={chartHeight + 16} textAnchor="middle" fontSize={10} fill="#8b8393">
                  {a.annee}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-500">
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
  loading = false,
  onClick,
}: {
  label: string;
  sub: string;
  value: string;
  tone: "neutral" | "positif" | "attention" | "alerte";
  emphase?: boolean;
  /** Valeur en cours de recalcul en arrière-plan → barre skeleton, tuile non cliquable. */
  loading?: boolean;
  onClick?: () => void;
}) {
  // Couleur de la valeur = le ton, partout (contexte comme verdict). Tons
  // profonds alignés sur le panneau de détail du rendement (RendementDetailPanel)
  // pour rester cohérents dans toute l'app.
  const valueTones = {
    neutral: "text-ink-900",
    positif: "text-emerald-800",
    attention: "text-amber-800",
    alerte: "text-red-700",
  } as const;

  // Conteneur : tuiles de contexte en fond transparent (seul le contour les
  // délimite sur le fond de page) ; la tuile-verdict (emphase) prend le ton en
  // aplat franc + bordure assortie. Aucun ombrage sur ces tuiles.
  const emphaseBg = {
    neutral: "border-ink-300 bg-ink-100/70",
    positif: "border-emerald-300 bg-emerald-100/70",
    attention: "border-amber-300 bg-amber-100/70",
    alerte: "border-red-300 bg-red-100/70",
  } as const;
  const base = emphase ? emphaseBg[tone] : "border-ink-200 bg-transparent";

  // Survol (uniquement si la tuile est cliquable) : on intensifie fond +
  // bordure pour signaler l'interactivité, sans ombre.
  // Tuile-verdict (fond déjà teinté) : le survol densifie juste l'aplat
  // (-100/70 → -100 plein) et fonce la bordure d'un cran. Pas de saut à -200.
  const hoverEmphase = {
    neutral: "hover:border-ink-400 hover:bg-ink-100",
    positif: "hover:border-emerald-400 hover:bg-emerald-100",
    attention: "hover:border-amber-400 hover:bg-amber-100",
    alerte: "hover:border-red-400 hover:bg-red-100",
  } as const;
  // Tuile de contexte (fond transparent) : un fond neutre (ink) au survol se
  // confondrait avec le fond de page. On « fait surface » en blanc pour le ton
  // neutre ; les tons colorés reçoivent un voile -50 léger.
  const hoverContext = {
    neutral: "hover:border-ink-300 hover:bg-white",
    positif: "hover:border-emerald-300 hover:bg-emerald-50",
    attention: "hover:border-amber-300 hover:bg-amber-50",
    alerte: "hover:border-red-300 hover:bg-red-50",
  } as const;
  const hover = emphase ? hoverEmphase[tone] : hoverContext[tone];

  const content = (
    <>
      <p className="text-xs font-medium text-ink-500">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 mb-1 h-6 w-24" />
      ) : (
        <p className={`mt-1 font-mono text-2xl font-semibold ${valueTones[tone]}`}>{value}</p>
      )}
      <p className="mt-0.5 text-[11px] text-ink-400">{sub}</p>
    </>
  );
  const className = `rounded-xl border-2 p-5 ${base}`;

  // Pendant le recalcul, la tuile n'est pas cliquable (la valeur n'est pas encore
  // à jour — ouvrir son détail afficherait des chiffres périmés).
  if (onClick && !loading) {
    return (
      <button
        type="button"
        onClick={onClick}
        title="Voir le détail du calcul"
        className={`w-full cursor-pointer text-left transition-colors ${className} ${hover}`}
      >
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

function WaterfallRow({
  label,
  value,
  plus = false,
  badge,
}: {
  label: string;
  value: number;
  plus?: boolean;
  badge?: ReactNode;
}) {
  return (
    <li className="flex items-center justify-between py-2">
      <span className="flex items-center gap-1.5 text-ink-600">
        <span className="mr-1.5 inline-block w-3 text-center font-semibold text-ink-400">{plus ? "+" : "−"}</span>
        {label}
        {badge}
      </span>
      <span className="font-medium text-ink-800">{euros(Math.abs(value))} €</span>
    </li>
  );
}

function AmortRow({ label, amount, detail }: { label: string; amount: number; detail: string }) {
  return (
    <div className="flex items-baseline justify-between rounded-md bg-white/60 px-3 py-2">
      <span className="text-sm font-medium text-ink-700">{label}</span>
      <span className="text-right text-sm tabular-nums text-ink-800">
        {euros(amount)} € <span className="text-xs text-ink-400">({detail})</span>
      </span>
    </div>
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
