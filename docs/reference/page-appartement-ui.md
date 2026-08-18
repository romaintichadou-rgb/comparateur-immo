# Page appartement — en-tête, onglets, ajout de bien

> Référence de domaine — chargée seulement quand la tâche touche
> `ApartmentDetail.tsx` (en-tête, onglets, onglet Description) ou
> `AddApartmentFlow.tsx`. Pointeur depuis `AGENTS.md`.

## Barre du bien — identité + tabs empilés (`ApartmentDetail.tsx`)

L'en-tête est une **barre sticky** (`sticky top-0 z-40`) contenant deux lignes
empilées dans un seul conteneur :

- **Ligne 1 — identité** : flèche retour + photo miniature (40×30 px,
  `hidden sm:block`) + titre (`formatApartmentTitle` + prix, `text-sm
  font-semibold truncate`) + méta-ligne (localisation, prix/m², quartier, date,
  plateforme, liens, bouton supprimer) + badge décision (`DECISION_CHIP`,
  `flex-shrink-0`).
- **Ligne 2 — onglets** : même tabs qu'avant, déplacés dans le conteneur sticky.

La Navbar (`Navbar.tsx`) est **scroll-away** sur la fiche bien : elle détecte
`/appartements/` via `usePathname()` et passe de `sticky top-0` à `relative`.
La barre du bien la remplace comme repère visuel permanent.

- **Photo miniature** → lien vers l'annonce (`apt.url`). Fallback : icône
  `Home` sur fond `ink-50`. Masquée sur mobile pour maximiser l'espace titre.
  ⚠️ Le lien porte un **`aria-label`** : il n'enveloppe qu'une image
  décorative (`alt=""`), donc sans lui son nom accessible est **vide**.

### Titre du bien (`formatApartmentTitle`)

`{type_bien} · {Tn} · {surface}m²` — ex. « Appartement · T3 · 44 m² ».

- **`type_bien`** (obligatoire) : la vraie valeur du champ.
- **`Tn`** (optionnel) : inclus seulement si `nb_pieces` est connu et > 0. Ne
  pas afficher `T0` ni laisser le T vide.
- **Surface** (optionnel) : toujours stockée arrondie à l'entier (43.72 m² →
  44 m² en base, à `createApartment`/`updateApartment`).

Implémentation : `formatApartmentTitle(apt)` dans `src/lib/format.ts`. N'affiche
que les éléments disponibles ; les séparateurs « · » n'apparaissent que s'il y
a quelque chose de part et d'autre.

### Adresse (`src/lib/adresse.ts`) — source UNIQUE d'assemblage

Les quatre champs de localisation (`adresse`, `quartier`, `ville`,
`code_postal`) ne se recollent JAMAIS à la main. Trois formes canoniques,
choisies par contexte de lecture :

| Fonction | Rend | Consommateurs |
|---|---|---|
| `formatAdressePostale` | « 12 rue des Lilas, 75020 Paris » | sous-titre de la fiche, lien Google Maps, géocodage BAN exact |
| `formatSecteur` | « Belleville, 75020 Paris » | prompts IA (`rentEstimation`, `chargesEstimation`), géocodage BAN de repli |
| `formatLocalisationCourte` | « Belleville, Paris » | listes denses : `ApartmentsTable`, `ApartmentsCardList`, popup de `ApartmentsMap` |

S'y ajoutent `lienGoogleMaps(apt, lat, lng)` et `aAdressePrecise(apt)`
(remplace les `apt.adresse.trim() !== ""` dispersés).

Quatre règles portées par le module :

1. **« 75020 Paris », pas « 75020, Paris »** — norme postale française.
2. **Le code postal fait partie de la requête** (désambiguïse les
   arrondissements) — reste écarté de `formatLocalisationCourte` seule.
3. **Pas de repli en `||` sur une expression composée** — chaque partie
   (rue/quartier/ville) est omise indépendamment, sinon `||` fait disparaître
   la ville dès qu'une rue est renseignée.
