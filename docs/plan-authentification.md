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

### D4 — Monétisation → **freemium sur le nombre de biens**

Le levier principal est le **nombre de biens**, pas les analyses IA. Un
investisseur qui veut comparer un 2e bien est en recherche active — c'est le
moment naturel où il perçoit la valeur et accepte de payer. Gater sur les
analyses IA frustrerait sans donner de chemin clair à l'achat.

**Trois plans dans `profiles.plan` :**

| Plan | Qui l'a | Prix | Biens | Analyses IA |
|---|---|---|---|---|
| `free` | Tout nouveau compte | Gratuit | **1** | Illimitées sur ce bien |
| `pro` | Abonnés | **5,99 €/mois** | **Illimités** | **50/mois** |
| `tester` | Fondateur + beta-testeurs | — | **Illimités** | **Illimitées** |

- Le premier bien doit montrer 100 % de la valeur du produit — brider
  l'expérience sur le premier bien revient à cacher le produit derrière le
  paywall.
- `tester` est traité comme `pro` dans le code (`plan !== 'free'`), sans
  plafond d'analyses. Il n'est jamais proposé en interface — attribution par
  `UPDATE profiles SET plan = 'tester'` dans le SQL Editor de Supabase.

**Ce qu'on compte comme « 1 analyse » :**

Une analyse = un clic sur « Analyser » (le bouton qui lance `runAnalyse`). Ce
décompte est lisible par l'utilisateur : c'est un geste explicite, pas un
appel technique invisible. Les estimations ponctuelles déclenchées à l'ajout
ou à la relance d'un champ (loyer, charges, taxe foncière) ne comptent PAS —
elles font partie de l'expérience d'ajout du bien.

**Coût Gemini par utilisateur Pro (Gemini 2.5 Flash) :**

| Poste | Détail | Coût/analyse |
|---|---|---|
| Tokens (4 appels Gemini) | ~10k input + ~6k output | ~0,003 $ |
| Google Search (1 appel loyer) | Grounding API | ~0,035 $ |
| **Total** | | **~0,04 $ (≈ 0,037 €)** |

Scénarios par utilisateur Pro :

| Usage | Analyses/mois | Coût Gemini | Marge sur 5,99 € |
|---|---|---|---|
| Léger | 10 | 0,37 € | 5,62 € (94 %) |
| Moyen | 25 | 0,93 € | 5,06 € (84 %) |
| Intensif (plafond) | 50 | 1,85 € | 4,14 € (69 %) |

Le poste Google Search représente ~90 % du coût Gemini. Même au plafond
de 50 analyses/mois, la marge brute reste au-dessus de 4 € par utilisateur.

**Compteur d'analyses IA :**

- `analyses_ce_mois` + `periode_compteur` sur `profiles`.
- Incrémenté uniquement par `runAnalyse` (pas par les estimations de champ).
- Remise à zéro automatique quand `periode_compteur` < mois courant.
- `pro` : bloqué à 50/mois avec message clair.
- `free` : pas de plafond (le bien unique limite naturellement le volume).
- `tester` : aucun plafond.
- Pas de Stripe pour l'instant — juste le gate + un message d'upgrade.

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
  plan text not null default 'free'
       check (plan in ('free', 'pro', 'tester')),
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

## 4. Le phasage & état actuel

Six lots livrables. Chacun laisse l'app dans un état qui fonctionne — pas de
big bang où l'app est cassée pendant une semaine.

**État au 3 août 2026 :**
- ✅ **Lot 1** : complet (commit `1bd9809`)
- ✅ **Lot 2** : complet (commit `4e7a0f3`)
- ✅ **Lot 3** : complet (commit `e0cfc4c`)
- ✅ **Lot 4** : complet (commit `5b7ec3d`) — reset-password, profil utilisateur, bookmarklet
- ⏳ **Lot 5** : code complet, **branchement Stripe à finir** — voir
  `docs/setup-stripe.md` (migration 0010 + webhook secret + test de bout en bout)
- ⏳ **Lot 6** : non commencé

⚠️ Le lot 5 a **dévié du plan initial sur un point** : il ne s'arrête pas au
« gate + message de contact », il intègre Stripe directement (décision prise
en cours de route, voir `docs/UX-monetisation.md`). Le reste du plan ci-dessous
tient toujours.

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

### Lot 2 — Auth & session ✅ TERMINÉ

**Fichiers créés/modifiés :**
- ✅ `npm i @supabase/ssr` (cookies de session en App Router)
- ✅ `lib/supabase/client.ts` — client navigateur (anon key, auth uniquement)
- ✅ `lib/supabase/server.ts` — client serveur (créé par requête, applique RLS)
- ✅ `lib/auth.ts` — barrière de sécurité (`getSession()`, `requireSession()`, `getApiSession()`)
- ✅ `proxy.ts` — redirections optimistes avant `requireSession()`
- ✅ `src/app/(auth)/actions.ts` — Server Actions : `connexion`, `inscription`, `deconnexion`, `motDePasseOublie`, `changerMotDePasse`, `supprimerCompte`
- ✅ `src/app/(auth)/AuthShell.tsx` — layout split desktop/mobile avec brand panel
- ✅ `src/app/(auth)/AuthForm.tsx` — formulaire générique (login/signup)
- ✅ `src/app/(auth)/login/page.tsx`
- ✅ `src/app/(auth)/signup/page.tsx`
- ✅ `src/app/(auth)/mot-de-passe-oublie/page.tsx` + `MotDePasseOublieForm.tsx`
- ✅ `src/app/auth/callback/route.ts` — échange de code/token PKCE, ancien format
- ✅ `src/app/layout.tsx` — `getSession()` passe email à Navbar
- ✅ Variables d'env : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`

