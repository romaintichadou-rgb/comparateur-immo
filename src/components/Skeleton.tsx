/**
 * Barre de chargement (shimmer) affichée à la place d'une valeur en cours de
 * recalcul en arrière-plan. Le recalcul (loyer, charges, Analyse IA après une
 * modification du prix/des travaux ou de la description) n'étant plus bloquant,
 * on garde l'utilisateur sur la page et on remplace UNIQUEMENT les données qui
 * se rafraîchissent — le reste (budget, prix/m²) reste lisible et interactif.
 *
 * Dimensionner via `className` (ex. `h-8 w-24`). L'effet "shimmer" (reflet clair
 * qui balaie la barre, défini dans globals.css) lit mieux qu'un fondu d'opacité
 * pour signaler un chargement EN COURS.
 */
export default function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      className={`skeleton-shimmer inline-block rounded align-middle ${className}`}
      aria-hidden="true"
    />
  );
}
