# Cloudflare Pages + Kiwoom REST API (read-only Phase 1)

This change adds a **server-side mock-investment quote probe**. It does not submit orders, access account balances, or alter the dashboard's existing demo data.

## Endpoint

`GET /api/kiwoom/quote?code=005930`

Allowed codes are deliberately restricted to Samsung Electronics (`005930`), SK Hynix (`000660`), and Hyundai Motor (`005380`). The route uses Kiwoom's mock REST host and the read-only `ka10001` stock-information API. Responses are cached in the current Worker isolate for 10 seconds as a best-effort limit.

A successful response includes `mode: "DEMO"` and `source: "KIWOOM_MOCK_REST"`. The route is a probe only; it is not yet wired into the dashboard's price cards or Turtle signal calculations.

## Add secrets in Cloudflare (never in GitHub)

1. Open Cloudflare Dashboard.
2. Go to **Workers & Pages** and select the Cloudflare Pages project for this repository.
3. Open **Settings → Variables and Secrets**.
4. Add a variable of type **Secret** named `KIWOOM_APP_KEY`; paste the **mock-investment** App Key value.
5. Add another variable of type **Secret** named `KIWOOM_APP_SECRET`; paste the **mock-investment** App Secret value.
6. Add them to the **Preview** environment first. Do not use production credentials.
7. Deploy a Preview build for branch `cloudflare-kiwoom-rest-phase1` after this pull request is available.

Cloudflare's official instructions: https://developers.cloudflare.com/pages/functions/bindings/ and https://developers.cloudflare.com/workers/configuration/secrets/

Do not put either value in source code, a normal plaintext variable, chat, or a GitHub file. If you have only production API credentials, stop and obtain/use the mock-investment credentials instead.

## Preview test

After the branch preview deploys and both Preview secrets are configured, open:

`https://<your-preview-host>/api/kiwoom/quote?code=005930`

Expected successful JSON includes `code`, `name`, `price`, `changeRate`, `asOf`, `source`, and `mode`. A `503 CLOUDFLARE_SECRETS_NOT_CONFIGURED` means the Preview secrets are missing. A `502` indicates token/API response problems; this code intentionally avoids returning the token, secret, or raw provider response.

## Limitations and safety

- This is a REST snapshot, **not a continuous real-time WebSocket feed**.
- Market-closed behavior, mock-server coverage for the chosen symbols, numeric sign/scale normalization, and actual response payload still need to be verified using the user's authorized mock credentials.
- The endpoint is read-only and has a fixed symbol allowlist, but a public URL can still be called by external clients. The in-isolate cache is only best-effort, not a durable rate limiter. Keep this in Preview during validation; before exposing it publicly, configure Cloudflare rate limiting or Cloudflare Access and confirm Kiwoom's applicable data-use terms.
- Do not use this response to calculate Turtle entry/exit signals. Those require verified historical daily OHLC data and adjusted-price semantics.
- The existing frontend remains in DEMO mode. This route does not change the deployed production page until the pull request is merged and deployed.
- No live API call or build test has been performed in this repository environment. Validate in Preview before merging.
