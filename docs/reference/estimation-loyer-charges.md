# Architecture d'estimation (loyer + charges)

> Référence de domaine — chargée seulement quand la tâche touche
> `rentEstimation.ts`, `chargesEstimation.ts`, `anilReference.ts`, ou les API
> routes `/api/estimate-rent` / `/api/estimate-charges`. Pointeur depuis
> `AGENTS.md`.

Les estimations utilisent un mix de calculs déterministes et d'IA selon la
disponibilité des données. Ne pas modifier un flux sans vérifier la cohérence
avec les autres.

## Quatre champs estimés individuellement

Chaque champ a son propre bouton "Estimer avec IA" dans l'UI et son propre
appel backend. Il n'y a plus de bouton "Réestimer" global — tout est par champ.

| Estimation | Mode | Fichier | API route | Paramètre |
|---|---|---|---|---|
| **Loyer mensuel CC** | Déterministe + **résidu IA** (plus de blend — voir plus bas) | `src/lib/rentEstimation.ts` | `/api/estimate-rent` | — |
| **Charges copro** | Déterministe + IA blending | `src/lib/chargesEstimation.ts` | `/api/estimate-charges` | `field: "charges_copro_annuelles"` |
| **Taxe foncière** (avec taux communal) | **100% déterministe** — pas d'appel IA | `src/lib/taxeFonciereCommune.ts` | idem | `field: "taxe_fonciere"` |
| **Taxe foncière** (sans taux communal) | Déterministe + IA blending (fallback) | idem | idem | `field: "taxe_fonciere"` |
| **Assurance PNO** | **100% déterministe** — pas d'appel IA | `src/lib/estimates.ts` | PATCH direct `/api/apartments/[id]` | — |

Sans paramètre `field`, `/api/estimate-charges` estime les deux (charges copro
+ TF) — utilisé par `runRecalc` lors d'un changement de données du bien.

## Blending déterministe + IA (charges copro, TF fallback UNIQUEMENT)

⚠️ Ne s'applique plus au LOYER depuis la Phase 2 (voir « Loyer — résidu IA sans
blend » ci-dessous) — seulement aux charges copro et à la TF fallback.

1. **Calcul déterministe** à partir de barèmes connus (barèmes départementaux
   pour les charges) ajusté par les caractéristiques.
2. **Appel Gemini + Google Search** (temperature 0) avec prompt structuré
   qui injecte l'ancrage déterministe comme référence.
3. **Blending** : `final = 0.6 × déterministe + 0.4 × IA`, clampé à ±30 % du
   déterministe (0.7–1.4).

Le poids IA (`AI_WEIGHT = 0.4`) est identique dans `chargesEstimation.ts` et
l'ancienne version de `rentEstimation.ts`. Ne pas le changer dans un seul.

## Loyer — résidu IA SANS blend, SANS Google Search (Phase 2)

