<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

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
  jamais plus grands.
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
  annuelles" au lieu de "Charges copro annuelles", ~12 €/m²/an au lieu de
  ~20 €/m²/an, plancher 1500 € au lieu de 800 €). Le libellé UI doit suivre
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
  (`src/lib/simulation.ts`) suppose partout le régime **LMNP réel (meublé)**.
  Un immeuble de rapport est souvent loué nu (revenus fonciers, régime
  fiscal différent) — les montants restent corrects (ils scalent avec le
  loyer total et les charges totales), mais le régime fiscal n'est PAS
  spécialisé par type de bien. À traiter comme un chantier séparé si demandé,
  pas un oubli à corriger silencieusement en marge d'une autre tâche.

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
- **Ancienneté** : immeuble >50 ans = +15 % charges, ≤20 ans = -10 % charges.
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

## Couleurs sémantiques (perspective investisseur)

La logique de couleur `ecartTone()` (`LoyerDetailPanel.tsx`) suit la
perspective de l'investisseur, pas du locataire :
- **Au-dessus du marché** (écart ≥ 0 %) = `emerald` (bon revenu locatif).
- **En-dessous du marché** (écart -1 % à -10 %) = `amber` (revenu sous-optimal).
- **Très au-dessus** (>15 %) ou **très en-dessous** (<-10 %) = `red` (irréaliste
  ou problématique).
Ne JAMAIS inverser cette logique (ci-dessus = vert parce que c'est bon pour
l'investisseur).

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
Fiscalité LMNP), avec un badge « auto » quand il est en mode automatique.
La modification est sauvegardée immédiatement (PATCH direct) pour un feedback
en temps réel sur le cash-flow simulé.

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

Ces verdicts s'ajoutent aux verdicts "bloc faible" classiques et sont
toujours visibles en tête d'analyse.

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

# Onglet "Synthèse" — écran de décision d'achat

L'onglet **"Synthèse"** (`src/components/SyntheseView.tsx`) est le **premier
onglet et l'onglet par défaut** de la fiche bien (voir `TABS` et
`resolvedInitialTab` dans `ApartmentDetail.tsx`). Objectif produit : trancher
« dois-je acheter ce bien ? » en un coup d'œil, sans détail. Tout le détail
vit dans les autres onglets, vers lesquels des liens discrets renvoient.

- **Aucune donnée nouvelle, aucun appel API** : tout dérive de l'analyse
  stockée (`apt.analyse_ia` : `score_global`, `verdicts`, bloc `prix`), des
  champs calculés (`rendement_net`, `prix_m2`) et de la simulation client
  (`simulate(apt, apt.simulation_inputs ?? defaultInputs())` → cash-flow an 1).
- **États dégradés** : pas d'analyse / `score_global == null` → invitation à
  lancer l'analyse (ou à saisir le prix si manquant, comme ailleurs).

## Verdict (décision franche à 3 niveaux)

`Achète` / `Achète — si tu négocies` / `Passe ton chemin`, dérivé des signaux
existants (jamais recalculé) :
- **passe** si un verdict `alerte` existe OU `score < 5` ;
- **achète** si `score >= 7` ET aucun verdict `attention` ET pas de surcote
  (`ecartPct <= 5`) — GO volontairement exigeant ;
- **négocie** sinon.

