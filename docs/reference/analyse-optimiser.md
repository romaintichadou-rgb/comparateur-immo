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
   sous-scores par bloc (couleurs `noteTone()`), puis — au plus — l'avis
   d'interdiction de louer (voir « Un seul avis en tête »).
2. **Bloc synthèse** — narration IA sur fond `bg-ink-100/40`.
4. **Sections plates** (`FlatSection`) — séparées par des `<hr>`, chaque bloc
   d'analyse (Prix, Rendement, Risques, Potentiel, Simulation) avec note,
   verdicts, highlights, faits, et narration.

## Un seul avis en tête de la carte verdict : l'interdiction de louer

L'en-tête n'affiche **PLUS la liste des verdicts** (elle montait jusqu'à trois
cartes `alerte`/`attention`). Seul survit le verdict DPE **F ou G** —
`avisDpeEnTete()` (`scoring.ts`), lu depuis `blocs.risque.dpeGes.dpe`, rendu en
une ligne rouge sur le patron du `quotaNotice`.

**Pourquoi** — chaque autre carte était déjà lisible à moins de 100 px :

| Verdict | Où il était déjà |
|---|---|
| `origine: "bloc"` | relecture de la note affichée dans la rangée juste dessous — colorée par seuil ET cliquable vers le bloc, ce que la carte n'était pas |
| rendement (`critere`) | cité mot pour mot par `raisonDecision` : `buildVerdicts` l'empile en tête, donc c'est toujours lui que trouvent ses `find` |
| DPE E (`critere`) | échéance 2034 — ne pèse sur aucun arbitrage du moment ; reste dans le fait « Réglementaire — loi Climat » du bloc Risques et comme levier dans Optimiser |

S'y ajoutaient deux défauts propres à l'affichage :

- **Contradiction visible** — `computeDecision` ignore les alertes `origine:
  "bloc"` (voir `decision.ts`), donc un bien « Achète » pouvait afficher
  « Aucun frein détecté » directement au-dessus d'une carte rouge « Peu de
  potentiel ».
- **Verdicts fantômes** — la liste rendait le JSON stocké tel quel, y compris
  des verdicts qu'un `buildVerdicts` plus récent n'émet plus (un
  « Mauvais cash-flow mensuel » d'avant l'exclusion de `simulation` par
  `BLOCS_INFORMATIFS` s'affichait encore sur les analyses anciennes).

Mesuré sur un bien réel à 3 verdicts stockés : carte 691 → 391 px sur un
viewport de 375 px, 403 → 237 px en 1280 px.

⚠️ **Le filtre est un choix d'AFFICHAGE, à garder dans `AnalyseIA.tsx`.** Ne
jamais le remonter dans `buildVerdicts` : `computeDecision`, la narration
(`narration.ts`) et le frein bloquant d'Optimiser (`recommandations.ts`) lisent
TOUS les verdicts. Corollaire : `raisonDecision` est désormais le seul endroit
qui nomme le point décisif — une nouvelle branche qui cesserait de citer un
verdict rendrait cette information muette.

⚠️ **Conséquence assumée** — un bien classé `passe` par `score < 5` *sans*
aucun verdict rédhibitoire n'affiche plus que « Trop de points faibles pour un
investissement sain », sans nommer lesquels. La rangée de sous-scores juste
au-dessus EST cette énumération, colorée et cliquable.

`VERDICTS_DPE` (`scoring.ts`) est la table unique du calendrier loi Climat :
`buildVerdicts` émet les trois classes via `verdictDpe()`, l'en-tête ne retient
que les entrées `enTete`. Invariant tenu par l'UI : `enTete: true` implique
`niveau: "alerte"` — l'en-tête peint en rouge sans consulter le niveau.

## Verdict (décision à 3 niveaux)

`computeDecision(score, verdicts, ecartPct)` → `"achete"` | `"negocie"` | `"passe"` :
- **passe** si un verdict `alerte` existe OU `score < 5` ;
- **achète** si `score >= 7` ET aucun verdict `attention` ET pas de surcote
  (`ecartPct <= 5`) ;
- **négocie** sinon.

**Le bloc Simulation ne contribue ni au score global ni aux verdicts.**
Le cash-flow dépend du montage financier personnel (apport, taux, durée),
pas de la qualité intrinsèque du bien. Le bloc reste affiché (note, faits,
highlights) mais son poids est 0 dans `BLOC_POIDS` et `BLOC_POIDS_SANS_PRIX`,
et il est exclu de `buildVerdicts` (`BLOCS_INFORMATIFS`). Même traitement
que le bloc Quartier.

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

## Rangée de KPI (dans l'onglet Analyse, sous la card verdict)

Les 4 KPIs investisseur (Rendement net, Cash-flow mensuel, Prix au m², DPE)
sont rendus par **`AnalyseIA.tsx`**, entre la card verdict et le bloc
synthèse, en `grid-cols-2 xl:grid-cols-4`. Cash-flow et Rendement net ouvrent
leur panneau de détail au clic (`CashflowDetailPanel`, `RendementDetailPanel`).

⚠️ **Ce placement a déjà changé deux fois — ne pas le rebasculer sans lire
ceci.** La rangée a d'abord vécu dans l'onglet Analyse, puis a été remontée
dans l'en-tête de `ApartmentDetail` (« entre en-tête et onglets », visible sur
les cinq onglets) au motif d'éviter une duplication avec les blocs détaillés,
puis redescendue ici. Les deux positions ont un coût réel, à trancher
sciemment :