**Architecture validée :**
- Client navigateur = anon key (pas de donnée, auth seule)
- Client serveur = session par cookie (RLS s'applique)
- Barrière unique = `requireSession()` dans `db.ts`
- Redirections optimistes = `proxy.ts` (confort UX)
- Message d'erreur générique = "Email ou mot de passe incorrect" (ne révèle pas les adresses)

### Lot 3 — Cloisonnement des données

- Les 8 fonctions de `db.ts` prennent le `user_id` de la session.
- `getSettings()` / `updateSettings()` : `.eq("id", 1)` → `.eq("user_id", …)`.
- Les 8 routes API refusent les requêtes non authentifiées.
- `run.ts` (analyse IA) : vérifier la propriété du bien avant d'écrire.

**Test de sortie** : deux comptes, deux navigateurs. A ne voit rien de B, y
compris en appelant `/api/apartments/<id-de-B>` à la main.

### Lot 4 — Les écrans de compte ✅ COMPLET

**Fichiers créés/modifiés :**
- ✅ `/login`, `/signup`, `/mot-de-passe-oublie` — pages complètes
- ✅ **`/auth/reset-password`** — écran réinitialisation MDP après lien email
  - Formulaire : nouveau MDP + confirmation, validation 8 char min
  - Utilise action `changerMotDePasse()` existante
  - Redirect automatique du callback quand `type=recovery`
- ✅ `/compte` — page protégée (`requireSession`), affiche email + profil
- ✅ **`ComptePage.tsx`** — enrichi avec 3 cartes profil
  - Plan : Gratuit / Pro / Testeur
  - Biens : X/1 (free) ou X/Illimités (pro)
  - Analyses IA : X/mois (pro) ou sans limite (free)
  - Formulaire changement mot de passe, suppression de compte
- ✅ **Fonction DB : `getUserProfile()`**
  - Récupère plan, nombre de biens (COUNT), analyses ce mois
  - Type `UserProfile` exporte pour typage client
- ✅ Navbar — `UserMenu` dropdown avec menu, avatar, déconnexion
- ✅ `EmptyHomeState` — état vide « premier bien », invite à coller une URL
- ✅ **Bookmarklet amélioré**
  - Route `/api/auth-status` (publique) vérifie la session
  - Bookmarklet appelle auth-status AVANT redirection
  - Connecté → `/appartements/nouveau?prefill=...`
  - Non connecté → `/login?suivant=/appartements/nouveau?prefill=...`
  - Fallback si appel échoue : essayer direct (proxy redirige si besoin)
- ✅ Charte respectée : boutons sans icône, tailles standard (`py-3` pour CTA plein, `py-2.5` pour bouton inline)
- ✅ Focus rings `ring-2 ring-accent-500/20` sur inputs
- ✅ Messages d'erreur/succès en banneau
- ✅ Navbar masque les NAV_LINKS sur les routes d'auth

**Sécurité :**
- `requireSession()` sur `/compte` et `/auth/reset-password` — page non accessible si déconnecté
- `/api/auth-status` publique mais retourne 401 si pas de session → bookmarklet peut vérifier
- Pas de révélation d'existence d'email (cas de suppression : message générique)

### Lot 5 — Fondations monétisation

**Gate principal : nombre de biens**

- `POST /api/apartments` : si `plan = 'free'` et que l'utilisateur a déjà 1
  bien → refuser (HTTP 403) avec un message clair orientant vers le plan Pro.
- Le gate vérifie dans `db.ts` (pas dans l'API seule) pour que la protection
  reste même si une nouvelle route d'ajout est créée plus tard.
- `plan = 'tester'` et `plan = 'pro'` passent sans limite.

**Compteur d'analyses IA**

- Incrémenter `analyses_ce_mois` à chaque appel à `runAnalyse` (pas aux
  estimations de champ).
- Remise à zéro automatique quand `periode_compteur` < mois courant.
- `pro` : bloqué à 50/mois avec message clair.
- `free` : pas de plafond visible (le bien unique limite naturellement).
- `tester` : aucun plafond.

**Plan `tester`**

- Ton compte passe en `tester` au backfill (migration ou UPDATE manuel).
- Attribution d'autres testeurs : `UPDATE profiles SET plan = 'tester'` dans
  le SQL Editor de Supabase. Pas d'interface admin pour l'instant.

**Page `/compte` enrichie**

- Afficher le plan actuel (`Gratuit` / `Pro` / `Testeur`).
- Afficher le nombre de biens / limite.
- Afficher « X analyses ce mois » (info, pas menace).
- Pas de bouton d'upgrade tant que Stripe n'est pas branché — juste un
  message « Contacte-nous » ou une page d'attente.

**Pas de Stripe, pas de page de prix, pas de tiers.**

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
| Stripe, page de prix, paiement en ligne | On mesure l'usage avant de fixer un prix. Le gate (1 bien gratuit) et le compteur IA sont posés, le paiement attend des utilisateurs réels. |
| Interface d'admin (gestion des plans, des comptes) | Volume trop faible pour justifier un dev. Un UPDATE en base suffit pour promouvoir un testeur ou un beta. |
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
4. **Le plafond d'analyses IA sur `pro`** — 50/mois, ajustable à tout moment.
5. **Ton compte en `tester`** — le backfill de la migration ou un UPDATE manuel
   suffit. Confirme que c'est bien le plan.
