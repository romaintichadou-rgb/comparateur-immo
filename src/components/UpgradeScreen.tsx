import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { AppMark } from "@/components/Navbar";

/**
 * Gabarit plein-page des écrans d'upgrade (quota de biens atteint, quota
 * d'analyses atteint, retour de paiement).
 *
 * Pourquoi une PAGE et pas une modale : le blocage arrive au moment où
 * l'utilisateur a une intention précise (ajouter un bien, relancer une
 * analyse). Une modale recouvre ce contexte et se ferme d'un clic à côté ;
 * une page se partage, se recharge, et laisse la place d'expliquer ce qui est
 * débloqué sans donner l'impression d'un pop-up de vente.
 *
 * Le ton est volontairement DOUX : on constate une limite atteinte, on montre
 * ce que Pro apporte, on laisse repartir sans payer (`retour`). Pas de
 * compte à rebours, pas de majuscules, pas d'urgence fabriquée.
 *
 * Même vocabulaire visuel que `ErrorScreen` (badge à halo, filigrane AppMark,
 * titre Fraunces, corps ink-500) : ce sont deux interruptions de parcours,
 * elles doivent se ressembler.
 */
export default function UpgradeScreen({
  icon: Icon,
  title,
  message,
  note,
  action,
  retour,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
  /** Précision factuelle sous le message (ex. date du prochain renouvellement). */
  note?: string;
  action: ReactNode;
  retour: { href: string; label: string };
}) {
  return (
    <div className="relative flex min-h-[calc(100vh-67px)] items-center justify-center px-4 py-12 text-center sm:px-6">
      <div className="bg-tech-grid pointer-events-none absolute inset-x-0 top-0 h-64" aria-hidden="true" />

      <div className="relative max-w-lg">
        <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
          <AppMark className="absolute h-28 w-28 text-accent-300/20" />
          <span className="absolute inset-0 rounded-full bg-accent-100/70 blur-xl" aria-hidden="true" />
          <span className="relative flex h-16 w-16 items-center justify-center rounded-xl border border-ink-200 bg-white shadow-lg shadow-accent-100">
            <Icon className="h-8 w-8 text-accent-600" aria-hidden="true" />
          </span>
        </div>

        <h1 className="mt-7 font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
          {title}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-500 sm:text-base">
          {message}
        </p>
        {note && <p className="mt-2 text-sm text-ink-400">{note}</p>}

        <div className="mt-8">{action}</div>

        <p className="mt-5">
          <Link
            href={retour.href}
            className="text-sm text-ink-500 underline underline-offset-2 transition-colors hover:text-ink-800"
          >
            {retour.label}
          </Link>
        </p>
      </div>
    </div>
  );
}

/** Les trois lignes de ce que Pro débloque + le prix. Rendu dans une carte. */
export function OffrePro() {
  return (
    <div className="mx-auto max-w-sm rounded-xl border border-ink-200 bg-white p-5 text-left">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-lg font-semibold text-ink-900">Pro</span>
        <span className="font-mono text-lg font-semibold text-ink-900">
          5,99&nbsp;€<span className="text-xs font-normal text-ink-400">/mois</span>
        </span>
      </div>
      <ul className="mt-4 space-y-2 text-sm text-ink-600">
        <li className="flex gap-2">
          <span className="text-accent-600" aria-hidden="true">
            •
          </span>
          Biens illimités
        </li>
        <li className="flex gap-2">
          <span className="text-accent-600" aria-hidden="true">
            •
          </span>
          50 analyses IA par mois
        </li>
        <li className="flex gap-2">
          <span className="text-accent-600" aria-hidden="true">
            •
          </span>
          Support par email
        </li>
      </ul>
      <p className="mt-4 border-t border-ink-100/50 pt-3 text-xs text-ink-400">
        Sans engagement, résiliable à tout moment.
      </p>
    </div>
  );
}

/**
 * Bouton vers le Payment Link Stripe.
 *
 * `?client_reference_id=` transporte l'identifiant du compte jusqu'au webhook :
 * c'est ce qui permet de rattacher le paiement au bon utilisateur sans se fier
 * à l'email saisi dans Stripe (qui peut différer de celui du compte).
 *
 * Sans `NEXT_PUBLIC_STRIPE_PAYMENT_LINK` configuré, on rend un état inerte
 * plutôt qu'un lien mort : l'écran reste lisible en développement.
 */
export function BoutonPasserPro({ userId }: { userId: string }) {
  const lien = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK;

  if (!lien) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs font-medium text-amber-800">
        Le paiement n&rsquo;est pas encore configuré sur cet environnement.
      </p>
    );
  }

  const url = `${lien}?client_reference_id=${encodeURIComponent(userId)}`;

  return (
    <a
      href={url}
      className="inline-block rounded-lg bg-accent-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-700 active:bg-accent-800"
    >
      Passer à Pro
    </a>
  );
}
