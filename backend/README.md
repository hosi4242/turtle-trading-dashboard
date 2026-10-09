# Kiwoom read-only smoke test (Phase 1)

This folder is intentionally separate from the deployed React/Vite DEMO UI.
It tests only the official Kiwoom real-time stock-trade feed for Samsung
Electronics (`005930`). It does not send orders, access balances, or expose a
public quote relay.

## Before starting

- Use a **DEMO/mock-investment** App Key and App Secret, not production keys.
- Do not paste keys or tokens into this repository, source files, chat, or logs.
- The official Kiwoom client requires Python 3.13+.
- The first test is most meaningful during KRX trading hours. A timeout outside
  trading hours does not by itself prove authentication failed.

## Windows PowerShell setup

1. Install Python 3.13 or newer from https://www.python.org/downloads/windows/.
2. Open PowerShell and install `uv` if it is not already installed:

   ```powershell
   powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
   ```

3. Open a new PowerShell window, then install the official Kiwoom CLI:

   ```powershell
   uv tool install kwcli
   ```

4. Start the official credential setup:

   ```powershell
   kiwoomcli setup
   ```

   Select **demo/mock investment** and enter the mock App Key and App Secret
   only in the CLI's hidden input prompts. The official CLI stores credentials
   in the Windows credential store; do not create a `.env` file for this flow.

5. Confirm the selected profile is authenticated:

   ```powershell
   kiwoomcli auth status
   kiwoomcli domestic stocks info --code 005930
   ```

   If the stock-info command fails, stop here and resolve authentication before
   testing the realtime feed.

## Run the one-symbol realtime test

The script uses the official `kiwoom` client package. To run it, open this
repository folder in PowerShell and create an isolated environment that installs
the official client from Kiwoom's public repository:

```powershell
uv venv --python 3.13
uv pip install --python .venv\\Scripts\\python.exe "git+https://github.com/Kiwoom-Securities/Kiwoom-REST-API.git"
uv run --python .venv\\Scripts\\python.exe python backend\\test_realtime_quote.py
```

The script waits up to 45 seconds for one realtime event. If the market is
closed, no event may arrive; retry during market hours. The output should be
reviewed for a plausible current price and timestamp before any dashboard
integration is attempted.

## Safety and next gate

- Current Cloudflare deployment remains **DEMO** and unchanged.
- This test only subscribes to API type `0B`; there are no order API calls.
- Do not add the App Key, App Secret, access token, or raw credential files to
  GitHub.
- Do not replace mock prices or label Turtle entry/exit levels as live until
  this feed is verified and historical daily OHLC data is validated separately.
