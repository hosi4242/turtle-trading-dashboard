from __future__ import annotations

import asyncio
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx

from backend.config import CredentialsMissing, get_credentials

API_BASE = "https://api.kiwoom.com"


class KiwoomError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class KiwoomClient:
    """Small REST-only adapter. It never sends order requests."""

    def __init__(self) -> None:
        self._token: str | None = None
        self._token_expires_at = 0.0
        self._token_lock = asyncio.Lock()
        self._request_lock = asyncio.Lock()
        self._last_request_at = 0.0

    async def _get_token(self) -> str:
        async with self._token_lock:
            if self._token and self._token_expires_at > time.time() + 60:
                return self._token

            try:
                app_key, app_secret = get_credentials()
            except CredentialsMissing as exc:
                raise KiwoomError("CREDENTIALS_MISSING", str(exc)) from exc

            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    response = await client.post(
                        f"{API_BASE}/oauth2/token",
                        headers={"content-type": "application/json;charset=UTF-8"},
                        json={
                            "grant_type": "client_credentials",
                            "appkey": app_key,
                            "secretkey": app_secret,
                        },
                    )
                    payload = response.json()
            except (httpx.HTTPError, ValueError) as exc:
                raise KiwoomError("TOKEN_CONNECTION_FAILED", "키움 인증 서버에 연결하지 못했습니다.") from exc

            token = payload.get("token") or payload.get("access_token")
            if response.is_error or not isinstance(token, str) or not token:
                # Provider response details are intentionally not returned to the browser.
                raise KiwoomError("TOKEN_REJECTED", "키움 인증에 실패했습니다. 운영용 키와 API 사용 신청 상태를 확인하세요.")

            expiry_text = payload.get("expires_dt")
            expires_at = time.time() + 23 * 60 * 60
            if isinstance(expiry_text, str) and len(expiry_text) == 14 and expiry_text.isdigit():
                try:
                    expiry = datetime.strptime(expiry_text, "%Y%m%d%H%M%S").replace(
                        tzinfo=timezone(timedelta(hours=9))
                    )
                    expires_at = expiry.timestamp()
                except ValueError:
                    pass

            self._token = token
            self._token_expires_at = expires_at
            return token

    async def _post(
        self,
        api_id: str,
        endpoint: str,
        body: dict[str, Any],
        cont_yn: str = "N",
        next_key: str = "",
        include_headers: bool = False,
    ) -> Any:
        token = await self._get_token()

        # Stay below Kiwoom's published per-second inquiry limits.
        async with self._request_lock:
            wait_for = 0.25 - (time.monotonic() - self._last_request_at)
            if wait_for > 0:
                await asyncio.sleep(wait_for)
            self._last_request_at = time.monotonic()
            try:
                async with httpx.AsyncClient(timeout=20.0) as client:
                    response = await client.post(
                        f"{API_BASE}{endpoint}",
                        headers={
                            "content-type": "application/json;charset=UTF-8",
                            "authorization": f"Bearer {token}",
                            "api-id": api_id,
                            "cont-yn": cont_yn,
                            "next-key": next_key,
                        },
                        json=body,
                    )
                    payload = response.json()
            except (httpx.HTTPError, ValueError) as exc:
                raise KiwoomError("DATA_CONNECTION_FAILED", "키움 시세 서버에 연결하지 못했습니다.") from exc

        if response.status_code == 401:
            self._token = None
            self._token_expires_at = 0
            raise KiwoomError("TOKEN_EXPIRED", "키움 인증 토큰이 만료되었거나 유효하지 않습니다. 새로고침 후 다시 확인하세요.")
        if response.is_error:
            raise KiwoomError("API_HTTP_ERROR", f"키움 시세 API가 HTTP {response.status_code} 오류를 반환했습니다.")
        return_code = payload.get("return_code")
        if return_code is not None and str(return_code) not in ("0", "None"):
            raise KiwoomError("API_REJECTED", "키움 시세 조회가 거부되었습니다. API 권한과 요청 조건을 확인하세요.")
        if include_headers:
            return payload, response.headers.get("cont-yn", "N"), response.headers.get("next-key", "")
        return payload

    async def get_quote(self, code: str) -> dict[str, Any]:
        payload = await self._post("ka10001", "/api/dostk/stkinfo", {"stk_cd": code})
        price = parse_number(payload.get("cur_prc"), absolute=True)
        if price is None or price <= 0:
            raise KiwoomError("QUOTE_UNRECOGNIZED", "키움 응답에서 유효한 현재가를 찾지 못했습니다.")
        return {
            "code": code,
            "name": str(payload.get("stk_nm") or code),
            "price": price,
            "change": parse_number(payload.get("pred_pre")),
            "changeRate": parse_number(payload.get("flu_rt")),
            "open": parse_number(payload.get("open_pric"), absolute=True),
            "high": parse_number(payload.get("high_pric"), absolute=True),
            "low": parse_number(payload.get("low_pric"), absolute=True),
            "volume": parse_number(payload.get("trde_qty"), absolute=True),
            "asOf": datetime.now().astimezone().isoformat(timespec="seconds"),
            "source": "KIWOOM_REAL_REST",
            "mode": "PRODUCTION",
        }

    async def get_daily_bars(self, code: str) -> list[dict[str, Any]]:
        request_body = {
            "stk_cd": code,
            "base_dt": date.today().strftime("%Y%m%d"),
            "upd_stkpc_tp": "1",
        }
        rows: list[dict[str, Any]] = []
        cont_yn, next_key = "N", ""
        # Continue through the provider's pagination so enough completed daily
        # candles are available for the v3.0 Turtle calculations.
        for _ in range(10):
            payload, cont_yn, next_key = await self._post(
                "ka10081",
                "/api/dostk/chart",
                request_body,
                cont_yn=cont_yn,
                next_key=next_key,
                include_headers=True,
            )
            page_rows = payload.get("stk_dt_pole_chart_qry")
            if not isinstance(page_rows, list):
                raise KiwoomError(
                    "DAILY_CHART_UNRECOGNIZED",
                    "키움 일봉 응답 형식을 확인할 수 없습니다. 공식 API 응답 필드를 점검해야 합니다.",
                )
            rows.extend(row for row in page_rows if isinstance(row, dict))
            if len(rows) >= 260 or cont_yn != "Y" or not next_key:
                break

        bars: list[dict[str, Any]] = []
        for row in rows:
            day = str(row.get("dt") or row.get("date") or "")
            close = parse_number(row.get("cur_prc") or row.get("close_pric"), absolute=True)
            high = parse_number(row.get("high_pric"), absolute=True)
            low = parse_number(row.get("low_pric"), absolute=True)
            open_price = parse_number(row.get("open_pric"), absolute=True)
            volume = parse_number(row.get("trde_qty"), absolute=True)
            if len(day) == 8 and day.isdigit() and close and high and low and open_price:
                bars.append({
                    "date": day,
                    "open": open_price,
                    "high": high,
                    "low": low,
                    "close": close,
                    "volume": volume or 0,
                })

        # De-duplicate bars returned across page boundaries and sort oldest first.
        unique = {bar["date"]: bar for bar in bars}
        bars = sorted(unique.values(), key=lambda item: item["date"])
        today = date.today().strftime("%Y%m%d")
        completed = [bar for bar in bars if bar["date"] < today]
        if len(completed) < 120:
            raise KiwoomError("HISTORY_SHORT", "터틀 기준값 계산에 필요한 완료된 일봉 120개를 확보하지 못했습니다.")
        return completed[-260:]


def parse_number(value: Any, absolute: bool = False) -> float | None:
    if value is None or value == "":
        return None
    try:
        parsed = float(str(value).replace(",", "").replace("+", "").strip())
    except (TypeError, ValueError):
        return None
    if absolute:
        parsed = abs(parsed)
    return parsed
