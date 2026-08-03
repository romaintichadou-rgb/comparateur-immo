"use client";

import { useState } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Eye, EyeOff, KeyRound, Zap, Home, BarChart3 } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import ConfirmDialog from "@/components/ConfirmDialog";
import { changerMotDePasse, supprimerCompte, type EtatAuth } from "@/app/(auth)/actions";
import type { UserProfile } from "@/lib/db";

function BoutonSoumettre({ libelle, pending: libellePending }: { libelle: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-accent-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-700 active:bg-accent-800 disabled:opacity-60"
    >
      {pending ? libellePending : libelle}
    </button>
  );
}

function ChampMotDePasse({ name, autoComplete }: { name: string; autoComplete: string }) {
  const [visible, setVisible] = useState(false);
  return (
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
  );
}

function ProfessionCard({
  icon: Icon,
  label,
  valeur,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  valeur: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 text-accent-600 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-ink-400 uppercase">{label}</p>
          <p className="mt-1 text-xl font-semibold text-ink-900">{valeur}</p>
          {detail && <p className="mt-1 text-xs text-ink-500">{detail}</p>}
        </div>
      </div>
    </div>
  );
}

export default function ComptePage({ email, profil }: { email: string; profil: UserProfile }) {
  const [mdpEtat, mdpAction] = useActionState(changerMotDePasse, {});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    const result = await supprimerCompte();
    if (result.erreur) {
      setDeleteError(result.erreur);
      setDeleting(false);
    }
  }

  const gratuit = profil.plan === "free";
  const planLabel = {
    free: "Gratuit",
    pro: "Pro",
    tester: "Testeur",
  }[profil.plan];

  const limiteBiens = gratuit ? "1" : "illimités";

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink-900">Mon compte</h1>
        <p className="mt-1 text-sm text-ink-500">{email}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ProfessionCard
          icon={Zap}
          label="Plan"
          valeur={planLabel}
          detail={gratuit ? "1 bien suivi" : "Merci !"}
        />
        <ProfessionCard
          icon={Home}
          label="Biens"
          valeur={`${profil.nombreBiens}/${limiteBiens}`}
          detail={gratuit && profil.nombreBiens >= 1 ? "Limite atteinte" : undefined}
        />
        <ProfessionCard
          icon={BarChart3}
          label="Analyses IA"
          valeur={`${profil.analysesAuMoisCourant}${profil.plan === "pro" ? "/50" : ""}`}
          detail={profil.plan === "pro" ? "Ce mois" : "Sans limite"}
        />
      </div>

      {/* L'offre n'est proposée qu'au plan gratuit : un abonné Pro n'a rien à
          acheter, et un testeur a déjà tout. Rendre un bouton inerte « déjà
          abonné » n'informerait de rien que les cartes ne disent. */}
      {gratuit && (
        <section className="rounded-xl border border-ink-200 bg-white p-6">
          <SectionHeader icon={Zap} title="Passer à Pro" />
          <p className="mt-4 text-sm leading-relaxed text-ink-600">
            Suis autant de biens que tu veux et lance jusqu&rsquo;à 50 analyses par mois,
            pour 5,99&nbsp;€ par mois sans engagement.
          </p>
          <div className="mt-5">
            <Link
              href="/upgrade/bien-limite"
              className="inline-block rounded-lg bg-accent-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-700 active:bg-accent-800"
            >
              Voir l&rsquo;offre
            </Link>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-ink-200 bg-white p-6">
        <SectionHeader icon={KeyRound} title="Mot de passe" />
        <form action={mdpAction} className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink-700">Nouveau mot de passe</span>
            <ChampMotDePasse name="motDePasse" autoComplete="new-password" />
            <span className="text-xs text-ink-400">8 caractères minimum</span>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink-700">Confirmer</span>
            <ChampMotDePasse name="confirmation" autoComplete="new-password" />
          </label>

          <div className="sm:col-span-2">
            {mdpEtat.erreur && (
              <p
                role="alert"
                className="mb-4 rounded-lg border border-red-200 bg-red-50/80 px-3.5 py-2.5 text-xs font-medium text-red-800"
              >
                {mdpEtat.erreur}
              </p>
            )}
            {mdpEtat.message && (
              <p
                role="status"
                className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3.5 py-2.5 text-xs font-medium text-emerald-800"
              >
                {mdpEtat.message}
              </p>
            )}
            <BoutonSoumettre libelle="Modifier le mot de passe" pending="Modification…" />
          </div>
        </form>
      </section>

      <p className="text-center text-xs text-ink-400">
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="text-ink-400 underline underline-offset-2 transition-colors hover:text-red-600"
        >
          Supprimer mon compte
        </button>
      </p>

      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer ton compte ?"
        description="Tous tes biens, tes analyses et ton profil investisseur seront définitivement supprimés. Cette action est irréversible."
        confirmLabel="Supprimer mon compte"
        loadingLabel="Suppression…"
        destructive
        loading={deleting}
        error={deleteError}
        onConfirm={handleDelete}
        onCancel={() => { setConfirmDelete(false); setDeleteError(null); }}
      />
    </div>
  );
}
