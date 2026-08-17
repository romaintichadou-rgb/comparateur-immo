# Profil investisseur, simulation financière et héritage

> Référence de domaine — chargée seulement quand la tâche touche
> `SimulationFinanciere.tsx`, `SettingsForm.tsx`, `simulation.ts`, ou le
> mécanisme d'héritage `resolveInputs`. Pointeur depuis `AGENTS.md`.

**Le bloc Simulation est informatif (poids 0, pas de verdict).** Le cash-flow
dépend du montage financier personnel (apport, taux, durée) — il ne doit pas
influencer la note d'opportunité intrinsèque du bien. Le bloc reste affiché
avec sa note propre, mais n'alimente ni le score global ni la décision
achète/négocie/passe. Voir `BLOC_POIDS` dans `types.ts`.

## Profil investisseur — seuils + profil emprunteur (héritage)

`AppSettings` (`src/lib/settings.ts`, table `app_settings`, une seule ligne)
porte DEUX familles de réglages :

1. les **seuils** vert/ambre/rouge (rendement, cash-flow) ;
2. le **profil emprunteur** : `tauxCreditPct`, `dureeAnnees`, `tauxAssurancePct`,
   `tmiPct`, `financementMode`. Ce sont des propriétés de la PERSONNE, pas du
   bien — une TMI est une tranche d'imposition, elle ne peut pas varier d'un
   appartement à l'autre.

**Migration `0006_profil_emprunteur.sql` requise** — comme les autres, à
exécuter à la main sur CHAQUE projet Supabase (prod et dev).

## Écran `SettingsForm.tsx` — DEUX cartes, pas trois

L'écran reflète les deux familles ci-dessus, une carte chacune :

1. **« Profil emprunteur »** — les 5 champs de la personne (taux, assurance,
   durée, TMI, couverture de l'emprunt).
2. **« Seuils de décision »** (`CollapsibleSection`, icône `SlidersHorizontal`) —
   les DEUX couples de seuils réunis : rendement net PUIS cash-flow mensuel,
   séparés par un `<hr className="border-t border-ink-100/50">`.

Rendement et cash-flow avaient chacun leur carte. Elles sont désormais deux
**groupes** d'une seule carte. Ne pas les re-séparer en deux cartes.

- **`SeuilGroup`** (ex-`SeuilCard`) rend UN couple rouge/vert : `GroupHeading`,
  les deux `NumberField`, la `ZonesBar`. Ce n'est plus une carte : pas de
  bordure ni de fond propres, c'est la carte parente qui les porte.
- **Chaque champ porte son propre sous-titre** (`rougeHint` / `vertHint`) qui
  dit ce que le seuil DÉCLENCHE, pas ce qu'il vaut — « En dessous, le score
  global du bien est plafonné à 5/10 », « Au-dessus, l'opération
  s'autofinance ». Les garder factuels et alignés sur le code (voir les
  plafonds de `computeScoreGlobal` et `cashflowTone`).
- Le `hint` de `form/Fields.tsx` ne convient PAS pour ça : il se rend inline à
  côté du label. Les sous-titres sont des `<p>` rendus sous le champ par
  `SeuilGroup`.
- **Repli mobile** : `CollapsibleSection` masque son contenu sous `sm:` tant
  que l'utilisateur n'a pas déplié.

### `ZonesBar` — la barre nomme ses zones, la valeur est SUR la frontière

Nomme les trois zones au-dessus (**Alerte** `red-600` / **À surveiller**
`amber-700` / **Objectif** `emerald-700`) et pose chaque seuil **centré sur la
frontière de couleur qu'il définit** (`absolute left-1/3` et `left-2/3`,
chacun `-translate-x-1/2`). La barre est `aria-hidden` : elle ne fait que
redessiner des valeurs déjà lues par les deux champs et leurs sous-titres.

### Deux niveaux de titre, et AUCUNE icône « i »

| Niveau | Composant | Rendu | Exemples |
|---|---|---|---|
| Carte | `SectionHeader` (partagé) | Fraunces `text-lg` `ink-900` | « Profil emprunteur », « Seuils de décision » |
| Groupe | `GroupHeading` (local) → rend `GroupTitle` | Fraunces `text-base` `ink-900` + phrase d'explication | « Couverture de l'emprunt », « Rendement net », « Cash-flow mensuel » |

