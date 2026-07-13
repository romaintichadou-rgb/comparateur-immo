/**
 * Mémoïsation process-lifetime pour les sources de l'Analyse IA : ces jeux de
 * données publics (DVF, SSMSI, INSEE, OSM...) évoluent à l'année, pas à la
 * minute — re-télécharger les mêmes données à chaque relance d'analyse ne
 * fait que ralentir l'utilisateur et solliciter des APIs publiques gratuites.
 *
 * Seuls les résultats jugés exploitables (prédicat `cacheable`) sont mis en
 * cache : un échec réseau ou une réponse vide n'est JAMAIS mémorisé, pour
 * qu'une relance d'analyse puisse retenter sa chance — c'est précisément un
 * des usages du bouton "Relancer".
 */
export function memoAsync<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  key: (...args: A) => string,
  cacheable: (result: R) => boolean
): (...args: A) => Promise<R> {
  const cache = new Map<string, R>();
  return async (...args: A): Promise<R> => {
    const k = key(...args);
    if (cache.has(k)) return cache.get(k) as R;
    const result = await fn(...args);
    if (cacheable(result)) cache.set(k, result);
    return result;
  };
}