4. **`nettoyer()` (trim) AVANT tout `filter(Boolean)`** — une chaîne d'espaces
   est *truthy*.

Le module déduplique aussi la commune quand un extracteur livre une `adresse`
déjà complète, en ne retirant que des segments de QUEUE (jamais le premier).

- **Ligne meta** (sous le titre) : localisation · prix/m² · quartier · date ·
  plateforme · lien "Annonce" (`ExternalLink`) · lien "Carte" (mobile
  uniquement, `sm:hidden`) · icône poubelle `Trash2` (`-m-1 p-1`,
  `aria-label`). Tout en `text-[11px] text-ink-400`.
- **Google Maps URL** : construite par `lienGoogleMaps(apt, lat, lng)`,
  jamais à la main. Recherche par adresse (code postal compris) dès qu'une
  voie est connue ; sinon repli sur les coordonnées ; `null` si rien à
  situer.

## Pas de rangée de KPI dans l'en-tête

Les 4 StatCards investisseur (Rendement net, Cash-flow mensuel, Prix au m²,
DPE) ne sont **plus** entre l'en-tête et la barre d'onglets : elles vivent
dans l'onglet Analyse, sous la card verdict. `ApartmentDetail` ne porte donc
plus ni `dpeInfo`, ni les `kpi*`, ni l'appel à `simulate()` — tout est passé
dans `AnalyseIA.tsx`. Historique du placement et arbitrage :
`docs/reference/analyse-optimiser.md`.

Conséquence : seul l'onglet Analyse affiche ces chiffres.

## Onglets avec icônes

| Tab (key) | Icône | Label desktop | Label mobile |
|-----|-------|---------------|--------------|
| Analyse (`ia`) | `Sparkles` | Analyse | Analyse |
| Recommandations (`recos`) | `Lightbulb` | Recommandations | Recos |
| Description (`donnees`) | `Home` | Description du bien | Bien |
| Coûts (`financiere`) | `HandCoins` | Coûts et revenus | Coûts |
| Projection (`simulation`) | `Calculator` | Projection financière | Projection |

Le label court est dans `shortLabel` (TABS). Tab bar scrolle horizontalement
sur mobile (`overflow-x-auto`).

### « Simulateur » — un MODE, hors de la barre d'onglets

Le bac à sable (`?tab=playground`) n'est **pas** un onglet : c'est un bouton posé
à droite de la barre (`ONGLET_SIMULER`), séparé des onglets par une simple marge.
Sa bordure propre le détache déjà — un filet vertical ajoutait un trait de plus
dans une barre qui en porte un en bas.

**Le critère du partage est la PERSISTANCE, pas « données vs scénarios ».** Les
cinq onglets décrivent le bien et enregistrent ce qu'on y change — y compris
« Projection financière », dont les hypothèses (revalorisation, vacance,
indexation) sont persistées par son `persist()`. Le Playground est le seul écran
de la fiche où **rien** n'est enregistré.

⚠️ **Les Recommandations n'ont PAS suivi le Playground.** Ce n'est pas une
simulation mais une sortie prescriptive, dérivée de l'analyse et persistée dans
`analyse_ia` — sa parenté est avec « Analyse », d'où sa place juste après elle
dans `TABS`. Ne pas les regrouper à nouveau sous un onglet « Optimiser » : c'est
ce mélange qui rendait la frontière illisible, la moitié du contenu ne respectant
pas ce que le libellé promettait.

⚠️ **Le bouton vit HORS du `<nav>` défilant**, comme son frère et non son enfant.
Dans le conteneur `overflow-x-auto`, il partirait hors champ sur mobile — et la
scrollbar étant masquée (`no-scrollbar`), rien ne signalerait sa présence.

⚠️ **`min-h-11`** (44 px) : le `py-1.5` seul donnait 34 px, sous la zone de tap
minimale, alors que les onglets voisins (`py-4`) la respectent largement.