| Dans l'en-tête | Dans l'onglet Analyse (actuel) |
|---|---|
| lisible depuis Description / Opération / Simulation | visible seulement sur Analyse |
| pousse les onglets vers le bas sur tous les écrans | l'en-tête reste compact |
| pas de voisinage avec les mêmes chiffres | **les 4 valeurs réapparaissent plus bas** : rendement net dans le bloc Location, cash-flow dans Simulation, prix/m² et écart marché dans Prix, DPE dans l'échelle colorée de Risques |

La duplication de la colonne de droite est le vrai prix de la position
actuelle : la rangée est un résumé en tête d'écran, les blocs portent les
mêmes chiffres avec leurs sources et leur contexte.

⚠️ **Trois hooks de `AnalyseIA` alimentent cette rangée** (`useRendementDetail`,
`useCashflowDetail`, le `useMemo` de `simulate`) et doivent rester **au-dessus
du `if (!analyse)`** : un composant qui retourne tôt ne peut plus déclarer de
hook après (`react-hooks/rules-of-hooks`).

La rangée réutilise `ecartPct`, déjà dérivé du bloc Prix pour la décision —
l'en-tête en gardait un second calcul (`kpiEcartPct`) sur la même source.

`src/app/appartements/[id]/loading.tsx` place ses 4 cartes squelettes **après**
le bloc verdict : il correspond à ce placement, pas à celui de l'en-tête.

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

# Sous-pill "Recommandations" — recommandations prescriptives (lecture seule)

`OptimiserView.tsx` est rendu dans la sous-pill **"Recommandations"** de
l'onglet **"Optimiser"** (tab key `playground`, icône `SlidersHorizontal`).
L'autre sous-pill ("Playground") affiche `PlaygroundView` (simulateur
interactif). Navigation par pills capsules, état local — voir
`docs/reference/page-appartement-ui.md`.

L'écran est orienté **DÉCISION + RENTABILITÉ, pas le score**. Deux modes
selon le verdict actuel :

- verdict ≠ **Achète** → « En faire un achat ».
- verdict = **Achète** → « Acheter mieux ».

**Purement informatif : ne modifie JAMAIS le bien réel** (prix, loyer, dpe,
score, verdicts intacts).

## Tous les leviers en liste (`LevierCard` accordion)

L'écran affiche **TOUS les leviers** en cartes compactes empilées
verticalement, avec un accordéon pour le détail. État local
(`expandedIndex`), jamais dans l'URL.

Chaque carte résumé montre :

- **Icône colorée** dans un carré arrondi (`LEVIER_COLORS` : emerald/prix,
  amber/travaux, sky/loyer, violet/financement).
- **Titre** (`reco.titre`) au niveau CARTE — `TITRE_SECTION` (Fraunces
  `text-lg`) posé sur un `<p>` et non un `<h*>` : le contenu d'un `<button>`
  est du phrasing content, un heading y serait invalide. C'est le cas pour
  lequel la constante est exportée — ne pas recopier les classes à la main.
- **Description** (`reco.pourquoi`) en `text-sm ink-500`, `line-clamp-2` sur
  mobile et `sm:line-clamp-1` au-delà.
- **Badge « Achète »** si `flipVersAchat` — pastille emerald.
- **Badge impact** : Δ rendement (`+X,X % rdt`) ou Δ cash-flow
  (`+XX €/mois`), ou « Info » si l'impact est négligeable.
