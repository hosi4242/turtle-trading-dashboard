"""Read-only Kiwoom mock-feed smoke test for Samsung Electronics.

This script only subscribes to realtime stock-trade data (API type 0B).
It contains no order/account API calls and never prints credentials or tokens.
Run during KRX trading hours for the most reliable first test.
"""
import asyncio
import logging

from kiwoom import get_ws_client
from kiwoom.realtime import collect_realtime

API_URL = "/api/dostk/websocket"
SYMBOL = "005930"
TIMEOUT_SECONDS = 45

COLUMNS = {
    "20": "execution_time",
    "10": "current_price",
    "11": "change",
    "12": "change_percent",
    "15": "trade_volume",
    "13": "cumulative_volume",
    "16": "open",
    "17": "high",
    "18": "low",
}


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    registration = {
        "trnm": "REG",
        "grp_no": "1",
        "refresh": "1",
        "data": [{"item": [SYMBOL], "type": ["0B"]}],
    }

    print(f"Connecting to Kiwoom DEMO realtime feed for {SYMBOL}...")
    try:
        result = await asyncio.wait_for(
            collect_realtime(
                get_ws_client(),
                api_url=API_URL,
                body=registration,
                columns=COLUMNS,
                max_messages=1,
            ),
            timeout=TIMEOUT_SECONDS,
        )
    except TimeoutError:
        raise SystemExit(
            "No realtime event received within 45 seconds. "
            "Confirm DEMO credentials/profile, network access, and that the "
            "KRX market is open; this is not proof that authentication failed."
        )

    data = result.get("data")
    if data is None or getattr(data, "empty", False):
        raise SystemExit("Connected, but no usable quote row was returned.")

    print("Read-only realtime test succeeded. First received row:")
    print(data.to_string(index=False))
    print("No orders were sent.")


if __name__ == "__main__":
    asyncio.run(main())
