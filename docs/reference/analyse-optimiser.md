# Onglets "Analyse" et "Optimiser" — verdict, recommandations

> Référence de domaine — chargée seulement quand la tâche touche
> `AnalyseIA.tsx`, `OptimiserView.tsx`, `analyse/decision.ts`,
> `analyse/recommandations.ts`, `analyse/run.ts` ou `analyse/sources/*`.
> Pointeur depuis `AGENTS.md`.

# Onglet "Analyse" — fusion Synthèse + Analyse IA

L'ancien onglet "Synthèse" et l'ancien onglet "Analyse IA" ont été fusionnés en
un seul onglet **"Analyse"** (`src/components/AnalyseIA.tsx`), premier onglet
et onglet par défaut (tab key `"ia"`). `?tab=synthese` redirige vers `"ia"`
pour rétrocompatibilité.

`SyntheseView.tsx` a été **supprimé** — ne pas le recréer (il gardait sa
propre copie de `computeDecision` et un seuil de cash-flow codé en dur, deux
sources de dérive).

## Layout (de haut en bas)

1. **Carte verdict** — dégradé tonal (`from-white to-{emerald|amber|red}-50`),
   score global à droite dans une jauge circulaire (`VerdictGauge`, anneau
   épais 100px, stroke 8), titre verdict en Fraunces (`text-4xl` /
   `sm:text-5xl`), raison actionnable (jamais de score brut), puis ligne de
   sous-scores par bloc (couleurs `noteTone()`), puis cartes alertes/attention
   (critère ET bloc, triées alerte > attention, critere > bloc, max 3).
2. **MetricCards** — 4 cartes (Cash-flow, Rendement net, Prix au m², DPE) en
   grille, avec emphase conditionnelle sur négocie/passe.
3. **Bloc synthèse** — narration IA sur fond `bg-ink-100/40`.
4. **Sections plates** (`FlatSection`) — séparées par des `<hr>`, chaque bloc
   d'analyse (Prix, Locatif, Risques, Potentiel, Simulation) avec note,
   verdicts, highlights, faits, et narration.

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

Le trait et le chiffre de la jauge viennent de `DECISION_RING_STYLES`
(`scoring.ts`, voir `docs/reference/couleurs-scoring.md`), partagé avec
l'anneau de l'accueil.

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

| CTA | Onglet | Ancre (`id`) | Fichier de l'ancre |
|---|---|---|---|
| Rendement net | Détails de l'opération | `fin-resultats` | `ApartmentDetail.tsx` |
| Prix vs marché | Analyse | `bloc-prix` | `AnalyseIA.tsx` (`FlatSection`) |
| Prix au m² (fallback) | Détails de l'opération | `fin-achat` | `ApartmentDetail.tsx` |
| DPE | Analyse | `bloc-risque` | `AnalyseIA.tsx` (`FlatSection`) |

**Le cash-flow ne navigue plus** : la MetricCard « Cash-flow mensuel » et les
deux highlights du bloc Simulation ouvrent le panneau latéral
`CashflowDetailPanel` (`useCashflowDetail`). `HIGHLIGHTS_CASHFLOW`
(`AnalyseIA.tsx`) doit rester synchronisé avec `blocs/simulation.ts`.

---

# Onglet "Optimiser" — recommandations prescriptives (lecture seule)

L'onglet **"Optimiser"** (`src/components/OptimiserView.tsx`, 2e onglet, après
Analyse) est orienté **DÉCISION + RENTABILITÉ, pas le score**. Deux modes
selon le verdict actuel :

- verdict ≠ **Achète** → « En faire un achat ».
- verdict = **Achète** → « Acheter mieux ».

**Purement informatif : ne modifie JAMAIS le bien réel** (prix, loyer, dpe,
score, verdicts intacts).

## Un levier à la fois (`SelecteurLevier`)

L'écran affiche **UN SEUL levier**. Ce n'est PAS un écran de comparaison : le
moteur a déjà classé les leviers (prix en tête, financement en dernier) et la
vue d'ensemble vit dans l'onglet Analyse.

