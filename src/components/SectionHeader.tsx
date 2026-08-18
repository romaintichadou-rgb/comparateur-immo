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
 * | Onglet  | Titre d'un onglet de la fiche bien     | `text-[22px]` 400 (`TabHeader`) |
 * | H2      | Titre d'une carte de section           | `text-lg`  ← ici      |
 * | H3      | Groupe / sous-section                  | `text-lg` 400 (`GroupTitle` / `GroupHeader`) |
 *
 * Sous le H3, on QUITTE l'échelle : titres de courbes, libellés de curseurs et
 * en-têtes de colonnes passent en `LABEL_BLOC` (IBM Plex `text-sm`), jamais en
 * Fraunces rapetissé.
 *
 * Trois exceptions assumées, documentées dans AGENTS.md : le verdict de
 * l'Analyse (`text-4xl sm:text-5xl`, c'est LE chiffre de l'écran), l'en-tête
 * compact de la fiche bien (`text-xl sm:text-2xl`, un titre logé entre une
 * vignette et une mini-carte), et le titre d'une carte de recommandation
 * (`TITRE_RECOMMANDATION`, seul titre en IBM Plex Sans — voir plus bas).
 *
 * Les micro-libellés en capitales des panneaux latéraux
 * (`text-xs uppercase tracking-wide`) ne font PAS partie de cette échelle :
 * ce sont des étiquettes de données, pas des titres de contenu.
 */

/**
 * Classes du titre de carte, exportées pour les en-têtes qui ne peuvent pas
 * être un heading : une carte dépliante dont l'en-tête est un `<button>`.
 * Y recopier les classes à la main est précisément ce qui avait laissé les
 * cartes Financement et Hypothèses sur l'ancien style alors que tout le reste
 * avait bougé.
 */
export const TITRE_SECTION = "font-display text-lg font-semibold text-ink-900";

/** Idem, pour un titre de groupe (`GroupTitle`) rendu hors heading. */
export const TITRE_GROUPE = "font-display text-lg font-normal text-ink-900";

/**
 * EXCEPTION ASSUMÉE — titre d'une carte de recommandation (onglet Recommandations).
 *
 * Seul titre de l'app en **IBM Plex Sans** et non en Fraunces. La règle
 * « tous les titres en `font-display` » vaut pour des titres qui NOMMENT une
 * section ; ici la ligne est la recommandation elle-même, une phrase courte
 * portant un montant (« Négocie à 240 000 € »). Fraunces y traitait les
 * chiffres en caractères de titrage, ce qui donnait à une donnée un air de
 * titre de magazine au milieu d'un écran de chiffres.
 *
 * `text-xl` et non `text-lg` : la carte n'a plus que deux lignes depuis qu'on
 * l'a vidée de ses chiffres, le titre doit porter seul le poids de la carte.
 * Il redescend d'un cran sous `sm` — à 375 px, le tag de droite et le chevron
 * ne laissent qu'environ 180 px au titre, qui partait sur trois lignes.
 *
 * ⚠️ Ne PAS la basculer en Fraunces « pour rentrer dans le barème » : c'est un
 * choix, pas un oubli. Ne pas l'employer non plus ailleurs — un titre qui nomme
 * une section reste en `SectionHeader` / `GroupTitle`.
 */
export const TITRE_RECOMMANDATION = "font-sans text-sm font-semibold text-ink-900 sm:text-base";

/**
 * Étiquette d'un bloc SOUS le niveau groupe : titre de courbe, libellé de
 * curseur, en-tête de colonne. L'échelle Fraunces s'arrête à `GroupTitle`
 * (`text-base`) — plus bas, on quitte les titres pour des étiquettes en
 * IBM Plex. Un `font-display text-sm` n'existe nulle part dans l'échelle :
 * c'est ce qu'affichaient les titres de courbes du Playground, seul endroit
 * de l'app où Fraunces descendait sous 16 px.
 */
export const LABEL_BLOC = "text-sm font-medium text-ink-700";

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
  return <Tag className={`${TITRE_SECTION} ${className}`}>{title}</Tag>;
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
  return <Tag className={`${TITRE_SECTION} ${className}`}>{children}</Tag>;
}

