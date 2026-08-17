# Multi-utilisateurs, monétisation et authentification

> Référence de domaine — chargée seulement quand la tâche touche l'auth, les
> quotas/plans, Stripe ou le cloisonnement multi-comptes. Pointeur depuis
> `AGENTS.md`.

## État d'avancement

Plan complet : `docs/plan-authentification.md` (6 lots). **Lots 1 à 5 faits** —
socle DB, authentification, cloisonnement, écrans de compte, monétisation.
Reste le lot 6 (durcissement avant ouverture publique : rate limiting, emails,
monitoring).

# Monétisation (lot 5) — plans, quotas, Stripe

UX de référence : `docs/UX-monetisation.md`. Branchement Stripe :
`docs/setup-stripe.md`.

## Trois plans, deux limites

| Plan | Biens | Analyses IA/mois |
|---|---|---|
| `free` | **1** (`LIMITE_BIENS_FREE`) | illimitées |
| `pro` | illimités | **50** (`LIMITE_ANALYSES_PRO`) |
| `tester` | illimités | illimitées |

⚠️ **`free` n'est PAS plafonné en analyses**, et ce n'est pas un oubli : son
bien unique borne déjà le volume, et brider l'analyse du premier bien
reviendrait à cacher le produit derrière le paywall. Conséquence directe :
`/upgrade/analyse-limite` n'est atteignable que par un abonné **Pro**, qui n'a
donc rien à acheter — la page lit le plan et **n'affiche l'offre que si elle a
un sens**. Ne pas y remettre un « Passer à Pro » inconditionnel.

Les deux constantes vivent dans `db.ts`, à côté des gates qui les lisent.

## `QuotaDepasseError` — une classe, pas un code d'erreur

Levée par `createApartment()` et `checkAndIncrementAnalyseQuota()`, elle porte
un champ **`redirection`** : l'écran qui EXPLIQUE la limite atteinte.
`reponseErreur()` le renvoie dans le corps du 403, et `redirectionQuota()`
(`lib/quota.ts`) le suit côté client.

Une classe plutôt qu'un `err.code === "…"` : c'est l'idiome déjà retenu pour
`NonAuthentifieError`, et `instanceof` se vérifie au typage — une faute de
frappe dans une chaîne rendrait le quota inopérant **sans rien casser de
visible**, donc à nos frais.

**Atteindre une limite n'est pas une erreur de l'utilisateur.** D'où une
redirection vers une page dédiée plutôt qu'un bandeau rouge : un message
d'échec sur un geste légitime le culpabilise pour une contrainte commerciale.

Les gates sont posés **dans `db.ts`**, pas seulement dans les routes : un
futur chemin de création (import en masse, Server Action) hérite de la limite
sans avoir à y penser.

⚠️ `redirectionQuota()` n'accepte **que** des chemins internes (`/…`, jamais
`//…`) — même filtre que `destination()` dans `actions.ts`. Le corps d'une
réponse ne doit jamais pouvoir décider d'une navigation vers un domaine tiers.

## `lib/plans.ts` — les limites, lisibles des DEUX côtés

`LIMITE_BIENS_FREE`, `LIMITE_ANALYSES_PRO` et `PLAN_LABEL` vivent dans
`lib/plans.ts`, un module **sans `server-only`**. `db.ts` les ré-exporte pour
les gates.

Elles étaient définies dans `db.ts`, donc inaccessibles à un composant client —
`/compte` recopiait « 1 » et « 50 » en dur. Deux sources pour la même règle
commerciale, dont une invisible depuis l'écran qui l'affiche : le genre d'écart
qui survit à un changement de tarif. Tout nouveau plafond va dans ce module,
pas dans `db.ts`.

## Écran « Mon compte » (`/compte`)

Structure : en-tête (titre + **badge de plan** + email) → deux `StatCard`
(biens, analyses) → offre Pro *(plan gratuit seulement)* → mot de passe →
suppression du compte.

Trois décisions à ne pas défaire :

- **Le plan est un BADGE, pas une carte métrique.** Il occupait une troisième
  carte identique aux deux autres, donc un `font-mono text-2xl` pour un mot
  (« Gratuit »). Et trois cartes de même poids aplatissaient la hiérarchie : le
  plan conditionne les deux métriques, il ne se lit pas à côté d'elles.
- **Les métriques passent par `StatCard`**, pas par une carte locale. La copie
  maison avait dérivé sur trois points : chiffres hors `font-mono` (contraire à
  la charte), labels en `ink-400` (3,6:1 sur blanc, sous le seuil AA), et aucune
  tonalité — « limite atteinte » ne se voyait pas.
