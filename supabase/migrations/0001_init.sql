-- Comparateur locatif — schéma initial Supabase.
-- À exécuter tel quel dans le SQL Editor de CHAQUE projet Supabase (prod et
-- dev) : le schéma doit être identique dans les deux.

create table if not exists apartments (
  id uuid primary key default gen_random_uuid(),

  -- Identification
  url text not null default '',
  plateforme text not null default 'Manuel'
    check (plateforme in ('Leboncoin', 'SeLoger', 'PAP', 'Orpi', 'Manuel')),
  description text not null default '',
  date_ajout timestamptz not null default now(),
  statut text not null default 'à visiter'
    check (statut in ('à visiter', 'visité', 'abandonné', 'acheté')),

  -- Localisation
  adresse text not null default '',
  quartier text not null default '',
  ville text not null default '',
  code_postal text not null default '',
  code_insee text not null default '',
  latitude double precision,
  longitude double precision,
  precision_localisation text check (precision_localisation in ('exacte', 'arrondissement')),

  -- Caractéristiques du bien
  type_bien text not null default 'Appartement',
  surface_m2 numeric,
  nb_pieces integer,
  nb_chambres integer,
  etage text not null default '',
  ascenseur boolean,
  annee_construction integer,
  etat_bien text not null default '',
  dpe text not null default '',
  ges text not null default '',

  -- Financier — achat
  prix numeric,
  frais_notaire_estimes numeric,
  travaux numeric,

  -- Financier — location
  loyer_retenu numeric,
  loyer_justification text not null default '',

  -- Financier — charges annuelles
  charges_copro_annuelles numeric,
  taxe_fonciere numeric,
  assurance_annuelle numeric,
  hypothese_gestion_pct numeric not null default 5,

  -- Notes
  notes text not null default '',
  score_coup_de_coeur integer check (score_coup_de_coeur between 1 and 5),
  photo_url text not null default '',

  -- Contact
  contact_nom text not null default '',
  contact_telephone text not null default '',
  contact_email text not null default '',

  -- Suivi des champs modifiés manuellement (désactive le badge "estimé")
  champs_manuels text[] not null default '{}',

  -- Analyse IA complète (blocs, faits, narration, score) — structure libre
  analyse_ia jsonb
);

create index if not exists apartments_date_ajout_idx on apartments (date_ajout);

alter table apartments enable row level security;
-- Aucune policy publique : seule la service_role key (utilisée uniquement
-- côté serveur Next.js) peut lire/écrire, via le bypass RLS natif de
-- Supabase pour ce rôle. À affiner avec des policies par utilisateur quand
-- l'authentification sera ajoutée.

-- Réglages personnels (seuils vert/ambre/rouge) : une seule ligne, id fixe.
create table if not exists app_settings (
  id smallint primary key default 1 check (id = 1),
  rendement_seuil_vert_pct numeric not null default 5.5,
  rendement_seuil_rouge_pct numeric not null default 4,
  cashflow_seuil_vert_euros numeric not null default 0,
  cashflow_seuil_rouge_euros numeric not null default -200
);

insert into app_settings (id)
values (1)
on conflict (id) do nothing;

alter table app_settings enable row level security;
