-- Profil emprunteur dans le Profil investisseur : taux, durée, assurance, TMI
-- et mode de financement deviennent des réglages GLOBAUX dont chaque bien
-- hérite (voir `resolveInputs` dans src/lib/simulation.ts).
-- À exécuter dans le SQL Editor de CHAQUE projet Supabase (prod et dev).

alter table app_settings
  add column if not exists taux_credit_pct numeric not null default 3.5,
  add column if not exists duree_annees smallint not null default 25,
  add column if not exists taux_assurance_pct numeric not null default 0.3,
  add column if not exists tmi_pct smallint not null default 30,
  add column if not exists financement_mode text not null default 'hors_notaire';

alter table app_settings
  drop constraint if exists app_settings_financement_mode_check;
alter table app_settings
  add constraint app_settings_financement_mode_check
  check (financement_mode in ('cout_total', 'hors_notaire'));

-- Table rase sur les biens : les valeurs stockées dans `simulation_inputs`
-- n'ont jamais été choisies délibérément, elles ne sont que l'ancien
-- `defaultInputs()` persisté au passage. On supprime les CLÉS (et non on les
-- met à null) — `resolveInputs` traite l'absence comme l'héritage.
update apartments
set simulation_inputs = simulation_inputs
    - 'tauxCreditPct' - 'dureeAnnees' - 'tauxAssurancePct' - 'tmiPct'
where simulation_inputs is not null;
