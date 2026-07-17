# Immoscore

Application personnelle pour comparer des appartements en vue d'un investissement
locatif : ajout d'une annonce par URL (ou saisie manuelle), extraction des
caractéristiques, estimation de rentabilité, tableau triable et carte.

Stack : Next.js (App Router) + TypeScript, Supabase (Postgres) comme base de
données, Leaflet/OSM pour la carte, Gemini (recherche Google, palier gratuit)
pour l'estimation de loyer.

## Objectifs

L'app sert un seul objectif : **arbitrer rapidement entre plusieurs biens**
repérés sur le marché, sans ressaisir à la main les mêmes calculs à chaque
fois. Concrètement, pour chaque bien ajouté, elle vise à répondre à trois
questions :

1. **Ce bien est-il un bon prix ?** — comparaison au marché local (DVF),
   loyer réellement atteignable vs loyer affiché.
2. **Quels sont les risques et le potentiel réels du quartier ?** — DPE/GES
   officiels, aléas naturels (Géorisques), sécurité, liquidité de revente,
   dynamique des prix — synthétisés en un score global et une note par bloc
   (Analyse IA).
3. **Quel sera le cash-flow concret si j'achète, avec un crédit donné ?** —
   simulation LMNP au réel mois par mois sur 25 ans, avec impact fiscal réel
   (amortissements, art. 39 C) et évolution du patrimoine (Simulation
   financière).

Aujourd'hui, c'est un outil de décision mono-utilisateur, optimisé pour
comparer une poignée de biens en cours de prospection. L'authentification
multi-utilisateurs (création de compte, isolation des données par
utilisateur) est un chantier à venir, pas encore implémenté.

## 1. Installer les dépendances

```bash
npm install
```

## 2. Configurer Supabase (obligatoire)

L'app lit/écrit dans une base Postgres Supabase via la **service role key**
(accès serveur uniquement, jamais exposée au client — pas d'auth utilisateur
pour l'instant, l'app reste mono-utilisateur).

Recommandé : **deux projets Supabase séparés**, un pour la production et un
pour le développement local, pour ne jamais risquer d'écrire des données de
test dans les vraies données (le plan Free inclut 2 projets gratuits).

1. Crée un projet sur [supabase.com/dashboard](https://supabase.com/dashboard)
   (répète l'étape pour un 2e projet si tu veux séparer prod/dev).
2. Dans **SQL Editor**, colle et exécute le contenu de
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) —
   dans **chaque** projet que tu crées. Ça crée les tables `apartments` et
   `app_settings`, avec RLS activé (aucune policy publique : seule la
   service role key peut lire/écrire).
3. Dans **Project Settings → API Keys**, récupère :
   - Le **Project URL** (aussi visible via le bouton **Connect** en haut du
     dashboard).
   - La **Secret key** (section "Secret keys", remplace l'ancienne
     `service_role` — clé serveur à privilèges élevés, ne jamais l'exposer
     côté client ni la committer).
4. Copie `.env.local.example` vers `.env.local` :

   ```bash
   cp .env.local.example .env.local
   ```

5. Remplis `.env.local` avec les valeurs du projet **dev** (celui du
   développement local) :
   - `SUPABASE_URL` → Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` → Secret key

En production (Vercel), renseigne les mêmes variables mais avec les
credentials du projet **prod** — voir la section Déploiement plus bas.

## 3. (Optionnel) Estimation de loyer par IA

Pour activer l'estimation automatique du loyer (recherche Google + Gemini,
**gratuit**, pas de carte bancaire requise) :

1. Va sur [aistudio.google.com/apikey](https://aistudio.google.com/apikey) et
   crée une clé API (compte Google suffit).
2. Renseigne `GEMINI_API_KEY` dans `.env.local`.

Sans cette clé, l'app fonctionne normalement : le champ `Loyer` reste vide et
tu le renseignes toi-même.

## 4. Lancer l'app

```bash
npm run dev
```

Ouvre [http://localhost:3000](http://localhost:3000).

## Fonctionnalités principales

Chaque bien ajouté dispose d'une fiche détaillée à 3 onglets :

- **Analyse IA** — score global (/10) et note par bloc (Prix d'achat,
  Potentiel locatif, Simulation financière, Potentiel, Risques), plus un
  bloc Quartier informatif, basés sur des données réelles (DVF, ANIL, ADEME,
  Géorisques, SSMSI, OpenStreetMap) et une narration générée par IA.
  Relançable manuellement.
- **Description de l'appartement** — champs éditables (achat, location,
  charges annuelles), avec recalcul live des indicateurs dérivés (prix/m²,
  budget total, rendements brut/net) à chaque saisie.
- **Simulation financière** — simulateur de cash-flow complet en LMNP au
  réel :
  - Crédit immobilier simulé (montant, taux, durée, assurance), avec montant
    emprunté par défaut = budget total de l'opération (auto), modifiable
    pour simuler un apport personnel.
  - Fiscalité LMNP au réel : amortissements du bâti, des travaux et des
    frais de notaire, plafonnés par l'art. 39 C (pas de déficit créé par
    l'amortissement ; excédent reporté).
  - Tableau **cash-flow année par année** sur toute la durée du crédit
    (défaut 25 ans), et détail du premier mois.
  - Graphique **Financement du projet** (donut) : répartition de ce qui
    couvre le coût total de l'opération entre loyers collectés, économie
    fiscale et participation (part de l'apport personnel encore non
    « remboursée » par le cash-flow cumulé au terme de la simulation).
  - Graphique **Évolution du patrimoine** (barres empilées, une par année) :
    dette restante, enrichissement net et effort d'épargne encore porté —
    les 25 années sont toujours visibles sans défilement, le graphique
    s'adapte à la largeur disponible (colonne 1/3 pour Financement du
    projet, 2/3 pour Évolution du patrimoine).
  - Tous les chiffres se recalculent en direct dès la saisie dans les autres
    onglets (même non enregistrée). Les hypothèses de revalorisation (bien,
    loyer) et d'indexation (charges de copro + taxe foncière) sont
    désactivées par défaut (hypothèse la plus prudente) et s'activent au cas
    par cas via un petit bouton dédié.
  - Les hypothèses (crédit, revalorisations) peuvent être **enregistrées**
    explicitement (bouton dédié, distinct de la sauvegarde des autres
    onglets) : le bloc "Simulation financière" de l'Analyse IA se base alors
    sur ces hypothèses réellement modélisées plutôt que sur un scénario par
    défaut générique.

## Identité visuelle — Immoscore

L'app porte l'identité **Immoscore** avec une charte graphique dédiée,
appliquée à l'ensemble de l'interface :

- **Palette** — un fond neutre teinté violet ("Bruyère", `ink-50` à
  `ink-900`, remplace le `slate` par défaut de Tailwind), un accent unique
  violet d'encre (`accent-50` à `accent-900`, base `#3D3580`, remplace
  `indigo`), et une couleur "signal" argile (`signal-*`, `#9C5A3C`) réservée
  aux actions destructives (jamais utilisée comme couleur décorative). Les
  couleurs sémantiques de statut/score (vert/ambre/rouge) restent séparées
  de l'accent de marque.
