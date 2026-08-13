-- Cache du calcul de charges (empreinte pour skip Gemini si rien n'a changé,
-- même pattern que loyer_calcul). Écrit UNIQUEMENT par /api/estimate-charges
-- et /api/apartments/[id]/recalc, jamais via les formulaires.
-- À exécuter dans le SQL Editor de CHAQUE projet Supabase (prod et dev).

alter table apartments
  add column if not exists charges_calcul jsonb;
