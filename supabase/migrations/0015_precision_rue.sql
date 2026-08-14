-- Ajoute le niveau de précision « rue » à `precision_localisation`.
--
-- La BAN distingue trois granularités (`type` de la réponse) : `housenumber`
-- (le bâtiment), `street` (le milieu de la voie), `locality`/`municipality`
-- (le centre du quartier ou de la commune). Les deux dernières étaient
-- écrasées sur la même valeur `arrondissement`, ce qui rendait indiscernables
-- deux situations très différentes : « milieu de la rue de Thumesnil » et
-- « centre de Lille » (plusieurs kilomètres d'écart).
--
-- Conséquence corrigée : les sources ponctuelles (OpenStreetMap, aléa argile
-- de Géorisques) tournaient autour du centroïde communal et présentaient le
-- résultat comme un fait sur le bien. Mesuré à Lille : argile « faible » rue
-- de Thumesnil, « moyenne » au centroïde de la commune.
--
-- Aucune donnée à migrer : on élargit seulement le domaine autorisé. Les
-- lignes existantes en `arrondissement` restent valides et seront reclassées
-- en `rue` au prochain géocodage (relance d'analyse ou modification d'une
-- ligne d'adresse).

alter table apartments
  drop constraint if exists apartments_precision_localisation_check;

alter table apartments
  add constraint apartments_precision_localisation_check
  check (precision_localisation in ('exacte', 'rue', 'arrondissement'));
