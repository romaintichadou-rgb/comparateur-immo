<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Règle impérative — documentation à jour

**Chaque changement de code doit impérativement mettre à jour `AGENTS.md` et
tout fichier `.md` concerné** (README.md, etc.) pour que la documentation reste
toujours synchronisée avec le code. Aucun merge ne doit créer de conflit entre
le code et sa documentation. Cela inclut : ajout/suppression de composants,
modification de conventions UI, changement de labels/scores, nouvelles
fonctions utilitaires, nouvelles colonnes DB, etc.

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
    à autre chose sans validation explicite — ce n'est pas une gamme "prête
    à l'emploi" malgré sa présence dans le thème.
  - Destructif (supprimer, etc.) : `red-*` Tailwind standard (`bg-red-600`
    / hover `red-700` pour un bouton plein, `text-red-600` pour une action
    inline). C'est une dérogation volontaire et assumée à la règle
    "pas de Tailwind par défaut" ci-dessus : le rouge se lit universellement
    comme danger et recoupe la couleur déjà utilisée pour les alertes de
    score (voir plus bas), donc `signal-*` ne doit **pas** remplacer ce
    rouge — ne pas "corriger" ce point en relisant la charte au premier
    degré.
  - Les couleurs sémantiques (`emerald-*`/`amber-*`/`red-*` pour la qualité
    d'un score ou d'un statut) restent séparées de l'accent de marque — ne
    pas les migrer vers `accent-*`.
