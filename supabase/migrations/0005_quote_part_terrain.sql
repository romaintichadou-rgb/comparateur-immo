-- Ajoute la quote-part terrain (% du prix non amortissable en LMNP).
-- Défaut null = calcul automatique selon la zone (urbain/rural).
-- À exécuter dans le SQL Editor de CHAQUE projet Supabase (prod et dev).

alter table apartments
  add column if not exists quote_part_terrain_pct real;
