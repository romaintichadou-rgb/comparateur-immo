const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface FetchResult {
  ok: boolean;
  blocked: boolean;
  status: number;
  html: string;
  reason?: string;
}

const BLOCK_SIGNATURES = [
  "captcha",
  "checking your browser",
  "access denied",
  "datadome",
  "cf-mitigated",
  "attention required",
  "just a moment",
  "pardon our interruption",
];

/**
 * Récupère le HTML d'une page d'annonce en se faisant passer pour un
 * navigateur, et détecte les principaux dispositifs anti-bot (Cloudflare,
 * DataDome...) plutôt que de laisser planter le parsing sur une page de
 * challenge. Les sites cibles (Leboncoin, SeLoger, PAP, Orpi) bloquent tous
 * à des degrés divers les requêtes serveur-à-serveur : ceci est **attendu**,
 * pas un bug — voir le fallback de saisie manuelle dans l'UI.
 */
export async function fetchListingHtml(url: string): Promise<FetchResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        "Accept-Language": "fr-FR,fr;q=0.9",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
      redirect: "follow",
    });
  } catch (err) {
    return {
      ok: false,
      blocked: false,
      status: 0,
      html: "",
      reason:
        err instanceof Error ? err.message : "Échec réseau lors de la récupération de l'annonce",
    };
  }

  const html = await res.text();
  const lower = html.toLowerCase();
  const looksBlocked =
    res.status === 403 ||
    res.status === 429 ||
    html.length < 2000 ||
    BLOCK_SIGNATURES.some((sig) => lower.includes(sig));

  if (!res.ok || looksBlocked) {
    return {
      ok: false,
      blocked: true,
      status: res.status,
      html,
      reason: `Le site a bloqué la récupération automatique (protection anti-bot, statut ${res.status}).`,
    };
  }

  return { ok: true, blocked: false, status: res.status, html };
}
