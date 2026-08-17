"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Settings, User } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { deconnexion } from "@/app/(auth)/actions";

/**
 * ── Pourquoi la barre ne porte AUCUN lien de navigation ───────────────────
 *
 * Elle en portait deux, et les deux étaient superflus :
 *
 *  - « Profil investisseur » (`/parametres`) : taux, durée, TMI et seuils se
 *    règlent à la mise en route puis ne bougent quasiment plus. Un créneau
 *    permanent à côté de l'écran de travail le surdimensionnait — il vit
 *    désormais dans le `UserMenu`, à toutes les tailles.
 *  - « Mes biens » (`/`) : le wordmark pointe DÉJÀ vers `/`, et la fiche d'un
 *    bien porte son propre « Retour à la liste ». Deux affordances pour la
 *    même destination, à 40 px l'une de l'autre.
 *
 * Il ne reste donc que wordmark à gauche, `UserMenu` à droite. Avant de
 * rétablir un `NAV_LINKS`, vérifier que la destination n'est PAS déjà
 * atteignable depuis le wordmark ou depuis l'écran courant — c'est ce qui a
 * disqualifié les deux précédentes.
 *
 * ⚠️ Corollaire pour `/parametres` : le `UserMenu` en est le SEUL chemin, et il
 * ne doit pas en exister depuis une fiche bien. Le profil est global — le
 * modifier depuis un bien invaliderait l'analyse de tous les autres, soit un
 * effet global déclenché depuis un contexte local. Une fiche ne modifie que les
 * données de SON bien.
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
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Le menu retient la page SUR LAQUELLE il a été ouvert, plutôt qu'un booléen
  // qu'un effet remettrait à false à chaque changement de route : naviguer
  // change `pathname`, donc referme le menu par simple dérivation. L'effet
  // équivalent provoquait un rendu en cascade (menu visible une frame après
  // l'arrivée sur la nouvelle page).
  const [ouvertSur, setOuvertSur] = useState<string | null>(null);
  const open = ouvertSur === pathname;
  const setOpen = useCallback(
    (valeur: boolean) => setOuvertSur(valeur ? pathname : null),
    [pathname]
  );

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
  }, [open, setOpen]);

  const initial = email.charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
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

          {/* ⚠️ Les deux entrées portent une SOUS-LIGNE, et ce n'est pas
              décoratif : « Profil investisseur » et « Mon compte » sonnent
              pareil. Tant que le premier vivait dans la navbar, c'est la
              POSITION qui les distinguait (barre = calculs, avatar = abonné) ;
              réunis dans le même menu, ce repère disparaît et il faut le
              remplacer par du texte.
              Sous-ligne en `ink-500` et non `ink-400` : ce dernier tombe à
              3,64:1 sur blanc, sous le seuil AA. */}
          <div className="py-1">
            <Link
              href="/parametres"
              role="menuitem"
              className="flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-ink-50"
            >
              <User className="mt-0.5 size-4 shrink-0 text-ink-400" />
              <span className="min-w-0">
                <span className="block text-sm text-ink-700">Profil investisseur</span>
                <span className="mt-0.5 block text-xs text-ink-500">
                  Taux, durée, TMI et seuils de calcul
                </span>
              </span>
            </Link>
            <Link
              href="/compte"
              role="menuitem"
              className="flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-ink-50"
            >
              <Settings className="mt-0.5 size-4 shrink-0 text-ink-400" />
              <span className="min-w-0">
                <span className="block text-sm text-ink-700">Mon compte</span>
                <span className="mt-0.5 block text-xs text-ink-500">
                  Abonnement, mot de passe, suppression
                </span>
              </span>
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

  const surFicheBien = pathname.startsWith("/appartements/");

  return (
    <header className={`${surFicheBien ? "relative z-50" : "sticky top-0 z-40"} border-b border-ink-100/70 bg-white/80 backdrop-blur-md`}>
      <div className="h-[3px] w-full bg-gradient-to-r from-accent-600 via-accent-400 to-accent-600" />
      {/* Pleine largeur, sans `max-w-*` : la barre est un bandeau d'application,
          elle s'ancre aux bords de la fenêtre et non à la colonne de contenu. */}
      <div className="flex h-16 items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Link href="/" className="transition-opacity hover:opacity-80" aria-label={`${APP_NAME} — accueil`}>
          <Wordmark />
        </Link>

        {surEcranAuth ? null : (
          <div className="ml-auto flex items-center">
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
