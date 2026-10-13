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


type Bar = { date: string; open: number; high: number; low: number; close: number; volume: number };
const ALLOWED_CODES = new Set(["005930", "000660", "005380"]);
const historyCache = new Map<string, { value: Bar[]; expiresAt: number }>();

async function getDailyBars(code: string, env: Env): Promise<Bar[]> {
  const cached = historyCache.get(code);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const token = await getAccessToken(env);
  let cont = "N", next = "";
  const raw: Record<string, unknown>[] = [];
  for (let page = 0; page < 10; page++) {
    const response = await fetch(`${KIWOOM_API}/api/dostk/chart`, {
      method: "POST",
      headers: {
        "content-type": "application/json;charset=UTF-8",
        authorization: `Bearer ${token}`,
        "api-id": "ka10081",
        "cont-yn": cont,
        "next-key": next,
      },
      body: JSON.stringify({ stk_cd: code, base_dt: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }).replace(/-/g, ""), upd_stkpc_tp: "1" }),
    });
    let payload: Record<string, unknown>;
    try { payload = await response.json() as Record<string, unknown>; }
    catch { throw new Error("DAILY_CHART_RESPONSE_INVALID"); }
    if (!response.ok || (payload.return_code !== undefined && Number(payload.return_code) !== 0)) throw new Error("DAILY_CHART_REQUEST_FAILED");
    const rows = payload.stk_dt_pole_chart_qry;
    if (!Array.isArray(rows)) throw new Error("DAILY_CHART_RESPONSE_INVALID");
    raw.push(...rows.filter((v): v is Record<string, unknown> => !!v && typeof v === "object"));
    cont = response.headers.get("cont-yn") ?? "N";
    next = response.headers.get("next-key") ?? "";
    if (raw.length >= 260 || cont !== "Y" || !next) break;
  }
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }).replace(/-/g, "");
  const unique = new Map<string, Bar>();
  for (const row of raw) {
    const date = String(row.dt ?? row.date ?? "");
    const close = numberField(row.cur_prc ?? row.close_pric, true);
    const high = numberField(row.high_pric, true);
    const low = numberField(row.low_pric, true);
    const open = numberField(row.open_pric, true);
    const volume = numberField(row.trde_qty, true) ?? 0;
    if (/^\d{8}$/.test(date) && date < today && close && high !== null && low !== null && open !== null) {
      unique.set(date, { date, open, high, low, close, volume });
    }
  }
  const bars = [...unique.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-260);
  if (bars.length < 120) throw new Error("HISTORY_SHORT");
  historyCache.set(code, { value: bars, expiresAt: Date.now() + 60_000 });
  return bars;
}
function avg(v: number[]): number | null { return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null; }
function sma(v: number[], n: number): number | null { return v.length < n ? null : avg(v.slice(-n)); }
function ema(v: number[], n: number): number[] {
  if (!v.length) return [];
  const k=2/(n+1), out=[v[0]];
  for (const x of v.slice(1)) out.push(x*k+out[out.length-1]*(1-k));
  return out;
}
function rsi(v: number[], n=14): number | null {
  if(v.length<=n) return null;
  const d=v.slice(1).map((x,i)=>x-v[i]);
  let g=avg(d.slice(0,n).map(x=>Math.max(x,0)))!, l=avg(d.slice(0,n).map(x=>Math.max(-x,0)))!;
  for(let i=n;i<d.length;i++){g=(g*(n-1)+Math.max(d[i],0))/n;l=(l*(n-1)+Math.max(-d[i],0))/n;}
  return l===0?(g?100:50):100-100/(1+g/l);
}
async function analyze(code: string, env: Env): Promise<Record<string, unknown>> {
  if (!/^\d{6}$/.test(code) || !ALLOWED_CODES.has(code)) throw new Error("UNSUPPORTED_SYMBOL");
  const quoteResponse = await getQuote(new Request(`https://worker.local/api/kiwoom/quote?code=${code}`), env);
  const quote = await quoteResponse.json() as QuoteResult & { error?: string };
  if (!quoteResponse.ok || quote.error || quote.price == null) throw new Error(quote.error ?? "QUOTE_REQUEST_FAILED");
  const bars = await getDailyBars(code, env);
  const closes=bars.map(x=>x.close), highs=bars.map(x=>x.high), lows=bars.map(x=>x.low), volumes=bars.map(x=>x.volume);
  const tr=bars.map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-(i?closes[i-1]:b.close)),Math.abs(b.low-(i?closes[i-1]:b.close))));
  let atr=avg(tr.slice(0,20))!;
  for(const x of tr.slice(20)) atr=(atr*19+x)/20;
  const e20=Math.max(...highs.slice(-20)), e55=Math.max(...highs.slice(-55));
  const x10=Math.min(...lows.slice(-10)), x20=Math.min(...lows.slice(-20));
  const s20=sma(closes,20), s50=sma(closes,50), mline=ema(closes,12).map((x,i)=>x-ema(closes,26)[i]);
  const macd=mline[mline.length-1], sig=ema(mline,9)[mline.length-1];
  const avol=sma(volumes,20), vr=avol?volumes[volumes.length-1]/avol:null, r=rsi(closes);
  const trend=s20!==null&&s50!==null&&quote.price>s20&&s20>s50?"상승 추세":s20!==null&&s50!==null&&quote.price<s20&&s20<s50?"하락 추세":"혼조";
  const parts=[s20!==null&&quote.price>s20?1:-1,s20!==null&&s50!==null&&s20>s50?1:-1,macd>sig?1:-1,r!==null&&r>=45&&r<=70?1:r!==null&&r>75?-1:0,vr!==null&&vr>=1.2?1:0];
  const score=Math.round((parts.reduce((a,b)=>a+b,0)+parts.length)/(2*parts.length)*100);
  const asOf=quote.asOf;
  return {code,name:quote.name,quote,turtle:{system1Entry20High:e20,system2Entry55High:e55,system1Exit10Low:x10,system2Exit20Low:x20,nAtr20:atr,lastCompletedBarDate:bars[bars.length-1].date,historyBars:bars.length,status:quote.price>=e20?"ENTRY_READY":"WATCHING",statusBasis:"실제 현재가와 완료된 일봉 20일 고가 비교"},
    chart:bars.slice(-60).map(b=>({date:`${b.date.slice(0,4)}-${b.date.slice(4,6)}-${b.date.slice(6)}`,close:b.close})),
    technical:{trend,sma20:s20,sma50:s50,rsi14:r,macd,macdSignal:sig,atr20:atr,volumeAverage20:avol,volumeRatio20:vr},
    analysis:{score,scoreLabel:"규칙 기반 참고 점수(확률 아님)",horizons:{SHORT:"1~5거래일",MEDIUM:"2~4주",LONG:"3~12개월"},limitations:["수급·뉴스·공시·실적 데이터는 연결하지 않았습니다.","이 점수는 상승 확률이 아니며 매수·매도 권고가 아닙니다."]},
    dataQuality:{source:"KIWOOM_REAL_REST",mode:"PRODUCTION",asOf,completedDailyBars:bars.length,mockFallback:false}};
}
function allowedOrigin(request: Request): boolean {
  const origin=request.headers.get("Origin"); if(!origin) return true;
  try { return new URL(origin).host===new URL(request.url).host; } catch { return false; }
}
export default {
 async fetch(request: Request, env: Env): Promise<Response> {
   const url=new URL(request.url), path=url.pathname;
   if(path.startsWith("/api/") && !allowedOrigin(request)) return json({error:"ORIGIN_NOT_ALLOWED"},403);
   if(path==="/api/health") return json({application:"Turtle Trading Dashboard",version:"3.0.0",mode:"PRODUCTION",backend:"cloudflare-worker",credentials:{appKeyConfigured:Boolean(env.KIWOOM_APP_KEY?.trim()),appSecretConfigured:Boolean(env.KIWOOM_APP_SECRET?.trim())},mockFallback:false,ordersEnabled:false,database:"browser-localStorage"});
   if(path==="/api/kiwoom/config-status") return json({worker:"turtle-trading-dashboard",appKeyConfigured:Boolean(env.KIWOOM_APP_KEY?.trim()),appSecretConfigured:Boolean(env.KIWOOM_APP_SECRET?.trim())});
   if(path==="/api/kiwoom/quote") return getQuote(request,env);
   if(path==="/api/watchlist") {
     if(request.method==="GET") {
       const codes=(url.searchParams.get("codes")??"005930,000660,005380").split(",").map(x=>x.trim()).filter((x,i,a)=>/^\d{6}$/.test(x)&&a.indexOf(x)===i).slice(0,10);
       const items: Record<string,unknown>[]=[], failures: {code:string,error:string,message:string}[]=[];
       for(const code of codes) { try { items.push(await analyze(code,env)); } catch(e) { const message=e instanceof Error?e.message:"DATA_REQUEST_FAILED"; failures.push({code,error:message,message:message==="HISTORY_SHORT"?"완료된 일봉 데이터가 부족합니다.":"실제 키움 데이터 조회에 실패했습니다. API 권한과 응답을 확인하세요."}); } }
       return json({mode:"PRODUCTION",source:"KIWOOM_REAL_REST",updatedAt:new Date().toISOString(),items,failures,mockFallback:false});
     }
     if(request.method==="POST") {
       let body: {code?:unknown}; try { body=await request.json() as {code?:unknown}; } catch { return json({error:"INVALID_JSON"},400); }
       const code=typeof body.code==="string"?body.code.trim():"";
       try { return json(await analyze(code,env)); } catch(e) { const message=e instanceof Error?e.message:"DATA_REQUEST_FAILED"; return json({detail:{code:message,message:message==="UNSUPPORTED_SYMBOL"?"현재 Cloudflare 버전에서는 기본 3개 종목만 지원합니다.":"실제 시세 또는 일봉 조회에 실패했습니다."}},message==="UNSUPPORTED_SYMBOL"?400:502); }
     }
     return json({error:"METHOD_NOT_ALLOWED"},405);
   }
   const stockMatch=path.match(/^\/api\/stock\/(\d{6})$/);
   if(stockMatch && request.method==="GET") { try { return json(await analyze(stockMatch[1],env)); } catch(e) { const message=e instanceof Error?e.message:"DATA_REQUEST_FAILED"; return json({detail:{code:message,message:"실제 시세 또는 일봉 조회에 실패했습니다."}},message==="UNSUPPORTED_SYMBOL"?400:502); } }
   return env.ASSETS.fetch(request);
 }
};
