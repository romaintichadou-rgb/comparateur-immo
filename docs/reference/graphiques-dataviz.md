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
| **Recharts, ApexCharts, Nivo, ECharts** | Rendu "dashboard" générique par défaut ; obtenir un rendu haut de gamme (dégradé, courbe lissée, animation d'entrée sur-mesure) demande de fighter la lib plutôt que de composer — alors que le projet écrit déjà du SVG bespoke à ce niveau (`FinancementDonut`, `PatrimoineChart` dans `SimulationFinanciere.tsx`) |
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

## Dark mode

L'app n'a pas de mode sombre (`AGENTS.md`) — les graphiques n'ont donc pas de
variante dark à prévoir.

## Première implémentation réelle : `DonutChart`

`src/components/charts/DonutChart.tsx` — premier graphique réellement livré
(`d3-shape` installé, `pie()`/`arc()`, plus besoin de trigonométrie manuelle
comme dans `FinancementDonut`). Utilisé dans la card **Budget Total**
(onglet Financement, `ApartmentDetail.tsx`) pour la répartition Prix
d'achat/Travaux/Frais de notaire.

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
- **Chiffres en IBM Plex Sans 14px, pas Geist Mono** — dérogation explicite
  à la règle générale « Geist Mono pour tout chiffre clé », demandée pour ce
  chart précisément. Ne pas généraliser cette exception à un autre chart
  sans qu'elle soit redemandée.
- **Pas d'affichage détaillé redondant en mode lecture** : le donut +
  légende est le SEUL affichage de la card en lecture — la liste à plat qui
  répétait les mêmes valeurs a été retirée (gardée uniquement en mode
  édition, où elle sert de formulaire).
- **Framer Motion pas encore ajouté** — l'entrée animée (fade + scale des
  arcs, cascade) est faite en CSS/transition React pur, suffisant pour ce cas
  statique. À réserver pour un futur graphique qui a un vrai besoin
  d'interaction gestuelle (drag, spring au survol) plutôt que de l'ajouter
  par défaut sur chaque chart.

## Référence de style validée

Aperçu visuel validé par l'utilisateur : maquette artifact
`https://claude.ai/code/artifact/87712e84-7f8f-4916-862e-103d63807452`
(courbe lissée + dégradé qui s'estompe vers la ligne zéro, barres divergentes
animées, labels sélectifs, crosshair + tooltip, table repliable). Inventaire
de composants détaillé (par graphique/onglet) :
`docs/design/2026-08-20-graphiques-projection-tresorerie.md`.
