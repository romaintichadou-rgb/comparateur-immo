-- Compteur de biens par profil : permet de voir d'un coup d'œil combien de
-- biens chaque compte possède, sans requête de comptage.
--
-- Initialisé par un backfill sur les données existantes. Maintenu par le code
-- applicatif (createApartment +1, deleteApartment -1).
--
-- Comme toutes les migrations du projet : à exécuter À LA MAIN dans le SQL
-- Editor de CHAQUE projet Supabase (dev d'abord, vérification, puis prod).

alter table public.profiles
  add column if not exists nb_biens integer not null default 0;

-- Backfill : compter les biens existants par compte.
update public.profiles p
set nb_biens = (
  select count(*)::int
  from public.apartments a
  where a.user_id = p.id
);
