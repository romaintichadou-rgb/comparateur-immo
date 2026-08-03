"use client";

import { useState } from "react";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Eye, EyeOff } from "lucide-react";
import { AppMark } from "@/components/Navbar";
import AuthShell from "./AuthShell";
import type { EtatAuth } from "./actions";

function BoutonSoumettre({ libelle }: { libelle: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-accent-600 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-700 active:bg-accent-800 disabled:opacity-60"
    >
      {pending ? "Un instant…" : libelle}
    </button>
  );
}

function ChampMotDePasse({ autoComplete }: { autoComplete: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        name="motDePasse"
        required
        autoComplete={autoComplete}
        className="w-full rounded-lg border border-ink-300 bg-white px-3.5 py-3 pr-11 text-sm text-ink-900 transition-colors focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-400 transition-colors hover:text-ink-600"
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        tabIndex={-1}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export default function AuthForm({
  action,
  titre,
  sousTitre,
  libelleBouton,
  suivant,
  piedDePage,
}: {
  action: (etat: EtatAuth, formData: FormData) => Promise<EtatAuth>;
  titre: string;
  sousTitre: string;
  libelleBouton: string;
  suivant?: string;
  piedDePage: { texte: string; lienLabel: string; lienHref: string };
}) {
  const [etat, formAction] = useActionState(action, {});
  const estConnexion = libelleBouton === "Se connecter";

  return (
    <AuthShell>
      <div className="mb-8 text-center lg:hidden">
        <AppMark className="mx-auto h-10 w-10 text-accent-600" />
      </div>

      <h1 className="font-display text-2xl font-semibold text-ink-900 max-lg:text-center lg:text-3xl">
        {titre}
      </h1>
      <p className="mt-2 text-sm text-ink-500 max-lg:text-center">{sousTitre}</p>

      <form action={formAction} className="mt-8 space-y-5">
        {suivant && <input type="hidden" name="suivant" value={suivant} />}

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink-700">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="rounded-lg border border-ink-300 bg-white px-3.5 py-3 text-sm text-ink-900 transition-colors focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
          />
        </label>

        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex items-baseline justify-between">
            <span className="font-medium text-ink-700">Mot de passe</span>
            {estConnexion && (
              <Link
                href="/mot-de-passe-oublie"
                className="text-xs text-accent-600 transition-colors hover:text-accent-800"
              >
                Mot de passe oublié ?
              </Link>
            )}
          </div>
          <ChampMotDePasse autoComplete={estConnexion ? "current-password" : "new-password"} />
        </div>

        {etat.erreur && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50/80 px-3.5 py-2.5 text-xs font-medium text-red-800"
          >
            {etat.erreur}
          </p>
        )}
        {etat.message && (
          <p
            role="status"
            className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3.5 py-2.5 text-xs font-medium text-emerald-800"
          >
            {etat.message}
          </p>
        )}

        <BoutonSoumettre libelle={libelleBouton} />
      </form>

      <p className="mt-6 text-center text-sm text-ink-500">
        {piedDePage.texte}{" "}
        <Link
          href={piedDePage.lienHref}
          className="font-medium text-accent-600 underline underline-offset-2 hover:text-accent-800"
        >
          {piedDePage.lienLabel}
        </Link>
      </p>
    </AuthShell>
  );
}
