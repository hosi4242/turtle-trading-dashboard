# Turtle Trading Dashboard v3.0 — Deployment Readiness

## Current decision

**Do not deploy the current v3 local-production frontend to Cloudflare as the complete dashboard yet.**

The Windows local application and Cloudflare Worker are different runtime architectures. The local UI calls the Python/FastAPI endpoints `/api/health`, `/api/watchlist` (GET/POST), and `/api/stock/{code}`. The current Worker implements only `/api/kiwoom/config-status` and `/api/kiwoom/quote`, then forwards other paths to static assets. It does not implement the API contract required by the v3 UI. Therefore, a successful Vite build does not establish Cloudflare runtime compatibility.

## Verified evidence

- GitHub Actions run 38407917625 passed frontend build, demo build, Python compile, and Python unit tests.
- The user verified the local dashboard typography, completed-daily-close chart, and existing quote/analysis panels display correctly.
- The local health response previously reported `mockFallback: false` and `ordersEnabled: false`.
- The user verified a displayed current quote and latest completed daily bar date against their brokerage screen.
- These checks do not independently prove all API edge cases, persistence across restarts, or Cloudflare compatibility.

## Required release gates — Windows local production

1. Run `npm.cmd run build` from the project directory and confirm exit code 0.
2. Run `py -3 -m compileall -q backend tests`.
3. Run `py -3 -m unittest discover -s tests`; all tests must pass.
4. Start with `start-local.bat`; keep its console open.
5. Check `http://127.0.0.1:8765/api/health`: version is 3.0.0, backend is online, `mockFallback` is false, and `ordersEnabled` is false.
6. Check `http://127.0.0.1:8765/api/watchlist` returns JSON with real-data source, items/failures fields, and no mock fallback.
7. Confirm the latest completed daily bar date, current quote, 20/55-day entry levels, 10/20-day exit levels, and Wilder ATR against the brokerage/data source.
8. Confirm a newly added watchlist item remains after restarting the local app (SQLite persistence).
9. Confirm refresh and 60-second polling continue to work; confirm no order endpoint or order submission is present.
10. Do not commit local databases, logs, credentials, access tokens, or secret values.

## Required release gates — Cloudflare (separate project)

Cloudflare deployment is blocked until one of the following is intentionally selected and implemented:

- **Option A — local-only product:** Keep the production dashboard on the user's Windows PC. Do not deploy this v3 UI as a Cloudflare-hosted full-feature app.
- **Option B — Cloudflare full-feature app:** Port the required API contract to Worker-compatible handlers, implement durable watchlist storage (for example, D1 with migrations and binding), implement and test the same daily-bar/indicator logic, set production secrets only in Cloudflare's secret manager, and add integration tests for all required API routes.

Before any Cloudflare release, verify the exact production branch, Worker bindings/secrets, build output, API responses, data source, and orders-disabled invariant. A deployment is not approved solely because a frontend build succeeds.

## Safety invariants

- No real order placement or automated trading.
- Never expose or commit Kiwoom App Key, App Secret, tokens, or personal account information.
- Do not merge to `main` or deploy until the selected target architecture passes its own release gates.
