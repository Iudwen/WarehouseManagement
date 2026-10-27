import json
import unittest
from datetime import date, timedelta

import numpy as np
import pandas as pd

from data_mining.models.train_horizon_forecast import (
    DAILY_REPORT_FILES,
    METADATA_FILE,
    MODEL_FILE,
    NEXT_FORECAST_FILE,
    REPORT_FILE,
    RESULTS_FILE,
    STATUS_FILE,
    HORIZONS,
    ForecastNotReadyError,
    build_horizon_dataset,
    build_live_forecasts,
    calculate_forecast_metrics,
    evaluate_horizon,
)


class TestHorizonForecastDataset(unittest.TestCase):
    def test_metrics_and_mape_zero_actual_handling(self):
        metrics = calculate_forecast_metrics([0, 10, 20], [5, 8, 24])
        self.assertAlmostEqual(metrics["mae_units_per_series_horizon"], 11 / 3)
        self.assertAlmostEqual(
            metrics["rmse_units_per_series_horizon"],
            np.sqrt((25 + 4 + 16) / 3),
        )
        self.assertAlmostEqual(metrics["mape_percent"], 20.0)
        self.assertEqual(metrics["mape_included_rows"], 2)
        self.assertEqual(metrics["mape_excluded_zero_actual_rows"], 1)
        self.assertAlmostEqual(metrics["wape_percent"], 110 / 3)

    def make_daily_data(self, day_count=366):
        start = date(2025, 1, 1)
        rows = []
        for warehouse, product, scale in [
            ("HN01", "SP001", 1),
            ("DN01", "SP002", 2),
        ]:
            for offset in range(day_count):
                rows.append({
                    "ngay": (start + timedelta(days=offset)).isoformat(),
                    "ma_kho": warehouse,
                    "ma_sp": product,
                    "nhu_cau_xuat": (offset % 9) * scale,
                })
        return pd.DataFrame(rows)

    def test_horizon_target_is_sum_of_the_following_days(self):
        daily = self.make_daily_data(90)
        for horizon in HORIZONS:
            features, _columns = build_horizon_dataset(daily, horizon)
            row = features[
                (features["orig_ma_kho"] == "HN01")
                & (features["ngay"] == pd.Timestamp("2025-02-01"))
            ].iloc[0]
            actual = daily[
                (daily["ma_kho"] == "HN01")
                & daily["ngay"].between("2025-02-02", (
                    pd.Timestamp("2025-02-01") + pd.Timedelta(days=horizon)
                ).strftime("%Y-%m-%d"))
            ]["nhu_cau_xuat"].sum()
            self.assertEqual(row["target_total"], actual)

    def test_current_and_future_targets_do_not_leak_into_features(self):
        daily = self.make_daily_data(70)
        baseline, _columns = build_horizon_dataset(daily, 15)
        origin = pd.Timestamp("2025-02-01")
        baseline_row = baseline[
            (baseline["orig_ma_kho"] == "HN01")
            & (baseline["ngay"] == origin)
        ].iloc[0]

        changed = daily.copy()
        changed_dates = pd.to_datetime(changed["ngay"])
        changed.loc[
            (changed["ma_kho"] == "HN01")
            & changed_dates.between(
                origin + pd.Timedelta(days=1),
                origin + pd.Timedelta(days=15),
            ),
            "nhu_cau_xuat",
        ] += 1000
        changed_features, _columns = build_horizon_dataset(changed, 15)
        changed_row = changed_features[
            (changed_features["orig_ma_kho"] == "HN01")
            & (changed_features["ngay"] == origin)
        ].iloc[0]

        for column in ("lag_1", "lag_7", "lag_14", "lag_30", "mean_30", "sum_30"):
            self.assertEqual(baseline_row[column], changed_row[column])
        self.assertNotEqual(baseline_row["target_total"], changed_row["target_total"])

    def test_incomplete_grid_is_rejected(self):
        daily = self.make_daily_data(60).drop(index=5)
        with self.assertRaisesRegex(ValueError, "missing rows are not assumed"):
            build_horizon_dataset(daily, 15)

    def test_live_forecast_includes_latest_origin_and_blocks_stale_source(self):
        daily = self.make_daily_data(70)
        models = {}
        for horizon in HORIZONS:
            _features, feature_columns = build_horizon_dataset(daily, horizon)
            models[horizon] = {
                "model": _ConstantModel(45.0),
                "feature_columns": feature_columns,
                "calibration_scale": 1.0,
            }

        latest_date = pd.to_datetime(daily["ngay"]).max().date()
        forecasts = build_live_forecasts(daily, models, as_of=latest_date)
        self.assertEqual(len(forecasts), 4)
        self.assertTrue((forecasts["predicted_total_demand"] == 45.0).all())
        self.assertEqual(
            set(forecasts["forecast_end_date"]),
            {
                (latest_date + timedelta(days=15)).isoformat(),
                (latest_date + timedelta(days=30)).isoformat(),
            },
        )
        with self.assertRaisesRegex(ForecastNotReadyError, "days old"):
            build_live_forecasts(
                daily,
                models,
                as_of=latest_date + timedelta(days=8),
            )

    def test_live_baseline_uses_trailing_daily_mean(self):
        daily = self.make_daily_data(70)
        models = {}
        for horizon in HORIZONS:
            _features, feature_columns = build_horizon_dataset(daily, horizon)
            models[horizon] = {
                "model": None,
                "feature_columns": feature_columns,
                "calibration_scale": 1.0,
            }
        latest_date = pd.to_datetime(daily["ngay"]).max().date()
        forecasts = build_live_forecasts(daily, models, as_of=latest_date)
        for row in forecasts.itertuples():
            entity_history = daily[
                (daily["ma_kho"] == row.ma_kho)
                & (daily["ma_sp"] == row.ma_sp)
            ].tail(30)
            expected = entity_history["nhu_cau_xuat"].mean() * row.horizon_days
            self.assertAlmostEqual(row.predicted_total_demand, expected, places=2)

    def test_holdout_windows_are_spaced_and_model_is_finite(self):
        daily = self.make_daily_data()
        for horizon in HORIZONS:
            dataset, feature_columns = build_horizon_dataset(daily, horizon)
            result = evaluate_horizon(dataset, feature_columns, horizon)
            origins = pd.to_datetime(result["holdout_origins"])
            self.assertGreaterEqual(len(origins), 2)
            self.assertTrue(
                ((origins.to_series().diff().dropna().dt.days) >= horizon).all()
            )
            metrics = result["holdout_metrics"]
            self.assertTrue(np.isfinite([
                value["wape_percent"] for value in metrics.values()
            ]).all())
            for value in metrics.values():
                self.assertGreater(value["mae_units_per_series_horizon"], 0)
                self.assertGreater(value["rmse_units_per_series_horizon"], 0)
                self.assertGreaterEqual(value["mape_included_rows"], 0)
                self.assertGreaterEqual(value["mape_excluded_zero_actual_rows"], 0)
            self.assertEqual(result["holdout_rows"], len(result["results"]))


