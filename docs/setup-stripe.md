# Brancher Stripe — ce qui reste à faire

> Le code est écrit et compile. Il reste **cinq étapes** qui se font hors du
> dépôt : une migration SQL, deux réglages dans Stripe, un test de bout en
> bout, puis la mise en production.

---

## Vue d'ensemble du flux

```
Utilisateur clique « Passer à Pro »
   │
   ▼
Payment Link Stripe  ?client_reference_id=<uuid du compte>
   │
   ├──► navigateur ──► /upgrade/success        (affichage seulement)
   │
   └──► serveur Stripe ──► POST /api/stripe/webhook   ← LA source de vérité
                              │
                              ▼
                     profiles.plan = 'pro'
```

Les deux flèches du bas sont **parallèles**. Le navigateur peut arriver sur
`/upgrade/success` avant que le webhook n'ait basculé le compte : la page lit
le plan réel et affiche « activation en cours » plutôt que d'affirmer un
succès qu'elle ne peut pas constater.

⚠️ **Le plan ne se met jamais à jour depuis le navigateur.** Une redirection
prouve seulement qu'une page a été ouverte — elle peut l'être à la main. Seul
l'appel signé de Stripe atteste d'un paiement.

---

## Étape 1 — Migration `0010_stripe_customer.sql`

Ajoute `profiles.stripe_customer_id`. **Sans elle, une résiliation ne peut
être rattachée à aucun compte** : l'événement `customer.subscription.deleted`
ne porte que l'identifiant client Stripe, jamais notre `client_reference_id`.
Un abonnement annulé resterait `pro` indéfiniment.

Dans **Supabase → SQL Editor**, sur le projet **dev** d'abord :

```sql
alter table public.profiles
  add column if not exists stripe_customer_id text;

create unique index if not exists profiles_stripe_customer_id_key
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;
```

Vérifier, puis rejouer **à l'identique sur le projet prod**. Comme toutes les
migrations de ce projet, elle est manuelle et à passer sur les deux bases.

---

## Étape 2 — Rediriger le Payment Link vers `/upgrade/success`

Dans **Stripe Dashboard → Payment links** → ouvrir le lien de test →
**Modifier** → section « Après le paiement » :

- choisir **« Rediriger les clients vers votre site web »**
- URL : `http://localhost:3000/upgrade/success` (pour tester en local)

Sans ce réglage, Stripe affiche sa propre page de confirmation et
l'utilisateur ne revient jamais dans l'app.

> En production, cette URL devra pointer vers le domaine réel. Un Payment Link
> ne porte qu'une seule URL de retour : prévoir **un lien de test** et **un
> lien de production** distincts, chacun avec son URL.

---

## Étape 3 — Récupérer `STRIPE_WEBHOOK_SECRET`

C'est la seule variable encore vide dans `.env.local`. Elle sert à vérifier
que l'appel vient bien de Stripe — sans elle, n'importe qui pourrait faire
passer un compte en Pro en appelant l'URL du webhook.

### En local — Stripe CLI

```bash
brew install stripe/stripe-cli/stripe
```

```bash
stripe login
```

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

La commande affiche au démarrage :

```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxx
```

Copier cette valeur dans `.env.local` :

```
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
```

