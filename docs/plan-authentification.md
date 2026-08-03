# Plan de dev — Comptes utilisateurs & cloisonnement des données

> Objectif : passer d'une app mono-utilisateur (une base, un profil, des biens
> partagés) à une app où chacun crée son compte, ne voit que ses biens, et où
> les fondations de la monétisation sont posées sans être construites.

---

## 1. Ce que dit le code aujourd'hui

Audit fait sur le code réel, pas sur des suppositions.

| Constat | Détail | Conséquence |
|---|---|---|
| **`db.ts` est le point de passage unique** | 159 lignes, 8 fonctions. **Aucun autre fichier** n'importe `@supabase/supabase-js`. | C'est la meilleure nouvelle du projet. Le cloisonnement se joue dans UN fichier. |
| **Service role key uniquement** | `getClient()` utilise `SUPABASE_SERVICE_ROLE_KEY`, qui **contourne RLS par design**. | Aujourd'hui la sécurité = « personne n'a la clé ». Ça ne tient plus à plusieurs. |
| **RLS activé, zéro policy** | `alter table ... enable row level security` sans aucun `create policy`. | RLS est décoratif. Le commentaire de `0001_init.sql` l'annonce déjà : « à affiner quand l'authentification sera ajoutée ». |
| **`app_settings` est mono-ligne par construction** | `id smallint primary key default 1 check (id = 1)` | **Le point dur.** Le profil investisseur est unique pour toute l'app. Il faut casser cette contrainte. |
| **Aucun `user_id` nulle part** | Ni dans les migrations, ni dans `types.ts`. | Tout est à créer, mais rien n'est à défaire. |
| **582 lignes d'API routes sans auth** | `GET /api/apartments` liste tout, sans vérification. | 8 routes à passer en revue. |
| **Le bookmarklet ouvre une URL navigateur** | `w.location.href = url` vers `/appartements/nouveau?...` | **Il hérite de la session par cookie. Aucun changement d'auth nécessaire** — juste une redirection vers login si déconnecté. |

### Contraintes Next.js 16 (vérifiées dans `node_modules/next/dist/docs/`)

Deux points où la mémoire d'un dev — ou d'une IA — est périmée :

- **`middleware.ts` est déprécié, renommé `proxy.ts`.** Codemod fourni :
  `npx @next/codemod@canary middleware-to-proxy .`
- **Next.js déconseille explicitement le proxy comme barrière d'auth** :
  > « We recommend users avoid relying on Middleware unless no other options exist. »

  Le pattern officiel est le **Data Access Layer** avec un `verifySession()`
  mémoïsé par `cache()` de React. Le proxy ne sert qu'à des redirections
  *optimistes* (confort UX), jamais à protéger la donnée.

**Ça tombe bien : `db.ts` est déjà ce DAL.** On ne change pas d'architecture,
on ajoute une vérification dans le passage obligé.

---

## 2. Les décisions structurantes

Mes recommandations, à valider ou corriger.

### D1 — Quel service d'auth ? → **Supabase Auth**

Déjà dans la stack, gratuit jusqu'à 50 000 utilisateurs actifs, gère email +
mot de passe, magic link et OAuth Google. Zéro service à ajouter, zéro
« innovation token » dépensé. On n'écrit jamais son propre système d'auth.

### D2 — Comment cloisonner ? → **RLS ET filtrage applicatif** (les deux)

C'est la décision la plus importante du plan.

| Option | Ce qui protège | Le jour où on se trompe |
|---|---|---|
| A. Garder `service_role`, filtrer par `user_id` dans `db.ts` | Le code, uniquement | **Un `.eq("user_id", …)` oublié dans une fonction = tous les biens de tous les comptes exposés.** Rien ne rattrape. |
| B. Client authentifié + policies RLS | La base de données elle-même | Un oubli dans le code ne fuit rien : Postgres refuse la ligne. |

**Recommandation : B, plus le filtrage applicatif en ceinture-bretelles.**

Le surcoût est d'environ 30 lignes (créer le client par requête avec le cookie
de session au lieu d'un singleton). Le bénéfice est qu'une erreur de code
devient un bug d'affichage au lieu d'une fuite de données personnelles —
adresses, budgets, coordonnées de contact. Sur du multi-tenant, c'est le seul
endroit du plan où je refuse de couper au plus court.

`service_role` reste utilisé pour les écritures serveur légitimes (l'analyse IA
qui écrit son résultat après vérification de propriété), jamais pour lire au
nom d'un utilisateur.

### D3 — Que faire des biens existants ? → **les rattacher à ton compte**

Tu es aujourd'hui le seul utilisateur. À la migration, tes biens et ton profil
investisseur deviennent ceux de ton compte. Concrètement : tu crées ton compte
en premier, on récupère son `user_id`, et le backfill l'écrit sur les lignes
existantes.

