-- Ajoute le nombre de lots d'un bien — pertinent uniquement pour un Immeuble
-- (de rapport) : guide l'estimation du loyer total et de l'assurance, et
-- permet d'afficher un loyer/lot. null pour un logement unique.
-- À exécuter dans le SQL Editor de CHAQUE projet Supabase (prod et dev).

alter table apartments
  add column if not exists nb_lots integer;
