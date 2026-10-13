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
        self.assertEqual(result["turtle"]["status"], "ENTRY_READY")

    def test_indicators_are_numeric_and_score_is_not_probability(self) -> None:
        result = analyze_stock(self.quote, self.bars)
        self.assertIsInstance(result["technical"]["rsi14"], float)
        self.assertGreaterEqual(result["analysis"]["score"], 0)
        self.assertLessEqual(result["analysis"]["score"], 100)
        self.assertIn("확률 아님", result["analysis"]["scoreLabel"])
        self.assertFalse(result["dataQuality"]["mockFallback"])


if __name__ == "__main__":
    unittest.main()
