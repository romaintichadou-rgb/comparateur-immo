# Design: Graphiques — Projection & Coûts/Trésorerie

## Source Spec

Pas de spec fonctionnelle dédiée — demande directe : équiper la fiche bien
(onglets **Projection** = `simulation`, **Coûts et revenus** = `financiere`)
d'une librairie de graphiques React, en remplacement/complément des tableaux
actuels et des deux graphiques SVG déjà faits à la main dans
`SimulationFinanciere.tsx` (`FinancementDonut`, `PatrimoineChart`).

Fichiers de référence lus pour ce cadrage : `AGENTS.md` (charte graphique),
`docs/reference/couleurs-scoring.md` (tons sémantiques), `docs/reference/page-appartement-ui.md`,
`src/components/SimulationFinanciere.tsx`, `src/lib/simulation.ts`,
`src/app/globals.css` (tokens `@theme inline`).

**Aucune librairie de charts n'est installée aujourd'hui** (`package.json`
vérifié). Les deux graphiques existants sont du SVG écrit à la main
(arcs de cercle pour le donut, `<rect>` empilés pour les barres, tooltip en
`useState`/`onMouseMove`).

---

## Recommandation de librairie

> **Mise à jour (2026-08-20, après aperçu visuel validé) :** la recommandation
> initiale ci-dessous (Recharts) est **remplacée**. Le rendu Recharts par
> défaut est trop générique pour l'objectif "beau, haut de gamme, moderne"
> validé par l'utilisateur sur l'aperçu artifact. Voir
> `docs/reference/graphiques-dataviz.md` pour la règle à jour et la référence
> de style. Section conservée ci-dessous pour l'historique de l'arbitrage.

### ~~Recommandation principale : Recharts~~ → **d3-shape + d3-scale + Framer Motion**

