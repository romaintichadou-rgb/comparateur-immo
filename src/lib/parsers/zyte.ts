export async function fetchViaZyte(url: string): Promise<{
  ok: boolean;
  html: string;
  status: number;
  reason?: string;
}> {
  const apiKey = process.env.ZYTE_API_KEY;
  if (!apiKey) {
    return { ok: false, html: "", status: 0, reason: "ZYTE_API_KEY non configurée" };
  }

  const auth = Buffer.from(apiKey + ":").toString("base64");

  let res: Response;
  try {
    res = await fetch("https://api.zyte.com/v1/extract", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({ url, httpResponseBody: true }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    return {
      ok: false,
      html: "",
      status: 0,
      reason: err instanceof Error ? err.message : "Échec réseau Zyte",
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      html: "",
      status: res.status,
      reason: `Zyte a répondu ${res.status} : ${text.slice(0, 200)}`,
    };
  }

  const json = await res.json();
  const bodyB64: string = json.httpResponseBody ?? "";
  const html = bodyB64 ? Buffer.from(bodyB64, "base64").toString("utf-8") : "";

  return {
    ok: html.length > 0,
    html,
    status: json.statusCode ?? 200,
    ...(!html && { reason: "Zyte n'a pas retourné de contenu" }),
  };
}