/**
 * En-tête d'un ONGLET de la fiche bien : titre + sous-titre, action à droite.
 *
 * Les cinq onglets s'ouvraient directement sur leur contenu — une grille de
 * cartes ou un verdict — sans jamais nommer ce qu'on regardait ni dire à quoi
 * ça sert. Le seul repère était l'onglet actif dans la barre, un `text-sm` de
 * 14 px qui défile hors champ sur mobile.
 *
 * ── Pourquoi un niveau à part, entre le H1 et les cartes ──────────────────
 * Il lui faut être plus gros qu'un titre de carte (`text-lg`), sinon il ne
 * domine pas les cartes qu'il coiffe, et plus petit que le titre de la fiche
 * (`text-xl sm:text-2xl`), qui reste le nom du bien. `text-xl` fixe est le seul
 * cran disponible entre les deux — d'où un palier de plus dans l'échelle,
 * assumé, plutôt qu'un `text-lg` qui aurait fait doublon avec `SectionHeader`
 * dès la première carte du panneau.
 *
 * ── `h2`, et les cartes en dessous restent des `h2` ───────────────────────
 * Aucun niveau n'est sauté (le `h1` est celui de la fiche), donc la hiérarchie
 * reste valide au sens WCAG : les cartes deviennent des SŒURS du titre
 * d'onglet au lieu de ses filles. Le resserrement exact demanderait `as="h3"`
 * sur chaque `SectionHeader` des cinq onglets — à faire d'un bloc si on le
 * fait, jamais onglet par onglet, sous peine de laisser deux conventions.
 */
export function TabHeader({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  /** Une phrase : ce que l'onglet montre, ou son état actuel. */
  subtitle: string;
  /** Action de l'onglet, alignée à droite (« Modifier », « Enregistrer »…). */
  children?: ReactNode;
  className?: string;
}) {
  return (
    // `flex-wrap` + `gap-y` obligatoires : sans eux l'action passe PAR-DESSUS
    // le sous-titre dès que la colonne se resserre (cf. AGENTS.md, « les quatre
    // pièges du mobile », cas n°1 — constaté sur la carte verdict).
    <div className={`mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="font-display text-[22px] font-normal text-ink-900">{title}</h2>
        <p className="mt-1 text-sm text-ink-500">{subtitle}</p>
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
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
  return <Tag className={`${TITRE_GROUPE} ${className}`}>{children}</Tag>;
}

/**
 * En-tête d'un GROUPE de contenu : titre + sous-titre, compteur ou contrôle
 * à droite. Même structure que `TabHeader`, un cran plus bas dans l'échelle.
 *
 * ── Pourquoi un composant, et pas trois blocs écrits à la main ────────────
 * L'onglet Optimiser portait QUATRE styles pour ce seul rôle : deux variantes
 * de `text-[11px] uppercase tracking-wider` (« Les faits », les KPIs du
 * Playground), un `font-display text-sm` hors échelle (titres de courbes), et
 * deux blocs sans titre du tout (simulateur, courbes). Les sous-titres
 * divergeaient d'autant : `text-xs`, `text-[10px]`, `text-sm`. Le choix de
 * style était refait à chaque bloc, donc perdu à chaque bloc.
 *
 * Le sous-titre reprend EXACTEMENT le token de `TabHeader`
 * (`text-sm text-ink-500`) : c'est ce qui fait lire le titre d'onglet et le
 * titre de groupe comme deux crans d'une même échelle, et non comme deux
 * conventions voisines.
 */
export function GroupHeader({
  title,
  subtitle,
  count,
  children,
  as: Tag = "h3",
  className = "",
}: {
  title: string;
  /** Une phrase : ce que le groupe montre, ou les hypothèses qu'il applique. */
  subtitle?: string;
  /** Nombre d'items du groupe, en discret à côté du titre. */
  count?: number;
  /** Contrôle du groupe, aligné à droite (bascule, bouton…). */
  children?: ReactNode;
  as?: "h3" | "h4";
  className?: string;
}) {
  return (
    // `flex-wrap` + `gap-y` obligatoires, même piège que `TabHeader` : sans
    // eux le contrôle de droite passe PAR-DESSUS le sous-titre dès que la
    // colonne se resserre (AGENTS.md, « les quatre pièges du mobile », n°1).
    <div className={`mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2 ${className}`}>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <Tag className={TITRE_GROUPE}>{title}</Tag>
          {count != null && <span className="text-xs tabular-nums text-ink-400">{count}</span>}
        </div>
        {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}
