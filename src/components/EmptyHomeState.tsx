"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppMark } from "@/components/Navbar";
import UrlHeroCard from "@/components/UrlHeroCard";

// Le parcours réel de bout en bout — la numérotation encode une vraie
// séquence (coller → calculer → comparer), pas une décoration.
const STEPS = [
  {
    title: "Colle une annonce",
    desc: "Une URL Leboncoin, SeLoger, PAP ou Orpi — ou saisis les infos à la main.",
  },
  {
    title: "L'IA fait le calcul",
    desc: "Loyer estimé, rendement, quartier et risques analysés automatiquement.",
  },
  {
    title: "Compare et décide",
    desc: "Un score global par bien, côte à côte, pour trancher sans tableur.",
  },
];

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
    <div className="relative mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20">
      {/* Grille "tech" purement décorative, en fond : le masque radial de
          .bg-tech-grid s'applique à tout l'élément et à ses enfants — la poser
          en calque absolu isolé évite qu'elle n'estompe le contenu (titre,
          carte URL, étapes) vers le bas. */}
      <div className="bg-tech-grid pointer-events-none absolute inset-x-0 top-0 h-72" aria-hidden="true" />
      <div className="relative">
      <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-accent-100/70 blur-xl" />
        <span className="relative flex h-16 w-16 items-center justify-center rounded-md border border-ink-200 bg-white shadow-lg shadow-accent-100">
          <AppMark className="h-9 w-9 text-accent-600" />
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

      <div className="mt-10 grid gap-3 text-left sm:grid-cols-3 sm:gap-4">
        {STEPS.map((step, i) => (
          <div
            key={step.title}
            className="rounded-lg border border-ink-200 bg-white/70 p-4"
          >
            <span className="font-mono text-xs font-semibold tracking-wide text-accent-600">
              0{i + 1}
            </span>
            <h3 className="mt-2 text-sm font-semibold text-ink-900">{step.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-500">{step.desc}</p>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