`GroupHeading` accepte `as="legend"` pour le `fieldset` de la couverture
d'emprunt — il délègue à `GroupTitle` et n'ajoute que la phrase d'explication.

La page n'a **plus aucun tooltip `Info`** : leur contenu tenait en une phrase
et cachait un **avertissement de conséquence** (« les modifier rend les
analyses obsolètes ») que l'utilisateur doit lire AVANT d'éditer. Les phrases
sont rendues en clair. Ne pas réintroduire d'icône « i » sur cet écran.

## Héritage : `resolveInputs`, point de passage unique

Dans `SimulationInputs`, les 4 champs emprunteur sont `number | null` : `null`
(ou clé absente) = **hérité du profil**. Ne JAMAIS les lire directement pour
calculer — passer par :

```ts
resolveInputs(apt.simulation_inputs, settings) → InputsResolus
```

`simulate()` consomme `InputsResolus` et ne connaît ni le profil ni l'héritage.
Ne pas réintroduire l'idiome `apt.simulation_inputs ?? defaultInputs()` :
`defaultInputs()` ne décrit plus que la forme STOCKÉE par défaut (tout à
`null`), il ne fournit plus aucune valeur de calcul.

`null` ET `undefined` valent « hérite » — la migration SUPPRIME les clés.
Utiliser `??`, jamais `||` : un taux à 0 % est une valeur légitime.

⚠️ **Ne pas recopier le profil dans `simulation_inputs` à la création d'un
bien** : ça figerait les valeurs au moment de la saisie, cassant tout l'intérêt
de l'héritage.

## Modes de financement

`financementMode` décide de ce que couvre l'emprunt EN MODE AUTO
(`montantEmprunte == null`) :

| Mode | Montant auto | Sens |
|---|---|---|
| `hors_notaire` *(défaut)* | prix + travaux | le notaire est couvert par l'apport — pratique bancaire courante |
| `cout_total` | `budget_total` | prêt dit « à 110 % » |

Un montant SAISI reste prioritaire. Le plafond de `capitalEffectif` couvre
déjà `cout_total` — ne pas le resserrer. `SimulationResult.montantPlafonne`
signale qu'un montant saisi a dû être ramené au coût de l'opération.

### `planFinancement()` — coût total, capital, apport en un seul endroit

`planFinancement(apt, inputs)` (`simulation.ts`) rend
`{ coutTotal, capital, apport }`. C'est la SOURCE UNIQUE de ces trois
grandeurs : `simulate()` en dérive mensualité et TRI, le Playground s'en sert
pour proposer l'apport comme curseur.

⚠️ **L'apport n'est PAS un champ de `SimulationInputs`, et ne doit pas le
devenir.** C'est exactement le complément du capital emprunté
(`coutTotal − capital`). Le stocker à côté créerait deux vérités pour une seule
grandeur, qu'un simple changement de prix ferait diverger. Un écran qui veut
« régler l'apport » écrit donc `montantEmprunte = coutTotal − apport`, jamais un
apport. Aucune colonne ni migration n'est nécessaire pour ça.

⚠️ **L'apport ne touche PAS le rendement net.** `calculations.ts` divise par le
coût total de l'opération, pas par l'argent engagé : le rendement est identique
qu'on paie comptant ou qu'on emprunte à 110 %. L'apport ne bouge que la
mensualité, et par elle le cash-flow, le TRI, l'enrichissement et le point mort.
Tout écran qui laisse régler l'apport en n'affichant que le rendement offre un
curseur qui paraît cassé — il doit montrer mensualité et cash-flow, et le dire.

⚠️ **Convention en cas de changement de prix : l'apport est la grandeur stable,
l'emprunt absorbe l'écart.** Déjà appliquée par
`patchApartment.suivreMontantEmprunte` et `recommandations.inputsAtPrice`. Un
écran qui dérive l'emprunt de l'apport au rendu l'obtient gratuitement — mais
doit BORNER l'apport à `[0, coutTotal]`, sinon `capitalEffectif` plafonne en
silence et l'écran affiche un apport que le calcul n'a pas utilisé.

