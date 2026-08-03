/**
 * Côté client : reconnaître une réponse « limite de plan atteinte ».
 *
 * Les routes d'API renvoient un 403 accompagné d'un champ `redirection`
 * (voir `QuotaDepasseError` dans `db.ts` et `reponseErreur`). Atteindre une
 * limite n'est pas une erreur de l'utilisateur : afficher un bandeau rouge
 * sur un geste légitime le culpabilise pour une contrainte commerciale. On
 * l'emmène donc sur l'écran qui explique la limite et ce qu'elle débloque.
 *
 * Ce helper existe pour que les quatre appels concernés (création de bien,
 * lancement et relance d'analyse) traitent le cas de la même façon —
 * l'oublier quelque part rendrait le blocage muet à cet endroit.
 */
export function redirectionQuota(reponse: Response, corps: unknown): string | null {
  if (reponse.status !== 403) return null;
  if (typeof corps !== "object" || corps === null) return null;

  const redirection = (corps as { redirection?: unknown }).redirection;
  // Seul un chemin interne est suivi : le corps d'une réponse ne doit jamais
  // pouvoir décider d'une navigation vers un domaine tiers.
  if (typeof redirection !== "string") return null;
  if (!redirection.startsWith("/") || redirection.startsWith("//")) return null;

  return redirection;
}
