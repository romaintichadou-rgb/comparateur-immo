# Graphiques (dataviz) — approche obligatoire

Domaine à lire avant d'ajouter ou modifier tout graphique (chart) dans l'app,
en complément de la charte graphique générale (`AGENTS.md`).

## Méthode : toujours passer par le skill `dataviz` avant de coder

Ordre imposé (voir le skill pour le détail) : choisir la forme du graphique →
assigner la couleur par le JOB qu'elle fait (jamais décorative) → **valider la
palette avec `scripts/validate_palette.js`, jamais à l'œil** → appliquer les
mark specs → ajouter la couche d'interaction (hover/tap par défaut, ce n'est
pas une option) → passe accessibilité finale (légende, table, dark mode,
texture). Un chart qui saute une de ces étapes est à reprendre.

## Librairie : `d3-shape` + `d3-scale`, jamais un kit de charts clé en main

**Écartées, avec raison** (toutes réévaluées, y compris Recharts) :

| Lib | Raison de l'écart |
|---|---|
| **Recharts, ApexCharts, Nivo, ECharts** | Rendu "dashboard" générique par défaut ; obtenir un rendu haut de gamme (dégradé, courbe lissée, animation d'entrée sur-mesure) demande de fighter la lib plutôt que de composer — alors que le projet écrit déjà du SVG bespoke à ce niveau (`DonutChart`, `StackedBarChart` dans `src/components/charts/`) |
| **Chart.js** | Rendu Canvas — pas stylable en Tailwind élément par élément, accessibilité DOM perdue |
| **Tremor / shadcn-charts** | Système de tokens de couleur concurrent — viole « ne jamais inventer de style, réutiliser l'existant » |
| **D3 brut (tout le paquet)** | Aucun idiome React ; `d3-shape`/`d3-scale` seuls suffisent, pas besoin du reste |

**Retenu : `d3-shape` (générateurs de courbe/aire) + `d3-scale` (échelles) +
`Framer Motion`** (animation d'entrée, micro-interactions). Continue le style
SVG déjà en place dans `SimulationFinanciere.tsx`, sans imposer une identité
visuelle étrangère, et sans réécrire à la main la trigonométrie que ces deux
paquets fournissent déjà (`curveMonotoneX` pour les courbes lissées, échelles
linéaires/de bande).

## Mark specs validés pour cette app

- Barres : **≤ 24px** d'épaisseur (jamais toute la largeur de la bande — le
  reste est de l'air), **coin arrondi 4px côté valeur, carré à la ligne de
  base**, 2px d'écart entre barres adjacentes.
- Lignes : **2px**, jointures arrondies.
- Aire : la teinte de la série à **~10-22% d'opacité**, jamais un aplat.
- Grille / ligne zéro : **hairline solide 1px** (`ink-200` grille, `ink-300`
  ligne zéro) — **jamais en pointillé**, contrairement à un réflexe courant.
- Labels directs : **seulement sur les valeurs extrêmes** (min et max de la
  série) — jamais un chiffre sur chaque barre/point. Le reste passe par le
  tooltip au survol/tap et par une table de données repliable (`<details>`),
  toujours présente — c'est l'équivalent accessible, pas une option.

### ⚠️ Piège : dégradé CSS sur un élément de largeur VARIABLE

Bug rencontré en prod (jauge Verdict, `TrendBar` dans `AnalyseIA.tsx`) : un
`linear-gradient(...)` posé en `background` sur un élément dont la **largeur
représente une valeur** (ex. remplissage jusqu'au curseur d'un score) a ses
stops (`0%`/`46%`/`100%`) relatifs à la largeur de CET ÉLÉMENT, pas à la
piste entière. Un score bas → élément étroit → tout le dégradé rouge→vert se
compresse dans cette largeur réduite → le remplissage finit en VERT alors
que le score est encore dans la zone rouge (« Passer » affichant du vert).

**Fix** : ancrer le dégradé sur la largeur FINALE cible via `backgroundSize:
${(100 / cursorPct) * 100}% 100%` + `backgroundPosition: "left"` — le
dégradé rendu se réduit alors proportionnellement à l'élément (y compris
pendant une animation de largeur), donc la couleur à une position donnée
reste TOUJOURS celle de la vraie échelle 0-100, jamais compressée. Tout
futur dégradé posé sur un élément à largeur variable (jauge, barre de
progression) doit suivre ce pattern — ne jamais laisser `background-size`
implicite dès que la largeur de l'élément n'est pas fixe.

## Couleur

- **Cash-flow annuel : couleur par SEUIL (`cashflowTone`), pas par signe
  brut.** Réutiliser les mêmes seuils que la carte Analyse et le tableau
  existant (`docs/reference/couleurs-scoring.md`) — ne pas coder un simple
  `valeur >= 0 ? emerald : red`, ça diverge de la logique déjà établie
  ailleurs dans l'app pour ce même chiffre. (La maquette de preview utilise un
  dégradé vert/rouge par signe pour la démo visuelle — c'est une
  simplification de mockup, pas la règle de couleur à implémenter.)
