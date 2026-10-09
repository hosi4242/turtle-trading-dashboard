# Cloudflare Workers + Kiwoom REST API (read-only Phase 1)

This branch adds a Cloudflare Worker entrypoint for a read-only **mock-investment** quote probe. It does not submit orders, access account balances, or alter the dashboard's sample data.

## Endpoint

`GET /api/kiwoom/quote?code=005930`

Allowed codes: Samsung Electronics (`005930`), SK Hynix (`000660`), and Hyundai Motor (`005380`). The endpoint calls Kiwoom's mock REST host and the `ka10001` stock-information API. A successful response is marked `mode: "DEMO"` and `source: "KIWOOM_MOCK_REST"`. It is not wired into the dashboard UI or Turtle signal calculations.

## Cloudflare configuration

The Worker entrypoint is `src/worker.ts`; `wrangler.jsonc` configures the static Vite build from `dist/` and routes the API through the Worker.

In the target Worker, create **Secrets** (not plain Variables):
- `KIWOOM_APP_KEY`
- `KIWOOM_APP_SECRET`

Use only mock-investment credentials. Never put keys in GitHub, source files, chat, or browser code.

Before deploying, verify that the existing Cloudflare Worker is actually named `turtle-trading-dashboard` and that its build command produces `dist/` (normally `npm run build`). If the Worker name or build output differs, adjust `wrangler.jsonc` before deployment; do not deploy blindly.

## Test

After a **preview/non-production** deployment, open:

`https://<preview-worker-host>/api/kiwoom/quote?code=005930`

Expected successful JSON includes `code`, `name`, `price`, `changeRate`, `asOf`, `source`, and `mode`. `503 CLOUDFLARE_SECRETS_NOT_CONFIGURED` means the deployed Worker cannot see the two Secrets. `502` indicates a token/API response problem. This handler intentionally avoids returning credentials or raw provider responses.

## Safety and limitations

- This is a REST snapshot, **not** a continuous real-time WebSocket feed.
- No API call using the user's credentials or build test has been performed yet; the Kiwoom request/response assumptions must be validated in preview.
- The endpoint is read-only and has a fixed symbol allowlist, but it is still a public URL unless Cloudflare Access or rate limiting is configured. The 10-second in-isolate cache is best-effort, not a durable rate limiter.
- Do not use these values to calculate Turtle entry/exit signals. Those require verified historical daily OHLC data and adjusted-price semantics.
- The dashboard remains in DEMO mode. Do not merge to production until preview returns a valid response and the API fields are confirmed.