- **La suppression est une carte, pas un lien de pied de page.** C'était un
  `text-xs text-ink-400` centré : **3,1:1** sur le fond `ink-50`, sous le
  minimum AA de 4,5:1, et rouge **au survol seulement** — donc muet au doigt.
  Posé sur une carte blanche, `text-red-600` atteint 4,8:1 et annonce sa nature
  sans attendre un survol. La carte reste la dernière de la page : séparée des
  actions courantes, mais lisible.

⚠️ **Le CTA standard de la charte fait 40 px de haut** (`px-5 py-2.5`), sous
les 44 px recommandés pour une cible tactile. C'est le gabarit de TOUS les CTA
de l'app : ne pas le corriger bouton par bouton, ce serait troquer une
incohérence contre une autre.

## Gris secondaires de `StatCard` : `ink-500`, jamais `ink-400`

La carte est toujours posée sur du blanc. Mesuré sur cette base :
**`ink-400` = 3,64:1**, sous le minimum WCAG AA de 4,5:1 ; **`ink-500` =
7,62:1**. `sub` et `avant` sont donc en `ink-500`.

Ce ne sont pas des ornements : `sub` porte « Interdit dès 2028 » sur la carte
DPE — un avertissement réglementaire — et `avant` est le montant auquel on
compare celui d'après.

**`avant` reste une « référence neutre »** comme le veut la charte : ce qui
compte est qu'elle ne prenne pas la couleur de la tonalité, pas qu'elle soit
pâle. `ink-500` est toujours un gris neutre. La hiérarchie label / valeur /
sub tient par la graisse et la taille, pas par un délavage.

⚠️ **L'affordance « Calcul → » reste à `ink-300` (1,72:1), délibérément.**
C'est le seul élément de la carte qui n'est pas du contenu : un indice de
découvrabilité, qui s'éclaircit au survol. La monter au niveau du texte la
ferait concurrencer la valeur qu'elle annote. À revoir si l'on veut traiter le
fait qu'un indice au survol seul n'existe pas au doigt — mais c'est une
décision de design, pas une correction de contraste.

Les nombreux `text-ink-400` ailleurs dans l'app (`AnalyseIA`, `OptimiserView`)
n'ont pas été touchés : fonds et rôles y varient, chacun demande sa propre
mesure.

## Les trois écrans d'upgrade

Gabarit partagé : **`UpgradeScreen.tsx`** (badge à halo, filigrane `AppMark`,
`bg-tech-grid`, titre Fraunces) — même vocabulaire visuel qu'`ErrorScreen`,
parce que ce sont deux interruptions de parcours. Exports associés :
`OffrePro` (la carte prix + bénéfices) et `BoutonPasserPro`.

| Route | Déclencheur |
|---|---|
| `/upgrade/bien-limite` | 403 sur `POST /api/apartments` (2e bien, plan gratuit) |
| `/upgrade/analyse-limite` | 403 sur `POST /api/analyse/[id]` (50 analyses, plan Pro) |
| `/upgrade/success` | Retour du Payment Link Stripe |

**Une page, pas une modale** — décision produit. Le blocage arrive alors que
l'utilisateur a une intention précise ; une modale recouvre ce contexte et se
ferme d'un clic à côté. Le **ton est doux** : on constate, on montre, on laisse
repartir sans payer (lien de retour toujours présent). Pas de compte à
rebours, pas d'urgence fabriquée.

## Webhook Stripe — la seule source de vérité du plan

`/api/stripe/webhook` écoute `checkout.session.completed` (→ `pro`) et
`customer.subscription.deleted` (→ `free`).

⚠️ **`/upgrade/success` ne bascule RIEN.** La redirection de retour est
déclenchée par le navigateur : elle peut être ouverte à la main, rejouée, ou
ne jamais arriver si l'onglet est fermé après paiement. Seul l'appel signé de
Stripe atteste d'un paiement. La page `success` **lit** le plan et affiche
« activation en cours » si le webhook n'est pas encore passé — les deux
chemins courent en parallèle, elle ne doit jamais affirmer un succès qu'elle
n'a pas constaté.

**C'est le seul fichier du projet qui utilise légitimement la `service_role`
key** en dehors des migrations. L'interdiction posée pour `db.ts` tient au
fait que celui-ci sert des requêtes AU NOM d'un utilisateur connecté ; ce
handler n'a aucune session (l'appelant est Stripe) et doit écrire sur la ligne
d'un compte identifié par la signature du paiement. Le client admin est
délibérément **défini dans ce fichier** et non factorisé dans
`lib/supabase/` : sa portée doit rester visible à l'œil nu.

