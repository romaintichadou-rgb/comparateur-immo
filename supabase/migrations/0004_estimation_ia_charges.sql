-- Estimation IA des charges annuelles (charges copro/exploitation + taxe
-- foncière) : ajoute leurs justifications (mêmes conventions que
-- loyer_justification) et le suivi champs_estimes_ia, qui distingue "valeur
-- issue de la formule déterministe locale" (recalculée à chaque lecture) de
-- "valeur issue d'une estimation IA" (figée jusqu'à réestimation ou édition
-- manuelle) — voir estimates.ts::applyLiveEstimates.
-- À exécuter dans le SQL Editor de CHAQUE projet Supabase (prod et dev).

alter table apartments
  add column if not exists charges_justification text not null default '',
  add column if not exists taxe_fonciere_justification text not null default '',
  add column if not exists champs_estimes_ia text[] not null default '{}';
