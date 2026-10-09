interface Env {
  KIWOOM_APP_KEY?: string;
  KIWOOM_APP_SECRET?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

type QuoteResult = {
  code: string;
  name: string;
  price: number | null;
  change: number | null;
  changeRate: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  asOf: string;
  source: "KIWOOM_REAL_REST";
  mode: "REAL";
};

type CachedToken = { value: string; expiresAt: number };
let cachedToken: CachedToken | undefined;
const quoteCache = new Map<string, { value: QuoteResult; expiresAt: number }>();
const ALLOWED_CODES = new Set(["005930", "000660", "005380"]);
const KIWOOM_API = "https://api.kiwoom.com";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function numberField(value: unknown, absolute = false): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, "").replace(/^\+/, ""));
  if (!Number.isFinite(parsed)) return null;
  return absolute ? Math.abs(parsed) : parsed;
}

async function getAccessToken(env: Env): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  if (!env.KIWOOM_APP_KEY || !env.KIWOOM_APP_SECRET) throw new Error("SECRETS_NOT_CONFIGURED");

  const response = await fetch(`${KIWOOM_API}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/json;charset=UTF-8" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: env.KIWOOM_APP_KEY,
      secretkey: env.KIWOOM_APP_SECRET,
    }),
  });

  let payload: Record<string, unknown>;
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    throw new Error("TOKEN_REQUEST_FAILED");
  }

  const token = typeof payload.token === "string"
    ? payload.token
    : typeof payload.access_token === "string" ? payload.access_token : "";
  if (!response.ok || !token || (payload.return_code !== undefined && Number(payload.return_code) !== 0)) {
    throw new Error("TOKEN_REQUEST_FAILED");
  }

  const expiryText = typeof payload.expires_dt === "string" ? payload.expires_dt : "";
  const expiryUtc = expiryText.length === 14
    ? Date.UTC(
        Number(expiryText.slice(0, 4)),
        Number(expiryText.slice(4, 6)) - 1,
        Number(expiryText.slice(6, 8)),
        Number(expiryText.slice(8, 10)),
        Number(expiryText.slice(10, 12)),
        Number(expiryText.slice(12, 14)),
      ) - 9 * 60 * 60 * 1000
    : Date.now() + 50 * 60 * 1000;

  cachedToken = { value: token, expiresAt: expiryUtc };
  return token;
}

async function getQuote(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      if (new URL(origin).host !== url.host) return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);
    } catch {
      return json({ error: "INVALID_ORIGIN" }, 403);
    }
  }

  const code = (url.searchParams.get("code") ?? "005930").trim();
  if (!ALLOWED_CODES.has(code)) {
    return json({ error: "UNSUPPORTED_SYMBOL", allowedCodes: [...ALLOWED_CODES] }, 400);
  }

  const cached = quoteCache.get(code);
  if (cached && cached.expiresAt > Date.now()) return json({ ...cached.value, cached: true });

  try {
    const token = await getAccessToken(env);
    const response = await fetch(`${KIWOOM_API}/api/dostk/stkinfo`, {
      method: "POST",
      headers: {
        "content-type": "application/json;charset=UTF-8",
        authorization: `Bearer ${token}`,
        "api-id": "ka10001",
        "cont-yn": "N",
        "next-key": "",
      },
      body: JSON.stringify({ stk_cd: code }),
    });

    let payload: Record<string, unknown>;
    try {
      payload = await response.json() as Record<string, unknown>;
    } catch {
      return json({ error: "KIWOOM_QUOTE_RESPONSE_INVALID" }, 502);
    }

    if (!response.ok || (payload.return_code !== undefined && Number(payload.return_code) !== 0)) {
      return json({ error: "KIWOOM_QUOTE_REQUEST_FAILED", providerCode: payload.return_code ?? null }, 502);
    }

    const quote: QuoteResult = {
      code,
      name: typeof payload.stk_nm === "string" ? payload.stk_nm : code,
      price: numberField(payload.cur_prc, true),
      change: numberField(payload.pred_pre),
      changeRate: numberField(payload.flu_rt),
      open: numberField(payload.open_pric, true),
      high: numberField(payload.high_pric, true),
      low: numberField(payload.low_pric, true),
      volume: numberField(payload.trde_qty, true),
      asOf: new Date().toISOString(),
      source: "KIWOOM_REAL_REST",
      mode: "REAL",
    };

    if (quote.price === null) return json({ error: "QUOTE_RESPONSE_UNRECOGNIZED" }, 502);
    quoteCache.set(code, { value: quote, expiresAt: Date.now() + 10_000 });
    return json({ ...quote, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SECRETS_NOT_CONFIGURED") return json({ error: "CLOUDFLARE_SECRETS_NOT_CONFIGURED" }, 503);
    if (message === "TOKEN_REQUEST_FAILED") {
      cachedToken = undefined;
      return json({ error: "KIWOOM_TOKEN_REQUEST_FAILED" }, 502);
    }
    return json({ error: "KIWOOM_CONNECTION_FAILED" }, 502);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/kiwoom/quote") return getQuote(request, env);
    return env.ASSETS.fetch(request);
  },
};
