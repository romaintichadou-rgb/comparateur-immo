# Page appartement — en-tête, onglets, ajout de bien

> Référence de domaine — chargée seulement quand la tâche touche
> `ApartmentDetail.tsx` (en-tête, onglets, onglet Description) ou
> `AddApartmentFlow.tsx`. Pointeur depuis `AGENTS.md`.

## En-tête compact (`ApartmentDetail.tsx`)

L'en-tête utilise un layout inline flex (pas de blocs empilés) :
**photo 16:9** (`aspect-video w-32` mobile / `sm:w-52` desktop) ·
**titre + adresse + prix/décision + meta** · **mini carte** (112×288px,
desktop uniquement).

- **Photo** → lien vers l'annonce (`apt.url`). Fallback : icône `Home` sur
  fond `ink-50`. Format **16:9**, pas carré : c'est le cadrage des visuels
  d'annonce. Les dimensions passent par `aspect-video` + une largeur — ne pas
  revenir à un couple `h-*`/`w-*` figé.
  ⚠️ Le lien porte un **`aria-label`** : il n'enveloppe qu'une image
  décorative (`alt=""`), donc sans lui son nom accessible est **vide**. Même
  règle pour la mini carte.

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

- **Ligne prix** : `apt.prix` en `font-mono text-xl` + la pastille de
  décision (`DECISION_CHIP`, voir `docs/reference/couleurs-scoring.md`).
- **Ligne meta** : prix/m² · quartier · date · plateforme · lien "Annonce"
  (`ExternalLink`) · lien "Carte" (mobile uniquement, `sm:hidden`) · icône
  poubelle `Trash2` (`-m-1.5 p-1.5`, `aria-label`).
- **Mini carte** (`ApartmentLocationMap compact`) : masquée sur mobile,
  cliquable → Google Maps à l'adresse exacte. `zoomControl={false}`,
  `attributionControl={false}`, `dragging={false}`.
- **Google Maps URL** : construite par `lienGoogleMaps(apt, lat, lng)`,
  jamais à la main. Recherche par adresse (code postal compris) dès qu'une
  voie est connue ; sinon repli sur les coordonnées ; `null` si rien à
  situer.

## Onglets avec icônes

| Tab (key) | Icône | Label desktop | Label mobile |
|-----|-------|---------------|--------------|
| Analyse (`ia`) | `Sparkles` | Analyse | Analyse |
| Optimiser (`optimiser`) | `Lightbulb` | Optimiser | Optim. |
| Description (`donnees`) | `Home` | Description du bien | Bien |
| Opération (`financiere`) | `HandCoins` | Détails de l'opération | Opération |
| Simulation (`simulation`) | `Calculator` | Simulation financière | Simulation |

Le label court est dans `shortLabel` (TABS). Tab bar scrolle horizontalement
sur mobile (`overflow-x-auto`).

## En-têtes d'onglets (`TabHeader`)

Chaque onglet s'ouvre sur un titre + sous-titre, rendu par `TabHeader`
(`SectionHeader.tsx`) depuis `ApartmentDetail`, **jamais** depuis le composant
de l'onglet — sinon il n'apparaît pas au-dessus des skeletons de recalcul et
des états dégradés d'`OptimiserView`, qui sortent par `return` anticipé.

| Onglet | Titre | Sous-titre |
|---|---|---|
| `ia` | Analyse | *dynamique* — « Verdict d'achat, sous-scores et faits chiffrés · analysée le {date} », ou « Pas encore analysée… » |
| `optimiser` | Optimiser | *dynamique* — voir « Sous-titre honnête » ci-dessous |
| `donnees` | Description du bien | Les données extraites de l'annonce, corrigeables à la main. |
| `financiere` | Détails de l'opération | Ce que coûte l'achat, ce que rapporte la location. |
| `simulation` | Simulation financière | Crédit, fiscalité LMNP au réel et cash-flow année par année. |

Les trois derniers sont **fixes** ; les deux premiers décrivent un **état**.

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
| Localisation | ville, quartier, code postal, adresse |
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

1. **Page-level** (`loading.tsx`) : Next.js Suspense, en-tête compact + tabs +
   verdict + cards.
2. **AnalyseIASkeleton** : affiché quand `analysisPending`.

Les autres onglets (donnees, financiere, simulation) n'ont pas de skeleton
global. Les skeletons inline (`Skeleton` shimmer) sont utilisés par champ
pendant les recalculs (`rentPending`, `chargesPending`).