## UI : `ChampHerite` (Simulation financière)

Miroir d'`OptionalRateField`, **sens inversé** : un champ hérité a toujours une
valeur (celle du profil) et c'est la SURCHARGE qui s'active.

**Toujours un `NumberField`, jamais un encart en lecture seule.**

- hérité → champ pré-rempli avec `resolus.*`, sans `✕` ;
- surchargé → même champ + `✕` (revenir au profil).

⚠️ **Les pastilles « profil » / « auto » / « plafonné » / « ramené au coût
total » ont été retirées de la section Financement** (onglet Détails de
l'opération). L'origine de la valeur se lit uniquement à la présence du `✕`.
Les summary pills du hero (Crédit %, durée, Apport) restent.

Deux détails que le composant doit garder :

- **`key={herite ? "herite" : "override"}`** — sans ce remontage, vider une
  surcharge laisse le champ **vide** au lieu de réafficher la valeur du profil.
- **`onChange` passe `v` tel quel** — `v ?? 0` transformerait un champ vidé en
  0 au lieu de le rendre au profil.
- Une **gouttière de 28 px** (`w-7`) est réservée au `✕` même quand il est
  absent, pour que la colonne reste alignée.

Les champs AFFICHENT `resolus.*` et ÉCRIVENT dans `inputs.*` — ne pas afficher
`inputs.*`, qui vaut `null` en mode hérité.

## Obsolescence d'une analyse — TROIS causes

L'analyse stockée porte deux estampilles, posées dans `run.ts` :
`AnalyseIA.settings` (instantané du profil) et `AnalyseIA.empreinteBien`
(signature des données du bien).

| Cause | Test | Libellé du bandeau |
|---|---|---|
| Le code a changé | `version < ANALYSE_VERSION` | « L'algorithme d'analyse a évolué… » |
| Les données du bien ont changé | `empreinteBien(apt) !== analyse.empreinteBien` | « Les données du bien ont changé… » |
| Le profil a changé | `!memeProfil(analyse.settings, settings)` | « Ton profil investisseur a changé… » |

L'ordre de priorité est celui du tableau — la version invalide tout, puis
vient le geste le plus fréquent.

### Pourquoi une EMPREINTE et pas `ANALYSIS_FIELDS`

`ANALYSIS_FIELDS` répond à une autre question — « faut-il relancer
AUTOMATIQUEMENT après cette édition ? ». Sept champs nourrissent le score sans
y figurer (`loyer_retenu`, `charges_copro_annuelles`, `taxe_fonciere`,
`assurance_annuelle`, `hypothese_gestion_pct`, `quote_part_terrain_pct`,
`simulation_inputs`), et ils sont enregistrés par des chemins (`saveField`,
`handleSaveInputs`) qui ne consultent jamais `computeRecalcNeeds`.
L'empreinte attrape toute modification quel que soit l'écran d'origine — elle
ne relance rien, elle SIGNALE.

`empreinteBien` (`analyse/types.ts`) sérialise `CHAMPS_EMPREINTE` **clés
triées** pour `simulation_inputs`, pas via `JSON.stringify` (l'ordre des clés
d'un objet reconstruit n'est pas garanti).

### ⚠️ L'empreinte se calcule TOUJOURS sur un bien passé par `computeDerived`

Quatre champs de `CHAMPS_EMPREINTE` — `frais_notaire_estimes`, `taxe_fonciere`,
`charges_copro_annuelles`, `assurance_annuelle` — sont **recalculés à la
volée** par `applyLiveEstimates`. Comparer une ligne brute à une version
recalculée fait revenir la bannière « les données ont changé » indéfiniment,
sans qu'aucune donnée n'ait bougé.

Le paramètre d'`empreinteBien` exige désormais `budget_total`, champ que
**seul `computeDerived` ajoute** — contrainte de type, pas juste un
commentaire : le mode d'échec est silencieux (aucune erreur, aucun log).

`memeProfil` compare **champ par champ** à partir des clés de
`DEFAULT_SETTINGS`. Tout nouveau champ ajouté à `AppSettings` invalide donc
les analyses, sans code supplémentaire.

`ANALYSE_VERSION` est passée à **6**.

## Où circulent les settings

Pas de provider global : `layout.tsx` est un composant serveur SYNCHRONE, le
rendre `async` rendrait TOUTES les pages dynamiques. Passés en props depuis
`appartements/[id]/page.tsx` → `ApartmentDetail` → `AnalyseIA` /
`OptimiserView` / `SimulationFinanciere`, et jusqu'au popup de cash-flow via
`openCashflowDetail(apt, seuils, settings)`.

`rowToSettings` (`db.ts`) retombe sur `DEFAULT_SETTINGS` champ par champ si les
colonnes 0006 sont absentes — la LECTURE dégrade proprement ; l'ÉCRITURE échoue
avec un message explicite tant que la migration n'est pas passée.

---

# Simulation financière — ENTRÉES en gris, RÉSULTATS en blanc

Règle de lecture de tout l'onglet : **ce qu'on saisit est gris (`bg-ink-50`),
ce que la simulation produit est blanc.**

## Deux sections collapsibles : Financement + Hypothèses

1. **Financement** — icône `Landmark`, accent. Hero mensualité toujours
   visible + pills (Crédit %, durée, Apport). Corps dépliable : **Crédit
   immobilier** (montant emprunté, taux, durée, assurance) + **Apport
   personnel**. Bouton « Modifier » ouvre le mode édition crédit
   (`editingId === "credit"`).
2. **Hypothèses** — icône `SlidersHorizontal`, neutre. Pills toujours
   visibles (LMNP au réel, TMI, projections actives). Corps dépliable :
   **Fiscalité** (régime, TMI, quote-part terrain) + **Projection** (les
   quatre hypothèses optionnelles) en 2 colonnes. Bouton « Modifier » ouvre le
   mode édition hypothèses (`editingId === "hypotheses"`).

Chaque section porte sa propre bordure `accent-300` en édition (`ink-200`
sinon), son propre « Annuler / Enregistrer » et un « Réinitialiser » si des
surcharges existent. Les deux partagent le même `persist()` et le même
`snapshot` d'annulation.

- **`HypRow`** rend une ligne en lecture. La pastille d'origine (`profil`,
  `auto`) est collée à la VALEUR, à droite, jamais après le libellé.
