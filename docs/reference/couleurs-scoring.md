# Couleurs sémantiques — référence complète

> Référence de domaine — chargée seulement quand la tâche affiche un chiffre
> coloré par un seuil (score, rendement, cash-flow, écart, DPE, verdict). Pour
> les règles de charte générales (accent/ink, boutons, typographie), voir
> `AGENTS.md`. Pointeur depuis `AGENTS.md`.

Trois fonctions canoniques pilotent les couleurs. Ne pas en créer de nouvelles
ni coder des seuils inline — toujours réutiliser celles-ci.

**Les tables tonalité → classe vivent aussi dans `scoring.ts`** et sont les
seules autorisées. Ne JAMAIS en redéfinir une copie locale dans un composant
(`METRIC_VALUE_CLASS`, `TONE_TEXT`, `RENDEMENT_TEXT_CLASS`, `cashflowTextClass`
étaient quatre copies divergentes — supprimées) :

- **`TONE_TEXT_CLASS[tone]`** — texte sur fond BLANC : tout chiffre coloré par un
  seuil du profil investisseur (rendement, cash-flow, écart). `neutral` =
  `text-ink-900`.
- **`NOTE_TEXT_CLASS[tone]`** — pour toute note /10. `neutral` = `text-ink-400`.
- **`TONE_PANEL_STYLES[tone]`** — texte sur fond TEINTÉ : panneaux de détail,
  cartes statistiques, pills. Quatre slots (`wrap` / `label` / `value` / `sub`),
  un cran plus foncé que sur blanc (voir « Intensité du rouge » plus bas).
  `sub` sert aux cartes à trois lignes. Concerne `RendementDetailPanel`,
  `CashflowDetailPanel`, `LoyerDetailPanel` et la pill de `ApartmentsMap`.

De même, `cashflowTone()` ne doit pas être ré-implémentée inline. Utiliser
`cashflowSeuilsFromSettings(settings)` pour construire les seuils.

## `noteTone(note)` — couleur d'un score /10

Utilisé pour les sous-scores du verdict, les scores de FlatSection, les tags de
catégorie **et l'anneau de score du tableau d'accueil** (`ScoreRing` /
`scoreToneClasses` dans `ApartmentsTable.tsx`, qui n'apporte plus que le fond,
le rail et l'anneau — jamais ses propres seuils). Source unique dans
`scoring.ts`. Les paliers sont alignés sur `scoreCategorie` : ≥ 7 = « Opportunité
intéressante » donc vert. Un 7,5 doit être vert PARTOUT — ne pas réintroduire un
seuil à 8 côté tableau.

| Score  | Tone    | Classe text (`NOTE_TEXT_CLASS`) |
|--------|---------|------------------|
| ≥ 7    | emerald | `text-emerald-700` |
| ≥ 5    | amber   | `text-amber-700`   |
| < 5    | red     | `text-red-600`     |
| null   | neutral | `text-ink-400`     |

## `scoreCategorie(note)` — verdict global de l'investissement

Utilisé uniquement pour le **tag du verdict global** (en-tête de l'Analyse IA).

| Score  | Label                      | Tone    |
|--------|----------------------------|---------|
| ≥ 8.5  | Excellente opportunité     | emerald |
| ≥ 7    | Opportunité intéressante   | emerald |
| ≥ 5    | À négocier                 | amber   |
| ≥ 3.5  | Investissement fragile     | red     |
| < 3.5  | Investissement déconseillé | red     |
| null   | Données insuffisantes      | neutral |

## `blocCategorie(note)` — tag qualitatif d'un bloc d'analyse

Utilisé pour les **tags des sections individuelles** (Prix d'achat, Potentiel
locatif, etc.). Les labels décrivent la qualité du thème évalué, pas le profil
d'investissement — ex. un Rendement à 5 est "Moyen", pas "À négocier".

| Score  | Label                 | Tone    |
|--------|-----------------------|---------|
| ≥ 8.5  | Excellent             | emerald |
| ≥ 7    | Favorable             | emerald |
| ≥ 5    | Moyen                 | amber   |
| ≥ 3.5  | Faible                | red     |
| < 3.5  | Critique              | red     |
| null   | Données insuffisantes | neutral |

Tags : `CATEGORIE_TAG_STYLES` dans `AnalyseIA.tsx` — emerald-50/700,
amber-50/700, red-50/700, ink-100/500. Partagé entre les deux fonctions
(mêmes tones, styles identiques).

## `rendementNetTone(rendement, seuils)` — couleur du rendement

Seuils configurables dans le profil investisseur (défauts : vert 5.5 %,
rouge 4.0 %).

| Condition           | Tone      |
|---------------------|-----------|
| ≥ seuil vert (5.5%) | positif   |
| ≥ seuil rouge (4%)  | attention |
| < seuil rouge        | alerte    |

## `cashflowTone(cashflow, seuils)` — couleur du cash-flow

Seuils configurables dans le profil investisseur (défauts : vert 0 €,
rouge −200 €).

| Condition               | Tone      |
|-------------------------|-----------|
| ≥ seuil vert (0 €)      | positif   |
| ≥ seuil rouge (−200 €)  | attention |
| < seuil rouge            | alerte    |

Mapping tone → classe : `TONE_TEXT_CLASS` (voir plus haut) — `positif` =
`text-emerald-700`, `attention` = `text-amber-700`, `alerte` = `text-red-600`,
`neutral` = `text-ink-900`.

**Les MetricCards de l'onglet Analyse respectent ces seuils** (prop
`cashflowSeuils`, passée par `ApartmentDetail`). Ne pas revenir à une
constante locale (0/−200 codés en dur).

## « Cash-flow mensuel » = ANNÉE 1, partout

Un « cash-flow mensuel » non qualifié désigne TOUJOURS
`simulate().cashflowMensuelAn1` — MetricCards de l'onglet Analyse, colonnes
avant/après de l'onglet Optimiser, et le moteur de recommandations
(`cashflowOf`, dichotomie du levier financement). Le cash-flow **moyen** existe
toujours mais n'est affiché QUE sous un libellé explicite (« Cash-flow mensuel
moyen », highlights du bloc Simulation).

