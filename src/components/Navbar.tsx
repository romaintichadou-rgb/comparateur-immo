"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME } from "@/lib/constants";

const NAV_LINKS = [{ href: "/parametres", label: "Profil investisseur" }];

/**
 * Marque graphique de l'app : anneau de score laissé ouvert (écho du
 * ScoreGauge). Volontairement non affichée dans la navbar (wordmark seul),
 * mais réutilisée ailleurs — état vide de la home, filigrane de l'étape URL.
 * Nom neutre (pas lié au nom de marque) pour survivre à un changement de nom.
 */
export function AppMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle
        cx="32"
        cy="32"
        r="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="115 138"
        transform="rotate(-90 32 32)"
      />
      <circle
        cx="32"
        cy="32"
        r="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.45"
        strokeDasharray="52 82"
        transform="rotate(55 32 32)"
      />
      <circle cx="47" cy="45" r="4" fill="#9C5A3C" />
    </svg>
  );
}

/**
 * Wordmark « Immoscore » : "Immo" en regular, "score" en bold + accent de
 * marque — les deux signaux (graisse et couleur) cumulés pour signer
 * visuellement le produit maintenant que le logo est retiré de la navbar.
 * Découpe dérivée de APP_NAME, sans coder le nom en dur ici.
 */
function Wordmark() {
  const split = APP_NAME.toLowerCase().indexOf("score");
  const head = split > 0 ? APP_NAME.slice(0, split) : APP_NAME;
  const tail = split > 0 ? APP_NAME.slice(split) : "";
  return (
    <span className="font-wordmark text-xl tracking-tight text-ink-900">
      <span className="font-normal">{head}</span>
      {tail && <span className="font-bold text-accent-600">{tail}</span>}
    </span>
  );
}

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200/70 bg-white/80 backdrop-blur-md">
      <div className="h-[3px] w-full bg-gradient-to-r from-accent-600 via-accent-400 to-accent-600" />
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="transition-opacity hover:opacity-80" aria-label={`${APP_NAME} — accueil`}>
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-2">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative rounded-md px-3 py-2 font-medium transition-colors ${
                  active
                    ? "text-accent-700"
                    : "text-ink-500 hover:bg-accent-50 hover:text-accent-700"
                }`}
              >
                {label}
                {active && (
                  <span className="absolute inset-x-3 -bottom-[7px] hidden h-0.5 rounded-full bg-accent-600 sm:block" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
