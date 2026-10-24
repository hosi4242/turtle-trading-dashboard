from __future__ import annotations

import re
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.analysis import analyze_stock
from backend.config import credentials_status
from backend.database import add_stock, initialize, list_codes
from backend.kiwoom import KiwoomClient, KiwoomError

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize()
    yield


app = FastAPI(title="Turtle Trading Dashboard", version="3.0.0", lifespan=lifespan)
client = KiwoomClient()


class AddStockRequest(BaseModel):
    code: str


@app.middleware("http")
async def local_only(request: Request, call_next):
    host = request.client.host if request.client else ""
    if host not in ("127.0.0.1", "::1", "testclient"):
        return JSONResponse({"detail": "LOCAL_ONLY"}, status_code=403)
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin", "")
        if origin and not origin.startswith(("http://127.0.0.1:", "http://localhost:")):
            return JSONResponse({"detail": "ORIGIN_NOT_ALLOWED"}, status_code=403)
    return await call_next(request)


def safe_code(code: str) -> str:
    normalized = code.strip()
    if not re.fullmatch(r"\d{6}", normalized):
        raise HTTPException(status_code=400, detail="INVALID_STOCK_CODE")
    return normalized


def api_error(exc: KiwoomError) -> HTTPException:
    status = 503 if exc.code == "CREDENTIALS_MISSING" else 502
    return HTTPException(status_code=status, detail={"code": exc.code, "message": str(exc)})


async def fetch_analysis(code: str) -> dict[str, Any]:
    quote = await client.get_quote(code)
    bars = await client.get_daily_bars(code)
    try:
        return analyze_stock(quote, bars)
    except (KeyError, TypeError, ValueError, OverflowError) as exc:
        # Treat malformed provider data as a data-quality failure, not an
        # unhandled 500 or a fabricated signal. Do not expose raw payloads.
        raise KiwoomError(
            "MARKET_DATA_INVALID",
            "키움 시세 또는 일봉 데이터가 분석 조건을 충족하지 못했습니다. 데이터 형식과 완료된 일봉을 확인하세요.",
        ) from exc


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {
        "application": "Turtle Trading Dashboard",
        "version": "3.0.0",
        "mode": "PRODUCTION",
        "backend": "online",
        "credentials": credentials_status(),
        "mockFallback": False,
        "ordersEnabled": False,
        "database": "SQLite",
    }


@app.get("/api/watchlist")
async def watchlist() -> dict[str, Any]:
    items = []
    failures = []
    for code in list_codes():
        try:
            items.append(await fetch_analysis(code))
        except KiwoomError as exc:
            failures.append({"code": code, "error": exc.code, "message": str(exc)})
    return {
        "mode": "PRODUCTION",
        "source": "KIWOOM_REAL_REST",
        "updatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "items": items,
        "failures": failures,
        "mockFallback": False,
    }


@app.get("/api/stock/{code}")
async def stock_analysis(code: str) -> dict[str, Any]:
    code = safe_code(code)
    try:
        return await fetch_analysis(code)
    except KiwoomError as exc:
        raise api_error(exc) from exc



@app.get("/api/kiwoom/investors")
async def investor_flow(code: str) -> dict[str, Any]:
    code = safe_code(code)
    try:
        return await client.get_investor_flow(code)
    except KiwoomError as exc:
        raise api_error(exc) from exc


@app.post("/api/watchlist")
async def add_watchlist_stock(request: AddStockRequest) -> dict[str, Any]:
    code = safe_code(request.code)
    try:
        result = await fetch_analysis(code)
        add_stock(code, result["name"])
        return result
    except KiwoomError as exc:
        raise api_error(exc) from exc


@app.get("/")
async def root():
    index_file = DIST / "index.html"
    if not index_file.exists():
        return {
            "message": "Frontend build is missing. Run npm install and npm run build first.",
            "health": "/api/health",
        }
    return FileResponse(index_file)


if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="frontend")