Les deux valeurs divergent franchement dès que les hypothèses de
revalorisation/indexation sont actives, et peuvent tomber de part et d'autre
du seuil vert (cas réel observé : An1 = **+20 €** vert, moyen = **−112 €**
ambre, sur le même bien inchangé). La colonne « avant » d'Optimiser décrit le
bien RÉEL non modifié : elle doit afficher exactement le chiffre déjà lu sur
l'onglet Analyse.

⚠️ Les recommandations sont **persistées** dans `analyse_ia.recommandations` :
les biens analysés avant ce changement gardent un `cashflowAvant` calculé sur
la moyenne jusqu'à la prochaine relance d'analyse.

## Bloc Simulation financière (`blocs/simulation.ts`)

Bloc **informatif** (`note: null`, poids 0). Le cash-flow dépend du montage
financier personnel — il ne contribue ni au score global ni aux verdicts.
Les faits et highlights (cash-flow, mensualité, apport, années sans impôt)
sont toujours affichés.

## `ecartTone(pct)` — écart loyer (perspective investisseur)

`LoyerDetailPanel.tsx`. Logique **inversée** vs le locataire : au-dessus du
marché = bon pour l'investisseur.

| Écart       | Tone    | Raison                    |
|-------------|---------|---------------------------|
| > +25 %     | red     | Trop optimiste/irréaliste |
| 0 % à +25 % | emerald | Bon revenu locatif        |
| −10 % à 0 % | amber   | Revenu sous-optimal       |
| < −10 %     | red     | Très sous le marché       |

⚠️ **Seuil haut relevé 20 → 25** (audit "booster les critères positifs") :
`RESIDU_MAX` (`rentEstimation.ts`) est resté à 20, mais un bien avec
plusieurs bons critères LÉGITIMES peut désormais atteindre ce plafond de
résidu sans rien d'anormal — un seuil d'alerte resté à 20 le repeignait donc
en rouge pour de bonnes raisons devenues trop fréquentes. Réaligné sur la
largeur documentée de la fourchette ANIL elle-même (intervalle de prédiction
à 95 %, ±25 % — voir `docs/reference/estimation-loyer-charges.md`) : au-delà,
c'est statistiquement hors norme, pas juste "généreux".

Ne JAMAIS inverser cette logique.

## Gravité des faits (`GRAVITE_STYLES`)

| Gravité   | Puce            | Valeur            |
|-----------|-----------------|-------------------|
| positif   | `bg-emerald-500` | `text-emerald-700` |
| info      | `bg-ink-300`     | `text-ink-800`     |
| attention | `bg-amber-500`   | `text-amber-700`   |
| alerte    | `bg-red-500`     | `text-red-600`     |

