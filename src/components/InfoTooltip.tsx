"use client";

import { useState } from "react";
import { Info } from "lucide-react";

/**
 * Icône d'info à côté d'un titre — révèle au survol/focus le détail qu'un
 * paragraphe descriptif encombrait jusque-là sous le titre. `font-sans`
 * explicite sur la bulle : posée à côté d'un titre en Fraunces (`font-display`),
 * elle hériterait sinon la police serif du titre plutôt que le corps de texte.
 */
export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex shrink-0 align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label="Plus d'informations"
        aria-expanded={open}
        className="rounded-full p-0.5 text-ink-400 cursor-pointer motion-safe:transition-all motion-safe:duration-150 hover:text-accent-600 motion-safe:hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-lg bg-ink-900 px-3 py-2 font-sans text-xs font-normal leading-relaxed text-white shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
