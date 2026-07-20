"use client";

import { ReactNode, useState } from "react";

function FieldShell({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex items-center gap-1.5 font-medium text-ink-700">
        {label}
        {hint}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "rounded-md border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500";

export function TextField({
  label,
  value,
  onChange,
  onBlur,
  hint,
  placeholder,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  hint?: ReactNode;
  placeholder?: string;
}) {
  return (
    <FieldShell label={label} hint={hint}>
      <input
        type="text"
        className={inputClass}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  onBlur,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  rows?: number;
}) {
  return (
    <FieldShell label={label}>
      <textarea
        className={inputClass}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </FieldShell>
  );
}

// États intermédiaires valides pendant la frappe, à ne jamais transformer en
// nombre (et donc ne jamais remonter via onChange tel quel) : "-" seul (le
// signe négatif vient d'être tapé, les chiffres suivent) ou un texte qui se
// termine par un point décimal ("12.", "-3.") — sans ça, Number("-") = NaN
// repartirait aussitôt dans `value` et effacerait le champ avant que
// l'utilisateur ait pu taper les chiffres suivants.
function estEtatIntermediaire(text: string): boolean {
  return text === "-" || text.endsWith(".");
}

export function NumberField({
  label,
  value,
  onChange,
  hint,
  suffix,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  hint?: ReactNode;
  suffix?: string;
}) {
  // Texte affiché géré séparément de `value` : un <input type="number">
  // contrôlé directement par le nombre parsé casse la saisie d'un signe
  // moins ou d'un point décimal, puisque "-" seul donne Number("-") = NaN,
  // qui repasserait aussitôt dans `value` et effacerait le champ avant que
  // l'utilisateur ait pu taper les chiffres suivants.
  const [texte, setTexte] = useState(value != null ? String(value) : "");
  // Sert uniquement à détecter un changement de `value` VENU DE L'EXTÉRIEUR
  // (ex. recalcul live ailleurs dans le formulaire), pour resynchroniser le
  // texte affiché — ajusté pendant le rendu, pas dans un effet (cf. le guide
  // React "adjusting state when a prop changes").
  const [derniereValeurExterne, setDerniereValeurExterne] = useState(value);
  if (value !== derniereValeurExterne) {
    setDerniereValeurExterne(value);
    if (!estEtatIntermediaire(texte)) {
      setTexte(value != null ? String(value) : "");
    }
  }

  function handleChange(text: string) {
    setTexte(text);
    if (text === "") {
      onChange(null);
      return;
    }
    if (estEtatIntermediaire(text)) return; // ex. "-" ou "12." : pas encore un nombre
    const n = Number(text);
    if (!Number.isNaN(n)) onChange(n);
  }

  return (
    <FieldShell label={label} hint={hint}>
      <div className="relative">
        <input
          type="number"
          className={inputClass + (suffix ? " w-full pr-10" : " w-full")}
          value={texte}
          onChange={(e) => handleChange(e.target.value)}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">
            {suffix}
          </span>
        )}
      </div>
    </FieldShell>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  allowEmpty = true,
}: {
  label: string;
  value: T | "";
  onChange: (v: T) => void;
  options: readonly T[];
  hint?: ReactNode;
  allowEmpty?: boolean;
}) {
  return (
    <FieldShell label={label} hint={hint}>
      <select
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {allowEmpty && <option value="">—</option>}
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function BooleanField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  return (
    <FieldShell label={label}>
      <select
        className={inputClass}
        value={value === null ? "" : value ? "oui" : "non"}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : e.target.value === "oui")
        }
      >
        <option value="">—</option>
        <option value="oui">Oui</option>
        <option value="non">Non</option>
      </select>
    </FieldShell>
  );
}

export function EstimatedBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
      Estimé
    </span>
  );
}

export function ManualBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-500">
      Manuel
    </span>
  );
}

export function ExtractedBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
      Détecté auto
    </span>
  );
}

/**
 * Distinct du badge "Estimé" générique (formules déterministes) : signale
 * une valeur produite par un LLM (recherche web + Gemini), non vérifiée
 * contre une source structurée — voir estimateRent().
 */
export function AiEstimatedBadge() {
  return (
    <span
      className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700"
      title="Estimation par IA (recherche web), non vérifiée — à confirmer avant de s'y fier"
    >
      Estimation IA
    </span>
  );
}