Recharts demanderait de fighter la lib pour retrouver le niveau de finition
déjà présent dans `FinancementDonut`/`PatrimoineChart` (courbe lissée,
dégradé qui s'estompe, animation de tracé). `d3-shape`/`d3-scale` fournissent
les générateurs de courbe/échelle (évite la trigonométrie manuelle) sans
imposer un système visuel — le SVG reste écrit à la main comme aujourd'hui.
`Framer Motion` gère l'animation d'entrée et les micro-interactions. Détail
complet (mark specs, couleur, palette validée) : `docs/reference/graphiques-dataviz.md`.

### Écartées explicitement (Recharts inclus, réévalué)

| Lib | Raison de l'écart |
|---|---|
| **Recharts** | Rendu "dashboard" générique par défaut ; le `Tooltip content={}` JSX reste un vrai atout, mais n'aurait pas suffi à obtenir la courbe lissée + dégradé + animation de tracé attendus sans réécrire une bonne partie du rendu par-dessus |
| **Chart.js** | Rendu Canvas, pas SVG — impossible de styliser élément par élément en classes Tailwind (fill/stroke ne s'appliquent qu'au niveau JS/config), accessibilité DOM native perdue (pas de vrais `<path>`/`<rect>` inspectables), rupture avec le pattern SVG déjà en place |
| **Tremor / shadcn-charts** | Wrapper opinionated au-dessus de Recharts avec SON PROPRE système de tokens de couleur — entre en conflit direct avec la consigne « ne jamais inventer de style, réutiliser l'existant » : on importerait un second design system à réconcilier avec `ink-*`/`accent-*`/Fraunces/IBM Plex |
| **Nivo / ECharts** | Puissants mais surdimensionnés pour ≤ 30 points de données par série ; theming par objet JS (pas nativement CSS vars/Tailwind) ; bundle nettement plus lourd (plusieurs centaines de KB selon le type de chart importé) |
| **D3 brut (tout le paquet)** | Aucun idiome React ; `d3-shape`/`d3-scale` seuls suffisent, pas besoin du reste du paquet |

### ~~Ce qui NE bouge pas~~ → migrés (2026-08-20, second passage)

**Mise à jour :** `FinancementDonut` et `PatrimoineChart` ont finalement été
migrés vers `DonutChart`/`StackedBarChart` (`src/components/charts/`) — le
« pas de réécriture sans besoin » ne tenait plus une fois `DonutChart`
confirmé une seconde fois sur Budget Total : laisser les deux implémentations
d'origine aurait fait porter DEUX standards de qualité différents au même
onglet. Détail complet de la migration : `docs/reference/graphiques-dataviz.md`
§ Migration des 2 graphiques existants de l'onglet Projection.

---

## Screen Inventory

Pas de nouvel écran — enrichissement de deux onglets existants de la fiche
bien (`ApartmentDetail.tsx`).

| Écran/Onglet | Description | Entrée |
|---|---|---|
| Onglet **Projection** (`simulation`, `SimulationFinanciere.tsx`) | Reçoit 2 nouveaux graphiques : Cash-flow annuel, Trésorerie cumulée | Tab bar de la fiche bien |
| Onglet **Coûts et revenus** (`financiere`) | Pas de graphique proposé ici (données de saisie, pas de série temporelle) — hors scope | Tab bar |
| **Home / liste des biens** (`HomeView.tsx`) | Graphique comparatif de rendement entre biens — **optionnel, hors scope immédiat** | `/` |

## Navigation Flow

Aucun nouveau flux : les graphiques s'insèrent DANS l'onglet Projection déjà
existant, au-dessus du tableau « Cash-flow année par année » déjà collapsible.

```
Fiche bien → onglet Projection → [scroll] → Cash-flow annuel (nouveau graphique)
                                → Trésorerie cumulée (nouveau graphique)
                                → Rentabilité de l'opération (TRI, inchangé)
                                → Tableau détaillé (existant, replié par défaut, inchangé)
```

Le tableau reste la source de vérité précise et sert d'**équivalent
accessible** au graphique (voir Accessibilité) — les deux coexistent, le
graphique ne remplace rien.

---

## Screen Breakdown

### Onglet : Projection (`SimulationFinanciere.tsx`)

**Purpose :** visualiser d'un coup d'œil la trajectoire du cash-flow et de la
trésorerie sur la durée du prêt, avant d'aller chercher le détail chiffré
dans le tableau.

**Components (nouveaux) :**

- **`CashflowBarChart`** — barres verticales, une par année (`annees[].cashflowAnnuel`),
  ligne de base à zéro, couleur PAR BARRE selon `cashflowTone(a.cashflowMensuel, seuils)`
  (même seuils que la carte Analyse et le tableau existant — pas une palette
  de graphique arbitraire). Axe X = année, axe Y = montant €/an.
- **`TresorerieAreaChart`** — aire/ligne de `annees[].cumulFluxPersonnel`
  (trésorerie cumulée personnelle, apport compris), avec ligne de référence à
  zéro et marqueur sur l'année de **point mort** (déjà calculé ailleurs comme
  `pointMort` — premier index où `enrichissement > 0`). Un seul ton : `accent-600`
  au-dessus de zéro devient visuellement positif via le remplissage, pas
  besoin de re-jouer les seuils cash-flow ici (c'est un cumul patrimonial, pas
  une santé de cash-flow mensuel).
- **`PlusValueLineChart`** *(optionnel — voir Open Questions, chevauche
  potentiellement `PatrimoineChart` existant)* — deux courbes, `valeurBien`
  (croissante si revalorisation) et `capitalRestantDu` (décroissante), aire
  ombrée entre les deux = plus-value latente avant frais de revente.
- Tooltip : réutilisation directe de `ChartTooltip`/`TooltipRow` déjà écrits
  dans le fichier, passés en `content` du `<Tooltip>` Recharts.
- Légende : dots ronds `h-2 w-2 rounded-full`, même gabarit que la légende de
  `FinancementDonut` — pas les rectangles par défaut de Recharts.

**States :**

