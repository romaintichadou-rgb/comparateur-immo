-- Détail structuré du calcul de loyer (résidu IA, critères qualitatifs
-- retenus, typologie ANIL utilisée, loyer déterministe avant résidu) —
-- persisté en JSON pour que le panneau de détail puisse le rejouer sans
-- refaire l'appel Gemini. Écrit UNIQUEMENT par /api/estimate-rent, jamais
-- via les formulaires (même statut que analyse_ia). Voir LoyerCalcul dans
-- src/lib/rentEstimation.ts.
-- À exécuter dans le SQL Editor de CHAQUE projet Supabase (prod et dev).

alter table apartments
  add column if not exists loyer_calcul jsonb;