Sélection via un **contrôle segmenté** (`SelecteurLevier`) : compact, aligné
à gauche, fond `ink-100` avec pastille blanche active, rendu DANS le bandeau
`accent-50` du levier. État local (`actif`), jamais dans l'URL.

**Ne pas en refaire une barre d'onglets soulignée pleine largeur** — les
onglets de page changent l'URL, celui-ci est un état local ; leur ressemblance
mentirait sur le comportement. Garde `role="tablist"` / `aria-selected`.

Les segments ne portent **que** l'icône et le libellé du levier — pas de
badge « Achète ». `flipVersAchat` reste utilisé, mais par le moteur seul
(porte de matérialité et tri), pas par l'UI.

Ordre de lecture imposé, à ne pas réarranger :

1. **L'action à faire** — `reco.action`, en titre.
2. **Les chiffres impactés** — cartes `avant → après` (`buildPairs`).
3. **Les arguments** — preuves puis méthode.

Les points 1 et 2 vivent dans **une seule section** (le bandeau `accent-50`).

### Le chiffre pivot est PORTÉ PAR LE TITRE

Le pivot est le chiffre que l'investisseur **contrôle** (prix, loyer, budget,
apport) — jamais une conséquence (rendement, cash-flow). Un pivot fixé sur le
cash-flow mettrait mécaniquement le levier financement en tête, or c'est le
levier d'appoint.

**Il n'y a pas de carte pivot** : `reco.action` porte le chiffre (« Négocie à
272 800 € »). `buildPivot` ne fournit que le contexte (`label`, `avant`,
`delta`), pas la valeur cible — `null` pour travaux et financement (grandeur
sèche, déjà dans le titre).

### Bandeau d'alerte

Le `caveat` s'affiche en bandeau sous les chiffres. Rouge **uniquement** si
`caveatBloquant` est vrai (frein rédhibitoire nommé), ambre sinon.

## Verdict = source unique (`src/lib/analyse/decision.ts`)

`computeDecision(score, verdicts, ecartPct)` est la SEULE définition du
verdict Achète/Négocie/Passe, partagée par `AnalyseIA`, `OptimiserView` et le
moteur de recommandations. `ecartPrixMarche(prixBloc)` extrait l'écart au
marché du bloc Prix — avec une garde sur `.faits`.

## Moteur (`src/lib/analyse/recommandations.ts`)

`buildRecommandations(apt, ctx)` est appelé **dans `runAnalyse`**, au moment
où toutes les données externes (DVF, ANIL, DPE, géorisques, settings) sont en
portée. Chaque projection ré-invoque les **VRAIES fonctions de blocs** sur une
**COPIE modifiée** du bien (`computeDerived({ ...apt, prix: X })`), puis
`computeScoreGlobal` + `buildVerdicts` + `computeDecision` pour le verdict
projeté. Même moteur déterministe, mêmes données, zéro chiffre inventé, zéro
appel réseau/LLM. On ne mute jamais `apt`.

**Versioning** : `ANALYSE_VERSION = 4`. Analyses antérieures
(`recommandations == null`) → invite à « Relancer ». `== []` → « rien de plus
à optimiser » (positif). Les champs ajoutés en v4 (`montantEngage`,
`Argument.chiffre`) sont optionnels — dégradation silencieuse sur analyse v3.

## Les 4 leviers (ordre d'affichage FIXE : prix en tête, financement en dernier)

| Levier | Cible prescriptive | Affiché si |
|---|---|---|
| **prix** | prix EXACT à négocier pour basculer à « Achète » (dichotomie sur le prix). Si un frein hors-prix bloque, on le nomme et on chiffre quand même. « Acheter mieux » : médiane DVF ou −8 %. | toujours (prix + surface connus) |
| **travaux** | DPE→D, loyer premium +12 % (`LOYER_BOOST_RENO`), coût ~350 €/m² (`COUT_RENO_M2`) | DPE ∈ {E,F,G} |
| **loyer** | haut de fourchette ANIL, borné à +15 % (`LOYER_UPLIFT_MAX`) | loyer actuel < cible |
| **financement** | apport pour cash-flow moyen ≥ 0 (dichotomie sur `montantEmprunte`) | cash-flow moyen < 0 & atteignable |

