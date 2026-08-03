/**
 * Plans et limites — partagé serveur ET client.
 *
 * Ces constantes vivaient dans `db.ts`, qui porte `import "server-only"` : un
 * composant client ne pouvait donc pas les lire et devait recopier « 1 » et
 * « 50 » à la main. Deux sources pour la même règle commerciale, dont une
 * invisible depuis l'écran qui l'affiche — c'est exactement le genre d'écart
 * qui survit à un changement de tarif.
 *
 * Ce module n'importe rien et ne touche à aucune donnée : il peut être chargé
 * des deux côtés sans risque.
 */

export type Plan = "free" | "pro" | "tester";

/** Nombre de biens suivis par un compte gratuit. */
export const LIMITE_BIENS_FREE = 1;

/** Analyses IA mensuelles incluses dans l'abonnement Pro. */
export const LIMITE_ANALYSES_PRO = 50;

/** Libellé affiché du plan. */
export const PLAN_LABEL: Record<Plan, string> = {
  free: "Plan gratuit",
  pro: "Plan Pro",
  tester: "Testeur",
};