- **Chevron** animé (rotation 180° à l'ouverture).
- **Bordure gauche colorée** (4px, couleur du levier).

⚠️ Les deux pastilles sont déclarées **une fois** (`const badges`) et rendues à
DEUX emplacements : sous le titre en `sm:hidden`, à droite en `hidden sm:flex`.
À 375 px, trois éléments `shrink-0` sur la même ligne ne laissaient qu'une
soixantaine de pixels au titre, qui se cassait sur quatre lignes (AGENTS.md,
« les quatre pièges du mobile », n°4). Ne pas les remettre sur une seule
ligne en pensant simplifier.

Au clic, la carte s'ouvre (accordéon, une seule ouverte à la fois) et montre
le détail (`LevierDetail`) :

1. **L'action à faire** — `reco.action`, en `GroupTitle` (Fraunces
   `text-base`, `h3`), dans un bandeau `accent-50/50`. ⚠️ Niveau GROUPE et non
   section : le titre de la carte est déjà en `text-lg`, l'action est ce qu'il
   contient — en `text-lg` ici, l'enfant pesait plus lourd que son parent.
2. **Les chiffres impactés** — cartes `avant → après` (`buildPairs`).
3. **Le caveat** (bandeau ambre ou rouge).
4. **Les arguments** — « Les faits » puis « La méthode », chacun coiffé d'un
   **`GroupHeader`** (`as="h4"`, `count`, sous-titre d'une phrase). Ils
   portaient un `text-[11px] uppercase tracking-wider` maison, hors échelle
   typographique et sans sous-titre.

## États dégradés et terminaux : une seule carte (`DegradedCard`)

Les quatre sorties par `return` anticipé (pas d'analyse, recos absentes du
schéma, aucun levier modélisable, rien de plus à optimiser) passent toutes par
**`DegradedCard`** — `titre`, `texte`, `cta` facultatif, `tone`
(`neutre` → dégradé `accent-50` / `positif` → `emerald-50` quand l'état est
souhaitable). L'état « Rien de plus à optimiser » en était une copie
indépendante, avec son propre style de titre.

⚠️ Titre en **`SectionTitle as="h3"`** (`text-lg`) et non `text-2xl` : la carte
vit SOUS le `TabHeader` « Optimiser » (`text-xl`, `h2`). Un `text-2xl` y
faisait un enfant visuellement plus gros que son parent, et un second `h2` là
où la hiérarchie WCAG attend un `h3`.

## Section « Projection financière » (sous-pill Playground)

⚠️ Ce bloc vit dans **`PlaygroundView`** (`PlaygroundKpiSummary`), pas sous les
cartes de leviers d'`OptimiserView` — la doc le plaçait au mauvais endroit,
sous un nom de composant (`SimKpiCard`) qui n'existe pas.

Titre **« Projection financière »** et non « Simulation financière » : ce
dernier libellé est déjà celui d'un ONGLET de la fiche bien (crédit année par
année). Deux écrans différents sous le même titre.

4 KPIs en grille 2×2 :

| KPI | Source | Icône |
|---|---|---|
| **TRI** | `sim.tri` | `TrendingUp` accent |
| **Cash-flow moyen** | `sim.cashflowMensuelMoyen` | `Banknote` emerald |
| **Enrichissement net** | dernière année `.enrichissement` | `Landmark` violet |
| **Point mort** | 1re année où `enrichissement > 0` | `Check` sky |

Hypothèses affichées dans le **sous-titre du `GroupHeader`** (taux, durée,
TMI), formatées par `formatNombre` — sans quoi un taux s'affichait « 3.5 % »
avec un point décimal anglais.

Les libellés des cartes reprennent les tokens de `StatCard`
(`text-xs font-medium ink-500` pour le label, `text-xs ink-500` pour le
sous-texte) : les deux familles de cartes cohabitent dans l'onglet. Le
`text-[10px] ink-400` d'avant tombait aussi sous le contraste AA (3,64:1 sur
blanc).

## Titres et sous-titres du Playground : trois groupes nommés

`PlaygroundView` empilait trois blocs dont deux n'étaient pas nommés du tout.
Chacun porte désormais un `GroupHeader` :

| Groupe | Titre | Contrôle dans l'en-tête |
|---|---|---|
| `ComboSimulator` | Simulateur prix, loyer et apport | — |
| `PlaygroundKpiSummary` | Projection financière | — |
| Courbes | Courbes de seuils | bascule **Par prix / Par loyer / Par apport** |

⚠️ La bascule de facteur est le CONTRÔLE du groupe « Courbes de seuils », elle
vit dans son en-tête (`children`) et non flottante au-dessus : isolée, rien ne
disait ce qu'elle commandait. Son sous-titre suit le facteur actif.

## Le curseur d'apport

Troisième paramètre du simulateur, à côté du prix et du loyer. Détail du modèle
(pourquoi l'apport n'est pas un champ stocké, pourquoi il ne touche pas le
rendement) : **`docs/reference/simulation-financiere.md`**, section
« `planFinancement()` ».

