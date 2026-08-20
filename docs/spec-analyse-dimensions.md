# Spec — Refonte des dimensions de l'onglet Analyse

> Spec produit + technique. Cible : `src/lib/analyse/*` et `src/components/AnalyseIA.tsx`.
> À lire avec `docs/reference/analyse-optimiser.md` (layout actuel, verdicts) et
> `docs/reference/couleurs-scoring.md` (tonalités).

## 1. Principe directeur

**Augmenter la densité utile, pas le volume.** On ajoute des faits — une note
de bloc doit reposer sur assez de signaux pour être crédible — mais chaque
ajout doit passer un filtre :

1. **Il change un arbitrage** (« je paie combien », « je loue à qui », « je
   revends quand ») **ou il décompose une note** déjà affichée sans explication.
2. **Sa source est déjà intégrée**, sauf exception budgétée explicitement.
3. **Il n'existe pas déjà ailleurs à l'écran** — un doublon coûte plus cher
   qu'une absence : il fait douter des deux occurrences.

Résultat : **+21 éléments, −5 retraits**, soit ~26 → **~42 éléments** dont
**10 visuels** (contre 2). L'augmentation est réelle ; ce qui est écarté, ce
sont les 15 propositions infaisables, redondantes ou hors périmètre (§5).

---

## 2. Ce qui existe réellement (audit corrigé)

Relevé sur le code, pas sur l'écran — un bloc n'affiche ses faits que si la
source a répondu et si la précision de localisation le permet.

| Bloc | Poids | Faits (max) | Visuel | Sous-notes internes |
|---|---|---|---|---|
| `prix` | 0,30 | 3 (+1 immeuble) | — | 1 (écart au marché) |
| `location` | 0,30 | 3 + 2 highlights | — | 1 (rendement net, pénalité loyer) |
| `risque` | 0,20 | ~7 | échelle DPE/GES | pénalités cumulées |
| `potentiel` | 0,20 | 4 | — | **4** (évolution 0,35 · liquidité 0,30 · commodités 0,20 · sécurité 0,15) |
| `quartier` | **0** | **8** | — | aucune |
| `simulation` | 0 | waterfall + table | waterfall | aucune |

### Coût réel des sources — ce qui arbitre faisable / infaisable

| Source | Nature | Coût d'un point de donnée supplémentaire |
|---|---|---|
| **DVF** (Cerema) | API distante, instance **preprod**, 38–60 s à froid, budget partagé 12 s, pagination **par année** | **Élevé.** Toute fenêtre ou tout périmètre supplémentaire est une requête. |
| **ANIL** | **Fichier JSON LOCAL** (`src/lib/anil_loyers.json`), figé au build | **Nul.** Interroger 20 arrondissements coûte 20 lectures mémoire. |
| **OSM** (Overpass) | API distante, bundle de 5 requêtes déjà groupées | Moyen — une catégorie de plus = une requête de plus. |
| **SSMSI / INSEE** | API tabulaire data.gouv | Faible, mais **le détail est déjà téléchargé** (§6.4). |
| **Géorisques** | API distante | Faible, endpoints indépendants. |
| **`simulate()`** | Calcul local | Nul, la série année par année existe déjà. |

