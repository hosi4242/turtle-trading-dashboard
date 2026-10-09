# Kiwoom API Findings — Turtle Trading Dashboard

- Checked: 2026-10-09
- Scope: read-only domestic stock quote feed for the Turtle Trading Dashboard.
- Safety boundary: this phase does not implement or enable order submission.

## Official sources checked

- Kiwoom REST API portal: https://openapi.kiwoom.com/main/home
- Kiwoom official client/examples repository: https://github.com/Kiwoom-Securities/Kiwoom-REST-API
- Official real-time stock trade example: https://github.com/Kiwoom-Securities/Kiwoom-REST-API/blob/main/examples/%EA%B5%AD%EB%82%B4%EC%A3%BC%EC%8B%9D/%EC%8B%A4%EC%8B%9C%EA%B0%84%EC%8B%9C%EC%84%B8/subscribe_domestic_stock_trade_async.py

## Findings

| item_id | official_source | checked_at | confirmed_value | implementation_impact | status |
|---|---|---|---|---|---|
| AUTH-01 | Kiwoom REST API portal and official repository README | 2026-10-09 | API App Key/Secret and OAuth token are required; production and mock credentials/environments are separate | Keep credentials and token in a local backend/OS credential store, never in React/browser code or Git | CONFIRMED |
| AUTH-02 | Official repository README | 2026-10-09 | Official client provides OAuth/runtime handling; credential setup can use the official CLI and OS credential store | Prefer official client/runtime over hand-rolled token storage | CONFIRMED |
| REST-01 | Kiwoom official portal | 2026-10-09 | Production REST base is `https://api.kiwoom.com`; mock base is `https://mockapi.kiwoom.com` | Environment must be explicit and visibly reported | CONFIRMED |
| REAL-01 | Official `subscribe_domestic_stock_trade_async.py` | 2026-10-09 | Domestic stock real-time trade feed uses API type `0B` and WebSocket path `/api/dostk/websocket` | Use trade feed `0B` for the current-price stream, not expected-execution feed `0H` | CONFIRMED |
| REAL-02 | Official `subscribe_domestic_stock_trade_async.py` | 2026-10-09 | Registration packet fields shown in the official example: `trnm=REG`, `grp_no=1`, `refresh=1`, `data=[{item:[stock code],type:[0B]}]` | Implement only through the official client and test its exact runtime behavior | CONFIRMED |
| REAL-03 | Official example comments | 2026-10-09 | The official shared WebSocket client handles LOGIN/PING and the receive loop | Reuse the official client; do not invent heartbeat messages/timing | CONFIRMED |
| REAL-04 | Official example `COLUMNS` map | 2026-10-09 | FID `10` current price, `11` change, `12` change rate, `20` execution time, `13` cumulative volume, `15` volume, `16` open, `17` high, `18` low | Parse FIDs as strings from official payload and validate sign/scale before use | CONFIRMED |
| RATE-01 | Kiwoom official portal | 2026-10-09 | Domestic query TR limit is shown as 5 requests/second; one session and up to 200 real-time stock symbols per session are listed | Do not poll REST for every price update; use one WebSocket session and a bounded subscription list | CONFIRMED |
| DATA-01 | Current dashboard source | 2026-10-09 | The existing React/Vite app is a static mock UI with hard-coded sample prices/history; no backend dependency exists | Keep the deployed Cloudflare page as DEMO until a separate local backend is installed and verified | CONFIRMED |
| DATA-02 | Official API schema/response not yet exercised against user's authorized account | 2026-10-09 | Live response normalization, sign conventions, freshness rules and exchange-session edge cases must be tested | Never silently map unverified values into signal calculations | PENDING |
| DATA-03 | Official historical API guide and actual responses not yet fully verified | 2026-10-09 | Turtle 20/55-day entry and 10/20-day exit levels require adequate historical daily OHLC data; a live quote alone is not sufficient | Do not label the current mock entry/exit lines as live/production signals until historical data and adjusted-price semantics are validated | PENDING |
| POLICY-01 | Kiwoom data-use terms and applicable account/API terms | 2026-10-09 | Display/storage/redistribution permissions for this exact personal dashboard deployment need confirmation | Keep the first implementation private/local and read-only; do not publish a public quote relay | PENDING |
| HEALTH-01 | Official guide plus integration tests still required | 2026-10-09 | Production stale-feed threshold, reconnect/backoff behavior and market-closed status have not yet been validated in this application | Show connection state and last-received time; mark feed health unverified until tested | PENDING |

## Implementation decision

The current public Cloudflare deployment is a static front end. Do not put App Key, App Secret, access tokens, or a broker WebSocket connection in the browser bundle or public repository.

Use this staged design:

1. Keep the current Cloudflare deployment labelled DEMO and preserve its working UI.
2. Build a separate Windows-local Python backend that uses the official Kiwoom client/runtime, authenticates locally, subscribes to the `0B` read-only quote feed, and exposes a narrow local feed to the UI.
3. Test authentication and a single symbol (Samsung Electronics, `005930`) before adding the current three watchlist symbols.
4. Validate live payload values and feed health before replacing any mock prices.
5. Keep historical daily OHLC / adjusted-price verification as a separate gate before treating Turtle entry/exit levels as live signals.

## Explicitly out of scope

- No buy/sell order API calls.
- No account balances or holdings integration.
- No public proxy/relay for broker data.
- No credentials committed to Git.
- No invented WebSocket URL, heartbeat timing, stale threshold, or price-adjustment formula.
