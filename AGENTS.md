<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Règle impérative — documentation à jour

**Chaque changement de code doit impérativement mettre à jour `AGENTS.md` et
tout fichier `.md` concerné** (README.md, `docs/reference/*.md`, etc.) pour que
la documentation reste toujours synchronisée avec le code. Aucun merge ne doit
créer de conflit entre le code et sa documentation. Cela inclut :
ajout/suppression de composants, modification de conventions UI, changement
de labels/scores, nouvelles fonctions utilitaires, nouvelles colonnes DB, etc.

**Où écrire la règle** : voir « AGENTS.md doit rester compact » ci-dessous —
un ajout de domaine (loyer, monétisation, simulation financière, etc.) va dans
le `docs/reference/*.md` correspondant, pas ici.

# AGENTS.md doit rester compact

- **Cible : rester sous ~800 lignes.** Un ajout qui dépasserait ce budget va
  dans `docs/reference/<domaine>.md` — AGENTS.md ne garde qu'un pointeur
  d'une ligne vers ce fichier (voir la table « Documentation de référence par
  domaine » plus bas).
- N'entre ici qu'une règle **transverse** à plusieurs fichiers/domaines
  (charte graphique, sécurité, formatage partagé) ou un piège déjà rencontré
  **au moins deux fois**. Un piège rencontré une seule fois, propre à un
  fichier ou un domaine, va dans le `docs/reference/*.md` du domaine — ou en
  commentaire dans le fichier lui-même s'il n'existe pas encore de doc pour ce
  domaine.
- **Ne pas documenter ce que git ou le code montrent déjà** : checklists de
  lots terminés, statuts "✅ Complet", décomptes de mesures ponctuelles
  ("mesuré sur 22 appels"). Documenter la RÈGLE qui en résulte, pas le récit
  du chantier qui y a mené — le "pourquoi" ne mérite une place que s'il évite
  une régression future (quelqu'un qui "corrige" une bizarrerie volontaire en
  la relisant au premier degré).
- **Croissance nette zéro par défaut** : à chaque ajout dans AGENTS.md,
  vérifier si un passage voisin est devenu obsolète (règle remplacée, chantier
  clos, doublon avec un `docs/reference/*.md`) et le retirer. Le fichier ne
  grossit pas par défaut, il se réécrit.
- Avant d'ajouter une section, vérifier si un `docs/reference/*.md` existant
  convient déjà plutôt que d'écrire dans AGENTS.md.

# Vérifier la charte AVANT de coder

**Pour tout changement UI** : lire `AGENTS.md` — section "Charte graphique" et
les patterns concernés (boutons, bannières, couleurs, typographie, etc.) —
AVANT d'écrire le code. Ne pas supposer que les pratiques générales
s'appliquent ici. Par exemple :
- Pas d'icônes dans les boutons CTA (même si c'est courant ailleurs)
- Couleurs tonales spécifiques pour les états (émeraude/ambre/rouge, jamais slate/indigo)
- Tailles et paddings standards documentés pour chaque type de composant

Ce document est le **guide d'implémentation unique** — le respecter prévient les
allers-retours et les corrections après coup.

# Documentation de référence par domaine

Ces fichiers portent le détail (formules, mesures, historique des décisions)
qui n'a pas sa place dans ce document — les lire quand la tâche touche
réellement leur domaine, pas systématiquement.

