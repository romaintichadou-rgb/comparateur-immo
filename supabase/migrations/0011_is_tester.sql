-- Flag "testeur" : bypass les limites d'abonnement (plan toujours considéré
-- comme pro, compteur d'analyses non décompté). Réservé aux comptes internes.
--
-- Comme toutes les migrations du projet : à exécuter À LA MAIN dans le SQL
-- Editor de CHAQUE projet Supabase (dev d'abord, vérification, puis prod).

alter table public.profiles
  add column if not exists is_tester boolean not null default false;