Style : ni onglet (ce n'est pas une section du bien), ni CTA plein (ce n'est pas
l'action principale de la page) — bordé, avec état actif `accent-50`. Le bouton
et le titre de l'écran portent le MÊME libellé, « Simulateur ».

`?tab=optimiser` (ancienne URL) et `?tab=playground` mènent au Simulateur.
`CLES_TAB` = les clés de `TABS` **plus** celle du mode : `playground` reste une
route valide bien qu'absente de la table.

### L'onglet « Optimiser » et ses sous-pills n'existent plus

Il réunissait le Playground et les Recommandations derrière deux pills capsules
(état local `optimiserSub`). Les deux sont désormais des destinations
indépendantes — le bouton « Simulateur » et l'onglet `recos` — parce qu'elles
n'étaient pas de même nature : l'une ne persiste rien, l'autre est une sortie
persistée dérivée de l'analyse. Ne pas les réunir à nouveau.

### Titres à l'intérieur d'un onglet : `GroupHeader`, jamais un bloc à la main

Sous le `TabHeader` d'un onglet, chaque groupe de contenu se coiffe d'un
**`GroupHeader`** (`SectionHeader.tsx`) — Fraunces `text-base` + sous-titre
`text-sm ink-500`, le même token de sous-titre que `TabHeader`, ce qui fait
lire les deux comme deux crans d'une même échelle.

L'onglet Optimiser portait QUATRE styles pour ce seul rôle (deux variantes de
`text-[11px] uppercase tracking-wider`, un `font-display text-sm` hors échelle,
et deux blocs sans titre du tout) avec des sous-titres en `text-xs`,
`text-[10px]` et `text-sm`. Le style était rechoisi à chaque bloc, donc perdu à
chaque bloc.

Espacement : `space-y-10` entre groupes, `mb-4` du titre à son contenu (porté
par `GroupHeader`). Voir la table « Spacing » d'`AGENTS.md`.

`?tab=optimiser` (ancienne URL) redirige vers `?tab=playground` pour
rétrocompatibilité.

## En-têtes d'onglets (`TabHeader`)

Chaque onglet s'ouvre sur un titre + sous-titre, rendu par `TabHeader`
(`SectionHeader.tsx`) depuis `ApartmentDetail`, **jamais** depuis le composant
de l'onglet — sinon il n'apparaît pas au-dessus des skeletons de recalcul et
des états dégradés d'`OptimiserView`, qui sortent par `return` anticipé.

| Onglet | Titre | Sous-titre |
|---|---|---|
| `ia` | Analyse | *dynamique* — « Verdict d'achat, sous-scores et faits chiffrés · analysée le {date} », ou « Pas encore analysée… » |
| `recos` | Recommandations | *dynamique* — voir « Sous-titre honnête » ci-dessous |
| `playground` (bouton Simulateur) | Simulateur | Testez d'autres prix, loyers et apports pour voir où l'opération bascule. Rien n'est enregistré. |
| `donnees` | Description du bien | Les données extraites de l'annonce, corrigeables à la main. |
| `financiere` | Coûts et revenus | Les montants réels de l'opération — ils alimentent le rendement, le cash-flow et l'analyse. |
| `simulation` | Projection financière | Crédit, fiscalité LMNP au réel et cash-flow année par année. |

Les fixes disent ce que l'onglet MONTRE ; `ia` et `recos` décrivent un **état**.

### Sous-titre honnête d'Optimiser

Quatre formulations, dans cet ordre de test — ne jamais promettre un
« Achète » que le moteur n'a pas trouvé :

1. pas de reco → « Les leviers chiffrés qui amélioreraient la rentabilité… » ;
2. décision déjà `achete` → « Ce bien est déjà un achat — voici comment en
   améliorer la rentabilité. » (`flipVersAchat` vaut `!dejaAchat && …`, donc
   structurellement `false` sur un bien déjà achetable) ;