Trois détails à ne pas « simplifier » :

- **Le corps est lu en `req.text()`**, jamais `req.json()` : re-sérialiser
  l'objet invaliderait la signature au moindre écart d'espacement.
- **L'utilisateur est identifié par `client_reference_id`**, posé sur le
  Payment Link par `BoutonPasserPro` — jamais par l'email : celui saisi dans
  Stripe peut différer de celui du compte, et ferait basculer le mauvais
  profil, ou aucun.
- **Un échec répond 500**, ce qui déclenche le rejeu par Stripe. Le traitement
  est idempotent (valeur fixe écrite, rien d'incrémenté) : le rejeu est sans
  risque, alors qu'un 200 optimiste perdrait l'événement.

## Migration 0010 — pourquoi `stripe_customer_id` est indispensable

`checkout.session.completed` porte notre `client_reference_id`, mais
`customer.subscription.deleted` — celui qui doit REDESCENDRE le compte en
`free` — ne porte que l'identifiant client Stripe. Sans la correspondance
stockée par la 0010, une résiliation ne se rattache à aucun compte et
l'abonnement annulé resterait `pro` indéfiniment. Index unique : un client
Stripe ne peut appartenir qu'à un compte.

Comme toutes les migrations : **manuelle, sur CHAQUE projet** (dev, puis prod).

## Cloisonnement (lot 3) — deux barrières, volontairement redondantes

`db.ts` n'utilise **plus** la `service_role` key. Chaque requête passe par le
client de la SESSION (`supabase/server.ts`) **et** filtre sur `user_id` :

1. **RLS** (policies de la 0008) : Postgres refuse de lui-même la ligne d'un
   autre compte.
2. **Filtre applicatif** : `.eq("user_id", userId)` sur chaque requête.

La redondance est le but. Une policy désactivée par erreur dans le dashboard,
le filtre tient ; un filtre oublié, RLS tient. C'est le seul endroit du projet
où l'on paie une redondance de plein gré — le mode d'échec est une fuite de
données personnelles.

⚠️ **Ne jamais réintroduire la `service_role` key dans `db.ts`** pour
« simplifier » ou contourner un souci de policy : elle contourne RLS par
design et supprimerait la première barrière.

### `contexte()` — pourquoi aucune fonction ne prend d'`userId` en paramètre

Toutes les fonctions de `db.ts` appellent `contexte()`, qui lève
`NonAuthentifieError` (via `requireUserId()`) s'il n'y a pas de session. Aucune
n'accepte d'`userId` en argument : il n'existe donc pas de variante « sans
session » qui renverrait tout, et un appelant ne peut pas se tromper de compte.
La sécurité ne dépend pas de la discipline de l'appelant.

`db.ts` **lève** une erreur au lieu de rediriger, parce qu'il sert deux
contextes qui n'ont pas la même réponse à « pas de session » : un Server
Component doit rediriger vers `/login`, une route d'API doit répondre 401 en
JSON (un `fetch()` qui reçoit du HTML de connexion échoue de façon obscure).
Le DAL signale, chaque contexte traduit — via `reponseErreur()`
(`app/api/erreurs.ts`) ou `requireSession()`.

### Trois pièges rencontrés en testant à deux comptes

**1. `user_id` écrit APRÈS l'étalement de `input`** dans `createApartment()` :
sinon un payload contenant `user_id` s'attribuerait le bien d'un autre compte.
L'ordre de ces lignes est une règle de sécurité, pas un style. Vérifié : un
POST avec un `user_id` forgé est bien attribué à l'appelant réel.

**2. Une suppression filtrée ne lève aucune erreur quand elle ne touche rien.**
`DELETE` répondait « ok » sur le bien d'un autre compte, là où `GET` et `PATCH`
répondaient 404 — trompeur pour l'utilisateur légitime dont le bien aurait déjà
été supprimé. `deleteApartment()` renvoie donc un `boolean`, et la route traduit
en 404.

**3. Un handler sans `try/catch` répond 500 au lieu de 401.** `GET
/api/apartments/[id]` était le seul dans ce cas : `NonAuthentifieError`
remontait brute. Tout handler appelant `db.ts` doit passer par
`reponseErreur()`.

### Routes sans `db.ts` : protection EXPLICITE obligatoire

`/api/parse` et `/api/loyer-reference` n'appellent pas le DAL — elles
n'héritent donc d'aucune protection et vérifient la session elles-mêmes via
`getApiSession()`. Laissée ouverte, `/api/parse` irait chercher n'importe
quelle URL au nom du serveur : un proxy de scraping gratuit pour qui la
découvre. **Toute nouvelle route qui n'appelle pas `db.ts` doit faire cette
vérification à la main.**

### Ce qui n'est PAS distingué, exprès

`getApartment()` renvoie `null` aussi bien pour un bien inexistant que pour le
bien d'un autre compte, et l'API répond 404 dans les deux cas. Répondre « ce
bien existe mais n'est pas à toi » confirmerait l'existence d'un identifiant à
qui le devine.

## Auth (lot 2)

| Fichier | Rôle |
|---|---|
| `lib/supabase/client.ts` | Client navigateur (anon key). **Sert uniquement à l'authentification** — toute donnée passe par le serveur. |
| `lib/supabase/server.ts` | Client serveur porteur de la session, créé **par requête** (pas de singleton) : c'est lui qui fera appliquer RLS au lot 3. |
| `lib/auth.ts` | **La barrière** : `getSession()`, `requireSession()`, `getApiSession()`. |
| `proxy.ts` | Rafraîchit le jeton + redirections optimistes. **Ne protège rien.** |
| `app/(auth)/` | `actions.ts` (Server Actions), `AuthForm.tsx`, `login/`, `signup/`. |

### Quatre règles à ne pas contourner

1. **`getUser()`, jamais `getSession()` de Supabase, côté serveur.**
   `getSession()` se contente de décoder le cookie : un cookie fabriqué à la
   main passerait. `getUser()` valide le jeton auprès du serveur Auth.
   (Attention à l'homonymie : `getSession()` de `lib/auth.ts` est notre
   fonction à nous, et elle appelle bien `getUser()`.)

2. **`cookies()` est ASYNCHRONE en Next.js 16**, et `.set()` n'est autorisé que
   dans un Server Action ou un Route Handler — **jamais dans un Server
   Component**. D'où le `try/catch` silencieux de `setAll` dans
   `lib/supabase/server.ts` : l'échec y est normal, `proxy.ts` ayant déjà
   rafraîchi la session en amont. Ne pas « corriger » ce catch en y ajoutant
   un log d'erreur, il se déclencherait à chaque rendu de page.

3. **`proxy.ts` n'est PAS une barrière de sécurité** — la doc de Next.js 16 le
   dit explicitement (il tourne aussi sur les routes préchargées et ne lit que
   le cookie). Il sert à rafraîchir le jeton, ce qui est sa vraie raison
   d'être : sans lui, la session expire au bout d'une heure en pleine
   navigation. La protection réelle est `requireSession()`, appelée dans le
   DAL. Le nom du fichier n'est pas négociable : `middleware.ts` est déprécié
   en Next.js 16.

4. **Les routes `/api/*` ne sont jamais redirigées** vers `/login` par le
   proxy : un `fetch()` qui reçoit du HTML de connexion à la place de son JSON
   échoue de façon obscure. Elles répondront 401 elles-mêmes (lot 3).

### `?suivant=` — retour à la destination après connexion

Le proxy pose `?suivant=<chemin>` avant de rediriger, et `destination()`
(`actions.ts`) n'accepte **que** les chemins internes (`/…`, jamais `//…` ni
une URL absolue) : sans ce filtre, `?suivant=https://…` transformerait le lien
de connexion en redirection ouverte. C'est aussi ce qui fait que le
bookmarklet survit à une session expirée — l'annonce n'est pas perdue en route.

