"use client";

import { useState } from "react";
import { Banknote, TrendingUp } from "lucide-react";
import type { AppSettings } from "@/lib/settings";
import { NumberField } from "@/components/form/Fields";

export default function SettingsForm({ initial }: { initial: AppSettings }) {
  const [values, setValues] = useState<AppSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof AppSettings>(key: K, v: number | null) {
    setValues((s) => ({ ...s, [key]: v ?? 0 }));
    setSaved(false);
  }

  const rendementValide = values.rendementSeuilVertPct > values.rendementSeuilRougePct;
  const cashflowValide = values.cashflowSeuilVertEuros > values.cashflowSeuilRougeEuros;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (res.ok) {
        setValues(data.settings);
        setSaved(true);
      } else {
        setError(data.error ?? "Échec de l'enregistrement.");
      }
    } catch {
      setError("Erreur réseau pendant l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Profil investisseur</h1>
        <p className="mt-1 text-sm text-slate-500">
          Seuils personnels utilisés pour colorer le rendement net et le cash-flow mensuel,
          partout dans l&apos;app (tableau, carte, Analyse IA, Simulation financière).
        </p>
      </div>

      <SeuilCard
        icon={TrendingUp}
        titre="Rendement net"
        description="À partir du seuil vert, l'objectif de rentabilité est atteint. En dessous du seuil rouge, c'est rédhibitoire (le score global en tient compte)."
        vertLabel="Seuil vert"
        rougeLabel="Seuil rouge"
        suffix="%/an"
        vert={values.rendementSeuilVertPct}
        rouge={values.rendementSeuilRougePct}
        onVertChange={(v) => set("rendementSeuilVertPct", v)}
        onRougeChange={(v) => set("rendementSeuilRougePct", v)}
        formatValue={(v) => `${v.toFixed(1).replace(".", ",")} %`}
        valide={rendementValide}
      />

      <SeuilCard
        icon={Banknote}
        titre="Cash-flow mensuel"
        description="À partir du seuil vert, c'est GO. En dessous du seuil rouge, c'est un point d'alerte."
        vertLabel="Seuil vert"
        rougeLabel="Seuil rouge"
        suffix="€/mois"
        vert={values.cashflowSeuilVertEuros}
        rouge={values.cashflowSeuilRougeEuros}
        onVertChange={(v) => set("cashflowSeuilVertEuros", v)}
        onRougeChange={(v) => set("cashflowSeuilRougeEuros", v)}
        formatValue={(v) => `${Math.round(v)} €`}
        valide={cashflowValide}
      />

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !rendementValide || !cashflowValide}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
        {saved && <span className="text-sm text-emerald-600">Enregistré.</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}

function SeuilCard({
  icon: Icon,
  titre,
  description,
  vertLabel,
  rougeLabel,
  suffix,
  vert,
  rouge,
  onVertChange,
  onRougeChange,
  formatValue,
  valide,
}: {
  icon: typeof Banknote;
  titre: string;
  description: string;
  vertLabel: string;
  rougeLabel: string;
  suffix: string;
  vert: number;
  rouge: number;
  onVertChange: (v: number | null) => void;
  onRougeChange: (v: number | null) => void;
  formatValue: (v: number) => string;
  valide: boolean;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <Icon className="h-4 w-4 text-slate-400" />
          {titre}
        </h2>
        <p className="mt-1 text-xs text-slate-400">{description}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <NumberField label={rougeLabel} value={rouge} onChange={onRougeChange} suffix={suffix} />
        <NumberField label={vertLabel} value={vert} onChange={onVertChange} suffix={suffix} />
      </div>

      {!valide && (
        <p className="text-xs text-amber-600">Le seuil vert doit être supérieur au seuil rouge.</p>
      )}

      <div className="space-y-1.5">
        <div className="flex h-2 overflow-hidden rounded-full">
          <div className={`flex-1 ${valide ? "bg-red-400" : "bg-slate-200"}`} />
          <div className={`flex-1 ${valide ? "bg-amber-400" : "bg-slate-200"}`} />
          <div className={`flex-1 ${valide ? "bg-emerald-400" : "bg-slate-200"}`} />
        </div>
        <div className="flex justify-between text-[11px] text-slate-500">
          <span>Rouge &lt; {formatValue(rouge)}</span>
          <span>Ambre</span>
          <span>Vert ≥ {formatValue(vert)}</span>
        </div>
      </div>
    </section>
  );
}
