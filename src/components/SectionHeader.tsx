import type { ReactNode } from "react";

/**
 * ÉCHELLE TYPOGRAPHIQUE DES TITRES — source unique.
 *
 * Tous les titres de l'app sont en `font-display` (Fraunces), `font-semibold`,
 * `text-ink-900`. Seule la TAILLE distingue les niveaux :
 *
 * | Niveau  | Rôle                                   | Classe                |
 * |---------|----------------------------------------|-----------------------|
 * | Hero    | Écran plein : vide, erreur, upgrade    | `text-3xl sm:text-4xl`|
 * | H1      | Titre de page                          | `text-2xl sm:text-3xl`|
 * | H2      | Titre d'une carte de section           | `text-lg`  ← ici      |
 * | H3      | Groupe à l'intérieur d'une carte       | `text-base`           |
 *
 * Deux exceptions assumées, documentées dans AGENTS.md : le verdict de
 * l'Analyse (`text-4xl sm:text-5xl`, c'est LE chiffre de l'écran) et l'en-tête
 * compact de la fiche bien (`text-xl sm:text-2xl`, un titre logé entre une
 * vignette et une mini-carte).
 *
 * Les micro-libellés en capitales des panneaux latéraux
 * (`text-xs uppercase tracking-wide`) ne font PAS partie de cette échelle :
 * ce sont des étiquettes de données, pas des titres de contenu.
 */

/**
 * Titre d'une carte de section.
 *
 * ── Pourquoi plus d'icône ────────────────────────────────────────────────
 * Le composant posait une pastille `accent-50` avec une icône Lucide devant
 * un libellé en capitales `ink-500`. Deux effets : chaque carte réclamait le
 * choix d'une icône — souvent décorative, jamais porteuse d'information — et
 * le titre lui-même restait un petit label gris, en concurrence avec les
 * étiquettes de champs plutôt qu'au-dessus d'elles.
 *
 * ── Pourquoi `h2` par défaut et non `h3` ─────────────────────────────────
 * Le niveau SÉMANTIQUE et la taille VISUELLE sont deux choses distinctes. Une
 * carte de section vit directement sous le `h1` de la page : la nommer `h3`
 * sauterait un niveau, ce que les lecteurs d'écran signalent comme une
 * hiérarchie cassée (WCAG `heading-hierarchy`). Le rendu est bien celui d'un
 * titre de troisième rang — Fraunces, `text-lg` — mais la balise reste `h2`.
 * Passer `as="h3"` quand la carte est elle-même imbriquée sous un `h2`.
 */
export function SectionHeader({
  title,
  as: Tag = "h2",
  className = "",
}: {
  title: string;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <Tag className={`font-display text-lg font-semibold text-ink-900 ${className}`}>
      {title}
    </Tag>
  );
}

/**
 * Variante à enfants du même titre — quand le libellé n'est pas une chaîne
 * simple. Rendu STRICTEMENT identique à `SectionHeader` : les deux ne
 * diffèrent que par la façon de passer le contenu, jamais par le style.
 * Ne pas les faire diverger — c'était déjà deux composants pour un seul
 * niveau, l'un avec icône et l'autre sans.
 */
export function SectionTitle({
  children,
  as: Tag = "h2",
  className = "",
}: {
  children: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <Tag className={`font-display text-lg font-semibold text-ink-900 ${className}`}>
      {children}
    </Tag>
  );
}

/**
 * Titre de GROUPE à l'intérieur d'une carte — un cran sous `SectionHeader`.
 * Ex. « Fiscalité » et « Projection » dans la carte Hypothèses.
 */
export function GroupTitle({
  children,
  as: Tag = "h3",
  className = "",
}: {
  children: ReactNode;
  as?: "h3" | "h4" | "legend";
  className?: string;
}) {
  return (
    <Tag className={`font-display text-base font-semibold text-ink-900 ${className}`}>
      {children}
    </Tag>
  );
}
