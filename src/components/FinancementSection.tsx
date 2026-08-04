"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";
import type { ApartmentWithComputed } from "@/lib/types";
import { FINANCEMENT_MODE_COURT, type AppSettings } from "@/lib/settings";
import { TONE_TEXT_CLASS, cashflowTone, type CashflowSeuils } from "@/lib/analyse/scoring";
import {
  defaultInputs,
  resolveInputs,
  simulate,
  type SimulationInputs,
} from "@/lib/simulation";
import { NumberField } from "@/components/form/Fields";
import ConfirmDialog from "@/components/ConfirmDialog";
import { GroupTitle, TITRE_SECTION } from "@/components/SectionHeader";
import { formatEurosSigned, formatNombre } from "@/lib/format";

function Pastille({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-accent-50 px-1.5 py-0.5 text-[10px] font-medium text-accent-600">
      {children}
    </span>
  );
}

function ChampHerite({
  label,
  suffix,
  override,
  resolu,
  onChange,
}: {
  label: string;
  suffix: string;
  override: number | null;
  resolu: number;
  onChange: (v: number | null) => void;
}) {
  const herite = override == null;
  return (
    <div className="flex items-end gap-1">
      <div className="min-w-0 flex-1">
        <NumberField
          key={herite ? "herite" : "override"}
          label={label}
          value={herite ? resolu : override}
          onChange={onChange}
          suffix={suffix}
          hint={herite ? <Pastille>profil</Pastille> : undefined}
        />
      </div>
      <div className="mb-[3px] w-11 shrink-0 flex justify-center">
        {!herite && (
          <button
            type="button"
            onClick={() => onChange(null)}
            title="Revenir à la valeur du profil investisseur"
            aria-label={`${label} : revenir au profil`}
            className="flex h-11 w-11 items-center justify-center rounded-md text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function FinSectionTitle({ children }: { children: ReactNode }) {
  return <GroupTitle className="mb-2">{children}</GroupTitle>;
}

function FinRow({ label, value, badge, suffix }: { label: string; value: string; badge?: ReactNode; suffix?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5 text-[13px]">
      <span className="text-ink-500">{label}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        {badge}
        <span className="font-mono font-medium tabular-nums text-ink-800">{value}</span>
        {suffix && <span className="text-[10px] text-ink-400">{suffix}</span>}
      </span>
    </div>
  );
}

function euros(n: number): string {
  const r = Math.round(n) || 0;
  return `${r < 0 ? "−" : ""}${Math.abs(r).toLocaleString("fr-FR")}`;
}

export default function FinancementSection({
  apartment,
  settings,
  cashflowSeuils,
  onSaved,
}: {
  apartment: ApartmentWithComputed;
  settings: AppSettings;
  cashflowSeuils: CashflowSeuils;
  onSaved?: (apartment: ApartmentWithComputed) => void;
}) {
  const [savedInputs, setSavedInputs] = useState(apartment.simulation_inputs);
  const [inputs, setInputs] = useState<SimulationInputs>(
    () => apartment.simulation_inputs ?? defaultInputs(),
  );
  if (apartment.simulation_inputs !== savedInputs) {
    setSavedInputs(apartment.simulation_inputs);
    setInputs(apartment.simulation_inputs ?? defaultInputs());
  }

  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState<SimulationInputs | null>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const resolus = useMemo(() => resolveInputs(inputs, settings), [inputs, settings]);
  const result = useMemo(() => simulate(apartment, resolus), [apartment, resolus]);

  const surcharges =
    (inputs.montantEmprunte != null ? 1 : 0) +
    (inputs.tauxCreditPct != null ? 1 : 0) +
    (inputs.dureeAnnees != null ? 1 : 0) +
    (inputs.tauxAssurancePct != null ? 1 : 0);

  function set<K extends keyof SimulationInputs>(key: K, value: SimulationInputs[K]) {
    setInputs((i) => ({ ...i, [key]: value }));
  }

  function startEdit() {
    setSnapshot(inputs);
    setEditing(true);
    setOpen(true);
  }

  function cancelEdit() {
    if (snapshot) setInputs(snapshot);
    setSnapshot(null);
    setEditing(false);
  }

  async function persist(payload: SimulationInputs) {
    setSaving(true);
    try {
      const res = await fetch(`/api/apartments/${apartment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulation_inputs: payload }),
      });
      if (res.ok) {
        const { apartment: updated } = await res.json();
        onSaved?.(updated);
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    await persist(inputs);
    setSnapshot(null);
    setEditing(false);
  }

  async function resetCredit() {
    const base = apartment.simulation_inputs ?? defaultInputs();
    const patched: SimulationInputs = {
      ...base,
      montantEmprunte: null,
      tauxCreditPct: null,
      dureeAnnees: null,
      tauxAssurancePct: null,
    };
    setInputs(patched);
    setSnapshot(null);
    setEditing(false);
    setConfirmReset(false);
    await persist(patched);
  }

  if (!result) return null;

  const cfLMNP = result.cashflowMensuelMoyenLMNP;
  const cashflowCls = TONE_TEXT_CLASS[cashflowTone(cfLMNP, cashflowSeuils)];

  return (
    <>
      <ConfirmDialog
        open={confirmReset}
        title="Réinitialiser le crédit ?"
        description="Le montant emprunté repassera en calcul automatique, et le taux, la durée et l'assurance suivront de nouveau ton Profil investisseur."
        confirmLabel="Réinitialiser"
        loadingLabel="Réinitialisation…"
        destructive
        loading={saving}
        onConfirm={resetCredit}
        onCancel={() => setConfirmReset(false)}
      />

      <section
        className={`overflow-hidden rounded-xl border bg-white transition-colors ${
          editing ? "border-accent-300" : "border-ink-200"
        }`}
      >
        <button
          type="button"
          onClick={() => !editing && setOpen((o) => !o)}
          className="flex w-full items-center justify-between px-5 py-3"
        >
          <span className={TITRE_SECTION}>Financement</span>
          <ChevronDown
            className={`h-4 w-4 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {/* Hero : mensualité + summary pills — toujours visible */}
        <div className="px-5 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-ink-700">Mensualité de crédit</p>
              <p className="mt-0.5 text-[11px] text-ink-400">assurance emprunteur incluse</p>
            </div>
            <p className="shrink-0 font-mono text-2xl font-bold tabular-nums text-ink-900">
              {euros(result.mensualiteTotale)} €
              <span className="text-[13px] font-normal text-ink-400">/mois</span>
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-ink-50 px-2.5 py-0.5 text-[11px] font-medium text-ink-600">
              Crédit {formatNombre(resolus.tauxCreditPct)} %
            </span>
            <span className="rounded-full bg-ink-50 px-2.5 py-0.5 text-[11px] font-medium text-ink-600">
              {formatNombre(resolus.dureeAnnees)} ans
            </span>
            <span className="rounded-full bg-ink-50 px-2.5 py-0.5 text-[11px] font-medium text-ink-600">
              Apport {euros(result.apport)} €
            </span>
          </div>
        </div>

        {/* Corps dépliable */}
        {open && (
          <div className="px-5 pb-4">
            <div className="pt-1">
              {editing ? (
                <>
                  <div className="space-y-3 py-4">
                    <div className="pr-8">
                      <NumberField
                        label="Montant emprunté"
                        value={result.montantEmprunte}
                        onChange={(v) => set("montantEmprunte", v)}
                        suffix="€"
                        hint={
                          result.montantAutomatique ? (
                            <Pastille>auto · {FINANCEMENT_MODE_COURT[resolus.financementMode]}</Pastille>
                          ) : result.montantPlafonne ? (
                            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                              ramené au coût total
                            </span>
                          ) : undefined
                        }
                      />
                    </div>
                    <ChampHerite
                      label="Taux du crédit"
                      suffix="%/an"
                      override={inputs.tauxCreditPct}
                      resolu={resolus.tauxCreditPct}
                      onChange={(v) => set("tauxCreditPct", v)}
                    />
                    <ChampHerite
                      label="Durée"
                      suffix="ans"
                      override={inputs.dureeAnnees}
                      resolu={resolus.dureeAnnees}
                      onChange={(v) => set("dureeAnnees", v == null ? null : Math.max(1, Math.min(35, v)))}
                    />
                    <ChampHerite
                      label="Assurance emprunteur"
                      suffix="%/an"
                      override={inputs.tauxAssurancePct}
                      resolu={resolus.tauxAssurancePct}
                      onChange={(v) => set("tauxAssurancePct", v)}
                    />
                    <p className="text-[11px] leading-relaxed text-ink-400">
                      En mode <strong className="font-medium text-ink-500">auto</strong>, l&apos;emprunt
                      suit le prix d&apos;achat + les travaux (hors frais de notaire, supposés couverts
                      par l&apos;apport). Saisis un montant pour le figer ; vide le champ pour repasser
                      en auto.
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-3">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-500 transition-colors hover:bg-ink-50"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={saving}
                      className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? "Enregistrement…" : "Enregistrer"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="py-3.5">
                    <FinSectionTitle>Crédit immobilier</FinSectionTitle>
                    <FinRow
                      label="Montant emprunté"
                      value={`${euros(result.montantEmprunte)} €`}
                      badge={
                        result.montantAutomatique ? (
                          <Pastille>auto</Pastille>
                        ) : result.montantPlafonne ? (
                          <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                            plafonné
                          </span>
                        ) : undefined
                      }
                    />
                    <FinRow
                      label="Taux nominal"
                      value={`${formatNombre(resolus.tauxCreditPct)} %`}
                      badge={inputs.tauxCreditPct == null ? <Pastille>profil</Pastille> : undefined}
                    />
                    <FinRow
                      label="Durée"
                      value={`${formatNombre(resolus.dureeAnnees)} ans`}
                      badge={inputs.dureeAnnees == null ? <Pastille>profil</Pastille> : undefined}
                    />
                    <FinRow
                      label="Assurance"
                      value={`${formatNombre(resolus.tauxAssurancePct)} %`}
                      badge={inputs.tauxAssurancePct == null ? <Pastille>profil</Pastille> : undefined}
                    />
                  </div>

                  <div className="py-3.5">
                    <FinSectionTitle>Apport personnel</FinSectionTitle>
                    <FinRow label="Frais de notaire + complément" value={`${euros(result.apport)} €`} />
                  </div>

                  <div className="flex items-center justify-end gap-3 py-3.5">
                    {surcharges > 0 && (
                      <button
                        type="button"
                        onClick={() => setConfirmReset(true)}
                        className="min-h-[44px] rounded-lg px-3 py-2 text-xs font-medium text-ink-400 underline underline-offset-2 transition-colors hover:bg-ink-50 hover:text-ink-600"
                      >
                        Réinitialiser
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={startEdit}
                      className="rounded-lg border border-accent-300 bg-white px-5 py-2 text-[13px] font-medium text-accent-600 transition-colors hover:border-accent-600 hover:bg-accent-50"
                    >
                      Modifier
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Sticky bar : feedback cash-flow temps réel pendant l'édition */}
      {editing && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-ink-200 bg-white/95 px-4 py-2.5 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <span className="text-xs text-ink-500">Cash-flow mensuel</span>
            <span className={`font-mono text-lg font-bold tabular-nums ${cashflowCls}`}>
              {formatEurosSigned(cfLMNP)}
              <span className="ml-0.5 text-xs font-normal text-ink-400">/mois</span>
            </span>
          </div>
        </div>
      )}
    </>
  );
}
