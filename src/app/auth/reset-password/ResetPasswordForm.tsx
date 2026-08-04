"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Eye, EyeOff } from "lucide-react";
import AuthShell from "@/app/(auth)/AuthShell";
import { changerMotDePasse, type EtatAuth } from "@/app/(auth)/actions";

function BoutonSoumettre() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-accent-600 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-700 active:bg-accent-800 disabled:opacity-60"
    >
      {pending ? "Mise à jour…" : "Mettre à jour le mot de passe"}
    </button>
  );
}

function ChampMotDePasse({ name, label, autoComplete }: { name: string; label: string; autoComplete: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label className="font-medium text-ink-700">{label}</label>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          name={name}
          required
          minLength={8}
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
    </div>
  );
}

export default function ResetPasswordForm() {
  const [etat, formAction] = useActionState(changerMotDePasse, {});

  return (
    <AuthShell>
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900 max-lg:text-center sm:text-3xl">
          Nouveau mot de passe
        </h1>
        <p className="mt-2 text-sm text-ink-500 max-lg:text-center">
          Saisis un nouveau mot de passe pour accéder à ton compte.
        </p>
      </div>

      <form action={formAction} className="mt-8 space-y-5">
        <ChampMotDePasse label="Nouveau mot de passe" name="motDePasse" autoComplete="new-password" />

        <div className="flex flex-col gap-1.5 text-sm">
          <label className="font-medium text-ink-700">Confirmation</label>
          <input
            type="password"
            name="confirmation"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-lg border border-ink-300 bg-white px-3.5 py-3 text-sm text-ink-900 transition-colors focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
          />
          <span className="text-xs text-ink-400">Doit correspondre au mot de passe ci-dessus</span>
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

        <BoutonSoumettre />
      </form>
    </AuthShell>
  );
}