- **Default** : graphique rendu avec les données de `resultAffiche.annees`
  (résultat déjà calculé par `simulate()`, jamais de fetch dédié — pas
  d'état de chargement réseau propre au graphique).
- **Loading** : n'existe pas indépendamment — les graphiques dépendent du
  même `resultAffiche` que le reste de l'onglet, donc pas de skeleton dédié
  (cohérent avec « les autres onglets n'ont pas de skeleton global », `docs/reference/page-appartement-ui.md`).
- **Empty** : `resultAffiche.annees.length === 0` (durée de prêt à 0, cas
  bord) → message texte `text-sm text-ink-400` « Données insuffisantes pour
  ce calcul. », même libellé que `FinancementDonut` quand `total <= 0` — pas
  de graphique vide avec axes sans données.
- **Error** : pas d'erreur réseau possible (calcul local synchrone) — seul
  cas dégradé = données manquantes, couvert par Empty.

**UX Copy :**

- Titre section : « Cash-flow année par année » *(déjà en place, inchangé)*
- Sous-titre nouveau graphique trésorerie : « Ce que le cash-flow cumulé
  (moins l'apport) a reconstitué au fil des années — la ligne franchit zéro
  au point mort. »
- Empty state : « Données insuffisantes pour ce calcul. » *(reprend le
  libellé déjà utilisé par `FinancementDonut`, ne pas en inventer un second)*

---

## Design Tokens (feature-specific)

| Token | Valeur suggérée | Usage |
|---|---|---|
| Couleur barre cash-flow positif | `emerald-500` (#10b981, déjà utilisé pour `enrichissement` dans `PATRIMOINE_COLORS`) | Barres au-dessus du seuil vert |
| Couleur barre cash-flow attention | `amber-500` (#f59e0b) | Entre seuil vert et seuil rouge |
| Couleur barre cash-flow alerte | `red-500` (#ef4444) | Sous le seuil rouge |
| Couleur trait/aire trésorerie cumulée | `accent-600` (#3d3580) | Série neutre (pas de seuil métier dessus) |
| Couleur ligne de référence zéro | `ink-300` (#c9c2d9), **hairline solide 1px** (jamais pointillé — voir `docs/reference/graphiques-dataviz.md`) | Toutes les charts avec valeurs signées |
| Grille / axes | `ink-200` (#e3deed) traits fins, pas de fond quadrillé plein | Cohérent avec la grille déjà en `#e6e1f0` sur le donut actuel |
| Texte des ticks d'axe (valeurs €) | `font-sans text-[10px] text-ink-400 tabular-nums` | **Pas `font-mono`** — même logique que le commentaire déjà présent dans le tableau (« Chiffres en IBM Plex Sans… ce sont des lignes de détail ») : le mono est réservé au CHIFFRE CLÉ isolé (ex. TRI en gros), pas aux ticks d'un axe |
| Texte des labels d'axe (années) | `font-sans text-[10px] text-ink-400` | Idem |
| Tooltip fond | `bg-ink-900`, texte `text-white`, labels `text-ink-300` | Reprend `ChartTooltip` tel quel — exception documentée à la règle "pas de shadow", le tooltip flotte |
| Légende | `text-xs text-ink-500`, dot `rounded-full h-2 w-2` | Reprend la légende de `FinancementDonut` |
| Hauteur graphique mobile | `h-48` (< 640px) | Éviter un graphique écrasé sur petit écran |
| Hauteur graphique desktop | `h-64` (≥ `sm:`) | |

⚠️ **Centraliser la palette** : `FINANCEMENT_COLORS` et `PATRIMOINE_COLORS`
sont aujourd'hui deux maps de hex codées en dur, séparées, dans
`SimulationFinanciere.tsx`. Un troisième graphique qui inventerait sa propre
palette ferait diverger trois sources. Suggestion : extraire une seule
`CHART_TONE_COLORS` (ou réutiliser directement les classes `fill-*`
Tailwind correspondant à `TONE_TEXT_CLASS`) partagée par les graphiques
main-écrits ET Recharts — pas une obligation pour livrer, mais à signaler en
revue de code.

---

## Accessibility Notes

- **Le tableau existant EST l'équivalent accessible** — ne pas le
  supprimer/masquer derrière le nouveau graphique. Lier les deux via
  `aria-describedby` ou une phrase visible (« Détail chiffré ci-dessous »).
- **Ne jamais coder l'information uniquement par la couleur** : chaque bar
  garde son signe visible (au-dessus/en-dessous de la ligne zéro) et le
  tooltip affiche la valeur signée (`formatEurosSigned`/`signe()` déjà en
  place) — un daltonien lit la position, pas seulement le ton.
- **Activer `accessibilityLayer`** (Recharts) pour la navigation clavier +
  annonce ARIA des points de données — désactivé par défaut, à activer
  explicitement.
- **`prefers-reduced-motion`** : désactiver `isAnimationActive` sur les
  séries si l'utilisateur a demandé moins d'animation (pas un pattern déjà
  présent dans le code, à instaurer proprement dès ce premier graphique).
- **Contraste tooltip** : déjà validé par l'existant (`text-ink-300` sur
  `bg-ink-900` — contraste large, aucun changement nécessaire).

## Open Questions / Flags for PM

- [ ] **Le graphique "Plus-value à la revente" (`PlusValueLineChart`) fait-il
  doublon avec `PatrimoineChart` existant ?** Celui-ci affiche déjà
  `enrichissement` en barre empilée (richesse nette créée). Décider si on
  ajoute une vue linéaire dédiée (valeur du bien vs capital restant dû) ou si
  on considère que `PatrimoineChart` couvre déjà le besoin — éviter deux
  graphiques qui racontent presque la même chose à deux endroits.
- [ ] **Où vit le "comparatif de rendement entre biens" ?** Ce n'est pas un
  graphique de fiche bien (une fiche ne connaît qu'un bien) — probablement
  `HomeView.tsx` (barres horizontales, une par bien, triées par rendement,
  couleur = `noteTone`/`rendementNetTone` existants). Hors scope de cette
  demande centrée sur Projection/Trésorerie, à cadrer séparément si voulu.
- [x] **Résolu : migrés vers `DonutChart`/`StackedBarChart`** (pas Recharts,
  écarté entre-temps — voir `docs/reference/graphiques-dataviz.md`). Décidé
  une fois le pattern confirmé une seconde fois sur Budget Total : porter
  deux standards de qualité différents sur le même onglet coûtait plus cher
  que la migration.
- [x] **Confirmé : les graphiques sont visibles PAR DÉFAUT**, au-dessus du
  tableau replié (`tableOpen`, inchangé). Coexistence, pas remplacement : le
  tableau garde le détail colonne par colonne (loyers/crédit/charges/impôt)
  et les valeurs exactes non labellisées directement sur le graphique — le
  graphique montre la forme, le tableau garde le chiffre précis.
- [x] **Confirmé : couleur par seuil (`cashflowTone`), pas par signe brut ni
  couleur plate.** Voir `docs/reference/graphiques-dataviz.md` — c'est la
  règle à implémenter pour rester cohérent avec la carte Analyse et le
  tableau existant sur ce même chiffre.

## Handoff Notes for Developer

- **Emplacement** : nouveaux composants dans `SimulationFinanciere.tsx` (ou
  extraits dans des fichiers dédiés si le fichier grossit trop —
  `SimulationFinanciere.tsx` est déjà volumineux, un `charts/CashflowBarChart.tsx`
  et `charts/TresorerieAreaChart.tsx` sous `src/components/` seraient plus
  lisibles qu'un ajout de 200 lignes de plus au même fichier).
- **Reprendre `ChartTooltip`/`TooltipRow`** tels quels comme `content` du
  `<Tooltip>` Recharts — ne pas réécrire un second système de tooltip.
- **Réutiliser `cashflowTone`/`cashflowSeuilsFromSettings`** (`lib/analyse/scoring.ts`)
  pour la coloration par barre — ne pas coder de seuils locaux (règle déjà
  documentée dans `couleurs-scoring.md` : ces tables sont la SEULE source
  autorisée).
- **Wrapper avec hauteur fixe** (`h-48 sm:h-64`) autour de `ResponsiveContainer`
  pour éviter le layout shift au premier rendu (mesure du conteneur après
  montage).
- **Décimation des ticks X sur mobile** : réutiliser la même logique déjà
  écrite dans `PatrimoineChart` (`annees.length <= 15 || i % Math.ceil(annees.length / 15) === 0`)
  plutôt que d'en réinventer une — via la prop `interval` ou un
  `tickFormatter` custom sur `<XAxis>`.
- **Pas de scrollbar horizontale sur un graphique** (contrairement à un
  tableau) — la charte réserve `overflow-x-auto` + scrollbar visible aux
  TABLEAUX qui débordent (`docs/reference/page-appartement-ui.md` /
  `AGENTS.md` § Scrollbar) ; un graphique doit se redimensionner/décimer, pas
  déborder.
- **Bundle** : après intégration, lancer `next build` et vérifier la taille
  de la route fiche bien (déjà lourde avec Leaflet) — si Recharts pousse le
  payload client de façon sensible, envisager un `dynamic import` du bloc
  graphique (le fichier est déjà 100 % client, donc pas de contrainte SSR à
  gérer, juste du code-splitting classique).
- **Types réutilisés** : `AnneeSimulation` (`lib/simulation.ts`) porte déjà
  tous les champs nécessaires (`cashflowAnnuel`, `cumulFluxPersonnel`,
  `valeurBien`, `capitalRestantDu`, `enrichissement`) — aucune nouvelle
  colonne DB ni nouveau calcul requis, uniquement de la visualisation d'un
  résultat déjà calculé.
