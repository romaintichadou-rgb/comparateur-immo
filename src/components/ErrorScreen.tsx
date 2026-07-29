import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Gabarit plein-page pour les cas où une route ne peut pas se rendre : bien
 * introuvable (not-found.tsx) ou échec technique (error.tsx). Un seul visuel,
 * seule la tonalité (icône + couleur) et le texte changent selon le contexte —
 * même esprit que le badge avec halo de EmptyHomeState (Fraunces, ink-500).
 */
export default function ErrorScreen({
  icon: Icon,
  tone = "accent",
  title,
  message,
  reference,
  actions,
}: {
  icon: LucideIcon;
  /** accent = état neutre (bien absent) ; amber = échec technique récupérable. */
  tone?: "accent" | "amber";
  title: string;
  message: string;
  /** `error.digest` : référence opaque à donner en support, sans exposer la stack. */
  reference?: string;
  actions: ReactNode;
}) {
  const toneClass =
    tone === "amber"
      ? { glow: "bg-amber-100/70", ring: "shadow-amber-100", icon: "text-amber-600" }
      : { glow: "bg-accent-100/70", ring: "shadow-accent-100", icon: "text-accent-600" };

  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center sm:px-6 sm:py-24">
      <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
        <span className={`absolute inset-0 rounded-full blur-xl ${toneClass.glow}`} aria-hidden="true" />
        <span
          className={`relative flex h-14 w-14 items-center justify-center rounded-md border border-ink-200 bg-white shadow-lg ${toneClass.ring}`}
        >
          <Icon className={`h-7 w-7 ${toneClass.icon}`} aria-hidden="true" />
        </span>
      </div>
      <h1 className="mt-6 font-display text-2xl font-semibold text-ink-900">{title}</h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-500">{message}</p>
      {reference && <p className="mt-2 font-mono text-xs text-ink-300">Référence : {reference}</p>}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">{actions}</div>
    </div>
  );
}