La gravité est un axe **distinct** de la tonalité — d'où une table à part.
`info` n'est pas `neutral` : `neutral` signifie « donnée indisponible » (valeur
« — »), alors qu'un fait `info` porte une vraie valeur, simplement sans
jugement.

## Verdicts de blocs (`VERDICT_STYLES`)

| Niveau    | Chip                         | Titre de ligne  | Fond ligne      |
|-----------|------------------------------|-----------------|-----------------|
| alerte    | `bg-red-100 text-red-700`    | `text-red-800`  | `bg-red-50/80`  |
| attention | `bg-amber-100 text-amber-700` | `text-amber-800` | `bg-amber-50/80` |
| positif   | `bg-emerald-100 text-emerald-700` | `text-emerald-800` | `bg-emerald-50/80` |

## Intensité du rouge : 600 sur blanc, 700 sur teinte

Règle transversale, valable aussi pour l'ambre et l'emeraude :

- **Texte sur fond blanc ou `ink-50`** → `text-red-600` / `text-amber-700` /
  `text-emerald-700` (`TONE_TEXT_CLASS` et `NOTE_TEXT_CLASS`).
- **Texte sur fond teinté** (`bg-red-50`, `bg-red-100`…) → un cran plus foncé :
  `text-red-700`, voire `text-red-800` pour un titre. Besoin de contraste, pas
  couleur différente (`TONE_PANEL_STYLES` : `label` 700 / `value` 800 /
  `sub` 600 ; concerne aussi `CATEGORIE_TAG_STYLES`, `VERDICT_STYLES`).

Avant de « corriger » un `red-700`, vérifier sur quel fond il est posé. Le
rouge suit la même marche que l'ambre et l'émeraude — il ne reste pas un cran
en dessous.

## Séparateur de milliers : un nombre n'est JAMAIS rendu brut

Tout nombre affiché passe par un formateur de `lib/format.ts` — `formatEuros`,
`formatEurosSigned`, `formatPercent`, ou **`formatNombre`** quand l'unité est
rendue à part (`Fait.unit` : « €/m² », « €/mois », « ventes »).

⚠️ **`{n}` en JSX passe par `String(n)` et ne groupe RIEN.** Le groupage se
fait donc **au point de passage unique**, `FaitRow` (`AnalyseIA.tsx`), qui
applique `formatNombre` à tout `Fait.value` numérique. Conséquence : **les
blocs doivent passer un `number`, pas une chaîne pré-formatée**.

`sanitizeJustification` porte la même règle pour la prose IA (règle 5) — le
groupage y est **conditionné à un « € » qui suit** (dans du texte, un nombre à
4 chiffres est tout aussi souvent une année). Ne pas élargir cette regex à
tout nombre.

