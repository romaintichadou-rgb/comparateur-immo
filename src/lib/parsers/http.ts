import { fetchViaZyte } from "./zyte";

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
  "checking your browser",
  "access denied",
  "datadome",
  "cf-mitigated",
  "attention required",
  "just a moment",
  "pardon our interruption",
  "verify you are human",
];

function looksBlocked(status: number, html: string): boolean {
  if (status === 403 || status === 429) return true;
  if (html.length < 2000) return true;
  const textOnly = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase();
  return BLOCK_SIGNATURES.some((sig) => textOnly.includes(sig));
}

/**
 * Récupère le HTML d'une page d'annonce. Stratégie en deux temps :
 * 1. Fetch direct (gratuit) avec User-Agent navigateur
 * 2. Si bloqué → fallback Zyte (navigateur réel + anti-bot)
 */
export async function fetchListingHtml(url: string): Promise<FetchResult> {
  const direct = await directFetch(url);
  if (direct.ok) return direct;

  if (!process.env.ZYTE_API_KEY) return direct;

  const zyte = await fetchViaZyte(url);
  if (!zyte.ok) {
    return {
      ok: false,
      blocked: true,
      status: zyte.status,
      html: zyte.html,
      reason:
        zyte.reason ??
        "Le site a bloqué la récupération automatique malgré le contournement anti-bot.",
    };
  }

  if (looksBlocked(zyte.status, zyte.html)) {
    return {
      ok: false,
      blocked: true,
      status: zyte.status,
      html: zyte.html,
      reason: `Le site a bloqué la récupération automatique (statut ${zyte.status}).`,
    };
  }

  return { ok: true, blocked: false, status: zyte.status, html: zyte.html };
}

async function directFetch(url: string): Promise<FetchResult> {
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

  if (!res.ok || looksBlocked(res.status, html)) {
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