**Ordre imposé** : créer le compte AVANT de passer `user_id` en `not null`
(voir les pièges, §5).

### D4 — Jusqu'où aller sur la monétisation ? → **compter, ne pas facturer**

Pas de Stripe maintenant. Mais deux champs qui coûtent une ligne de SQL
aujourd'hui et qui seraient douloureux à ajouter plus tard :

- `plan` sur le profil (`'free'` pour tout le monde au départ) ;
- un **compteur d'analyses IA**.

Le second n'est pas cosmétique. L'analyse IA appelle Gemini : c'est le **seul
coût variable réel** de l'app, et il est aujourd'hui invisible parce qu'un seul
utilisateur le déclenche. Ouvert au public, c'est le poste qui explose, et
c'est aussi le vecteur d'abus le plus évident. Le compteur sert donc trois fois :
protection contre l'abus, mesure avant de fixer un prix, et levier de
monétisation naturel le jour venu (« 3 analyses/mois en gratuit »).

Mesurer d'abord, tarifer ensuite — on ne fixe pas un prix sur une intuition.

---

## 3. Architecture cible

```
Navigateur ──cookie de session──┐
                                 │
                    proxy.ts  ───┤  (optimiste : redirige /login si pas de cookie.
                                 │   Confort UX. NE protège pas la donnée.)
                                 │
              Server Component ──┤
              ou Route Handler   │
                                 │
                     db.ts  ─────┤  ← LA barrière : verifySession() puis
                    (le DAL)     │    requête filtrée par user_id
                                 │
                   Supabase  ────┘  ← RLS : refuse toute ligne d'un autre user,
                                       même si le code se trompe
```

Trois barrières, une seule qui compte vraiment (`db.ts` + RLS). Le proxy est du
confort : il évite d'afficher une page vide avant la redirection.

### Schéma DB cible

```sql
-- Fourni par Supabase, on n'y touche pas
auth.users (id, email, ...)

-- Nouveau : les données applicatives du compte
profiles (
  id uuid primary key references auth.users on delete cascade,
  plan text not null default 'free',
  analyses_ce_mois integer not null default 0,
  periode_compteur date not null default date_trunc('month', now()),
  created_at timestamptz not null default now()
)

-- Modifié
apartments   + user_id uuid not null references auth.users on delete cascade
app_settings   la PK devient user_id (la contrainte check (id = 1) saute)
```

`on delete cascade` : supprimer son compte efface ses biens. C'est une
obligation RGPD, et c'est une ligne de SQL si on la pose maintenant.

---

## 4. Le phasage

Six lots livrables. Chacun laisse l'app dans un état qui fonctionne — pas de
big bang où l'app est cassée pendant une semaine.

### Lot 1 — Le socle DB *(le plus risqué, à faire en premier et à froid)*

