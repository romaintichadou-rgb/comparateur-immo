-- Ajoute la persistance des hypothèses de l'onglet Simulation financière
-- (crédit, revalorisations), pour que le bloc "Simulation financière" de
-- l'Analyse IA se base sur ce que l'utilisateur a réellement modélisé,
-- plutôt que toujours sur les hypothèses par défaut.
-- À exécuter dans le SQL Editor de CHAQUE projet Supabase (prod et dev).

alter table apartments
  add column if not exists simulation_inputs jsonb;