Le dégradé tonal de la carte (repris de la home : `from-white to-{emerald|
amber|red}-50`) porte le verdict avant la lecture. La `raison` est un verbatim
concret et actionnable (dire *quoi* + *quoi faire*), pas une tournure abstraite.
Un **chip discret** « Analysé le … » près du titre porte la fraîcheur ; le
**radar des 5 blocs notés** (Prix, Locatif, Risques, Potentiel, Simulation) +
le lien « Analyse complète → » vivent en **pied de la carte verdict** (zone
« analyse »), volontairement subordonnés. Pas de divider entre la raison et le
radar (l'espacement suffit).

## Les 4 chiffres du "comité"

Cartes `MetricCard` (Geist Mono, `tabular-nums`) : Cash-flow mensuel, Rendement
net, **Prix au m²** (valeur principale : `prix_m2` en `€/m²`, sous-titre :
écart % vs médiane DVF locale quand disponible, sinon "Pas de comparable DVF"),
DPE.

- **Carte unique** : la 3e carte est TOUJOURS "Prix au m²" (plus de condition
  prix-vs-marché / prix-au-m²). L'écart DVF est en sous-titre, pas en valeur.
- **Tonalité cash-flow calibrée** : `< CASHFLOW_ROUGE_SEUIL` (−200 €/mois) =
  rouge (alerte), négatif léger = ambre, positif = vert.
- **Emphase "pourquoi"** : sur négocie/passe uniquement, la/les métrique(s) qui
  ont motivé le verdict sont teintées (rouge/ambre) + tag (`Rédhibitoire` en
  passe, `À négocier` en négocie). Sur un GO franc : aucune emphase.
- **CTA ancré en bas à droite** (`mt-auto self-end`) : les liens s'alignent
  entre cartes malgré des sous-titres de longueurs différentes. Le soulignement
  ne porte que sur le libellé, pas sur la flèche « → ». Les CTA sont des mots
  uniques (« Simulation », « Détails », « Analyse », « Risques ») — pas de
  phrases ("Voir l'analyse").

## Navigation vers la bonne section (ancres)

Chaque CTA renvoie vers l'onglet **ET** la section concernée. `onGoTab(tab,
anchor?)` est implémenté par `goToSection` dans `ApartmentDetail.tsx` : change
d'onglet, `router.push(?tab=…, {scroll:false})`, puis scrolle vers l'`id` via
un effet qui **attend le montage** du contenu (l'onglet Analyse IA est lourd →
polling `requestAnimationFrame`) et **repasse à 250/650 ms** pour verrouiller la
position malgré un reset de scroll post-navigation. Ne pas remplacer par un
`setTimeout` fixe (le montage tardif casse l'ancrage).

Ancres cibles (avec `scroll-mt-24` pour passer sous la navbar sticky) :

| CTA | Onglet | Ancre (`id`) | Fichier de l'ancre |
|---|---|---|---|
| Cash-flow | Simulation financière | `sim-cashflow` | `SimulationFinanciere.tsx` |
| Rendement net | Détails de l'opération | `fin-resultats` | `ApartmentDetail.tsx` |
| Prix vs marché | Analyse IA | `bloc-prix` | `AnalyseIA.tsx` (`BlocCard`) |
| Prix au m² (fallback) | Détails de l'opération | `fin-achat` | `ApartmentDetail.tsx` |
| DPE | Analyse IA | `bloc-risque` | `AnalyseIA.tsx` (`BlocCard`) |

`BlocCard` porte `id={`bloc-${bloc.cle}`}` — toute nouvelle ancre vers un bloc
d'analyse suit ce schéma. `renderBold` (gras markdown `**…**`) est exporté
depuis `AnalyseIA.tsx` pour être réutilisé.

# Onglet "Optimiser" — recommandations prescriptives (lecture seule)

L'onglet **"Optimiser"** (`src/components/OptimiserView.tsx`, 3e onglet, après
Analyse IA) est orienté **DÉCISION + RENTABILITÉ, pas le score**. Deux modes
selon le verdict actuel (Achète / Négocie / Passe) :

- verdict ≠ **Achète** → « En faire un achat » : les actions pour faire basculer
  le verdict à « Achète ».
- verdict = **Achète** → « Acheter mieux » : comment augmenter la rentabilité.

Chaque carte dit ce qu'une action change concrètement : **rendement net et
cash-flow avant → après**, et un badge « → Achète » si elle fait basculer le
verdict. **Purement informatif : ne modifie JAMAIS le bien réel** (prix, loyer,
dpe, score, verdicts intacts).

## Verdict = source unique (`src/lib/analyse/decision.ts`)

`computeDecision(score, verdicts, ecartPct)` est la SEULE définition du verdict
Achète/Négocie/Passe, partagée par `SyntheseView`, `OptimiserView` et le moteur
de recommandations (avant, chacun le recalculait à la main → risque de dérive).
`ecartPrixMarche(prixBloc)` extrait l'écart au marché du bloc Prix.

## Moteur (`src/lib/analyse/recommandations.ts`)

`buildRecommandations(apt, ctx)` est appelé **dans `runAnalyse`**, au moment où
toutes les données externes (DVF, ANIL, DPE, géorisques, settings) sont en
portée. Chaque projection ré-invoque les **VRAIES fonctions de blocs** sur une
**COPIE modifiée** du bien (`computeDerived({ ...apt, prix: X })`), puis
`computeScoreGlobal` + `buildVerdicts` + `computeDecision` pour le verdict
projeté. Même moteur déterministe, mêmes données, zéro chiffre inventé, zéro
appel réseau/LLM. On ne mute jamais `apt`. Rangé dans le champ **lecture seule**
`AnalyseIA.recommandations` (nullable).

**Versioning** : `ANALYSE_VERSION = 2`. Analyses antérieures (`== null`) →
l'onglet invite à « Relancer ». `== []` → « rien de plus à optimiser » (positif).

## Les 4 leviers (ordre d'affichage FIXE : prix en tête, financement en dernier)

| Levier | Cible prescriptive | Affiché si |
|---|---|---|
| **prix** | prix EXACT à négocier pour basculer à « Achète » (dichotomie sur le prix, décision monotone). Si un frein hors-prix (ex. DPE F, alerte) bloque, on le nomme et on chiffre quand même une négociation utile à la rentabilité. En mode « acheter mieux » : médiane DVF ou −8 %. | toujours (prix + surface connus) |
| **travaux** | DPE→D, loyer premium +12 % (`LOYER_BOOST_RENO`), coût ~350 €/m² (`COUT_RENO_M2`) | DPE ∈ {E,F,G} |
| **loyer** | haut de fourchette ANIL, borné à une hausse réaliste **+15 %** (`LOYER_UPLIFT_MAX`) — un loyer ne bondit pas de +40 % d'un coup | loyer actuel < cible |
| **financement** | apport pour cash-flow moyen ≥ 0 (dichotomie sur `montantEmprunte`) | cash-flow moyen < 0 & atteignable |

- **Ordre** : `[prix, ...milieu, financement]`. Le prix est TOUJOURS en tête
  (levier central), le financement TOUJOURS en dernier (levier d'appoint, pas une
  vraie optimisation). Seuls travaux + loyer (`milieu`) sont triés entre eux
  (flip-vers-achat puis cash-flow décroissant). Ne pas remettre le financement
  dans le tri.
- **Métriques par carte (avant → après)** : chaque carte affiche rendement net +
  cash-flow ; le prix ajoute prix d'achat + prix/m² ; loyer et travaux ajoutent le
  loyer. Portées par des champs optionnels de `Recommandation`
  (`prixAchatAvant/Apres`, `prixM2*`, `loyer*`) rendus dynamiquement par
  `buildPairs` (OptimiserView).
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

## Arguments par levier (accordéon discret)

Chaque reco porte un champ **`arguments?: Argument[]`** (`{ titre, detail,
verbatim?, source? }`) : une liste d'arguments concrets pour passer à l'action
(négocier, louer plus cher…), dont des **verbatim prêts à dire** au vendeur/
locataire. Affichés dans un **accordéon inline discret** sous chaque carte
(`ArgumentsAccordion`, replié par défaut, libellé par levier via
`LEVIER_ARG_LABEL` + compteur).

- **100 % déterministe**, construit dans `buildRecommandations`
  (`buildLevier*` → helpers `argsPrix`, arrays inline). Deux familles :
  **contextuels** (conditionnés par les données réelles — écart DVF, DPE ADEME,
  cash-flow simulé, fourchette ANIL — chiffres interpolés, avec `source`) et
  **méthode** (playbook statique). **Aucun chiffre inventé** ; le `verbatim` est
  une mise en mots (comme la narration), jamais une source de nombre.
- **Ton** : `detail` en tutoiement (l'investisseur) ; `verbatim` en vouvoiement
  (adressé au vendeur/locataire), affiché dans un bloc cité (liseré `accent-300`,
  fond `accent-50`, icône `Quote`).
- **`ANALYSE_VERSION = 3`** : analyses antérieures sans `arguments` → accordéon
  masqué (dégradation silencieuse, pas d'invite).
- Spec complète (contenu des 4 leviers) : `docs/spec-arguments-leviers.md`.

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

| Tab | Icône | Label desktop | Label mobile |
|-----|-------|---------------|--------------|
| Synthèse | `Gauge` | Synthèse | Synthèse |
| Analyse IA | `Sparkles` | Analyse IA | IA |
| Description | `Home` | Description du bien | Bien |
| Opération | `HandCoins` | Détails de l'opération | Opération |
| Simulation | `Calculator` | Simulation financière | Simulation |

Le label court est dans `shortLabel` (TABS). L'affichage utilise
`<span className="sm:hidden">{shortLabel}</span>` /
`<span className="hidden sm:inline">{label}</span>`. La barre de tabs
scrolle horizontalement sur mobile (`overflow-x-auto`).

## Skeletons

3 niveaux de skeleton fidèles à la structure réelle :

1. **Page-level** (`loading.tsx`) : Next.js Suspense, affiché pendant le
   chargement serveur. Reprend l'en-tête compact + tabs + verdict + cards.
2. **SyntheseSkeleton** : affiché quand `analysisPending` sur l'onglet
   Synthèse. Structure `flex-col-reverse` mobile / `flex-row` desktop,
   5 sous-notes en pied, 4 MetricCards avec label + badge + valeur + CTA.
3. **AnalyseIASkeleton** : affiché quand `analysisPending` sur l'onglet
   Analyse IA. Score gauge circulaire, verdict chips, synthèse texte,
   grille de 6 `SkeletonBloc`.

Les autres onglets (donnees, financiere, simulation) n'ont pas de skeleton
global — ils rendent immédiatement avec les données déjà chargées. Les
skeletons inline (`Skeleton` shimmer) sont utilisés par champ pendant les
recalculs (`rentPending`, `chargesPending`).

# Point d'entrée "Ajouter un bien"

Le CTA « Ajouter un bien » (`/appartements/nouveau`) n'est **plus dans la
navbar** : il est sur la home (`HomeView.tsx`), à droite de la dropdown de tri.
L'état vide (`EmptyHomeState.tsx`) garde ses propres points d'entrée. La navbar
ne contient donc que les liens de navigation + le wordmark.