Le blend 60/40 et Google Search ont été retirés du calcul du LOYER (voir
« Reproductibilité » plus bas pour les mesures qui l'ont motivé). Le calcul
devient :

```
loyer = ANIL(typologie, surface)                         ← Phase 1
      × facteur déterministe global                      ← étage · état+travaux · DPE
      × (1 + résidu_IA / 100)                             ← ±15 %, PAS de blend
      → clampé à la fourchette ANIL (drapeau `plafonne`)
```

### Pourquoi le blend a été retiré (et pas juste rééquilibré)

Le blend ne DIVERSIFIAIT pas : les deux termes partaient de la même médiane
ANIL, et le « déterministe » ne modélisait ni le quartier ni les prestations.
Son silence sur ces critères était traité comme un désaccord, et le blend
rabotait systématiquement de 60 % tout signal qualitatif. Une fois le prompt
corrigé pour que déterministe et résidu portent chacun sur des facteurs
DISJOINTS (voir ci-dessous), le blend n'apportait plus rien qu'une dilution.

### Facteurs déterministes (`rentEstimation.ts`)

| Facteur | Fonction | Détail |
|---|---|---|
| Étage/ascenseur | `facteurEtage` | 0,95 RDC · 1,05 (≥3ᵉ+asc.) · 0,97 (≥3ᵉ sans asc.) · 1,00 sinon |
| **État × travaux** (fusionnés) | `facteurEtatTravaux` | voir plus bas |
| DPE | `facteurDpe` | A-D neutres (1,00), E 0,99, F 0,97, G 0,95 |

Le produit des trois est borné à **`[0,85 ; 1,20]`** (`FACTEUR_DETERMINISTE_MIN/MAX`)
avant d'être appliqué à la médiane ANIL — les facteurs sont multiplicatifs,
ils composent, et sans ce plafond le pire cumul dépassait déjà +11 % avant
même le résidu IA.

⚠️ **GES retiré du prompt** (colinéaire au DPE, aucune information propre) et
**DPE fortement réduit** : son vrai poids est RÉGLEMENTAIRE (gel des loyers
F/G, interdictions 2028/2034), déjà scoré intégralement dans le bloc Risques
avec ses propres plafonds — le garder à ±9 % ici double comptait ce signal.

### État × travaux — un seul facteur, pas deux

Travaux et état décrivent la MÊME chose (l'état du bien une fois loué) : les
compter séparément revenait à compter deux fois le même effet. Les travaux
FONT PROGRESSER l'état actuel vers « Neuf », de façon saturante :

```
facteur = ETAT_COEF[etat_bien] + progression × (1,06 − ETAT_COEF[etat_bien])
progression = min(1, travaux_par_m2 / 900)   ← TRAVAUX_SATURATION_M2, conventionnel
```

`ETAT_COEF` : Neuf 1,06 · Bon état 1,00 · À rafraîchir 0,96 · À rénover 0,92.
`etat_bien` vide → 1,0 neutre (donnée manquante = pas d'effet, jamais une
pénalité implicite).

### Le prompt résidu (`buildPromptResidu`) — deux règles nécessaires

L'IA ne reçoit PAS le médian ANIL brut, mais la valeur **déjà passée par le
barème déterministe** (`det`) — sinon elle ajusterait un nombre que le
déterministe a déjà fait bouger. Le prompt déclare étage/ascenseur/état/
travaux/DPE comme DÉJÀ appliqués, et demande explicitement de ne rien
recompter. ⚠️ Le quartier n'en fait PLUS partie sans condition depuis le
correctif quartier (voir plus bas) — il l'était par erreur.

1. **« Ordinaire = 0 »** — sans elle, l'IA ne cite que ce que l'annonce
   valorise (un argumentaire commercial ne mentionne jamais ses propres
   défauts) et ne renvoie jamais de résidu négatif.
2. **Chasse aux négatifs ACTIFS, absence ≠ défaut** — sans cette nuance, l'IA
   surcorrige et pénalise l'absence de balcon/parking sur TOUS les biens. La
   règle finale : « l'absence d'un équipement est la norme, ne compte un
   négatif que si un problème ACTIF est décrit ».

### Filtre du double comptage — appliqué au CODE (`filtrerCriteresDejaComptes`)

La seule consigne du prompt ne suffisait pas : l'IA citait encore
« rez-de-chaussée » ou « rénovation complète » comme critère du résidu, alors
que ces facteurs sont déjà dans l'ancre. `MOTIFS_DEJA_COMPTES` (regex sur le
libellé, insensible accents/casse) retire ces critères de la liste AVANT
qu'elle serve à synthétiser la justification stockée — plus robuste qu'une
consigne, parce que vérifiable en test.

### Persistance — `loyer_calcul` (colonne JSON, migration `0013`)

Le résidu et les critères (structurés, avec `categorie` — `quartier` /
`prestations` / `exposition` / `nuisances` / `copropriete`) sont reconstruits
en un texte (`synthetiserJustification`) pour `loyer_justification` — c'est
ce texte qui s'affiche partout aujourd'hui. Mais ils sont AUSSI persistés
tels quels dans `Apartment.loyer_calcul` (`LoyerCalcul`, `rentEstimation.ts` :
`ajustementPct`, `criteres`, `typologie`, `loyerDeterministe`, `echecIa`,
`referenceFiable`, `empreinteResidu`, `reutilise`) — migration
`0013_loyer_calcul.sql`, **à exécuter à la main sur CHAQUE projet Supabase
(dev, puis prod)**, comme toutes les autres.

Deux raisons de le garder structuré plutôt que de s'arrêter au texte :
- **Rejouable sans nouvel appel Gemini.** Un panneau futur pourra afficher les
  critères avec leurs tags par catégorie directement depuis cette colonne.
- **JSON plutôt que colonnes dédiées** : le contenu va évoluer et une colonne
  JSON absorbe cet ajout sans nouvelle migration.

Même statut que `analyse_ia` : écrit UNIQUEMENT par `/api/estimate-rent`,
absent de `apartmentBaseFields`/des schémas Zod (jamais soumis par un
formulaire), `null` tant qu'aucune estimation IA n'a été lancée ou sur les
chemins sans résidu (immeuble, logement sans référence ANIL).

### Cache par empreinte — ne pas rappeler Gemini si rien n'a changé

`LoyerCalcul.empreinteResidu` (sha256 de `calculerEmpreinteResidu()`,
`rentEstimation.ts`) fige les champs qui déterminent le texte envoyé à
Gemini : `ville`/`quartier`/`code_postal`/`surface_m2`/`nb_pieces`/
`nb_chambres`/`type_bien`/`etage`/`ascenseur`/`annee_construction`/
`etat_bien`/`dpe`/`travaux`/`description`/`precisionLocalisation`, PLUS la
typologie et la référence ANIL utilisées (`loyerRef`, `elasticiteLocale`
incluse) — ce dernier point couvre aussi bien un changement de typologie
qu'un rafraîchissement annuel des données ANIL (§3/§5), qui changent `ancre`
sans qu'aucun champ du bien n'ait bougé.

`PROMPT_RESIDU_VERSION` (constante en tête de `calculerEmpreinteResidu`)
complète ce filet : à incrémenter à chaque changement du TEXTE ou du SCHÉMA
du prompt résidu, même quand aucun champ ci-dessus n'a bougé — un changement
de logique d'interprétation, pas de donnée. Oublié une fois (ajout du sens
`"neutre"`, v2), corrigé depuis : voir l'historique du fichier.

