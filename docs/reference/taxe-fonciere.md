# Taxe foncière — estimation commune + département, quote-part terrain

> Référence de domaine — chargée seulement quand la tâche touche
> `taxeFonciereCommune.ts`, `taxeFonciereData.ts`, ou le champ
> `quote_part_terrain_pct`. Pointeur depuis `AGENTS.md`.

## Architecture à deux niveaux

1. **Niveau communal** (précis) — `src/lib/taxeFonciereCommune.ts` (server-only,
   473 Ko de données) :
   - Source : DGFiP 2025 REI, 34 874 communes
   - Données : `src/lib/taux_tfpb_communes.json` (code_insee → taux_global %)
   - Moyennes dept : `src/lib/taux_moyen_dept.json` (code_dept → taux_moyen %)
   - Formule : `TF = surface × RC_m2 × taux_commune`
   - **Purement déterministe** — pas d'appel IA
   - Activé quand le `code_insee` du bien est disponible (via géocodage BAN)

2. **Niveau départemental** (fallback) — `src/lib/taxeFonciereData.ts` :
   - TF/m² par département (barème statique)
   - Estimation : `estimateTaxeFonciereLocale(surface, codePostal, prix)`
   - Complété par IA + blending quand appelé via `/api/estimate-charges`

## Estimation du RC (revenu cadastral) par m²

Le RC n'est pas une donnée publique — il est estimé à partir des données
départementales : `RC_m2 = TF_EUR_M2_dept / taux_moyen_dept`.

Ce calcul brut souffre d'un **biais de covariance** : dans les départements
urbains, la moyenne simple du taux (non pondérée par la population)
sous-estime le taux réel pondéré, ce qui surestime le RC. Un **dampening
adaptatif** corrige ce biais en fonction de l'écart entre le taux communal
et la moyenne départementale :

- **Taux communal ≤ moyenne dept** (ex : Le Plessis-Trévise 34.7 % vs dept
  37.9 %) → pas de biais pour cette commune → **pas de dampening** (facteur 1.0)
- **Taux communal > moyenne dept** (ex : Marseille 47.9 % vs dept 39.9 %) →
  biais probable → **dampening proportionnel** à l'écart (facteur 0.3 à 1.0)
- **Taux communal = moyenne dept** (ex : Paris, seule commune du dept 75) →
  aucun biais possible → **pas de dampening** (facteur 1.0)
- **Sans taux communal** (fallback) → **dampening maximal** (facteur 0.3)

Constante de référence : `NATIONAL_RC_M2 = 49` (20 €/m² TF ÷ 0.41 taux
moyen national). Le dampening ne s'applique que quand `deptRC > NATIONAL_RC_M2`.

## Données (server-only)

Le module `taxeFonciereCommune.ts` et ses JSON (473 Ko) ne sont importés que
par le code serveur (API routes). Ne JAMAIS l'importer depuis un composant
client ou un fichier importé côté client — ça ajouterait 473 Ko au bundle.
Le module `taxeFonciereData.ts` (département, ~2 Ko) est importable partout.

## Fonctions exportées

- **`getTauxCommune(codeInsee)`** → taux global TFB de la commune (ou null)
- **`estimateTaxeFonciereCommune(surface, codeInsee, codePostal, prix)`** →
  estimation TF avec taux communal si disponible, sinon fallback départemental
- **`estimateTaxeFonciereLocale(surface, codePostal, prix)`** → estimation
  départementale pure (dans `taxeFonciereData.ts`)
- **`defaultQuotePartTerrain(codePostal)`** → quote-part terrain par défaut
  selon la zone (urbain 10 %, périurbain 15 %, rural 20 %)

**Migration requise** : `supabase/migrations/0005_quote_part_terrain.sql`
ajoute `quote_part_terrain_pct` (real, nullable). À exécuter dans le SQL
Editor de CHAQUE projet Supabase (prod et dev).

## Quote-part terrain (amortissement LMNP)

La simulation LMNP (`src/lib/simulation.ts`) n'utilise plus un ratio fixe
90 % bâti / 10 % terrain. Le champ `quote_part_terrain_pct` (nullable) sur
`Apartment` permet à l'utilisateur de saisir le vrai ratio (disponible sur
l'acte notarié ou l'avis d'imposition). Quand le champ est `null`, un défaut
intelligent est calculé selon la zone via `defaultQuotePartTerrain()` :
- Zone urbaine dense (Paris, Lyon, Annecy, Nice…) : **10 %** terrain
- Zone intermédiaire (villes moyennes) : **15 %** terrain
- Zone rurale / périurbaine : **20 %** terrain

Le champ est modifiable dans l'onglet « Simulation financière » (section
Fiscalité LMNP), avec une pastille « auto » quand il est en mode automatique.
Il ne part **plus** en PATCH direct à chaque frappe : il est tenu en brouillon
local le temps de l'édition et enregistré avec les hypothèses, dans le même
PATCH. L'aperçu temps réel du cash-flow est conservé — c'est le brouillon qui
alimente `simulate()`, sans rien persister.
