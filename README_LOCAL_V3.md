# Turtle Trading Dashboard v3.0 — Local Production Setup

This branch starts the local-only v3.0 migration. The original `main` branch and Cloudflare Worker are unchanged.

## What this stage does

- Runs the UI and API from one local origin at `http://127.0.0.1:8765`.
- Reads Kiwoom credentials from environment variables or the OS credential store (Windows Credential Manager through `keyring`).
- Uses the Kiwoom production REST API for quotes and daily candles.
- Calculates technical indicators and Turtle breakout/exit levels from returned daily data.
- Never substitutes mock data when real data is unavailable.
- Has no order or automated-trading endpoints.

## First-time setup (Windows)

1. Install Python 3.12+ and Node.js LTS.
2. Open a terminal in the project folder and run:
   `py -3 -m pip install -r requirements-local.txt`
3. Register the production App Key and App Secret without displaying them:
   `py -3 -m backend.setup_credentials`
4. Run `start-local.bat`.
5. Open `http://127.0.0.1:8765`.
6. Check `http://127.0.0.1:8765/api/health`. Both credential flags should be `true`; no secret values are returned.

Do not paste App Key, App Secret, or access tokens into chat or commit them to GitHub.

## Data behavior

- A quote is marked as real only after the production REST response has been parsed and validated.
- The daily chart adapter requires at least 120 completed daily bars. If the provider response format or history is insufficient, the API returns an explicit error.
- Turtle levels use completed daily bars; the current quote is compared with those levels.
- The current stage uses REST polling. A persistent Kiwoom real-time WebSocket, SQLite persistence, full position ledger, news/disclosure/fundamental sources, and the remaining v3.0 acceptance tests are still required before declaring the full v3.0 system production-ready.
- No orders, account balance calls, or automated trading are implemented.

## Important

This is an incremental implementation branch, not yet a verified release. The Kiwoom response field mapping must be tested against the account's live API responses before relying on analysis results. Do not merge to `main` or delete the existing Cloudflare deployment until local verification passes.