- **Typographie** (`next/font/google` dans `src/app/layout.tsx`) :
  - `font-display` (Fraunces) : titres H1/H2, jamais le corps de texte.
  - `font-sans` (IBM Plex Sans) : corps de texte, valeur par défaut.
  - `font-mono` (Geist Mono) : tout chiffre clé — score, prix, rendement,
    cash-flow (voir `ScoreGauge`, `ScoreBadge`, `ApartmentsTable` pour
    l'exemple). Ne pas revenir à IBM Plex Mono.
  - `font-wordmark` (Outfit) : réservé au wordmark « Immoscore » de la
    navbar, nulle part ailleurs.
- **Logo** : `AppMark` exporté depuis `src/components/Navbar.tsx` (motif
  anneau ouvert + point). Réutiliser ce composant plutôt que redessiner une
  variante. Il n'est PAS affiché dans la navbar (wordmark seul) — la navbar
  signe la marque en mettant « score » en `accent-600` (voir `Wordmark`).
- **Boutons** : Primaire (`bg-accent-600` plein, hover `accent-700`),
  Secondaire (contour `ink-300`, hover `bg-ink-50`), Tertiaire (lien
  souligné, sans fond), Destructif (`red-*`, voir "Couleurs" ci-dessus),
  Désactivé (opacité réduite). **Aucune icône à l'intérieur d'un CTA** —
  texte seul. Exception : les affordances icône-seule compactes (ex. bouton
  "supprimer" en corbeille sur une ligne de tableau/carte) ne sont pas des
  CTA au sens de cette règle — voir `ApartmentsTable.tsx` /
  `ApartmentsCardList.tsx`.
  Taille standard pour tout CTA principal/secondaire de page :
  `rounded-lg px-5 py-2.5 text-sm font-medium` (voir le bouton "Analyser"
  dans `AddApartmentFlow.tsx`). Les actions inline compactes (sauvegarde
  contextuelle dans une bannière, actions de ligne de tableau) peuvent rester
  plus petites (`px-3 py-1.5 text-xs`), de même que le CTA de la navbar
  (contrainte de hauteur du header) — mais tous les CTA de page pleine
  largeur ou en pied de formulaire doivent utiliser la taille standard,
  jamais plus grands. Les boutons en pied de formulaire full-width
  (`SettingsForm.tsx`) utilisent `w-full py-3` pour l'emphase, sans `px` (width couvre).
  **Aucune icône à l'intérieur d'un CTA** — texte seul, même pour le bouton
  "Enregistrer" qui dispose d'une bannière pour les retours d'état (succès/erreur).
- **Fonds décoratifs** (hero, bannières) : dégradé subtil en `accent-50` /
  `white`, jamais de bleu/indigo Tailwind par défaut. Pour une touche "tech
  luxe", un filigrane du logo (`AppMark`) en très faible opacité peut
  servir de motif de fond — toujours via la classe `opacity-*` sur le SVG
  entier (pas un modificateur `text-color/opacity`), car le point signal du
  logo a une couleur `fill` fixe qui ignorerait sinon l'opacité et
  ressortirait comme une tache colorée isolée. Voir l'étape "Coller l'URL"
  dans `AddApartmentFlow.tsx` pour l'exemple de référence. Autre motif de
  fond disponible : `.bg-tech-grid` (`globals.css`) — grille fine masquée en
  radial, réservée aux écrans vides/hero, jamais sur une zone de lecture
  dense. Comme elle s'applique en `background-image` sur tout l'élément (et
  donc ses enfants), la poser sur un calque `absolute` isolé plutôt que sur
  le conteneur du contenu (voir `EmptyHomeState.tsx`).
- **Cartes** (blocs `border border-ink-200 bg-white rounded-xl/lg`) : pas de
  `shadow-sm` — le bordé seul suffit à détacher le bloc du fond `ink-50`.
  L'ombre reste réservée aux éléments réellement flottants au-dessus du
  contenu (modales, tooltips, badges superposés à la carte Leaflet) où elle
  signale une élévation, pas une décoration de carte.
- **Confirmation destructive** : passer par `ConfirmDialog.tsx` (modale
  générique : titre, description, bouton destructif `red-*`, focus initial
  sur "Annuler" pour qu'un geste délibéré soit nécessaire) plutôt que
  `window.confirm()`. Pour un flux de suppression, réutiliser
  `useDeleteApartment.tsx` (mutualisé entre `ApartmentsTable`,
  `ApartmentsCardList`, `ApartmentDetail`) plutôt que ré-écrire l'appel
  DELETE et la gestion d'état à chaque écran.
- **Navbar** (`Navbar.tsx`) : sticky (`sticky top-0 z-40`) avec un liseré
  dégradé `accent-600 → accent-400 → accent-600` de 3px en tout haut. Lien
  actif signalé par une couleur (`text-accent-700`) + un soulignement
  (`bg-accent-600`), jamais par un fond plein. Le hover des liens inactifs
  reprend la couleur de l'état actif en plus léger (`hover:bg-accent-50
  hover:text-accent-700`) plutôt qu'un gris neutre — le survol doit annoncer
  ce que devient le lien une fois actif.

# Composants partagés & conventions UI

## Inventaire des composants réutilisables (`src/components/`)

| Composant | Fichier | Rôle |
|---|---|---|
| `StatCard` | `StatCard.tsx` | Carte métrique tonale (label/valeur/sub/tone). Mode simple ou avant→après. Affordance cliquable : pointillé sous la valeur + "Calcul →". |
| `SectionHeader` | `SectionHeader.tsx` | En-tête de section : icon-pill accent + titre uppercase. Props : `icon`, `title`, `as` (h2/h3), `className`. Toujours préférer ce composant plutôt que recréer le pattern manuellement. |
| `SectionTitle` | `SectionHeader.tsx` | Titre de section **sans icône**. Utilise `font-display` (Fraunces) pour garantir la cohérence typographique de tous les H2/H3. Props : `as` (h2/h3), `className`. À préférer aux `<h2>`/`<h3>` bruts pour éviter les erreurs de font. |
| `Skeleton` | `Skeleton.tsx` | Barre shimmer de chargement. |
| `ConfirmDialog` | `ConfirmDialog.tsx` | Modale de confirmation destructive (titre, description, bouton rouge). |
| `ErrorScreen` | `ErrorScreen.tsx` | Page d'erreur/not-found plein écran. |

Formulaires (`form/Fields.tsx`) : `TextField`, `TextAreaField`, `NumberField`,
`SelectField`, `BooleanField`, `AiEstimatedBadge`, `ManualBadge`,
`EstimatedBadge`, `ExtractedBadge`. Tous les composants de champ acceptent
un prop `hint` (y compris `BooleanField` et `TextAreaField`).

**Badge "Détecté auto"** : le badge `ExtractedBadge` doit apparaître sur
**tous** les champs pré-remplis par le bookmarklet ou le scraping serveur.
Champs couverts : `ville`, `quartier`, `adresse`, `code_postal`, `surface_m2`,
`nb_pieces`, `nb_chambres`, `etage`, `ascenseur`, `annee_construction`,
`etat_bien`, `dpe`, `ges`, `photo_url`, `description`, `prix`,
`charges_copro_annuelles`, `taxe_fonciere`, `contact_telephone`,
`contact_email`. Ne jamais ajouter un champ extractible dans `ParsedListing`
sans câbler son badge.

⚠️ **Et sans le recopier dans `applyParsedFields`** (`AddApartmentFlow.tsx`) —
c'est le vrai piège, plus grave que le badge manquant. `taxe_fonciere` était
déclarée dans `ParsedListing` mais absente de cette fonction : toute taxe
foncière extraite d'une annonce était **silencieusement perdue**, sans erreur ni
champ vide suspect. Ajouter un champ extractible = trois points à câbler :
`ParsedListing`, `applyParsedFields`, et le badge.

Providers : `RendementDetailProvider`, `LoyerDetailProvider`,
`CashflowDetailProvider` — montés dans `layout.tsx`, consommés via hooks.

## Spacing

Échelle Tailwind standard. Conventions canoniques :

| Contexte | Valeur | Classe |
|---|---|---|
| Padding de carte section | 20px | `p-5` |
| Padding de StatCard | 16px | `p-4` |
| Gap dans une grille de cartes | 12px | `gap-3` |
| Espacement entre sections (FlatSection) | 56px | `pt-14 pb-14` |
| Séparateur de section | — | `border-t border-ink-100/50` |
| Séparateur de faits | — | `divide-y divide-ink-100/50` |

## Largeur de page — choisie par ARCHÉTYPE, pas au jugé

Tout écran est un `mx-auto <max-w-*> px-4 py-8 sm:px-6`. La largeur suit le type
d'écran, pas son contenu ponctuel :

| Archétype | Classe | Écrans |
|---|---|---|
| Liste dense (tableau, carte) | `max-w-7xl` | `Navbar`, `HomeView` |
| Détail dense (onglets, grilles de métriques) | `max-w-6xl` | `ApartmentDetail`, son `loading.tsx` |
| Formulaire **avec colonne latérale** | `max-w-4xl` | `AddApartmentFlow` |
| Hero / écran vide centré | `max-w-4xl` | `EmptyHomeState` |
| Formulaire simple, colonne unique | `max-w-2xl` | `SettingsForm`, `BookmarkletView`, `SetupNotice` |

⚠️ **`AddApartmentFlow` est en `4xl` À CAUSE de sa sidebar, pas parce que c'est un
formulaire plus long.** Sa grille `lg:grid-cols-[1fr_320px]` dépense 320 px + le
`gap-6` en colonne de droite ; le ramener à `2xl` pour « aligner les deux écrans
de formulaire » laisserait la colonne principale à **280 px** et ses champs en
`sm:grid-cols-2` à **100 px** chacun — inutilisables. Mesuré, pas supposé. Les
deux écrans de formulaire ONT le droit de différer : ce qui compte est la largeur
de la colonne de saisie (504 px ici, 624 px dans `SettingsForm`), pas celle du
conteneur.

**Une bannière fixée suit le conteneur de SA page.** `SettingsBanner` et son
jumeau dans `ApartmentDetail` sont `fixed inset-x-0` avec un enfant
`mx-auto max-w-*` : cette largeur doit reprendre celle de la page. Le pattern a
été copié depuis `ApartmentDetail` (page en `6xl`) vers `SettingsForm` (page en
`2xl`) sans l'ajuster — le message de confirmation démarrait alors 240 px à
gauche du formulaire qu'il confirmait.

## Border radius

| Contexte | Classe |
|---|---|
| Cartes de section, StatCard | `rounded-xl` |
| Boutons, inputs, éléments interactifs | `rounded-lg` |
| Badges, pills | `rounded-full` |
| Carte verdict (hero) | `rounded-2xl` |
| Petits éléments (tags, links) | `rounded-md` |

## Dividers

Opacité 50% partout pour un look épuré sans perdre les landmarks visuels :
- Entre sections : `border-t border-ink-100/50`
- Entre items de liste (faits) : `divide-y divide-ink-100/50`
- Tab bar : `border-b border-ink-100` sur le `<nav>` (pleine opacité, fin)

## Responsive

Mobile-first (`sm:` = 640px est le breakpoint principal). Conventions :
- Tables desktop → `hidden sm:block` + `ApartmentsCardList` en `sm:hidden`
- Tab bar : scroll horizontal (`overflow-x-auto`), labels courts sur mobile
- Grilles : `grid-cols-1 sm:grid-cols-2` (ou `lg:grid-cols-*` pour les layouts larges)
- Mini carte : `hidden sm:block` (masquée sur mobile)
- Zones de tap mobile : minimum 44px (`py-3 px-4` sur les onglets)

## Icônes

Librairie : **Lucide React** exclusivement. Taille standard `h-3.5 w-3.5`
dans les section headers, `h-4 w-4` / `size-4` dans les onglets et les
éléments inline. **Pas d'icônes dans les boutons CTA** (texte seul).

## Constantes partagées (`src/lib/constants.ts`)

`APP_NAME`, `PIN_RED`, `PIN_RED_STROKE` — ne pas redéfinir localement.

# Modélisation "Immeuble" (bien de rapport multi-lots)

Tout le modèle (`Apartment`, estimations, calculs, Analyse IA) suppose par
défaut **un seul logement**. Le type de bien `"Immeuble"` (voir `TYPES_BIEN`
dans `src/lib/types.ts`) est la seule exception, et casse plusieurs de ces
hypothèses. Ne jamais tester `apt.type_bien === "Immeuble"` directement :
utiliser le prédicat centralisé **`isImmeuble(typeBien)`** (`src/lib/types.ts`,
insensible à la casse/espaces) — c'est le seul endroit qui doit connaître la
valeur exacte de la chaîne.

- **Migration requise** : `supabase/migrations/0003_nb_lots.sql` ajoute la
  colonne `nb_lots`. Comme les autres migrations, à exécuter manuellement sur
  CHAQUE projet Supabase (prod et dev) — sans elle, toute création de bien
  échoue (le payload d'insertion inclut `nb_lots`).
- **`nb_lots`** (`Apartment.nb_lots`, nullable) : nombre de logements de
  l'immeuble. N'a de sens que pour un Immeuble ; `null` pour un logement
  unique. Champ affiché conditionnellement dans `AddApartmentFlow.tsx` et
  `ApartmentDetail.tsx` (`{isImmeuble(...) && <NumberField .../>}`), jamais
  affiché pour les autres types.
  Quand `nb_lots` n'est pas renseigné, utiliser **`lotsEffectifs(nb_lots,
  surface_m2)`** (`src/lib/estimates.ts`) plutôt que de deviner ailleurs — ordre
  de grandeur ~1 logement / 55 m², plancher 2.
- **Loyer (`loyer_retenu`)** : pour un Immeuble, c'est le loyer mensuel
  **TOTAL de tous les lots**, jamais le loyer d'un logement unique. L'ancrage
  vient de la décision produit explicite (pas d'un champ séparé par lot) :
  un seul champ, mais dont la sémantique change selon le type. L'estimation IA
  (`estimateRent` dans `src/lib/rentEstimation.ts`) utilise un prompt dédié
  (`buildImmeublePrompt`) qui demande explicitement un raisonnement lot par
  lot puis une somme — ne JAMAIS repasser sur le prompt "logement unique"
  pour ce cas, le total serait alors sous-estimé d'un facteur `nb_lots`.
- **Charges annuelles** : un immeuble entier n'a pas de copropriété (on
  possède tout le bâtiment) — `estimateChargesCopro(surfaceM2, immeuble)`
  utilise un barème et un libellé différents ("Charges d'exploitation
  annuelles" au lieu de "Charges copro annuelles", ~13 €/m²/an au lieu de
  ~22 €/m²/an, plancher 1500 € au lieu de 800 €). Le libellé UI doit suivre
  `isImmeuble()`, pas rester générique.
- **Assurance PNO** (`estimateAssurance(immeuble, nbLots, surfaceM2, typeBien)`)
  : dynamique selon surface et type de bien. Appartement : 2.5 €/m²
  (plancher 90 €, plafond 350 €). Maison : 3.0 €/m² (plancher 180 €, plafond
  450 €). Immeuble : par lot avec économies d'échelle (−5 % par lot au-delà
  de 2, plafonné à −30 %).
- **Analyse IA — bloc Prix** (`src/lib/analyse/blocs/prix.ts`) : la seule
  source de comparaison (DVF) ne contient que des ventes d'**appartements au
  détail** (`codtypbien=121`). Décision produit assumée : garder la
  comparaison plutôt que la neutraliser, mais avec un avertissement explicite
  ("vente en bloc, décote 10-20 %") et une note qui intègre une décote
  attendue de 12 % avant calcul, plafonnée à 8/10 (`NOTE_MAX_IMMEUBLE`) — un
  immeuble ne doit jamais recevoir la note max sur ce bloc, la comparaison
  reste structurellement incertaine. Ne pas retirer cet avertissement ni
  déplafonner la note en pensant "simplifier".
- **Analyse IA — bloc Location** (`src/lib/analyse/blocs/location.ts`) : le
  loyer/m² d'un immeuble est une MOYENNE sur tous les lots, légitimement plus
  élevée que le loyer/m² médian d'un logement unique (les petits logements se
  louent plus cher au m²). Les seuils de détection "loyer optimiste" sont
  donc volontairement plus permissifs pour un immeuble (`seuilMax` ×1.25,
  `seuilEcart` 30 % au lieu de 10 %) — ne pas aligner ces seuils sur ceux
  d'un logement unique, ça déclencherait un faux positif systématique.
- **Narration** (`src/lib/analyse/run.ts` → `contexteBien`,
  `src/lib/analyse/narration.ts`) : un paragraphe de contexte est injecté
  dans le prompt de narration quand `isImmeuble()`, pour que le LLM parle de
  "cet immeuble" (jamais "cet appartement") et comprenne que le loyer cité
  est un total. Si un nouveau bloc d'analyse est ajouté, vérifier s'il a
  besoin du même traitement (comparer à une base "appartement" par défaut).
- **Limite connue, non traitée** : la simulation financière
  (`src/lib/simulation.ts`) **calcule** partout en régime **LMNP réel
  (meublé)**. Un immeuble de rapport est souvent loué nu (revenus fonciers,
  régime fiscal différent) — les montants restent corrects (ils scalent avec le
  loyer total et les charges totales), mais le calcul n'est PAS spécialisé par
  type de bien. L'existence du champ `regimeFiscal` ne change rien à ça (voir
  « Régime fiscal » plus bas) : c'est un chantier séparé, pas un oubli à
  corriger silencieusement en marge d'une autre tâche.

# Architecture d'estimation (loyer + charges)

Les estimations utilisent un mix de calculs déterministes et d'IA selon la
disponibilité des données. Ne pas modifier un flux sans vérifier la cohérence
avec les autres.

## Quatre champs estimés individuellement

Chaque champ a son propre bouton "Estimer avec IA" dans l'UI et son propre
appel backend. Il n'y a plus de bouton "Réestimer" global — tout est par champ.

| Estimation | Mode | Fichier | API route | Paramètre |
|---|---|---|---|---|
| **Loyer mensuel CC** | Déterministe + IA blending | `src/lib/rentEstimation.ts` | `/api/estimate-rent` | — |
| **Charges copro** | Déterministe + IA blending | `src/lib/chargesEstimation.ts` | `/api/estimate-charges` | `field: "charges_copro_annuelles"` |
| **Taxe foncière** (avec taux communal) | **100% déterministe** — pas d'appel IA | `src/lib/taxeFonciereCommune.ts` | idem | `field: "taxe_fonciere"` |
| **Taxe foncière** (sans taux communal) | Déterministe + IA blending (fallback) | idem | idem | `field: "taxe_fonciere"` |
| **Assurance PNO** | **100% déterministe** — pas d'appel IA | `src/lib/estimates.ts` | PATCH direct `/api/apartments/[id]` | — |

Sans paramètre `field`, `/api/estimate-charges` estime les deux (charges copro
+ TF) — utilisé par `runRecalc` lors d'un changement de données du bien.

## Blending déterministe + IA (loyer, charges copro, TF fallback)

1. **Calcul déterministe** à partir de barèmes connus (ANIL pour le loyer,
   barèmes départementaux pour les charges) ajusté par les caractéristiques.
2. **Appel Gemini + Google Search** (temperature 0) avec prompt structuré
   qui injecte l'ancrage déterministe comme référence.
3. **Blending** : `final = 0.6 × déterministe + 0.4 × IA`, clampé :
   - Loyer : fourchette ANIL min/max × surface
   - Charges copro : ±30 % du déterministe (0.7–1.4)
   - TF fallback : ±30 % du déterministe (0.7–1.4)

Le poids IA (`AI_WEIGHT = 0.4`) est identique dans les deux fichiers. Ne pas
le changer dans un seul — la stabilité dépend de cette constance.

## Taxe foncière — mode déterministe (taux communal disponible)

Quand le `code_insee` du bien est trouvé dans la table DGFiP (34 874 communes),
la TF est calculée **sans appel IA** :
- `TF = surface × RC_m2 × taux_commune`
- Quand estimée seule (`field: "taxe_fonciere"`), aucun appel Gemini
- Quand estimée avec les charges (`runRecalc`), le prompt IA ne demande que
  les charges copro (économie de tokens)
- Le badge affiche "ESTIMATION IA" (ambre) comme les autres — choix UX
  volontaire pour l'homogénéité, même si le calcul est déterministe
- La justification est générée localement (taux, source DGFiP)

## Provision sur charges (estimation loyer)

La provision sur charges utilisée pour convertir un loyer HC en CC n'est plus
un forfait fixe (2.5 €/m²/mois). `provisionChargesM2(input)` dans
`rentEstimation.ts` utilise les charges réelles du bien quand disponibles :
`charges_copro_annuelles / 12 / surface_m2`. Fallback à 2.5 €/m²/mois si
les charges sont inconnues (cas rare — elles sont estimées dès la création).

## Ajustements déterministes

Les mêmes facteurs d'ajustement sont appliqués dans le calcul déterministe ET
dans le prompt IA (via des consignes structurées) pour garantir la cohérence :

- **Étage/ascenseur** : pas d'impact aux étages 1-2. Rez-de-chaussée : décote
  (-5 % loyer, pas d'effet sur charges). Étage ≥ 3 avec ascenseur : prime
  (+5 % loyer, +20 % charges copro). Étage ≥ 3 sans ascenseur : décote
  (-3 % loyer). Ne JAMAIS appliquer d'impact ascenseur en dessous du 3e étage.
- **Travaux** : trois paliers basés sur €/m² de travaux (<300 légers, 300-800
  moyens, ≥800 lourds). Impactent le loyer à la hausse uniquement (bien
  rénové). N'impactent pas les charges.
- **DPE** : facteur multiplicateur par lettre (A=1.04 → G=0.91). Impacte le
  loyer uniquement.
- **Ancienneté** : immeuble >50 ans = +10 % charges, ≤20 ans = -5 % charges.
  N'impacte pas le loyer (couvert par le DPE et l'état du bien).

## Règles d'affichage des justifications

Toutes les justifications (loyer, charges, taxe foncière) passent par
**`sanitizeJustification(text, surface, unit, maxPhrases)`**
(`src/lib/format.ts`). Double filet : appliqué au **stockage** (génération)
ET à l'**affichage** (données anciennes en base). Règles appliquées :
1. Convertit les €/m² dans l'unité cible (€/mois ou €/an)
2. Supprime les formules de calcul (X × Y = Z)
3. Supprime "Résultat : X €…" en fin de texte
4. Remplace "moyenne nationale" par "moyenne locale"
5. Tronque à `maxPhrases` phrases

Ne JAMAIS contourner ce filet — le code garantit la conformité même si
l'IA viole les consignes du prompt.

- **Rendu bold** : appliquer `renderBoldInline()` (`ApartmentDetail.tsx`) à
  tout texte de justification. La regex met en gras les montants €, les %, et
  les mots-clés pertinents (ascenseur, travaux, taux communal, etc.).
- **Données récentes uniquement** : dernière année connue, pas de moyenne
  multi-années.

## Couleurs sémantiques — référence complète

Trois fonctions canoniques pilotent les couleurs. Ne pas en créer de nouvelles
ni coder des seuils inline — toujours réutiliser celles-ci.

**Les tables tonalité → classe vivent aussi dans `scoring.ts`** et sont les
seules autorisées. Ne JAMAIS en redéfinir une copie locale dans un composant
(`METRIC_VALUE_CLASS`, `TONE_TEXT`, `RENDEMENT_TEXT_CLASS`, `cashflowTextClass`
étaient quatre copies divergentes — supprimées) :

- **`TONE_TEXT_CLASS[tone]`** — texte sur fond BLANC : tout chiffre coloré par un
  seuil du profil investisseur (rendement, cash-flow, écart). `neutral` =
  `text-ink-900`.
- **`NOTE_TEXT_CLASS[tone]`** — pour toute note /10. `neutral` = `text-ink-400`.
- **`TONE_PANEL_STYLES[tone]`** — texte sur fond TEINTÉ : panneaux de détail,
  cartes statistiques, pills. Quatre slots (`wrap` / `label` / `value` / `sub`),
  un cran plus foncé que sur blanc (voir « Intensité du rouge » plus bas).
  `sub` sert aux cartes à trois lignes. Concerne `RendementDetailPanel`,
  `CashflowDetailPanel`, `LoyerDetailPanel` et la pill de `ApartmentsMap` — qui
  en avaient chacun une copie locale divergente.

De même, `cashflowTone()` ne doit pas être ré-implémentée inline (elle l'était
dans `blocs/simulation.ts` et `SimulationFinanciere.tsx`). Utiliser
`cashflowSeuilsFromSettings(settings)` pour construire les seuils.

### `noteTone(note)` — couleur d'un score /10

Utilisé pour les sous-scores du verdict, les scores de FlatSection, les tags de
catégorie **et l'anneau de score du tableau d'accueil** (`ScoreRing` /
`scoreToneClasses` dans `ApartmentsTable.tsx`, qui n'apporte plus que le fond,
le rail et l'anneau — jamais ses propres seuils). Source unique dans
`scoring.ts`. Les paliers sont alignés sur `scoreCategorie` : ≥ 7 = « Opportunité
intéressante » donc vert. Un 7,5 doit être vert PARTOUT — ne pas réintroduire un
seuil à 8 côté tableau.

| Score  | Tone    | Classe text (`NOTE_TEXT_CLASS`) |
|--------|---------|------------------|
| ≥ 7    | emerald | `text-emerald-700` |
| ≥ 5    | amber   | `text-amber-700`   |
| < 5    | red     | `text-red-600`     |
| null   | neutral | `text-ink-400`     |

### `scoreCategorie(note)` — verdict global de l'investissement

Utilisé uniquement pour le **tag du verdict global** (en-tête de l'Analyse IA).
Les labels décrivent le profil d'investissement dans son ensemble.

| Score  | Label                      | Tone    |
|--------|----------------------------|---------|
| ≥ 8.5  | Excellente opportunité     | emerald |
| ≥ 7    | Opportunité intéressante   | emerald |
| ≥ 5    | À négocier                 | amber   |
| ≥ 3.5  | Investissement fragile     | red     |
| < 3.5  | Investissement déconseillé | red     |
| null   | Données insuffisantes      | neutral |

### `blocCategorie(note)` — tag qualitatif d'un bloc d'analyse

Utilisé pour les **tags des sections individuelles** (Prix d'achat, Potentiel
locatif, etc.). Les labels décrivent la qualité du thème évalué, pas le profil
d'investissement — ex. un Potentiel locatif à 5 est "Moyen", pas "À négocier".

| Score  | Label                 | Tone    |
|--------|-----------------------|---------|
| ≥ 8.5  | Excellent             | emerald |
| ≥ 7    | Favorable             | emerald |
| ≥ 5    | Moyen                 | amber   |
| ≥ 3.5  | Faible                | red     |
| < 3.5  | Critique              | red     |
| null   | Données insuffisantes | neutral |

Tags : `CATEGORIE_TAG_STYLES` dans `AnalyseIA.tsx` — emerald-50/700,
amber-50/700, red-50/700, ink-100/500. Partagé entre les deux fonctions
(mêmes tones, styles identiques).

### `rendementNetTone(rendement, seuils)` — couleur du rendement

Seuils configurables dans le profil investisseur (défauts : vert 5.5 %,
rouge 4.0 %).

| Condition           | Tone      |
|---------------------|-----------|
| ≥ seuil vert (5.5%) | positif   |
| ≥ seuil rouge (4%)  | attention |
| < seuil rouge        | alerte    |

### `cashflowTone(cashflow, seuils)` — couleur du cash-flow

Seuils configurables dans le profil investisseur (défauts : vert 0 €,
rouge −200 €).

| Condition               | Tone      |
|-------------------------|-----------|
| ≥ seuil vert (0 €)      | positif   |
| ≥ seuil rouge (−200 €)  | attention |
| < seuil rouge            | alerte    |

Mapping tone → classe : `TONE_TEXT_CLASS` (voir plus haut) — `positif` =
`text-emerald-700`, `attention` = `text-amber-700`, `alerte` = `text-red-600`,
`neutral` = `text-ink-900`.

**Les MetricCards de l'onglet Analyse respectent ces seuils** (prop
`cashflowSeuils`, passée par `ApartmentDetail`). Elles utilisaient auparavant
des seuils codés en dur (0 / −200), ce qui rendait le profil investisseur à
moitié appliqué : le même cash-flow apparaissait en couleurs différentes selon
l'onglet. Ne pas revenir à une constante locale.

### « Cash-flow mensuel » = ANNÉE 1, partout

Un « cash-flow mensuel » non qualifié désigne TOUJOURS
`simulate().cashflowMensuelAn1` — MetricCards de l'onglet Analyse, colonnes
avant/après de l'onglet Optimiser, et le moteur de recommandations
(`cashflowOf`, dichotomie du levier financement). Le cash-flow **moyen** existe
toujours mais n'est affiché QUE sous un libellé explicite (« Cash-flow mensuel
moyen », highlights du bloc Simulation).

Pourquoi ça compte : les deux valeurs divergent franchement dès que les
hypothèses de revalorisation/indexation sont actives, et peuvent tomber de part
et d'autre du seuil vert (cas réel observé : An1 = **+20 €** vert, moyen =
**−112 €** ambre, sur le même bien inchangé). La colonne « avant » d'Optimiser
décrit le bien RÉEL non modifié : elle doit afficher exactement le chiffre déjà
lu sur l'onglet Analyse. Seule la colonne « après » est une projection, et il
est normal qu'elle diffère.

⚠️ Les recommandations sont **persistées** dans `analyse_ia.recommandations` :
les biens analysés avant ce changement gardent un `cashflowAvant` calculé sur la
moyenne jusqu'à la prochaine relance d'analyse.

### Scoring bloc Simulation financière (`blocs/simulation.ts`)

Note /10 adaptée au profil investisseur (seuils cash-flow personnels) :
- **Facteur principal (70 %)** : CF année 1 situé vs seuils profil (vert/rouge)
- **Facteur secondaire (30 %)** : soutenabilité (dégradation CF moyen vs an1)
- **Ajustement** : avantage fiscal LMNP (années sans impôt : +0.5 si ≥ 10 ans)

Un CF année 1 **vert** selon le profil donne un score de base ~8+. La
dégradation sur la durée pénalise proportionnellement mais ne fait pas
plonger un bon cash-flow immédiat sous 7.

### `ecartTone(pct)` — écart loyer (perspective investisseur)

`LoyerDetailPanel.tsx`. Logique **inversée** vs le locataire : au-dessus du
marché = bon pour l'investisseur.

| Écart       | Tone    | Raison                    |
|-------------|---------|---------------------------|
| > +15 %     | red     | Trop optimiste/irréaliste |
| 0 % à +15 % | emerald | Bon revenu locatif        |
| −10 % à 0 % | amber   | Revenu sous-optimal       |
| < −10 %     | red     | Très sous le marché       |

Ne JAMAIS inverser cette logique.

### Gravité des faits (`GRAVITE_STYLES`)

| Gravité   | Puce            | Valeur            |
|-----------|-----------------|-------------------|
| positif   | `bg-emerald-500` | `text-emerald-700` |
| info      | `bg-ink-300`     | `text-ink-800`     |
| attention | `bg-amber-500`   | `text-amber-700`   |
| alerte    | `bg-red-500`     | `text-red-600`     |

La gravité est un axe **distinct** de la tonalité — d'où une table à part.
`info` n'est pas `neutral` : `neutral` signifie « donnée indisponible » (valeur
« — »), alors qu'un fait `info` porte une vraie valeur, simplement sans
jugement. C'est ce qui justifie `text-ink-800`, un cran sous le `text-ink-900`
d'une valeur mise en avant. **Ce n'est pas un 3e neutre qui aurait dérivé** — ne
pas l'« harmoniser » vers `ink-900` ou `ink-400`.

### Verdicts de blocs (`VERDICT_STYLES`)

| Niveau    | Chip                         | Titre de ligne  | Fond ligne      |
|-----------|------------------------------|-----------------|-----------------|
| alerte    | `bg-red-100 text-red-700`    | `text-red-800`  | `bg-red-50/80`  |
| attention | `bg-amber-100 text-amber-700` | `text-amber-800` | `bg-amber-50/80` |
| positif   | `bg-emerald-100 text-emerald-700` | `text-emerald-800` | `bg-emerald-50/80` |

### Intensité du rouge : 600 sur blanc, 700 sur teinte

Règle transversale, valable aussi pour l'ambre et l'emeraude — implicite
jusqu'ici, ce qui l'a fait passer pour une incohérence lors d'un audit :

- **Texte sur fond blanc ou `ink-50`** → `text-red-600` / `text-amber-700` /
  `text-emerald-700` (valeurs, notes, faits — c'est `TONE_TEXT_CLASS` et
  `NOTE_TEXT_CLASS`).
- **Texte sur fond teinté** (`bg-red-50`, `bg-red-100`…) → un cran plus foncé :
  `text-red-700`, voire `text-red-800` pour un titre. C'est un besoin de
  contraste, pas une couleur différente. C'est ce que code `TONE_PANEL_STYLES`
  (`label` 700 / `value` 800 / `sub` 600) ; concerne aussi
  `CATEGORIE_TAG_STYLES`, `VERDICT_STYLES` et les tags d'emphase des MetricCards.

Avant de « corriger » un `red-700`, vérifier sur quel fond il est posé.

**Le rouge suit la même marche que l'ambre et l'émeraude** — il ne reste pas un
cran en dessous. Les copies locales de `TONE_PANEL_STYLES` avaient `alerte.value`
à `red-700` là où positif/attention étaient à `-800` ; c'était une asymétrie, pas
une intention.

### Séparateur de milliers : un nombre n'est JAMAIS rendu brut

Tout nombre affiché passe par un formateur de `lib/format.ts` — `formatEuros`,
`formatEurosSigned`, `formatPercent`, ou **`formatNombre`** quand l'unité est
rendue à part (`Fait.unit` : « €/m² », « €/mois », « ventes »).

⚠️ **`{n}` en JSX passe par `String(n)` et ne groupe RIEN.** C'est le piège :
les blocs d'analyse qui pré-formataient leur valeur en chaîne affichaient
« 1 849 » pendant que ceux qui passaient le nombre brut affichaient « 4706 » —
deux rendus pour le même type de donnée, dans la même liste de faits.

Le groupage se fait donc **au point de passage unique**, `FaitRow`
(`AnalyseIA.tsx`), qui applique `formatNombre` à tout `Fait.value` numérique.
Conséquence : **les blocs doivent passer un `number`, pas une chaîne
pré-formatée** — pré-formater remettrait une seconde règle d'affichage à côté de
la sienne. Seules les valeurs qui ne sont pas un nombre unique restent des
chaînes (fourchette « 1 145 – 1 846 », lettre de DPE, libellé d'aléa).

`sanitizeJustification` porte la même règle pour la prose IA (règle 5) : Gemini
écrit « 1551 € » aussi souvent que « 1 551 € ». Le groupage y est **conditionné
à un « € » qui suit** — dans du texte, un nombre à 4 chiffres est tout aussi
souvent une année (« interdit en 2028 ») qu'un montant, et la grouper serait
absurde. Ne pas élargir cette regex à tout nombre.

Deux exclusions volontaires, à ne pas « corriger » :

- **Les années** (`annee_construction`, « 2028 ») ne se groupent jamais.
- **`apt.description`** (texte verbatim de l'annonce) est rendu tel quel, même
  s'il contient « soit 1200 € annuel ». C'est la copie du vendeur, pas une
  donnée calculée — et surtout le champ est éditable : le formater à l'affichage
  seul recréerait un écart entre le mode lecture et le `<textarea>`.

### Montants signés : `formatEurosSigned`

Tout flux pouvant être négatif (cash-flow avant tout) passe par
**`formatEurosSigned`** (`lib/format.ts`) : `− 628 €`. Deux détails que
`formatEuros` garantit et qu'une concaténation maison perd —

- le **vrai signe moins** U+2212 (`−`), jamais le trait d'union ASCII (`-`) ;
- l'**espace insécable** avant le « € », sans quoi le symbole part seul à la
  ligne dans une colonne étroite.

`toLocaleString("fr-FR")` sur un nombre négatif produit un trait d'union : ne
jamais s'en servir tel quel pour afficher un montant. Quatre formateurs maison
coexistaient, dont deux se contredisaient **sur la même ligne de tableau**
(colonnes Crédit/Charges/Impôt en trait d'union, colonnes CF en signe moins).

Seule exception, dans `SimulationFinanciere` : `signe()` et `euros()`, formes
compactes de la table année par année (pas de « € » — l'en-tête de colonne le
porte — et pas d'espace après le signe, la densité prime). Elles utilisent le
même glyphe. Partout ailleurs : `formatEurosSigned`.

### Cartes statistiques teintées : la paire prime sur la table

Quand deux cartes du même gabarit sont côte à côte dans une grille, elles se
comparent d'un coup d'œil et doivent donc partager la même échelle de teintes —
même si l'une porte l'accent de marque et l'autre une tonalité sémantique. Voir
la paire « Loyer mensuel CC » (accent) / « Écart vs marché » (tonalité) dans
`LoyerDetailPanel` : toutes deux en label 700 / valeur 800 / sub 600. La
cohérence qui compte est celle qui est visible dans le même champ de vision, pas
celle avec un écran que l'utilisateur ne voit pas en même temps.

### Survol d'un chiffre cliquable — l'affordance suit le SUPPORT

Plusieurs endroits affichent un chiffre cliquable qui ouvre un panneau de détail
(rendement → `RendementDetailPanel`, cash-flow → `CashflowDetailPanel`). Il n'y
a **pas** d'affordance unique : chaque support a la sienne.

| Support | Affordance au survol |
|---|---|
| Carte mobile, popup de la carte (SANS bordure) | anneau tonal `RENDEMENT_HOVER_RING[tone]` |
| **Highlights de l'Analyse** (carte bordée) | **bordure NEUTRE recolorée**, 1px : `hover:border-ink-300` |
| Ligne du tableau d'accueil (dense) | soulignement pointillé |
| Tuile `ResultCard` (Opération, Simulation) | fond + bordure intensifiés (`hoverEmphase` / `hoverContext`) |
| Carte de l'onglet Optimiser | le lien « détail → » change de couleur |

**Les highlights de l'Analyse survolent en GRIS, pas en tonalité** — décision
produit assumée. La couleur sémantique est déjà portée par la VALEUR affichée
(`TONE_TEXT_CLASS`) ; le survol ne dit qu'une chose, « c'est cliquable », et le
dire en couleur ajoutait un second signal redondant qui variait d'une carte à
l'autre dans la même grille.

**La bordure reste à 1px : seule sa COULEUR change.** Deux pistes ont été
essayées puis écartées :

- `hover:border-2` — la taille extérieure ne bouge pas (`box-sizing:
  border-box`), mais la zone de CONTENU se rétrécit d'1 px de chaque côté et le
  texte tressaute au survol.
- `hover:ring-inset` — pas de décalage (un `box-shadow` ne participe pas à la
  mise en page), mais l'anneau se superpose à la bordure et se lit comme un
  second liseré.

Changer la seule couleur ne touche à aucune géométrie et ne crée qu'un liseré.

⚠️ **`RENDEMENT_HOVER_RING` (anneau TONAL) reste réservé aux éléments SANS
bordure.** Ce qui produisait deux cercles concentriques sur les highlights,
c'était la DIFFÉRENCE de couleur entre l'anneau (emerald) et le
`border-ink-200` en dessous — pas l'anneau lui-même.

Ne pas « uniformiser » ces affordances en lisant cette section trop vite. Deux
versions antérieures de ce document se sont trompées dans les deux sens : l'une
affirmait que `RENDEMENT_HOVER_RING` s'appliquait à « CHAQUE composant », l'autre
que le survol devait « toujours » reprendre la tonalité. Ni l'un ni l'autre n'a
jamais été vrai dans le code.

### DPE — impact réglementaire dans MetricCards

| DPE   | Sous-titre               | Tone      |
|-------|--------------------------|-----------|
| A-C   | Aucune restriction       | positif   |
| D     | OK, pas d'échéance proche | neutral   |
| E     | Interdit dès 2034        | attention |
| F     | Interdit dès 2028        | alerte    |
| G     | Interdit à la location   | alerte    |
| *(vide)* | Non renseigné          | neutral   |

Le cas « non renseigné » (`dpe` vide) affiche « — » en valeur et bascule le lien
de la carte vers l'onglet Description (« Compléter ») au lieu du bloc Risques.

### Anneaux de score : pilotés par la DÉCISION (`DECISION_RING_STYLES`)

La jauge de la fiche (`VerdictGauge`) et l'anneau de l'accueil (`ScoreRing`)
sont le même objet visuel : un cercle, le score /10 au centre, rempli à
`score / 10`. Ils partagent donc **une seule table de couleurs**,
`DECISION_RING_STYLES` (`scoring.ts`), clé `Decision | "inconnu"` :

| Décision | Trait | Chiffre |
|----------|-------|---------|
| achete   | `stroke-emerald-500` | `text-emerald-700` / `fill-emerald-700` |
| negocie  | `stroke-amber-400`   | `text-amber-700` / `fill-amber-700` |
| passe    | `stroke-red-500`     | `text-red-600` / `fill-red-600` |
| inconnu  | `stroke-ink-300`     | `text-ink-400` / `fill-ink-400` |

**La couleur suit la décision, pas la note** — décision produit assumée. Score
et décision ne coïncident pas : un bien à 7,5 surcoté de 8 % est « Négocie »
alors que sa note seule le peindrait en vert. Sur une liste d'annonces, ce qu'on
cherche est « achetable ou pas », pas « bien noté ou pas ». Conséquence à
assumer : un `7,5` peut s'afficher en ambre — chiffre flatteur, couleur
réservée, et c'est précisément le message.

La teinte de ligne du tableau (`DECISION_ROW_CLASSES` dans `ApartmentsTable`)
suit la même clé — sans quoi l'anneau et sa ligne se contrediraient.

Ne PAS recolorer ces anneaux avec `noteTone()` : celui-ci reste réservé aux
notes affichées comme telles (sous-scores du verdict, FlatSections), qui ne
portent aucune décision. Le fond de piste (`track`) n'est pas dans la table
partagée : il dépend du support (blanc pour le tableau, teinté pour la carte
verdict), c'est de l'habillage local.

### Plafonds sur le score global (`computeScoreGlobal`)

| Condition                          | Cap     | Impact verdict |
|------------------------------------|---------|----------------|
| Bloc risque ≤ 4/10                 | score ≤ 4 | → Passe       |
| Rendement < seuil rédhibitoire (4%) | score ≤ 5 | → Passe       |

### Pondérations des blocs (`BLOC_POIDS`)

| Bloc       | Poids normal | Sans Prix |
|------------|-------------|-----------|
| Prix       | 30 %        | 0 %       |
| Location   | 20 %        | 35 %      |
| Risques    | 15 %        | 15 %      |
| Potentiel  | 15 %        | 15 %      |
| Simulation | 20 %        | 35 %      |

# Taxe foncière — estimation commune + département

## Architecture à deux niveaux

L'estimation de la taxe foncière utilise deux niveaux de précision :

1. **Niveau communal** (précis) — `src/lib/taxeFonciereCommune.ts` (server-only,
   473 Ko de données) :
   - Source : DGFiP 2025 REI, 34 874 communes
   - Données : `src/lib/taux_tfpb_communes.json` (code_insee → taux_global %)
   - Moyennes dept : `src/lib/taux_moyen_dept.json` (code_dept → taux_moyen %)
   - Formule : `TF = surface × RC_m2 × taux_commune`
   - **Purement déterministe** — pas d'appel IA
   - Activé quand le `code_insee` du bien est disponible (via géocodage BAN)

2. **Niveau départemental** (fallback) — `src/lib/taxeFonciereData.ts` :
   - TF/m² par département (barème statique)
   - Estimation : `estimateTaxeFonciereLocale(surface, codePostal, prix)`
   - Complété par IA + blending quand appelé via `/api/estimate-charges`

## Estimation du RC (revenu cadastral) par m²

Le RC n'est pas une donnée publique — il est estimé à partir des données
départementales : `RC_m2 = TF_EUR_M2_dept / taux_moyen_dept`.

Ce calcul brut souffre d'un **biais de covariance** : dans les départements
urbains, la moyenne simple du taux (non pondérée par la population)
sous-estime le taux réel pondéré, ce qui surestime le RC. Un **dampening
adaptatif** corrige ce biais en fonction de l'écart entre le taux communal
et la moyenne départementale :

- **Taux communal ≤ moyenne dept** (ex : Le Plessis-Trévise 34.7 % vs dept
  37.9 %) → pas de biais pour cette commune → **pas de dampening** (facteur 1.0)
- **Taux communal > moyenne dept** (ex : Marseille 47.9 % vs dept 39.9 %) →
  biais probable → **dampening proportionnel** à l'écart (facteur 0.3 à 1.0)
- **Taux communal = moyenne dept** (ex : Paris, seule commune du dept 75) →
  aucun biais possible → **pas de dampening** (facteur 1.0)
- **Sans taux communal** (fallback) → **dampening maximal** (facteur 0.3)

Constante de référence : `NATIONAL_RC_M2 = 49` (20 €/m² TF ÷ 0.41 taux
moyen national). Le dampening ne s'applique que quand `deptRC > NATIONAL_RC_M2`.

## Données (server-only)

Le module `taxeFonciereCommune.ts` et ses JSON (473 Ko) ne sont importés que
par le code serveur (API routes). Ne JAMAIS l'importer depuis un composant
client ou un fichier importé côté client — ça ajouterait 473 Ko au bundle.
Le module `taxeFonciereData.ts` (département, ~2 Ko) est importable partout.

## Fonctions exportées

- **`getTauxCommune(codeInsee)`** → taux global TFB de la commune (ou null)
- **`estimateTaxeFonciereCommune(surface, codeInsee, codePostal, prix)`** →
  estimation TF avec taux communal si disponible, sinon fallback départemental
- **`estimateTaxeFonciereLocale(surface, codePostal, prix)`** → estimation
  départementale pure (dans `taxeFonciereData.ts`)
- **`defaultQuotePartTerrain(codePostal)`** → quote-part terrain par défaut
  selon la zone (urbain 10 %, périurbain 15 %, rural 20 %)

**Migration requise** : `supabase/migrations/0005_quote_part_terrain.sql`
ajoute `quote_part_terrain_pct` (real, nullable). À exécuter dans le SQL
Editor de CHAQUE projet Supabase (prod et dev).

# Quote-part terrain (amortissement LMNP)

La simulation LMNP (`src/lib/simulation.ts`) n'utilise plus un ratio fixe
90 % bâti / 10 % terrain. Le champ `quote_part_terrain_pct` (nullable) sur
`Apartment` permet à l'utilisateur de saisir le vrai ratio (disponible sur
l'acte notarié ou l'avis d'imposition). Quand le champ est `null`, un défaut
intelligent est calculé selon la zone via `defaultQuotePartTerrain()` :
- Zone urbaine dense (Paris, Lyon, Annecy, Nice…) : **10 %** terrain
- Zone intermédiaire (villes moyennes) : **15 %** terrain
- Zone rurale / périurbaine : **20 %** terrain

Le champ est modifiable dans l'onglet « Simulation financière » (section
Fiscalité LMNP), avec une pastille « auto » quand il est en mode automatique.
Il ne part **plus** en PATCH direct à chaque frappe : il est tenu en brouillon
local le temps de l'édition et enregistré avec les hypothèses, dans le même
PATCH (voir « Lecture par défaut, édition par carte » plus bas). L'aperçu
temps réel du cash-flow est conservé — c'est le brouillon qui alimente
`simulate()`, sans rien persister.

# Analyse IA — bloc Risques et scoring DPE/GES

Le bloc "Risques" (`src/lib/analyse/blocs/risque.ts`) est 100 % déterministe,
aucun appel IA. Les données viennent de l'ADEME (DPE officiel) et Géorisques
(aléas naturels). La note /10 (10 = risque faible) combine deux sous-scores :
énergie (DPE + GES, 80 %) et géorisques (20 %).

## Pénalités DPE (perspective investisseur — loi Climat)

| DPE | Pénalité | Raison |
|-----|----------|--------|
| G   | 5 (max)  | Interdit à la location depuis 2025 |
| F   | 3.5      | Interdiction en 2028 |
| E   | 1.5      | Interdiction en 2034 |
| D   | 0.5      | Modéré, OK pour l'instant |
| C-A | 0        | Aucun risque réglementaire |

## Pénalités GES

| GES | Pénalité |
|-----|----------|
| G   | 1.5      |
| F   | 1.0      |
| E   | 0.5      |
| D   | 0.25     |
| C-A | 0        |

## Caps DPE sur la note risque

- DPE G → note risque plafonnée à **2/10** (interdit de louer)
- DPE F → note risque plafonnée à **4/10** (interdiction imminente)

Ces caps garantissent qu'un DPE catastrophique ne peut jamais être
"compensé" par de bons résultats géorisques.

## Verdicts globaux DPE (`scoring.ts`)

Indépendamment du score du bloc, le DPE déclenche des verdicts dédiés
au niveau de l'analyse globale :
- DPE G → **alerte** "DPE G — interdit à la location"
- DPE F → **alerte** "DPE F — interdiction de louer en 2028"
- DPE E → **attention** "DPE E — interdiction de louer en 2034"

Ces verdicts s'ajoutent aux verdicts "bloc faible" classiques.

### Verdicts de blocs faibles/forts (`buildVerdicts`)

Tout bloc noté ≤ 5 génère un verdict (≤ 4 = alerte, 5 = attention) avec un
libellé orienté investisseur — **jamais de score brut** dans le titre :

| Bloc | Titre (faible) | Titre (fort, ≥ 9) |
|------|----------------|-------------------|
| prix | Prix trop élevé | Prix d'achat très compétitif |
| location | Faible potentiel locatif | Forte demande locative |
| simulation | Mauvais cash-flow mensuel | Cash-flow confortable |
| potentiel | Peu de potentiel | Fort potentiel de valorisation |
| risque | Risques élevés | Profil de risque très sain |
| quartier | Quartier défavorable | Quartier attractif |

Les cartes alertes dans le verdict affichent **tous les verdicts** (critère +
bloc), triés par priorité (alerte > attention, critère > bloc), max 3.

## Plafonds globaux existants (rappel)

- Bloc risque ≤ 4/10 → score global plafonné à 4 (`computeScoreGlobal`)
- Rendement net < seuil rédhibitoire → score global plafonné à 5

Ne pas modifier ces plafonds — ils sont le garde-fou contre la dilution
d'un point rédhibitoire par la moyenne pondérée.

# Pattern CTA non-bloquant (bannière sticky)

## Estimation par champ (`estimateFieldAI`)

Chaque champ estimé (loyer, charges copro, TF, assurance) a un bouton
"Estimer avec IA" discret à côté de "Modifier". `estimateFieldAI(key)`
gère tout : pending state, appel API, mise à jour `apt`, bannière.

- **`estimatingFields`** (`Set<string>`) : un champ par estimation en cours.
  Le bouton affiche un spinner et se disable pendant l'estimation.
- **Loyer / Charges copro / TF** : appel vers `/api/estimate-rent` ou
  `/api/estimate-charges?field=...`. L'API écrase la valeur manuelle et
  bascule le champ dans `champs_estimes_ia`.
- **Assurance** : pas d'appel IA — calcul déterministe local
  (`estimateAssurance()`), puis PATCH direct avec `champs_manuels` nettoyé
  et `champs_estimes_ia` mis à jour. L'UI affiche "ESTIMATION IA" comme
  les autres (choix UX volontaire).

## Recalcul automatique (`runRecalc`)

Quand les données du bien changent (description, adresse, surface…),
`runRecalc` ré-estime automatiquement les champs impactés :

1. `computeRecalcNeeds(patch)` détermine quels champs recalculer selon les
   clés modifiées (`RENT_FIELDS`, `CHARGES_FIELDS`, `ASSURANCE_FIELDS`,
   `ANALYSIS_FIELDS`).
2. Les estimations s'exécutent séquentiellement : PATCH → loyer → charges →
   assurance → analyse IA.
3. **Les valeurs manuelles sont écrasées** : la nouvelle estimation est
   toujours prioritaire. Les champs sortent de `champs_manuels` et entrent
   dans `champs_estimes_ia`.

Flags `*Pending` (`rentPending`, `chargesPending`, `analysisPending`) :
contrôlent les skeletons des sections impactées pendant le recalcul.

## Bannière sticky (`useBanner()`)

3 phases : `saving` (accent), `success` (vert, auto-dismiss 3 s), `error`
(rouge, auto-dismiss 6 s). Utilisée par `save()`, `saveField()`,
`estimateFieldAI()`, et `runRecalc()`.

**Réutilisable** — ce pattern s'applique à tout formulaire qui doit afficher
un feedback d'enregistrement. Implémenté dans `SettingsForm.tsx` pour le
Profil investisseur : hook `useBanner()` + composant `SettingsBanner` affiche
les messages de succès/erreur à la place des simples `<span>` inactifs.

## `fireEstimation` (analyse IA uniquement)

`fireEstimation(url, msgs, setPending, onSuccess?)` reste utilisé par
`handleRelancerAnalyse`. Les re-estimations par champ utilisent
`estimateFieldAI` à la place.

# Pattern Display/Edit pour champs estimés

Les sections Location et Charges annuelles (`ApartmentDetail.tsx`) utilisent
un pattern **Display → Edit → Save/Cancel** pour les 5 champs : loyer,
charges copro, taxe foncière, assurance, frais de gestion.

## Mode Display (par défaut)

Composant `DisplayValue` : valeur affichée en gros (`text-2xl font-semibold`)
non éditable, avec :
- **Badge** : `AiEstimatedBadge` (ambre) pour les estimations IA/déterministes,
  `ManualBadge` (gris) pour les valeurs saisies manuellement, rien si null.
  Le badge `EstimatedBadge` "Estimé" (ambre également) reste utilisé sur un seul
  champ : les frais de notaire (formule déterministe). Décision produit assumée :
  `AiEstimatedBadge` et `EstimatedBadge` partagent la MÊME teinte ambre — ne pas
  les redifférencier par la couleur. En mode Display, ce badge se place à côté du
  label (voir `ReadOnlyField` avec prop `badge`), jamais collé dans la valeur.
- **Bouton "Modifier"** (icône crayon, hover accent) : passe en mode Edit.
- **Bouton "Estimer avec IA"** (icône sparkle, **ambre** — `text-amber-600`) :
  relance l'estimation
  pour ce champ uniquement. Présent sur loyer, charges copro, TF, assurance.
  Absent sur frais de gestion (paramètre utilisateur, pas un champ estimé).
- La justification IA est visible sous la valeur.

Actif quand le champ n'est PAS dans `editingFields` et PAS dans `finPatch`.
Les champs manuels (`champs_manuels`) s'affichent aussi en mode Display
(avec `ManualBadge`), plus en mode Edit comme avant.

## Mode Edit (au clic "Modifier")

Composant `EditableValue` : `NumberField` éditable avec deux boutons :
- **✓ (accent)** : enregistre la valeur (`saveField(key)`) — PATCH serveur,
  le champ passe dans `champs_manuels`, retour au mode Display avec
  `ManualBadge`.
- **✕ (gris)** : annule (`cancelField(key)`) — retire le champ de
  `editingFields` et `finPatch`, retour au mode Display sans modification.

## Frais de gestion locative

Le champ "Frais de gestion locative" (`hypothese_gestion_pct`) utilise aussi
le pattern Display/Edit avec save/cancel mais sans badge ni bouton
"Estimer avec IA" — c'est un paramètre utilisateur, pas un champ estimé.

# Profil investisseur — seuils + profil emprunteur (héritage)

`AppSettings` (`src/lib/settings.ts`, table `app_settings`, une seule ligne)
porte DEUX familles de réglages :

1. les **seuils** vert/ambre/rouge (rendement, cash-flow) ;
2. le **profil emprunteur** : `tauxCreditPct`, `dureeAnnees`, `tauxAssurancePct`,
   `tmiPct`, `financementMode`. Ce sont des propriétés de la PERSONNE, pas du
   bien — une TMI est une tranche d'imposition, elle ne peut pas varier d'un
   appartement à l'autre.

**Migration `0006_profil_emprunteur.sql` requise** — comme les autres, à exécuter
à la main sur CHAQUE projet Supabase (prod et dev). Elle ajoute les 5 colonnes et
fait table rase des 4 clés emprunteur dans `apartments.simulation_inputs`.

## Écran `SettingsForm.tsx` — DEUX cartes, pas trois

L'écran reflète les deux familles ci-dessus, une carte chacune :

1. **« Profil emprunteur »** — les 5 champs de la personne (taux, assurance,
   durée, TMI, couverture de l'emprunt).
2. **« Seuils de décision »** (`CollapsibleSection`, icône `SlidersHorizontal`) —
   les DEUX couples de seuils réunis : rendement net PUIS cash-flow mensuel,
   séparés par un `<hr className="border-t border-ink-100/50">`.

Rendement et cash-flow avaient chacun leur carte. C'était trois cartes de même
gabarit pour deux idées, et le lecteur devait deviner que les deux dernières
répondaient à la même question (« à partir de quand est-ce bon ? »). Elles sont
désormais deux **groupes** d'une seule carte, introduits par un paragraphe commun
qui explique ce que les seuils pilotent (couleur des chiffres + score global).
Ne pas les re-séparer en deux cartes.

- **`SeuilGroup`** (ex-`SeuilCard`) rend UN couple rouge/vert : `GroupHeading`,
  les deux `NumberField`, la `ZonesBar`. Ce n'est plus une carte : pas de bordure
  ni de fond propres, c'est la carte parente qui les porte.
- **Chaque champ porte son propre sous-titre** (`rougeHint` / `vertHint`) qui dit
  ce que le seuil DÉCLENCHE, pas ce qu'il vaut — « En dessous, le score global du
  bien est plafonné à 5/10 », « Au-dessus, l'opération s'autofinance ». C'est la
  seule chose que l'utilisateur ne peut pas déduire de l'écran ; les garder
  factuels et alignés sur le code (voir les plafonds de `computeScoreGlobal` et
  `cashflowTone`).
- Le `hint` de `form/Fields.tsx` ne convient PAS pour ça : il se rend **inline à
  côté du label** (c'est l'emplacement des badges type `AiEstimatedBadge`). Les
  sous-titres sont donc des `<p>` rendus sous le champ par `SeuilGroup`.
- **Repli mobile** : `CollapsibleSection` masque son contenu sous `sm:` tant que
  l'utilisateur n'a pas déplié (`hidden` + `sm:block`), et le bouton d'en-tête est
  neutralisé au-dessus de `sm:` (`sm:pointer-events-none`). Le chevron n'existe
  que sur mobile.

### `ZonesBar` — la barre nomme ses zones, la valeur est SUR la frontière

L'ancien pied de barre affichait `R 4,0 %` … `V 5,0 %` aux deux extrémités. Deux
défauts cumulés : les initiales étaient un code à déchiffrer, et une valeur collée
au bord gauche décrivait en fait une frontière située au tiers de la barre.

`ZonesBar` nomme les trois zones au-dessus (**Alerte** `red-600` / **À surveiller**
`amber-700` / **Objectif** `emerald-700`) et pose chaque seuil **centré sur la
frontière de couleur qu'il définit** (`absolute left-1/3` et `left-2/3`, chacun
`-translate-x-1/2`). C'est le sens même d'un seuil : il sépare, il ne borne pas.

C'est aussi ce qui a permis de ramener le paragraphe d'intro de la carte à une
seule ligne — la répartition des couleurs est désormais MONTRÉE, la redire en
prose faisait doublon. La barre est `aria-hidden` : elle ne fait que redessiner
des valeurs déjà lues par les deux champs et leurs sous-titres.

### Deux niveaux de titre, et AUCUNE icône « i »

| Niveau | Composant | Rendu | Exemples |
|---|---|---|---|
| Carte | `SectionHeader` (partagé) | pastille `accent-50` + CAPITALES + `ink-500` | « PROFIL EMPRUNTEUR », « SEUILS DE DÉCISION » |
| Groupe | `GroupHeading` (local) | icône `ink-400` + casse normale + `ink-800` | « Couverture de l'emprunt », « Rendement net », « Cash-flow mensuel » |

`GroupHeading` accepte `as="legend"` pour le `fieldset` de la couverture
d'emprunt — sans quoi ce titre divergeait (il était en `font-medium ink-700` face
à des `h3` en `semibold ink-800`, pour le même niveau hiérarchique). Chaque niveau
porte une phrase d'explication sous le titre : c'est la forme commune à tous les
blocs de la page.

La page n'a **plus aucun tooltip `Info`** — elle en portait trois (en-tête, profil
emprunteur, couverture). Leur contenu tenait à chaque fois en une phrase, et le
mettre derrière un survol posait trois problèmes : invisible au doigt, orphelin
visuellement (l'icône de l'en-tête flottait à l'autre bout du titre), et surtout
il cachait un **avertissement de conséquence** (« les modifier rend les analyses
obsolètes ») que l'utilisateur doit lire AVANT d'éditer, pas après avoir survolé.
Les trois phrases sont donc rendues en clair. Ne pas réintroduire d'icône « i »
sur cet écran : si une explication mérite d'être écrite, elle mérite d'être vue.

## Héritage : `resolveInputs`, point de passage unique

Dans `SimulationInputs`, les 4 champs emprunteur sont `number | null` : `null`
(ou clé absente) = **hérité du profil**. Ne JAMAIS les lire directement pour
calculer — passer par :

```ts
resolveInputs(apt.simulation_inputs, settings) → InputsResolus
```

`simulate()` consomme `InputsResolus` et ne connaît ni le profil ni l'héritage.
Ce résolveur remplace l'ancien idiome `apt.simulation_inputs ?? defaultInputs()`,
qui retombait sur des constantes codées en dur et **ignorait donc le profil**. Ne
pas le réintroduire : `defaultInputs()` ne décrit plus que la forme STOCKÉE par
défaut (tout à `null`), il ne fournit plus aucune valeur de calcul.

`null` ET `undefined` valent « hérite » — la migration SUPPRIME les clés. Utiliser
`??`, jamais `||` : un taux à 0 % est une valeur légitime.

⚠️ **Ne pas recopier le profil dans `simulation_inputs` à la création d'un bien** :
ça figerait les valeurs au moment de la saisie et un changement ultérieur du
profil ne se propagerait plus. C'est tout l'intérêt de l'héritage.

## Modes de financement

`financementMode` décide de ce que couvre l'emprunt EN MODE AUTO
(`montantEmprunte == null`) :

| Mode | Montant auto | Sens |
|---|---|---|
| `hors_notaire` *(défaut)* | prix + travaux | le notaire est couvert par l'apport — pratique bancaire courante, comportement historique |
| `cout_total` | `budget_total` | prêt dit « à 110 % » |

Un montant SAISI reste prioritaire : c'est le « montant libre », propre au bien.
Le plafond de `capitalEffectif` couvre déjà `cout_total` — ne pas le resserrer.
`SimulationResult.montantPlafonne` signale qu'un montant saisi a dû être ramené
au coût de l'opération : sans ce drapeau le plafond s'appliquait en silence.

## UI : `ChampHerite` (Simulation financière)

Miroir d'`OptionalRateField`, **sens inversé** : une hypothèse optionnelle est
absente par défaut et s'active ; un champ hérité a toujours une valeur (celle du
profil) et c'est la SURCHARGE qui s'active.

**Toujours un `NumberField`, jamais un encart en lecture seule.** Le mode hérité
affichait la valeur derrière un second bouton « Modifier », pour éviter de
laisser croire que le chiffre était stocké sur le bien. Depuis que le panneau
Hypothèses a son propre mode édition, ça faisait **deux portes à franchir** pour
taper un chiffre — on venait déjà de cliquer « Modifier » sur le panneau. Ne pas
réintroduire ce second niveau.

- hérité → champ pré-rempli avec `resolus.*` + pastille « profil » ;
- surchargé → même champ + `✕` (revenir au profil).

L'origine de la valeur est dite par la **pastille**, pas par une désactivation —
exactement comme le montant emprunté, lui aussi dérivé (pastille « auto ») ET
directement éditable depuis toujours.

Deux détails que le composant doit garder :

- **`key={herite ? "herite" : "override"}`** — vider une surcharge renvoie
  `null` (retour au profil), mais `NumberField` garde son texte local : sans ce
  remontage, le champ restait **vide** au lieu de réafficher la valeur du profil
  qui venait de reprendre effet.
- **`onChange` passe `v` tel quel.** L'ancien `v ?? 0` transformait un champ vidé
  en 0 au lieu de le rendre au profil — sur la durée, `Math.max(1, …)` le
  ramenait silencieusement à 1 an.
- Une **gouttière de 28 px** (`w-7`) est réservée au `✕` même quand il est
  absent, et le montant emprunté porte le `pr-8` équivalent : sans ça les champs
  surchargés sont plus étroits que les autres et la colonne devient irrégulière.

Les champs AFFICHENT `resolus.*` et ÉCRIVENT dans `inputs.*` — ne pas afficher
`inputs.*`, qui vaut `null` en mode hérité.

## Obsolescence d'une analyse — TROIS causes

L'analyse stockée porte deux estampilles, posées dans `run.ts` :
`AnalyseIA.settings` (instantané du profil) et `AnalyseIA.empreinteBien`
(signature des données du bien). `ApartmentDetail` en dérive un motif :

| Cause | Test | Libellé du bandeau |
|---|---|---|
| Le code a changé | `version < ANALYSE_VERSION` | « L'algorithme d'analyse a évolué… » |
| Les données du bien ont changé | `empreinteBien(apt) !== analyse.empreinteBien` | « Les données du bien ont changé… » |
| Le profil a changé | `!memeProfil(analyse.settings, settings)` | « Ton profil investisseur a changé… » |

L'ordre de priorité est celui du tableau — la version invalide tout, puis vient
le geste le plus fréquent. Un bandeau qui dit « relance » sans nommer la cause
n'aide pas à décider : garder les trois libellés distincts.

### Pourquoi une EMPREINTE et pas `ANALYSIS_FIELDS`

`ANALYSIS_FIELDS` (`ApartmentDetail`) répond à une autre question — « faut-il
relancer AUTOMATIQUEMENT après cette édition ? » — et ne pouvait pas combler ce
trou, pour deux raisons cumulées :

1. **Sept champs** nourrissent le score sans y figurer : `loyer_retenu`,
   `charges_copro_annuelles`, `taxe_fonciere`, `assurance_annuelle`,
   `hypothese_gestion_pct`, `quote_part_terrain_pct`, `simulation_inputs`.
2. Surtout, ils sont enregistrés par **`saveField`** et
   **`SimulationFinanciere.handleSaveInputs`**, deux chemins qui font un PATCH
   direct et **ne consultent jamais `computeRecalcNeeds`**. Les y ajouter
   n'aurait donc rien déclenché du tout.

L'empreinte attrape toute modification quel que soit l'écran d'origine. Elle ne
relance rien : elle SIGNALE, l'utilisateur décide. C'est volontaire — relancer
une analyse coûte un appel LLM, on ne le déclenche pas à chaque ajustement de
TMI.

`empreinteBien` (`analyse/types.ts`) sérialise `CHAMPS_EMPREINTE` **clés triées**
pour `simulation_inputs`, pas via `JSON.stringify` — même leçon que `memeProfil`,
l'ordre des clés d'un objet reconstruit n'est pas garanti. Ajouter un champ à
`CHAMPS_EMPREINTE` invalide automatiquement les analyses antérieures.

`memeProfil` compare de même **champ par champ** à partir des clés de
`DEFAULT_SETTINGS`. Corollaire volontaire : tout nouveau champ ajouté à
`AppSettings` invalide les analyses, sans code supplémentaire.

`ANALYSE_VERSION` est passée à **6** : les analyses antérieures n'ont ni
`settings` ni `empreinteBien` et sont marquées obsolètes par le test de version.

## Où circulent les settings

Pas de provider global : `layout.tsx` est un composant serveur SYNCHRONE, le
rendre `async` pour y charger les réglages rendrait TOUTES les pages dynamiques.
Ils sont passés en props depuis `appartements/[id]/page.tsx` → `ApartmentDetail`
→ `AnalyseIA` / `OptimiserView` / `SimulationFinanciere`, et jusqu'au popup de
cash-flow via `openCashflowDetail(apt, seuils, settings)` — même convention que
les seuils, déjà passés par l'appelant.

`rowToSettings` (`db.ts`) retombe sur `DEFAULT_SETTINGS` champ par champ si les
colonnes 0006 sont absentes : sans ce filet, lancer l'app avant d'avoir appliqué
la migration propagerait des `undefined` jusque dans `simulate()`, donc des `NaN`
partout. La LECTURE dégrade proprement ; l'ÉCRITURE échoue avec un message
explicite tant que la migration n'est pas passée.

# Simulation financière — ENTRÉES en gris, RÉSULTATS en blanc

Règle de lecture de tout l'onglet : **ce qu'on saisit est gris (`bg-ink-50`), ce
que la simulation produit est blanc.** Avant, entrées et résultats partageaient
la carte blanche et le même poids visuel, et rien ne disait où s'arrêtaient les
hypothèses ni où commençait la réponse.

Surtout, les entrées étaient dispersées en **trois endroits** — carte « Crédit
immobilier », carte « Fiscalité », et une rangée de boutons au-dessus du tableau
année par année — chacun présenté comme une section à part entière.

## Deux sections collapsibles : Financement + Hypothèses

Les entrées sont séparées en deux sections collapsibles distinctes :

1. **Financement** — icône `Landmark`, accent. Hero mensualité toujours visible
   + pills (Crédit %, durée, Apport). Corps dépliable : **Crédit immobilier**
   (montant emprunté, taux, durée, assurance) + **Apport personnel**. Bouton
   « Modifier » ouvre le mode édition crédit (`editingId === "credit"`).
2. **Hypothèses** — icône `SlidersHorizontal`, neutre. Pills toujours visibles
   (LMNP au réel, TMI, projections actives). Corps dépliable : **Fiscalité**
   (régime, TMI, quote-part terrain) + **Projection** (les quatre hypothèses
   optionnelles) en 2 colonnes. Bouton « Modifier » ouvre le mode édition
   hypothèses (`editingId === "hypotheses"`).

Chaque section porte sa propre bordure `accent-300` en édition (`ink-200`
sinon), son propre « Annuler / Enregistrer » et un « Réinitialiser » si des
surcharges existent. Les deux partagent le même `persist()` et le même
`snapshot` d'annulation.
- **`HypRow`** rend une ligne en lecture. La pastille d'origine (`profil`,
  `auto`) est collée à la VALEUR, à droite, jamais après le libellé : quand elle
  suivait le libellé, elle poussait le montant hors de la ligne, qui passait à
  deux lignes et cassait l'alignement de la colonne.
- Une hypothèse de projection désactivée affiche **« — »**, elle n'est pas
  masquée : « aucune revalorisation supposée » est une information, pas une
  absence.
- **`snapshot`** est la copie d'`inputs` prise à l'ouverture de l'édition ;
  c'est elle qui rend « Annuler » possible. Il n'existait pas : on éditait en
  direct et le seul retour en arrière était de retaper les valeurs de mémoire.
- **L'aperçu reste vivant pendant l'édition** : coût du crédit, amortissements
  et tableau se recalculent à la frappe. C'est ce qui rend la saisie utile.
  Rien n'est persisté pour autant.
- **Le mode d'emploi de la saisie** (« vide le champ pour repasser en auto »)
  n'est rendu **qu'en édition**. En lecture il occupait quatre lignes pour
  expliquer un geste que l'utilisateur n'était pas en train de faire.

## Régime fiscal — champ DÉCLARATIF, pas encore un levier de calcul

`SimulationInputs.regimeFiscal` (`RegimeFiscal | null`, `null` = défaut) est
proposé dans la section Hypothèses (colonne Fiscalité). Les libellés viennent de
**`REGIMES_FISCAUX`** (`simulation.ts`), seule source : la liste d'options de
l'UI en est dérivée (`Object.keys`), ajouter une entrée suffit à la proposer.

⚠️ **`simulate()` ne lit pas encore ce champ** — il calcule en LMNP réel quelle
que soit sa valeur. Ajouter un régime à `REGIMES_FISCAUX` le fera donc
apparaître dans le menu **sans rien changer aux chiffres**, ce qui serait un
mensonge à l'écran. Un nouveau régime demande de brancher `simulate` :
amortissements, assiette imposable, prélèvements sociaux, report de déficit.

Aujourd'hui un seul régime est géré, donc le `<select>` n'a qu'une option. Il
est rendu comme un choix quand même — c'en est un — avec un `hint` « seul régime
géré » qui dit l'état réel plutôt que de laisser croire à un menu incomplet.

Le champ est `.optional()` dans `simulationInputsSchema` (comme
`vacanceLocativePct`) : les biens enregistrés avant son ajout n'ont pas la clé,
et un `simulation_inputs` incomplet ne doit pas faire échouer tout le PATCH. Zod
la normalise à `null` au premier enregistrement. Conséquence attendue : cette
normalisation modifie `simulation_inputs`, donc `empreinteBien`, donc l'analyse
du bien est signalée obsolète une fois.

## Les trois états d'une hypothèse, et « Réinitialiser »

Chaque ligne du panneau est dans l'un de trois états, dont **deux seulement
portent une pastille** :

| État | Pastille | Sens |
|---|---|---|
| Hérité | `profil` | `null` sur le bien → vient du Profil investisseur (`resolveInputs`). Change pour TOUS les biens quand le profil change. Concerne taux, durée, assurance, TMI. |
| Dérivé | `auto` | `null` → calculé depuis les données de CE bien. Montant emprunté = prix + travaux selon `financementMode` ; quote-part terrain = zone du code postal (`defaultQuotePartTerrain`). |
| **Fixé à la main** | *aucune* | L'utilisateur a saisi la valeur : elle ne suit plus rien. |

Les deux pastilles ne sont **pas redondantes** — elles pointent vers deux
endroits différents où aller corriger (les Paramètres, ou les données du bien).
Ne pas les fusionner en un « défaut » unique, ça perdrait cette indication.

En revanche le troisième état, le seul qui résulte d'une décision, n'est **pas**
signalé — il se déduit par ABSENCE de pastille. Une troisième pastille aurait
étiqueté presque toutes les lignes ; c'est donc le bouton **« Réinitialiser »**
de l'en-tête qui le rend actionnable.

- **`compterSurcharges()`** compte les lignes sans pastille. Le compte ne
  s'affiche PAS dans le libellé (« Réinitialiser (3) » a été essayé puis
  retiré) : il ne sert qu'à décider si le bouton existe.
- Le bouton n'apparaît **que si le compte est > 0** — sinon il n'aurait rien à
  faire, et un bouton inerte est pire qu'absent.
- Survol en **`ink-600`, pas en rouge**. Le rouge de la charte est réservé aux
  vraies suppressions ; ici on rend des valeurs à leur défaut, et c'est la modale
  de confirmation qui porte le poids de l'action. Ne pas le « corriger » vers
  `red-*` en lisant la charte au premier degré.
- `regimeFiscal` stocké à `REGIME_FISCAL_DEFAUT` n'est PAS compté : ça vaut la
  même chose que `null`, le compter ferait apparaître le bouton alors que rien
  à l'écran ne justifierait sa présence.
- La réinitialisation est **exactement `defaultInputs()`** + `quote_part_terrain_pct: null`.
  Toute la convention du modèle étant déjà « `null` = valeur par défaut », il n'y
  a aucune logique de remise à zéro à écrire — ne pas en ajouter une.
- Elle passe par `ConfirmDialog` en mode `destructive` (bouton rouge, focus
  initial sur « Annuler ») : elle jette des valeurs saisies, et elle touche AUSSI
  les hypothèses de projection, ce que la description de la modale doit continuer
  de dire explicitement.
- `persist()` prend son `payload` en **argument** et ne le lit pas dans l'état :
  la réinitialisation appelle `setInputs` puis `persist` dans la foulée, et
  l'état ne serait pas encore à jour au moment de construire la requête.

## Les cartes blanches ne contiennent PLUS aucun champ

« Coût du crédit » (mensualité hors assurance, assurance, coût total, apport),
« Détail mensuel — année 1 », « Fiscalité — LMNP au réel » (amortissements seuls,
la TMI et la quote-part sont remontées dans le panneau), « Cash-flow année par
année », « Financement du projet », « Évolution du patrimoine » : toutes sont des
résultats purs. Vérifiable d'une ligne — hors panneau Hypothèses, l'onglet ne
doit contenir aucun `input` ni `select`. Ne pas y réintroduire de saisie « au
plus près de la donnée » : c'est exactement ce qui avait produit les trois zones
d'entrée dispersées.

Les montants du bloc « Coût du crédit » portent chacun leur HORIZON, parce qu'il
en mélange trois : deux mensuels, un cumul sur toute la durée du prêt, et un
versement unique au départ. Sans ces qualificatifs, le cumul sur 25 ans contamine
la lecture de l'apport, qu'on croit alors étalé lui aussi.

## Un seul point d'enregistrement : `persist()`

L'onglet écrivait par DEUX chemins concurrents — `simulation_inputs` via la
bannière « Hypothèses modifiées » en haut de page, et `quote_part_terrain_pct`
en PATCH immédiat à chaque frappe via une prop `onPatchApartment`. Deux modèles
mentaux dans le même écran, dont un non annulable.

`persist(extra?)` est désormais le passage unique : **un PATCH, une réponse, un
`onSaved`**. La quote-part voyage dans le même corps de requête quand elle a
changé. Ne pas revenir à deux requêtes enchaînées : la seconde repartait de
l'`apartment` capturé au rendu précédent et réécrasait localement les
`simulation_inputs` tout juste enregistrés, jusqu'à ce que la réponse serveur
remette tout d'aplomb. `onPatchApartment` a été supprimée de
`SimulationFinanciere` ET de `ApartmentDetail`.

La bannière globale ne s'affiche plus que si `dirty && editingId === null` :
quand une carte est ouverte, c'est SON pied qui porte « Enregistrer ». Elle
reste indispensable pour les hypothèses du tableau année par année, qui
s'éditent en ligne (`OptionalRateField`) sans passer par une carte.

# Simulation financière — hypothèses optionnelles

L'onglet "Simulation financière" (`SimulationFinanciere.tsx`) expose des
hypothèses optionnelles désactivées par défaut (valeur `null` = hypothèse
prudente). Chacune se présente sous forme d'un bouton "+" (dashed border)
qui, au clic, active l'hypothèse avec une valeur par défaut.

| Hypothèse | Champ (`SimulationInputs`) | Défaut | Suffix | Effet |
|---|---|---|---|---|
| Revalorisation du bien | `revalorisationBienPct` | 1 % | %/an | Patrimoine uniquement (pas le cash-flow) |
| Revalorisation du loyer | `revalorisationLoyerPct` | 1 % | %/an | Loyer revalorisé chaque année (compound) |
| Indexation charges | `indexationChargesPct` | 2 % | %/an | Copro + TF indexées (compound) |
| Vacance locative | `vacanceLocativePct` | 5 % | % du loyer | Réduit les loyers effectifs (cascade sur gestion, impôt, cash-flow) |

Le composant `OptionalRateField` gère l'UI : bouton "+" quand `null`,
`NumberField` + bouton "✕" quand actif. Le prop `suffix` permet de varier
le libellé ("%/an" vs "% du loyer").

La vacance locative s'applique comme facteur multiplicatif
`(1 - vacanceLocativePct / 100)` sur les loyers annuels dans la boucle
année par année (`simulation.ts`). Cela cascade automatiquement sur les
frais de gestion (% du loyer), le résultat imposable, et le cash-flow.

# Onglet "Analyse" — fusion Synthèse + Analyse IA

L'ancien onglet "Synthèse" et l'ancien onglet "Analyse IA" ont été fusionnés en
un seul onglet **"Analyse"** (`src/components/AnalyseIA.tsx`), premier onglet et
onglet par défaut (tab key `"ia"`). `?tab=synthese` redirige vers `"ia"` pour
rétrocompatibilité.

`SyntheseView.tsx` a été **supprimé** : il n'était plus importé nulle part depuis
la fusion, mais gardait sa propre copie de `computeDecision` et un seuil de
cash-flow codé en dur — deux sources de dérive prêtes à repartir si quelqu'un
l'avait réutilisé. Ne pas le recréer.

## Layout (de haut en bas)

1. **Carte verdict** — dégradé tonal (`from-white to-{emerald|amber|red}-50`),
   score global à droite dans une jauge circulaire (`VerdictGauge`, anneau épais
   100px, stroke 8), titre verdict en Fraunces (`text-4xl` / `sm:text-5xl`),
   raison actionnable (jamais de score brut — libellé orienté investisseur),
   puis ligne de sous-scores par bloc (couleurs `noteTone()` :
   `emerald-700` / `amber-700` / `red-600`), puis cartes alertes/attention
   (critère ET bloc, triées alerte > attention, critere > bloc, max 3).
2. **MetricCards** — 4 cartes (Cash-flow, Rendement net, Prix au m², DPE) en
   grille, avec emphase conditionnelle sur négocie/passe.
3. **Bloc synthèse** — narration IA sur fond `bg-ink-100/40`.
4. **Sections plates** (`FlatSection`) — séparées par des `<hr>`, chaque bloc
   d'analyse (Prix, Locatif, Risques, Potentiel, Simulation) avec note, verdicts,
   highlights, faits, et narration.

## Verdict (décision à 3 niveaux)

`computeDecision(score, verdicts, ecartPct)` → `"achete"` | `"negocie"` | `"passe"` :
- **passe** si un verdict `alerte` existe OU `score < 5` ;
- **achète** si `score >= 7` ET aucun verdict `attention` ET pas de surcote
  (`ecartPct <= 5`) ;
- **négocie** sinon.

`DECISION_STYLES` (`AnalyseIA.tsx`) porte l'habillage de la CARTE verdict :

| Prop        | Achète          | Négocie         | Passe          |
|-------------|-----------------|-----------------|----------------|
| Dégradé     | white→emerald-50 | white→amber-50 | white→red-50   |
| Border      | emerald-200     | amber-200       | red-200        |
| Titre       | emerald-900     | amber-900       | red-900        |
| Caption     | emerald-700     | amber-700       | red-700        |
| Gauge track | emerald-100     | amber-100       | red-100        |

Le trait et le chiffre de la jauge ne sont PAS ici : ils viennent de
`DECISION_RING_STYLES` (`scoring.ts`), partagé avec l'anneau de l'accueil — voir
« Anneaux de score » plus haut. Un champ `score` (`text-emerald-700`…) existait
dans cette table sans jamais être lu : supprimé.

## MetricCards — tonalité des valeurs

Couleur de la valeur : `METRIC_VALUE_CLASS` — `positif` = `text-emerald-700`,
`attention` = `text-amber-700`, `alerte` = `text-red-600`, `neutral` =
`text-ink-900`. Tags d'emphase (négocie/passe uniquement) : `Rédhibitoire`
(`bg-red-100 text-red-700`) ou `À négocier` (`bg-amber-100 text-amber-700`).

## VerdictGauge (jauge circulaire)

Anneau épais (Option B) : `GAUGE_SIZE=100`, `GAUGE_STROKE=8`, score en
Geist Mono 30px bold, centré avec `dominantBaseline="central"`. Couleur du
score via `fill-*` classes (pas `text-*` — SVG utilise `fill`).

## Navigation vers la bonne section (ancres)

`goToSection` dans `ApartmentDetail.tsx` : change d'onglet,
`router.push(?tab=…, {scroll:false})`, puis scrolle vers l'`id` via polling
`requestAnimationFrame` + repasse à 250/650 ms.

Ancres cibles (avec `scroll-mt-24`) :

| CTA | Onglet | Ancre (`id`) | Fichier de l'ancre |
|---|---|---|---|
| Rendement net | Détails de l'opération | `fin-resultats` | `ApartmentDetail.tsx` |
| Prix vs marché | Analyse | `bloc-prix` | `AnalyseIA.tsx` (`FlatSection`) |
| Prix au m² (fallback) | Détails de l'opération | `fin-achat` | `ApartmentDetail.tsx` |
| DPE | Analyse | `bloc-risque` | `AnalyseIA.tsx` (`FlatSection`) |

**Le cash-flow ne navigue plus** : la MetricCard « Cash-flow mensuel » et les
deux highlights du bloc Simulation (« — année 1 », « moyen ») ouvrent le
panneau latéral `CashflowDetailPanel` (`useCashflowDetail`), comme le fait
l'onglet Optimiser. Même geste que le rendement net, qui ouvre déjà
`RendementDetailPanel` — un chiffre clé se détaille sur place, il ne renvoie
pas vers un autre onglet. Les libellés des highlights sont fabriqués par
`blocs/simulation.ts` : `HIGHLIGHTS_CASHFLOW` (`AnalyseIA.tsx`) doit rester
synchronisé avec eux.

# Onglet "Optimiser" — recommandations prescriptives (lecture seule)

L'onglet **"Optimiser"** (`src/components/OptimiserView.tsx`, 2e onglet, après
Analyse) est orienté **DÉCISION + RENTABILITÉ, pas le score**. Deux modes
selon le verdict actuel (Achète / Négocie / Passe) :

- verdict ≠ **Achète** → « En faire un achat » : les actions pour faire basculer
  le verdict à « Achète ».
- verdict = **Achète** → « Acheter mieux » : comment augmenter la rentabilité.

**Purement informatif : ne modifie JAMAIS le bien réel** (prix, loyer, dpe,
score, verdicts intacts).

## Un levier à la fois (`SelecteurLevier`)

L'écran affiche **UN SEUL levier**. Ce n'est PAS un écran de comparaison : le
moteur a déjà classé les leviers (prix en tête, financement en dernier) et la vue
d'ensemble vit dans l'onglet **Analyse**. Empiler les quatre leviers en cartes
répétait quatre fois le même gabarit et repoussait les arguments derrière un
clic — ne pas y revenir.

La sélection passe par un **contrôle segmenté** (`SelecteurLevier`) : compact,
aligné à gauche, fond `ink-100` avec pastille blanche active, **rendu DANS le
bandeau `accent-50` du levier**. État local (`actif`), jamais dans l'URL.

**Ne pas en refaire une barre d'onglets soulignée pleine largeur** : la page
porte déjà une navigation par onglets, et deux barres de même forme à deux
niveaux de hiérarchie se lisaient comme une double navigation. Elles ne se
comportent d'ailleurs pas pareil — les onglets de page sont des liens qui
changent l'URL, celui-ci est un état local ; leur ressemblance était donc aussi
un mensonge sur le comportement. Il garde `role="tablist"` / `aria-selected`
(c'est bien un sélecteur de panneaux), et défile horizontalement sur mobile.

Les segments ne portent **que** l'icône et le libellé du levier — **pas de badge
« Achète »**. Un badge vert sur un segment le faisait ressembler à un état
gagné, alors que le sélecteur ne sert qu'à choisir le panneau à lire ; et il
répétait une information que le panneau lui-même porte déjà (verdict projeté,
chiffres avant/après). `flipVersAchat` reste utilisé, mais **par le moteur
seul** — porte de matérialité et tri — plus par l'UI. Ne pas le réintroduire
dans le sélecteur.

Ordre de lecture imposé, à ne pas réarranger :

1. **L'action à faire** — `reco.action`, en titre.
2. **Les chiffres impactés** — cartes `avant → après` (`buildPairs`).
3. **Les arguments** — preuves puis méthode.

Les points 1 et 2 vivent dans **une seule section** (le bandeau `accent-50`) :
l'action et son impact se lisent d'un bloc. Ne pas les redécouper en deux zones.

### Le chiffre pivot est PORTÉ PAR LE TITRE

Le pivot est le chiffre que l'investisseur **contrôle** : le prix qu'il annonce
au vendeur, le loyer qu'il affiche, le budget qu'il fait chiffrer, l'apport qu'il
vire. **Jamais une conséquence** (rendement, cash-flow) : celles-ci se constatent,
elles ne s'exécutent pas. Un pivot fixe sur le cash-flow mettrait mécaniquement le
levier financement en tête — or c'est le levier d'appoint, et le cash-flow mesure
le levier de crédit, pas la qualité de l'actif.

**Il n'y a pas de carte pivot** : `reco.action` porte le chiffre (« Négocie à
272 800 € »), donc une carte à côté aurait répété le titre mot pour mot. Les
`action` du moteur ne contiennent **que** ce chiffre — ne pas y remettre
« — soit −X % (Y de moins) », qui redisait la même chose deux fois de plus.

Autour du titre, en second plan et sans jamais répéter la cible :
- la **pastille d'écart** (`−12 %`, `+15 %`) collée au titre ;
- une ligne de contexte « Prix affiché 310 000 € · {pourquoi} ».

`buildPivot` ne fournit donc que ce contexte (`label`, `avant`, `delta`), pas la
valeur cible. Il renvoie `null` pour travaux et financement : leur montant est une
grandeur sèche, déjà dans le titre, et il n'existe pas de valeur « avant ».
La métrique portée par le titre est exclue des cartes (pas de répétition).

### Bandeau d'alerte

Le `caveat` s'affiche en bandeau sous les chiffres. Rouge **uniquement** si
`caveatBloquant` est vrai (frein rédhibitoire nommé), ambre sinon. Sans ce
drapeau, une réserve du type « coût estimé, à affiner avec des devis » serait
peinte comme un blocage. `pourquoi` (ce que le levier apporte) et `caveat` (la
réserve) ne doivent jamais se recouvrir — ils sont rendus à deux endroits.

## Verdict = source unique (`src/lib/analyse/decision.ts`)

`computeDecision(score, verdicts, ecartPct)` est la SEULE définition du verdict
Achète/Négocie/Passe, partagée par `AnalyseIA`, `OptimiserView` et le moteur
de recommandations (avant, chacun le recalculait à la main → risque de dérive).
`ecartPrixMarche(prixBloc)` extrait l'écart au marché du bloc Prix — avec une
garde sur `.faits`, absent des analyses stockées dans un schéma antérieur.

## Moteur (`src/lib/analyse/recommandations.ts`)

`buildRecommandations(apt, ctx)` est appelé **dans `runAnalyse`**, au moment où
toutes les données externes (DVF, ANIL, DPE, géorisques, settings) sont en
portée. Chaque projection ré-invoque les **VRAIES fonctions de blocs** sur une
**COPIE modifiée** du bien (`computeDerived({ ...apt, prix: X })`), puis
`computeScoreGlobal` + `buildVerdicts` + `computeDecision` pour le verdict
projeté. Même moteur déterministe, mêmes données, zéro chiffre inventé, zéro
appel réseau/LLM. On ne mute jamais `apt`. Rangé dans le champ **lecture seule**
`AnalyseIA.recommandations` (nullable).

**Versioning** : `ANALYSE_VERSION = 4`. Analyses antérieures (`recommandations ==
null`) → l'onglet invite à « Relancer ». `== []` → « rien de plus à optimiser »
(positif). Les champs ajoutés en v4 (`montantEngage`, `Argument.chiffre`) sont
optionnels : une analyse v3 s'affiche sans pivot sur travaux/financement et sans
colonne de chiffres, sans casser (dégradation silencieuse, pas d'invite).

## Les 4 leviers (ordre d'affichage FIXE : prix en tête, financement en dernier)

| Levier | Cible prescriptive | Affiché si |
|---|---|---|
| **prix** | prix EXACT à négocier pour basculer à « Achète » (dichotomie sur le prix, décision monotone). Si un frein hors-prix (ex. DPE F, alerte) bloque, on le nomme et on chiffre quand même une négociation utile à la rentabilité. En mode « acheter mieux » : médiane DVF ou −8 %. | toujours (prix + surface connus) |
| **travaux** | DPE→D, loyer premium +12 % (`LOYER_BOOST_RENO`), coût ~350 €/m² (`COUT_RENO_M2`) | DPE ∈ {E,F,G} |
| **loyer** | haut de fourchette ANIL, borné à une hausse réaliste **+15 %** (`LOYER_UPLIFT_MAX`) — un loyer ne bondit pas de +40 % d'un coup | loyer actuel < cible |
| **financement** | apport pour cash-flow moyen ≥ 0 (dichotomie sur `montantEmprunte`) | cash-flow moyen < 0 & atteignable |

La colonne « Affiché si » ci-dessus ne dit que la **faisabilité** (ce levier
a-t-il un sens sur ce bien ?). Elle ne suffit pas — voir la porte de matérialité
juste en dessous.

## Porte de matérialité (`estMateriel`) — une reco doit RAPPORTER

Les gardes internes de chaque `buildLevier*` portent toutes sur l'ENTRÉE
(« la hausse de loyer dépasse-t-elle 2 % ? », « l'apport dépasse-t-il 500 € ? »)
et jamais sur le RÉSULTAT. Un levier pouvait donc franchir sa garde sans rien
apporter — cas réel observé : **1 662 € d'apport pour +9 €/mois** de cash-flow.
Arithmétiquement exact, sans intérêt à proposer : ça occupe l'écran et dilue les
leviers qui comptent.

`estMateriel(reco)` (`recommandations.ts`) s'applique en **UN seul endroit**, sur
les quatre leviers réunis, juste avant le tri. Faisabilité et intérêt sont deux
questions distinctes — d'où deux endroits — mais l'intérêt n'a qu'une définition.

Une reco est retenue si **l'une** de ces conditions tient :

| # | Condition | Pourquoi cette échappatoire |
|---|---|---|
| A | `flipVersAchat` | Change la décision d'achat : décisif par définition, quelle que soit l'ampleur des chiffres. |
| B | levier `travaux` | Ne se déclenche que sur DPE E/F/G. Sa valeur est **réglementaire** (G interdit à la location, F en 2028) et ne transite pas par le cash-flow. Un bien qu'on ne peut plus louer ne se juge pas au retour sur trésorerie. |
| C | levier `prix` et remise ≥ **5 %** (`BAISSE_PRIX_MIN_PCT`) | La remise EST la valeur. Sans ça, un bien sans `loyer_retenu` (rendement et cash-flow nuls) verrait le levier central disparaître. |
| D | Δcash-flow ≥ **25 €/mois** (`GAIN_CASHFLOW_MIN`) **ou** Δrendement ≥ **0,25 pt** (`GAIN_RENDEMENT_MIN`) | La barre chiffrée générale. |

Et, **en plus de D**, si le levier immobilise de la trésorerie
(`montantEngage > 0`) : le gain doit payer la mise —
`Δcash-flow × 12 / montantEngage ≥ 3 %` (`RETOUR_CAPITAL_MIN`). Sans cette
seconde condition, « immobilise 50 000 € pour gagner 30 €/mois » (0,7 %/an)
passerait la barre absolue tout en étant un mauvais emploi de trésorerie.

⚠️ **Ne pas soumettre `travaux` à la barre chiffrée** en croyant harmoniser : sa
rentabilité cash-flow est souvent mauvaise à court terme alors que sa valeur
(rendre le bien louable) est la plus élevée des quatre leviers.

## Arrondis des cibles (`arrondiLisible`)

Une cible prescriptive est une consigne qu'on répète à un vendeur ou qu'on vire
à un notaire. « Négocie à 272 800 € » ne se retient pas et affiche une précision
que le chiffre n'a pas : il sort d'une dichotomie, pas d'un relevé. Les quatre
cibles chiffrées (prix, loyer, travaux, apport) passent donc par
`arrondiLisible(n, sens)`.

Pas selon l'ordre de grandeur (`pasArrondi`) — 10 000 € conviendrait à un prix
d'achat et serait absurde sur un loyer :

| Montant | Pas | Exemple |
|---|---|---|
| ≥ 100 000 | 10 000 | 272 800 → 270 000 |
| ≥ 20 000 | 1 000 | 23 800 → 24 000 |
| ≥ 2 000 | 100 | 8 750 → 8 800 |
| ≥ 200 | 10 | 1 583 → 1 580 |
| < 200 | 5 | |

⚠️ **Le SENS de l'arrondi n'est pas cosmétique, il protège la promesse** :

- **`"bas"` — ce qu'on espère OBTENIR** (prix négocié, loyer visé). Le prix cible
  est le plus HAUT qui bascule encore à « Achète » : arrondir vers le haut
  casserait cette garantie. Le loyer cible est déjà borné au haut de fourchette
  ANIL et au plafond de hausse réaliste — deux maxima, que l'arrondi supérieur
  ferait franchir.
- **`"haut"` — ce qu'il faut ENGAGER** (travaux, apport). L'apport est le
  MINIMUM qui ramène le cash-flow à l'équilibre : l'arrondir vers le bas
  repasserait sous l'équilibre et rendrait le titre faux. Un budget travaux
  sous-estimé est le même piège.

Ne pas « harmoniser » les quatre sur un `Math.round` : les deux directions sont
choisies, pas héritées.

Deux conséquences à respecter en modifiant le moteur :

- **Arrondir AVANT de dériver.** Dans le levier prix, la cible est arrondie au
  tout début de `carte()`, avant `blocsAtPrice` : le patch, les arguments, le
  prix/m² et le cash-flow affichés doivent décrire le prix réellement annoncé.
  Sinon l'écran promet un impact calculé sur un prix qui n'est plus au titre.
- **Redériver ce qui dépend du montant arrondi.** Côté financement,
  `montantCible` est recalculé depuis l'apport arrondi
  (`capitalActuel − apportSupp`), pas l'inverse.

**Tout filtrer est un état valide** : `recommandations === []` affiche déjà
« Rien de plus à optimiser » (positif) ou « Pistes indisponibles ». Ce n'est pas
un cas à contourner.

⚠️ Comme les recos sont **persistées**, les biens analysés avant ce changement
gardent leurs leviers non-matériels jusqu'à la prochaine relance d'analyse.

- **Ordre** : `[prix, ...milieu, financement]`. Le prix est TOUJOURS en tête
  (levier central), le financement TOUJOURS en dernier (levier d'appoint, pas une
  vraie optimisation). Seuls travaux + loyer (`milieu`) sont triés entre eux
  (flip-vers-achat puis cash-flow décroissant). Ne pas remettre le financement
  dans le tri.
- **Métriques (avant → après)** : rendement net + cash-flow partout ; le prix
  ajoute prix/m² ; travaux ajoute le loyer. Portées par des champs optionnels de
  `Recommandation` (`prixAchatAvant/Apres`, `prixM2*`, `loyer*`, `montantEngage`)
  rendus par `buildPivot` (le chiffre piloté) et `buildPairs` (les conséquences)
  dans `OptimiserView`. Les cartes reprennent le style de l'app : bordées,
  libellé en capitales, suffixe « · détail » sur rendement et cash-flow.
- **Emprunt qui suit l'opération** : négocier le prix baisse le montant emprunté
  (apport constant, `inputsAtPrice`) ; les travaux sont FINANCÉS (emprunt
  `loanAvant + coutTravaux`). Sinon, à emprunt figé, baisser le prix (ou ajouter
  des travaux) fausserait le cash-flow (amortissement/impôt qui bougent sans que
  la mensualité suive). `loanAvant` est hoisté pour les deux leviers. Le coût des
  travaux pèse donc sur le rendement (via `budget_total`) ET sur le cash-flow (via
  mensualité + amortissement). Les frais de notaire sont recalculés depuis le
  nouveau prix par `applyLiveEstimates` (sauf si saisis manuellement).
- **`cashflowOf` utilise `mod.simulation_inputs`** (pas les inputs d'origine) —
  sinon financement/travaux afficheraient un cash-flow ignorant l'emprunt modifié.
- **Sous-titre honnête** : si aucun levier ne fait basculer à « Achète »
  (`recos.some(r => r.flipVersAchat) === false`), le sous-titre le dit au lieu de
  promettre un achat.

## Popups de détail (rendement + cash-flow) & couleurs profil

- **Blocs Rendement net / Cash-flow cliquables** : ouvrent une popup latérale de
  détail du calcul **recalculée avec les valeurs proposées**. Chaque reco stocke
  un champ **`patch`** (`RecommandationPatch` : les overrides EXACTS appliqués —
  prix, loyer, dpe, travaux, `simulation_inputs`). Le client reconstruit le bien
  modifié via `computeDerived({ ...apt, ...reco.patch })` (COPIE, jamais
  persistée) et le passe à `openRendementDetail` / `openCashflowDetail`. Ne pas
  reconstruire le patch à la main côté client (dérive) — le moteur le stocke.
- **`CashflowDetailPanel` / `CashflowDetailProvider`** : nouveau popup, calqué
  sur `RendementDetailPanel`, monté dans `layout.tsx`
  (`RendementDetailProvider > LoyerDetailProvider > CashflowDetailProvider`).
  Rejoue `simulate()` et affiche financement + flux mensuels moyens.
- **Couleurs = seuils du profil investisseur** : rendement via
  `rendementNetTone(v, seuilsRendement)`, cash-flow via `cashflowTone(v,
  cashflowSeuils)` (nouveau, dans `scoring.ts` — mêmes seuils que le bloc
  Simulation). `cashflowSeuils` = `{ vert: settings.cashflowSeuilVertEuros,
  rouge: settings.cashflowSeuilRougeEuros }`, passé par `ApartmentDetail`. Un
  cash-flow de −60 € est donc VERT si le seuil vert du profil est −100.
  **L'ancienne valeur (avant) reste TOUJOURS grise** (`text-ink-400`, référence
  neutre) ; seule la nouvelle valeur proposée porte la couleur du profil. Les
  prix/loyer (pas de seuils profil) restent directionnels côté après (baisse/
  hausse = vert).

## Arguments par levier — preuves et méthode

Chaque reco porte **`arguments?: Argument[]`** (`{ titre, detail, source?,
chiffre?, chiffreLabel? }`). Ils sont **toujours visibles** dans le panneau du
levier (pas d'accordéon : les cacher revenait à enterrer ce que l'écran est
censé fournir), en **deux sections** :

- **Les faits** — arguments portant une `source`. Adossés à une donnée réelle
  donc opposables à l'interlocuteur. Le `chiffre` est extrait dans un **badge à
  fond `ink-50`** (alignement d'un fait à l'autre — c'est tout l'intérêt de le
  sortir de la phrase), avec `chiffreLabel` en légende. Pas de trait vertical
  séparant le badge du texte — la forme du badge suffit à le détacher, un
  diviseur n'ajoute qu'une ligne à lire.
- **La méthode** — arguments **sans** `source`. Playbook, en grille deux
  colonnes.

**C'est la présence de `source` qui trie** : ne jamais renseigner `source` sur un
argument de méthode, ni l'omettre sur un fait.

- **100 % déterministe**, construit dans `buildRecommandations` (`buildLevier*` →
  helper `argsPrix`, arrays inline), à partir des données réelles (écart DVF, DPE
  ADEME, cash-flow simulé, fourchette ANIL). **Aucun chiffre inventé.**
- **Textes courts** : titre de 3 à 5 mots, `detail` d'une phrase — le `chiffre`
  porte le reste. Ne pas réintroduire de paragraphes.
- **Ton** : `detail` en tutoiement (l'investisseur).
- **Pas de verbatim** (champ retiré) : un ancien design affichait une phrase
  prête à dire au vendeur/locataire sous chaque fait, mais elle ne faisait le
  plus souvent que reformuler le `detail` juste au-dessus à la première
  personne — décision produit assumée de la retirer plutôt que la garder pour
  une valeur marginale. Si le besoin réapparaît (« une formulation à
  emprunter »), le traiter comme une fonctionnalité à part (ex. un bouton
  copier sur une seule phrase par levier), pas un champ par argument.
- Spec d'origine (contenu des 4 leviers) : `docs/spec-arguments-leviers.md` —
  antérieure à ce redécoupage, périmée sur l'emplacement UI ET sur le verbatim.

## `renovePremium` sur `buildBlocLocation`

Le levier travaux suppose une **rénovation haut de gamme** justifiant un loyer
**au-dessus de la fourchette ANIL** sans que ce soit un signal d'excès. Le 5e
param optionnel `opts.renovePremium` de `buildBlocLocation` **supprime la
pénalité « loyer optimiste »** dans ce seul cas. Défaut `false` : le chemin
d'analyse réel est **inchangé** — n'appeler `renovePremium: true` que depuis le
moteur de recommandations. Les constantes `MAJORATION_MEUBLE` et
`PROVISION_CHARGES_M2` sont exportées de `location.ts` pour que le moteur cible
le haut de fourchette sur la même base de conversion (pas de duplication).

## Skeleton & recalcul

`OptimiserSkeleton` (dans `ApartmentDetail.tsx`) s'affiche quand
`analysisPending`, comme les autres onglets. Les recos font partie de la sortie
de `runAnalyse` → elles se régénèrent à chaque « Relancer » / recalcul, sans
traitement particulier.

# Page appartement — en-tête et navigation

## En-tête compact (`ApartmentDetail.tsx`)

L'en-tête utilise un layout inline flex (pas de blocs empilés) :
**vignette photo** (80px mobile / 112px desktop) · **titre + adresse + meta** ·
**mini carte** (112×288px, desktop uniquement).

- **Photo** → lien vers l'annonce (`apt.url`). Fallback : icône `Home` sur
  fond `ink-50`.
- **Ligne meta** : quartier · date · plateforme · lien "Annonce" (avec
  `ExternalLink`) · lien "Carte" (mobile uniquement, `sm:hidden`, ouvre
  Google Maps) · icône poubelle `Trash2` (suppression).
- **Mini carte** (`ApartmentLocationMap compact`) : masquée sur mobile
  (`hidden sm:block`), cliquable → ouvre Google Maps à l'adresse exacte
  (pas aux coordonnées). Le mode `compact` désactive zoom, attribution et
  drag (`zoomControl={false}`, `attributionControl={false}`, `dragging={false}`).
- **Google Maps URL** : quand `apt.adresse` est disponible, utiliser
  `/maps/search/${encodeURIComponent(adresse + ville)}` (précis). Fallback
  aux coordonnées `/@lat,lng,17z` sinon.

## Onglets avec icônes

Chaque onglet a une icône Lucide et un label court pour mobile :

| Tab (key) | Icône | Label desktop | Label mobile |
|-----|-------|---------------|--------------|
| Analyse (`ia`) | `Sparkles` | Analyse | Analyse |
| Optimiser (`optimiser`) | `Lightbulb` | Optimiser | Optim. |
| Description (`donnees`) | `Home` | Description du bien | Bien |
| Opération (`financiere`) | `HandCoins` | Détails de l'opération | Opération |
| Simulation (`simulation`) | `Calculator` | Simulation financière | Simulation |

Le label court est dans `shortLabel` (TABS). L'affichage utilise
`<span className="sm:hidden">{shortLabel}</span>` /
`<span className="hidden sm:inline">{label}</span>`. La barre de tabs
scrolle horizontalement sur mobile (`overflow-x-auto`).

## Skeletons

2 niveaux de skeleton fidèles à la structure réelle :

1. **Page-level** (`loading.tsx`) : Next.js Suspense, affiché pendant le
   chargement serveur. Reprend l'en-tête compact + tabs + verdict + cards.
2. **AnalyseIASkeleton** : affiché quand `analysisPending` sur l'onglet
   Analyse. Verdict card skeleton, MetricCards, `SkeletonFlatSection` ×6.

Les autres onglets (donnees, financiere, simulation) n'ont pas de skeleton
global — ils rendent immédiatement avec les données déjà chargées. Les
skeletons inline (`Skeleton` shimmer) sont utilisés par champ pendant les
recalculs (`rentPending`, `chargesPending`).

# Ajouter un bien — champs financiers optionnels repliés

Dans « Données financières », **Travaux**, **Charges copro** et **Taxe foncière**
sont repliés par défaut derrière une pastille « + » (`ChampOptionnel`), même
habillage que l'`OptionalRateField` de la Simulation financière. Seul le **Prix**
— le seul champ obligatoire — est un input d'emblée.

Ça retire du formulaire trois champs que l'utilisateur laisse vides la plupart du
temps, et surtout ça supprime les libellés à rallonge (« Charges copro annuelles
(laisser vide = estimées) ») qui passaient à deux lignes. Le « laisser vide = »
est remonté en une seule phrase au-dessus du groupe.

- **`ChampOptionnel` s'ouvre VIDE** — contrairement à `OptionalRateField`, il n'y
  a pas de valeur de repli sensée (un montant de travaux ou de charges ne
  s'invente pas). C'est donc l'état « ouvert » qui est mémorisé (`champsOuverts`),
  pas la valeur : sinon le champ se refermerait aussitôt ouvert.
- **Un champ déjà renseigné est déplié d'office** (`value != null`), sans avoir à
  figurer dans `champsOuverts`. C'est le cas du bookmarklet : une donnée trouvée
  dans l'annonce doit se voir et se corriger, pas se découvrir au clic.
- Le `✕` **vide la valeur ET referme** — les deux, sinon un champ vidé mais
  toujours déplié laisserait croire à une saisie en cours.
- Les trois n'ont pas la même sémantique quand ils restent vides : **Travaux = 0**
  (pas de travaux), **Charges et TF = estimées** après création. D'où la phrase
  d'explication placée sur le seul groupe « Charges annuelles ».
- `travaux` n'est **pas** dans `ParsedListing` : il ne peut jamais arriver
  pré-rempli, sa pastille est donc toujours celle du départ.

# Point d'entrée "Ajouter un bien"

Le CTA « Ajouter un bien » (`/appartements/nouveau`) n'est **plus dans la
navbar** : il est sur la home (`HomeView.tsx`), à droite de la dropdown de tri.
L'état vide (`EmptyHomeState.tsx`) garde ses propres points d'entrée. La navbar
ne contient donc que les liens de navigation + le wordmark.

# Pages d'erreur (not-found / error)

L'app a des boundaries d'erreur Next.js à deux niveaux, toutes bâties sur le
même composant partagé **`ErrorScreen.tsx`** (badge à halo dans le style de
`EmptyHomeState`, titre `font-display`, texte `ink-500`, un CTA plein
`accent-600` + un lien tertiaire souligné) :

- **`src/app/appartements/[id]/not-found.tsx`** / **`error.tsx`** — spécifiques
  à la fiche. `not-found` (tonalité neutre `accent`, icône `SearchX`) pour un
  bien supprimé ou un ID qui ne correspond plus à rien. `error` (tonalité
  `amber`, icône `AlertTriangle`, bouton **Réessayer** via `reset()`) pour un
  échec technique au rendu.
- **`src/app/not-found.tsx`** / **`error.tsx`** — mêmes gabarits, génériques,
  filet de sécurité pour le reste de l'app (accueil, paramètres).

**Sans ces boundaries**, une exception non gérée pendant le rendu SSR coupe la
réponse HTTP en plein flux : le navigateur affiche son propre écran d'erreur
réseau ("This page couldn't load"), pas une page de l'app — c'est le bug
observé en prod qui a motivé leur ajout. `error.tsx` doit être un Client
Component (contrainte Next.js) ; il reçoit `{ error, reset }` et n'affiche que
`error.digest` (référence opaque) à l'utilisateur, jamais le message ni la
stack — Next.js redacte de toute façon le message réel en prod.

**Trois causes déjà rencontrées et corrigées** (à garder à l'esprit avant de
supposer qu'une nouvelle panne est inédite) :
1. **Bloc ou champ manquant sur une analyse ancienne** — le type
   `AnalyseIA.blocs`/`.verdicts` promet des champs toujours présents, mais une
   analyse stockée dans un schéma antérieur à l'ajout d'un bloc ne les a pas
   forcément en base (le type ne garantit pas la vraie forme du JSON stocké).
   L'onglet PAR DÉFAUT de la fiche y accédait sans garde
   (`analyse.blocs.prix.faits`, `analyse.blocs[cle].note`,
   `analyse.verdicts.find(...)`) → tout bien avec une analyse ancienne
   plantait au premier chargement. Même piège retrouvé depuis dans
   `ecartPrixMarche` (`prixBloc?.faits.find` — l'optionnel s'arrêtait au bloc,
   pas à `faits`) et dans `decisionFromAnalyse`. Corrigé avec la même tolérance que
   `AnalyseIA.tsx` (`analyse.blocs?.prix?.faits ?? []`, bloc absent → omis du
   radar plutôt qu'un crash). **Réflexe à appliquer à tout nouveau champ de
   `AnalyseIA`** : ne jamais le lire sans un garde, même si le type dit qu'il
   est obligatoire.
2. **ID malformé dans l'URL** (lien tronqué/copié) — Postgrest rejette avant
   même de chercher la ligne (`invalid input syntax for type uuid`). Dans
   `page.tsx`, cette erreur est distinguée d'une vraie erreur de config
   Supabase (`requiredEnv()` dans `db.ts`, préfixe "Variable d'environnement
   manquante") et traitée comme un bien introuvable (`notFound()`), pas
   affichée via `SetupNotice` (message Postgres brut sous un titre "config
   Supabase requise" — trompeur pour un utilisateur en prod).
3. **`page.tsx` : le `try/catch` ne couvre que le fetch**, pas
   `computeDerived()` ni le rendu de `ApartmentDetail` — une exception dans
   l'un ou l'autre échappe au `catch` et retombe sur `error.tsx` (point 1
   ci-dessus, avant sa correction, tombait exactement dans ce trou).

# Bookmarklet — pipeline d'extraction

Le bookmarklet (`src/lib/bookmarklet.ts`) est le chemin principal pour
importer une annonce — le scraping serveur est bloqué sur la plupart des
sites (DataDome, Cloudflare). Pipeline par priorité (première valeur gagne) :

1. **JSON-LD** (schema.org) — cross-plateforme, données structurées fiables
   (prix, adresse, surface, pièces, photo)
2. **`__NEXT_DATA__`** — spécifique Leboncoin (Next.js SSR data)
3. **Sélecteurs CSS plateforme** — ciblés par site (SeLoger : prix, DPE/GES,
   features ; Leboncoin : prix via `data-qa-id`)
4. **URL parsing** — ville, quartier, code postal depuis le chemin (SeLoger :
   `/annonces/TYPE/BIEN/ville-arrond-dept/quartier/ID.htm`)
5. **og:description parsing** — prix (premier match), ville + code postal
   depuis la méta description
6. **CSS sélecteurs génériques** — `[data-testid="price"]`, `[class*="Price"]`
7. **Free-text regex** — dernier filet sur `body.innerText`

**Règles prix** : toujours le PREMIER montant ≥ 10 000 € trouvé (pas le plus
grand — le prix de vente est affiché en premier, les montants plus élevés en
bas de page sont des estimations ou prix voisins). S'applique au bookmarklet
ET aux parsers serveur (`common.ts`).

**Plateformes détectées** : Leboncoin, SeLoger, PAP, Orpi, BienIci, LogicImmo,
LuxResidence, ou "Manuel" (fallback). La détection se fait sur
`location.hostname`. Toutes ces valeurs sont dans l'enum `PLATEFORMES`
(`src/lib/types.ts`) et acceptées par la validation Zod — ne pas ajouter une
détection dans le bookmarklet sans ajouter la valeur dans l'enum.

## JSON-LD — `itemOffered` (SeLoger)

SeLoger utilise `@type: "RealEstateListing"` avec les propriétés (surface,
pièces, chambres) imbriquées dans `itemOffered` au lieu de la racine. Le
bookmarklet et `common.ts` (`mergeJsonLdCandidate`) vérifient les deux niveaux.

## JSON-LD — `priceSpecification` (BienIci)

BienIci place le prix dans `offers.priceSpecification.price` au lieu de
`offers.price`. Le bookmarklet et `common.ts` vérifient les deux chemins :
`offers.price ?? priceSpecification.price ?? offers.lowPrice ?? obj.price`.

## JSON-LD — `additionalProperty` (PAP)

PAP fournit surface, pièces, chambres, ascenseur via un tableau
`additionalProperty` de `PropertyValue` (schema.org). Le bookmarklet et
`common.ts` itèrent ce tableau et matchent par `name.toLowerCase()` :
`"surface"` → `surface_m2`, `"pièce"/"piece"` → `nb_pieces`,
`"chambre"` → `nb_chambres`, `"ascenseur"` → `ascenseur` (oui/true/1).

## JSON-LD — `@graph`

Le bookmarklet et `common.ts` gèrent tous deux `json['@graph']` (tableau
d'entités schema.org groupées). Ne pas ajouter un seul côté.

## JSON-LD — `itemCondition` (état du bien)

Le bookmarklet et `common.ts` extraient `etat_bien` depuis `itemCondition`
(schema.org) : `NewCondition` → `"Neuf"`, `UsedCondition` ou
`RefurbishedCondition` → `"Bon état"`. Pas toutes les annonces incluent ce
champ — quand absent, `etat_bien` reste vide (pas de valeur inventée).

## Année de construction — extraction multi-pattern

Le free-text (bookmarklet `F()` et `common.ts` `extractFromFreeText`) cherche
l'année de construction avec 5 patterns chaînés en fallback :
1. `construit(e) en 1975`
2. `année de construction : 1982`
3. `résidence de 2008` / `immeuble du 1935` / `bâtiment de 1960`
4. `bâti en 1920` / `édifié en 1890` / `livré en 2023`
5. `datant de 1955` / `datant du 1870`

## Parsing numérique — point-milieu (notation européenne)

`N()` (bookmarklet) et `toNumber()` (`common.ts`) suppriment les points
suivis de exactement 3 chiffres avant la fin ou une virgule
(`/\.(\d{3})(?=[.,]|$)/g` → `$1`). Cela corrige `"267.000 €"` → 267000
sans casser `"45.00 m²"` → 45.0 (2 chiffres après le point, pas 3).

## Sélecteurs CSS plateforme — BienIci

Bloc `if(pf==='BienIci')` dans le bookmarklet :
- **DPE** : `.dpe-line__classification` — contient juste la lettre (ex. "B"),
  sans le mot "DPE". Validé par `/^[A-G]$/i`.
- **GES** : `.ges-line__classification` — même pattern.
- **Description** : `[class*="see-more-description"]` — contenu complet après
  expansion (2400+ chars typiques). Aussi ajouté au bloc cross-plateforme.

## Sélecteurs CSS plateforme — PAP

Bloc `if(pf==='PAP')` dans le bookmarklet :
- **DPE** : `.energy-indice .active` / `.energy-indice li.active` — PAP affiche
  toutes les lettres A-G, la lettre active a la classe `.active`. Validé par
  `/^[A-G]$/i`.
- **GES** : `.ges-indice .active` — même pattern.
- **Description** : `.item-description` — contenu complet. Aussi ajouté au bloc
  cross-plateforme.
- **Features** : `.item-tags li` — scan des `<li>` pour surface, pièces,
  chambres, étage (mêmes regex que SeLoger features).

## Sélecteurs CSS plateforme — Orpi

Bloc `if(pf==='Orpi')` dans le bookmarklet. Orpi est la **seule** plateforme
sans JSON-LD — tout doit venir du DOM ou de l'URL :
- **DPE** : `.c-dpe:not(.c-dpe--ges) .c-dpe__index--active` — la lettre
  active dans l'étiquette DPE. Validé par `/^[A-G]$/i`.
- **GES** : `.c-dpe--ges .c-dpe__index--active` — même pattern avec la variante
  GES du composant DPE.
- **Prix** : `[class*="price-tag"],[class*="price_tag"],[class*="c-price"]` —
  sélecteurs lowercase (Orpi utilise `.c-estate-thumb__price-tag`).
- **Description** : cherche un `<h2>` dont le texte contient "avis",
  "description" ou "présentation", puis prend `nextElementSibling`. Fallback
  sur `[class*="description-content"],[class*="agency-opinion"]`.
- **Code postal** : regex URL `/-(\d{5})-[0-9a-f]{8}/` (le CP est suivi du
  UUID dans les URLs Orpi).
- **Ville** : regex URL `/annonce-(vente|location)-TYPE-tN-VILLE-CP-/`, puis
  fallback DOM `[class*="infos__location"],[class*="localisation"]`.
- **Features** (surface, pièces, étage) : délégués au free-text `F()` — les
  éléments CSS d'Orpi sont structurés en H2 mais sans pattern suffisamment
  stable pour un sélecteur dédié.

## Sélecteurs CSS plateforme — LogicImmo

LogicImmo partage le même frontend Aviv Group que SeLoger — mêmes CSS classes,
mêmes data-testids. Le bloc `if(pf==='SeLoger'||pf==='LogicImmo')` les traite
ensemble. Ne pas créer de bloc `LogicImmo` séparé.

## État du bien (etat_bien) — SeLoger/LogicImmo

Le bloc SeLoger/LogicImmo extrait `etat_bien` depuis
`[data-testid="cdp-energy-features"]` : "neuf" → `"Neuf"`, "rénov/refait/
réhabilit" → `"Bon état"`. Ce champ est absent des autres plateformes en CSS
dédié — il peut arriver via `itemCondition` (JSON-LD) ou free-text.

## DPE/GES — scan générique cross-plateforme

Après les blocs plateforme dédiés, un scan générique cherche DPE/GES dans
les éléments `[class*="dpe"],[class*="energy"],[class*="diagnostic"],
[class*="etiquette"]` avec les regex `(DPE)`, `Énergie`, `Consommation`,
`GES`, `Gaz`, `Climat`, `Émission`. Ce scan sert de filet pour les
plateformes sans bloc dédié (Orpi, LogicImmo, LuxResidence). Il ne
s'exécute que si `!d.dpe` ou `!d.ges` — pas de conflit avec les blocs
plateforme qui passent en premier.

## DPE/GES — extraction SeLoger

SeLoger concatène la lettre directement après la parenthèse : `"(DPE)D"`,
`"(GES)B"` sans séparateur. Regex prioritaire : `/\(DPE\)\s*([A-G])/i` et
`/\(GES\)\s*([A-G])/i`. Sélecteur SeLoger :
`[data-testid="cdp-energy-certificate-preview"]` ou `[data-testid="cdp-energy"]`.

## Description — capture post-expansion

Après `expandVoir()` (clic automatique des boutons "Voir plus"), le bookmarklet
cherche la description complète dans le DOM via les sélecteurs
`[class*="DescriptionTexts"]`, `[class*="Description_text"]`,
`[data-testid*="description"]`, `[itemprop="description"]`, etc. La description
DOM longue (>80 chars) remplace la courte `og:description` initiale.

## Charges copropriété — extraction conservatrice

Les charges copropriété ne sont **jamais** extraites du free-text
(`body.innerText`) — trop de faux positifs (ex: "charge du vendeur" sur
SeLoger). Seules les sources structurées sont fiables : `__NEXT_DATA__`
(Leboncoin : `charges_included`) ou sélecteurs CSS spécifiques par plateforme.
Si non trouvées, le champ reste vide — ne pas inventer de valeur.

## Étage — extraction multi-pattern

Deux patterns complémentaires (bookmarklet + `common.ts`) :
1. Nombre avant "étage" : `(\d+)(?:er|e|ème)?\s?é(tage(?!s)|t\.)` — "3ème étage", "1er ét."
2. Nombre après "étage" : `é(tage(?!s)|t\.)\s*[:\-]?\s*(\d+)` — "Étage : 3", "ét. 5"
3. "rez-de-chaussée" → `RDC`

**Negative lookahead `(?!s)` obligatoire** : sans lui, "14 étages" (total de
l'immeuble, pluriel) matche avant "Étage 10" (étage de l'appartement,
singulier) — extrairait 14 au lieu de 10. Le `(?!s)` après `tage` empêche le
match quand un "s" suit immédiatement (= pluriel). Appliqué dans les 3
endroits : bookmarklet SeLoger/PAP features, bookmarklet `F()`, et
`common.ts` `extractFromFreeText()`.

SeLoger : sélecteurs supplémentaires `[class*="floor"]`, `[class*="Summary"]`
pour trouver l'étage dans la grille de caractéristiques.

## Prix — sélecteurs génériques case-insensitive

Le sélecteur générique de prix inclut `[class*="Price"]` ET `[class*="price"]`
pour couvrir les deux conventions de nommage (SeLoger capitalise, Orpi non).
Les sélecteurs CSS `[class*=...]` sont sensibles à la casse — les deux
variantes sont donc nécessaires.
