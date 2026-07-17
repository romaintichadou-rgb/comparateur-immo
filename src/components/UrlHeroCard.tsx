"use client";

import type { ReactNode } from "react";
import { Link2, Loader2 } from "lucide-react";
import { AppMark } from "@/components/Navbar";

/**
 * Bloc "Coller l'URL d'une annonce" — dégradé + filigrane de marque, point
 * d'entrée principal vers l'Analyse IA (la fonctionnalité phare). Partagé
 * entre la home vide et la page "Ajouter un bien" pour que ce point d'entrée
 * reste identique partout, sans détour par une page intermédiaire.
 */
export default function UrlHeroCard({
  value,
  onChange,
  onSubmit,
  loading = false,
  title = "Colle l'URL d'une annonce",
  subtitle = "Leboncoin, SeLoger, PAP ou Orpi — les champs détectés seront pré-remplis, à vérifier avant d'enregistrer.",
  footer,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  title?: string;
  subtitle?: string;
  footer?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
      <div className="relative overflow-hidden bg-gradient-to-br from-accent-50 via-white to-white p-6 sm:p-8">
        <AppMark className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 text-accent-600 opacity-[0.07]" />
        <span className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-accent-100/70 blur-3xl" />
        <div className="relative flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-600 text-white shadow-sm shadow-accent-200">
            <Link2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>
          </div>
        </div>

        <div className="relative mt-5 flex flex-col gap-2.5 sm:flex-row">
          <input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
            placeholder="https://www.leboncoin.fr/ad/..."
            className="flex-1 rounded-lg border border-ink-300 bg-white px-3.5 py-2.5 text-sm text-ink-900 shadow-sm transition-colors focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
          />
          <button
            onClick={onSubmit}
            disabled={loading}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-700 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Analyse en cours…" : "Analyser"}
          </button>
        </div>
      </div>

      {footer && (
        <div className="flex flex-col gap-3 border-t border-ink-100 bg-ink-50/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          {footer}
        </div>
      )}
    </div>
  );
}
