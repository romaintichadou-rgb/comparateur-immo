-- Lot 1 — Socle multi-utilisateurs : profils, propriété des biens, RLS.
--
-- À exécuter dans le SQL Editor de CHAQUE projet Supabase (dev PUIS prod),
-- comme toutes les migrations de ce projet.
--
-- ⚠️ PRÉREQUIS : au moins un utilisateur doit exister dans `auth.users` AVANT
-- de lancer ce script. Sinon il s'arrête avec un message explicite, sans rien
-- modifier. Pour créer le premier compte sans attendre l'UI de connexion
-- (lot 2) : Dashboard Supabase → Authentication → Users → « Add user »
-- (coche « Auto Confirm User »).
--
-- ── Ce que fait ce script ────────────────────────────────────────────────
--   1. table `profiles` (plan + compteur d'analyses IA)
--   2. `apartments.user_id` et `app_settings.user_id`, NULLABLES à ce stade
--   3. rattachement des données existantes au plus ancien compte
--   4. création automatique du profil à chaque inscription
--   5. policies RLS sur les trois tables
--
-- ── Ce que ce script NE fait PAS, volontairement ─────────────────────────
-- Il ne touche ni à la clé primaire de `app_settings`, ni à sa contrainte
-- `check (id = 1)`, ni au caractère nullable de `apartments.user_id`.
--
-- Raison : `db.ts` lit encore les réglages par `.eq("id", 1)` et crée les
-- biens sans `user_id`. Basculer la structure maintenant casserait la lecture
-- des réglages ET la création de biens dès l'exécution du script, alors que
-- les lots 2 et 3 ne sont pas faits. On ne change une table que dans le même
-- mouvement que le code qui la lit : c'est l'objet de la migration 0009.
--
-- Après ce script, l'app fonctionne EXACTEMENT comme avant — elle utilise la
-- service_role key, qui contourne RLS par design. Les policies ci-dessous ne
-- prendront effet qu'au lot 3, quand les requêtes passeront par la session de
-- l'utilisateur. C'est le comportement attendu, pas un échec.
--
-- Idempotent : relançable sans dommage.

begin;

-- ──────────────────────────────────────────────────────────────────────────
-- 0. Garde-fou : refuser de tourner sans compte cible pour le rattachement.
-- ──────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from auth.users) then
    raise exception
      'Aucun utilisateur dans auth.users. Crée d''abord ton compte (Dashboard → Authentication → Users → Add user), puis relance ce script.';
  end if;
end $$;


-- ──────────────────────────────────────────────────────────────────────────
-- 1. Profils applicatifs
--    `id` référence directement auth.users : pas de clé technique en double.
--    Le compteur d'analyses sert au quota (lot 5) et mesure le seul coût
--    variable de l'app — l'appel Gemini.
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  analyses_ce_mois integer not null default 0,
  -- Premier jour du mois couvert par le compteur. La remise à zéro comparera
  -- cette date au mois courant, plutôt que de dépendre d'une tâche planifiée.
  periode_compteur date not null default date_trunc('month', now())::date,
  created_at timestamptz not null default now()
);


-- ──────────────────────────────────────────────────────────────────────────
-- 2. Propriété des données
--    Nullables ici : le code ne renseigne pas encore ces colonnes (lot 3).
-- ──────────────────────────────────────────────────────────────────────────
alter table apartments
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

-- Toutes les requêtes filtreront sur cette colonne dès le lot 3 : sans index,
-- chaque lecture devient un parcours complet de table.
create index if not exists apartments_user_id_idx on apartments (user_id);

alter table app_settings
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

-- Un compte = au plus une ligne de réglages. Cet index unique est ce qui
-- permettra à la 0009 de promouvoir `user_id` en clé primaire sans surprise,
-- et il rend dès maintenant le `on conflict (user_id)` utilisable.
create unique index if not exists app_settings_user_id_key on app_settings (user_id);


-- ──────────────────────────────────────────────────────────────────────────
-- 3. Rattachement des données existantes
--    Le plus ancien compte = celui qui utilisait l'app en mono-utilisateur.
-- ──────────────────────────────────────────────────────────────────────────
update apartments
set user_id = (select id from auth.users order by created_at limit 1)
where user_id is null;

update app_settings
set user_id = (select id from auth.users order by created_at limit 1)
where user_id is null;

-- Profils pour les comptes déjà créés : le trigger ci-dessous ne couvre que
-- les inscriptions à venir, or le premier compte est créé à la main.
insert into profiles (id)
select u.id from auth.users u
on conflict (id) do nothing;


-- ──────────────────────────────────────────────────────────────────────────
-- 4. Provisionnement automatique à l'inscription
--
--    `security definer` : la fonction s'exécute avec les droits de son
--    propriétaire — l'utilisateur qui s'inscrit n'a aucun droit d'écriture
--    sur `profiles` au moment où le trigger se déclenche.
--
--    Le trigger ne crée PAS de ligne `app_settings` : la contrainte
--    `check (id = 1)` l'interdit tant que la 0009 n'est pas passée. Ce n'est
--    pas un manque — `rowToSettings(null)` (db.ts) retombe déjà proprement
--    sur DEFAULT_SETTINGS quand la ligne est absente. La 0009 étendra ce
--    trigger.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ──────────────────────────────────────────────────────────────────────────
-- 5. Row Level Security
--
--    Jusqu'ici RLS était activé SANS aucune policy : tout passait par la
--    service_role key, qui contourne RLS par design. La sécurité tenait donc
--    au seul secret de cette clé.
--
--    Ces policies rendent la base capable de refuser elle-même un accès
--    croisé : à partir du lot 3, un `user_id` oublié dans une requête
--    renverra zéro ligne au lieu d'exposer les données d'un autre compte.
--
--    `(select auth.uid())` plutôt que `auth.uid()` nu : la sous-requête est
--    évaluée une fois par requête au lieu d'une fois par ligne.
-- ──────────────────────────────────────────────────────────────────────────
alter table profiles enable row level security;
alter table apartments enable row level security;
alter table app_settings enable row level security;

drop policy if exists "profil : lecture de son propre profil" on profiles;
create policy "profil : lecture de son propre profil"
  on profiles for select using ((select auth.uid()) = id);

drop policy if exists "profil : mise à jour de son propre profil" on profiles;
create policy "profil : mise à jour de son propre profil"
  on profiles for update using ((select auth.uid()) = id);
-- Pas de policy INSERT/DELETE sur `profiles` : la création passe par le
-- trigger (`security definer`), la suppression par la cascade sur auth.users.

drop policy if exists "biens : accès à ses propres biens" on apartments;
create policy "biens : accès à ses propres biens"
  on apartments for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "réglages : accès à ses propres réglages" on app_settings;
create policy "réglages : accès à ses propres réglages"
  on app_settings for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

commit;


-- ──────────────────────────────────────────────────────────────────────────
-- Vérification — à lancer après le script.
-- Attendu : autant de profils que de comptes, aucun bien sans propriétaire.
-- ──────────────────────────────────────────────────────────────────────────
-- select
--   (select count(*) from auth.users)                          as comptes,
--   (select count(*) from profiles)                            as profils,
--   (select count(*) from apartments)                          as biens,
--   (select count(*) from apartments where user_id is null)    as biens_sans_proprietaire,
--   (select count(*) from app_settings where user_id is null)  as reglages_sans_proprietaire;
