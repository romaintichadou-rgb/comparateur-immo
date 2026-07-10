import Link from "next/link";
import { ClipboardList, LineChart, LinkIcon, Puzzle } from "lucide-react";
import { LucideMark } from "@/components/Navbar";

/**
 * Écran d'accueil affiché uniquement quand aucun bien n'est encore suivi
 * (premier lancement). Remplace le tableau/carte, vides, par une invitation
 * claire à l'action plutôt qu'une page qui semble cassée ou vide par erreur.
 */
export default function EmptyHomeState() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20">
      <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-accent-100/70 blur-xl" />
        <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg shadow-accent-100 ring-1 ring-ink-200">
          <LucideMark className="h-9 w-9 text-accent-600" />
        </span>
      </div>
      <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
        Compare tes investissements locatifs en un coup d&apos;œil
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink-500 sm:text-base">
        Ajoute une annonce, laisse l&apos;app estimer le rendement et analyser le quartier — et
        décide en connaissance de cause, sans tableur à jour manuellement.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col rounded-2xl border border-ink-200 bg-white p-6 text-left shadow-sm transition-shadow hover:shadow-md">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-50">
            <ClipboardList className="h-5 w-5 text-accent-600" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-ink-900">
            Ajoute ton premier bien
          </h2>
          <p className="mt-1.5 flex-1 text-sm text-ink-500">
            Colle l&apos;URL d&apos;une annonce Leboncoin, SeLoger, PAP ou Orpi — ou saisis les
            infos à la main si tu préfères.
          </p>
          <Link
            href="/appartements/nouveau"
            className="mt-5 inline-flex items-center justify-center rounded-lg bg-accent-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-700"
          >
            Ajouter un bien
          </Link>
        </div>

        <div className="flex flex-col rounded-2xl border border-ink-200 bg-white p-6 text-left shadow-sm transition-shadow hover:shadow-md">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-signal-50">
            <Puzzle className="h-5 w-5 text-signal-600" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-ink-900">
            Installe le bookmarklet
          </h2>
          <p className="mt-1.5 flex-1 text-sm text-ink-500">
            Leboncoin bloque souvent la récupération automatique. Le bookmarklet lit l&apos;annonce
            directement dans ton navigateur, sans ce problème.
          </p>
          <Link
            href="/bookmarklet"
            className="mt-5 inline-flex items-center justify-center rounded-lg border border-ink-300 px-5 py-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
          >
            Voir comment l&apos;installer
          </Link>
        </div>
      </div>

      <div className="mt-10 flex flex-col items-center gap-2 text-xs text-ink-400 sm:flex-row sm:justify-center sm:gap-6">
        <span className="flex items-center gap-1.5">
          <LinkIcon className="h-3.5 w-3.5" />
          Champs pré-remplis, à vérifier avant d&apos;enregistrer
        </span>
        <span className="flex items-center gap-1.5">
          <LineChart className="h-3.5 w-3.5" />
          Rendement, risques et potentiel du quartier calculés automatiquement
        </span>
      </div>
    </div>
  );
}
