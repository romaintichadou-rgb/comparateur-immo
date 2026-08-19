import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AppMark } from "@/components/Navbar";

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
      ? { glow: "bg-amber-100/70", ring: "shadow-amber-100", icon: "text-amber-600", mark: "text-amber-300/25" }
      : { glow: "bg-accent-100/70", ring: "shadow-accent-100", icon: "text-accent-600", mark: "text-accent-300/20" };

  return (
    <div className="relative flex min-h-[calc(100vh-67px)] items-center justify-center px-4 text-center sm:px-6">
      <div className="bg-tech-grid pointer-events-none absolute inset-x-0 top-0 h-64" aria-hidden="true" />

      <div className="relative max-w-lg">
        <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
          <AppMark className={`absolute h-28 w-28 ${toneClass.mark}`} />
          <span className={`absolute inset-0 rounded-full blur-xl ${toneClass.glow}`} aria-hidden="true" />
          <span
            className={`relative flex h-16 w-16 items-center justify-center rounded-xl border border-ink-100 bg-white shadow-lg ${toneClass.ring}`}
          >
            <Icon className={`h-8 w-8 ${toneClass.icon}`} aria-hidden="true" />
          </span>
        </div>
        <h1 className="mt-7 heading-h1">{title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-500 sm:text-base">{message}</p>
        {reference && <p className="mt-2 font-mono text-xs text-ink-300">Référence : {reference}</p>}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">{actions}</div>
      </div>
    </div>
  );
}
