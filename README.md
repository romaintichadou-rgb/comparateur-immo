# Comparateur d'investissement locatif

Application personnelle pour comparer des appartements en vue d'un investissement
locatif : ajout d'une annonce par URL (ou saisie manuelle), extraction des
caractéristiques, estimation de rentabilité, tableau triable et carte.

Stack : Next.js (App Router) + TypeScript, Google Sheets comme base de données,
Leaflet/OSM pour la carte, Gemini (recherche Google, palier gratuit) pour
l'estimation de loyer.

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

L'app n'a pas vocation à devenir un produit multi-utilisateurs : c'est un
outil de décision personnel, optimisé pour comparer une poignée de biens en
cours de prospection.

## 1. Installer les dépendances

```bash
npm install
```

## 2. Configurer Google Sheets (obligatoire)

L'app lit/écrit dans la Google Sheet via un **compte de service** Google (pas
d'OAuth utilisateur à gérer).

1. Va sur [console.cloud.google.com](https://console.cloud.google.com/) et crée
   un nouveau projet (ou réutilise un projet existant).
2. Dans **APIs & Services → Bibliothèque**, cherche **Google Sheets API** et
   clique sur **Activer**.
3. Dans **APIs & Services → Identifiants**, clique sur **Créer des
   identifiants → Compte de service**. Donne-lui un nom (ex.
   `comparateur-locatif`), pas besoin de rôle particulier au niveau projet.
4. Une fois le compte de service créé, ouvre-le, va dans l'onglet **Clés**,
   puis **Ajouter une clé → Créer une clé → JSON**. Un fichier `.json` se
   télécharge : garde-le précieusement, **ne le commit jamais**.
5. Ouvre la Google Sheet cible :
   https://docs.google.com/spreadsheets/d/1YLHBiIfOOuzrhEvDfd_sTdM0Umf97Ar1KM_mj2RHhs0/edit
   Clique sur **Partager**, et ajoute l'adresse email du compte de service
   (visible dans le JSON, champ `client_email`, du type
   `xxx@xxx.iam.gserviceaccount.com`) en tant qu'**Éditeur**.
6. Copie `.env.local.example` vers `.env.local` :

   ```bash
   cp .env.local.example .env.local
   ```

7. Remplis `.env.local` avec les valeurs du JSON téléchargé :
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` → champ `client_email` du JSON
   - `GOOGLE_PRIVATE_KEY` → champ `private_key` du JSON, **collé tel quel avec
     les `\n` littéraux** (ne pas les remplacer par de vrais retours à la
     ligne, ne pas retirer les guillemets)
   - `GOOGLE_SHEET_ID` déjà pré-rempli (id de la Sheet ci-dessus)

L'app initialise automatiquement la ligne d'en-têtes dans le premier onglet de
la Sheet au premier lancement si elle est vide — pas besoin de la créer à la
main.

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

- **Analyse IA** — score global (/5) et note par bloc (Prix d'achat,
  Potentiel locatif, Risques, Potentiel du quartier), basés sur des données
  réelles (DVF, ANIL, ADEME, Géorisques, SSMSI, OpenStreetMap) et une
  narration générée par IA. Relançable manuellement.
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
    onglets (même non enregistrée).

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
sur vercel.com), puis renseigner les mêmes variables d'environnement
(`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID`,
`GEMINI_API_KEY`) dans les paramètres du projet Vercel. Note : les IP des
fonctions serverless Vercel sont, comme tout datacenter, également
fréquemment bloquées par les protections anti-bot — les limites ci-dessus
s'appliquent aussi (voire plus) en production.