Deux exclusions volontaires : les **années** (`annee_construction`) ne se
groupent jamais ; **`apt.description`** (texte verbatim de l'annonce) est
rendu tel quel — le champ est éditable, le formater à l'affichage seul
recréerait un écart avec le `<textarea>`.

## Montants signés : `formatEurosSigned`

Tout flux pouvant être négatif (cash-flow avant tout) passe par
**`formatEurosSigned`** (`lib/format.ts`) : `− 628 €`.

- le **vrai signe moins** U+2212 (`−`), jamais le trait d'union ASCII (`-`) ;
- l'**espace insécable** avant le « € », sans quoi le symbole part seul à la
  ligne dans une colonne étroite.

`toLocaleString("fr-FR")` sur un nombre négatif produit un trait d'union : ne
jamais s'en servir tel quel pour afficher un montant.

Seule exception, dans `SimulationFinanciere` : `signe()` et `euros()`, formes
compactes de la table année par année (pas de « € », pas d'espace après le
signe — densité). Partout ailleurs : `formatEurosSigned`.

## Cartes statistiques teintées : la paire prime sur la table

Quand deux cartes du même gabarit sont côte à côte dans une grille, elles
partagent la même échelle de teintes — même si l'une porte l'accent de marque
et l'autre une tonalité sémantique. Voir la paire « Loyer mensuel CC »
(accent) / « Écart vs marché » (tonalité) dans `LoyerDetailPanel` : toutes
deux en label 700 / valeur 800 / sub 600.

## `LoyerDetailPanel` — les trois étapes apparaissent D'UN SEUL BLOC

Seule l'Étape 1 (référence ANIL) dépend d'un fetch réseau
(`/api/loyer-reference?code_insee=…`) ; les étapes 2 et 3 sont synchrones.
**`contentReady`** bloque l'affichage des TROIS étapes jusqu'à ce que l'Étape 1
soit résolue, puis les montre ensemble (`LoyerDetailSkeleton` pendant
l'attente) — sinon un panneau à moitié rempli se complétait après coup.

Le résultat ANIL est gardé **avec le `code_insee` qui l'a produit**
(`{ codeInsee, data }`), pas comme un simple `anil` + `anilLoading` séparés :
deux états séparés ne distinguent pas « pas encore chargé pour CE bien » de
« chargé, et il n'y a rien » (les deux valent `anil === null`).

Quand le bien n'a pas de `code_insee`, `contentReady` est vrai sans attendre
l'effet.

## Survol d'un chiffre cliquable — l'affordance suit le SUPPORT

Plusieurs endroits affichent un chiffre cliquable qui ouvre un panneau de
détail (rendement → `RendementDetailPanel`, cash-flow → `CashflowDetailPanel`).
Il n'y a **pas** d'affordance unique :

| Support | Affordance au survol |
|---|---|
| Carte mobile, popup de la carte (SANS bordure) | anneau tonal `RENDEMENT_HOVER_RING[tone]` |
| **Highlights de l'Analyse** (carte bordée) | **bordure NEUTRE recolorée**, 1px : `hover:border-ink-300` |
| Ligne du tableau d'accueil (dense) | soulignement pointillé |
| Tuile `ResultCard` (Opération, Simulation) | fond + bordure intensifiés (`hoverEmphase` / `hoverContext`) |
| Carte de l'onglet Optimiser | le lien « détail → » change de couleur |

**Les highlights de l'Analyse survolent en GRIS, pas en tonalité** — décision
produit assumée : la couleur sémantique est déjà portée par la VALEUR affichée,
le survol ne dit qu'une chose (« c'est cliquable »).

**La bordure reste à 1px : seule sa COULEUR change** (`hover:border-2` fait
tressauter le contenu ; `hover:ring-inset` se superpose et se lit comme un
second liseré).

⚠️ `RENDEMENT_HOVER_RING` (anneau TONAL) reste réservé aux éléments SANS
bordure — le mélanger avec `border-ink-200` produit deux cercles concentriques.

## DPE — impact réglementaire dans MetricCards

| DPE   | Sous-titre               | Tone      |
|-------|--------------------------|-----------|
| A-C   | Aucune restriction       | positif   |
| D     | OK, pas d'échéance proche | neutral   |
| E     | Interdit dès 2034        | attention |
| F     | Interdit dès 2028        | alerte    |
| G     | Interdit à la location   | alerte    |
| *(vide)* | Non renseigné          | neutral   |

Le cas « non renseigné » (`dpe` vide) affiche « — » en valeur et bascule le lien
de la carte vers l'onglet Description (« Compléter ») au lieu du bloc Risques.

## Anneaux de score : pilotés par la DÉCISION (`DECISION_RING_STYLES`)

La jauge de la fiche (`VerdictGauge`) et l'anneau de l'accueil (`ScoreRing`)
partagent une seule table de couleurs, `DECISION_RING_STYLES` (`scoring.ts`),
clé `Decision | "inconnu"` :

| Décision | Trait | Chiffre |
|----------|-------|---------|
| achete   | `stroke-emerald-500` | `text-emerald-700` / `fill-emerald-700` |
| negocie  | `stroke-amber-400`   | `text-amber-700` / `fill-amber-700` |
| passe    | `stroke-red-500`     | `text-red-600` / `fill-red-600` |
| inconnu  | `stroke-ink-300`     | `text-ink-400` / `fill-ink-400` |

**La couleur suit la décision, pas la note** — décision produit assumée : un
bien à 7,5 surcoté de 8 % est « Négocie » alors que sa note seule le
peindrait en vert. La teinte de ligne du tableau (`DECISION_ROW_CLASSES` dans
`ApartmentsTable`) suit la même clé. Ne PAS recolorer ces anneaux avec
`noteTone()` — réservé aux notes affichées comme telles, sans décision
associée.

## `DECISION_CHIP` — la même décision, en pastille

`scoring.ts` porte aussi la pastille compacte de l'en-tête (`ApartmentDetail`),
même clé `Decision | "inconnu"` :

| Décision | Libellé | Classes |
|----------|---------|---------|
| achete   | À acheter   | `border-emerald-100 bg-emerald-50 text-emerald-700` |
| negocie  | À négocier  | `border-amber-100 bg-amber-50 text-amber-700` |
| passe    | À écarter   | `border-red-100 bg-red-50 text-red-700` |
| inconnu  | Non analysé | `border-ink-100 bg-ink-50 text-ink-500` |

Les libellés sont **courts**, différents des titres de la carte verdict.
Décision calculée par `computeDecision` seul, seule la mise en mots suit la
place disponible.

⚠️ L'en-tête lit `apt.analyse_ia?.blocs?.prix` et `?.verdicts ?? []` **avec
gardes** : une analyse stockée dans un schéma antérieur peut ne pas les avoir.
Voir « Pages d'erreur » dans `AGENTS.md`.

## Plafonds sur le score global (`computeScoreGlobal`)

| Condition                          | Cap     | Impact verdict |
|------------------------------------|---------|----------------|
| Bloc risque ≤ 4/10                 | score ≤ 4 | → Passe       |
| Rendement < seuil rédhibitoire (4%) | score ≤ 5 | → Passe       |

## Pondérations des blocs (`BLOC_POIDS`)

| Bloc       | Poids normal | Sans Prix | Note |
|------------|-------------|-----------|------|
| Prix       | 30 %        | 0 %       | |
| Location   | 30 %        | 40 %      | |
| Risques    | 20 %        | 20 %      | |
| Potentiel  | 20 %        | 20 %      | |
| Simulation | 0 %         | 0 %       | informatif — le cash-flow dépend du montage personnel |
| Quartier   | 0 %         | 0 %       | informatif |

## Analyse IA — bloc Risques et scoring DPE/GES

Le bloc "Risques" (`src/lib/analyse/blocs/risque.ts`) est 100 % déterministe,
aucun appel IA. Les données viennent de l'ADEME (DPE officiel) et Géorisques
(aléas naturels). La note /10 (10 = risque faible) combine deux sous-scores :
énergie (DPE + GES, 80 %) et géorisques (20 %).

### Pénalités DPE (perspective investisseur — loi Climat)

| DPE | Pénalité | Raison |
|-----|----------|--------|
| G   | 5 (max)  | Interdit à la location depuis 2025 |
| F   | 3.5      | Interdiction en 2028 |
| E   | 1.5      | Interdiction en 2034 |
| D   | 0.5      | Modéré, OK pour l'instant |
| C-A | 0        | Aucun risque réglementaire |

### Pénalités GES

| GES | Pénalité |
|-----|----------|
| G   | 1.5      |
| F   | 1.0      |
| E   | 0.5      |
| D   | 0.25     |
| C-A | 0        |

### Caps DPE sur la note risque

- DPE G → note risque plafonnée à **2/10** (interdit de louer)
- DPE F → note risque plafonnée à **4/10** (interdiction imminente)

Ces caps garantissent qu'un DPE catastrophique ne peut jamais être
"compensé" par de bons résultats géorisques.

### Verdicts globaux DPE (`scoring.ts`)

- DPE G → **alerte** "DPE G — interdit à la location"
- DPE F → **alerte** "DPE F — interdiction de louer en 2028"
- DPE E → **attention** "DPE E — interdiction de louer en 2034"

### Verdicts de blocs faibles/forts (`buildVerdicts`)

Tout bloc noté ≤ 5 génère un verdict (≤ 4 = alerte, 5 = attention) avec un
libellé orienté investisseur — **jamais de score brut** dans le titre.
Les blocs informatifs (`simulation`, `quartier`) sont **exclus** des verdicts
car ils ne reflètent pas la qualité intrinsèque du bien.

| Bloc | Titre (faible) | Titre (fort, ≥ 9) | Verdict |
|------|----------------|-------------------|---------|
| prix | Prix trop élevé | Prix d'achat très compétitif | oui |
| location | Faible rendement | Rendement élevé | oui |
| potentiel | Peu de potentiel | Fort potentiel de valorisation | oui |
| risque | Risques élevés | Profil de risque très sain | oui |
| simulation | Mauvais cash-flow mensuel | Cash-flow confortable | **non** (informatif) |
| quartier | Quartier défavorable | Quartier attractif | **non** (informatif) |

Les cartes alertes dans le verdict affichent **tous les verdicts** (critère +
bloc), triés par priorité (alerte > attention, critère > bloc), max 3.

Ne pas modifier les plafonds globaux (score ≤ 4 si risque ≤ 4/10, score ≤ 5
si rendement sous le seuil rédhibitoire) — garde-fou contre la dilution d'un
point rédhibitoire par la moyenne pondérée.