- Une hypothèse de projection désactivée affiche **« — »**, elle n'est pas
  masquée.
- **`snapshot`** est la copie d'`inputs` prise à l'ouverture de l'édition ;
  c'est elle qui rend « Annuler » possible.
- **Aucun aperçu vivant pendant l'édition** — décision produit assumée. TOUT
  ce qui est visible EN DEHORS du formulaire d'édition lit les valeurs
  **enregistrées** (`resolusAffiches`/`resultAffiche`, dérivées de
  `savedInputs`), jamais le brouillon `inputs` en cours de frappe. Seuls les
  champs DU formulaire lui-même affichent la valeur qu'on est en train de
  taper — c'est `resolus`/`result`, calculés depuis `inputs`.
- **Le mode d'emploi de la saisie** (« vide le champ pour repasser en auto »)
  n'est rendu **qu'en édition**.

## Régime fiscal — champ DÉCLARATIF, pas encore un levier de calcul

`SimulationInputs.regimeFiscal` (`RegimeFiscal | null`, `null` = défaut) est
proposé dans la section Hypothèses. Les libellés viennent de
**`REGIMES_FISCAUX`** (`simulation.ts`), seule source.

⚠️ **`simulate()` ne lit pas encore ce champ** — il calcule en LMNP réel quelle
que soit sa valeur. Ajouter un régime à `REGIMES_FISCAUX` le fera apparaître
dans le menu **sans rien changer aux chiffres** — un nouveau régime demande de
brancher `simulate` (amortissements, assiette imposable, prélèvements
sociaux, report de déficit).

Le champ est `.optional()` dans `simulationInputsSchema` (comme
`vacanceLocativePct`).

## Les trois états d'une hypothèse, et « Réinitialiser »