`estimerAvecReference()` compare cette empreinte à celle du
`loyer_calcul` déjà enregistré (passé par `estimate-rent/route.ts` comme
3ᵉ argument d'`estimateRent()`) :
- **empreinte identique ET calcul précédent sans échec** → `ajustementPct`/
  `criteres` sont RÉUTILISÉS tels quels, aucun appel Gemini. Mesuré :
  ~0,2 ms contre ~3 s pour un appel réel. Le déterministe (`det`) est
  quand même TOUJOURS recalculé (local, rapide) — filet de sécurité si un
  facteur qui influence `det` sans être couvert par l'empreinte avait
  changé.
- **empreinte différente, OU calcul précédent en échec (`echecIa: true`)**
  → rappel normal de Gemini. Un résidu à 0 par échec IA n'est pas un
  résultat à perpétuer : la prochaine estimation doit retenter l'appel
  plutôt que de "mettre en cache" une panne.

S'applique aussi bien au clic manuel « Estimer avec IA » qu'au recalcul
automatique (`runRecalc`) : les deux passent par la même route API, donc
par le même `estimateRent()` — aucune duplication côté client. Ne
s'applique QU'au chemin résidu (`calcul` non `null`) : immeuble et logement
sans référence ANIL n'ont rien à réutiliser, ils rappellent Gemini à
chaque fois.

`LoyerCalcul.reutilise` (`boolean`) enregistre si CE calcul a réutilisé le
précédent — pour que le panneau de détail (Phase 4) puisse afficher
« résidu inchangé depuis la dernière estimation » plutôt qu'un silence qui
donnerait l'impression d'un bouton cassé.

### Dégradation gracieuse — ne jamais écrire `loyer_retenu: null`

- **Logement avec référence ANIL** : si l'appel IA échoue ou renvoie un JSON
  inexploitable, le résidu retombe à 0 — le loyer final est le déterministe
  seul, jamais `null`. Le déterministe est un filet solide, l'IA n'est qu'un
  raffinement.
- **Immeuble / logement sans référence ANIL** : aucun déterministe de repli
  n'existe. Une réponse IA inexploitable fait `throw` plutôt que d'écrire
  `null` — `estimate-rent/route.ts` n'appelle `updateApartment()` qu'après
  l'estimation, donc l'erreur remonte en 500 SANS toucher la valeur déjà
  enregistrée.

### Repli `nb_pieces` manquant — sur la surface, pas sur la ressource générique

`typologieAnil()` (`anilReference.ts`) choisissait la ressource générique
(référence 52 m²) quand `nb_pieces` était inconnu — un studio de 25 m² était
alors sous-estimé de 8 à 13 %, un grand logement surestimé de 7 à 14 %. Une
donnée manquante ne doit pencher le calcul dans AUCUN sens : le repli choisit
maintenant la ressource (T1-T2 réf. 37 m², ou T3+ réf. 72 m²) dont la surface
de référence est la plus proche de la surface RÉELLE du bien. La ressource
générique ne reste utilisée qu'en tout dernier recours (ni pièces ni surface
connues).

## Reproductibilité de l'estimation IA — mesurée, pas supposée

Objectif produit : **100 estimations successives du même bien ne doivent pas
varier de plus de 5 %.** Mesuré sur appels Gemini réels (`gemini-2.5-flash`,
`temperature: 0`) :

| Configuration | Étendue max | Échecs JSON |
|---|---|---|
| Ancien prompt (montant absolu), **avec** Google Search | 6,9 % | 2 / 22 |
| Ancien prompt, **sans** Google Search | 0 % | 0 |
| Prompt résidu v1-v2 (double comptage étage/état non filtré), **avec** search | 8,4 % | 1 / 25 |
| Prompt résidu v1-v2, **sans** search | 10,4 % | 0 / 25 |
| **Prompt résidu final** (v4, étage/état/DPE déclarés déjà appliqués), **avec** search | 2,8 % | — |
| **Prompt résidu final, sans search** (implémenté) | **1,9 %** | **0** |

Conclusions retenues :

1. **`temperature: 0` est réellement déterministe** — l'instabilité résiduelle
   venait d'une ambiguïté du prompt (recompter un facteur déjà appliqué), pas
   d'un aléa du modèle.
2. **Google Search n'a jamais changé la valeur retenue**, sur ~180 appels
   couvrant 10 biens dont 5 marchés atypiques. Elle coûte latence, coût et
   100 % de la variance observée par ailleurs — d'où son retrait.
