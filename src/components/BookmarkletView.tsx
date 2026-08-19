"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { buildBookmarkletHref } from "@/lib/bookmarklet";
import { APP_NAME } from "@/lib/constants";
import { SectionHeader } from "@/components/SectionHeader";

/** Classes du lien de retour — reprises telles quelles d'`AddApartmentFlow`. */
const LIEN_RETOUR =
  "inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-accent-600";

/**
 * Retour vers la page d'où l'on vient.
 *
 * Un `href` fixe serait faux une fois sur deux : cette page est atteinte
 * depuis l'accueil (`EmptyHomeState`, quand aucun bien n'est suivi) ET depuis
 * le formulaire d'ajout. On suit donc l'historique.
 *
 * Repli sur l'accueil quand il n'y a pas d'historique à remonter — page
 * ouverte dans un onglet neuf, ou mise en favori. Sans ce garde-fou, le
 * bouton ne ferait rien du tout, ce qui est pire qu'une destination
 * approximative.
 */
function RetourPagePrecedente() {
  const router = useRouter();
  // Lecture directe, sans effet : la page est montée en `ssr: false` (voir
  // `app/bookmarklet/page.tsx`), ce composant ne s'exécute donc jamais côté
  // serveur — il n'y a pas d'hydratation à faire diverger. Passer par un
  // `useEffect` ne ferait que rendre d'abord le mauvais libellé, puis le
  // corriger : un clignotement visible pour rien.
  const aUnHistorique = window.history.length > 1;

  if (!aUnHistorique) {
    return (
      <Link href="/" className={LIEN_RETOUR}>
        <ArrowLeft className="h-4 w-4" />
        Retour à la liste
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => router.back()} className={LIEN_RETOUR}>
      <ArrowLeft className="h-4 w-4" />
      Retour
    </button>
  );
}

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
      <RetourPagePrecedente />

      <div>
        <h1 className="heading-h1">
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

      <div className="rounded-xl border border-ink-100 bg-white p-6">
        <SectionHeader title="1. Installer le bookmarklet" />
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

      <div className="rounded-xl border border-ink-100 bg-white p-6">
        <SectionHeader title="2. Utiliser" />
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

      <div className="rounded-lg border border-ink-100 bg-ink-50 p-4 text-xs text-ink-500">
        Le bookmarklet s&apos;exécute entièrement dans ton navigateur : aucune donnée n&apos;est
        envoyée ailleurs qu&apos;à ta propre app. Le formulaire s&apos;ouvre dans un nouvel
        onglet, ta page d&apos;annonce reste accessible.
      </div>
    </div>
  );
}
