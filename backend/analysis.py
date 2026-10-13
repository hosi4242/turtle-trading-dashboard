from __future__ import annotations

from statistics import mean
from typing import Any


def _sma(values: list[float], period: int) -> float | None:
    if len(values) < period:
        return None
    return mean(values[-period:])


def _rsi(values: list[float], period: int = 14) -> float | None:
    if len(values) <= period:
        return None
    changes = [values[i] - values[i - 1] for i in range(1, len(values))]
    gains = [max(change, 0.0) for change in changes[-period:]]
    losses = [max(-change, 0.0) for change in changes[-period:]]
    average_gain, average_loss = mean(gains), mean(losses)
    if average_loss == 0:
        return 100.0 if average_gain else 50.0
    relative_strength = average_gain / average_loss
    return 100.0 - (100.0 / (1.0 + relative_strength))


def _ema(values: list[float], period: int) -> list[float]:
    if not values:
        return []
    multiplier = 2.0 / (period + 1.0)
    result = [values[0]]
    for value in values[1:]:
        result.append(value * multiplier + result[-1] * (1.0 - multiplier))
    return result


def analyze_stock(quote: dict[str, Any], bars: list[dict[str, Any]]) -> dict[str, Any]:
    closes = [float(bar["close"]) for bar in bars]
    highs = [float(bar["high"]) for bar in bars]
    lows = [float(bar["low"]) for bar in bars]
    volumes = [float(bar["volume"]) for bar in bars]
    current_price = float(quote["price"])

    true_ranges: list[float] = []
    for index, bar in enumerate(bars):
        previous_close = closes[index - 1] if index else float(bar["close"])
        true_ranges.append(max(
            float(bar["high"]) - float(bar["low"]),
            abs(float(bar["high"]) - previous_close),
            abs(float(bar["low"]) - previous_close),
        ))

    atr20 = mean(true_ranges[-20:])
    entry20 = max(highs[-20:])
    entry55 = max(highs[-55:])
    exit10 = min(lows[-10:])
    exit20 = min(lows[-20:])
    sma20 = _sma(closes, 20)
    sma50 = _sma(closes, 50)
    ema12, ema26 = _ema(closes, 12), _ema(closes, 26)
    macd_line = [fast - slow for fast, slow in zip(ema12, ema26)]
    signal_line = _ema(macd_line, 9)
    macd = macd_line[-1]
    macd_signal = signal_line[-1]
    average_volume20 = _sma(volumes, 20)
    volume_ratio = (volumes[-1] / average_volume20) if average_volume20 else None
    rsi14 = _rsi(closes, 14)

    trend = "상승 추세" if sma20 is not None and sma50 is not None and current_price > sma20 > sma50 else (
        "하락 추세" if sma20 is not None and sma50 is not None and current_price < sma20 < sma50 else "혼조"
    )
    score_parts = [
        1 if sma20 is not None and current_price > sma20 else -1,
        1 if sma20 is not None and sma50 is not None and sma20 > sma50 else -1,
        1 if macd > macd_signal else -1,
        1 if rsi14 is not None and 45 <= rsi14 <= 70 else (-1 if rsi14 is not None and rsi14 > 75 else 0),
        1 if volume_ratio is not None and volume_ratio >= 1.2 else 0,
    ]
    score = round((sum(score_parts) + len(score_parts)) / (2 * len(score_parts)) * 100)

    return {
        "code": quote["code"],
        "name": quote["name"],
        "quote": quote,
        "turtle": {
            "system1Entry20High": entry20,
            "system2Entry55High": entry55,
            "system1Exit10Low": exit10,
            "system2Exit20Low": exit20,
            "nAtr20": atr20,
            "lastCompletedBarDate": bars[-1]["date"],
            "historyBars": len(bars),
            "status": "ENTRY_READY" if current_price >= entry20 else "WATCHING",
            "statusBasis": "실제 현재가와 완료된 일봉 20일 고가 비교",
        },
        "chart": [
            {"date": f"{bar['date'][:4]}-{bar['date'][4:6]}-{bar['date'][6:]}", "close": float(bar["close"])}
            for bar in bars[-60:]
        ],
        "technical": {
            "trend": trend,
            "sma20": sma20,
            "sma50": sma50,
            "rsi14": rsi14,
            "macd": macd,
            "macdSignal": macd_signal,
            "atr20": atr20,
            "volumeAverage20": average_volume20,
            "volumeRatio20": volume_ratio,
        },
        "analysis": {
            "score": score,
            "scoreLabel": "규칙 기반 참고 점수(확률 아님)",
            "horizons": {
                "SHORT": "1~5거래일",
                "MEDIUM": "2~4주",
                "LONG": "3~12개월",
            },
            "limitations": [
                "수급·뉴스·공시·실적 데이터는 이 초기 단계에서 연결하지 않았습니다.",
                "이 점수는 상승 확률이 아니며 매수·매도 권고가 아닙니다.",
            ],
        },
        "dataQuality": {
            "source": "KIWOOM_REAL_REST",
            "mode": "PRODUCTION",
            "asOf": quote["asOf"],
            "completedDailyBars": len(bars),
            "mockFallback": False,
        },
    }