⚠️ **C'est cette asymétrie DVF / ANIL qui explique deux verdicts opposés sur
des propositions jumelles** : comparer les *prix* des quartiers voisins est
écarté (P1.3, N requêtes DVF), comparer les *loyers* des quartiers voisins est
retenu (P5.5, N lectures d'un fichier local).

### Trois erreurs de l'audit initial, à ne pas reproduire

- **« Historique 10 ans en courbe DVF »** — hors budget (voir tableau ci-dessus).
  Ce qui est réellement disponible : la fenêtre récente est déjà collectée
  **année par année** (`fetchWindowParAnnee`) puis aplatie, plus une fenêtre
  2014-2016. Soit **4 points, gratuits** — pas dix.
- **« Tendances démographiques (âge médian, ménages) »** —
  `sources/demographie.ts` documente explicitement que ces champs **ne sont pas
  dans les jeux de données** interrogés.
- **« Bloc Quartier = 0 donnée structurée »** — faux : il en porte jusqu'à 8.
  C'est le bloc le plus fourni de l'écran, et il pèse 0 dans la note.

---

## 3. Le problème structurel : `potentiel` est un bloc-poubelle

`buildBlocPotentiel` n'a **aucune source à lui**. Ses quatre sous-notes sont
empruntées aux deux blocs voisins :

| Sous-note | Poids interne | Source | Déjà lue par |
|---|---|---|---|
| Évolution des prix | 0,35 | `dvf` | `buildBlocPrix` (même objet) |
| Liquidité | 0,30 | `dvf` | `buildBlocPrix` (même objet) |
| Commodités | 0,20 | `osm.commodites` | `buildBlocQuartier` (même bundle) |
| Sécurité | 0,15 | `delinq` | — |

**65 % du poids de `potentiel` est de la donnée DVF** — la même que le bloc
Prix. **35 % est de la donnée de quartier** — le même bundle OSM que Quartier.

Conséquences visibles aujourd'hui :

- Le même `perimetreLabel` (« rayon 500 m ») s'affiche dans Prix **et** dans
  Potentiel, pour deux faits tirés du même appel.
- Les écoles sont comptées deux fois : agrégées dans Potentiel
  (« Commodités : 8 écoles/facs ») et listées dans Quartier (« Écoles à
  proximité : 3 »). À l'écran, ça ressemble à un bug.
- **Le bloc le plus lu pèse le moins** : Quartier porte 8 faits pour un poids
  de 0 ; Potentiel porte 4 faits pour un poids de 0,20.
- Le poids réel de DVF dans le score global est de **0,43** (0,30 + 0,20 × 0,65)
  — invisible car éclaté sur deux blocs. Personne n'a jamais décidé ce 0,43.

**Verdict : `potentiel` est dissous.**

---

## 4. Nouveau découpage — 4 dimensions notées + 1 informative

| Clé | Titre | Poids | Absorbe |
|---|---|---|---|
| `prix` | **Prix & marché** | **0,35** | `potentiel` : évolution + liquidité |
| `location` | **Rendement** | **0,35** | inchangé |
| `risque` | **Risques** | **0,20** | inchangé |
| `quartier` | **Quartier & cadre de vie** | **0,10** | `potentiel` : commodités + sécurité |
| `simulation` | Projection financière | 0 | inchangé |

⚠️ **Les clés `prix`, `location`, `risque`, `quartier` ne changent PAS.**
`ecartPrixMarche()` retrouve son fait via `blocs.prix`, et il est appelé depuis
`decisionFromAnalyse()` sur l'`AnalyseResume` de **la page d'accueil**.
Renommer la clé casserait la décision de toute la liste de biens.

**Pourquoi la parité 0,35 / 0,35** : le transfert mécanique donnerait 0,43 à
Prix & marché. La fusion est le moment où ce 0,43 devient visible, et « ce que
le marché dit » ne doit pas peser plus que « ce que le bien rapporte » dans un
outil dont le code désigne lui-même le rendement comme l'objectif principal.

### Sous-notes internes

Patron déjà éprouvé dans `buildBlocPotentiel` (`scoreSum / weightSum`
renormalisé sur les sous-notes disponibles) — pas un nouveau mécanisme.

**Prix & marché**

| Sous-note | Poids | Barème |
|---|---|---|
| Écart au prix de marché | 0,50 | `interpole` existant (−20 % → 10 ; 0 % → 6 ; +40 % → 0), atténué par A4 |
| Dynamique des prix | 0,20 | `interpole` existant du bloc Potentiel |
| Liquidité | 0,20 | `interpole` existant, modulé par la tendance de volume (A3) |
| Dispersion du marché | 0,10 | largeur interquartile (A4) — un marché très dispersé rend toute médiane moins décisive |

**Rendement**

| Sous-note | Poids | Barème |
|---|---|---|
| Rendement net vs seuils du profil | 0,55 | barème existant |
| Écart loyer / marché ANIL | 0,25 | pénalité existante, promue en sous-note explicite |
| Taux d'effort du locataire | 0,20 | nouveau (B3) |

**Quartier & cadre de vie**

| Sous-note | Poids | Barème |
|---|---|---|
| Commodités | 0,35 | `interpole` existant (0 → 2 ; 300 → 5), **plancher 2** |
| Sécurité | 0,30 | `interpole` existant (ratio vs ville) |
| Accessibilité (gare) | 0,20 | `interpole` sur `distanceKm` : 2 → 5 ; 8 → 3,5 ; 25 → 2 |
| Cadre de vie (parcs, santé, vie) | 0,15 | `interpole` sur compte composite, **plancher 2** |

⚠️ **Planchers obligatoires** : OSM sous-recense les zones rurales — le code le
documente déjà. Sans plancher, un bien rural serait puni pour un défaut de
couverture cartographique, pas pour un défaut de quartier.

---

## 5. Triage complet des 36 propositions de l'audit initial

**21 retenues · 15 écartées.** Les identifiants `P*` renvoient au document
d'audit d'origine.

### 5.1 Retenues (21)

| Id | Proposition | Bloc d'accueil | Statut |
|---|---|---|---|
| P1.1 | Historique des prix | Prix & marché | **Redimensionné** — 4 points, pas 10 ans |
| P1.2 | Dynamique annuelle | Prix & marché | Tel quel |
| P1.4a | Liquidité / volume | Prix & marché | **Partiel** — tendance de volume oui, « délai de revente en mois » non |
| P1.5 | Volatilité du secteur | Prix & marché | **Reformulé** — dispersion interquartile mesurée, pas un écart-type sur 4 points |
| P2.1 + P6.5 | Rendement vs secteur / benchmark | Rendement | **Fusionnées** — même calcul |
| P2.2 | Décomposition du loyer | Rendement | Tel quel |
| P2.6 + P2.7 | Profil d'occupant / risque de vacance | Rendement | **Transformées** en taux d'effort (B3) |
| P3.1 | Indices d'aléas chiffrés | Risques | Tel quel |
| P3.3 | Budget travaux | Risques | **Déplacement** — existe dans Optimiser |
| P3.4 | Historique de sinistres | Risques | Tel quel (GASPAR/CatNat) |
| P3.5 | Flag assurabilité | Risques | Tel quel |
| P3.7 | Ancienneté du diagnostic | Risques | **Réduit** — un flag, pas une courbe |
| P4.1 | Évolution annuelle détaillée | Prix & marché | **Fusionnée** avec P1.1 |
| P4.3 | Sécurité en comparatif | Quartier & cadre | Tel quel |
| P4.4 | Détail des commodités | Quartier & cadre | **Partiel** — distances disponibles seulement |
| P4.6 | Score qualité de vie | Quartier & cadre | **Transformé** — c'est la note du bloc elle-même |
| P5.4 | Ambiance du quartier | Quartier & cadre | Tel quel (déjà calculé) |
| P5.5 | Comparaison loyers voisins | Quartier & cadre | Tel quel — **gratuit** (ANIL local) |
| P6.1 | Trésorerie cumulée | Projection | Tel quel |
| P6.3 | Plus-value à la revente | Projection | Tel quel |

### 5.2 Écartées (15), avec le motif

| Id | Proposition | Motif |
|---|---|---|
| P1.3 | Prix/m² des arrondissements voisins | **Coût DVF** — N requêtes sur la source la plus lente. Le pendant en loyers (P5.5) est retenu car ANIL est local. |
| P1.6 | Ancien prix affiché de l'annonce | **Aucun historique de prix stocké** en base. |
| P2.3 | Cash-flow net en € | **Doublon strict** — 2ᵉ `StatCard` de la rangée KPI, avec panneau de détail. |
| P2.4 | Historique 5 ans du loyer médian | `anil_loyers.json` ne contient **qu'un millésime**. Faisable en régénérant et stockant plusieurs éditions → **reporté** (§9, Lot 5). |
| P2.5 | Délai de location moyen | **Aucune source.** |
| P3.2 | % de la commune en zone exposée | Géorisques rend la valeur **au point**, pas une distribution communale. |
| P3.6 | Checklist pré-achat | **Texte statique, zéro donnée.** Relève d'un guide, pas d'une analyse — et diluerait les aléas réels. |
| P4.2 | Délai de revente estimé | Rien ne convertit honnêtement un volume de ventes en mois. |
| P4.5 | Tendances démographiques | **Champs absents des jeux de données** (documenté dans `demographie.ts`). |
| P5.1 | Timeline de gentrification | **Aucune donnée** — serait de l'invention LLM. Viole le principe fondateur « l'IA ne produit jamais un chiffre ». |
| P5.2 | POI culturels | Restaurants/bars **déjà** dans `vieQuartier` ; le reste = requête OSM supplémentaire pour du décor. |
| P5.3 | Temps de trajet multimodal | Exige une **API de routage** (nouvelle source). La distance à la gare, elle, existe et est retenue. |
| P6.2 | Scénarios fiscaux | **Rôle de l'onglet Playground**, qui existe. |
| P6.4 | Tests de sensibilité | Idem Playground. |
| P2.2bis | Sensibilité charges → loyer | Idem Playground. |

---

## 6. Les 21 ajouts retenus, en détail

Notation : **Note** = effet sur une note. `—` = affichage seul (justifié).
**Coût** = appels réseau supplémentaires.

### 6.1 Prix & marché — 4 ajouts, 1 retrait

**Retrait** — `Prix/m² du bien` : déjà la 3ᵉ `StatCard` de la rangée KPI,
400 px plus haut, avec l'écart en sous-titre. Doublon strict.

| Id | Donnée | Forme | Note | Coût |
|---|---|---|---|---|
| **A1** | Médiane €/m² par millésime : 2014-16 · N-2 · N-1 · N | **Sparkline (courbe)** | — décompose la sous-note « dynamique » | Nul — `recentesParAnnee` déjà collecté puis aplati |
| **A2** | Dynamique de la dernière année (N vs N-1) | **Delta KPI** (chiffre + flèche) | — | Nul |
| **A3** | Tendance du volume de ventes (N vs N-1) | **Delta KPI** | **Oui** — module la sous-note liquidité : un volume qui s'effondre annonce une revente difficile, ce qu'un cumul masque | Nul |
| **A4** | Distribution des ventes : p25 · médiane · p75 + position du bien | **Boxplot horizontal simplifié** (strip plot) | **Oui** — nouvelle sous-note « dispersion » (0,10) **et** atténuation de 30 % de la sous-note écart quand le prix tombe dans l'interquartile | Nul — les ventes sont en mémoire, p25/p75 = 2 lignes |

⚠️ **A4 modifie une note existante.** Effet attendu : un bien à +8 % d'une
médiane sur distribution large cesse d'être noté comme surcoté — « au prix du
marché » est une plage, pas un point. À valider sur échantillon (Lot 4).

### 6.2 Rendement — 5 ajouts, 2 retraits

**Retraits** — `Loyer de marché médian` + `Fourchette de loyer` : deux lignes
pour une seule information, remplacées par le bullet chart B1.

| Id | Donnée | Forme | Note | Coût |
|---|---|---|---|---|
| **B1** | Position du loyer retenu dans la fourchette ANIL (min · médiane · max · curseur) | **Bullet chart** | — rend visible la pénalité `loyerPenalite` déjà appliquée | Nul |
| **B2** | Rendement net vs seuils du profil (rédhibitoire · modeste · position) | **Bullet chart** | — c'est *littéralement* le barème du bloc | Nul |
| **B3** | **Taux d'effort du locataire** = loyer CC × 12 ÷ revenu médian disponible | **Delta KPI** + seuil | **Oui — nouvelle sous-note (0,20)** | **Nul** — les deux nombres sont déjà chargés |
| **B4** | **Rendement brut médian du secteur** = (loyer ANIL €/m² × 12) ÷ médiane DVF €/m² | **Delta KPI** (bien vs secteur) | — repère absolu | **Nul** — les deux médianes sont déjà en mémoire |
| **B5** | Décomposition du loyer : HC · charges copro · taxe foncière · net | **Barres empilées horizontales** | — | Nul (`deriveLoyerHC`, champs existants) |

**B3 et B4 sont les deux meilleurs rapports valeur/coût de la spec.**

- **B4** répond à la question que le bloc pose sans y répondre depuis toujours :
  *« 5 %, c'est bon ou pas ? »*. Le rendement médian du secteur se calcule en
  une ligne à partir de deux médianes déjà chargées — loyer ANIL et prix DVF.
  Zéro requête.
- **B3** répond à celle que personne ne pose : *« est-ce que quelqu'un, ici,
  peut payer ce loyer ? »*. Un loyer au marché mais exigeant plus de 33 % du
  revenu médian local signale un vivier de locataires étroit — donc un risque
  de vacance que le rendement affiché ignore.
  Barème (`interpole`, à calibrer) : ≤ 25 % → 5 · 33 % → 4 · 40 % → 2,5 · 50 % → 1.

⚠️ Le revenu médian reste affiché dans Quartier ; B3 le **cite** en `detail`
(« sur 24 800 €/an/UC ») sans le dupliquer en ligne.

### 6.3 Risques — 5 ajouts, 1 retrait

**Retrait** — `Incohérence diagnostic saisi / officiel` : ce n'est pas un risque
du bien mais une erreur de saisie. Sa place est sur le champ DPE de l'onglet
« Description du bien », où elle est corrigeable.

| Id | Donnée | Forme | Note | Coût |
|---|---|---|---|---|
| **C1** | Aléas sur leur échelle réelle (argiles 1-3, radon 1-3, sismicité 1-5) | **Échelle catégorielle** (patron `EnergyScale`) | — rend visibles les pénalités déjà appliquées | Nul (codes déjà reçus) |
| **C2** | Coût de remise en classe D (`COUT_RENO_M2` × surface) | **Chiffre €** + % du prix | — chiffre la pénalité DPE | Nul — extraire de `recommandations.ts` |
| **C3** | Arrêtés de catastrophe naturelle (GASPAR) | **Chiffre + période** | **Oui** — pénalité 0,25/tranche, plafond 1 | **1 endpoint** (même fournisseur que Géorisques) |
| **C4** | Flag assurabilité (si DPE F/G **ou** CatNat élevé) | **Encadré d'alerte** | — | Nul (dérivé) |
| **C5** | Ancienneté du diagnostic (DPE d'avant la réforme 2021) | **Flag** | — | Nul (`anneeDpe` déjà utilisé dans `recommandations.ts`) |

⚠️ **C2 impose d'extraire `COUT_RENO_M2` et son calcul dans un module partagé**
(`analyse/travaux.ts`). Le recopier créerait deux barèmes de rénovation
destinés à diverger.

### 6.4 Quartier & cadre de vie — 5 ajouts, 2 fusions

**Fusions** — `Typologie de la commune` rétrogradée en `detail` (trois nombres
qui ne changent aucun arbitrage pour qui a choisi sa ville) ; `Écoles` +
`Santé` absorbées dans la rangée commodités (même mesure OSM, même rayon).

| Id | Donnée | Forme | Note | Coût |
|---|---|---|---|---|
| **D1** | Sécurité **par type** (cambriolages · vols · dégradations) vs moyenne ville | **Barres groupées** (3 catégories × 2 séries) | **Oui** — affine la sous-note sécurité, calculée aujourd'hui sur une somme | **Nul — déjà téléchargé puis jeté** |
| **D2** | Commodités : transports · commerces · écoles · santé, avec les 2 distances connues (gare, parc) | **Rangée d'icônes chiffrées** | — dédoublonne Potentiel/Quartier | Nul |
| **D3** | Loyer €/m² des arrondissements de la même ville, bien surligné | **Barres horizontales triées** | — situe le secteur dans sa ville | **Nul — ANIL est un fichier local** |
| **D4** | Ambiance (`Très animé`…) + caractère (`Résidentiel`…) | **Paire de tags** | — | Nul (déjà calculés, aujourd'hui sur 2 lignes) |
| **D5** | Note du bloc /10 avec ses 4 sous-notes | **Jauge + décomposition** | **C'est la note** (§4) | Nul |

**D1 est de la donnée déjà payée et jetée.** Dans `buildBlocPotentiel`, le
tableau `cles` (les 3 indicateurs les plus parlants) est construit puis utilisé
**uniquement dans la branche de repli** — c'est-à-dire partout **sauf** à
Paris, Lyon et Marseille, les seuls endroits où la comparaison à la ville
existe. Les villes où l'information est la plus riche sont celles où le code la
supprime.

⚠️ **D3 est limité aux villes à arrondissements** (`parentPLM()` les identifie
déjà). Ailleurs, comparer aux communes limitrophes exigerait une table
d'adjacence — hors périmètre. Le bloc n'affiche alors pas ce visuel.

### 6.5 Projection financière — 2 ajouts (bloc informatif, poids 0)

| Id | Donnée | Forme | Note | Coût |
|---|---|---|---|---|
| **E1** | Trésorerie cumulée année par année | **Aire cumulée**, zone négative teintée | — répond à « à partir de quand je ne sors plus d'argent » | Nul — `simulate()` produit la série |
| **E2** | Plus-value à la revente à 5/10/15 ans (scénarios 0 % · évolution observée · +2 %/an) | **Barres groupées** (3 horizons × 3 scénarios) | — seule réponse à la question de sortie | Nul — déterministe depuis `prix` + `evolutionPct` |

**Ne PAS ajouter ici** : scénarios fiscaux, tests de sensibilité. C'est le rôle
de l'onglet **Playground**, qui existe déjà.

---

## 7. Types de graphiques — inventaire et justification

⚠️ **Décision révisée le 2026-08-20 — la règle est maintenant portée par
`docs/reference/graphiques-dataviz.md`, qui fait autorité sur cette section.**

La spec disait initialement « aucune librairie ». C'est faux depuis le commit
`d5c20f2` : le projet a tranché pour **`d3-shape` + `d3-scale` + Framer
Motion**, et a livré `src/components/charts/DonutChart.tsx` comme première
implémentation de référence.

Ce qui n'a pas changé : **aucun kit de charts clé en main** (Recharts,
ApexCharts, Nivo, ECharts, Chart.js, Tremor sont écartés, motifs dans
`graphiques-dataviz.md`). Le SVG reste écrit à la main ; `d3-shape` fournit
seulement les générateurs (`arc`, `pie`, `line`, `area`, `curveMonotoneX`) et
`d3-scale` les échelles — ce qu'il est absurde de réécrire en trigonométrie
manuelle. Framer Motion est réservé aux graphiques ayant un **vrai besoin
gestuel** (drag, spring au survol) ; une entrée animée simple se fait en CSS,
comme dans `DonutChart`.

| # | Type de graphique | Sert à | Où | Pourquoi ce type |
|---|---|---|---|---|
| **V1** | **Sparkline (courbe)** — polyline + points, sans axes | 4 médianes annuelles | A1 | Une tendance à 4 points ne mérite pas d'axes ; la forme *est* le message. Un histogramme suggérerait à tort des catégories indépendantes. |
| **V2** | **Boxplot horizontal simplifié** (strip plot) — barre p25–p75, trait médian, curseur du bien | Distribution des ventes | A4 | Seul type qui montre **la dispersion et la position** dans un même objet. Un histogramme demanderait 8+ classes pour un échantillon souvent < 40 ventes. |
| **V3** | **Bullet chart** — bande de plage + repère cible + curseur mesure | Loyer dans la fourchette ANIL | B1 | Le patron canonique « une mesure, une plage de référence ». **`TrendBar` en est déjà un** : zones + curseur. |
| **V4** | **Bullet chart** | Rendement vs seuils du profil | B2 | Idem V3 — deux seuils du profil dessinent naturellement 3 zones. |
| **V5** | **Barres empilées horizontales** | Décomposition du loyer | B5 | Un total qui se répartit en parts exclusives : c'est la définition de l'empilement. Un camembert perdrait la comparaison des montants. |
| **V6** | **Échelle catégorielle** (patron `EnergyScale`) | Aléas argiles / radon / sismicité | C1 | Niveaux discrets sans valeurs intermédiaires — exactement le cas du DPE, dont le composant existe. |
| **V7** | **Barres groupées** (3 × 2) | Sécurité bien vs ville | D1 | Comparaison de **paires** sur plusieurs catégories : le groupement est le seul type qui garde les deux séries lisibles côte à côte. |
| **V8** | **Barres horizontales triées** | Loyer €/m² par arrondissement | D3 | Un classement se lit horizontalement (les libellés tiennent) ; le tri **est** l'information. Le bien surligné en `accent-600`. |
| **V9** | **Aire cumulée** avec zone négative teintée | Trésorerie cumulée | E1 | L'aire dit « accumulation » ; le franchissement du zéro est le point de lecture, souligné par le changement de teinte. |
| **V10** | **Barres groupées** (3 × 3) | Plus-value par horizon × scénario | E2 | Deux dimensions catégorielles, aucune continuité temporelle à suggérer. |
| — | **Waterfall** | Cash-flow | existant | — |
| — | **Échelle DPE/GES** | DPE/GES | existant | — |

### Éléments non graphiques (à ne pas confondre)

**Delta KPI** (A2, A3, B3, B4) : grand chiffre + flèche + libellé de référence.
Ce **n'est pas** un graphique et ne doit pas en devenir un — une variation
unique se lit plus vite en chiffre qu'en dessin.

### Le premier ticket

**V3 et V4 ne demandent aucun code de dessin** : ce sont deux instances de la
barre à trois zones déjà écrite pour le verdict. **Extraire `TrendBar` en
primitive générique** (zones + curseur + libellés + `aria`) est donc le premier
ticket de la refonte visuelle, pas un refactor optionnel — il couvre 2 des
10 visuels et fixe la grammaire des 8 autres.

⚠️ **État réel (2026-08-20) : `TrendBar` corrigé et animé, pas encore
extrait.** Un vrai bug de couleur y a été trouvé et corrigé avant toute
extraction : le remplissage posait un `linear-gradient` dont les stops
étaient relatifs à la largeur de l'élément REMPLI (variable selon le score),
pas à la piste entière — un score bas (élément étroit) compressait tout le
dégradé rouge→vert dans cette largeur réduite et finissait en vert alors que
le score restait dans la zone rouge. Fix : `backgroundSize` ancré sur la
largeur de la piste complète (`(100/cursorPct)*100%`), détail dans
`graphiques-dataviz.md` § Mark specs. `TrendBar` utilise maintenant aussi
`useInView` (entrée animée au scroll, pas au montage). **Reste à faire** :
l'extraction en primitive générique réutilisable pour V3/V4 elle-même —
ce ticket n'est pas encore pris.

### Contraintes de rendu — alignées sur `graphiques-dataviz.md`

- **Mobile 375 px** : `viewBox` + `width: 100%`, jamais de largeur fixe.
  Hauteur **`h-48` sous 640 px, `h-64` au-delà** pour les séries temporelles.
  Un graphique qui déborde se **décime ou se redimensionne — il ne défile
  jamais** ; `overflow-x-auto` est réservé aux TABLEAUX.
- **Tonalités** : `emerald` / `amber` / `red` par seuil, `accent-600` pour le
  bien étudié, **`ink-400`** pour les comparants — jamais de palette de
  graphique autonome (voir `docs/reference/couleurs-scoring.md`).
  ⚠️ **`ink-400`, pas `ink-300`** : ce dernier mesure 1,68:1 contre le fond
  blanc, sous le plancher de 3:1 — un comparant y serait invisible. Palette
  passée au validateur, résultats en **§11.2**.
- **Cash-flow : couleur par SEUIL (`cashflowTone`), jamais par signe brut.**
  Une série cumulative neutre (trésorerie) est en **`accent-600` seul**, sans
  légende — le titre de la carte suffit pour une série unique.
- **Accessibilité** : `role="img"` + `aria-label` chiffré, **plus une table de
  données `<details>` sous chaque graphique** — obligatoire, ce n'est pas une
  option (voir §11.3).
- **Animation obligatoire à l'entrée, déclenchée au VIEWPORT** : tracé de
  ligne par `stroke-dasharray`/`dashoffset`, barres montant depuis la ligne de
  base en cascade de 30–50 ms, uniquement via `transform`/`opacity`. Le
  déclencheur est `useInView` (`src/components/charts/useInView.ts`,
  `IntersectionObserver`) — **jamais au montage** : un graphique animé au
  montage a fini de jouer avant que le lecteur ne scrolle jusqu'à lui sur une
  fiche bien longue. Piège déjà corrigé deux fois, à ne pas réintroduire :
  (1) le basculement passe par un `requestAnimationFrame`, sinon un graphique
  déjà visible au montage (au-dessus de la ligne de flottaison, scroll
  restauré par le navigateur au reload) saute directement à l'état final sans
  rien animer ; (2) `prefers-reduced-motion` **désactive** l'animation (pas
  juste la raccourcit) **DANS le hook lui-même**, via `useReducedMotion`
  (`src/components/charts/useReducedMotion.ts`) — la règle globale de
  `globals.css` ne coupe que des `@keyframes` nommées, pas les `transition`
  CSS que ces graphiques utilisent. Tout graphique de l'app (V1 à V10 compris)
  reprend `useInView` ; aucun ne réimplémente sa propre détection.

---

## 8. Impacts sur l'algorithme de score

Sept points de code. Aucun n'est optionnel.

### 8.1 `BLOC_POIDS` et `BLOC_POIDS_SANS_PRIX` (`analyse/types.ts`)

```
BLOC_POIDS            : prix 0.35 · location 0.35 · risque 0.20 · quartier 0.10 · simulation 0 · potentiel 0
BLOC_POIDS_SANS_PRIX  : prix 0    · location 0.55 · risque 0.30 · quartier 0.15 · simulation 0 · potentiel 0
```

`potentiel` reste dans les deux tables à 0 **pour que les analyses stockées ne
cassent pas** (`computeScoreGlobal` itère sur `Object.values(blocs)` et lit
`b.poids`). Ne pas retirer la clé de `BlocKey`.

### 8.2 ⚠️ Le déclencheur de `BLOC_POIDS_SANS_PRIX` change de nature

Aujourd'hui : `blocs.prix.note != null`. Après fusion, **`prix` peut être noté
sans aucune comparaison de prix** (dynamique + liquidité suffisent). Garder la
condition actuelle ferait disparaître le repli « sans prix » précisément dans
le cas qu'il existe pour couvrir.

Nouvelle condition : la **sous-note « écart » est absente** — d'où §8.3.

### 8.3 Nouveau champ `sousNotes` sur `BlocAnalyse`

```ts
/** Décomposition de la note du bloc. Absente sur les analyses antérieures :
 *  tout lecteur doit la traiter comme optionnelle. */
sousNotes?: { cle: string; label: string; note: number; poids: number }[];
```

Trois effets d'un coup : il donne à `computeScoreGlobal` le déclencheur de
§8.2 ; il rend vraie la promesse « chaque donnée impacte la note » (l'UI affiche
`Écart 7,2 · Dynamique 6,0 · Liquidité 8,1 · Dispersion 5,5`) ; il documente le
calcul sans commentaire à maintenir.

**11 sous-notes** deviennent visibles : 4 en Prix & marché, 3 en Rendement,
4 en Quartier & cadre.

### 8.4 ⚠️ `computeDecision` — un quartier moyen ne doit pas opposer son veto

`extractBlocNotes()` filtre sur `poids > 0`. Faire passer `quartier` de 0 à
0,10 le fait **entrer automatiquement** dans le test `aucunBlocFaible`, qui
exige que *tous* les blocs pondérés soient ≥ 5 pour autoriser « Acheter ». Un
quartier à 4,8 interdirait alors un achat par ailleurs excellent.

Correctif : `computeDecision` teste un ensemble explicite de **blocs bloquants**
— `{ prix, location, risque }` — et non plus « tous les blocs pondérés ». Un
quartier médiocre rabote le score ; il ne veto pas.

### 8.5 `buildVerdicts` (`analyse/scoring.ts`)

- `BLOCS_INFORMATIFS` : `{ simulation, potentiel }`. **`quartier` en sort**
  (il est noté) mais rejoint l'ensemble non bloquant de §8.4.
- `BLOC_VERDICT_FAIBLE` / `BLOC_VERDICT_FORT` : entrées `potentiel` conservées
  (analyses anciennes) ; libellés `prix` et `quartier` réécrits — « Prix trop
  élevé » devient inexact quand la note peut aussi chuter sur la liquidité ou
  la dispersion.

### 8.6 Plafonds inchangés

Plafond risque (`note ≤ 4 → global ≤ 4`) et plafond rendement
(`rendementNet < seuil rédhibitoire → global ≤ 5`) ne bougent pas. Ce sont les
garde-fous contre la dilution ; la refonte des poids ne les concerne pas.

### 8.7 ⚠️ Rétrocompatibilité des analyses stockées

`ANALYSE_VERSION` doit être incrémenté — mais un bump **ne relance pas** les
analyses existantes : elles restent en base avec un `potentiel` noté et un
`quartier` à `note: null`.

Règle d'affichage, dans `AnalyseIA.tsx` :

- `blocs.potentiel?.note != null` → analyse ancienne : afficher les blocs
  **tels que stockés** (ancien découpage à 5 blocs) + bandeau invitant à
  relancer ;
- sinon → nouveau découpage.

Ne **pas** recomposer un ancien JSON dans le nouveau découpage : les sous-notes
n'y sont pas, la recomposition serait une invention. Même règle que celle déjà
documentée dans AGENTS.md — « une analyse en base n'est pas une sortie du code
courant ».

---

## 9. Bilan quantitatif

| | Avant | Après |
|---|---|---|
| Blocs notés | 4 (`prix`, `location`, `risque`, `potentiel`) | 4 (`prix`, `location`, `risque`, `quartier`) |
| Blocs informatifs | 2 (`quartier`, `simulation`) | 1 (`simulation`) |
| Éléments affichés | ~26 | **~42** (+21 ajouts, −5 retraits) |
| dont visuels | 2 | **10 + 2 existants** |
| Sous-notes exposées | 0 | **11** |
| Nouveaux appels réseau | — | **1** (GASPAR/CatNat) |
| Doublons entre blocs | 3 | 0 |

---

## 10. Lots de livraison

**Lot 1 — Fusion et scoring (aucun changement visuel)**
`BLOC_POIDS`, dissolution de `potentiel`, champ `sousNotes`, déclencheur
`SANS_PRIX` (§8.2), blocs bloquants (§8.4), barèmes Quartier, bump
`ANALYSE_VERSION`, garde de rétrocompat (§8.7).
*Sortie : écart de score avant/après documenté bien par bien sur un échantillon réel.*

**Lot 2 — Ajouts à coût nul**
A1, A2, A3, B3, B4, B5, C1, C2, C5, D1, D2, D3, D4, E1, E2.
Aucun appel réseau nouveau. Extraction de `analyse/travaux.ts`.

**Lot 3 — Visuels**
Extraction de `TrendBar` en primitive générique, puis V1 → V10 sous
`src/components/charts/`, à côté de `DonutChart`. Chaque graphique arrive avec
sa table `<details>` et son animation d'entrée. Affichage des `sousNotes` dans
l'en-tête de chaque bloc (D5).
⚠️ `d3-shape` et `d3-scale` sont **déjà installés** (commit `d5c20f2`) — ne
pas réécrire de trigonométrie ni d'échelle à la main.

**Lot 4 — Ajouts coûteux ou à valider**
A4 (atténuation interquartile — validation sur échantillon obligatoire) et
C3/C4 (endpoint GASPAR + flag assurabilité).

**Lot 5 — Reporté**
P2.4 (historique du loyer médian) : exige de régénérer et stocker plusieurs
millésimes ANIL. À rouvrir si le besoin se confirme.

---

## 11. Specs designer

> ⚠️ **Autorité** : depuis le commit `d5c20f2`,
> `docs/reference/graphiques-dataviz.md` est la référence dataviz de l'app, et
> `src/components/charts/DonutChart.tsx` sa première implémentation livrée.
> Cette section s'y aligne ; en cas de divergence, c'est le document de
> référence qui gagne.

Méthode : couche de tokens (primitive → sémantique → **composant**) puis
procédure data-viz *forme → rôle de couleur → validation → marques →
interaction → accessibilité*. La palette n'est **pas** choisie à l'œil : elle
est passée au validateur (§11.2).

### 11.1 La couche manquante : tokens de composant `--chart-*`

Le projet a déjà ses deux premières couches :

| Couche | Où | Exemple |
|---|---|---|
| **Primitive** | `globals.css`, `@theme inline` | `--color-ink-400: #8b8393` |
| **Sémantique** | `analyse/scoring.ts` | `NOTE_TEXT_CLASS`, `TONE_PANEL_STYLES`, `DECISION_RING_STYLES` |
| **Composant** | **absente pour la data-viz** | — |

Rien ne dit aujourd'hui « couleur d'un axe », « couleur d'un comparant »,
« couleur de la série du bien ». Sans cette couche, dix visuels vont fixer dix
fois leurs teintes en dur — exactement le mécanisme de dérive que la charte
interdit ailleurs.

À ajouter dans `globals.css`, sous `@theme inline` :

```css
/* Couche COMPOSANT — data-viz. Ne jamais écrire une teinte en dur dans un SVG. */
--chart-subject:      var(--color-accent-600);  /* le bien étudié — toujours lui */
--chart-comparator:   var(--color-ink-400);     /* médiane, ville, voisins */
--chart-axis:         var(--color-ink-200);     /* axes et lignes de repère */
--chart-grid:         var(--color-ink-100);     /* trame de fond, si présente */
--chart-surface:      #ffffff;                  /* fond de carte */
--chart-band:         var(--color-ink-100);     /* bande de plage (bullet chart) */
--chart-negative:     var(--color-red-50);      /* aire sous zéro */
/* Rampe séquentielle — scénarios ORDONNÉS uniquement, jamais des catégories */
--chart-seq-1:        var(--color-accent-300);
--chart-seq-2:        var(--color-accent-500);
--chart-seq-3:        var(--color-accent-900);
```

⚠️ **Les tonalités de statut (`emerald` / `amber` / `red`) ne rejoignent PAS
cette couche.** Elles restent pilotées par `noteTone()` et `TONE_*`, et ne
doivent jamais servir de couleur de série : une barre verte parce que « série
2 » à côté d'une barre verte parce que « bon score » rend les deux illisibles.

### 11.2 Palette validée — résultats du validateur

Exécuté sur surface claire. Verdicts retenus :

| Rôle | Teintes | CVD | Vision normale | Contraste |
|---|---|---|---|---|
| **Sujet vs comparant** | `accent-600` + **`ink-400`** | PASS ΔE 25,7 | PASS ΔE 26,1 | **PASS ≥ 3:1** |
| Séquentiel 3 paliers | `accent-300` · `accent-500` · `accent-900` | PASS ΔE 25,5 | PASS ΔE 26,1 | WARN sur `accent-300` (2,1:1) |

**Correction à §7 de cette spec** : j'y avais écrit « `ink-300` pour les
comparants ». **Faux** — `ink-300` mesure **1,68:1** contre le fond blanc,
sous le plancher de 3:1 : une barre de comparaison y serait quasi invisible.
**Les comparants sont en `ink-400`**, seule variante qui passe le contraste
tout en restant récessive.

⚠️ **Le WARN de contraste sur `accent-300` n'est pas négociable** : partout où
la rampe séquentielle est utilisée (V10), les valeurs doivent porter un
**libellé chiffré visible**. Pas de barre claire sans son nombre.

#### Constat sur la palette de statut existante — hors périmètre, à documenter

La triade déjà en production (`emerald-600` / `amber-600` / `red-600`) échoue
deux contrôles :

- **Vision normale** : `red-600` ↔ `amber-600` → ΔE **14,4** (plancher 15).
  Deux voisins difficiles à distinguer même sans déficience.
- **CVD** : `amber-600` ↔ `emerald-600` → ΔE **7,9** en protanopie.

Ce n'est **pas** introduit par cette refonte — c'est l'état actuel de toute
l'app, et AGENTS.md fige ces teintes. La parade prescrite est déjà en place à
plusieurs endroits (`TrendBar` porte ses libellés « Passer / Négocier /
Acheter », les notes portent leur chiffre). **Elle devient une règle dure pour
les 10 nouveaux visuels** :

> Une tonalité de statut ne porte **jamais** une information seule. Elle
> s'accompagne toujours d'un chiffre, d'un libellé ou d'une icône.

Un changement de la triade de marque relève d'un chantier séparé, pas de
cette spec.

### 11.3 Spécifications de marque — reprises de `graphiques-dataviz.md`

Ces valeurs ne sont plus propres à cette spec : elles sont **validées à
l'échelle de l'app**. En cas de divergence, `graphiques-dataviz.md` gagne.

| Propriété | Valeur | Raison |
|---|---|---|
| Épaisseur de barre | **≤ 24 px** | Jamais toute la largeur de la bande — le reste est de l'air |
| Coins de barre | **4 px côté valeur, CARRÉ à la ligne de base** | Une barre s'ancre à son axe, elle n'y flotte pas |
| Écart entre barres adjacentes | **2 px** | Vaut aussi pour les segments empilés |
| Épaisseur de ligne | **2 px**, jointures arrondies | Fine — la donnée, pas le trait |
| Remplissage d'aire | **10–22 % d'opacité** de la teinte de série | Jamais un aplat |
| Grille et ligne zéro | **hairline SOLIDE 1 px** — `ink-200` grille, `ink-300` zéro | ⚠️ **Jamais en pointillé**, contre le réflexe courant |
| Anneau sur marques superposées | **2 px** de `--chart-surface` | Curseur du bullet chart sur sa bande |
| Points de courbe | **8 px** min, dernier point plein | Cible tactile et point de lecture |
| Pastilles de légende | **rondes**, `h-2 w-2 rounded-full` | Gabarit de `DonutChart`, pas des carrés |
| Ticks d'axe | `font-sans` **10 px** `ink-400` `tabular-nums` | ⚠️ **Pas `font-mono`** — voir ci-dessous |
| Texte | tokens d'encre (`ink-500` / `ink-900`) | **Jamais la couleur de la série** |

⚠️ **Correction : les ticks d'axe ne sont PAS en Geist Mono.** Cette spec
disait l'inverse. Le mono est réservé au **chiffre clé isolé** (TRI, score,
KPI) ; un tick d'axe est une ligne de détail. Défaut supplémentaire constaté
au rendu : en chasse fixe, l'espace des milliers occupe la largeur d'un
chiffre — « 3 790 » s'affiche avec un trou. `DonutChart` pousse la dérogation
plus loin (IBM Plex 14 px sur ses montants) ; **ne pas la généraliser** sans
arbitrage.

