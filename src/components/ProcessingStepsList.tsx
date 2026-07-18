"use client";

import { Check, Loader2 } from "lucide-react";

export interface ProcessingStep<K extends string = string> {
  key: K;
  label: string;
  detail: string;
}

/**
 * Liste d'étapes avec coche / spinner / pastille selon leur avancement.
 * Même langage visuel partout où un traitement multi-étapes tourne en
 * arrière-plan (création d'un bien dans AddApartmentFlow.tsx, mise à jour de
 * sa description dans ApartmentDetail.tsx) — l'utilisateur doit reconnaître
 * le même pattern, pas en redécouvrir un nouveau à chaque écran.
 */
export default function ProcessingStepsList<K extends string>({
  steps,
  currentKey,
}: {
  steps: ProcessingStep<K>[];
  currentKey: K;
}) {
  const currentIndex = steps.findIndex((s) => s.key === currentKey);

  return (
    <ol className="mx-auto max-w-md space-y-3 text-left">
      {steps.map((s, i) => {
        const state = i < currentIndex ? "done" : i === currentIndex ? "active" : "pending";
        return (
          <li
            key={s.key}
            className={`flex items-start gap-3 rounded-lg border p-3 transition ${
              state === "active" ? "border-accent-200 bg-accent-50/60" : "border-ink-200 bg-white"
            }`}
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
              {state === "done" ? (
                <Check className="h-5 w-5 text-emerald-500" />
              ) : state === "active" ? (
                <Loader2 className="h-5 w-5 animate-spin text-accent-600" />
              ) : (
                <span className="h-2.5 w-2.5 rounded-full bg-ink-300" />
              )}
            </span>
            <span>
              <span className={`block text-sm font-medium ${state === "pending" ? "text-ink-400" : "text-ink-800"}`}>
                {s.label}
              </span>
              <span className="block text-xs text-ink-400">{s.detail}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
