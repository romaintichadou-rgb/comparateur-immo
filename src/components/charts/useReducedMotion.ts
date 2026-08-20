import { useSyncExternalStore } from "react";

/**
 * Préférence système « animations réduites », lue via `useSyncExternalStore`.
 *
 * ⚠️ Ne pas revenir à `useState` + `useEffect` qui recopie `mq.matches` : c'est
 * exactement le motif que `react-hooks/set-state-in-effect` interdit (rendu
 * initial à `false`, puis second rendu en cascade). `matchMedia` EST un store
 * externe — il a un abonnement et un instantané synchrone, donc le hook prévu
 * pour ça le lit sans frame intermédiaire.
 */
const REQUETE_MOUVEMENT_REDUIT = "(prefers-reduced-motion: reduce)";

function sAbonnerMouvementReduit(auChangement: () => void): () => void {
  const mq = window.matchMedia(REQUETE_MOUVEMENT_REDUIT);
  mq.addEventListener("change", auChangement);
  return () => mq.removeEventListener("change", auChangement);
}

const lireMouvementReduit = () => window.matchMedia(REQUETE_MOUVEMENT_REDUIT).matches;
// Instantané SSR : `matchMedia` n'existe pas côté serveur, et « pas de
// préférence connue » se joue sans réduction, comme le rendu initial d'avant.
const lireMouvementReduitServeur = () => false;

/** `prefers-reduced-motion`, réactif aux changements — pattern `useSyncExternalStore`
 * requis pour une API navigateur qui s'abonne (voir AGENTS.md). Partagé entre
 * tout composant qui anime : ne pas réimplémenter une seconde vérification. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(sAbonnerMouvementReduit, lireMouvementReduit, lireMouvementReduitServeur);
}