- **Séries neutres à une seule courbe (ex. trésorerie cumulée) : `accent-600`
  seul.** Pas de légende nécessaire pour une série unique — le titre de la
  carte suffit.
- Toute nouvelle palette catégorielle (3+ séries distinctes) doit être validée
  avec `validate_palette.js` avant d'être utilisée — voir le skill `dataviz`.
  Résultat déjà vérifié pour `emerald-500`/`red-500` : séparation CVD ΔE 8.1
  (deutan, juste au-dessus du seuil), contraste `emerald-500` sur fond clair
  en WARN → nécessite un label direct ou la table, jamais la couleur seule.

## Animation

Tracé de ligne qui se dessine à l'entrée (`stroke-dasharray`/`dashoffset`),
barres qui montent depuis la ligne de base avec un décalage en cascade
(30-50ms par barre), toujours via `transform`/`opacity` (jamais `width`/
`height` directement). Respecter `prefers-reduced-motion` — désactiver
l'animation, pas juste la raccourcir.

### ⚠️ Le déclencheur est le VIEWPORT, jamais le montage

**Tout graphique s'anime quand il entre à l'écran**, via
**`useInView`** (`src/components/charts/useInView.ts`) — jamais sur un
`requestAnimationFrame` au montage.

La fiche bien est longue : verdict, rangée de KPI, cinq blocs d'analyse,
tableaux. Un graphique animé au montage a fini de jouer avant que le lecteur
n'arrive dessus — il découvre un graphique déjà figé, et l'animation n'a rien
montré à personne. Deux défauts pour le prix d'un : tout s'anime en même temps
hors écran, ce qui coûte des frames au premier rendu sans qu'aucune ne soit
vue.

Contrat du hook, à ne pas contourner :

- **Une seule bascule**, l'observateur se déconnecte dès l'apparition. Un
  graphique qui rejouerait son entrée à chaque passage de scroll est une
  nuisance, pas un effet.
- **Seuil 0,2 + `rootMargin` bas de −10 %** : l'animation part quand le
  graphique est franchement entré, pas dès que son premier pixel effleure le
  bas de l'écran.
- Le `ref` se pose sur le **conteneur** du graphique, pas sur le `<svg>` —
  c'est lui qui porte déjà `relative` pour l'ancrage du tooltip. Exception :
  quand le graphique EST un `<svg>` racine sans wrapper (`ScoreRing`), le
  `ref` se pose directement dessus.

### 🔴 Bug réel corrigé (2026-08-20) : incohérence d'HYDRATATION, pas de timing

Symptôme rapporté : au reload, un graphique déjà vu une fois ne rejouait
jamais son entrée. Deux tentatives de fix par `requestAnimationFrame` (une
puis une double) **n'ont rien changé** — la vraie cause n'était pas un
problème de timing d'animation.

