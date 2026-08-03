"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AppMark } from "@/components/Navbar";
import { APP_NAME } from "@/lib/constants";
import type { EtatAuth } from "./actions";

/**
 * Formulaire partagé entre connexion et inscription — les deux écrans ne
 * diffèrent que par leur action, leur libellé et leur lien de bas de page.
 *
 * Charte : bouton primaire `bg-accent-600`, pleine largeur en pied de
 * formulaire (`w-full py-3`, comme `SettingsForm`), sans icône. Carte bordée
 * sans ombre. Titre en `font-display`.
 */

function BoutonSoumettre({ libelle }: { libelle: string }) {
  // `useFormStatus` doit être appelé dans un composant ENFANT du <form> :
  // dans le même composant que le formulaire, il renverrait toujours false.
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-accent-600 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-60"
    >
      {pending ? "Un instant…" : libelle}
    </button>
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

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-8">
      <div className="mb-6 text-center">
        <AppMark className="mx-auto h-9 w-9 text-accent-600" />
        <h1 className="mt-4 font-display text-2xl font-semibold text-ink-900">{titre}</h1>
        <p className="mt-1.5 text-sm text-ink-500">{sousTitre}</p>
      </div>

      <form action={formAction} className="rounded-xl border border-ink-200 bg-white p-5">
        {suivant && <input type="hidden" name="suivant" value={suivant} />}

        <div className="space-y-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink-700">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="rounded-md border border-ink-300 bg-white px-3 py-2.5 text-sm text-ink-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink-700">Mot de passe</span>
            <input
              type="password"
              name="motDePasse"
              required
              // `new-password` sur l'inscription fait proposer un mot de passe
              // fort par le gestionnaire du navigateur ; `current-password` sur
              // la connexion lui fait proposer celui déjà enregistré.
              autoComplete={libelleBouton === "Créer mon compte" ? "new-password" : "current-password"}
              className="rounded-md border border-ink-300 bg-white px-3 py-2.5 text-sm text-ink-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
            />
          </label>
        </div>

        {etat.erreur && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-200 bg-red-50/80 px-3 py-2 text-xs font-medium text-red-800"
          >
            {etat.erreur}
          </p>
        )}
        {etat.message && (
          <p
            role="status"
            className="mt-4 rounded-md border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs font-medium text-emerald-800"
          >
            {etat.message}
          </p>
        )}

        <div className="mt-5">
          <BoutonSoumettre libelle={libelleBouton} />
        </div>
      </form>

      <p className="mt-5 text-center text-sm text-ink-500">
        {piedDePage.texte}{" "}
        <Link
          href={piedDePage.lienHref}
          className="font-medium text-accent-600 underline underline-offset-2 hover:text-accent-800"
        >
          {piedDePage.lienLabel}
        </Link>
      </p>

      <p className="mt-8 text-center text-xs text-ink-400">
        {APP_NAME} — tes biens, tes analyses, ton compte.
      </p>
    </div>
  );
}
