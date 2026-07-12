"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LineChart, LinkIcon } from "lucide-react";
import { LucideMark } from "@/components/Navbar";
import UrlHeroCard from "@/components/UrlHeroCard";

/**
 * Écran d'accueil affiché uniquement quand aucun bien n'est encore suivi
 * (premier lancement). Remplace le tableau/carte, vides, par une invitation
 * claire à l'action plutôt qu'une page qui semble cassée ou vide par erreur.
 * Le bloc "Coller l'URL" (fonctionnalité phare) est directement utilisable
 * ici, sans détour par une page intermédiaire — coller puis "Analyser"
 * envoie droit vers l'Analyse IA.
 */
export default function EmptyHomeState() {
  const router = useRouter();
  const [url, setUrl] = useState("");

  function handleAnalyse() {
    const trimmed = url.trim();
    if (!trimmed) return;
    router.push(`/appartements/nouveau?url=${encodeURIComponent(trimmed)}`);
  }

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

      <div className="mt-10 text-left">
        <UrlHeroCard
          value={url}
          onChange={setUrl}
          onSubmit={handleAnalyse}
          footer={
            <>
              <Link
                href="/appartements/nouveau?manual=1"
                className="text-sm font-medium text-ink-600 underline decoration-ink-300 underline-offset-2 transition-colors hover:text-ink-900"
              >
                Ou saisir directement à la main, sans URL
              </Link>
              <Link
                href="/bookmarklet"
                className="text-sm font-medium text-accent-600 transition-colors hover:text-accent-800"
              >
                Site protégé contre le scraping ? Utilise le bookmarklet →
              </Link>
            </>
          }
        />
      </div>

      <div className="mt-8 flex flex-col items-center gap-2 text-xs text-ink-400 sm:flex-row sm:justify-center sm:gap-6">
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