3. au moins un `flipVersAchat` → « N levier(s) fait/font basculer ce bien en
   « Achète ». » ;
4. sinon → « Aucun levier ne fait basculer la décision — voici ce qui améliore
   quand même la rentabilité. »

## Onglet Description — quatre cartes + le texte de l'annonce

Quatre cartes, plus une cinquième en pleine largeur :

| Carte | Champs |
|---|---|
| Localisation | ville, quartier, code postal, adresse + **carte Leaflet** (h-40, cliquable → Google Maps) |
| Caractéristiques | type de bien, *[nombre de lots si immeuble]*, surface, nb pièces, nb chambres |
| Bâtiment | étage, ascenseur, année de construction |
| État et diagnostics | état du bien, DPE, GES |
| **Annonce** *(pleine largeur)* | photo (URL), description |

L'onglet lui-même reste une **section sans encadrement** — ce sont les
GROUPES qui sont encadrés.

### Les deux modes d'un champ sont rendus DANS la même carte

Chaque carte porte son propre `editingDesc ? <EditStack> : <ReadStack>` — les
deux versions sont à cinq lignes l'une de l'autre, ce qui rend un oubli
repérable à la relecture.

Corollaire : **un champ = une ligne**, dans les deux modes. Ne pas fusionner
« Nb pièces » et « Nb chambres », ni « Étage » et « Ascenseur ».

### `FieldRow` — le badge se colle au LIBELLÉ

La valeur porte `shrink-0`, le libellé `min-w-0 truncate` : quand la carte se
resserre, c'est le LIBELLÉ qui se tronque, jamais la valeur.

⚠️ **Aucun badge n'est rendu dans cet onglet aujourd'hui, et ce n'est pas un
oubli.** `champs_manuels`/`champs_estimes_ia` ne couvrent que les **cinq
champs financiers** (`CHAMPS_ESTIMABLES`) ; la provenance des champs de
description est connue à la création puis **jetée** à l'enregistrement. Les
afficher demanderait une colonne supplémentaire et une remise à zéro par
champ dans `updateApartment`. Le slot `badge` existe pour ce jour-là — ne
PAS le remplir avec autre chose en attendant.

## Ajouter un bien — champs financiers optionnels repliés

Dans « Données financières », **Travaux**, **Charges copro** et **Taxe
foncière** sont repliés par défaut derrière une pastille « + »
(`ChampOptionnel`), même habillage que l'`OptionalRateField` de la Simulation
financière. Seul le **Prix** est un input d'emblée.

- **`ChampOptionnel` s'ouvre VIDE** — l'état « ouvert » est mémorisé
  (`champsOuverts`), pas la valeur.
- **Un champ déjà renseigné est déplié d'office** (`value != null`) — cas du
  bookmarklet.
- Le `✕` **vide la valeur ET referme**.
- **Travaux = 0** si vide (pas de travaux) ; **Charges et TF = estimées**
  après création si vides.
- `travaux` n'est **pas** dans `ParsedListing` : sa pastille est toujours
  celle du départ.

## Point d'entrée "Ajouter un bien"

Le CTA « Ajouter un bien » (`/appartements/nouveau`) n'est **plus dans la
navbar** : il est sur la home (`HomeView.tsx`), à droite de la dropdown de
tri. L'état vide (`EmptyHomeState.tsx`) garde ses propres points d'entrée.

## Skeletons

1. **Page-level** (`loading.tsx`) : Next.js Suspense, barre sticky (identité +
   tabs) + verdict + cards.
2. **AnalyseIASkeleton** : affiché quand `analysisPending`.

Les autres onglets (donnees, financiere, simulation) n'ont pas de skeleton
global. Les skeletons inline (`Skeleton` shimmer) sont utilisés par champ
pendant les recalculs (`rentPending`, `chargesPending`).
