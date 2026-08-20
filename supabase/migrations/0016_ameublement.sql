-- Ajoute le coût d'ameublement, un poste d'acquisition distinct des travaux.
-- Défaut 0 (pas null) : contrairement à travaux/frais de notaire, l'absence
-- de saisie signifie "pas de dépense", pas "non renseigné".
-- À exécuter dans le SQL Editor de CHAQUE projet Supabase (prod et dev).

alter table apartments
  add column if not exists ameublement numeric not null default 0;
