"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Settings, User } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { deconnexion } from "@/app/(auth)/actions";

const NAV_LINKS = [
  { href: "/parametres", label: "Profil investisseur" },
];

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

const ROUTES_AUTH = ["/login", "/signup", "/mot-de-passe-oublie"];

function UserMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const initial = email.charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
          open
            ? "bg-accent-200 text-accent-800"
            : "bg-accent-100 text-accent-700 hover:bg-accent-200"
        }`}
        aria-label="Menu du compte"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-ink-100 bg-white py-1 shadow-lg"
        >
          <div className="border-b border-ink-100 px-4 py-3">
            <p className="text-xs text-ink-400">Connecté</p>
            <p className="mt-0.5 truncate text-sm font-medium text-ink-700">{email}</p>
          </div>

          <div className="py-1">
            <Link
              href="/parametres"
              role="menuitem"
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900 sm:hidden"
            >
              <User className="size-4 text-ink-400" />
              Profil investisseur
            </Link>
            <Link
              href="/compte"
              role="menuitem"
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
            >
              <Settings className="size-4 text-ink-400" />
              Mon compte
            </Link>
          </div>

          <div className="border-t border-ink-100 py-1">
            <form action={deconnexion}>
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
              >
                <LogOut className="size-4 text-ink-400" />
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Navbar({ email }: { email?: string }) {
  const pathname = usePathname();
  const surEcranAuth = ROUTES_AUTH.some((r) => pathname.startsWith(r));

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100/70 bg-white/80 backdrop-blur-md">
      <div className="h-[3px] w-full bg-gradient-to-r from-accent-600 via-accent-400 to-accent-600" />
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="transition-opacity hover:opacity-80" aria-label={`${APP_NAME} — accueil`}>
          <Wordmark />
        </Link>
        {surEcranAuth ? null : (
          <div className="flex items-center gap-2 sm:gap-4">
            {email && (
              <nav className="hidden items-center gap-1 text-sm sm:flex">
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
            )}

            {email ? (
              <UserMenu email={email} />
            ) : (
              <Link
                href="/login"
                className="rounded-lg bg-accent-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-700"
              >
                Se connecter
              </Link>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