| État | Pastille | Sens |
|---|---|---|
| Hérité | `profil` | `null` sur le bien → vient du Profil investisseur (`resolveInputs`). Change pour TOUS les biens quand le profil change. |
| Dérivé | `auto` | `null` → calculé depuis les données de CE bien. |
| **Fixé à la main** | *aucune* | L'utilisateur a saisi la valeur : elle ne suit plus rien. |

Le troisième état n'est **pas** signalé — il se déduit par ABSENCE de
pastille, et devient actionnable via **« Réinitialiser »** de l'en-tête.

- **`compterSurcharges()`** compte les lignes sans pastille — le bouton
  n'apparaît que si le compte est > 0.
- Survol en **`ink-600`, pas en rouge** : on rend des valeurs à leur défaut,
  et c'est la modale de confirmation qui porte le poids de l'action.
- `regimeFiscal` stocké à `REGIME_FISCAL_DEFAUT` n'est PAS compté.
- La réinitialisation est **exactement `defaultInputs()`** +
  `quote_part_terrain_pct: null`.
- Passe par `ConfirmDialog` en mode `destructive`.
- `persist()` prend son `payload` en **argument** et ne le lit pas dans
  l'état — la réinitialisation appelle `setInputs` puis `persist` dans la
  foulée, l'état ne serait pas encore à jour sinon.

## Les cartes blanches ne contiennent PLUS aucun champ

« Coût du crédit », « Détail mensuel — année 1 », « Fiscalité — LMNP au
réel », « Cash-flow année par année », « Financement du projet », « Évolution
du patrimoine » : toutes des résultats purs. Hors panneau Hypothèses, l'onglet
ne doit contenir aucun `input` ni `select`.

Les montants du bloc « Coût du crédit » portent chacun leur HORIZON (mensuel /
cumul sur la durée / versement unique) — sans ces qualificatifs, le cumul sur
25 ans contamine la lecture de l'apport.

## Un seul point d'enregistrement : `persist()`

`persist(extra?)` est le passage unique : **un PATCH, une réponse, un
`onSaved`**. La quote-part voyage dans le même corps de requête quand elle a
changé. Ne pas revenir à deux requêtes enchaînées (`onPatchApartment`,
supprimée).

La bannière globale ne s'affiche plus que si `dirty && editingId === null` :
quand une carte est ouverte, c'est SON pied qui porte « Enregistrer ». Elle
reste indispensable pour les hypothèses du tableau année par année, qui
s'éditent en ligne (`OptionalRateField`) sans passer par une carte.

## Hypothèses optionnelles

Désactivées par défaut (`null` = hypothèse prudente). Bouton "+" (dashed
border) qui active l'hypothèse avec une valeur par défaut.

| Hypothèse | Champ (`SimulationInputs`) | Défaut | Suffix | Effet |
|---|---|---|---|---|
| Revalorisation du bien | `revalorisationBienPct` | 1 % | %/an | Patrimoine uniquement (pas le cash-flow) |
| Revalorisation du loyer | `revalorisationLoyerPct` | 1 % | %/an | Loyer revalorisé chaque année (compound) |
| Indexation charges | `indexationChargesPct` | 2 % | %/an | Copro + TF indexées (compound) |
| Vacance locative | `vacanceLocativePct` | 5 % | % du loyer | Réduit les loyers effectifs (cascade sur gestion, impôt, cash-flow) |
| Frais de revente | `fraisReventePct` | 8 % | % du prix | **TRI uniquement** — ni le cash-flow, ni l'impôt, ni le graphe patrimoine |

`OptionalRateField` gère l'UI. La vacance locative s'applique comme facteur
multiplicatif `(1 - vacanceLocativePct / 100)` sur les loyers annuels — cascade
automatiquement sur les frais de gestion, le résultat imposable, et le
cash-flow.

### Ajouter une hypothèse optionnelle = 6 points à câbler

Tous dans `SimulationFinanciere.tsx`, sauf le premier. L'oubli de l'un d'eux
est **silencieux** — le champ marche, mais disparaît d'un écran sur deux.

1. `SimulationInputs` + `defaultInputs()` + constante `*_DEFAUT_PCT`
   (`simulation.ts`), et `simulationInputsSchema` (`types.ts`, en `.optional()`)