- **Valeur de départ = l'apport du plan ENREGISTRÉ**, pas 0 : en mode auto et
  financement `hors_notaire`, l'apport vaut déjà les frais de notaire. Le repère
  du curseur est libellé « Plan actuel » (et non « Annonce » comme prix et
  loyer : une annonce ne porte pas de plan de financement).
- **Plage** : 0 (prêt à 110 %) → coût total (achat comptant). La borne haute
  suit le prix simulé. Raccourcis : « Prêt à 110 % », « Comptant », et
  « Cash-flow vert · X » — pendant du « Seuil vert » du prix, sur le seul
  indicateur que l'apport déplace.
- ⚠️ **La clé de réinitialisation se dérive du bien ENREGISTRÉ, jamais de
  `comboPrix`** : le coût total dépend du prix, donc une clé calculée sur le
  curseur remettrait l'apport à sa valeur d'origine à chaque mouvement du
  curseur de prix.
- ⚠️ **Le héros du panneau (« Rendement net simulé ») ne bouge pas** avec
  l'apport. Une mention l'annonce dès que l'apport s'écarte du plan, et le
  panneau porte les deux lignes que l'apport pilote vraiment : **Mensualité** et
  **Emprunt**. Sans elles, le curseur passe pour cassé.
- ⚠️ **Courbe rendement MASQUÉE sur l'axe apport** : elle serait une droite
  horizontale, qu'on lirait comme « rien ne s'améliore ». Seule la courbe
  cash-flow s'affiche, en pleine largeur, et le sous-titre dit pourquoi.

### `simulerCombo` — un seul bien modifié pour tout le Playground

`ComboSimulator` et `PlaygroundKpiSummary` reconstruisaient chacun leur copie du
bien. Tant que seuls le prix et le loyer bougeaient, les deux copies restaient
d'accord par hasard ; avec l'apport elles doivent porter le MÊME
`montantEmprunte`. `simulerCombo()` est désormais l'unique constructeur, son
résultat descend en prop, et **`computeDataPoints` passe par lui aussi** — sinon
les courbes resteraient en financement automatique pendant que le panneau
au-dessus d'elles est à apport figé.

Les titres des deux courbes (`ThresholdChart`) sont sous le niveau H3 : ils
utilisent `LABEL_BLOC` et non un `font-display text-sm`, qui n'existe nulle
part dans l'échelle typographique.

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

## Périmètre de comparaison : deux échelles, jamais d'absence de note

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

### `analyse/perimetre.ts` — source unique de la finesse de localisation

**Trois niveaux de précision**, reportés tels quels depuis le `type` de la BAN
(`geocoding.ts`). ⚠️ `street` et `municipality` étaient écrasés sur une même
valeur « approximative », ce qui rendait indiscernables le milieu d'une voie et
le centre d'une commune — plusieurs kilomètres d'écart.

| `precision_localisation` | BAN `type` | Le point désigne | `coordsAuBatiment` | `coordsDansLeSecteur` |
|---|---|---|---|---|
| `exacte` | `housenumber` | le bâtiment | ✅ | ✅ |
| `rue` | `street` | le milieu de la voie | ❌ | ✅ |
| `arrondissement` | `locality`, `municipality` | le centre du quartier / de la commune | ❌ | ❌ |

⚠️ Le repli « secteur » de `geocodeApartmentLocation` (quartier/ville) force
toujours `arrondissement`, **même si la BAN répond par une rue** : cette rue est
la mieux notée du quartier, pas celle du bien.

**Deux prédicats, deux besoins** — ne pas les confondre :

| Consommateur | Prédicat | Pourquoi |
|---|---|---|
| DVF, Carte des loyers ANIL, `/api/estimate-rent` | `perimetreAnalyse()` (= `coordsDansLeSecteur`) | un rayon ancré sur la voie contient le bien |
| OpenStreetMap (commodités, vie de quartier, gare, occupation du sol) | `coordsDansLeSecteur` | tout se mesure en rayon autour du point |
| Géorisques — **aléa argile seul** | `coordsDansLeSecteur` | maille fine, varie dans la commune |
| Jointure DPE ADEME | `coordsAuBatiment` | jointure par identifiant BAN : un identifiant de VOIE n'apparie rien |

Le critère porte sur ce que valent les **COORDONNÉES**, jamais sur ce que
l'utilisateur a **SAISI** (`aAdressePrecise()`, qui ne sert plus qu'à choisir
une formulation).