#### Deux règles qui changent la composition des visuels

1. **Libellés directs sur les valeurs EXTRÊMES uniquement** — le minimum et le
   maximum de la série, jamais un chiffre sur chaque barre ou chaque point.
   Le reste passe par l'infobulle et par la table.
2. **Une table `<details>` sous CHAQUE graphique, toujours** — c'est
   l'équivalent accessible, au même titre que l'`aria-label`. Elle porte les
   valeurs exactes que les libellés sélectifs n'affichent pas.

Les deux règles se tiennent : on n'ose retirer les étiquettes que parce que la
table garantit l'accès au chiffre.

### 11.4 Anatomie des visuels

Dimensions en hauteur ; la largeur est toujours fluide (`viewBox` +
`width: 100%`).

| # | Visuel | Hauteur | Structure |
|---|---|---|---|
| V1 | Sparkline médiane €/m² | 64 px | Polyline 2 px `--chart-subject` · 4 points 8 px · dernier point plein + libellé direct · pas d'axe Y · millésimes en `ink-400` 10 px |
| V2 | Boxplot horizontal | 56 px | Bande p25–p75 `--chart-band` h 20 px r 4 px · trait médian 2 px `--chart-comparator` · curseur du bien Ø 14 px `--chart-subject` + anneau 2 px blanc · 3 libellés sous la bande |
| V3 | Bullet loyer / fourchette ANIL | 44 px | **Réutilise `TrendBar`** : 3 zones h 10 px r 5 px · curseur Ø 16 px bordure 3 px · libellés min/médiane/max 9 px `uppercase tracking-wide` |
| V4 | Bullet rendement / seuils | 44 px | Idem V3, zones pilotées par `seuils.redhibitoire` et `seuils.modeste` |
| V5 | Barres empilées loyer | 40 px | Une barre h 24 px r 4 px aux extrémités · 4 segments séparés par 2 px de fond · légende sous la barre avec pastille + montant |
| V6 | Échelle catégorielle aléas | 48 px | **Patron `EnergyScale`** : n cases, la case active en relief (h 40 px, `ring-2 ring-white`, `shadow-md`), inactives h 28 px opacité 0,7 |
| V7 | Barres groupées sécurité | 120 px | 3 catégories × 2 barres · bien `--chart-subject`, ville `--chart-comparator` · 2 px entre les deux · **légende obligatoire** (2 séries) · libellés directs |
| V8 | Barres horizontales triées | 24 px/ligne, **8 lignes max** | Tri décroissant · bien en `--chart-subject`, autres en `--chart-comparator` · libellé et valeur sur chaque ligne · au-delà de 8 arrondissements, garder le bien + les 7 plus proches en valeur |
| V9 | Aire cumulée trésorerie | 96 px | Aire `--chart-subject` à 12 % d'opacité au-dessus de 0, `--chart-negative` en dessous · ligne 2 px · **ligne zéro 1 px `--chart-axis` en trait plein** · année de bascule libellée |
| V10 | Barres groupées plus-value | 130 px | 3 horizons × 3 scénarios en rampe séquentielle `--chart-seq-1/2/3` · **libellé chiffré obligatoire** (WARN contraste §11.2) · légende |

