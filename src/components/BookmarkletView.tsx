"use client";

import { useEffect, useRef } from "react";
import { buildBookmarkletHref } from "@/lib/bookmarklet";

export default function BookmarkletView() {
  const origin = window.location.origin;
  const href = buildBookmarkletHref(origin);
  const linkRef = useRef<HTMLAnchorElement>(null);

  // React 19 sanitise par défaut les href "javascript:" posés via JSX (anti-XSS).
  // Ce lien est un bookmarklet légitime : on pose l'attribut directement sur le
  // DOM pour contourner cette protection, qui ne s'applique qu'au rendu React.
  useEffect(() => {
    linkRef.current?.setAttribute("href", href);
  }, [href]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          Importer une annonce depuis ton navigateur
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Leboncoin, SeLoger et PAP bloquent souvent la récupération automatique côté serveur
          (protection anti-bot). Ce bookmarklet contourne le problème proprement : il lit les
          données directement dans <strong>ta</strong> page déjà ouverte normalement dans le
          navigateur — aucune requête automatisée n&apos;est faite vers le site, donc aucune
          détection possible.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          1. Installer le bookmarklet
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Glisse ce bouton dans ta barre de favoris (affiche-la si besoin avec{" "}
          <kbd className="rounded border border-slate-300 bg-slate-50 px-1">⌘⇧B</kbd>) :
        </p>
        <div className="mt-4 flex justify-center">
          <a
            ref={linkRef}
            href="#"
            onClick={(e) => e.preventDefault()}
            draggable
            className="cursor-move select-none rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm"
          >
            📥 Importer dans Comparateur locatif
          </a>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Le lien pointe vers <code className="rounded bg-slate-100 px-1">{origin}</code> — si tu
          ouvres cette page depuis une autre adresse (ex. après déploiement), reviens ici pour
          régénérer un bookmarklet à jour.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          2. Utiliser
        </h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>Ouvre une annonce Leboncoin, SeLoger, PAP ou Orpi normalement dans ton navigateur</li>
          <li>Clique sur le favori &laquo;&nbsp;Importer dans Comparateur locatif&nbsp;&raquo;</li>
          <li>
            Il déplie automatiquement les boutons &laquo;&nbsp;Voir plus&nbsp;&raquo; de la page
            (description, détails...) pour lire un maximum d&apos;informations
          </li>
          <li>
            L&apos;onglet se redirige vers le formulaire d&apos;ajout, pré-rempli avec ce qui a pu
            être détecté — vérifie et corrige avant d&apos;enregistrer
          </li>
        </ol>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
        Le bookmarklet s&apos;exécute entièrement dans ton navigateur : aucune donnée n&apos;est
        envoyée ailleurs qu&apos;à ta propre app. Il réutilise l&apos;onglet de l&apos;annonce
        (pense à la garder ouverte dans un autre onglet si tu veux la recomparer ensuite).
      </div>
    </div>
  );
}