⚠️ **Les sources ponctuelles ne se gardent PAS sur `hasCoords`.** Avoir des
coordonnées ne dit pas qu'elles valent quelque chose. Sans adresse, OSM et
l'aléa argile tournaient autour du centroïde communal et le résultat
s'affichait comme un fait sur le bien — « gare à 900 m », « argile : exposition
moyenne », ce dernier sous une étiquette `perimetre: "adresse"` codée en dur,
reprise telle quelle dans le prompt de narration (`narration.ts` sérialise
`f.perimetre`). Mesuré à Lille : argile **faible** rue de Thumesnil,
**moyenne** au centroïde de la commune — deux codes, deux pénalités, deux
couleurs.

⚠️ **Trois des quatre champs Géorisques sont COMMUNAUX** malgré des endpoints
qui prennent des coordonnées (radon publié par commune, zonage sismique
réglementaire par commune, `gaspar/risques` communal). Ils restent interrogés
quelle que soit la précision : couper tout le bloc perdrait trois données
valides.

⚠️ **La liquidité du marché (bloc Potentiel, poids 0,30) n'a aucune garde de
précision.** Un volume de ventes DVF se lit à l'échelle communale — c'est sa
maille naturelle. La garde qui existait supprimait ce critère dès qu'il manquait
un numéro de voie, alors que la donnée était disponible, et la note du bloc se
renormalisait en silence sur les critères restants.

⚠️ **`runAnalyse` renvoie la localisation qu'il recalcule, et l'appelant la
persiste** (`patchLocalisation`). Il ne persistait que `code_insee` ; comme
`reestimation.ts` lit la précision STOCKÉE pendant que l'analyse re-géocode à
chaque exécution, jeter la précision fraîche rouvrait la divergence de périmètre
dès que la BAN enrichissait une voie de ses numéros. `patchLocalisation`
n'écrase jamais une valeur connue par un `null` : un géocodage en échec ne doit
pas effacer le pin de la carte.

⚠️ **Un seul type `PerimetreAnalyse`, pas un par source.** `run.ts` construit UN
objet et le passe tel quel à `fetchDvf` ET `fetchLoyerRef` : deux sources ne
*peuvent* plus recevoir deux échelles différentes pour un même bien. Ne pas
réintroduire un `DvfPerimetre` / `LoyerPerimetre` séparé.

⚠️ **`/api/estimate-rent` partage le même périmètre** (`reestimation.ts`). Le
bloc Rendement juge ce loyer contre SA référence et en tire le « +X % vs
marché » : avec deux périmètres, il comparait le loyer à une autre référence que
celle qui l'a produit. Le surcoût réseau est absorbé par le Data Cache de Next
(reverse-géocodages BAN, 30 jours).

Chaque bloc affiche ensuite le libellé porté par la DONNÉE
(`dvf.perimetreLabel` / `dvf.rayonSerre`, `LoyerData.perimetreLabel`) plutôt que
de redéduire le périmètre depuis `precision` : le périmètre interrogé et le
périmètre annoncé ne peuvent pas diverger.

⚠️ **Périmètre demandé ≠ périmètre obtenu, côté ANIL** : la Carte des loyers ne
descend jamais sous la commune. Un rayon de 500 m qui ne traverse qu'une seule
commune rend exactement la valeur communale — l'annoncer « rayon 500 m »
promettait une finesse que la donnée n'a pas. Voir
`docs/reference/estimation-loyer-charges.md`.

### DVF dicte la durée de l'analyse — et c'est une API de PRÉPRODUCTION

Mesuré source par source sur un bien réel (rue de Thumesnil, Lille), collecte
complète en parallèle :

| Source | Temps | |
|---|---|---|
| **DVF (Cerema)** | **5 384 ms** | ██████████████████ |
| Délinquance | 952 ms | ███ |
| Profil commune | 525 ms | █ |
| Revenu médian | 497 ms | █ |
| Géorisques | 359 ms | █ |
| ANIL (5 reverse-géo) | 350 ms | █ |
| OSM (bundle, course de miroirs) | 7 ms | |

La vague dure exactement le temps de DVF ; géocodage compris, 5 771 ms au
total. **Optimiser une autre source ne peut rien donner** tant que DVF domine.

⚠️ `apidf-preprod.cerema.fr` est une instance de PRÉPRODUCTION, et se comporte
comme telle. Sur données froides : 38 s (Bordeaux), 60 s sans aucune réponse
(Toulouse), contre ~300 ms une fois le cache serveur chaud. **Toute mesure
comparative sur cette API est faussée par l'ordre des essais** — deux
protocoles successifs ont donné des résultats opposés avant qu'un préchauffage
ne le révèle. Ne pas conclure d'un A/B naïf.

`BUDGET_MS` (12 s) plafonne la collecte DVF entière, échéance PARTAGÉE par les
deux fenêtres. Dégradation gracieuse : les pages déjà obtenues sont conservées,
on cesse seulement d'en demander. Vérifié sur la commune de Lille — 12,0 s au
lieu de ~70 s, 1 994 ventes conservées, **médiane inchangée à 4 069 €/m²**.