Puis **redémarrer le serveur de dev** (les variables d'environnement ne sont
lues qu'au démarrage).

⚠️ Laisser `stripe listen` tourner dans son terminal pendant tous les tests :
c'est lui qui relaie les événements vers `localhost`, autrement injoignable
depuis les serveurs de Stripe.

### En production — Dashboard

**Développeurs → Webhooks → Ajouter un point de terminaison**

- URL : `https://<ton-domaine>/api/stripe/webhook`
- Événements à écouter — exactement ces deux :
  - `checkout.session.completed`
  - `customer.subscription.deleted`

Stripe affiche alors un **secret de signature** (`whsec_…`), différent de
celui du CLI. C'est lui qui va dans les variables d'environnement de
production.

---

## Étape 4 — Tester de bout en bout

Avec `stripe listen` actif et le serveur de dev relancé :

1. Se connecter avec un compte dont le plan est `free`
2. Créer un premier bien → doit passer
3. Tenter d'en créer un second → doit atterrir sur **`/upgrade/bien-limite`**
4. Cliquer **« Passer à Pro »**
5. Payer avec la carte de test : `4242 4242 4242 4242`, date d'expiration
   future quelconque, CVC quelconque
6. Retour sur `/upgrade/success`
7. Le terminal `stripe listen` affiche `checkout.session.completed`
8. Le terminal du serveur affiche `[stripe] compte passé en pro <uuid>`
9. Aller sur `/compte` → la carte « Plan » indique **Pro**
10. Créer un second bien → doit passer

### Si le compte ne bascule pas

| Symptôme | Cause probable |
|---|---|
| `stripe listen` ne montre aucun événement | Le paiement n'est pas allé au bout, ou le CLI écoute un autre compte Stripe |
| `[stripe] signature invalide` | `STRIPE_WEBHOOK_SECRET` erroné, ou serveur non redémarré après édition de `.env.local` |
| `[stripe] checkout sans client_reference_id` | Le bouton a été contourné (lien Stripe ouvert directement, sans le paramètre) |
| `column "stripe_customer_id" does not exist` | Étape 1 non faite |

Le webhook répond **500** en cas d'échec de traitement, ce qui déclenche un
**rejeu automatique par Stripe**. Le traitement est idempotent (il écrit une
valeur fixe, il n'incrémente rien) : un rejeu est sans risque.

---

## Étape 5 — Passer en production

### Variables d'environnement à déclarer sur l'hébergeur

| Variable | Où la trouver |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe → Développeurs → Clés API — la clé **live** (`sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | Le secret du point de terminaison créé à l'étape 3 |
| `NEXT_PUBLIC_STRIPE_PAYMENT_LINK` | Le Payment Link **live**, avec l'URL de retour du domaine de production |

### Avant d'activer les paiements réels

- [ ] Migration 0010 passée sur la base **prod**
- [ ] Produit « Pro » recréé en mode **live** (les objets de test ne migrent
      pas — c'est un compte séparé de fait)
- [ ] Point de terminaison webhook créé en mode **live**
- [ ] Un paiement réel de bout en bout, puis remboursé depuis le Dashboard
- [ ] Une **résiliation** testée : annuler l'abonnement dans le Dashboard et
      vérifier que le compte redescend en `free`

### Sur les clés

Les clés de test actuellement dans `.env.local` (`sk_test_…`) ne peuvent
mouvoir aucun argent réel. Les clés **live** (`sk_live_…`), elles, le peuvent :
elles ne doivent jamais apparaître dans un fichier versionné, un ticket, ni
un message. `.env*` est déjà couvert par `.gitignore`.

Si une clé secrète a été exposée d'une façon ou d'une autre, la révoquer dans
**Stripe → Développeurs → Clés API → Faire tourner la clé** — c'est immédiat
et gratuit.

---

## Ce que le code fait déjà

| Fichier | Rôle |
|---|---|
| `src/app/api/stripe/webhook/route.ts` | Vérifie la signature, bascule `plan` en `pro` / `free` |
| `src/components/UpgradeScreen.tsx` | Gabarit des écrans d'upgrade + offre + bouton Stripe |
| `src/app/upgrade/bien-limite/page.tsx` | 2e bien refusé sur un compte gratuit |
| `src/app/upgrade/analyse-limite/page.tsx` | Quota mensuel d'analyses atteint |
| `src/app/upgrade/success/page.tsx` | Retour de paiement, lit le plan réel |
| `src/lib/db.ts` | `QuotaDepasseError`, gates `LIMITE_BIENS_FREE` / `LIMITE_ANALYSES_PRO` |
| `src/lib/quota.ts` | Côté client : suit la `redirection` d'un 403 |
| `supabase/migrations/0010_stripe_customer.sql` | La migration de l'étape 1 |
