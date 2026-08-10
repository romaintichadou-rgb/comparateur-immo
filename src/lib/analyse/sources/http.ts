/**
 * Accès HTTP mutualisé des sources de l'Analyse IA.
 *
 * Les six sources (DVF, Géorisques, ADEME, délinquance, démographie, OSM) plus
 * le géocodage BAN faisaient chacune leur propre copie du même `fetchJson` :
 * même `AbortController`, même timeout, même `catch → null`. Un seul endroit
 * désormais — c'est aussi le seul endroit où régler la politique de cache.
 *
 * ## Pourquoi la dégradation silencieuse en `null`
 *
 * Aucune de ces sources n'est indispensable : un bloc sans données s'affiche
 * "non disponible" plutôt que de faire échouer l'analyse entière. Une panne
 * réseau, un 5xx ou un JSON illisible se valent donc tous — d'où le `null`
 * unique, sans distinction d'erreur.
 *
 * ## Cache : le Data Cache de Next, pas une Map en mémoire
 *
 * ⚠️ Ces jeux de données publics évoluent à l'ANNÉE (millésimes DVF, SSMSI,
 * INSEE, ANIL). La mémoïsation précédente (`memo.ts`) vivait dans une `Map`
 * du process : perdue à chaque démarrage à froid, jamais partagée entre deux
 * instances, et non bornée. `next: { revalidate }` la remplace par un cache
 * persistant et partagé, qui survit aux redéploiements.
 *
 * Trois propriétés du Data Cache rendent le prédicat `cacheable` de `memo.ts`
 * inutile (vérifié dans `next/dist/server/lib/patch-fetch.js`) :
 * - seules les réponses **200** sont mises en cache — un 5xx ou un timeout
 *   reste donc retentable à la relance suivante, ce qui était précisément
 *   l'usage du bouton « Relancer » ;
 * - seules les requêtes **GET/HEAD** le sont — c'est pourquoi `osm.ts`
 *   interroge Overpass en GET (`?data=`) et non plus en POST ;
 * - un en-tête `authorization` ou `cookie` désactive le cache — aucune de ces
 *   APIs publiques n'en envoie.
 *
 * Reste un cas non couvert, assumé : une source qui répondrait 200 avec un
 * corps vide (panne partielle en amont) verrait ce vide mémorisé pour la durée
 * ci-dessous. C'est le prix de la simplicité, et `CACHE_SOURCES_S` est calibré
 * en semaines, pas en mois, pour que la fenêtre reste courte devant le rythme
 * de publication annuel des données.
 */

/**
 * Durée de vie par défaut d'une réponse de source, en secondes (30 jours).
 * Volontairement UNE seule valeur : distinguer "DVF 2014-2016 est immuable"
 * de "le revenu médian bouge une fois par an" produirait une table de durées
 * que personne ne tiendrait à jour, pour un gain nul — au-delà de quelques
 * jours, tout le bénéfice (ne pas re-télécharger entre deux analyses du même
 * bien) est déjà acquis.
 */
export const CACHE_SOURCES_S = 60 * 60 * 24 * 30;

export interface OptionsJson {
  /** Abandon de la requête au-delà de ce délai. Défaut : 12 s. */
  timeoutMs?: number;
  /** Durée de vie dans le Data Cache Next. `0` pour ne pas cacher. */
  revalidate?: number;
  headers?: Record<string, string>;
  /**
   * Signal parent, combiné au timeout ci-dessus : sert à la course de miroirs
   * d'`osm.ts` (annuler les requêtes doublées dès qu'une a répondu).
   */
  signal?: AbortSignal;
}

/**
 * GET JSON défensif : `null` sur tout échec (réseau, statut non-2xx, timeout,
 * JSON illisible). Ne lève jamais.
 */
export async function getJson<T>(url: string, options: OptionsJson = {}): Promise<T | null> {
  const { timeoutMs = 12000, revalidate = CACHE_SOURCES_S, headers, signal } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers,
      signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal,
      next: { revalidate },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
