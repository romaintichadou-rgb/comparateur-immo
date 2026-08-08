# Bookmarklet — pipeline d'extraction

> Référence de domaine — chargée seulement quand la tâche touche
> `src/lib/bookmarklet.ts` ou `src/lib/parsers/common.ts`. Pointeur depuis
> `AGENTS.md` (qui garde les 3 règles critiques de sécurité inline, dupliquées
> ici pour le contexte complet).

Le bookmarklet (`src/lib/bookmarklet.ts`) est le chemin principal pour
importer une annonce — le scraping serveur est bloqué sur la plupart des
sites (DataDome, Cloudflare).

## ⚠️ Trois règles avant de toucher à `BOOKMARKLET_SOURCE`

`buildBookmarkletHref` supprime TOUS les sauts de ligne et substitue
`__APP_ORIGIN__` par un `String.replace` **sans `/g`**. Trois conséquences,
toutes rencontrées d'un coup lors d'une seule modification :

1. **Aucun commentaire `//` dans la chaîne.** Sur une seule ligne, il avale
   tout ce qui suit. Le bookmarklet ne fait alors plus rien — sans erreur en
   console, sans échec de build. Documenter dans l'en-tête TypeScript.
2. **Une seule occurrence de `__APP_ORIGIN__`.** Les suivantes resteraient
   littérales dans l'URL produite.
3. **Pas de `fetch()` vers notre API.** Le script tourne sur le domaine de
   l'annonce : l'appel est cross-origin, CORS le bloque. Et c'est inutile —
   le proxy redirige déjà vers `/login?suivant=…` en conservant la query
   string.

**`npm run check:bookmarklet`** compile le script GÉNÉRÉ et vérifie ces
points. Ni `build` ni `lint` ne voient ce genre de casse. Lancer ce script
après toute retouche.

## Pipeline par priorité (première valeur gagne)

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
grand). S'applique au bookmarklet ET aux parsers serveur (`common.ts`).

**Plateformes détectées** : Leboncoin, SeLoger, PAP, Orpi, BienIci, LogicImmo,
LuxResidence, ou "Manuel" (fallback). Détection sur `location.hostname`. Ces
valeurs sont dans l'enum `PLATEFORMES` (`src/lib/types.ts`) — ne pas ajouter
une détection dans le bookmarklet sans ajouter la valeur dans l'enum.

## JSON-LD — cas particuliers par plateforme

- **`itemOffered` (SeLoger)** : `@type: "RealEstateListing"` avec surface/
  pièces/chambres imbriquées dans `itemOffered` au lieu de la racine.
  Bookmarklet et `common.ts` (`mergeJsonLdCandidate`) vérifient les deux
  niveaux.
- **`priceSpecification` (BienIci)** : prix dans
  `offers.priceSpecification.price` au lieu de `offers.price`. Chaîne
  vérifiée : `offers.price ?? priceSpecification.price ?? offers.lowPrice ?? obj.price`.
- **`additionalProperty` (PAP)** : surface, pièces, chambres, ascenseur via un
  tableau `additionalProperty` de `PropertyValue`. Matché par
  `name.toLowerCase()` : `"surface"` → `surface_m2`, `"pièce"/"piece"` →
  `nb_pieces`, `"chambre"` → `nb_chambres`, `"ascenseur"` → `ascenseur`.