- **Typographie** — Fraunces (`font-display`) pour les titres, IBM Plex Sans
  (`font-sans`) pour le corps de texte, Geist Mono (`font-mono`) pour tous
  les chiffres clés (scores, prix, rendements, cash-flow), et Outfit
  (`font-wordmark`) pour le seul wordmark de la navbar — toutes
  auto-hébergées via `next/font/google`.
- **Wordmark & logo** — la navbar affiche « Immo**score** » (le suffixe
  « score » en accent de marque), sans icône. Le motif d'anneau ouvert (écho
  du `ScoreGauge` de l'Analyse IA) reste disponible en composant réutilisable
  `AppMark` depuis `src/components/Navbar.tsx` (état vide de la home,
  filigrane de l'étape URL).
- **Boutons** — 5 variantes (Primaire, Secondaire, Tertiaire, Destructif,
  Désactivé), toutes sans icône à l'intérieur du CTA.
- Le nom de l'app est centralisé dans `src/lib/constants.ts` (`APP_NAME`),
  réutilisé partout où il apparaît (navbar, titre de page, bookmarklet).

Ces règles sont contraignantes pour toute évolution future de l'UI — voir
le détail dans [`AGENTS.md`](AGENTS.md).

## Limites connues des parsers (important)

Leboncoin, SeLoger et PAP protègent leurs pages avec des dispositifs anti-bot
(DataDome, Cloudflare) qui **bloquent la quasi-totalité des requêtes
serveur-à-serveur** — vérifié en pratique lors du développement : la page de
recherche Leboncoin passe, mais une page d'annonce individuelle est bloquée à
~100 %, SeLoger bloque tout le site, PAP bloque via un challenge Cloudflare.
Orpi s'est montré accessible dans nos tests.

**C'est un comportement normal et attendu**, pas un bug à corriger : dans ce
cas, l'app le signale clairement dans l'interface et bascule automatiquement
sur la saisie manuelle (mêmes champs, à remplir toi-même en 30 secondes à
partir de l'annonce ouverte dans un autre onglet). Le mode "debug" affiche
aussi tout ce qui a pu être extrait avant validation, pour permettre de
corriger un champ mal détecté.

## Déploiement sur Vercel

Le projet est prêt pour Vercel : `vercel deploy` (ou connecter le repo GitHub
sur vercel.com), puis renseigner les variables d'environnement
(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`) dans les
paramètres du projet Vercel — en scopant `SUPABASE_URL`/
`SUPABASE_SERVICE_ROLE_KEY` sur **Production** avec les credentials du
projet Supabase prod, et sur **Preview**/**Development** avec ceux du projet
dev, pour qu'un déploiement de preview ne puisse jamais écrire dans les
vraies données. Note : les IP des fonctions serverless Vercel sont, comme
tout datacenter, fréquemment bloquées par les protections anti-bot des
parsers — les limites ci-dessous s'appliquent aussi (voire plus) en
production.