class TestHorizonForecastArtifacts(unittest.TestCase):
    def test_artifacts_match_reported_holdout_metrics_and_live_gate(self):
        for path in (METADATA_FILE, MODEL_FILE, NEXT_FORECAST_FILE, REPORT_FILE, RESULTS_FILE, STATUS_FILE):
            self.assertTrue(path.exists(), f"Missing horizon forecast artifact: {path}")
        metadata = json.loads(METADATA_FILE.read_text(encoding="utf-8"))
        results = pd.read_csv(RESULTS_FILE, encoding="utf-8-sig")
        live = pd.read_csv(NEXT_FORECAST_FILE, encoding="utf-8-sig")
        status = json.loads(STATUS_FILE.read_text(encoding="utf-8"))

        for horizon in HORIZONS:
            horizon_results = results[results["horizon_days"] == horizon]
            summary = metadata["horizons"][str(horizon)]
            self.assertEqual(len(horizon_results), summary["holdout_rows"])
            selected = summary["selected_model"]
            prediction = horizon_results["predicted_total_demand"]
            actual = horizon_results["actual_total_demand"]
            self.assertAlmostEqual(
                float(np.abs(actual - prediction).sum() / np.abs(actual).sum() * 100),
                summary["holdout_metrics"][selected]["wape_percent"],
                places=3,
            )
            metrics = calculate_forecast_metrics(actual, prediction)
            for metric_name in (
                "mae_units_per_series_horizon",
                "rmse_units_per_series_horizon",
                "mape_percent",
                "mape_included_rows",
                "mape_excluded_zero_actual_rows",
                "wape_percent",
            ):
                self.assertAlmostEqual(
                    metrics[metric_name],
                    summary["holdout_metrics"][selected][metric_name],
                    delta=0.01,
                )
            self.assertEqual(
                horizon_results["forecast_origin_date"].nunique(),
                len(summary["holdout_origins"]),
            )

        self.assertIn(
            "15-day and 30-day cumulative demand forecast evaluation",
            REPORT_FILE.read_text(encoding="utf-8"),
        )
        self.assertIn(
            "15-day and 30-day cumulative forecasts",
            DAILY_REPORT_FILES[0].read_text(encoding="utf-8"),
        )
        self.assertEqual(
            DAILY_REPORT_FILES[0].read_text(encoding="utf-8"),
            DAILY_REPORT_FILES[1].read_text(encoding="utf-8"),
        )
        if status["status"] == "BLOCKED_SOURCE_NOT_READY":
            self.assertTrue(live.empty)
        else:
            self.assertEqual(set(live["horizon_days"]), set(HORIZONS))


class _ConstantModel:
    def __init__(self, value):
        self.value = value

    def predict(self, features):
        return np.full(len(features), self.value)


if __name__ == "__main__":
    unittest.main()
