"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AppMark } from "@/components/Navbar";
import AuthShell from "../AuthShell";
import { motDePasseOublie } from "../actions";

function BoutonSoumettre() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-accent-600 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-700 active:bg-accent-800 disabled:opacity-60"
    >
      {pending ? "Envoi en cours…" : "Envoyer le lien"}
    </button>
  );
}

export default function MotDePasseOublieForm() {
  const [etat, formAction] = useActionState(motDePasseOublie, {});

  return (
    <AuthShell>
      <div className="mb-8 text-center lg:hidden">
        <AppMark className="mx-auto h-10 w-10 text-accent-600" />
      </div>

      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900 max-lg:text-center sm:text-3xl">
        Mot de passe oublié
      </h1>
      <p className="mt-2 text-sm text-ink-500 max-lg:text-center">
        Saisis ton email, tu recevras un lien pour choisir un nouveau mot de passe.
      </p>

      <form action={formAction} className="mt-8 space-y-5">
        <input
          type="hidden"
          name="origin"
          value={typeof window !== "undefined" ? window.location.origin : ""}
        />

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

        <BoutonSoumettre />
      </form>

      <p className="mt-6 text-center text-sm text-ink-500">
        Tu te souviens ?{" "}
        <Link
          href="/login"
          className="font-medium text-accent-600 underline underline-offset-2 hover:text-accent-800"
        >
          Se connecter
        </Link>
      </p>
    </AuthShell>
  );
}
