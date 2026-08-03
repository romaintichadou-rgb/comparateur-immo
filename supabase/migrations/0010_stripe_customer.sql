-- Rattachement d'un compte à son client Stripe.
--
-- Pourquoi cette colonne est indispensable et pas un confort :
-- l'événement `checkout.session.completed` porte notre `client_reference_id`
-- (l'uuid du compte), mais `customer.subscription.deleted` — celui qui doit
-- REDESCENDRE le compte en `free` à la résiliation — ne porte QUE
-- l'identifiant client Stripe. Sans la correspondance stockée ici, une
-- résiliation ne pourrait être rattachée à aucun compte, et un abonnement
-- annulé resterait `pro` indéfiniment.
--
-- Comme toutes les migrations du projet : à exécuter À LA MAIN dans le SQL
-- Editor de CHAQUE projet Supabase (dev d'abord, vérification, puis prod).

alter table public.profiles
  add column if not exists stripe_customer_id text;

-- Unique : un client Stripe ne peut appartenir qu'à un compte. Un doublon
-- signifierait qu'un paiement peut faire basculer le mauvais profil.
create unique index if not exists profiles_stripe_customer_id_key
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;