**Delta KPI** (A2, A3, B3, B4) — ce **n'est pas** un graphique : valeur en
`font-mono text-2xl`, flèche ↑/↓ 14 px teintée par `noteTone`, référence en
`text-xs ink-500` sur la ligne du dessous. Même gabarit que `StatCard`, sans
la bordure.

### 11.5 États

Table d'états, à respecter par tout visuel :

| État | Rendu |
|---|---|
| **Défaut** | Le visuel |
| **Survol** (desktop) | Infobulle (§11.6) + marque survolée passe à 100 % d'opacité, les autres à 60 % |
| **Focus clavier** | `ring-2 ring-accent-500/40 ring-offset-2` sur le conteneur focusable |
| **Chargement** | `Skeleton` **à la hauteur exacte du visuel final** — jamais un spinner : le saut de hauteur à l'arrivée de la donnée est la nuisance principale de cet écran |
| **Donnée manquante** | Le visuel n'est **pas** rendu. Une ligne `text-xs ink-400` reprend le patron existant : « Donnée(s) non disponible(s) : … » |
| **Donnée partielle** | Le visuel est rendu avec les points connus, les manquants en pointillé `ink-300`, et la lacune nommée sous le graphe |
| **Périmètre dégradé** | Bandeau `invite` existant (`border-dashed`), inchangé |

