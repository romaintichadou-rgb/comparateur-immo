"use client";

import { useEffect, useRef } from "react";
import { Download, MousePointerClick } from "lucide-react";
import { buildBookmarkletHref } from "@/lib/bookmarklet";
import { APP_NAME } from "@/lib/constants";

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
        <h1 className="font-display text-xl font-semibold text-ink-900">
          Importer une annonce depuis ton navigateur
        </h1>
        <p className="mt-2 text-sm text-ink-600">
          Leboncoin, SeLoger et PAP bloquent souvent la récupération automatique côté serveur
          (protection anti-bot). Ce bookmarklet contourne le problème proprement : il lit les
          données directement dans <strong>ta</strong> page déjà ouverte normalement dans le
          navigateur — aucune requête automatisée n&apos;est faite vers le site, donc aucune
          détection possible.
        </p>
      </div>

      <div className="rounded-xl border border-ink-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
          <span className="inline-flex rounded-lg bg-accent-50 p-1.5 text-accent-400"><Download className="h-3.5 w-3.5" /></span>
          1. Installer le bookmarklet
        </h2>
        <p className="mt-2 text-sm text-ink-600">
          Glisse ce bouton dans ta barre de favoris (affiche-la si besoin avec{" "}
          <kbd className="rounded border border-ink-300 bg-ink-50 px-1">⌘⇧B</kbd>) :
        </p>
        <div className="mt-4 flex justify-center">
          <a
            ref={linkRef}
            href="#"
            onClick={(e) => e.preventDefault()}
            draggable
            className="cursor-move select-none rounded-lg bg-accent-600 px-5 py-2.5 text-sm font-medium text-white"
          >
            📥 Importer dans {APP_NAME}
          </a>
        </div>
        <p className="mt-3 text-xs text-ink-500">
          Le lien pointe vers <code className="rounded bg-ink-100 px-1">{origin}</code> — si tu
          ouvres cette page depuis une autre adresse (ex. après déploiement), reviens ici pour
          régénérer un bookmarklet à jour.
        </p>
      </div>

      <div className="rounded-xl border border-ink-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
          <span className="inline-flex rounded-lg bg-accent-50 p-1.5 text-accent-400"><MousePointerClick className="h-3.5 w-3.5" /></span>
          2. Utiliser
        </h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink-600">
          <li>Ouvre une annonce Leboncoin, SeLoger, PAP ou Orpi normalement dans ton navigateur</li>
          <li>Clique sur le favori &laquo;&nbsp;Importer dans {APP_NAME}&nbsp;&raquo;</li>
          <li>
            Il déplie automatiquement les boutons &laquo;&nbsp;Voir plus&nbsp;&raquo; de la page
            (description, détails...) pour lire un maximum d&apos;informations
          </li>
          <li>
            Un nouvel onglet s&apos;ouvre avec le formulaire pré-rempli — vérifie et corrige
            avant d&apos;enregistrer, ta page d&apos;annonce reste ouverte
          </li>
        </ol>
      </div>

      <div className="rounded-lg border border-ink-200 bg-ink-50 p-4 text-xs text-ink-500">
        Le bookmarklet s&apos;exécute entièrement dans ton navigateur : aucune donnée n&apos;est
        envoyée ailleurs qu&apos;à ta propre app. Le formulaire s&apos;ouvre dans un nouvel
        onglet, ta page d&apos;annonce reste accessible.
      </div>
    </div>
  );
}
