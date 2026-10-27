import json
import unittest
from datetime import date, timedelta

import numpy as np
import pandas as pd

from data_mining.models.train_weekly_forecast import (
    FEATURES_FILE,
    FORECAST_FILE,
    INPUT_FILE,
    MODEL_FILE,
    MODEL_METADATA_FILE,
    NEXT_FORECAST_FILE,
    REPORT_FILE,
    NEXT_FORECAST_STATUS_FILE,
    ForecastNotReadyError,
    build_next_week_forecast,
    build_weekly_features,
    calculate_wape,
)


class TestWeeklyForecastFeatures(unittest.TestCase):
    def make_daily_data(self, day_count=112):
        start = date(2025, 1, 6)
        return pd.DataFrame([
            {
                "ngay": (start + timedelta(days=offset)).isoformat(),
                "ma_kho": "HN01",
                "ma_sp": "SP001",
                "nhu_cau_xuat": offset + 1,
            }
            for offset in range(day_count)
        ])

    def test_weekly_lag_does_not_use_current_week_target(self):
        daily = self.make_daily_data()
        features, _columns, _start, _end = build_weekly_features(daily)
        row = features.iloc[0]
        current_week = pd.to_datetime(row["week_start"])
        dates = pd.to_datetime(daily["ngay"])
        previous_week_rows = dates.between(
            current_week - pd.Timedelta(days=7),
            current_week - pd.Timedelta(days=1),
        )
        self.assertEqual(
            row["lag_1"],
            daily.loc[previous_week_rows, "nhu_cau_xuat"].sum(),
        )

        changed = daily.copy()
        current_week_end = current_week + pd.Timedelta(days=6)
        dates = pd.to_datetime(changed["ngay"])
        current_week_rows = dates.between(current_week, current_week_end)
        changed.loc[current_week_rows, "nhu_cau_xuat"] += 500
        changed_features, _columns, _start, _end = build_weekly_features(changed)
        changed_row = changed_features[
            changed_features["week_start"] == row["week_start"]
        ].iloc[0]

        self.assertNotEqual(row["nhu_cau_xuat"], changed_row["nhu_cau_xuat"])
        self.assertEqual(row["lag_1"], changed_row["lag_1"])
        self.assertEqual(row["mean_4"], changed_row["mean_4"])

    def test_incomplete_analytical_grid_is_rejected(self):
        daily = self.make_daily_data()
        with self.assertRaisesRegex(ValueError, "missing rows are not assumed"):
            build_weekly_features(daily.drop(index=10))

    def test_next_week_forecast_requires_fresh_complete_week(self):
        daily = self.make_daily_data()
        features, feature_columns, _start, _end = build_weekly_features(daily)
        source_end = pd.to_datetime(daily["ngay"]).max().date()
        model = _ConstantModel(12.5)

        forecast = build_next_week_forecast(
            daily,
            model,
            feature_columns,
            calibration_scale=0.97,
            as_of=source_end,
        )
        self.assertEqual(forecast["tuan_bat_dau"].iloc[0], "2025-04-28")
        self.assertTrue((forecast["du_bao_nhu_cau_tuan"] >= 0).all())
        self.assertEqual(len(forecast), 1)

        with self.assertRaisesRegex(ForecastNotReadyError, "complete Sunday"):
            build_next_week_forecast(
                daily.iloc[:-1],
                model,
                feature_columns,
                calibration_scale=1.0,
                as_of=source_end,
            )

        with self.assertRaisesRegex(ForecastNotReadyError, "days old"):
            build_next_week_forecast(
                daily,
                model,
                feature_columns,
                calibration_scale=1.0,
                as_of=source_end + timedelta(days=8),
            )


class TestWeeklyForecastArtifacts(unittest.TestCase):
    def test_weekly_model_holdout_and_registry_are_consistent(self):
        for path in (FORECAST_FILE, MODEL_FILE, FEATURES_FILE, MODEL_METADATA_FILE, REPORT_FILE):
            self.assertTrue(path.exists(), f"Missing weekly forecast artifact: {path}")
        self.assertTrue(NEXT_FORECAST_STATUS_FILE.exists())

        results = pd.read_csv(FORECAST_FILE, encoding="utf-8-sig")
        metadata = json.loads(MODEL_METADATA_FILE.read_text(encoding="utf-8"))
        self.assertEqual(len(results), metadata["holdout_rows"])
        self.assertEqual(
            results["tuan_bat_dau"].nunique(),
            metadata["holdout_weeks"],
        )
        self.assertTrue((results["du_bao_primary"] >= 0).all())
        self.assertAlmostEqual(
            calculate_wape(
                results["thuc_te_tuan"],
                results["du_bao_primary"],
            ),
            metadata["holdout_wape_percent"],
            delta=0.001,
        )
        self.assertLess(
            pd.Timestamp(metadata["holdout_training_end_week"]),
            pd.Timestamp(metadata["holdout_start_week"]),
        )
        self.assertGreaterEqual(
            pd.Timestamp(metadata["production_training_end_week"]),
            pd.Timestamp(metadata["holdout_end_week"]),
        )
        self.assertIn("latest observed daily row", REPORT_FILE.read_text(encoding="utf-8"))
        status = json.loads(NEXT_FORECAST_STATUS_FILE.read_text(encoding="utf-8"))
        self.assertEqual(status["status"], "BLOCKED_SOURCE_NOT_READY")
        live_results = pd.read_csv(NEXT_FORECAST_FILE, encoding="utf-8-sig")
        self.assertTrue(live_results.empty)

        import joblib

        analytical = pd.read_csv(INPUT_FILE, encoding="utf-8-sig")
        weekly_features, _columns, _start, _end = build_weekly_features(analytical)
        saved_columns = joblib.load(FEATURES_FILE)
        saved_model = joblib.load(MODEL_FILE)
        predictions = saved_model.predict(weekly_features[saved_columns])
        self.assertEqual(len(predictions), len(weekly_features))
        self.assertTrue(np.isfinite(predictions).all())


class _ConstantModel:
    def __init__(self, value):
        self.value = value

    def predict(self, features):
        return np.full(len(features), self.value)


if __name__ == "__main__":
    unittest.main()