⚠️ **Ne PAS fusionner les requêtes par année en une requête de plage** pour
réduire les allers-retours : l'avertissement de `fetchWindow` explique
pourquoi (tri ascendant non contournable → une fenêtre saturée ne rend que ses
années les plus anciennes → médiane sous-estimée → bien mécaniquement
« surcoté »). Le gain de temps apparent d'un tel regroupement est un artefact
de cache serveur, pas un vrai gain.

⚠️ **La bbox est STABLE, c'est son CENTRE qui change tout.** Vérifié : la même
requête rendue trois fois de suite donne rigoureusement le même résultat (39
ventes, 3/3). En revanche, déplacer le centre du disque de 500 m le long de la
même rue fait passer l'échantillon de 39 à 194 ventes, et la cohorte de
surfaces comparables de 4 à 43.

Conséquence directe sur la note de prix : à `precision = "rue"`, le disque est
centré sur le MILIEU de la voie, qui peut être à quelques centaines de mètres du
bien — et l'échantillon DVF n'a alors rien à voir avec celui du bâtiment réel.
C'est l'argument le plus fort en faveur d'une adresse complète, bien plus que le
confort d'affichage. Ne jamais diagnostiquer un écart de médiane sans avoir
d'abord vérifié les coordonnées exactes utilisées.

### Critère CONTINU → `interpole`. Critère CATÉGORIEL → escalier assumé.

C'est la distinction qui décide de la forme d'un barème. Se tromper de côté
produit soit des falaises arbitraires, soit une fausse précision.

| Bloc | Entrées | Forme | Pourquoi |
|---|---|---|---|
| Prix | écart au marché (%) | `interpole` | grandeur continue |
| Potentiel | évolution (%), nb de ventes, ratio délinquance, nb de commodités | `interpole` ×4 | 4 grandeurs continues |
| Rendement | rendement net (%) | linéaire par morceaux (déjà) | grandeur continue |
| Risques | étiquette DPE/GES, classe radon, zone sismique | **escalier** | valeurs discrètes dans la source |

⚠️ **Ne jamais noter un critère continu par une cascade de ternaires.** Elle est
plate à l'intérieur d'une marche et saute à la frontière. Mesuré sur Potentiel
avant migration : l'évolution des prix rendait la MÊME note de 0 % à +14 %, puis
bondissait de 0,8 point entre +14 % et +15 %. Et la liquidité notait 77 ventes
comme 40 (« au-dessus du palier 40 »), alors que 77 est presque au palier 80.

⚠️ **Ne jamais lisser un critère catégoriel.** Il n'existe pas de DPE « D,5 » ni
de zone sismique 2,4. L'escalier du bloc Risques reflète le réel ; ses grands
écarts aussi — la chute E → F (6,8 → 2,8 /10) épouse le seuil légal
d'interdiction de louer en 2028, elle n'est pas un artefact de barème.

Les plateaux **extrêmes** de `interpole` (avant le premier ancrage, après le
dernier) sont volontaires : au-delà d'un certain niveau, « c'est excellent » ne
se nuance plus. Ce sont les plateaux **intermédiaires** qui sont des défauts.

**Deux plateaux connus, laissés en l'état** — à ne pas « corriger » sans
décision produit : DPE A, B et C valent la même note de risque (l'excellence
énergétique n'est pas récompensée, seul le risque d'interdiction compte) ; et
le libellé « Critique » couvre tout le bas de l'échelle (0–3,5), donc un bien à
+17 % et un bien à +50 % portent le même mot.

### Une donnée absente ne doit ni récompenser ni punir

⚠️ **Deux façons d'agréger des sous-critères, une seule est neutre à l'absence.**

| Bloc | Agrégation | Effet d'un critère manquant |
|---|---|---|
| Potentiel | moyenne pondérée (`scoreSum / weightSum`) | **neutre** — la renormalisation absorbe l'absence |
| Risques | somme de pénalités (`5 − Σ p`) | **biaisé** — une pénalité absente = points gratuits |

Le bloc Risques a donc besoin d'une règle explicite : un aléa non mesuré prend
la valeur **médiane de son échelle** (`PENALITE_NEUTRE`), jamais zéro. Sans
elle, couper l'aléa argile sous le niveau `rue` faisait qu'un bien SANS adresse
obtenait mécaniquement une meilleure note qu'avec — « moins de données =
meilleure note », et deux biens qui ne se comparent plus.

Mesuré, même bien et même DPE, seul l'aléa argile variant :