2. `surchargesHyp` — le compteur qui conditionne « Réinitialiser »
3. `resetHypotheses()` — remettre la clé à `null`
4. la **pill** du mode lecture (en-tête replié)
5. le `OptionalRateField` du groupe **Projection** (mode édition)
6. le `FinRow` du récapitulatif **Projection** (mode lecture)

⚠️ La **légende sous le tableau année par année** n'est PAS un septième point :
elle décrit les hypothèses qui déforment les colonnes du tableau. Une hypothèse
sans effet sur le cash-flow annuel (les frais de revente) n'y a rien à faire —
l'y ajouter ferait croire que le tableau en tient compte.

Aucune migration : `simulation_inputs` est une colonne JSONB. La clé entre
automatiquement dans `empreinteBien` (qui itère sur `Object.keys`), donc la
modifier signale l'analyse comme obsolète — comportement voulu.

# TRI — le seul chiffre où le levier apparaît

Le rendement net (`calculations.ts`) divise par le coût TOTAL de l'opération :
il ne bouge pas d'un iota selon le financement. Le TRI part du seul apport,
suit les cash-flows et intègre la revente. Les deux ne sont pas interchangeables
et n'ont pas vocation à converger.

`tauxRendementInterne(flux)` (`simulation.ts`) — dichotomie sur la VAN, bornée à
[−99,99 %, +1000 %]. **Ne pas la remplacer par Newton-Raphson** : Newton peut
diverger selon l'amorce et rendre alors un nombre plausible qui n'annule rien,
alors que la dichotomie conserve un encadrement de la racine. Sur ≤ 25 termes sa
lenteur ne se mesure pas.

Flux construits dans `simulate()`, horizon = **terme du prêt** :

```
flux[0]  = −apport
flux[a]  = annees[a-1].cashflowAnnuel                     (a = 1..N)
flux[N] += valeurBien(N) × (1 − fraisReventePct/100) − capitalRestantDu(N)
```

## Deux pièges déjà rencontrés

⚠️ **« Apport nul » n'est PAS « pas de TRI ».** Un montage sans apport (profil en
financement `cout_total`, le prêt à 110 %) dont les premières années sont
déficitaires engage bien du capital, simplement étalé dans le temps : son TRI
existe et vaut quelque chose. Le critère d'absence est **`flux.every(f => f >= 0)`**
— aucune sortie d'argent, jamais — et c'est ce que nomme
`triIndisponible: "aucun_capital_engage"`. Un test sur `apport === 0` masquerait
un chiffre parfaitement calculable.

⚠️ Corollaire à l'écran : quand l'apport est nul mais le TRI défini, le texte
« placer ton apport de 0 € à X % » n'a aucun sens. La carte bascule alors sur une
seconde formulation (le capital engagé est l'effort d'épargne annuel).

## Ce que le TRI ne fait PAS

- **Il n'est pas noté.** Le bloc `simulation` de l'Analyse IA reste
  `note: null, poids: 0` : le TRI dépend du montage financier personnel, pas de
  la qualité du bien. Il y entre comme simple `Fait` (`gravite: "info"`), jamais
  comme `highlight` ni comme verdict. Le brancher sur une note ferait dépendre le
  score du plan de financement de l'utilisateur.
- **Il n'est pas coloré sémantiquement.** Aucun seuil de TRI n'existe dans
  `AppSettings`, et `couleurs-scoring.md` impose qu'un chiffre en
  émeraude/ambre/rouge soit adossé à un seuil documenté. La carte utilise donc
  l'**accent de marque**. Ne pas inventer de seuil au passage.
- **Il ignore l'impôt sur la plus-value.** Depuis la loi de finances 2025 les
  amortissements LMNP se réintègrent dans la plus-value imposable : le TRI
  affiché est donc optimiste, et la carte le dit (« hors fiscalité de la
  plus-value »). Le brancher est un chantier fiscal à part entière (abattements
  pour durée de détention, IR 19 % + PS 17,2 %), pas un ajout en marge.
- **Quand il n'existe pas, le fait est ABSENT** du bloc d'analyse, pas mis à 0 :
  un « 0 % » se lirait comme une opération médiocre alors que c'est le calcul
  qui ne s'applique pas.
