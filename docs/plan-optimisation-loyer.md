# Plan — Optimisation de l'estimation du loyer (post-refonte)

Ce document fait suite à la refonte complète du calcul du loyer (Phases 1 à 3,
terminées — voir `AGENTS.md`, section « Architecture d'estimation »). La
refonte a corrigé le calcul (double comptage, mauvaise ressource ANIL,
non-linéarité de la surface, blend qui diluait le signal IA). Ce plan
s'attaque à un problème différent : **le calcul actuel est correct mais lent
et coûteux**, et une partie de sa complexité récente (OSM) n'apporte pas assez
pour être gardée.

## Objectif

Trois axes, dans cet ordre de priorité :

1. **Simplifier** — retirer ce qui n'apporte pas assez de valeur par rapport à
   sa complexité et son risque (OSM).
2. **Accélérer** — éliminer les temps morts réseau évitables (téléchargement
   ANIL à chaque appel à froid, appels IA redondants).
3. **Réduire le coût** — moins d'appels Gemini, des appels plus courts.

Aucun de ces changements ne touche à la **formule** du loyer (facteurs
déterministes, résidu IA, plafonnement ANIL) : c'est un chantier de
performance et de nettoyage, pas un chantier de calcul. Le résultat numérique
ne doit pas changer (hormis l'absence du signal OSM, retiré volontairement).

## Décisions actées

| # | Sujet | Décision |
|---|---|---|
| 1 | OSM (commerces/transports autour du bien) | **Retiré** |
| 2 | Paralléliser les appels réseau | **Sans objet** — voir plus bas |
| 3 | Résolution de la ressource ANIL sur data.gouv | **Option A** : figée au build |
| 4 | Retry / timeout Gemini | **Réduits** |
| 5 | Données ANIL (le CSV lui-même) | **Option A** : figées au build |
| 6 | Rappeler Gemini même si rien n'a changé | **Supprimé** — cache par empreinte |
| 7 | `thinkingBudget` de Gemini | **Mesuré → passé à 0** (prompt résidu uniquement) |

---

## 1. Retirer OSM

**Pourquoi** : mesuré lors de l'audit — l'effet sur le résidu est faible (0 à
3 points dans les cas sains) et la source peut renvoyer un **faux zéro**
silencieux (Overpass surchargé → réponse vide, indiscernable d'un vrai
quartier désert). Le risque d'erreur dépasse le bénéfice mesuré, sans compter
le coût : ~3 s de latence à chaque estimation, sur une source publique
non garantie.

**À faire** :
- Supprimer le paramètre `osm` de `estimateRent()`, `buildPromptResidu()`, et
  toute la construction du bloc « ENVIRONNEMENT MESURÉ » (`buildEnvironnementOsm`)
  dans `src/lib/rentEstimation.ts`.
- Retirer l'appel `fetchOsmBundle(...)` et la garde de précision associée dans
  `src/app/api/estimate-rent/route.ts`.
- **Vérifier avant de supprimer le fichier** `src/lib/analyse/sources/osm.ts` :
  s'assurer qu'aucun autre bloc d'analyse (`blocs/*.ts`) ne l'utilise. S'il est
  bien isolé au calcul du loyer, le supprimer entièrement plutôt que le
  laisser mort dans le repo.
- Revoir si `CAVEAT_LOCALISATION_APPROX` (l'avertissement « position
  approximative ») garde un sens sans OSM — probablement oui pour le résidu
  qualitatif en général (l'IA ne doit pas sur-interpréter un quartier qu'on ne
  connaît qu'approximativement), mais à confirmer au moment du code : s'il ne
  sert plus qu'à gater le bloc OSM, il part avec.
- Nettoyer `AGENTS.md` : retirer toute la section « Loyer — Phase 3
  (enrichissement du résidu) » relative à OSM, garder uniquement ce qui
  concerne l'indicateur de fiabilité ANIL (toujours d'actualité, voir §5).

## 2. Paralléliser les appels réseau — sans objet

Cette proposition visait à lancer ANIL et OSM en parallèle plutôt qu'en
séquence. Avec OSM retiré (§1) et les données ANIL figées au build (§3),
**il ne reste plus aucun fetch réseau à paralléliser** dans le calcul du
loyer avant l'appel Gemini — la lecture ANIL devient une lecture de fichier
local, quasi instantanée. Ce point disparaît du plan, absorbé par les deux
décisions ci-dessus.

## 3. et 5. Données ANIL figées au build (Option A)

**Pourquoi cette option plutôt qu'un rafraîchissement automatique tous les
6 mois** : l'app tourne sur des fonctions serverless (Vercel) dont la mémoire
ne survit pas aux redémarrages fréquents — un cache « en mémoire » avec une
durée de vie de 6 mois se vide en pratique bien avant d'avoir servi, et ne
résout donc pas le vrai coût (4,3 s de téléchargement à froid). Un
rafraîchissement automatique qui fonctionnerait vraiment demanderait une
tâche planifiée (Vercel Cron) + un stockage persistant (Blob ou base de
données) — de la nouvelle infrastructure, pour un événement qui n'arrive
qu'une fois par an (l'ANIL publie une édition annuelle). Le projet a déjà un
pattern éprouvé pour ce cas exact : `src/lib/taux_tfpb_communes.json`
(données DGFiP, 484 Ko, figées au build, rafraîchies manuellement une fois
par an). On applique le même pattern à l'ANIL.

**À faire** :
- Écrire un script (`scripts/` ou équivalent, à l'image de ce qui a servi à
  produire `taux_tfpb_communes.json`) qui :
  1. Résout les 4 ressources ANIL sur data.gouv.fr (recherche par typologie —
     logique aujourd'hui dans `resolveResource()`/`loadTable()` de
     `sources/loyers.ts`) ;
  2. Télécharge et parse les 4 CSV ;
  3. Produit un JSON compact, indexé par `code_insee` puis par typologie,
     conservant `loypredm2`, `lwr.IPm2`, `upr.IPm2`, `TYPPRED`, `nbobs_com` —
     les mêmes champs que `LoyerReference` aujourd'hui.
- Committer ce JSON dans `src/lib/anil_loyers.json` (ou nom équivalent),
  server-only comme `taux_tfpb_communes.json`.
- Réécrire `src/lib/analyse/sources/loyers.ts` pour lire ce JSON local au lieu
  de télécharger/parser les CSV à chaque appel à froid. Les fonctions
  publiques (aujourd'hui `loyerReferenceCommune`, `fetchLoyerRef`) gardent la
  même signature et le même comportement (agrégation des communes voisines,
  `niveauPrediction` le pire des constituants) — seule la source de la donnée
  change, pas la logique.
- Supprimer tout le code de résolution de ressource / téléchargement /
  parsing CSV du chemin d'exécution runtime (`memoAsync`, cache par
  `Map<TypologieAnil, ...>` compris — plus nécessaire une fois la lecture
  locale instantanée).
- Documenter dans `AGENTS.md` la procédure de rafraîchissement annuel
  (« relancer le script, vérifier le diff, committer, déployer »), avec le
  même filet de sécurité qu'aujourd'hui : si l'édition N n'est pas encore
  publiée au moment du refresh, le script retombe sur N-1 — aucune régression
  si personne n'y pense pendant quelques mois.

## 4. Retry / timeout Gemini réduits

- `MAX_TENTATIVES` : 2 → **1** tentative (pas de retry automatique — l'appel
  du résidu est rapide à relancer manuellement via le bouton « Estimer avec
  IA » si besoin, inutile de faire attendre l'utilisateur deux fois la durée
  d'un timeout).
- `TIMEOUT_MS` : 55 000 → **25 000** ms. La limite Vercel (300 s par fonction)
  laisse largement la place ; ce qui compte est l'expérience utilisateur, qui
  ne doit pas attendre près d'une minute sur un échec.
- Le mode de dégradation gracieuse existant (résidu → 0, déterministe seul en
  cas d'échec IA) reste inchangé — juste atteint plus vite.

## 6. Cache Gemini par empreinte — ne pas rappeler si rien n'a changé

**Pourquoi** : aujourd'hui, relancer une estimation loyer réappelle Gemini
même si aucune donnée pertinente du bien n'a changé depuis la dernière
estimation — un appel payant et non nul en latence pour un résultat
identique.

**À faire** :
- Calculer une empreinte des champs qui alimentent le **résidu** IA (état,
  travaux, étage, ascenseur, DPE, description, quartier/ville/adresse,
  surface — tout ce qui entre dans `buildPromptResidu`), plus la référence
  ANIL utilisée (le déterministe doit lui aussi être inchangé).
- La stocker à côté de `loyer_calcul` (nouveau champ dans `LoyerCalcul`, ex.
  `empreinteResidu`).
- Dans `estimerAvecReference()` : si l'empreinte calculée == l'empreinte
  stockée sur le bien ET que la référence ANIL est la même, **réutiliser**
  `ajustementPct`/`criteres` déjà en base plutôt que de rappeler Gemini —
  reconstruire `justification` à partir des critères existants
  (`synthetiserJustification`), recalculer uniquement le déterministe (rapide,
  local) au cas où un facteur non couvert par l'empreinte aurait changé.
- Ce mécanisme s'applique aussi bien au clic manuel « Estimer avec IA » qu'au
  recalcul automatique (`runRecalc`) — c'est dans `estimateRent()` /
  `estimerAvecReference()` qu'il doit vivre, pas dans l'appelant, pour
  bénéficier aux deux chemins sans dupliquer la logique.
- Ne s'applique qu'au chemin « avec référence » (le seul qui persiste un
  résidu réutilisable) — les chemins immeuble / sans référence continuent
  d'appeler Gemini à chaque fois (ils n'ont pas de déterministe de repli).

## 7. `thinkingBudget` — mesuré, passé à 0 (résidu uniquement)

**Ce que c'est** : les tokens de raisonnement interne que Gemini peut générer
avant de répondre — invisibles, mais facturés comme de la sortie. Était fixé
à 512 sur les 3 appels Gemini de `rentEstimation.ts`.

**Mesuré** sur 5 biens (dont 2 marchés atypiques : Chamonix — touristique, et
Allanche/Cantal — rural, 11 observations ANIL), 3 appels répétés par
configuration, sur le prompt résidu uniquement : `thinkingBudget: 0` est
2 à 4× plus rapide, **0 échec sur 15 appels contre 4/15 (27 %) à 512** (les
biens les plus lents à raisonner butaient sur le timeout réduit à 25 s du
§4), et une reproductibilité parfaite (étendue nulle sur les 3 répétitions
de chaque bien). Nuance qualitative mineure sur le marché rural le plus
atypique : critères moins stables qu'à 512, mais pas de dégradation nette.
Détail complet : `docs/reference/estimation-loyer-charges.md`.

**Décision appliquée** : `thinkingBudget: 0` sur le prompt résidu
(`estimerAvecReference`) uniquement — le seul mesuré.
`estimerImmeuble`/`estimerSansReference` gardent 512, faute de mesure.

---

## Nettoyage de code attendu

L'objectif explicite est de **simplifier au maximum**, pas seulement
d'ajouter des optimisations à côté de l'existant :

- Supprimer entièrement le code OSM du chemin loyer (fichier `sources/osm.ts`
  inclus, si non partagé ailleurs).
- Supprimer le fetch réseau + parsing CSV + cache en mémoire de
  `sources/loyers.ts`, remplacés par une lecture de fichier local.
- Supprimer la résolution de ressource data.gouv du runtime (déplacée dans un
  script exécuté manuellement, hors requête utilisateur).
- Revoir `MOTIF_RESSOURCE`, `resolveResource`, `loadTable`, `doLoadTable` :
  soit ils migrent dans le script de génération (le script en a toujours
  besoin pour trouver les CSV sur data.gouv), soit ils disparaissent du code
  d'application — ne pas les garder dupliqués aux deux endroits.
- Mettre à jour `AGENTS.md` en conséquence : retirer OSM du texte, documenter
  la nouvelle architecture ANIL figée et la procédure de rafraîchissement
  annuel, mettre à jour la table de mesures si `thinkingBudget` change.

---

## Phase 4 — Panneau de détail du loyer

Architecture retenue, différente du découpage en 3 étapes envisagé
initialement (Référence → Barème → Résidu, calqué sur l'architecture du
code) : un audit avec l'utilisateur a établi que l'Étape 1 doit rester la
progression de VALEURS (référence → surface → meublé), mais que barème
déterministe et résidu IA fusionnent en une seule Étape 2 — l'utilisateur se
demande « qu'est-ce qui a fait varier ce loyer », pas quel sous-système l'a
calculé. Les deux familles restent des sous-groupes visuellement distincts à
l'intérieur de cette étape (fiabilité différente : coefficients reproductibles
vs jugement d'un LLM ; granularité différente : un % par facteur déterministe,
un seul % pour tout le résidu). Détail complet, y compris la persistance des
facteurs déterministes nécessaire pour les afficher sans les recalculer côté
client : `docs/reference/estimation-loyer-charges.md`.