| Argile | Note Risques |
|---|---|
| faible (mesurée) | 8,6 /10 |
| **non mesurée** | **8,4 /10** |
| forte (mesurée) | 8,2 /10 |

La valeur non mesurée tombe entre les deux : renseigner l'adresse améliore la
note en zone saine, la dégrade en zone exposée. Avant la règle, elle valait
8,6 — le meilleur cas possible, gratuitement.

**Limite connue** : `risquesCommune` (gaspar) rend une liste vide aussi bien
pour « aucun risque recensé » que pour un appel en échec. Les deux sont
indistinguables côté client, aucune règle neutre n'est donc applicable — c'est
volontaire, pas un oubli.

### Le bloc Quartier dépend de l'adresse, lui aussi

Il est le **quatrième** consommateur de `inviteAdresse` (après Prix, Potentiel
et Risques). Conditionner OpenStreetMap à la précision lui retire la moitié de
ses faits — gare, caractère, vie de quartier — et il devenait simplement
silencieux, sans dire pourquoi. Son `messageIndisponible` distingue désormais
la panne de source (« indisponibles pour ce bien ») de la cause actionnable
(position au niveau de la commune).

⚠️ `AnalyseIA.tsx` ne propose « clique sur Relancer » que si le bloc n'a PAS
d'invite : relancer ne répare pas une adresse manquante.

### La narration reçoit un garde-fou de précision

`narrateAll(..., precision)` injecte `CAVEAT_NARRATION` dans le prompt. Le
modèle ne recevait aucune indication de précision : on lui retirait les faits
de quartier sans lui dire pourquoi, ce qui laisse un conseiller libre de les
reconstituer de mémoire. Trois niveaux, cohérents avec les
`CAVEAT_LOCALISATION_*` de `rentEstimation.ts` — les faire diverger ferait
parler les deux moteurs de la même position avec deux prudences différentes.
Précision absente → garde-fou le plus strict, jamais aucun.

### `inviteAdresse()` — une seule formulation pour les trois blocs

Trois blocs perdent en finesse sans position au bâtiment (**Prix**,
**Potentiel**, **Risques**), et les trois l'annonçaient dans des mots
différents : deux invites rédigées chacune de leur côté, plus une phrase noyée
dans les « données manquantes » du bloc Risques. Le lecteur voyait trois
messages sans comprendre qu'ils décrivent UNE cause et se règlent d'UN geste.

`inviteAdresse(apt, precision, { requiert, gain })` impose la structure
**constat → action → gain** ; seul `gain` varie d'un bloc à l'autre, le constat
et le verbe sont communs. Ajouter un bloc dépendant de l'adresse = passer par
cette fonction, jamais rédiger une quatrième variante.

⚠️ **`requiert` n'est pas décoratif.** Prix et Potentiel se contentent du niveau
`rue` et doivent donc se TAIRE à ce niveau — sinon ils réclament un numéro qui
ne changerait rien à leur calcul. Les Risques exigent `exacte` (jointure DPE par
identifiant BAN). Une invite unique envoyait forcément un mauvais message à
l'un des trois.

⚠️ **Deux constats, pas un.** « Renseigne l'adresse exacte » se lit comme un
reproche absurde quand le champ Adresse est déjà rempli et qu'il ne manque que
le NUMÉRO de voie — l'invite envoyait corriger un champ sans défaut visible.
`aAdressePrecise()` sert *uniquement* à ce choix de formulation, jamais à
arbitrer un périmètre.

**Placement** : la bannière se rend **sous le titre de section**, avant la
narration et les chiffres (`FlatSection`, `AnalyseIA.tsx`) — elle qualifie le
périmètre sur lequel tout le bloc est calculé, donc elle se lit avant les
chiffres qu'elle qualifie. Elle est volontairement **hors du test
`bloc.disponible`** : un bloc sans données est le cas où elle a le plus à dire.

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
troncature à l'intérieur d'une année. Second bénéfice, exploité ci-dessous :
le résultat reste ventilé par millésime, ce qui permet de choisir la profondeur
de la fenêtre APRÈS la collecte, sans requête supplémentaire.

Budget de pagination volontairement plus serré côté commune
(`MAX_PAGES_COMMUNE = 2` contre `MAX_PAGES_RAYON = 4`) : `mutations/` ignore le
paramètre `fields` et renvoie l'objet complet (~245 Ko/page). Mille ventes par
an suffisent à une médiane stable — mesuré sur 2023 : Paris 11e 2 329 ventes,
Le Mans 1 116, Marseille 1er 679.

## Fenêtre récente ADAPTATIVE : on desserre le temps avant la surface

