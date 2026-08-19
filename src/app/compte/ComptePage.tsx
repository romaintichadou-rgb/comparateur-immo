"use client";

import { useState } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Eye, EyeOff } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { StatCard, type StatCardTone } from "@/components/StatCard";
import ConfirmDialog from "@/components/ConfirmDialog";
import { changerMotDePasse, supprimerCompte } from "@/app/(auth)/actions";
import type { UserProfile } from "@/lib/db";
import { LIMITE_ANALYSES_PRO, LIMITE_BIENS_FREE, PLAN_LABEL } from "@/lib/plans";

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

function ChampMotDePasse({
  name,
  label,
  hint,
  autoComplete,
}: {
  name: string;
  label: string;
  hint?: string;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  const id = `mdp-${name}`;

  return (
    <div className="flex flex-col text-sm">
      <label htmlFor={id} className="font-medium text-ink-700">
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          id={id}
          type={visible ? "text" : "password"}
          name={name}
          required
          minLength={8}
          autoComplete={autoComplete}
          aria-describedby={hint ? `${id}-hint` : undefined}
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
      {/* `min-h-4` : le sous-titre n'existe que sous le premier champ. Rendu
          conditionnellement, les deux colonnes de la grille se décalaient d'une
          ligne — la place est donc réservée dans les deux cas.
          `ink-500` et non `ink-400` : 7,6:1 contre 3,6:1 sur blanc, seul le
          premier passe le seuil AA pour du texte de 12 px. */}
      <p id={`${id}-hint`} className="mt-1.5 min-h-4 text-xs text-ink-500">
        {hint}
      </p>
    </div>
  );
}

/**
 * Le plan est un STATUT, pas une métrique.
 *
 * Il occupait une troisième carte identique à « Biens » et « Analyses », donc
 * un chiffre-clé en `font-mono` — pour un mot. Trois cartes de même poids
 * aplatissaient aussi la hiérarchie : le plan conditionne les deux autres, il
 * ne se lit pas à côté d'elles.
 */
function BadgePlan({ plan, isTester }: { plan: UserProfile["plan"]; isTester: boolean }) {
  return (
    <>
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${plan === "pro" ? "bg-accent-50 text-accent-700" : "bg-ink-100 text-ink-600"}`}>
        {PLAN_LABEL[plan]}
      </span>
      {isTester && (
        <span className="rounded-full border border-ink-100 px-2.5 py-1 text-xs font-medium text-ink-500">
          Testeur
        </span>
      )}
    </>
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

  const gratuit = profil.plan === "free" && !profil.isTester;
  const pro = profil.plan === "pro";

  const limiteAtteinte = gratuit && profil.nombreBiens >= LIMITE_BIENS_FREE;
  const biensTone: StatCardTone = limiteAtteinte ? "attention" : "neutral";
  const biensValue = gratuit
    ? `${profil.nombreBiens}/${LIMITE_BIENS_FREE}`
    : String(profil.nombreBiens);

  // Le plafond ne concerne QUE le plan Pro (voir `checkAndIncrementAnalyseQuota`) :
  // afficher « /50 » à un compte gratuit annoncerait une limite qui n'existe pas.
  const analysesTone: StatCardTone = !pro
    ? "neutral"
    : profil.analysesAuMoisCourant >= LIMITE_ANALYSES_PRO
      ? "alerte"
      : profil.analysesAuMoisCourant >= LIMITE_ANALYSES_PRO * 0.8
        ? "attention"
        : "neutral";

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 sm:px-6">
      <div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="heading-h1">Mon compte</h1>
          <BadgePlan plan={profil.plan} isTester={profil.isTester} />
        </div>
        <p className="mt-1 text-sm text-ink-500">{email}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard
          label="Biens suivis"
          value={biensValue}
          tone={biensTone}
          sub={gratuit ? (limiteAtteinte ? "Limite atteinte" : "1 bien inclus") : "Illimités"}
        />
        <StatCard
          label="Analyses IA ce mois"
          value={
            pro
              ? `${profil.analysesAuMoisCourant}/${LIMITE_ANALYSES_PRO}`
              : String(profil.analysesAuMoisCourant)
          }
          tone={analysesTone}
          sub={pro ? "Renouvelé chaque mois" : "Sans limite"}
        />
      </div>

      {/* L'offre n'est proposée qu'au plan gratuit : un abonné Pro n'a rien à
          acheter, et un testeur a déjà tout. Rendre un bouton inerte « déjà
          abonné » n'informerait de rien que les cartes ne disent. */}
      {gratuit && (
        <section className="rounded-xl border border-ink-100 bg-white p-6">
          <SectionHeader title="Passer à Pro" />
          <p className="mt-4 text-sm leading-relaxed text-ink-600">
            Biens illimités et {LIMITE_ANALYSES_PRO}&nbsp;analyses par mois, pour
            5,99&nbsp;€ par mois sans engagement.
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

      <section className="rounded-xl border border-ink-100 bg-white p-6">
        <SectionHeader title="Mot de passe" />
        <form action={mdpAction} className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <ChampMotDePasse
            name="motDePasse"
            label="Nouveau mot de passe"
            hint="8 caractères minimum"
            autoComplete="new-password"
          />
          <ChampMotDePasse name="confirmation" label="Confirmer" autoComplete="new-password" />

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

      {/* La suppression était un lien `text-xs text-ink-400` centré en pied de
          page : 3,1:1 sur le fond `ink-50`, sous le minimum AA de 4,5:1, et rouge
          au SURVOL seulement — donc muet au doigt. Posée sur une carte blanche,
          `text-red-600` passe à 4,8:1 et annonce sa nature sans attendre un
          survol. La carte reste la dernière de la page : séparée des actions
          courantes, mais lisible. */}
      <section className="rounded-xl border border-ink-100 bg-white p-6">
        <SectionHeader title="Supprimer le compte" />
        <p className="mt-4 text-sm leading-relaxed text-ink-600">
          Tes biens, tes analyses et ton profil investisseur seront définitivement
          effacés. Cette action est irréversible.
        </p>
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="rounded-lg border border-red-200 px-5 py-2.5 text-sm font-medium text-red-600 transition-colors hover:border-red-600 hover:bg-red-50"
          >
            Supprimer mon compte
          </button>
        </div>
      </section>

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
