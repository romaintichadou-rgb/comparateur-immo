"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { APP_NAME } from "@/lib/constants";

const NAV_LINKS = [
  { href: "/parametres", label: "Profil investisseur", icon: SlidersHorizontal },
];

/** Anneau de score de l'app, laissé ouvert — la marque Lucide. */
export function LucideMark({ className }: { className?: string }) {
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

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="border-b border-ink-200/80 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-ink-900">
          <LucideMark className="h-7 w-7 text-accent-600" />
          <span className="font-display text-lg italic font-semibold tracking-tight">{APP_NAME}</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-2">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium transition-colors sm:px-3 ${
                  active ? "bg-accent-50 text-accent-700" : "text-ink-500 hover:bg-ink-100 hover:text-ink-900"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
          <Link
            href="/appartements/nouveau"
            className="inline-flex items-center rounded-lg bg-accent-600 px-3.5 py-1.5 font-medium text-white shadow-sm transition-colors hover:bg-accent-700"
          >
            Ajouter un bien
          </Link>
        </nav>
      </div>
    </header>
  );
}