3. **Le JSON malformé effaçait le loyer.** `extractJson` renvoyait `null` →
   la route écrivait `loyer_retenu: null`. `responseSchema` (incompatible
   avec les outils, donc conditionné à l'abandon de la recherche) élimine ce
   mode d'échec.
4. **Biais directionnel, distinct de la variance** : sans garde-fous, le
   résidu est soit systématiquement positif, soit systématiquement négatif
   selon la version du prompt — voir « Le prompt résidu » ci-dessus.

⚠️ Échantillon limité (10 biens au total, dont 5 marchés atypiques testés une
seule fois). Taux d'échec et étendue estimés avec une précision faible ; à
réévaluer avant tout changement de modèle.

## `thinkingBudget` du résidu — mesuré, pas supposé

Plan d'optimisation §7 : le budget de "thinking" (tokens de raisonnement
interne Gemini, facturés comme de l'output) du prompt résidu était fixé à
512. Mesuré sur 5 biens (`gemini-2.5-flash`, `temperature: 0`, 3 appels
répétés par configuration), dont 2 marchés délibérément atypiques — un
marché touristique/montagne (Chamonix, forte saisonnalité) et un marché
rural très peu documenté (11 observations ANIL, niveau `maille`) :

| Bien | Marché | budget=512 : latence moy. | budget=512 : échecs (timeout 25 s) | budget=0 : latence moy. | budget=0 : échecs | Étendue du résidu (budget=0, 3 appels) |
|---|---|---|---|---|---|---|
| Paris 11e | normal, dense | 17,8 s* | 2 / 3 | 1,1 s | 0 / 3 | 0 pt (3, 3, 3) |
| Lyon 3e | normal | 2,9 s | 0 / 3 | 0,9 s | 0 / 3 | 0 pt (0, 0, 0) |
| Bordeaux (maison) | normal | 2,6 s | 0 / 3 | 0,6 s | 0 / 3 | 0 pt (0, 0, 0) |
| Chamonix-Mont-Blanc | **atypique** (touristique) | 17,6 s* | 2 / 3 | 1,0 s | 0 / 3 | 0 pt (5, 5, 5) |
| Allanche (Cantal) | **atypique** (rural, 11 obs.) | 2,7 s | 0 / 3 | 0,7 s | 0 / 3 | 0 pt (−5, −5, −5) |

\* Moyenne tirée vers le haut par les appels qui ont buté sur le timeout de
25 s (§4) et compté pour 25 s chacun ; les appels réussis à 512 restent dans
la même fourchette que ceux à 0 (~2,5-3,4 s).

Conclusions retenues :

1. **`thinkingBudget: 0` est net partout mesuré** : ~2 à 4× plus rapide sur
   les appels réussis, et surtout **0 échec sur 15 appels** contre **4/15
   (27 %) à 512** — les biens les plus lents à raisonner (Paris, Chamonix)
   ont buté deux fois sur trois sur le timeout réduit à 25 s (§4). Garder 512
   ne serait plus seulement plus lent : ce serait désormais moins FIABLE,
   par interaction avec le changement du §4.
2. **Reproductibilité parfaite à budget=0** sur cet échantillon : étendue
   nulle sur les 3 répétitions de chacun des 5 biens (cohérent avec la table
   de reproductibilité ci-dessus, qui attribuait déjà l'essentiel de la
   variance historique à l'ambiguïté du prompt, pas au thinking).
3. **Critères qualitatifs globalement équivalents** — à une nuance près sur
   le marché rural (Allanche, le cas le plus atypique de l'échantillon) : à
   512, l'IA rendait systématiquement "conforme au secteur" (0 %) ; à 0, elle
   rendait un ajustement (−5 %) en citant des critères qui varient légèrement
   d'un appel à l'autre ("maison de bourg" négatif vs "dépendance" positif
   pour un même écart final). Un jugement plus tranché sur données ANIL très
   clairsemées (11 observations), pas une dégradation claire — mais un point
   à garder en tête si un marché rural produit un résultat surprenant.

**Décision** : `thinkingBudget` passé de 512 à **0**, mais UNIQUEMENT sur le
prompt résidu (`estimerAvecReference`) — le seul mesuré ici.
`estimerImmeuble`/`estimerSansReference` (prompt plus simple : un montant +
une justification, pas de résidu qualitatif) gardent 512, faute de mesure.

⚠️ Même réserve que la table de reproductibilité : échantillon limité (5
biens, 3 répétitions), à réévaluer avant tout changement de modèle Gemini.

## Loyer — compléments du résidu IA

### Position approximative : caveat plutôt que donnée mesurée

`RentEstimationInput.precisionLocalisation` porte la précision de la
géolocalisation du bien. Sans adresse exacte, `latitude`/`longitude`
désignent le CENTROÏDE du quartier, pas le bâtiment réel — l'IA n'a alors pas
le droit de juger la rue, le vis-à-vis ou l'exposition précise à cette
échelle (même principe que la jointure DPE/ADEME par `banId` dans `run.ts`).
`buildPromptResidu` injecte à la place un caveat explicite
(`CAVEAT_LOCALISATION_APPROX`) : « ne fais AUCUNE affirmation sur la rue, le
vis-à-vis, l'exposition précise ou les nuisances de voisinage immédiat ».

⚠️ Le calcul du loyer n'utilise plus OSM (retiré — voir
`docs/plan-optimisation-loyer.md` §1 : effet mesuré faible sur le résidu,
0 à 3 points, contre ~3 s de latence et un risque de faux zéro silencieux
si Overpass répond vide). Ce module (`analyse/sources/osm.ts`) reste utilisé
ailleurs, par les blocs Potentiel et Quartier de l'Analyse IA — ne pas le
supprimer en pensant qu'il est mort.

### Le quartier — bug audité, IA autorisée à en tenir compte

⚠️ **Bug corrigé après un signalement utilisateur** (loyer réel très
supérieur à l'estimation, sur un bien à deux pas du Canal Saint-Martin,
Paris 10e). Le prompt déclarait auparavant l'« attractivité générale du
QUARTIER » comme déjà comptée en toute circonstance — vrai pour la quasi-
totalité des communes françaises (la référence ANIL est déjà au niveau
communal, la maille la plus fine publiée), **FAUX pour Paris, Lyon et
Marseille** : la référence n'y descend qu'au niveau ARRONDISSEMENT (10e,
3e…), qui peut recouvrir des quartiers très inégaux (Canal Saint-Martin et
Gare du Nord sont tous deux « 75010 Paris »).

`buildConsigneQuartier()` remplace cette fausse affirmation : gardée
UNIQUEMENT quand `input.quartier` est renseigné (sinon chaîne vide,
comportement inchangé), elle autorise l'IA à ajouter UN critère de
catégorie `"quartier"` — mais seulement si elle identifie le nom **avec
confiance** et connaît sa position relative (plus ou moins recherché que la
moyenne de sa commune/son arrondissement). Interdiction explicite d'inventer
une réputation pour un nom trop générique ou inconnu.

⚠️ **Indépendante de `precisionLocalisation`, volontairement** — connaître
le NOM d'un quartier ne demande pas de connaître l'adresse exacte (on peut
savoir qu'on est à "Canal Saint-Martin" sans connaître le numéro de rue).
C'est `CAVEAT_LOCALISATION_APPROX` (ci-dessus) qui restreint déjà les
affirmations de RUE (vis-à-vis, exposition précise) à la seule position
exacte — un périmètre plus étroit, resté inchangé.

**Mesuré avant déploiement** (3 appels répétés par cas, `gemini-2.5-flash`,
`temperature: 0`) :
- reproductible à l'identique sur des répétitions du même prompt (3/3
  identiques dans chaque cas testé) ;
- **mais initialement sensible à `precisionLocalisation`** pour un même
  quartier : `"arrondissement"` déclenchait le critère (+5 %), `"exacte"`
  restait neutre (0 %) — deux prompts légèrement différents (présence ou non
  de `CAVEAT_LOCALISATION_APPROX`) donnant deux jugements différents sur une
  information qui ne dépend pourtant pas de cette précision. Corrigé en
  rendant l'indépendance EXPLICITE dans la consigne plutôt que de compter sur
  l'IA pour l'inférer — les deux cas convergent désormais sur le même
  résultat ;
- anti-hallucination vérifié sur un nom de quartier inventé et sur un
  hameau rural peu connu : reste neutre (0 %) dans les deux cas, aucun
  critère "quartier" inventé.

⚠️ Échantillon limité (1 bien réel, quelques variantes). Contrairement à
`thinkingBudget` (§7 du plan d'optimisation), ce n'est PAS une donnée
mesurée comme l'est l'ANIL : c'est la connaissance générale du modèle sur la
réputation d'un quartier, avec les limites que ça implique (biais possibles,
connaissance datée). À surveiller sur des cas réels avant d'étendre.

`PROMPT_RESIDU_VERSION` bumpé (v3 → v4) : changement du TEXTE du prompt,
donc tous les calculs déjà en cache (§6) sont invalidés au prochain appel.

### Description : troncature relevée de 800 à 1 500 caractères

800 coupait souvent avant la phrase décrivant balcon/vue/exposition —
précisément ce que le résidu doit repérer. Le seuil est partagé
(`TRONCATURE_DESCRIPTION`) entre le chemin résidu et les chemins sans
référence/immeuble.

### Indicateur de fiabilité de la référence ANIL

`TYPPRED` (colonne 9 du CSV) capturée dans `LoyerReference.niveauPrediction`
(`"commune" | "epci" | "maille"`). Sur 85,4 % des communes la prédiction ne
vient PAS de la commune elle-même mais d'un groupe de communes similaires
(`maille`).

`LoyerCalcul.referenceFiable` = `estReferenceFiable(niveauPrediction, nbObs)`
(`anilReference.ts`, seuil `SEUIL_NB_OBS_FIABLE = 30` repris de la note
méthodologique ANIL) — **fonction partagée**, pas un calcul inline dupliqué :
le serveur (`rentEstimation.ts`) l'appelle au moment du calcul, et
`LoyerDetailPanel` la RECALCULE côté client à partir de la référence
fraîchement récupérée plutôt que de lire `calcul.referenceFiable`, qui peut
être absent (aucune estimation IA encore lancée) ou obsolète (référence ANIL
rafraîchie annuellement sans nouvelle estimation). Sert à SIGNALER
l'incertitude (badge « Fiabilité réduite », Étape 1 du panneau), pas à
écarter la référence.

`fetchLoyerReferenceLocal` (agrégation multi-communes dans un rayon de 500 m)
retient le niveau de fiabilité le PLUS FAIBLE des communes combinées.

### Écarté de ce lot — et pourquoi

| Piste | Verdict | Raison |
|---|---|---|
| **Ratio DVF local/communal** (indice quartier) | Écarté | Convertir une prime de prix en prime de loyer demande un coefficient d'amortissement inventé — exactement ce que la Phase 2 vient de nettoyer. |
| **Revenu médian IRIS** | Écarté | Signal indirect alors que l'ANIL mesure déjà le loyer observé. Donnée non localisée sur data.gouv.fr en temps raisonnable. |
| **QPV** (quartier prioritaire) | Écarté | Faisable mais hébergé par un portail tiers, et l'ANIL différencie déjà par arrondissement — complément marginal pour la dépendance ajoutée. |

## Panneau de détail (`LoyerDetailPanel.tsx`) — Phase 4

Deux étapes, pas trois. L'Étape 1 (référence de marché) et l'Étape 2
(tout ce qui fait varier ce loyer) répondent chacune à UNE question ; le
découpage précédent en 3 étapes suivait l'architecture du CODE
(référence → barème → résidu), pas la question que se pose l'utilisateur.

### Étape 1 — progression de VALEURS, pas de coefficients

Chaque ligne (`StepRow`) est un vrai €/mois pour CE bien : loyer médian ANIL
→ ajusté à la surface réelle → majoration meublé = loyer de référence. Chaque
marche affiche l'effet (%) qui y mène ET la valeur qui en résulte — jamais
l'un sans l'autre, sinon l'utilisateur doit composer les pourcentages de tête.

⚠️ **Il n'y a PAS d'étape « hors charges → charges comprises ».**
`loypredm2` (ANIL) est DÉJÀ charges comprises (voir plus bas) : l'ancienne
progression « Loyer ANIL **non meublé** » → « Loyer **CC** meublé » laissait
croire que deux choses changeaient (le meublé ET les charges) alors qu'une
seule bouge. « Charges comprises » est énoncé comme une PROPRIÉTÉ de la
source (footer « Source »), jamais comme une marche du calcul.

### Étape 2 — barème ET résidu IA dans UNE SEULE carte, en deux familles

L'utilisateur se demande « qu'est-ce qui a fait varier mon loyer », pas quel
sous-système (table de coefficients ou LLM) l'a calculé — les deux familles
sont donc dans la même carte (`FamilleFacteurs` × 2), mais restent des
sous-groupes VISUELLEMENT distincts, pour deux raisons qui ne disparaissent
pas avec la fusion :
- **Fiabilité** : le barème est reproductible et auditable (une table de
  coefficients), le résidu est le jugement d'un LLM. Tout aplatir ferait
  passer une opinion pour une règle.
- **Granularité** : chaque facteur du barème porte SON propre %
  (`FacteurTag`). Le résidu n'en a qu'UN SEUL pour l'ensemble de ses
  critères — cette donnée n'existe pas au niveau du critère individuel,
  inutile de l'inventer.

Le badge d'en-tête de l'Étape 2 (`ecartPct`) est colorisé par `ecartTone`
(perspective INVESTISSEUR), **pas** par `pctToneClasses` : c'est le MÊME
nombre que l'« Écart vs marché » de l'Étape 3 (même `apt.loyer_retenu` vs
`anilMedian`), il doit donc porter EXACTEMENT la même couleur — deux teintes
pour une seule valeur à quelques centimètres d'écart se lisent comme un bug,
pas comme deux informations différentes. Les tags de facteurs individuels
(`FacteurTag`, `CritereTag`), eux, restent en `pctToneClasses` : ils décrivent
un EFFET directionnel (hausse/baisse), pas une position vs marché.

⚠️ La somme des tags ne reconstitue PAS l'écart du badge : les facteurs
déterministes sont multiplicatifs puis bornés (`FACTEUR_DETERMINISTE_MIN/MAX`),
suivis du résidu IA puis du plafonnement sur la fourchette ANIL
(`RentEstimationResult.plafonne`). Les tags disent CE QUI a joué, le badge dit
OÙ on a atterri — ne pas laisser un utilisateur vérifier l'un par l'autre.

### Facteurs déterministes exposés — persistés, jamais recalculés côté client

`LoyerCalcul.facteursDeterministes` (`FacteurDeterministe[]`, optionnel) est
produit par `detailFacteursDeterministes()` (`rentEstimation.ts`), juste à
côté des coefficients qu'il décrit, et persisté avec le reste de `loyer_calcul`.
**Jamais recalculé dans le composant** : les coefficients (`ETAT_COEF`,
`DPE_ADJUST`, seuils d'étage) ne vivent qu'à un seul endroit — les recopier
côté client recréerait exactement la divergence serveur/client que
`anilReference.ts` a été écrit pour supprimer (voir plus bas). Ne rend que les
facteurs NON neutres : un bien sans étage renseigné, en bon état et sans DPE
n'affiche aucun tag, jamais trois tags « 0 % ».

**Repli pour les calculs enregistrés avant ce champ** (`undefined`) :
`LoyerDetailPanel` déduit l'effet GLOBAL du barème depuis
`loyerDeterministe / anilMedian − 1` et l'affiche en un seul tag agrégé
(« Étage · état · DPE »), plutôt que de ne rien montrer ou de tenter un
recalcul.

### Fusion des groupes IA sans catégorie inutile

`grouperCriteresParCategorie` groupe toujours les critères par catégorie,
mais le panneau n'affiche le LIBELLÉ de catégorie que si plusieurs catégories
sont réellement présentes (`groupes.length > 1`) — le cas le plus fréquent
(3-5 critères, souvent une seule catégorie dominante) ne répète pas le titre
de famille « Analyse IA » pour rien.

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

Détail de l'estimation communale/départementale (formule RC, dampening,
migration) : voir `docs/reference/taxe-fonciere.md`.

## Référence ANIL → loyer CC meublé (`src/lib/anilReference.ts`)

**Source unique** de la conversion, module PUR (aucune I/O) donc importable par
le serveur ET par `LoyerDetailPanel`.

```
loyer_m2_CC_meublé = loypredm2 × 1,12 × (surface / surface_référence) ^ −0,485
```

### ⚠️ `loypredm2` est DÉJÀ charges comprises — ne jamais rajouter de provision

La note méthodologique ANIL l'écrit trois fois. Le code documentait « hors
charges » et ajoutait `provisionChargesM2` par-dessus : **double comptage de
+5 % à +12 %** selon la commune. `provisionChargesM2` a été **supprimée** de
`blocs/location.ts` et de `rentEstimation.ts`.

En revanche la **majoration meublé (+12 %) reste légitime** : depuis l'édition
2024 l'ANIL est restreinte aux locations non meublées.

### La ressource dépend du bien

| Bien | Ressource | Surface de référence |
|---|---|---|
| Maison | `maison` | 92 m² |
| Appartement, `nb_pieces` ≤ 2 | `appartement de 1 ou 2 pièces` | 37 m² |
| Appartement, `nb_pieces` ≥ 3 | `appartement de 3 pièces ou plus` | 72 m² |
| `nb_pieces` inconnu, **ou immeuble** | `appartement` | 52 m² |

Mesuré sur les 34 960 communes : un T1-T2 était **sous-estimé de ~19 %**, un
T3+ **surestimé de ~13 %** avec la ressource unique d'origine.

⚠️ `MOTIF_RESSOURCE` (`sources/loyers.ts`) est ancré sur la **fin** du titre :
l'ANIL alterne « Indicateur**s** de loyer … » et « Indicateur de loyer … », et
`appartement` doit être ancré en fin de chaîne sinon il capte aussi
« appartement de 1 ou 2 pièces ».

⚠️ Un **immeuble** reste sur la ressource générique : ses lots sont des
logements de tailles mixtes. La correction de surface s'applique alors à la
surface **par lot** (`lotsEffectifs`), jamais à la surface totale du bâtiment.

### Élasticité de surface — LOCALE par commune, plus une constante nationale

⚠️ **Bug corrigé après un signalement utilisateur** (loyer réel très
supérieur à l'estimation sur un T2 parisien) : `ELASTICITE_SURFACE = −0,485`
(régression log-log sur les trois ressources appartement × 34 960 communes,
médiane des pentes) est une médiane **nationale**, tirée par ~35 000 communes
très majoritairement rurales — elle surestimait fortement la décote de
surface dans les grandes villes. Mesuré sur les données ANIL elles-mêmes :
Paris 10e −0,119, Paris 11e −0,137, Bordeaux −0,356, quand la constante
appliquait −0,485 partout. Sur le cas signalé (48 m², 10e arrondissement),
appliquer −0,485 au lieu de −0,119 sous-estimait le loyer de ~10 %.

**`LoyerReference.elasticiteLocale`** (calculée dans
`scripts/generate-anil-loyers.mjs`, `calculerElasticiteLocale`) remplace
`ELASTICITE_SURFACE` commune par commune, à partir de la SEULE paire de
points mesurable par commune : les loyers/m² des ressources T1-T2 (37 m² réf.)
et T3+ (72 m² réf.) donnent une pente log-log locale — même méthode que celle
qui a produit la constante nationale, appliquée commune par commune plutôt
qu'agrégée sur 34 960 valeurs.

Repli sur `ELASTICITE_SURFACE` (la constante nationale) dans trois cas :
- moins de 30 observations d'un côté ou de l'autre (`SEUIL_OBS_ELASTICITE`,
  même seuil que `SEUIL_NB_OBS_FIABLE`) — sous ce seuil la pente mesurée est
  du bruit, pas un signal de marché ;
- valeur hors bornes `[−1,2 ; −0,05]` (`BORNES_ELASTICITE`) — une pente
  positive ou quasi nulle est économiquement implausible (jamais observée sur
  un marché sain), donc traitée comme une mesure non fiable plutôt qu'une
  élasticité « réelle mais extrême » ;
- typologie `maison` — une seule ressource maison est publiée, aucune paire
  de points n'est mesurable ; ce marché reste sur la constante nationale
  (voir `elasticitePour`, `sources/loyers.ts`).

Sur les 34 900 communes de l'édition 2025 : **5 278 ont une élasticité
mesurée localement** (dont toutes les grandes villes testées), les 29 622
autres (petites communes, peu d'annonces) retombent sur la constante. **Effet
national mesuré neutre** : +0,0 % à +0,5 % en moyenne selon la surface — le
correctif ne déplace pas la médiane nationale, il corrige les marchés où la
pente locale diverge, dans les deux sens.

`facteurSurface(surfaceLogement, typologie, elasticite)` accepte désormais
cette valeur en paramètre (défaut `ELASTICITE_SURFACE` si omis — filet pour
un appelant sans `LoyerReference`, ou une référence persistée avant l'ajout
du champ). Borné à `[0,75 ; 1,45]` dans tous les cas (la loi puissance
diverge sous 15 m²).

⚠️ Ce changement modifie l'ANCRE déterministe sans changer aucun champ du
bien : `PROMPT_RESIDU_VERSION` (cache par empreinte, §6) a été bumpé en même
temps — sans ça, tous les biens déjà en cache auraient continué de servir
l'ancienne estimation indéfiniment (déjà rencontré une fois avec l'ajout du
sens `"neutre"`, voir plus bas).

Tous les autres coefficients du calcul de loyer sont **conventionnels** — à
traiter comme des hypothèses révisables, pas comme des mesures.

### ⚠️ `min`/`max` subissent EXACTEMENT la même chaîne que la médiane

Corriger seulement la médiane rendait, pour un studio de 20 m², la médiane
corrigée (580 €) **supérieure** au haut de fourchette non corrigé (567 €) : le
clamp tirait le loyer sous sa propre médiane. `referenceCCMeuble()` applique
la conversion aux trois valeurs d'un bloc — ne jamais les dissocier.

### La fourchette n'est pas un intervalle de confiance

C'est un intervalle de **prédiction à 95 %** sur les logements individuels :
sa largeur (~45 points, soit −20 %/+25 %) est **constante** quel que soit le
nombre d'observations. Elle décrit la dispersion réelle du parc, donc n'a
**aucune valeur légale** — la dépasser n'est pas interdit, 5 % des logements
réels sont dehors par construction. Ne pas l'élargir « pour laisser de la
marge » : les plafonds internes (déterministe × résidu IA) atteignent déjà
±38 %, soit plus que la fourchette. `RentEstimationResult.plafonne` signale
que le clamp a mordu, plutôt que de l'appliquer en silence.

### Données figées au build — rafraîchissement annuel

`src/lib/anil_loyers.json` (les 4 typologies, ~35 000 communes chacune) est
généré une fois pour toutes par `scripts/generate-anil-loyers.mjs` et
committé — même pattern que `taux_tfpb_communes.json` (DGFiP). Plus aucun
téléchargement ni résolution de ressource data.gouv au runtime :
`sources/loyers.ts` ne fait plus qu'un accès objet synchrone dans ce JSON.
Raison de ce choix plutôt qu'un rafraîchissement automatique : l'app tourne
sur des fonctions serverless (Vercel) dont la mémoire ne survit pas aux
redémarrages fréquents, et l'ANIL ne publie qu'une édition par an — un
rafraîchissement qui marcherait vraiment demanderait un cron + un stockage
persistant, de la nouvelle infrastructure pour un événement annuel.

**Procédure, une fois par an** (après la publication de la nouvelle édition,
généralement au 2nd semestre) :
1. `npm run generate:anil-loyers` — résout les 4 ressources sur
   data.gouv (édition N-1, repli N-2 si pas encore publiée — le même filet de
   sécurité qu'avant ce chantier : aucune régression si personne n'y pense
   pendant quelques mois), télécharge et réécrit `src/lib/anil_loyers.json`.
2. Vérifier le diff (`git diff --stat src/lib/anil_loyers.json` — l'année
   dans les logs du script doit avoir avancé, les tailles rester du même
   ordre de grandeur).
3. Committer et déployer.

Le script porte lui-même toute la logique de résolution de ressource
(`MOTIF_RESSOURCE`, recherche par titre) et de parsing CSV — elle n'existe
plus dans le code d'application, pour ne pas la dupliquer aux deux endroits.

## Ajustements déterministes

⚠️ **Pour le LOYER**, les facteurs (étage/ascenseur, état×travaux, DPE) sont
documentés dans « Loyer — résidu IA sans blend » plus haut. Depuis la Phase 2,
le prompt IA ne reçoit PLUS ces facteurs comme consignes à appliquer : ils
sont déclarés DÉJÀ appliqués, et l'IA ne porte que sur le résidu qualitatif —
la logique « mêmes facteurs des deux côtés » ci-dessous ne vaut donc plus que
pour les CHARGES.

Pour les **charges copro / TF fallback** (`chargesEstimation.ts`), les mêmes
facteurs restent appliqués dans le calcul déterministe ET dans le prompt IA :

- **Étage/ascenseur** : étage ≥ 3 avec ascenseur → +20 % charges copro (pas
  d'effet en dessous du 3e étage, ni au rez-de-chaussée).
- **Ancienneté** : immeuble > 50 ans = +10 % charges, ≤ 20 ans = −5 % charges.

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

Ne JAMAIS contourner ce filet — le code garantit la conformité même si l'IA
viole les consignes du prompt.

- **Rendu bold** : appliquer `renderBoldInline()` (`ApartmentDetail.tsx`) à
  tout texte de justification.
- **Données récentes uniquement** : dernière année connue, pas de moyenne
  multi-années.
