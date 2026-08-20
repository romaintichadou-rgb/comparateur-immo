import type { ReactNode } from "react";
import { InfoTooltip } from "@/components/InfoTooltip";

/**
 * ÉCHELLE TYPOGRAPHIQUE DES TITRES — source unique.
 *
 * Tous les titres de l'app sont en `font-display` (Fraunces), `font-weight: 500`,
 * `text-ink-900`. La taille ET la variation optique (`opsz`) distinguent les
 * niveaux — source de vérité dans globals.css et AGENTS.md :
 *
 * | Niveau  | Rôle                                   | Classe       | opsz |
 * |---------|----------------------------------------|--------------|------|
 * | Hero    | Écran plein : vide, erreur, upgrade    | `.heading-hero` | 36 |
 * | H1      | Titre de page                          | `.heading-h1`   | 36 |
 * | H2      | Titre d'un onglet de la fiche bien     | `.heading-h2` (22px) | 24 |
 * | H3      | Titre d'une carte de section           | `.heading-h3` (18px) | 20 |
 * | H4      | Groupe / sous-section                  | `.heading-h4` (16px) | 18 |
 *
 * La variation optique (`font-variation-settings: 'opsz'`) ajuste la typométrie
 * de Fraunces selon le contexte : opsz 36 (typage ouvert) pour gros titres,
 * opsz 18 (compacte) pour petits titres.
 *
 * Sous le H4, on QUITTE l'échelle : titres de courbes, libellés de curseurs et
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
 *
 * ⚠️ Tous les titres de cartes (de section) sont maintenant en IBM Plex Sans
 * au lieu de Fraunces, avec taille text-sm / text-base (14-16px). Voir
 * AGENTS.md, « Charte graphique — Titres de cartes » pour la justification.
 *
 * Source de vérité : cette constante (IBM Plex Sans, 14-16px, font-semibold).
 */
export const TITRE_SECTION = "font-sans text-sm font-semibold text-ink-900 sm:text-base";

/** Idem, pour un titre de groupe (`GroupTitle`) rendu hors heading.
 *
 * ⚠️ Les groupes sont aussi en IBM Plex Sans. Même taille que TITRE_SECTION :
 * pas de distinction visuelle, mais sémantiquement un groupe (H4) vs une section (H3).
 *
 * Source de vérité : cette constante (IBM Plex Sans, 14-16px, font-semibold).
 */
export const TITRE_GROUPE = "font-sans text-sm font-semibold text-ink-900 sm:text-base";

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
 * Titre H2 : sous-sections dans les onglets (ex: "Analyse par dimension", "Vue d'ensemble").
 *
 * ⚠️ À distinguer de H3 (cartes IBM Plex) et H4 (groupes IBM Plex).
 * H2 est Fraunces 22px (20px mobile), un cran entre H1 onglet (24-28px) et H3 cartes (14-16px).
 *
 * Source de vérité : `.heading-h2-subsection` dans globals.css (20px / 22px, opsz 24).
 */
export const TITRE_H2 = "heading-h2-subsection";

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
 * Titre d'une carte de section — classe `.heading-h3` (18px, opsz 20).
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
 * hiérarchie cassée (WCAG `heading-hierarchy`). Le rendu visuel est celui d'un
 * H3 de l'échelle (18px), mais la balise reste `h2` sémantiquement.
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
 * Sous-section H2 dans un onglet — Fraunces 22px, un cran entre H1 onglet (24-28px)
 * et H3 cartes (14-16px).
 *
 * Exemples : "Vue d'ensemble", "Financement du projet", "Analyse par dimension".
 *
 * ⚠️ À ne pas confondre avec `SectionHeader` (H2 sémantique mais IBM Plex 14-16px visuellement
 * pour les cartes).
 */
export function SectionH2({
  title,
  info,
  className = "",
}: {
  title: string;
  /** Détail déplacé dans une icône ⓘ à côté du titre, plutôt qu'un paragraphe
   * sous le titre — voir `InfoTooltip`. */
  info?: string;
  className?: string;
}) {
  return (
    <h2 className={`flex items-center gap-1.5 ${TITRE_H2} ${className}`}>
      {title}
      {info && <InfoTooltip text={info} />}
    </h2>
  );
}

/**
 * En-tête d'un ONGLET de la fiche bien : titre + sous-titre, action à droite.
 *
 * Les cinq onglets s'ouvraient directement sur leur contenu — une grille de
 * cartes ou un verdict — sans jamais nommer ce qu'on regardait ni dire à quoi
 * ça sert. Le seul repère était l'onglet actif dans la barre, un `text-sm` de
 * 14 px qui défile hors champ sur mobile.
 *
 * ── H1 pour la hiérarchie de chaque onglet ────────────────────────────────
 * Le titre du bien dans l'en-tête n'est PAS un H1 sémantique (c'est un div en
 * IBM Plex) : chaque onglet doit donc avoir un H1 propre comme titre principal.
 * Les cartes de section à l'intérieur passent à `h3`, et les groupes à `h4`,
 * maintenant une hiérarchie valide sans sauter de niveau.
 *
 * La taille visuelle reste `heading-h2` (24px) : plus gros qu'un titre de carte,
 * mais cohérent avec le visuel habituel d'un onglet.
 * ⚠️ IMPORTANT : tout appel à `SectionHeader` dans un onglet DOIT passer `as="h3"`
 * pour maintenir la hiérarchie H1 → H3 → H4.
 */
export function TabHeader({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  /** Une phrase : ce que l'onglet montre, ou son état actuel. */
  subtitle?: string;
  /** Action de l'onglet, alignée à droite (« Modifier », « Enregistrer »…). */
  children?: ReactNode;
  className?: string;
}) {
  return (
    // `flex-wrap` + `gap-y` obligatoires : sans eux l'action passe PAR-DESSUS
    // le sous-titre dès que la colonne se resserre (cf. AGENTS.md, « les quatre
    // pièges du mobile », cas n°1 — constaté sur la carte verdict).
    <div className={`mb-8 flex flex-wrap items-start justify-between gap-x-4 gap-y-3 ${className}`}>
      <div className="min-w-0">
        <h1 className="heading-h2">{title}</h1>
        {subtitle && <p className="mt-3 text-sm text-ink-500">{subtitle}</p>}
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
  as?: "h2" | "h3" | "h4";
  className?: string;
}) {
  // H2 = sous-sections (Fraunces 22px), H3/H4 = groupes (IBM Plex 14-16px)
  const titleClass = Tag === "h2" ? TITRE_H2 : TITRE_GROUPE;

  return (
    // `flex-wrap` + `gap-y` obligatoires, même piège que `TabHeader` : sans
    // eux le contrôle de droite passe PAR-DESSUS le sous-titre dès que la
    // colonne se resserre (AGENTS.md, « les quatre pièges du mobile », n°1).
    <div className={`mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-2 ${className}`}>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <Tag className={titleClass}>{title}</Tag>
          {count != null && <span className="text-xs tabular-nums text-ink-400">{count}</span>}
        </div>
        {subtitle && <p className="mt-2 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}