La colonne « Affiché si » ne dit que la **faisabilité** — voir la porte de
matérialité ci-dessous.

## Porte de matérialité (`estMateriel`) — une reco doit RAPPORTER

Les gardes internes de chaque `buildLevier*` portent toutes sur l'ENTRÉE et
jamais sur le RÉSULTAT — cas réel observé : **1 662 € d'apport pour +9 €/mois**
de cash-flow, arithmétiquement exact mais sans intérêt à proposer.

`estMateriel(reco)` s'applique en **UN seul endroit**, sur les quatre leviers
réunis, juste avant le tri. Une reco est retenue si **l'une** de ces
conditions tient :

| # | Condition | Pourquoi |
|---|---|---|
| A | `flipVersAchat` | Change la décision d'achat : décisif par définition. |
| B | levier `travaux` | DPE E/F/G : valeur RÉGLEMENTAIRE, ne transite pas par le cash-flow. |
| C | levier `prix` et remise ≥ **5 %** (`BAISSE_PRIX_MIN_PCT`) | La remise EST la valeur ; sans ça un bien sans `loyer_retenu` perdrait le levier central. |
| D | Δcash-flow ≥ **25 €/mois** (`GAIN_CASHFLOW_MIN`) **ou** Δrendement ≥ **0,25 pt** (`GAIN_RENDEMENT_MIN`) | Barre chiffrée générale. |

Et, **en plus de D**, si le levier immobilise de la trésorerie
(`montantEngage > 0`) : `Δcash-flow × 12 / montantEngage ≥ 3 %`
(`RETOUR_CAPITAL_MIN`) — sinon « immobilise 50 000 € pour gagner 30 €/mois »
passerait la barre absolue en étant un mauvais emploi de trésorerie.

⚠️ **Ne pas soumettre `travaux` à la barre chiffrée** — sa rentabilité
cash-flow est souvent mauvaise à court terme alors que sa valeur (rendre le
bien louable) est la plus élevée des quatre leviers.

## Arrondis des cibles (`arrondiLisible`)

Les quatre cibles chiffrées (prix, loyer, travaux, apport) passent par
`arrondiLisible(n, sens)`, pas selon l'ordre de grandeur :

| Montant | Pas |
|---|---|
| ≥ 100 000 | 10 000 |
| ≥ 20 000 | 1 000 |
| ≥ 2 000 | 100 |
| ≥ 200 | 10 |
| < 200 | 5 |

⚠️ **Le SENS de l'arrondi protège la promesse** :

- **`"bas"` — ce qu'on espère OBTENIR** (prix négocié, loyer visé). Arrondir
  vers le haut casserait la garantie (prix cible = le plus HAUT qui bascule
  encore ; loyer cible déjà borné à deux maxima).
- **`"haut"` — ce qu'il faut ENGAGER** (travaux, apport). L'apport est le
  MINIMUM qui ramène le cash-flow à l'équilibre — l'arrondir vers le bas
  repasserait sous l'équilibre.

Ne pas « harmoniser » sur un `Math.round`.

Deux conséquences à respecter en modifiant le moteur :

- **Arrondir AVANT de dériver** (dans le levier prix, avant `blocsAtPrice`).
- **Redériver ce qui dépend du montant arrondi** — `montantCible` recalculé
  depuis l'apport arrondi.

**Tout filtrer est un état valide** : `recommandations === []` affiche déjà
« Rien de plus à optimiser » ou « Pistes indisponibles ».

⚠️ Comme les recos sont **persistées**, les biens analysés avant ce changement
gardent leurs leviers non-matériels jusqu'à la prochaine relance d'analyse.