- Migration `0008_auth_multi_user.sql` :
  - table `profiles` + trigger de création automatique à l'inscription ;
  - `apartments.user_id` (nullable **d'abord**) ;
  - refonte de `app_settings` : PK sur `user_id`, `check (id = 1)` supprimé.
- Backfill des lignes existantes vers ton `user_id`.
- Passage en `not null` **après** backfill vérifié.
- Policies RLS sur les trois tables.

**Test de sortie** : depuis le SQL Editor, avec le rôle d'un utilisateur A,
`select * from apartments` ne renvoie que les biens de A.

### Lot 2 — Auth & session

- `npm i @supabase/ssr` (le package qui gère les cookies de session en App Router).
- Deux fabriques de client : navigateur et serveur.
- `verifySession()` dans `db.ts`, mémoïsé via `cache()`.
- `proxy.ts` pour les redirections optimistes.
- Variables d'env : ajouter `NEXT_PUBLIC_SUPABASE_URL` et
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (l'anon key est publique par nature — c'est
  RLS qui protège, pas le secret de la clé).

### Lot 3 — Cloisonnement des données

- Les 8 fonctions de `db.ts` prennent le `user_id` de la session.
- `getSettings()` / `updateSettings()` : `.eq("id", 1)` → `.eq("user_id", …)`.
- Les 8 routes API refusent les requêtes non authentifiées.
- `run.ts` (analyse IA) : vérifier la propriété du bien avant d'écrire.

**Test de sortie** : deux comptes, deux navigateurs. A ne voit rien de B, y
compris en appelant `/api/apartments/<id-de-B>` à la main.

### Lot 4 — Les écrans de compte

- `/login`, `/signup`, `/mot-de-passe-oublie`.
- `/compte` : email, mot de passe, suppression du compte.
- Navbar : état connecté, menu, déconnexion.
- État vide « premier bien » pour un compte neuf (`EmptyHomeState` existe déjà).
- Bookmarklet : redirection vers `/login` si déconnecté, avec retour sur
  l'annonce après connexion.

Charte : boutons sans icône, tailles standard, `SectionTitle` pour les titres
(voir `AGENTS.md`).

### Lot 5 — Fondations monétisation

- Incrémenter le compteur à chaque analyse IA, remise à zéro mensuelle.
- Quota souple : bloquer au-delà d'un seuil généreux, message clair.
- Afficher « X analyses ce mois » dans `/compte`.
- **Pas de Stripe, pas de page de prix, pas de tiers.**

### Lot 6 — Durcissement avant ouverture

- Emails d'auth (Supabase envoie par défaut ; passer à Resend pour un domaine propre).
- Rate limiting sur les routes coûteuses (`/api/analyse`, `/api/estimate-*`).
- Sentry, backups Supabase, page 404/erreur (déjà en place).
- Relecture RGPD : export et suppression des données.

### Ordre et dépendances

```
Lot 1 (DB) ──► Lot 2 (auth) ──► Lot 3 (cloisonnement) ──► Lot 4 (UI)
                                          │
                                          └──► Lot 5 (quotas) ──► Lot 6 (durcissement)
```

Les lots 1 à 3 forment un bloc indissociable : tant qu'ils ne sont pas finis,
l'app est soit mono-utilisateur, soit cassée. Les lots 4 à 6 sont incrémentaux.

**Ordre de grandeur** : les lots 1-3 sont le vrai morceau (schéma, sécurité,
tests croisés). Le lot 4 est du travail d'écrans, sans piège. Les lots 5-6 sont
courts. À une personne aidée d'une IA, en visant une ouverture publique
prudente, on est sur quelques sessions de travail — pas quelques heures, pas
plusieurs semaines. Je préciserai à mesure qu'on avance.

---

## 5. Les pièges spécifiques à CE projet

Pas des précautions générales : les cinq endroits où ce projet précis casse.

**1. Les migrations sont manuelles, sur deux bases.** `AGENTS.md` le répète à
chaque migration : à exécuter à la main sur **chaque** projet Supabase (prod et
dev). Une migration d'auth appliquée d'un côté seulement, et la prod tombe à la
première requête. À faire sur dev d'abord, à vérifier, puis prod.

**2. `user_id not null` sur une table qui a des lignes = échec immédiat.**
Postgres refuse d'ajouter une colonne `not null` sans défaut sur des lignes
existantes. D'où la séquence en trois temps : **nullable → backfill → not null**.
Jamais en une fois.

**3. `check (id = 1)` sur `app_settings` doit sauter explicitement.** La
contrainte est nommée automatiquement par Postgres ; il faut la retrouver
(`\d app_settings`) et la supprimer avant de changer la clé primaire. Sinon la
migration passe et toute écriture de réglages échoue ensuite.

**4. `rowToSettings()` masque les colonnes manquantes.** Le filet documenté
dans `db.ts` fait retomber les colonnes absentes sur `DEFAULT_SETTINGS`. Utile
jusqu'ici, **dangereux ici** : si la migration n'est pas passée, l'app affichera
sereinement les réglages par défaut au lieu de crier. Prévoir un échec explicite
sur l'absence de `user_id`.

**5. L'analyse IA est persistée avec un instantané du profil.**
`AnalyseIA.settings` et `empreinteBien` servent à détecter l'obsolescence. En
multi-utilisateur, l'analyse d'un bien doit être comparée au profil de **son
propriétaire**, pas à celui de la session courante. À vérifier dans
`memeProfil()` au lot 3.

---

## 6. Ce que je ne fais pas maintenant

Volontairement hors périmètre — les nommer évite de les redécouvrir comme des oublis.

| Écarté | Pourquoi |
|---|---|
| Stripe, page de prix, plans payants | On mesure l'usage avant de fixer un prix. Le socle (`plan`, compteur) est posé, le reste attend des utilisateurs réels. |
| Partage de biens entre comptes, équipes | Multiplie la complexité du modèle de droits. Rien ne dit que c'est demandé. |
| Rôles et permissions fines | Un seul rôle : propriétaire de ses biens. |
| OAuth Google/Apple | Email + mot de passe suffit pour ouvrir. S'ajoute en une soirée plus tard, sans rien casser. |
| Onboarding multi-étapes | L'état vide existant fait le travail. |

---

## 7. Décisions à confirmer avant le lot 1

1. **D2 — RLS + filtrage applicatif** plutôt que filtrage seul : c'est le choix
   qui coûte ~30 lignes et évite qu'un oubli devienne une fuite. Je le recommande
   fortement.
2. **D3 — tes biens actuels rattachés à ton compte** (l'alternative étant de
   repartir d'une base vide).
3. **Email + mot de passe** au lancement, Google plus tard.
4. **Le seuil du quota d'analyses** — chiffre à choisir, ajustable à tout moment
   puisqu'on ne facture pas encore.
