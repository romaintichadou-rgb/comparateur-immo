"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/components/charts/useReducedMotion";

/**
 * Déclenche l'animation d'entrée d'un graphique au moment où il ENTRE dans le
 * viewport, pas au montage du composant.
 *
 * ⚠️ Pourquoi ce n'est pas un détail : la fiche bien est longue (verdict, KPI,
 * cinq blocs d'analyse, tableaux). Un graphique animé au montage a fini de
 * jouer bien avant que le lecteur n'arrive dessus — il découvre un graphique
 * déjà figé, et l'animation ne lui a rien montré. Pire, tout s'anime en même
 * temps hors écran, ce qui coûte des frames au premier rendu sans qu'aucune
 * ne soit vue.
 *
 * Une seule bascule, jamais de retour en arrière : on n'observe plus dès que
 * l'élément est apparu. Un graphique qui rejouerait son entrée à chaque
 * passage de scroll serait une nuisance, pas un effet.
 *
 * ⚠️ **BUG RÉEL corrigé (2026-08-20) : incohérence d'hydratation, pas un
 * problème de timing.** L'état initial était calculé via
 * `typeof IntersectionObserver === "undefined"`, VRAI aussi bien pour « vieux
 * navigateur sans support » que pour le **rendu serveur** (Node n'a pas cette
 * classe). Le HTML généré côté serveur affichait donc directement l'état
 * FINAL (rempli), pendant que le premier rendu client calculait `false` (pas
 * encore entré) — un vrai écart. React logue alors : *"A tree hydrated but
 * some attributes... didn't match... **This won't be patched up**."* Le DOM
 * reste bloqué sur la valeur du SERVEUR pour toujours ; aucun `rAF`, aussi
 * costaud soit-il, ne peut réparer un attribut que React a explicitement
 * choisi de ne jamais corriger après coup.
 *
 * Le fix : l'état initial de `inView` est **TOUJOURS `false`**, identique
 * sur le serveur et au premier rendu client — donc jamais d'écart possible.
 * Tout repli (pas d'`IntersectionObserver`, `prefers-reduced-motion`) est
 * appliqué APRÈS coup, uniquement côté client :
 * - « pas d'`IntersectionObserver` » ne peut être vérifié que dans l'effet
 *   (qui ne tourne jamais côté serveur, donc sans risque d'incohérence) —
 *   passé par un `requestAnimationFrame` pour rester hors du flux synchrone
 *   de l'effet (`react-hooks/set-state-in-effect`).
 * - `prefers-reduced-motion` passe par `useReducedMotion` (`useSyncExternalStore`,
 *   conçu précisément pour qu'une valeur qui diffère du serveur se
 *   resynchronise sans avertissement d'hydratation) et se combine à la
 *   lecture, jamais dans le même state que `inView`.
 */
export function useInView<T extends Element>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  // TOUJOURS `false` au départ, serveur ET client — voir le bug ci-dessus.
  const [inView, setInView] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      // N'est exécuté qu'au client (les effets ne tournent jamais en SSR) —
      // aucun risque d'incohérence d'hydratation à ce stade.
      requestAnimationFrame(() => setInView(true));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            // Un élément déjà visible au montage (au-dessus de la ligne de
            // flottaison, ou scroll restauré par le navigateur au reload)
            // intersecte quasi instantanément — parfois avant que l'état
            // initial (`scaleY(0)`/largeur 0 %) n'ait même été PEINT une
            // seule fois. Le double rAF assure qu'une frame a réellement été
            // peinte AVANT de déclencher le changement d'état.
            requestAnimationFrame(() => {
              requestAnimationFrame(() => setInView(true));
            });
            observer.disconnect();
          }
        }
      },
      // `rootMargin` négatif en bas : l'animation part quand le graphique est
      // franchement entré, pas dès que son premier pixel effleure le bas de
      // l'écran — sinon elle se joue encore sous la ligne de flottaison.
      { threshold: 0.2, rootMargin: "0px 0px -10% 0px", ...options },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [options]);

  return { ref, inView: inView || reducedMotion };
}