⚠️ **Jamais de valeur estimée pour combler un trou dans un graphique.** Une
courbe interpolée sur une donnée absente est indiscernable d'une donnée réelle
— c'est le principe fondateur du module (« l'IA ne produit jamais un chiffre »)
appliqué au dessin.

### 11.6 Interaction

Un SVG en HTML **est** interactif : l'infobulle est le défaut, pas une option.

| Forme | Interaction |
|---|---|
| V1, V9 (courbe / aire) | Réticule vertical + infobulle suivant le point le plus proche en X |
| V2, V5, V7, V8, V10 (barres, boxplot) | Infobulle au survol de chaque marque |
| V3, V4 (bullet) | Infobulle sur le curseur uniquement |
| V6 (échelle) | Aucune — les libellés sont déjà tous visibles |
| Delta KPI | Aucune |

**Gabarit d'infobulle** : `rounded-lg bg-ink-900 px-3 py-2 text-xs text-white
shadow-md`, libellé en `ink-300`, valeur en `font-mono`. Zone de déclenchement
**plus large que la marque** (bande invisible pleine hauteur pour les courbes).
Sur tactile, l'infobulle s'ouvre au *tap* et se ferme au tap suivant ou hors
zone.

⚠️ L'ombre est ici légitime — la charte la réserve aux éléments réellement
flottants au-dessus du contenu, ce qu'une infobulle est par définition.

### 11.7 Responsive

| Palier | Comportement |
|---|---|
| **< 640 px** | Un visuel par ligne, pleine largeur. V7 et V10 passent en barres **empilées verticalement par catégorie** plutôt que groupées — 6 à 9 barres côte à côte sur 343 px sont illisibles. V8 plafonne à **5 lignes**. |
| **≥ 640 px** | Grille 2 colonnes pour les visuels courts (V1, V2, V3, V4, V5) |
| **≥ 1280 px** | Inchangé — la fiche est en `max-w-6xl`, les visuels ne gagnent rien à s'étirer davantage |

Aucun visuel ne provoque de défilement horizontal de la page. Si un contenu
déborde, il défile **dans son propre conteneur** `overflow-x-auto` — et jamais
avec `.no-scrollbar`, qui est réservé aux barres de navigation.

### 11.8 Accessibilité

1. **`role="img"` + `aria-label` chiffré** sur chaque `<svg>` — la valeur en
   toutes lettres, comme `TrendBar` le fait déjà.
   *Ex. : « Loyer retenu 1 150 € par mois, dans une fourchette de marché de
   980 à 1 340 €, au-dessus de la médiane de 1 080 € ».*
2. **Légende obligatoire dès 2 séries** (V7, V10) ; libellés directs en plus
   tant qu'il y a ≤ 4 marques. L'identité n'est **jamais** portée par la
   couleur seule.
3. **Repli tabulaire** : chaque visuel a un équivalent lisible — soit la ligne
   de fait qu'il illustre, soit un `<table>` en `sr-only`. C'est la
   contrepartie obligatoire des WARN de contraste (§11.2).
4. **`prefers-reduced-motion`** : aucune transition d'entrée ne se joue —
   géré dans `useInView` lui-même (`entered` vaut `true` dès l'état initial
   pour ces lecteurs, pas de classe `motion-reduce:` à poser à la main sur
   chaque graphique). `TrendBar` (`duration-700`) suit ce mécanisme, pas une
   exception codée en dur.
5. **Cibles tactiles ≥ 44 px** sur toute marque interactive — au besoin via
   une zone transparente plus large que la marque visible.
6. **Pas de couleur seule** pour un statut (§11.2).

### 11.9 Anatomie du bloc accordéon refondu

L'ordre interne d'un bloc devient invariant — même séquence pour les quatre
blocs notés, pour qu'on apprenne l'écran une fois :

```
┌─ En-tête (inchangé : icône · titre · sous-titre · note /10 · chevron)
├─ Décomposition de la note        ← NOUVEAU (sousNotes, §8.3)
├─ Pastille de catégorie + invite éventuelle
├─ Narration IA                     (fond ink-100/40)
├─ Visuel principal                 (le plus décisif du bloc)
├─ Rangée de Delta KPI              (0 à 3)
├─ Visuels secondaires
├─ Liste des faits                  (divide-y divide-ink-100/50)
├─ Données manquantes
└─ Sources
```

**Décomposition de la note** — rangée sous l'en-tête, reprenant le patron
existant des sous-scores de la carte verdict : libellé `text-xs ink-400`,
valeur `font-mono font-bold` teintée par `noteTone()`, séparées par `gap-x-8
gap-y-2` avec `flex-wrap`.

```
Écart au marché 7,2   Dynamique 6,0   Liquidité 8,1   Dispersion 5,5
```

⚠️ **`flex-wrap` obligatoire** — quatre sous-notes ne tiennent pas sur 343 px,
et une rangée sans `flex-wrap` déborde **sous** son voisin (piège documenté
dans AGENTS.md).

### 11.10 Rythme vertical dans un bloc

Reprend l'échelle de la charte, sans en inventer :

| Entre… | Espacement |
|---|---|
| En-tête et décomposition de note | 16 px (M) |
| Décomposition et narration | 16 px (M) |
| Narration et premier visuel | 24 px (L) |
| Deux visuels | 24 px (L) |
| Dernier visuel et liste de faits | 24 px (L) |
| Faits et sources | 16 px (M) |
| Titre interne d'un visuel et son dessin | 10 px (S) |

---

## 12. Checklist de validation

### Scoring et données

- [ ] Une analyse stockée **avant** le bump s'affiche sans erreur et propose la relance (§8.7)
- [ ] Un bien **sans prix** obtient toujours une note « Prix & marché » depuis la dynamique et la liquidité seules
- [ ] Un bien **rural** (OSM pauvre) ne perd pas plus d'un point sur « Quartier & cadre » — planchers en place
- [ ] Un quartier noté 4 **n'empêche pas** une décision « Acheter » (§8.4)
- [ ] `ecartPrixMarche()` retrouve son fait — vérifié **depuis la page d'accueil**, pas seulement depuis la fiche
- [ ] Les plafonds risque et rendement produisent les mêmes résultats qu'avant
- [ ] Aucun fait n'apparaît dans deux blocs
- [ ] Chaque sous-note affichée est reliée à un fait visible dans le même bloc
- [ ] D3 ne s'affiche pas hors ville à arrondissements (pas de visuel à une seule barre)

### Design

- [ ] Aucune teinte écrite en dur dans un SVG — tout passe par `--chart-*` (§11.1)
- [ ] Aucune tonalité de statut utilisée comme couleur de série
- [ ] Aucune information portée par la couleur seule (§11.2)
- [ ] Toute barre en `accent-300` porte son libellé chiffré (WARN de contraste)
- [ ] Comparants en `ink-400`, jamais `ink-300`
- [ ] Ticks d'axe en `font-sans` 10 px `tabular-nums` — **jamais** `font-mono`
- [ ] Libellés directs sur les valeurs extrêmes seulement (min et max)
- [ ] Table `<details>` présente sous **chaque** graphique
- [ ] Barres ≤ 24 px, coin arrondi côté valeur, **carré à la ligne de base**
- [ ] Grille et ligne zéro en trait **plein**, jamais pointillé
- [ ] Pastilles de légende **rondes**, pas carrées
- [ ] Animation d'entrée déclenchée via `useInView` (viewport), **jamais au montage** — aucune détection réimplémentée
- [ ] Aucun dégradé CSS posé sur un élément à largeur VARIABLE sans `backgroundSize` ancré sur la piste entière (bug déjà rencontré sur `TrendBar`)
- [ ] Animation d'entrée présente, et **désactivée** sous `prefers-reduced-motion` — via `useReducedMotion`, pas une seconde vérification `matchMedia`
- [ ] Aucun graphique ne défile horizontalement — il se décime ou se redimensionne
- [ ] Chaque `Skeleton` fait la **hauteur exacte** du visuel qu'il remplace — zéro saut de mise en page
- [ ] Aucun trou de donnée comblé par une interpolation
- [ ] Infobulle présente sur toute forme qui en attend une (§11.6)
- [ ] Zones de tap ≥ 44 px sur les marques interactives
- [ ] V7 et V10 passent en empilé vertical sous 640 px ; V8 plafonne à 5 lignes
- [ ] Aucun défilement horizontal de la **page** provoqué par un visuel
- [ ] `role="img"` + `aria-label` chiffré sur chaque `<svg>`
- [ ] Légende présente dès 2 séries
- [ ] Repli tabulaire ou ligne de fait équivalente pour chaque visuel
- [ ] Rangée de sous-notes en `flex-wrap` (déborde sinon sous son voisin à 375 px)
- [ ] Ordre interne identique dans les 4 blocs notés (§11.9)

### Documentation

- [ ] `AGENTS.md` et `docs/reference/analyse-optimiser.md` mis à jour
- [ ] Tokens `--chart-*` documentés dans la charte graphique d'`AGENTS.md`