- **Ordre** : `[prix, ...milieu, financement]`. Seuls travaux + loyer
  (`milieu`) sont triés entre eux (flip-vers-achat puis cash-flow décroissant).
- **Métriques (avant → après)** : rendement net + cash-flow partout ; le prix
  ajoute prix/m² ; travaux ajoute le loyer.
- **Emprunt qui suit l'opération** : négocier le prix baisse le montant
  emprunté (apport constant, `inputsAtPrice`) ; les travaux sont FINANCÉS
  (emprunt `loanAvant + coutTravaux`). Les frais de notaire sont recalculés
  depuis le nouveau prix par `applyLiveEstimates` (sauf si saisis
  manuellement).
- **`cashflowOf` utilise `mod.simulation_inputs`** (pas les inputs d'origine).
- **Sous-titre honnête** : vit dans le `TabHeader` de l'onglet, donc dans
  `ApartmentDetail`, pas dans `OptimiserView` — voir « Sous-titre honnête
  d'Optimiser » dans `AGENTS.md`. Lit `flipVersAchat` sur les recos.

## Popups de détail (rendement + cash-flow) & couleurs profil

- **Blocs Rendement net / Cash-flow cliquables** : ouvrent une popup latérale
  recalculée avec les valeurs proposées. Chaque reco stocke un champ
  **`patch`** (`RecommandationPatch`). Le client reconstruit le bien modifié
  via `computeDerived({ ...apt, ...reco.patch })` (COPIE, jamais persistée).
  Ne pas reconstruire le patch à la main côté client — le moteur le stocke.
- **`CashflowDetailPanel` / `CashflowDetailProvider`** : calqué sur
  `RendementDetailPanel`, monté dans `layout.tsx`
  (`RendementDetailProvider > LoyerDetailProvider > CashflowDetailProvider`).
- **Couleurs = seuils du profil investisseur** — voir
  `docs/reference/couleurs-scoring.md`. **L'ancienne valeur (avant) reste
  TOUJOURS grise** (`text-ink-500`) ; seule la nouvelle valeur proposée porte
  la couleur du profil.

## Arguments par levier — preuves et méthode

Chaque reco porte **`arguments?: Argument[]`** (`{ titre, detail, source?,
chiffre?, chiffreLabel? }`). Toujours visibles (pas d'accordéon), en deux
sections :

- **Les faits** — arguments portant une `source`. `chiffre` extrait dans un
  badge à fond `ink-50`, `chiffreLabel` en légende.
- **La méthode** — arguments **sans** `source`. Playbook, grille deux
  colonnes.

**C'est la présence de `source` qui trie.**

- **100 % déterministe**, construit dans `buildRecommandations`. **Aucun
  chiffre inventé.**
- **Textes courts** : titre de 3 à 5 mots, `detail` d'une phrase.
- **Ton** : tutoiement (l'investisseur).
- **Pas de verbatim** (champ retiré) — décision produit assumée. Si le besoin
  réapparaît, le traiter comme une fonctionnalité à part (bouton copier).
- Spec d'origine (contenu des 4 leviers) : `docs/spec-arguments-leviers.md` —
  antérieure à ce redécoupage, périmée sur l'emplacement UI ET sur le verbatim.

## `renovePremium` sur `buildBlocLocation`

Le levier travaux suppose une **rénovation haut de gamme** justifiant un loyer
**au-dessus de la fourchette ANIL**. Le 5e param optionnel
`opts.renovePremium` de `buildBlocLocation` **supprime la pénalité « loyer
optimiste »** dans ce seul cas. Défaut `false` — n'appeler
`renovePremium: true` que depuis le moteur de recommandations.

## Skeleton & recalcul

`OptimiserSkeleton` (dans `ApartmentDetail.tsx`) s'affiche quand
`analysisPending`. Les recos font partie de la sortie de `runAnalyse` → se
régénèrent à chaque « Relancer » / recalcul.

# Collecte des sources (`analyse/run.ts`, `analyse/sources/*`)

La latence d'une analyse est **géocodage + la source la plus lente + l'appel
LLM** : les blocs sont des fonctions pures, le scoring et les ~54 itérations de
dichotomie des recommandations pèsent moins de 50 ms au total. Toute
optimisation utile porte donc sur les E/S, jamais sur le calcul.

## Tout appel réseau d'une source passe par `sources/http.ts`

`getJson(url, { timeoutMs, revalidate })` — timeout, dégradation en `null` et
politique de cache en un seul endroit. Ne pas réintroduire de `fetch` +
`AbortController` local : ils existaient en six copies (DVF, Géorisques, ADEME,
délinquance, démographie, BAN), et le géocodage — le seul appel qui ne se
recouvre avec rien — était resté **sans timeout du tout**.

Le cache est le **Data Cache de Next** (`next: { revalidate }`), pas une `Map`
de process. L'ancienne mémoïsation (`sources/memo.ts`, supprimée) mourait à
chaque démarrage à froid et n'était partagée entre aucune instance. Trois
propriétés du Data Cache remplacent son prédicat `cacheable` : seules les
réponses **200** et les requêtes **GET/HEAD** sont mémorisées, et un en-tête
`authorization`/`cookie` désactive le cache. Un échec reste donc retentable —
c'est l'usage même du bouton « Relancer ».

⚠️ **Overpass est interrogé en GET** (`?data=`) pour cette raison, alors que
l'API accepte aussi le POST.

## OSM : course de miroirs, et cache sur le bundle CLASSÉ

Les trois miroirs Overpass ne sont **pas** essayés en série. Mesuré sur un
point de Marseille : 7,6 s de 504, puis 40,8 s, puis 16,7 s de succès — ~51 s
pour une analyse qui tenait sinon en 20 s. La saturation d'un miroir public est
la norme, pas l'incident. `courseMiroirs` lance le suivant après 4 s
(`DELAI_MIROIR_MS`) et garde le premier succès, timeout par miroir à 12 s.

Le décalage de 4 s n'est pas cosmétique : un `Promise.any` immédiat sur les
trois triplerait la charge imposée à des APIs publiques gratuites, alors que le
premier miroir répond seul la plupart du temps.

⚠️ Le cache d'OSM porte sur le **bundle classé** (`unstable_cache`), pas sur la
réponse HTTP : les trois miroirs sont trois URLs, donc trois entrées distinctes
— l'analyse suivante repartirait du miroir 1, le plus souvent saturé. Mémoriser
le bundle rend le cache indifférent au miroir, et stocke quelques centaines
d'octets au lieu des ~450 Ko de réponse brute. La fonction mémorisée **lève**
au lieu de renvoyer `null` (`unstable_cache` mémoriserait le `null`, et une
saturation passagère priverait le bien de son bloc Quartier pendant 30 jours).

Mesuré de bout en bout sur la vague de sources (Marseille 6e, `next start`) :
~20 s à froid, **~0,3 s** une fois le cache chaud ; un échec total d'Overpass
n'est pas mémorisé et la relance suivante retente bien.

## Dichotomies des recommandations

Les deux leviers qui cherchent un seuil (prix qui bascule en « Achète », montant
emprunté qui ramène le cash-flow à l'équilibre) passent par
`plusGrandQuiConvient` — 30 itérations, précision très en deçà de l'arrondi
lisible appliqué ensuite. ⚠️ Le prédicat doit être MONOTONE sur l'intervalle,
sinon la recherche converge vers un seuil arbitraire.

## Colonnes millésimées des jeux data.gouv

⚠️ Piège rencontré : la colonne du code commune du jeu SSMSI porte l'année du
découpage INSEE et est **renommée à chaque édition annuelle**
(`CODGEO_2025` → `CODGEO_2026`). L'API répond alors 400, que `getJson` traduit
en `null` : le bloc Potentiel perd sa composante sécurité **sans erreur
visible**. Voir `COL_CODGEO` dans `sources/delinquance.ts` — et vérifier les
colonnes réelles via l'endpoint `/profile/` de la ressource avant de conclure
à une panne réseau.

## Bloc Prix : deux périmètres DVF, jamais d'absence de note

L'adresse exacte est absente de la grande majorité des annonces au moment de
l'ajout. Le bloc Prix ne doit donc PAS conditionner sa note à cette saisie :
c'est le **périmètre de comparaison** qui s'adapte, pas la disponibilité du
bloc. Il pèse 0,3 dans la note globale — le laisser vide déclenchait
`BLOC_POIDS_SANS_PRIX` et privait l'écran de sa métrique la plus décisive pour
presque tous les biens.

| `precision_localisation` | Endpoint DVF | Périmètre | Libellé affiché |
|---|---|---|---|
| `"exacte"` | `geomutations/` (`in_bbox`) | rayon 500 m | `rayon 500 m` |
| sinon | `mutations/` (`code_insee`) | commune, arrondissement à PLM | `arrondissement/commune` |

Le choix se fait dans `run.ts` (`DvfPerimetre`), **d'après `precision`** — ce
que valent les COORDONNÉES — et non d'après `aAdressePrecise()`, qui ne dit que
ce que l'utilisateur a saisi. Les deux divergent quand la BAN ne résout
l'adresse qu'au niveau de la rue. `buildBlocPrix` lit ensuite
`dvf.perimetreLabel` / `dvf.rayonSerre` plutôt que de redéduire le périmètre :
le périmètre interrogé et le périmètre annoncé ne peuvent pas diverger.

⚠️ **Élargir le rayon n'est PAS une alternative** : `geomutations/` plafonne
l'emprise à **0,02° × 0,02°** et répond 400 au-delà, ce qui borne le rayon
utilisable à ~730 m à la latitude de Paris — à peine plus que les 500 m
actuels. D'où le changement d'endpoint plutôt qu'un simple rayon plus grand.

**Fiabilité, pas indisponibilité** : une médiane communale situe le secteur,
pas la rue (±20 % d'écart courant entre deux adresses d'un même quartier). La
note garde `FIABILITE_QUARTIER = 0.65` de son poids, le reste étant ramené vers
la neutralité (5) — même idiome que l'atténuation déjà appliquée aux petits
échantillons (`nbVentesRecent < 15`), et les deux se composent. L'invite reste
affichée mais devient une proposition d'affiner, jamais une condition.

Mesuré contre l'API (Paris 11e, bien de 45 m²) : rayon 500 m → 9 824 €/m² sur
160 comparables ; commune entière → 9 951 €/m² sur 513 comparables, soit 1 %
d'écart. Le périmètre communal est un proxy fiable, pas un pis-aller.

⚠️ **Requête par ANNÉE, jamais par fenêtre pluriannuelle.** L'API rend les
mutations de la plus ancienne à la plus récente et n'honore pas le tri
décroissant : une fenêtre de 3 ans qui sature la pagination ne renverrait que
ses premières années, donc une médiane calculée sur les prix les plus vieux —
le bien paraîtrait mécaniquement surcoté. Le découpage par année borne la
troncature à l'intérieur d'une année.

Budget de pagination volontairement plus serré côté commune
(`MAX_PAGES_COMMUNE = 2` contre `MAX_PAGES_RAYON = 4`) : `mutations/` ignore le
paramètre `fields` et renvoie l'objet complet (~245 Ko/page). Mille ventes par
an suffisent à une médiane stable — mesuré sur 2023 : Paris 11e 2 329 ventes,
Le Mans 1 116, Marseille 1er 679.

## `evolutionPct` : même cohorte de surface des deux côtés

Le prix au m² dépend fortement de la surface (un studio se vend structurellement
plus cher au m² qu'un T4). La fenêtre récente est filtrée sur la surface du bien
(±20 %, repli ±40 %) ; la fenêtre ancienne l'était **pas du tout**. L'écart
mesuré mélangeait donc la hausse réelle des prix et un simple **effet de
composition** — on ne comparait pas les mêmes logements.

`dansTolerance` applique désormais aux deux fenêtres la tolérance **choisie par
la fenêtre récente**. Deux raisons de ne jamais inverser ce sens :

1. La médiane récente porte la comparaison de prix (bloc de poids 0,3). La
   laisser s'élargir parce que 2014-2016 manque de ventes comparables
   dégraderait la métrique principale de l'écran au profit d'une sous-note.
2. Le levier « marché en recul » (`recommandations.ts`) affiche la paire de
   médianes **et** le pourcentage dans une seule phrase : les trois nombres
   doivent se réconcilier arithmétiquement. Cela interdit de calculer
   `evolutionPct` sur une cohorte différente de celle des médianes exposées.

Si la fenêtre ancienne n'a pas 3 ventes à cette tolérance, `medianeAncienne`
devient nulle et l'évolution n'est pas affichée — ne pas mesurer vaut mieux que
mesurer deux populations différentes.

⚠️ **Ampleur réelle, mesurée avant de corriger** : −2 pts à Marseille 7e, −1 à
Paris 11e, +7 au Mans. Le biais n'a **pas de direction systématique** (il dépend
de la position de la cohorte du bien dans le mix local des surfaces) et ne
franchissait aucun seuil de sous-note du bloc Potentiel (0 / 15 / 30 %) dans les
cas mesurés. Correction de justesse méthodologique sur un chiffre affiché, pas
un correctif de verdict — ne pas la présenter comme telle.

⚠️ Les hausses à ~50 % sur dix ans ne sont **pas** un artefact : elles sont
réelles (Marseille 7e +59 %, Le Mans +45 %, Paris 11e +24 % en like-for-like).

## Géocodage : le code postal est une CONTRAINTE, pas un mot-clé

`banSearch` (`src/lib/geocoding.ts`) passe le `code_postal` en **filtre**
`postcode=` de l'API BAN, avec repli sur la requête non filtrée si elle ne rend
rien (un code postal erroné doit dégrader, pas supprimer toute localisation).

⚠️ **Sans ce filtre, la BAN apparie le quartier à une rue homonyme d'un autre
arrondissement.** Cas réel : « Saint-Lambert, 13007 Marseille » (quartier du
7e) ressortait en « Boulevard Lambert, 13004 Marseille », code INSEE 13204 au
lieu de 13207. La recherche en texte libre pondère la ressemblance du libellé
et ne traite pas le code postal comme une contrainte.

La portée dépasse le pin de la carte : `code_insee` est la clé de jointure de
la délinquance, du revenu médian, du profil de commune, de la référence de
loyer ANIL et — depuis le passage au périmètre communal — de la comparaison de
prix DVF. Le bien ci-dessus était comparé au marché du 4e (médiane
2 778 €/m²) au lieu du 7e (4 652 €/m²) : « +53 % au-dessus du marché » affiché
avec l'aplomb d'un chiffre exact, là où le bien est en réalité 9 % EN DESSOUS.

Toute nouvelle source indexée sur `code_insee` hérite de cette correction — et
de sa fragilité : un quartier mal orthographié reste un mauvais appariement,
le filtre ne fait que le contenir dans le bon arrondissement.

## Narration : un seul appel, une seule tentative

`narrateAll` impose `SCHEMA_NARRATION` (`responseSchema`) — le format JSON est
garanti par l'API, plus par une expression régulière de rattrapage suivie d'un
second appel complet.

⚠️ **Ne pas réintroduire de boucle de retry dans `narration.ts`.** `gemini.ts`
a déjà tranché (`MAX_TENTATIVES = 1`, timeout 25 s) : ce qui compte est
l'attente ressentie, pas le taux de succès par appel. La boucle qui vivait ici
(2 tentatives séparées par 2,5 s) portait le pire cas à ~52 s pour un contenu
que l'analyse sait afficher sans — les narrations vides laissent les blocs
parfaitement exploitables.