- **`@graph`** : bookmarklet et `common.ts` gèrent tous deux
  `json['@graph']` (tableau d'entités groupées). Ne pas ajouter un seul côté.
- **`itemCondition` (état du bien)** : `NewCondition` → `"Neuf"`,
  `UsedCondition`/`RefurbishedCondition` → `"Bon état"`. Absent → `etat_bien`
  reste vide (pas de valeur inventée).

## Année de construction — extraction multi-pattern

5 patterns chaînés en fallback (bookmarklet `F()` et `common.ts`
`extractFromFreeText`) :
1. `construit(e) en 1975`
2. `année de construction : 1982`
3. `résidence de 2008` / `immeuble du 1935` / `bâtiment de 1960`
4. `bâti en 1920` / `édifié en 1890` / `livré en 2023`
5. `datant de 1955` / `datant du 1870`

## Parsing numérique — point-milieu (notation européenne)

`N()` (bookmarklet) et `toNumber()` (`common.ts`) suppriment les points
suivis de exactement 3 chiffres avant la fin ou une virgule
(`/\.(\d{3})(?=[.,]|$)/g` → `$1`). Corrige `"267.000 €"` → 267000 sans casser
`"45.00 m²"` → 45.0.

## Sélecteurs CSS par plateforme

- **BienIci** : DPE `.dpe-line__classification` (lettre seule, `/^[A-G]$/i`),
  GES `.ges-line__classification`, description
  `[class*="see-more-description"]` (2400+ chars typiques).
- **PAP** : DPE `.energy-indice .active` / `.energy-indice li.active`, GES
  `.ges-indice .active`, description `.item-description`, features
  `.item-tags li` (mêmes regex que SeLoger).
- **Orpi** (seule plateforme **sans** JSON-LD) : DPE
  `.c-dpe:not(.c-dpe--ges) .c-dpe__index--active`, GES
  `.c-dpe--ges .c-dpe__index--active`, prix
  `[class*="price-tag"],[class*="price_tag"],[class*="c-price"]`,
  description via un `<h2>` "avis"/"description"/"présentation" +
  `nextElementSibling` (fallback `[class*="description-content"],
  [class*="agency-opinion"]`), code postal `/-(\d{5})-[0-9a-f]{8}/`, ville
  `/annonce-(vente|location)-TYPE-tN-VILLE-CP-/` (fallback DOM
  `[class*="infos__location"],[class*="localisation"]`), features déléguées
  au free-text `F()`.
- **LogicImmo** : partage le frontend Aviv Group de SeLoger — bloc
  `if(pf==='SeLoger'||pf==='LogicImmo')` commun, ne pas créer de bloc séparé.
- **SeLoger/LogicImmo** : `etat_bien` depuis
  `[data-testid="cdp-energy-features"]` ("neuf" → `"Neuf"`, "très bon état"/
  "excellent état"/"parfait état" → `"Très bon état"`,
  "rénov/refait/réhabilit" → `"Bon état"`).

⚠️ **"Très bon état"** (palier ajouté entre "Bon état" et "Neuf", voir
`docs/reference/estimation-loyer-charges.md`) : partout où `etat_bien` est
détecté par regex (bookmarklet ET `parsers/common.ts`), le motif "très bon
état"/"excellent état"/"parfait état" doit être testé AVANT le motif générique
"bon état" — sinon "bon état" matche déjà "très bon état" comme sous-chaîne et
absorbe la nuance.

## DPE/GES — extraction

- **Scan générique cross-plateforme** (filet pour Orpi, LogicImmo,
  LuxResidence) : `[class*="dpe"],[class*="energy"],[class*="diagnostic"],
  [class*="etiquette"]` avec regex `(DPE)`, `Énergie`, `Consommation`, `GES`,
  `Gaz`, `Climat`, `Émission`. Ne s'exécute que si `!d.dpe` ou `!d.ges`.
- **SeLoger** : lettre concaténée après la parenthèse (`"(DPE)D"`,
  `"(GES)B"`), regex prioritaire `/\(DPE\)\s*([A-G])/i` /
  `/\(GES\)\s*([A-G])/i`. Sélecteur
  `[data-testid="cdp-energy-certificate-preview"]` ou
  `[data-testid="cdp-energy"]`.

## Description — capture post-expansion

Après `expandVoir()` (clic auto des boutons "Voir plus"), recherche DOM via
`[class*="DescriptionTexts"]`, `[class*="Description_text"]`,
`[data-testid*="description"]`, `[itemprop="description"]`. La description
DOM longue (>80 chars) remplace la courte `og:description` initiale.

## Charges copropriété — extraction conservatrice

**Jamais** extraites du free-text (trop de faux positifs, ex. "charge du
vendeur" sur SeLoger). Seules les sources structurées comptent :
`__NEXT_DATA__` (Leboncoin : `charges_included`) ou sélecteurs CSS
spécifiques. Si non trouvées, le champ reste vide.

## Étage — extraction multi-pattern

Deux patterns complémentaires (bookmarklet + `common.ts`) :
1. Nombre avant "étage" : `(\d+)(?:er|e|ème)?\s?é(tage(?!s)|t\.)`
2. Nombre après "étage" : `é(tage(?!s)|t\.)\s*[:\-]?\s*(\d+)`
3. "rez-de-chaussée" → `RDC`

**Negative lookahead `(?!s)` obligatoire** : sans lui, "14 étages" (total de
l'immeuble, pluriel) matche avant "Étage 10" (étage de l'appartement,
singulier). Appliqué dans les 3 endroits : bookmarklet SeLoger/PAP features,
bookmarklet `F()`, et `common.ts` `extractFromFreeText()`.

SeLoger : sélecteurs supplémentaires `[class*="floor"]`, `[class*="Summary"]`.

## Prix — sélecteurs génériques case-insensitive

`[class*="Price"]` ET `[class*="price"]` (SeLoger capitalise, Orpi non — les
sélecteurs `[class*=...]` sont sensibles à la casse).