**Cause réelle** : l'état initial de `inView` était calculé avec
`typeof IntersectionObserver === "undefined"`. Cette condition est vraie à
la fois pour « vieux navigateur sans support » ET pour le **rendu serveur**
(Node n'a pas cette classe). Le HTML généré côté serveur affichait donc
l'état FINAL (rempli, `inView=true`), pendant que le premier calcul côté
client donnait `false` (pas encore entré, condition fausse dans un vrai
navigateur) — un vrai écart entre les deux rendus. Confirmé en console :

```
A tree hydrated but some attributes of the server rendered HTML didn't
match the client properties. This won't be patched up.
- strokeDashoffset="53.4"   (rendu serveur — état final)
+ strokeDashoffset={106.8}  (calcul client — état initial)
```

**« This won't be patched up » est la clé** : React ne corrige PAS ce genre
d'écart après l'hydratation — l'attribut reste bloqué sur la valeur du
serveur, pour toujours, quel que soit ce qui se passe côté client ensuite.
Aucun `rAF`, aussi robuste soit-il, ne peut réparer un attribut que React a
explicitement choisi de ne jamais retoucher.

**Le fix** : l'état initial de `inView` est **TOUJOURS `false`**, identique
sur le serveur et au premier rendu client — donc plus aucun écart possible.
Tout repli est appliqué **après coup, uniquement côté client** :
- « pas d'`IntersectionObserver` » n'est vérifié que **dans l'effet** (qui ne
  tourne jamais côté serveur, donc sans risque d'incohérence), passé par un
  `requestAnimationFrame` pour rester hors du flux synchrone de l'effet
  (`react-hooks/set-state-in-effect`).
- `prefers-reduced-motion` passe par `useReducedMotion` (`useSyncExternalStore`,
  conçu précisément pour qu'une valeur différente du serveur se resynchronise
  SANS avertissement d'hydratation) et se combine à la lecture
  (`inView || reducedMotion`), jamais dans le même `useState`.

Le **double `requestAnimationFrame`** dans le callback de l'observer reste en
place (bonne pratique défensive : un élément déjà intersectant au montage
peut encore, dans de rares cas, intersecter avant sa toute première peinture)
mais **n'était pas le vrai fix** — à ne pas invoquer seul si ce bug
réapparaît sous une autre forme : vérifier D'ABORD la console pour un
avertissement d'hydratation avant de retoucher un timing de `rAF`.
- **`prefers-reduced-motion` géré DANS le hook**, pas par chaque graphique.
  La règle `@media (prefers-reduced-motion: reduce)` de `globals.css` ne
  coupe que des `@keyframes` NOMMÉES (`.skeleton-shimmer`, `.slider-fill`…) —
  elle ne touche pas les `transition` CSS que ces graphiques utilisent pour
  leur entrée. `useInView` pose `inView` à `true` dès l'état initial dans ce
  cas (même mécanisme que le repli sans `IntersectionObserver`) : aucune
  transition ne se déclenche jamais pour ces lecteurs, sans qu'aucun
  graphique n'ait à le vérifier lui-même. Lit `useReducedMotion`
  (`src/components/charts/useReducedMotion.ts`, `useSyncExternalStore` —
  extrait de `PlaygroundView.tsx`, seule source désormais) : ne jamais
  réimplémenter une seconde vérification `matchMedia` à la main.

**Inventaire (2026-08-20)** — tout graphique de l'app utilise ce hook :
`DonutChart`, `StackedBarChart` (`src/components/charts/`) ; `TrendBar`
(jauge Verdict, `AnalyseIA.tsx`) ; `ThresholdChart` (graphique de sensibilité
du Simulateur, `PlaygroundView.tsx` — fade sur l'enveloppe SEULEMENT, jamais
sur le tracé/les positions calculées, redessinés en continu au drag des
sliders) ; `ScoreRing` (anneau de score de l'accueil, `ApartmentsTable.tsx`,
réutilisé tel quel par `ApartmentsCardList.tsx`). Tout nouveau graphique OU
jauge/barre de progression avec animation d'entrée reprend le hook ; aucun ne
réimplémente sa propre détection.

## Dark mode

L'app n'a pas de mode sombre (`AGENTS.md`) — les graphiques n'ont donc pas de
variante dark à prévoir.

## Première implémentation réelle : `DonutChart`

`src/components/charts/DonutChart.tsx` — premier graphique réellement livré
(`d3-shape` installé, `pie()`/`arc()`, plus besoin de trigonométrie manuelle
comme dans l'ancien `FinancementDonut`, depuis migré vers ce composant — voir
plus bas). Utilisé dans la card **Budget Total** (onglet Financement,
`ApartmentDetail.tsx`) pour la répartition Prix d'achat/Frais de notaire/
Travaux/Ameublement.

- **Palette catégorielle du donut** (validée par `validate_palette.js`,
  passe lightness band + CVD + normal-vision — seul un contraste WARN sur le
  segment le plus pâle, couvert par la légende toujours visible), **4
  segments** dans l'ordre fixe **Prix d'achat, Frais de notaire, Travaux,
  Ameublement** (c'est aussi l'ordre revalidé pour les paires adjacentes du
  donut, séparé de l'ordre choisi la première fois) : `#5b4fa0` (accent-500,
  Prix d'achat) / `#b3a9e8` (accent-300, Frais de notaire) / **`#c2703f`**
  (terracotta, Travaux) / **`#3d8f8f`** (teal, Ameublement — deux teintes
  inédites, `signal-500` seul échouait le test de distinction à l'œil nu).
  Mapping fixe par identité de champ, jamais par rang/montant.
- **Pas de tooltip** sur ce donut : à 4 segments, la légende affiche déjà
  chaque valeur exacte en permanence — un tooltip au survol serait redondant
  (contrairement aux graphiques à 15 points comme Cash-flow/Trésorerie, où
  labelliser chaque point serait du bruit).
- **Valeur nulle/à 0 → « - »**, jamais « 0 € » — ces 4 montants ne sont
  jamais négatifs, `valeur > 0` suffit comme test.
- **Chiffres en IBM Plex Sans 14px, pas Geist Mono** — dérogation à la règle
  générale « Geist Mono pour tout chiffre clé », étendue depuis à
  `DonutChart` dans son ensemble (donc tout graphique qui l'utilise) — voir
  migration Projection ci-dessous.
- **Pas d'affichage détaillé redondant en mode lecture** : le donut +
  légende est le SEUL affichage de la card en lecture — la liste à plat qui
  répétait les mêmes valeurs a été retirée (gardée uniquement en mode
  édition, où elle sert de formulaire).
- **Framer Motion toujours pas ajouté** — l'entrée animée (fade + scale des
  arcs, cascade) reste en CSS/transition React pur, déclenchée par
  `useInView` (voir § Animation ci-dessus). À réserver pour un futur
  graphique qui a un vrai besoin d'interaction gestuelle (drag, spring au
  survol) plutôt que de l'ajouter par défaut sur chaque chart.
- **Prop `layout: "row" | "column"`** (2026-08-20) — `"row"` (défaut, donut +
  légende côte à côte dès `sm:`) suppose une carte assez large pour la
  légende. **Le breakpoint réagit à la largeur de la FENÊTRE, pas à celle de
  la carte** : dans une colonne de grille étroite (`grid-cols-[1fr_2fr]`,
  carte Financement), le layout passait en ligne sur grand écran alors que
  la carte, elle, restait trop étroite — la légende tronquait tout
  (« Écono… », labels réduits à une lettre). `layout="column"` force
  l'empilement (donut centré, légende `max-w-[240px]` centrée en dessous)
  **indépendamment du viewport** — à utiliser pour toute carte structurellement
  étroite, pas seulement en dessous d'une taille d'écran donnée.

## Migration des 2 graphiques existants de l'onglet Projection (2026-08-20)

`FinancementDonut` et `PatrimoineChart` (`SimulationFinanciere.tsx`) —
initialement laissés en l'état (« pas de réécriture sans besoin ») — ont été
migrés vers les mêmes standards que `DonutChart`, une fois le pattern
confirmé deux fois plutôt qu'une.

- **`FinancementDonut` → `DonutChart`** (suppression totale de l'ancien
  code : géométrie manuelle, labels % sur l'arc, tooltip dédié). Palette
  revalidée pour cet ordre précis (Loyers, Économie fiscale, Participation) :
  `#5b4fa0` / `#c2703f` / `#3d8f8f` — remplace `#f59e0b` (amber-500, une
  couleur de STATUT réutilisée à tort comme couleur catégorielle : violation
  de la règle « status colors reserved » du skill `dataviz`).
- **`PatrimoineChart` → `StackedBarChart`** (nouveau composant partagé,
  `src/components/charts/StackedBarChart.tsx`) : `d3-scale` (`scaleBand`/
  `scaleLinear().nice()`) remplace le calcul d'échelle manuel. Mark specs
  appliqués : coin arrondi 4px **uniquement sur le segment le plus haut**
  visible de chaque barre (les autres empilements restent carrés — un
  `<rect>` ne peut arrondir que ses 4 coins à la fois, d'où un `<path>`
  dédié, `segmentPath()`), écart de 2px entre segments empilés, gridlines Y
  en hairline avec `.nice()` pour des paliers ronds. Tooltip en `pointerdown`/
  `pointermove` (tactile ET souris, contrairement à l'ancien `onMouseMove`
  seul). Palette : `dette` reste `ink-300` (neutre, inchangé), `enrichissement`
  passe de `emerald-500` (statut réutilisé à tort) à `#c2703f`, `effortEpargne`
  de `accent-600` à `accent-500` (accent-600 échouait la bande de luminosité
  du script de validation).
- **`ChartTooltip`/`TooltipRow` extraits** dans
  `src/components/charts/ChartTooltip.tsx` (partagés par `StackedBarChart` et
  tout futur graphique à tooltip — plus besoin de dupliquer ce système une
  troisième fois).
- **IBM Plex Sans 14px, pas Geist Mono** : hérité automatiquement de
  `DonutChart` pour le premier ; appliqué explicitement dans
  `StackedBarChart` (ticks d'axe, tooltip) pour cohérence.
- **`pct()` et les labels de pourcentage sur l'arc ont disparu** avec
  `FinancementDonut` — `DonutChart` ne les supporte pas (légende = label
  direct, voir plus haut). Si le pourcentage redevient nécessaire, l'ajouter
  au niveau de la légende de `DonutChart`, pas en réintroduisant un système
  par graphique.

## Tooltips : hover + focus, jamais clic seul — et `font-sans` explicite

Vrai pour `ChartTooltip` (survol d'un point/segment) ET `InfoTooltip`
(icône ⓘ à côté d'un titre, `SectionH2` prop `info` — remplace un
paragraphe descriptif long sous le titre, voir migration Projection
ci-dessous) :

- **Déclenchement au survol (souris) + focus (clavier)**, jamais au clic
  seul — un clic-pour-ouvrir n'est pas un tooltip, c'est un popover, et ça
  casse l'attente native de l'utilisateur sur une icône ⓘ.
- **`font-sans` posé explicitement sur la bulle**, jamais laissé à
  l'héritage CSS. Piège rencontré en vrai : `InfoTooltip` niché dans un
  `SectionH2` (Fraunces, `font-display`) héritait le serif du titre au lieu
  du corps de texte — invisible en dev tant qu'on n'ouvre pas le tooltip,
  donc facile à laisser passer en revue de code. Tout futur composant qui
  pose du texte flottant à l'intérieur d'un titre stylé doit forcer sa
  police, pas compter sur l'ancêtre le plus proche.

## Référence de style validée

Aperçu visuel validé par l'utilisateur : maquette artifact
`https://claude.ai/code/artifact/87712e84-7f8f-4916-862e-103d63807452`
(courbe lissée + dégradé qui s'estompe vers la ligne zéro, barres divergentes
animées, labels sélectifs, crosshair + tooltip, table repliable). Inventaire
de composants détaillé (par graphique/onglet) :
`docs/design/2026-08-20-graphiques-projection-tresorerie.md`.
