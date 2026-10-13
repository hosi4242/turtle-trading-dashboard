@echo off
setlocal
cd /d "%~dp0"

echo [1/4] Checking Python...
py -3 --version
if errorlevel 1 (
  echo Python 3.12 or newer is required. Install Python from https://www.python.org/downloads/
  pause
  exit /b 1
)

echo [2/4] Installing backend dependencies...
py -3 -m pip install -r requirements-local.txt
if errorlevel 1 (
  echo Backend dependency installation failed.
  pause
  exit /b 1
)

echo [3/4] Building frontend...
if not exist node_modules call npm install
if errorlevel 1 (
  echo npm install failed.
  pause
  exit /b 1
)
call npm run build
if errorlevel 1 (
  echo Frontend build failed.
  pause
  exit /b 1
)

echo [4/4] Starting local dashboard...
echo Open http://127.0.0.1:8765 in your browser.
echo Keep this window open while using the dashboard.
py -3 -m uvicorn backend.main:app --host 127.0.0.1 --port 8765 --workers 1
pause
