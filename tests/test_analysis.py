from __future__ import annotations

import unittest
from datetime import date, timedelta

from backend.analysis import analyze_stock


class StockAnalysisTests(unittest.TestCase):
    def setUp(self) -> None:
        start = date(2025, 1, 1)
        self.bars = []
        close = 1000.0
        for index in range(140):
            close += 2 if index % 4 else -1
            self.bars.append({
                "date": (start + timedelta(days=index)).strftime("%Y%m%d"),
                "open": close - 1,
                "high": close + 10 + (index % 5),
                "low": close - 10 - (index % 3),
                "close": close,
                "volume": 1000 + index * 5,
            })
        self.quote = {
            "code": "000001",
            "name": "테스트",
            "price": self.bars[-1]["close"] + 100,
            "change": 100,
            "changeRate": 1.2,
            "asOf": "2026-01-01T10:00:00+09:00",
            "source": "TEST_FIXTURE",
            "mode": "TEST",
        }

    def test_turtle_levels_use_recent_completed_bars(self) -> None:
        result = analyze_stock(self.quote, self.bars)
        self.assertEqual(result["turtle"]["system1Entry20High"], max(row["high"] for row in self.bars[-20:]))
        self.assertEqual(result["turtle"]["system2Entry55High"], max(row["high"] for row in self.bars[-55:]))
        self.assertEqual(result["turtle"]["system1Exit10Low"], min(row["low"] for row in self.bars[-10:]))
        self.assertEqual(result["turtle"]["system2Exit20Low"], min(row["low"] for row in self.bars[-20:]))
        self.assertEqual(result["turtle"]["lastCompletedBarDate"], self.bars[-1]["date"])
        self.assertEqual(result["turtle"]["historyBars"], len(self.bars))
        self.assertEqual(result["turtle"]["status"], "ENTRY_READY")

    def test_atr_uses_wilder_smoothing(self) -> None:
        result = analyze_stock(self.quote, self.bars)
        true_ranges = []
        for index, bar in enumerate(self.bars):
            previous_close = self.bars[index - 1]["close"] if index else bar["close"]
            true_ranges.append(max(
                bar["high"] - bar["low"],
                abs(bar["high"] - previous_close),
                abs(bar["low"] - previous_close),
            ))
        expected = sum(true_ranges[:20]) / 20
        for true_range in true_ranges[20:]:
            expected = ((expected * 19) + true_range) / 20
        self.assertAlmostEqual(result["turtle"]["nAtr20"], expected, places=8)
        self.assertAlmostEqual(result["technical"]["atr20"], expected, places=8)

    def test_rsi_uses_wilder_smoothing(self) -> None:
        result = analyze_stock(self.quote, self.bars)
        changes = [
            self.bars[index]["close"] - self.bars[index - 1]["close"]
            for index in range(1, len(self.bars))
        ]
        gains = [max(change, 0.0) for change in changes]
        losses = [max(-change, 0.0) for change in changes]
        average_gain = sum(gains[:14]) / 14
        average_loss = sum(losses[:14]) / 14
        for gain, loss in zip(gains[14:], losses[14:]):
            average_gain = ((average_gain * 13) + gain) / 14
            average_loss = ((average_loss * 13) + loss) / 14
        expected = 100.0 if average_loss == 0 else 100.0 - (100.0 / (1.0 + average_gain / average_loss))
        self.assertAlmostEqual(result["technical"]["rsi14"], expected, places=8)

    def test_rejects_insufficient_history(self) -> None:
        with self.assertRaisesRegex(ValueError, "최소 55개"):
            analyze_stock(self.quote, self.bars[:54])

    def test_rejects_invalid_quote_price(self) -> None:
        for price in (0, -1, float("nan"), float("inf")):
            with self.subTest(price=price), self.assertRaisesRegex(ValueError, "현재가"):
                analyze_stock({**self.quote, "price": price}, self.bars)

    def test_rejects_invalid_ohlc(self) -> None:
        bars = [dict(row) for row in self.bars]
        bars[-1]["high"] = bars[-1]["low"] - 1
        with self.assertRaisesRegex(ValueError, "고가가 저가보다"):
            analyze_stock(self.quote, bars)

    def test_indicators_are_numeric_and_score_is_not_probability(self) -> None:
        result = analyze_stock(self.quote, self.bars)
        self.assertIsInstance(result["technical"]["rsi14"], float)
        self.assertGreaterEqual(result["analysis"]["score"], 0)
        self.assertLessEqual(result["analysis"]["score"], 100)
        self.assertIn("확률 아님", result["analysis"]["scoreLabel"])
        self.assertFalse(result["dataQuality"]["mockFallback"])


if __name__ == "__main__":
    unittest.main()
