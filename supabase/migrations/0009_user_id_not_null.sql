-- Lot 3 (fin) — Durcissement : `user_id` devient la clé de tout.
--
-- ⚠️ NE PAS EXÉCUTER EN MÊME TEMPS QUE LA 0008.
--
-- Cette migration est séparée pour une raison précise, pas par prudence
-- rituelle. Elle fait deux choses qui, exécutées trop tôt, cassent l'app :
--
--   1. `apartments.user_id` en `not null` → toute création de bien échoue
--      tant que `createApartment()` (src/lib/db.ts) n'envoie pas la colonne ;
--   2. suppression de `app_settings.id` → `getSettings()` et
--      `updateSettings()` échouent tant qu'ils lisent `.eq("id", 1)`.
--
-- À exécuter quand les DEUX conditions sont réunies :
--   • le lot 3 est terminé : `db.ts` renseigne `user_id` à la création et
--     lit les réglages par `user_id` ;
--   • la requête de contrôle en bas de la 0008 renvoie 0 bien sans
--     propriétaire.
--
-- Transactionnelle : à la moindre erreur, tout est annulé.

begin;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Garde-fou : sans lui, l'erreur Postgres serait exacte mais muette sur
--    la marche à suivre.
-- ──────────────────────────────────────────────────────────────────────────
do $$
declare
  orphelins integer;
begin
  select count(*) into orphelins from apartments where user_id is null;
  if orphelins > 0 then
    raise exception
      'Migration annulée : % bien(s) sans propriétaire. Rattache-les (update apartments set user_id = ''<uuid>'' where user_id is null) ou supprime-les, puis relance.',
      orphelins;
  end if;

  select count(*) into orphelins from app_settings where user_id is null;
  if orphelins > 0 then
    raise exception
      'Migration annulée : % ligne(s) de réglages sans propriétaire.', orphelins;
  end if;
end $$;


-- ──────────────────────────────────────────────────────────────────────────
-- 2. `apartments.user_id` obligatoire
-- ──────────────────────────────────────────────────────────────────────────
alter table apartments alter column user_id set not null;


-- ──────────────────────────────────────────────────────────────────────────
-- 3. `app_settings` : de la ligne unique à une ligne par utilisateur.
--
--    La table est née avec `id smallint primary key check (id = 1)` — un
--    profil investisseur unique pour toute l'app. Trois obstacles à lever,
--    dans cet ordre : la contrainte CHECK, la clé primaire, la colonne.
-- ──────────────────────────────────────────────────────────────────────────

-- La contrainte CHECK porte un nom généré par Postgres (`app_settings_id_check`
-- en principe). On la retrouve par son EXPRESSION plutôt que de parier sur ce
-- nom : une base créée à la main pourrait l'avoir nommée autrement, et un
-- `drop constraint` sur un nom inexistant ferait échouer toute la migration.
do $$
declare
  nom_contrainte text;
begin
  select con.conname into nom_contrainte
  from pg_constraint con
  join pg_class cls on cls.oid = con.conrelid
  where cls.relname = 'app_settings'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%id = 1%';

  if nom_contrainte is not null then
    execute format('alter table app_settings drop constraint %I', nom_contrainte);
  end if;
end $$;

-- Bascule de la clé primaire, seulement si elle n'a pas déjà eu lieu (le bloc
-- rend la migration relançable).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'app_settings' and column_name = 'id'
  ) then
    alter table app_settings drop constraint app_settings_pkey;
    alter table app_settings add primary key (user_id);
    alter table app_settings drop column id;
  end if;
end $$;

-- `add primary key` a créé son propre index (`app_settings_pkey`). L'index
-- unique posé par la 0008 ferait donc doublon : même colonne, même unicité,
-- deux structures à maintenir à chaque écriture.
drop index if exists app_settings_user_id_key;


-- ──────────────────────────────────────────────────────────────────────────
-- 4. Le trigger d'inscription peut enfin provisionner les réglages
--    (la contrainte `check (id = 1)` l'en empêchait jusqu'ici).
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.app_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Rattrapage pour les comptes créés entre la 0008 et la 0009.
insert into app_settings (user_id)
select u.id from auth.users u
on conflict (user_id) do nothing;

commit;