| Domaine | Fichier | À lire quand la tâche touche… |
|---|---|---|
| Multi-utilisateurs, monétisation, Stripe, auth | `docs/reference/monetisation-auth.md` | plans/quotas, `/compte`, webhook Stripe, `lib/auth.ts`, RLS, écrans de connexion |
| Estimation loyer/charges (IA + déterministe) | `docs/reference/estimation-loyer-charges.md` | `rentEstimation.ts`, `chargesEstimation.ts`, `anilReference.ts`, `encadrementLoyers.ts`, `/api/estimate-*` |
| Taxe foncière + quote-part terrain | `docs/reference/taxe-fonciere.md` | `taxeFonciereCommune.ts`, `taxeFonciereData.ts`, `quote_part_terrain_pct` |
| Couleurs sémantiques & scoring (tables tonalité complètes) | `docs/reference/couleurs-scoring.md` | tout chiffre coloré par un seuil, `scoring.ts`, bloc Risques/DPE |
| Profil investisseur, simulation financière, héritage | `docs/reference/simulation-financiere.md` | `SimulationFinanciere.tsx`, `SettingsForm.tsx`, `simulation.ts`, `resolveInputs` |
| Onglet Analyse, sous-pill Recommandations (OptimiserView), moteur de recommandations, collecte des sources | `docs/reference/analyse-optimiser.md` | `AnalyseIA.tsx`, `OptimiserView.tsx`, `analyse/decision.ts`, `analyse/recommandations.ts`, `analyse/run.ts`, `analyse/sources/*`, `narration.ts`, `geocoding.ts` |
| Page appartement (en-tête, onglets, ajout de bien) | `docs/reference/page-appartement-ui.md` | `ApartmentDetail.tsx` (en-tête/onglets/Description), `AddApartmentFlow.tsx` |
| Bookmarklet (pipeline d'extraction par plateforme) | `docs/reference/bookmarklet.md` | `src/lib/bookmarklet.ts`, `src/lib/parsers/common.ts` |

Plans produit : `docs/plan-authentification.md`, `docs/UX-monetisation.md`,
`docs/setup-stripe.md`, `docs/spec-arguments-leviers.md`,
`docs/plan-optimisation-loyer.md`.

# Charte graphique — identité "Immoscore"

Toute évolution UI doit respecter cette charte. Ne pas réintroduire les
couleurs Tailwind par défaut (`slate-*`, `indigo-*`, `gray-*`) ni d'icônes
dans les boutons CTA.

- **Nom de l'app** : importer `APP_NAME` depuis `src/lib/constants.ts`,
  jamais de chaîne `"Immoscore"` codée en dur dans un nouveau composant.
- **Couleurs** (définies dans `src/app/globals.css`, `@theme inline`) :
  - `ink-50` → `ink-900` : neutre teinté violet (fond, texte, bordures),
    remplace `slate-*`. Fond de page par défaut : `ink-50` (#efecf6,
    "Bruyère").
  - `accent-50` → `accent-900` : violet d'encre, seul accent de marque,
    remplace `indigo-*`. Base `accent-600` (#3d3580).
  - `signal-50/100/300/500/600/700` : argile, **définie mais non utilisée
    actuellement dans l'UI**. Ne pas l'assigner aux actions destructives ni
    à autre chose sans validation explicite.
  - Destructif (supprimer, etc.) : `red-*` Tailwind standard (`bg-red-600`
    / hover `red-700` pour un bouton plein, `text-red-600` pour une action
    inline). C'est une dérogation volontaire à la règle "pas de Tailwind par
    défaut" ci-dessus : le rouge se lit universellement comme danger et
    recoupe la couleur déjà utilisée pour les alertes de score — `signal-*`
    ne doit **pas** remplacer ce rouge.
  - Les couleurs sémantiques (`emerald-*`/`amber-*`/`red-*` pour la qualité
    d'un score ou d'un statut) restent séparées de l'accent de marque — ne
    pas les migrer vers `accent-*`. Tables complètes :
    `docs/reference/couleurs-scoring.md`.
- **Typographie** (`next/font/google` dans `src/app/layout.tsx`) :
  - `font-display` (Fraunces) : **tous** les titres (H1 à H3), jamais le corps
    de texte. Voir « Échelle typographique des titres ».
  - `font-sans` (IBM Plex Sans) : corps de texte, valeur par défaut.
  - `font-mono` (Geist Mono) : tout chiffre clé — score, prix, rendement,
    cash-flow. Ne pas revenir à IBM Plex Mono.
  - `font-wordmark` (Outfit) : réservé au wordmark « Immoscore » de la
    navbar, nulle part ailleurs.
- **Logo** : `AppMark` exporté depuis `src/components/Navbar.tsx` (motif
  anneau ouvert + point). Réutiliser ce composant plutôt que redessiner une
  variante. Il n'est PAS affiché dans la navbar (wordmark seul) — la navbar
  signe la marque en mettant « score » en `accent-600`.
- **Boutons** : Primaire (`bg-accent-600` plein, hover `accent-700`),
  Secondaire (contour `ink-300`, hover `bg-ink-50`), Tertiaire (lien
  souligné, sans fond), Destructif (`red-*`), Désactivé (opacité réduite).
  **Aucune icône à l'intérieur d'un CTA** — texte seul. Exception : les
  affordances icône-seule compactes (ex. bouton "supprimer" en corbeille sur
  une ligne de tableau/carte) ne sont pas des CTA au sens de cette règle.
  Taille standard pour tout CTA principal/secondaire de page :
  `rounded-lg px-5 py-2.5 text-sm font-medium`. Les actions inline compactes
  (sauvegarde contextuelle dans une bannière, actions de ligne de tableau)
  peuvent rester plus petites (`px-3 py-1.5 text-xs`), de même que le CTA de
  la navbar (contrainte de hauteur du header) — mais tous les CTA de page
  pleine largeur ou en pied de formulaire doivent utiliser la taille
  standard. Les boutons en pied de formulaire full-width (`SettingsForm.tsx`)
  utilisent `w-full py-3`, sans `px`.
- **Fonds décoratifs** (hero, bannières) : dégradé subtil en `accent-50` /
  `white`, jamais de bleu/indigo Tailwind par défaut. Un filigrane du logo
  (`AppMark`) en très faible opacité peut servir de motif de fond — toujours
  via `opacity-*` sur le SVG entier (pas un modificateur `text-color/opacity`,
  car le point signal du logo a une couleur `fill` fixe qui ignorerait sinon
  l'opacité). Voir l'étape "Coller l'URL" dans `AddApartmentFlow.tsx`. Autre
  motif : `.bg-tech-grid` (`globals.css`) — réservé aux écrans vides/hero,
  jamais sur une zone de lecture dense ; à poser sur un calque `absolute`
  isolé (elle s'applique à tout l'élément, donc ses enfants).
- **Cartes** (blocs `border border-ink-200 bg-white rounded-xl/lg`) : pas de
  `shadow-sm` — le bordé seul suffit à détacher le bloc du fond `ink-50`.
  L'ombre reste réservée aux éléments réellement flottants au-dessus du
  contenu (modales, tooltips, badges superposés à la carte Leaflet).
- **Confirmation destructive** : passer par `ConfirmDialog.tsx` (modale
  générique, focus initial sur "Annuler") plutôt que `window.confirm()`.
  Pour un flux de suppression, réutiliser `useDeleteApartment.tsx`
  (mutualisé entre `ApartmentsTable`, `ApartmentsCardList`,
  `ApartmentDetail`) plutôt que ré-écrire l'appel DELETE à chaque écran.
- **Navbar** (`Navbar.tsx`) : sticky (`sticky top-0 z-40`) avec un liseré
  dégradé `accent-600 → accent-400 → accent-600` de 3px en tout haut. Lien
  actif signalé par une couleur (`text-accent-700`) + un soulignement
  (`bg-accent-600`), jamais par un fond plein. Le hover des liens inactifs
  reprend la couleur de l'état actif en plus léger (`hover:bg-accent-50
  hover:text-accent-700`).
  - **Disposition** : wordmark puis `NAV_LINKS` **à gauche**, collés l'un à
    l'autre ; `ml-auto` sur le groupe de droite pousse le `UserMenu` à
    l'autre bout. Conteneur en **pleine largeur** (voir « Largeur de page »)
    : pas de `mx-auto max-w-*`.
  - **`NAV_LINKS`** : « Mes biens » (`/`) et « Profil investisseur »
    (`/parametres`). Chaque entrée porte un prédicat **`match(pathname)`**,
    pas une égalité stricte sur `href` : « Mes biens » doit rester actif sur
    `/appartements/…`.
  - **État connecté** : `UserMenu` — avatar circulaire (initiale de l'email,
    fond `accent-100`, 36px) avec dropdown : en-tête email → liens de
    navigation (« Profil investisseur » en `sm:hidden`, « Mon compte ») →
    séparateur → « Déconnexion ». Dismiss : click-outside + Escape +
    auto-close au changement de route.
    ⚠️ « Mes biens » n'est **pas** repris dans le dropdown en `sm:hidden`,
    contrairement à « Profil investisseur » : le wordmark pointe déjà vers
    `/` et reste visible sur mobile.
  - **État déconnecté** : bouton « Se connecter » (`bg-accent-600`, petit
    format navbar).

# Composants partagés & conventions UI

## Inventaire des composants réutilisables (`src/components/`)

| Composant | Fichier | Rôle |
|---|---|---|
| `StatCard` | `StatCard.tsx` | Carte métrique tonale (label/valeur/sub/tone). Mode simple ou avant→après. Affordance cliquable : pointillé sous la valeur + « Calcul → » en pied de carte, **dans le flux** (`mt-auto`), jamais en `absolute` — voir « les quatre pièges du mobile ». |
| `TabHeader` | `SectionHeader.tsx` | En-tête d'un onglet de la fiche bien : titre Fraunces `text-xl` + sous-titre `text-sm ink-500`, action facultative à droite (`children`). |
| `SectionHeader` | `SectionHeader.tsx` | Titre de carte de section — Fraunces `text-lg`, **sans icône**. Props : `title`, `as` (h2/h3), `className`. **OBLIGATOIRE pour tout en-tête de carte bordée.** |
| `SectionTitle` | `SectionHeader.tsx` | Identique à `SectionHeader`, mais le libellé passe par `children` au lieu du prop `title`. Même rendu, à ne jamais faire diverger. |
| `GroupTitle` | `SectionHeader.tsx` | Titre de GROUPE dans une carte — Fraunces `text-base`, un cran sous `SectionHeader`. |
| `Skeleton` | `Skeleton.tsx` | Barre shimmer de chargement. |
| `ConfirmDialog` | `ConfirmDialog.tsx` | Modale de confirmation destructive (titre, description, bouton rouge). |
| `ErrorScreen` | `ErrorScreen.tsx` | Page d'erreur/not-found plein écran. |

Formulaires (`form/Fields.tsx`) : `TextField`, `TextAreaField`, `NumberField`,
`SelectField`, `BooleanField`, `AiEstimatedBadge`, `ManualBadge`,
`EstimatedBadge`, `ExtractedBadge`. Tous acceptent un prop `hint`.

**Badge "Détecté auto"** (`ExtractedBadge`) : doit apparaître sur **tous** les
champs pré-remplis par le bookmarklet ou le scraping serveur. Champs
couverts : `ville`, `quartier`, `adresse`, `code_postal`, `surface_m2`,
`nb_pieces`, `nb_chambres`, `etage`, `ascenseur`, `annee_construction`,
`etat_bien`, `dpe`, `ges`, `photo_url`, `description`, `prix`,
`charges_copro_annuelles`, `taxe_fonciere`, `contact_telephone`,
`contact_email`.

⚠️ **Ajouter un champ extractible = trois points à câbler**, pas un seul :
`ParsedListing`, **`applyParsedFields`** (`AddApartmentFlow.tsx` — le vrai
piège, plus grave que le badge manquant : `taxe_fonciere` était déclarée dans
`ParsedListing` mais absente de cette fonction, donc silencieusement perdue),
et le badge.

### Un champ saisissable à la création doit l'être aussi sur la fiche

Le formulaire d'ajout (`AddApartmentFlow`) et l'onglet « Description du bien »
(`ApartmentDetail`) décrivent le MÊME bien : tout champ proposé au premier
écran doit se retrouver dans le second, en lecture (`FieldRow`) **et** en
édition — c'est un quatrième point à câbler, après les trois ci-dessus.
Depuis le redécoupage en cartes, les deux modes d'un même champ sont rendus
côte à côte dans la même carte, ce qui rend l'oubli visible à la relecture
(voir `docs/reference/page-appartement-ui.md`).

Asymétries restantes, connues et assumées : `photo_url` est éditable sans
être en lecture (la vignette de l'en-tête en tient lieu), `url` et
`plateforme` sont saisis à la création puis seulement affichés dans l'en-tête.

Providers : `RendementDetailProvider`, `LoyerDetailProvider`,
`CashflowDetailProvider` — montés dans `layout.tsx`, consommés via hooks.

## Spacing

| Contexte | Valeur | Classe |
|---|---|---|
| Padding de carte section | 20px | `p-5` |
| Padding de StatCard | 16px | `p-4` |
| Gap dans une grille de cartes | 12px | `gap-3` |
| Espacement entre sections (FlatSection) | 56px | `pt-14 pb-14` |
| Espacement onglet → contenu | 24px mobile / 32px desktop | `pb-6 sm:pb-8` |
| Séparateur de section | — | `border-t border-ink-100/50` |
| Séparateur de faits | — | `divide-y divide-ink-100/50` |

## Échelle typographique des titres — source unique

**Tous** les titres de l'app sont en `font-display` (Fraunces), `font-semibold`,
`text-ink-900`. **Seule la taille distingue les niveaux.** Source de vérité :
`SectionHeader.tsx`.

| Niveau | Rôle | Classe | Composant |
|---|---|---|---|
| Hero | Écran plein : vide, erreur, upgrade | `text-3xl sm:text-4xl` | inline |
| H1 | Titre de page | `text-2xl sm:text-3xl` | inline |
| Onglet | Titre d'un onglet de la fiche bien | `text-xl` | **`TabHeader`** |
| H2 | Titre d'une carte de section | `text-lg` | **`SectionHeader`** / `SectionTitle` |
| H3 | Groupe à l'intérieur d'une carte | `text-base` | **`GroupTitle`** |

⚠️ Le niveau « Onglet » n'a **pas** de variante responsive, contrairement aux
deux du dessus — palier fixe. Sur mobile il égale le titre de la fiche.

Deux exceptions assumées : **Verdict de l'Analyse** (`text-4xl sm:text-5xl`,
c'est LE résultat de l'écran) et **en-tête compact de la fiche bien**
(`text-xl sm:text-2xl`, un cran sous un H1 de page).

Les micro-libellés en capitales des panneaux latéraux (`text-xs uppercase
tracking-wide`) ne font **pas** partie de cette échelle — pas de Fraunces.

`SectionHeader`/`SectionTitle` ne portent **plus d'icône** (chaque carte
réclamait une icône choisie arbitrairement, et le titre restait un petit
label gris sans hiérarchie visible). Balise sémantique par défaut : `h2` —
le rendu visuel de troisième rang ne détermine pas le niveau sémantique
(une carte de section vit sous le `h1` de la page). `as="h3"` seulement quand
la carte est elle-même imbriquée sous un `h2`.

## Pattern « Sections sans card »

**Description du bien**, **Simulation financière**, **Optimiser** : sections
sans bordure ni fond. Pattern : titre simple + contenu directement visible.

- **Titre** : `TabHeader` pour un onglet de la fiche bien, `SectionTitle`
  ailleurs — jamais un `<h2>` brut.
- **Pas de card** : `border-0`, `bg-transparent`, pas de `rounded-*` ni `p-5`
  autour de la section entière.
- **Bouton d'action** : « Modifier », etc., aligné à droite du titre — rôle
  des `children` de `TabHeader`.

Ne pas ajouter de card à une section pour « l'encadrer » — utiliser des
cartes **à l'intérieur** de la section (ex. `StatCard`, `FieldCard`).

## Largeur de page — choisie par ARCHÉTYPE, pas au jugé

Tout écran est un `mx-auto <max-w-*> px-4 py-8 sm:px-6`. La largeur suit le
type d'écran, pas son contenu ponctuel :

| Archétype | Classe | Écrans |
|---|---|---|
| Bandeau d'application | *aucune* (pleine largeur) | `Navbar` |
| Liste dense (tableau, carte) | `max-w-7xl` | `HomeView` |
| Détail dense (onglets, grilles de métriques) | `max-w-6xl` | `ApartmentDetail`, son `loading.tsx` |
| Formulaire **avec colonne latérale** | `max-w-4xl` | `AddApartmentFlow` |
| Hero / écran vide centré | `max-w-4xl` | `EmptyHomeState` |
| Formulaire simple, colonne unique | `max-w-2xl` | `SettingsForm`, `BookmarkletView`, `SetupNotice` |

⚠️ **La `Navbar` n'a PLUS de `max-w-*`** — un bandeau d'application s'ancre
aux bords de la fenêtre, seul son padding (`px-4 sm:px-6`) le sépare du vide.

⚠️ **`AddApartmentFlow` est en `4xl` À CAUSE de sa sidebar**
(`lg:grid-cols-[1fr_320px]`), pas parce que c'est un formulaire plus long. Ce
qui compte est la largeur de la colonne de saisie (504 px ici, 624 px dans
`SettingsForm`), pas celle du conteneur — les deux écrans ont le droit de
différer.

**Une bannière fixée suit le conteneur de SA page.** `SettingsBanner` et son
jumeau dans `ApartmentDetail` sont `fixed inset-x-0` avec un enfant
`mx-auto max-w-*` : cette largeur doit reprendre celle de la page — ne pas
copier le pattern d'une page à l'autre sans l'ajuster.

## Borders des sections

**Toutes les cartes et sections utilisent `border-ink-100`**, jamais
d'autres teintes.

## Border radius

| Contexte | Classe |
|---|---|
| Cartes de section, StatCard | `rounded-xl` |
| Boutons, inputs, éléments interactifs | `rounded-lg` |
| Badges, pills | `rounded-full` |
| Carte verdict (hero) | `rounded-2xl` |
| Petits éléments (tags, links) | `rounded-md` |

## Dividers

**Tous les dividers utilisent `ink-100` avec opacité 50%** :
- Entre sections et groupe : `border-t border-ink-100/50`
- Entre items de liste (faits, rangées de tableau) : `divide-y divide-ink-100/50`
- Sous en-têtes (tab bar, headers) : `border-b border-ink-100/50`

Jamais d'autres opacités ou couleurs pour les dividers.

## Responsive

Mobile-first (`sm:` = 640px). Conventions : tables desktop → `hidden sm:block`
+ `ApartmentsCardList` en `sm:hidden` ; tab bar en scroll horizontal
(`overflow-x-auto`) ; grilles `grid-cols-1 sm:grid-cols-2` (ou `lg:grid-cols-*`
pour les layouts larges) ; mini carte `hidden sm:block` ; zones de tap
mobile minimum 44px (`py-3 px-4` sur les onglets).

### Les quatre pièges du mobile, tous rencontrés en vrai

Une colonne de 375 px casse ce qui tenait à 1280 px — corrections de bugs
observés, pas des précautions théoriques.

1. **Une rangée d'éléments non `flex-wrap` déborde SOUS son voisin.** Toute
   rangée de métadonnées doit porter `flex-wrap` + un `gap-y-*`.
2. **Un badge en `absolute` recouvre le contenu dès qu'une carte se
   resserre.** Préférer un pied de carte en FLUX (`mt-auto flex
   justify-between`) à un badge positionné.
3. **Une espace ordinaire dans un montant le coupe en deux.**
   `formatEurosSigned` doit séparer le signe du nombre par une **espace
   insécable** (U+00A0), jamais une espace normale — corriger au FORMATEUR,
   pas par un `whitespace-nowrap` local.
4. **Valeur + boutons sur une ligne : c'est la valeur qui se casse.** La
   valeur porte `whitespace-nowrap` et le conteneur `flex-wrap` : ce sont les
   boutons qui passent à la ligne, d'un bloc.

### Scrollbar : la masquer sur une NAVIGATION, jamais sur un tableau

`.no-scrollbar` (`globals.css`) réservée aux barres de navigation qui
débordent (onglets de la fiche, sélecteur de leviers). ⚠️ Ne pas l'appliquer
à un tableau qui déborde (année par année, `ApartmentsTable`) : la scrollbar
y est la seule affordance signalant des colonnes hors champ.

### Un SVG à taille fixe vole la place du texte

Les dimensions passent par les CLASSES (`size-20 sm:size-25`), le `viewBox`
mettant le dessin à l'échelle ; `width`/`height` ne servent qu'à fixer le
ratio de repli.

## Icônes

Librairie : **Lucide React** exclusivement. Taille standard `h-3.5 w-3.5`
dans les section headers, `h-4 w-4` / `size-4` dans les onglets et les
éléments inline. **Pas d'icônes dans les boutons CTA** (texte seul).

## Constantes partagées (`src/lib/constants.ts`)

`APP_NAME`, `PIN_RED`, `PIN_RED_STROKE` — ne pas redéfinir localement.

# Multi-utilisateurs, monétisation et authentification

Statut : lots 1 à 5 faits (socle DB, auth, cloisonnement, écrans de compte,
monétisation) ; reste le lot 6 (durcissement pré-ouverture publique).

Détail complet (plans/quotas, Stripe, RLS, auth, migrations) :
**`docs/reference/monetisation-auth.md`**.

Invariants de sécurité qui s'appliquent quel que soit le fichier touché :

- **Ne jamais réintroduire la `service_role` key dans `db.ts`** — RLS +
  filtre `.eq("user_id", userId)` sont les deux barrières redondantes de
  toute requête. Seul `/api/stripe/webhook` utilise légitimement cette clé
  (aucune session utilisateur possible, appelant = Stripe).
- **`getUser()`, jamais `getSession()` de Supabase, côté serveur** —
  `getSession()` décode juste le cookie, `getUser()` le valide auprès du
  serveur Auth.
- **`proxy.ts` ne protège rien** — il rafraîchit le jeton. La vraie barrière
  est `requireSession()` dans le DAL (`db.ts`).
- **Toute route qui n'appelle pas `db.ts` doit vérifier la session à la
  main** via `getApiSession()` (ex. `/api/parse`) — elle n'hérite d'aucune
  protection sinon. Corollaire : une route qui se met à lire un bien
  (`requireApartment`) hérite du DAL et n'a plus besoin du contrôle manuel —
  le garder n'est pas faux, mais fait croire à deux barrières distinctes.
- **`redirectionQuota()` et `destination()` n'acceptent que des chemins
  internes** (`/…`, jamais `//…` ni une URL absolue) — sinon redirection
  ouverte.

# Précision de localisation : trois niveaux, pas deux

`precision_localisation` (`PRECISIONS_LOCALISATION`, `src/lib/types.ts`) vaut
`exacte` (le bâtiment), `rue` (le milieu de la voie) ou `arrondissement` (le
centre du quartier ou de la commune). Elle **arbitre quelles sources de
l'Analyse IA sont interrogées**, ce n'est pas une étiquette d'affichage.

- **Migration requise** : `supabase/migrations/0015_precision_rue.sql`
  (contrainte `check` élargie) — à exécuter manuellement sur CHAQUE projet
  Supabase, comme les précédentes.
- **Ne jamais tester `=== "arrondissement"`** pour dire « position
  approximative » : depuis l'ajout de `rue`, l'égalité stricte laisse passer
  les positions au milieu d'une voie. Écrire `!== "exacte"`.
- Les prédicats `coordsAuBatiment()` / `coordsDansLeSecteur()`
  (`src/lib/analyse/perimetre.ts`) sont la SEULE façon d'en dériver une
  décision — détail et tableau des consommateurs dans
  `docs/reference/analyse-optimiser.md`.

# Modélisation "Immeuble" (bien de rapport multi-lots)

Tout le modèle (`Apartment`, estimations, calculs, Analyse IA) suppose par
défaut **un seul logement**. Le type de bien `"Immeuble"` (voir `TYPES_BIEN`
dans `src/lib/types.ts`) est la seule exception. Ne jamais tester
`apt.type_bien === "Immeuble"` directement : utiliser le prédicat centralisé
**`isImmeuble(typeBien)`** (`src/lib/types.ts`, insensible à la casse/espaces).

- **Migration requise** : `supabase/migrations/0003_nb_lots.sql` (colonne
  `nb_lots`) — à exécuter manuellement sur CHAQUE projet Supabase.
- **`nb_lots`** (`Apartment.nb_lots`, nullable) : nombre de logements,
  `null` pour un logement unique. Non renseigné → utiliser
  **`lotsEffectifs(nb_lots, surface_m2)`** (`src/lib/estimates.ts`), pas
  deviner ailleurs (~1 logement / 55 m², plancher 2).
- **Loyer (`loyer_retenu`)** : pour un Immeuble, c'est le loyer mensuel
  **TOTAL de tous les lots**. L'estimation IA utilise `buildImmeublePrompt`
  (raisonnement lot par lot puis somme) — ne JAMAIS repasser sur le prompt
  "logement unique", le total serait sous-estimé d'un facteur `nb_lots`.
- **Charges annuelles** : pas de copropriété (on possède tout le bâtiment) —
  `estimateChargesCopro(surfaceM2, immeuble)` utilise un barème et un
  libellé différents ("Charges d'exploitation annuelles", ~13 €/m²/an,
  plancher 1500 €). Le libellé UI doit suivre `isImmeuble()`.
- **Assurance PNO** : par lot avec économies d'échelle (−5 % par lot au-delà
  de 2, plafonné à −30 %) — vs 2.5 €/m² appartement / 3.0 €/m² maison.
- **Analyse IA — bloc Prix** : seule source DVF disponible = ventes
  d'appartements au détail. Décote de 12 % intégrée avant calcul, note
  plafonnée à 8/10 (`NOTE_MAX_IMMEUBLE`) — ne pas déplafonner en pensant
  "simplifier".
- **Analyse IA — bloc Location** : loyer/m² = moyenne sur tous les lots,
  légitimement plus élevée qu'un logement unique — seuils "loyer optimiste"
  volontairement plus permissifs (`seuilMax` ×1.25, `seuilEcart` 30 % au
  lieu de 10 %).
- **Narration** : paragraphe de contexte injecté quand `isImmeuble()` pour
  que le LLM parle de "cet immeuble" et comprenne que le loyer cité est un
  total. Vérifier ce besoin pour tout nouveau bloc d'analyse.
- **Limite connue, non traitée** : la simulation financière calcule partout
  en régime **LMNP réel (meublé)** — un immeuble est souvent loué nu. Les
  montants restent corrects (ils scalent), mais le calcul n'est pas
  spécialisé par type de bien. Chantier séparé, pas un oubli à corriger en
  marge d'une autre tâche.

# Pattern CTA non-bloquant (bannière sticky)

## Estimation par champ (`estimateFieldAI`)

Chaque champ estimé (loyer, charges copro, TF, assurance) a un bouton
"Estimer avec IA" à côté de "Modifier". `estimateFieldAI(key)` gère tout :
pending state, appel API, mise à jour `apt`, bannière.

- **`estimatingFields`** (`Set<string>`) : un champ par estimation en cours.
- Les quatre champs suivent le MÊME chemin : une route dédiée
  (`/api/estimate-rent`, `/api/estimate-charges?field=…`,
  `/api/estimate-assurance`) qui écrase la valeur manuelle et bascule le champ
  dans `champs_estimes_ia`. L'assurance n'appelle aucune IA (calcul
  déterministe) mais affiche « ESTIMATION IA » comme les autres — choix UX
  volontaire.

⚠️ **Le client n'écrit JAMAIS `champs_manuels` / `champs_estimes_ia`
lui-même** : la bascule passe par `marquerEstimeIa` (`estimates.ts`), appelée
côté serveur. L'assurance faisait exception, et sa copie de la manipulation
avait déjà divergé.

## Recalcul automatique (`runRecalc` → `/api/apartments/[id]/recalc`)

Quand les données du bien changent, la chaîne impactée est rejouée : charges →
loyer → assurance → analyse IA, **côté serveur, en une seule requête**.
`computeRecalcNeeds(patch)` (`lib/recalc.ts`) décide quoi rejouer ; le client
importe la MÊME fonction pour allumer ses skeletons et nommer les étapes.
**Les valeurs manuelles sont écrasées** : la nouvelle estimation prime.

⚠️ L'ordre n'est pas interchangeable — le loyer lit les charges (conversion
HC→CC), et l'analyse doit voir les deux à jour pour noter le rendement.

⚠️ **Toute écriture d'un patch de formulaire passe par `appliquerPatch`**
(`lib/patchApartment.ts`), jamais par `updateApartment` directement : trois
effets de bord y sont attachés (retrait des badges « estimé », re-géocodage si
l'adresse change, suivi du montant emprunté si le prix change). Ils vivaient
dans le corps de la route PATCH — une seconde route écrivant le même patch les
perdait en silence.

Flags `*Pending` (`rentPending`, `chargesPending`, `analysisPending`) :
contrôlent les skeletons pendant le recalcul.

## Bannière sticky (`useBanner()`)

3 phases : `saving` (accent), `success` (vert, auto-dismiss 3 s), `error`
(rouge, auto-dismiss 6 s). Utilisée par `save()`, `saveField()`,
`estimateFieldAI()`, `runRecalc()`. Réutilisable pour tout formulaire — voir
`SettingsForm.tsx` (`SettingsBanner`).

`fireEstimation(url, msgs, setPending, onSuccess?)` reste utilisé
uniquement par `handleRelancerAnalyse` — les re-estimations par champ
utilisent `estimateFieldAI`.

# Deux types de bien : la fiche et la ligne de liste

`Apartment` porte l'analyse COMPLÈTE ; `ApartmentListItem` (`types.ts`) porte un
**`AnalyseResume`** — score, verdicts, bloc Prix, soit tout ce que l'accueil
lit. `listApartments()` ne renvoie que le résumé : le reste (faits de tous les
blocs, narrations, recommandations, copie du profil investisseur) partirait
sinon dans le payload RSC de l'accueil pour chaque bien, sans lecteur.

`Apartment` reste assignable à `ApartmentListItem` — une fiche complète peut
alimenter un composant de liste, jamais l'inverse. Un composant de LISTE
(`HomeView`, `ApartmentsTable`, `ApartmentsCardList`, `ApartmentsMap`,
`RendementDetailPanel`) se type donc en `ApartmentListItemWithComputed` ; s'il
lui faut un champ absent du résumé, c'est le signe qu'il appartient à la fiche,
pas que le résumé doit grossir.

# Pattern Display/Edit pour champs estimés

Les sections Location et Charges annuelles (`ApartmentDetail.tsx`) utilisent
un pattern **Display → Edit → Save/Cancel** pour 5 champs : loyer, charges
copro, taxe foncière, assurance, frais de gestion.

**Mode Display** (`DisplayValue`) : valeur en gros (`text-2xl
font-semibold`), avec badge (`AiEstimatedBadge` ambre pour IA/déterministe,
`ManualBadge` gris pour manuel, rien si null — placé à côté du LABEL, jamais
collé dans la valeur), bouton "Modifier" (crayon), bouton "Estimer avec IA"
(sparkle ambre, absent sur frais de gestion — paramètre utilisateur, pas un
champ estimé).

**Mode Edit** (`EditableValue`) : `NumberField` + ✓ (accent, `saveField(key)`
→ PATCH, passe dans `champs_manuels`) + ✕ (gris, `cancelField(key)`, annule
sans PATCH).

# Règles de lint React : le Compiler LINTE, mais ne COMPILE pas

`eslint-config-next` (Next 16) active les règles du React Compiler, alors que
`next.config.ts` **n'active pas le compilateur**. Conséquence directe : on ne
peut pas supprimer un `useCallback`/`useMemo` en se disant « le compilateur
mémoïsera » — rien ne le fera. La mémoïsation manuelle doit rester JUSTE.

- **`react-hooks/set-state-in-effect`** — jamais de `setState` synchrone dans
  le corps d'un effet. Trois remplacements, tous employés dans le code :
  - *réinitialiser un état quand une prop change* → **ajustement pendant le
    rendu** avec garde `!==` (`ApartmentDetail.tsx`, `PlaygroundView.tsx`) ;
  - *lire une API navigateur qui s'abonne* (`matchMedia`) →
    **`useSyncExternalStore`** avec un instantané serveur ;
  - *drapeau « chargement en cours »* → le **déduire** d'une clé de requête
    (« la clé attendue diffère de la clé reçue »), plutôt que le poser avant
    un `fetch`. Bonus : un résultat périmé ne peut plus s'afficher comme s'il
    concernait la configuration courante, et le drapeau ne reste plus bloqué
    à `true` quand la requête est annulée en vol.
- **`react-hooks/rules-of-hooks`** — un composant qui **retourne tôt** ne peut
  plus déclarer de hook après ce retour. Avant d'en ajouter un, vérifier qu'il
  n'y a pas de `return` au-dessus. Un handler posé sur un élément DOM natif
  n'a de toute façon rien à gagner à un `useCallback` : son identité ne
  déclenche aucun rendu.
- **`react-hooks/preserve-manual-memoization`** — les dépendances déclarées
  doivent COUVRIR celles que le compilateur infère, sinon il renonce à
  optimiser tout le composant. Ajouter les setters `useState` manquants (ils
  sont stables, donc sans effet à l'exécution) suffit.

⚠️ **`test-bookmarklet.js` est ignoré par ESLint** (`eslint.config.mjs`) : c'est
l'artefact MINIFIÉ du bookmarklet, sa source lintée est `src/lib/bookmarklet.ts`.

# Pages d'erreur (not-found / error)

Boundaries Next.js à deux niveaux (`appartements/[id]/` et racine), toutes
bâties sur **`ErrorScreen.tsx`** partagé. `not-found` (icône `SearchX`) pour
un bien supprimé/ID inconnu ; `error` (icône `AlertTriangle`, bouton
**Réessayer** via `reset()`) pour un échec technique. `error.tsx` doit être
un Client Component ; n'affiche que `error.digest` (opaque), jamais le
message ni la stack.

**Sans ces boundaries**, une exception non gérée en SSR coupe la réponse
HTTP en plein flux (écran d'erreur réseau du navigateur, pas de l'app).

**Trois causes déjà rencontrées** (vérifier avant de supposer une panne
inédite) :
1. **Bloc/champ manquant sur une analyse ancienne** — `AnalyseIA.blocs`/
   `.verdicts` promettent des champs toujours présents, mais une analyse
   stockée dans un schéma antérieur peut ne pas les avoir. **Tout accès à un
   champ de `AnalyseIA` doit être gardé** (`analyse.blocs?.prix?.faits ?? []`),
   même si le type le dit obligatoire. Symétrie moins évidente, rencontrée
   depuis : le JSON stocké peut aussi contenir des entrées que le code
   n'émettrait PLUS (un verdict de bloc désormais exclu de `buildVerdicts`).
   Une analyse en base n'est donc pas une sortie du code courant — la relire
   telle quelle affiche des résultats périmés sans lever d'erreur.
2. **ID malformé dans l'URL** — Postgrest rejette avant de chercher la ligne
   (`invalid input syntax for type uuid`) ; distinguer cette erreur d'une
   vraie erreur de config Supabase (`requiredEnv()`), traiter comme
   `notFound()`.
3. **`page.tsx` : le `try/catch` ne couvre que le fetch**, pas
   `computeDerived()` ni le rendu de `ApartmentDetail` — une exception dans
   l'un ou l'autre retombe sur `error.tsx`.