### Navbar sur les écrans d'auth

`ROUTES_AUTH` (`Navbar.tsx`) masque le `UserMenu` sur `/login`, `/signup` et
`/mot-de-passe-oublie` : il pointe vers des pages qui exigent une session, et y
cliquer depuis l'écran de connexion ne ferait que ramener à l'écran de
connexion. Le wordmark, lui, reste cliquable.

La barre ne porte plus aucun lien de navigation (voir « Navbar » dans
`AGENTS.md`) : la garde `surEcranAuth` ne couvre donc plus que le `UserMenu` et
le bouton « Se connecter ».

### Écrans d'auth — split layout

Les trois écrans d'auth (login, signup, mot-de-passe-oublié) partagent
`AuthShell.tsx` : split 45/55 desktop (brand panel gauche + form panel blanc à
droite), form seul sur mobile (brand panel `hidden` sous `lg:`).

**Brand panel gauche** : `bg-tech-grid` décoratif + `AppMark` avec halo lumineux
(même traitement que `EmptyHomeState` : blur + bordure + ombre accent), wordmark,
titre Fraunces « Trouve tes prochains investissements locatifs », description
courte (score sur 10), séparateur fin, puis 3 étapes numérotées en `font-mono`
(Colle une annonce / L'app calcule tout / Achète le bon bien). Le contenu est
centré verticalement et horizontalement dans le panneau.

`AuthForm.tsx` gère login et signup (formulaire générique avec `ChampMotDePasse`
— toggle eye/eyeOff, lien « Oublié ? » inline). `MotDePasseOublieForm.tsx` gère
le mot de passe oublié avec le même shell. Inputs à 44px touch targets (`py-3`),
focus ring `ring-2 ring-accent-500/20`.

## Lot 4 — Les écrans de compte

| Fichier | Contenu |
|---|---|
| `src/app/(auth)/login/page.tsx` | Écran connexion |
| `src/app/(auth)/signup/page.tsx` | Écran inscription |
| `src/app/(auth)/mot-de-passe-oublie/page.tsx` + `MotDePasseOublieForm.tsx` | Demande réinitialisation |
| `src/app/auth/callback/route.ts` | Callback Supabase (PKCE + ancien format, redirection intelligente) |
| `src/app/auth/reset-password/page.tsx` | Réinitialisation MDP après email |
| `src/app/compte/page.tsx` + `ComptePage.tsx` | Page compte protégée avec profil utilisateur |
| `src/lib/db.ts` : `getUserProfile()` | Récupère plan, biens, analyses |
| `src/components/Navbar.tsx` | `UserMenu` dropdown avec avatar, menu, déconnexion |
| `src/components/EmptyHomeState.tsx` | État vide « premier bien », invite URL |

- Reset password : formulaire avec toggle eye/eye-off, validation 8 char, réutilise `changerMotDePasse()`
- Profil utilisateur : 3 cartes (Plan / Biens / Analyses), affichage adapté au plan (free/pro/tester)

⚠️ **Le bookmarklet n'a PAS eu besoin d'être modifié pour l'auth**, contrairement
à ce que le plan laissait attendre. Il redirige vers
`/appartements/nouveau?prefill=…` et le proxy fait le reste : sans session il
renvoie sur `/login?suivant=…` en conservant la query string, donc l'annonce
n'est pas perdue et l'utilisateur y revient après connexion.

Une version intermédiaire y avait ajouté un `fetch('/api/auth-status')` : elle
a cassé le bookmarklet en silence et a été retirée avec sa route. Les trois
raisons sont documentées en tête de `src/lib/bookmarklet.ts` — les lire avant
toute retouche de cette chaîne.

## Les deux migrations, et pourquoi elles sont séparées

| Migration | Contenu | Quand l'exécuter |
|---|---|---|
| `0008_auth_multi_user.sql` | `profiles`, `user_id` **nullable** sur `apartments` et `app_settings`, backfill, trigger d'inscription, policies RLS | Lot 1 — maintenant |
| `0009_user_id_not_null.sql` | `user_id` **not null**, refonte de la PK de `app_settings`, trigger étendu | **Fin du lot 3 seulement** |

⚠️ **Exécuter la 0009 trop tôt casse l'app**, de deux façons indépendantes :

1. `apartments.user_id not null` → `createApartment()` ne renseigne pas la
   colonne : toute création de bien échoue.
2. `drop column app_settings.id` → `getSettings()` et `updateSettings()` lisent
   `.eq("id", 1)` : toute lecture de réglages échoue.

C'est la règle générale derrière ce découpage : **on ne change une table que
dans le même mouvement que le code qui la lit.**

**Prérequis de la 0008** : au moins un compte doit exister dans `auth.users`
avant de la lancer (elle s'arrête avec un message sinon). Le créer à la main :
Dashboard Supabase → Authentication → Users → « Add user », avec « Auto
Confirm User ».

## Ce que le backfill rattache

Les biens et les réglages existants vont au **plus ancien compte**
(`order by created_at limit 1`) — celui qui utilisait l'app en mono-utilisateur.
Les migrations sont exécutées **à la main sur CHAQUE projet** (dev et prod) :
dev d'abord, vérification, puis prod.

## `profiles` : deux colonnes qui préparent la monétisation

`plan` (`'free'` | `'pro'`) et `analyses_ce_mois` + `periode_compteur`.

Le compteur n'est pas décoratif : l'analyse IA appelle Gemini, **seul coût
variable de l'app**. Il sert trois fois — protection contre l'abus, mesure
avant de fixer un prix, et levier de monétisation.