La médiane récente n'est plus calculée sur une fenêtre fixe de 3 ans. On part
du **millésime le plus récent** et on ne remonte dans le temps que tant que
l'échantillon n'atteint pas `SEUIL_ECHANTILLON_FIABLE` comparables à ±20 %.

**Pourquoi ne pas garder 3 ans.** Une fenêtre pluriannuelle estime le prix du
MILIEU de la fenêtre : son biais vaut à peu près la dérive annuelle du marché.
Mesuré (rayon 500 m, comparables ±20 % autour de 60 m², médiane 2023-2025 contre
2025 seul) : +0,8 % à Paris 11e, −1,1 % à Marseille 7e, +2,5 % à Angers,
**+8,8 % au Mans**. Au barème de `buildBlocPrix` (0,15 point de note par point
d'écart au-dessus du marché), le dernier cas vaut ~1,3 point sur un bloc de
poids 0,3 — le bien paraît surcoté parce que le marché a baissé depuis.

⚠️ **Pourquoi ne pas figer non plus à un an.** Le biais temporel est maximal là
où l'échantillon annuel est le plus maigre, et le bruit y dépasse alors le biais
qu'on prétendait corriger. Erreur-type de la médiane (bootstrap 2 000 tirages) :

| Secteur | 1 an | 3 ans | comparables ±20 %/an |
|---|---|---|---|
| Paris 11e | ±1,4 % | ±1,1 % | 120-143 |
| Angers centre | ±3,1 % | ±1,6 % | 59-70 |
| Marseille 7e | ±4,9 % | ±2,0 % | 83-96 |
| Le Mans centre | ±5,5 % | ±2,8 % | 25-35 |
| Vierzon centre | — | — | 4-14 selon la surface |
| Angers périphérie | — | — | **0-5** |

Pire : sous `SEUIL_TOLERANCE` comparables, l'échelle de tolérance élargit la
SURFACE, et l'effet de taille (studio contre T4, jusqu'à 30 % d'écart de
prix/m²) est un biais bien plus gros que la dérive temporelle visée. D'où
l'ordre des deux desserrages, qui n'est pas interchangeable : **temps d'abord,
surface en dernier recours.**

`SEUIL_ECHANTILLON_FIABLE` est exporté et partagé avec `blocs/prix.ts`, où il
arrête l'atténuation de la note vers la neutralité. Les laisser diverger donne
le pire des deux mondes — une fenêtre élargie jusqu'à un volume que le bloc
juge encore trop mince, ou l'inverse.

### Deux libellés, deux populations

| Champ | Population | Consommateur |
|---|---|---|
| `recentLabel` | millésimes RETENUS pour la médiane | fait « Prix/m² médian comparable », leviers de négociation |
| `volumeLabel` + `nbVentesTotal` | TOUTE la fenêtre collectée | critère « liquidité du marché » (bloc Potentiel) |

⚠️ **Ne pas réaligner `nbVentesTotal` sur la fenêtre adaptative.** Les seuils de
liquidité (15 / 40 / 80 / 150) sont calibrés sur un volume pluriannuel : le
brancher sur une fenêtre qui se resserre à un an en zone dense diviserait le
comptage par deux ou trois et ferait chuter la note d'un secteur devenu… plus
liquide.

⚠️ **Aucun libellé de période en dur.** La profondeur change d'un bien à
l'autre : tout texte affiché doit lire `recentLabel` / `volumeLabel`. Le levier
« le prix dépasse les ventes réelles du quartier » annonçait « sur les 3
dernières années » quelle que soit la réalité.

Les millésimes affichés sont ceux **réellement couverts**, jamais ceux demandés.
La requête porte toujours sur l'année en cours, vide pendant ~8 mois (DVF paraît
deux fois par an, avec ~8 mois de retard : au 15/08/2026 l'année 2026 renvoie
0 vente, les données s'arrêtant au 31/12/2025). Le fait annonçait « 2024–2026 »
sur des données arrêtées fin 2025. Cette requête n'est pas perdue pour autant :
c'est par elle qu'arrive le millésime partiel dès sa publication. Une année dont
la requête ÉCHOUE (l'API est une préproduction instable) sort du libellé de la
même façon — ce qui est affiché est ce qui a servi.

⚠️ **Une fenêtre glissante de 12 mois n'est pas implémentable côté API.**
`datemut_min` / `datemut_max` sont acceptés puis ignorés (même `count` avec et
sans : Paris 11e 2025 → 2 386 dans les deux cas) ; seul `anneemut_min/max`
filtre. Le champ `datemut` étant présent dans la réponse, un filtrage glissant
resterait faisable côté client — sans gain réel, le retard de publication faisant
déjà de « les 12 derniers mois » le dernier millésime complet.

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
