"use client";

import { ReactNode } from "react";

function FieldShell({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex items-center gap-1.5 font-medium text-slate-700">
        {label}
        {hint}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export function TextField({
  label,
  value,
  onChange,
  onBlur,
  hint,
  placeholder,
}: {
  label: string;
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
  return (
    <FieldShell label={label} hint={hint}>
      <div className="relative">
        <input
          type="number"
          className={inputClass + (suffix ? " w-full pr-10" : " w-full")}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
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

export function ExtractedBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
      Détecté auto
    </span>
  );
}
