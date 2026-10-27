import unittest
from datetime import date

from data_mining.publish_superset_data import build_forecast_rows, build_history_rows


class TestSupersetPublisher(unittest.TestCase):
    def test_build_forecast_rows_separates_holdout_series_and_calculates_metrics(self):
        source_rows = [
            {
                "ngay": "2026-01-01",
                "ma_kho": "HN01",
                "ma_sp": "SP001",
                "thuc_te": "10",
                "du_bao_baseline": "8",
                "du_bao_ridge": "12",
            },
            {
                "ngay": "2026-01-02",
                "ma_kho": "HN01",
                "ma_sp": "SP001",
                "thuc_te": "0",
                "du_bao_baseline": "2",
                "du_bao_ridge": "0",
            },
        ]

        series, metrics, errors = build_forecast_rows(source_rows)

        self.assertEqual(len(series), 6)
        self.assertEqual(series[0][0], date(2026, 1, 1))
        self.assertEqual(series[0][3:5], ("Actual", 10.0))
        self.assertTrue(all(row[5] == "HISTORICAL_HOLDOUT" for row in series))
        self.assertEqual(len(errors), 4)

        by_model = {row[0]: row for row in metrics}
        baseline = by_model["Baseline (rolling mean 7)"]
        ridge = by_model["Ridge Regression"]
        self.assertAlmostEqual(baseline[1], 2.0)
        self.assertAlmostEqual(baseline[2], 2.0)
        self.assertAlmostEqual(baseline[3], 20.0)
        self.assertAlmostEqual(baseline[4], 40.0)
        self.assertEqual(baseline[5:7], (2, 1))
        self.assertAlmostEqual(ridge[1], 1.0)
        self.assertAlmostEqual(ridge[2], round(2**0.5, 4))
        self.assertAlmostEqual(ridge[3], 20.0)
        self.assertAlmostEqual(ridge[4], 20.0)

    def test_build_history_rows_parses_calendar_and_optional_weather(self):
        rows = build_history_rows(
            [
                {
                    "ngay": "2026-02-01",
                    "ma_kho": " DN01 ",
                    "ma_sp": " SP001 ",
                    "nhu_cau_xuat": "3",
                    "nhiet_do_tb": "",
                    "luong_mua": "0.5",
                    "thu_trong_tuan": "7",
                    "ten_thu": "Chủ Nhật",
                    "la_cuoi_tuan": "1",
                    "la_ngay_le": "0",
                    "ten_ngay_le": "",
                }
            ]
        )

        self.assertEqual(
            rows,
            [
                (
                    date(2026, 2, 1),
                    "DN01",
                    "SP001",
                    3.0,
                    None,
                    0.5,
                    7,
                    "Chủ Nhật",
                    True,
                    False,
                    "",
                )
            ],
        )


if __name__ == "__main__":
    unittest.main()
