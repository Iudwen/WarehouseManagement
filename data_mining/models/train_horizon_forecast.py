import json
import math
import sys
from datetime import date
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parents[2]
INPUT_FILE = BASE_DIR / "data_mining" / "datasets" / "gold" / "analytical_dataset.csv"
OUTPUT_DIR = BASE_DIR / "data_mining" / "datasets" / "gold"
REGISTRY_DIR = BASE_DIR / "data_mining" / "models" / "model_registry"
RESULTS_FILE = OUTPUT_DIR / "horizon_forecast_results.csv"
NEXT_FORECAST_FILE = OUTPUT_DIR / "horizon_next_forecast.csv"
STATUS_FILE = OUTPUT_DIR / "horizon_live_forecast_status.json"
MODEL_FILE = REGISTRY_DIR / "horizon_models.joblib"
FEATURES_FILE = REGISTRY_DIR / "horizon_feature_columns.joblib"
METADATA_FILE = REGISTRY_DIR / "horizon_models.json"
REPORT_FILE = BASE_DIR / "data_mining" / "horizon_evaluation_report.md"
DAILY_REPORT_FILES = [
    BASE_DIR / "data_mining" / "evaluation_report.md",
    BASE_DIR / "data_mining" / "reports" / "evaluation_report.md",
]
HORIZONS = (15, 30)
TEST_RATIO = 0.20
VALIDATION_RATIO = 0.30
MAX_SOURCE_AGE_DAYS = 7
ENTITY_COLUMNS = ["ma_kho", "ma_sp"]
TARGET = "nhu_cau_xuat"
CALIBRATION_SCALES = np.arange(0.50, 1.501, 0.01)
LIVE_COLUMNS = [
    "horizon_days",
    "forecast_start_date",
    "forecast_end_date",
    "ma_kho",
    "ma_sp",
    "predicted_total_demand",
    "predicted_daily_average",
]
DAILY_REPORT_SECTION = "## 15-day and 30-day cumulative forecasts"


class ForecastNotReadyError(ValueError):
    pass


def calculate_wape(y_true, y_pred):
    actual = np.asarray(y_true, dtype=float)
    predicted = np.asarray(y_pred, dtype=float)
    denominator = np.abs(actual).sum()
    if denominator == 0:
        return float("nan")
    return float(np.abs(actual - predicted).sum() / denominator * 100)


def calculate_forecast_metrics(y_true, y_pred):
    actual = np.asarray(y_true, dtype=float)
    predicted = np.asarray(y_pred, dtype=float)
    absolute_errors = np.abs(actual - predicted)
    nonzero_actual = actual != 0
    mape = (
        float(np.mean(absolute_errors[nonzero_actual] / np.abs(actual[nonzero_actual])) * 100)
        if nonzero_actual.any()
        else float("nan")
    )
    return {
        "mae_units_per_series_horizon": float(np.mean(absolute_errors)),
        "rmse_units_per_series_horizon": float(
            np.sqrt(np.mean(np.square(actual - predicted)))
        ),
        "mape_percent": mape,
        "mape_excluded_zero_actual_rows": int((~nonzero_actual).sum()),
        "mape_included_rows": int(nonzero_actual.sum()),
        "wape_percent": calculate_wape(actual, predicted),
    }


def build_horizon_dataset(daily_data, horizon_days, include_targets=True):
    if horizon_days not in HORIZONS:
        raise ValueError(f"Unsupported forecast horizon: {horizon_days}")
    required = {"ngay", *ENTITY_COLUMNS, TARGET}
    missing = required - set(daily_data.columns)
    if missing:
        raise ValueError(
            "Analytical dataset is missing horizon forecast columns: "
            + ", ".join(sorted(missing))
        )

    daily = daily_data[["ngay", *ENTITY_COLUMNS, TARGET]].copy()
    daily["ngay"] = pd.to_datetime(daily["ngay"], errors="raise")
    daily[TARGET] = pd.to_numeric(daily[TARGET], errors="raise")
    if daily.empty:
        raise ValueError("Analytical dataset is empty.")
    if (
        not np.isfinite(daily[TARGET]).all()
        or (daily[TARGET] < 0).any()
        or daily[ENTITY_COLUMNS].isna().any().any()
    ):
        raise ValueError("Demand and entity identifiers must be valid and non-negative.")
    if daily.duplicated(["ngay", *ENTITY_COLUMNS]).any():
        raise ValueError("Analytical dataset contains duplicate date/series rows.")

    expected_dates = pd.date_range(daily["ngay"].min(), daily["ngay"].max(), freq="D")
    entity_count = daily[ENTITY_COLUMNS].drop_duplicates().shape[0]
    if (
        daily["ngay"].nunique() != len(expected_dates)
        or len(daily) != entity_count * len(expected_dates)
    ):
        raise ValueError(
            "Analytical dataset must contain one row for every date and "
            "warehouse-product series; missing rows are not assumed to be zero demand."
        )

    daily = daily.sort_values([*ENTITY_COLUMNS, "ngay"]).reset_index(drop=True)
    grouped = daily.groupby(ENTITY_COLUMNS, sort=False)[TARGET]
    for lag in (0, 6, 13, 29):
        daily[f"lag_{lag + 1}"] = grouped.shift(lag)
    for window in (7, 14, 30):
        daily[f"mean_{window}"] = grouped.transform(
            lambda values: values.rolling(window, min_periods=window).mean()
        )
        daily[f"sum_{window}"] = grouped.transform(
            lambda values: values.rolling(window, min_periods=window).sum()
        )
    daily["zero_rate_30"] = grouped.transform(
        lambda values: (values == 0).rolling(30, min_periods=30).mean()
    )

    future_total = grouped.transform(
        lambda values: values.shift(-1)
        .rolling(horizon_days, min_periods=horizon_days)
        .sum()
        .shift(-(horizon_days - 1))
    )
    daily["target_total"] = future_total
    daily["target_end_date"] = daily["ngay"] + pd.Timedelta(days=horizon_days)
    daily["orig_ma_kho"] = daily["ma_kho"]
    daily["orig_ma_sp"] = daily["ma_sp"]
    required_features = [
        "lag_1",
        "lag_7",
        "lag_14",
        "lag_30",
        "mean_7",
        "mean_14",
        "mean_30",
        "sum_7",
        "sum_14",
        "sum_30",
        "zero_rate_30",
    ]
    if include_targets:
        required_features.append("target_total")
    daily = daily.dropna(subset=required_features).copy()
    daily = pd.get_dummies(
        daily,
        columns=ENTITY_COLUMNS,
        drop_first=False,
        dtype=int,
    )
    feature_columns = [
        column
        for column in daily.columns
        if column.startswith(
            (
                "lag_",
                "mean_",
                "sum_",
                "zero_rate_",
                "ma_kho_",
                "ma_sp_",
            )
        )
    ]
    return daily, feature_columns


def select_calibration_scale(actual, predicted):
    return float(
        min(
            CALIBRATION_SCALES,
            key=lambda scale: (
                calculate_wape(actual, np.clip(predicted * scale, 0, None)),
                abs(scale - 1.0),
            ),
        )
    )


def spaced_origins(dates, first_date, last_date, horizon_days):
    candidates = [
        pd.Timestamp(day)
        for day in dates
        if first_date <= pd.Timestamp(day) <= last_date
    ]
    if not candidates:
        return []
    selected = [candidates[0]]
    for candidate in candidates[1:]:
        if (candidate - selected[-1]).days >= horizon_days:
            selected.append(candidate)
    return selected


def evaluate_horizon(dataset, feature_columns, horizon_days):
    origin_dates = np.sort(dataset["ngay"].unique())
    test_start_index = max(
        1,
        len(origin_dates) - max(1, int(math.ceil(len(origin_dates) * TEST_RATIO))),
    )
    test_start = pd.Timestamp(origin_dates[test_start_index])
    test_origins = spaced_origins(
        origin_dates,
        test_start,
        pd.Timestamp(origin_dates[-1]),
        horizon_days,
    )
    if len(test_origins) < 2:
        raise ValueError(
            f"Not enough non-overlapping holdout windows for {horizon_days}-day evaluation."
        )

    train_data = dataset[
        (dataset["ngay"] < test_start)
        & (dataset["target_end_date"] <= test_start)
    ].copy()
    if train_data.empty:
        raise ValueError(f"No leakage-free training rows for {horizon_days}-day horizon.")

    validation_start_index = max(
        1,
        len(np.sort(train_data["ngay"].unique()))
        - max(
            horizon_days * 3,
            int(
                math.ceil(
                    len(np.sort(train_data["ngay"].unique())) * VALIDATION_RATIO
                )
            ),
        ),
    )
    train_dates = np.sort(train_data["ngay"].unique())
    validation_start = pd.Timestamp(train_dates[validation_start_index])
    validation_origins = spaced_origins(
        np.sort(dataset["ngay"].unique()),
        validation_start,
        test_start - pd.Timedelta(days=horizon_days),
        horizon_days,
    )
    validation_rows = []
    for origin in validation_origins:
        fold_train = train_data[
            (train_data["ngay"] < origin)
            & (train_data["target_end_date"] <= origin)
        ]
        fold_validation = dataset[dataset["ngay"] == origin]
        if fold_train.empty or fold_validation.empty:
            continue
        model = Ridge(alpha=10.0)
        model.fit(fold_train[feature_columns], fold_train["target_total"])
        predicted = np.clip(model.predict(fold_validation[feature_columns]), 0, None)
        baseline = np.clip(
            fold_validation["mean_30"].to_numpy() * horizon_days,
            0,
            None,
        )
        validation_rows.append({
            "actual": fold_validation["target_total"].to_numpy(dtype=float),
            "ridge": predicted,
            "baseline": baseline,
        })
    if not validation_rows:
        raise ValueError(
            f"No leakage-free validation windows for {horizon_days}-day horizon."
        )

    validation_actual = np.concatenate([row["actual"] for row in validation_rows])
    validation_ridge = np.concatenate([row["ridge"] for row in validation_rows])
    calibration_scale = select_calibration_scale(validation_actual, validation_ridge)
    validation_scores = {
        "Ridge Regression": calculate_wape(
            validation_actual,
            np.clip(validation_ridge * calibration_scale, 0, None),
        ),
        "30-day rolling mean baseline": calculate_wape(
            validation_actual,
            np.concatenate([row["baseline"] for row in validation_rows]),
        ),
    }
    selected_model_name = min(validation_scores, key=validation_scores.get)

    holdout_rows = dataset[dataset["ngay"].isin(test_origins)].copy()
    holdout_model = Ridge(alpha=10.0)
    holdout_model.fit(train_data[feature_columns], train_data["target_total"])
    ridge_prediction = np.clip(
        holdout_model.predict(holdout_rows[feature_columns]) * calibration_scale,
        0,
        None,
    )
    baseline_prediction = np.clip(
        holdout_rows["mean_30"].to_numpy() * horizon_days,
        0,
        None,
    )
    predictions = {
        "Ridge Regression": ridge_prediction,
        "30-day rolling mean baseline": baseline_prediction,
    }
    holdout_metrics = {
        name: calculate_forecast_metrics(holdout_rows["target_total"], predicted)
        for name, predicted in predictions.items()
    }
    primary_predictions = predictions[selected_model_name]
    result = pd.DataFrame({
        "horizon_days": horizon_days,
        "forecast_origin_date": holdout_rows["ngay"].dt.date.astype(str).to_numpy(),
        "forecast_start_date": (
            holdout_rows["ngay"] + pd.Timedelta(days=1)
        ).dt.date.astype(str).to_numpy(),
        "forecast_end_date": holdout_rows["target_end_date"].dt.date.astype(str).to_numpy(),
        "ma_kho": holdout_rows["orig_ma_kho"].to_numpy(),
        "ma_sp": holdout_rows["orig_ma_sp"].to_numpy(),
        "actual_total_demand": holdout_rows["target_total"].to_numpy(),
        "predicted_total_demand": np.round(primary_predictions, 2),
        "predicted_daily_average": np.round(primary_predictions / horizon_days, 2),
    })
    result["absolute_error"] = np.round(
        np.abs(result["actual_total_demand"] - result["predicted_total_demand"]),
        2,
    )
    production_model = None
    if selected_model_name == "Ridge Regression":
        production_model = Ridge(alpha=10.0)
        production_model.fit(dataset[feature_columns], dataset["target_total"])
    return {
        "horizon_days": horizon_days,
        "model": production_model,
        "feature_columns": feature_columns,
        "calibration_scale": calibration_scale,
        "selected_model_name": selected_model_name,
        "validation_metrics": validation_scores,
        "validation_origins": len(validation_origins),
        "holdout_metrics": holdout_metrics,
        "holdout_origins": [origin.date().isoformat() for origin in test_origins],
        "holdout_rows": len(holdout_rows),
        "holdout_predictions": predictions,
        "results": result,
        "production_model": production_model,
    }


def build_live_forecasts(daily_data, models, as_of=None):
    source = daily_data.copy()
    source["ngay"] = pd.to_datetime(source["ngay"], errors="raise")
    latest_date = source["ngay"].max().date()
    current_date = as_of or date.today()
    age_days = (current_date - latest_date).days
    if age_days < 0:
        raise ForecastNotReadyError("Source data contains dates after the as-of date.")
    if age_days > MAX_SOURCE_AGE_DAYS:
        raise ForecastNotReadyError(
            f"Latest actual date {latest_date} is {age_days} days old; "
            f"maximum allowed age is {MAX_SOURCE_AGE_DAYS} days."
        )

    rows = []
    for horizon_days, model_data in models.items():
        features, _columns = build_horizon_dataset(
            source.assign(**{TARGET: pd.to_numeric(source[TARGET], errors="raise")}),
            horizon_days,
            include_targets=False,
        )
        latest_rows = features[features["ngay"] == pd.Timestamp(latest_date)].copy()
        feature_columns = model_data["feature_columns"]
        model_input = latest_rows.reindex(columns=feature_columns, fill_value=0)
        if latest_rows.empty or model_input.isna().any().any():
            raise ForecastNotReadyError(
                f"Not enough complete history to forecast {horizon_days} days."
            )
        if model_data["model"] is None:
            total_prediction = np.clip(
                latest_rows["mean_30"].to_numpy() * horizon_days,
                0,
                None,
            )
        else:
            total_prediction = np.clip(
                model_data["model"].predict(model_input)
                * model_data["calibration_scale"],
                0,
                None,
            )
        rows.extend({
            "horizon_days": horizon_days,
            "forecast_start_date": (
                latest_date + pd.Timedelta(days=1)
            ).isoformat(),
            "forecast_end_date": (
                latest_date + pd.Timedelta(days=horizon_days)
            ).isoformat(),
            "ma_kho": warehouse,
            "ma_sp": product,
            "predicted_total_demand": round(float(prediction), 2),
            "predicted_daily_average": round(
                float(prediction) / horizon_days,
                2,
            ),
        } for warehouse, product, prediction in zip(
            latest_rows["orig_ma_kho"],
            latest_rows["orig_ma_sp"],
            total_prediction,
        ))
    return pd.DataFrame(rows, columns=LIVE_COLUMNS)


def update_daily_report(horizon_summaries, source_date, source_age_days):
    section = [
        DAILY_REPORT_SECTION,
        "",
        "Direct horizon-specific Ridge Regression models predict the total demand "
        "per warehouse-product pair for the next 15 or 30 calendar days. Holdout "
        "target windows do not overlap.",
        "",
        "| Horizon | Model | MAE | RMSE | MAPE* | MAPE n | WAPE | Origins |",
        "|---:|---|---:|---:|---:|---:|---:|---:|",
    ]
    for horizon, summary in horizon_summaries.items():
        for model_name, metrics in summary["holdout_metrics"].items():
            section.append(
                f"| {horizon} days | {model_name} | "
                f"{metrics['mae_units_per_series_horizon']:.2f} | "
                f"{metrics['rmse_units_per_series_horizon']:.2f} | "
                f"{metrics['mape_percent']:.2f}% | "
                f"{metrics['mape_included_rows']}/{metrics['mape_excluded_zero_actual_rows']} excluded | "
                f"{metrics['wape_percent']:.2f}% | "
                f"{len(summary['holdout_origins'])} |"
            )
    section.extend([
        "",
        "`100 - WAPE` is an aggregate relative-error score, not classification "
        "accuracy, and these metrics are not comparable to the daily one-step "
        "forecast above. MAPE excludes rows with zero actual demand because "
        "percentage error is undefined for zero actuals. MAE and RMSE are measured "
        "in units per warehouse-product pair for the full horizon. The 30-day score is preliminary because it has only "
        f"{len(horizon_summaries[30]['holdout_origins'])} independent holdout origins. "
        "The current source date is "
        f"{source_date} ({source_age_days} days old); refresh actual data before "
        "using these forecasts operationally. Details: "
        "`data_mining/horizon_evaluation_report.md`.",
        "",
    ])
    section_text = "\n".join(section)
    for report_path in DAILY_REPORT_FILES:
        if not report_path.exists():
            continue
        current = report_path.read_text(encoding="utf-8")
        if DAILY_REPORT_SECTION in current:
            current = current[:current.index(DAILY_REPORT_SECTION)].rstrip()
        report_path.write_text(
            current + "\n\n" + section_text,
            encoding="utf-8",
        )


def main():
    if not INPUT_FILE.exists():
        raise FileNotFoundError(f"Analytical dataset not found: {INPUT_FILE}")
    source = pd.read_csv(INPUT_FILE, encoding="utf-8-sig")
    evaluations = {}
    models = {}
    results = []

    for horizon_days in HORIZONS:
        dataset, feature_columns = build_horizon_dataset(source, horizon_days)
        evaluation = evaluate_horizon(dataset, feature_columns, horizon_days)
        evaluations[horizon_days] = evaluation
        results.append(evaluation["results"])
        models[horizon_days] = {
            "model": evaluation["production_model"],
            "feature_columns": feature_columns,
            "calibration_scale": evaluation["calibration_scale"],
            "model_name": evaluation["selected_model_name"],
        }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    REGISTRY_DIR.mkdir(parents=True, exist_ok=True)
    pd.concat(results, ignore_index=True).to_csv(
        RESULTS_FILE,
        index=False,
        encoding="utf-8-sig",
    )
    joblib.dump(models, MODEL_FILE)
    joblib.dump(
        {horizon: model["feature_columns"] for horizon, model in models.items()},
        FEATURES_FILE,
    )

    latest_date = pd.to_datetime(source["ngay"], errors="raise").max().date()
    source_age_days = (date.today() - latest_date).days
    try:
        live_results = build_live_forecasts(source, models)
    except ForecastNotReadyError as error:
        pd.DataFrame(columns=LIVE_COLUMNS).to_csv(
            NEXT_FORECAST_FILE,
            index=False,
            encoding="utf-8-sig",
        )
        status = {
            "status": "BLOCKED_SOURCE_NOT_READY",
            "latest_observation_date": latest_date.isoformat(),
            "source_age_days": source_age_days,
            "reason": str(error),
        }
    else:
        live_results.to_csv(
            NEXT_FORECAST_FILE,
            index=False,
            encoding="utf-8-sig",
        )
        status = {
            "status": "READY",
            "latest_observation_date": latest_date.isoformat(),
            "source_age_days": source_age_days,
            "forecast_horizons_days": list(HORIZONS),
            "forecast_rows": len(live_results),
        }
    STATUS_FILE.write_text(
        json.dumps(status, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    metadata = {
        "source_latest_observation_date": latest_date.isoformat(),
        "source_age_days": source_age_days,
        "horizons": {
            str(horizon): {
                "selected_model": evaluation["selected_model_name"],
                "calibration_scale": evaluation["calibration_scale"],
                "validation_metrics_wape_percent": evaluation["validation_metrics"],
                "validation_origins": evaluation["validation_origins"],
                "holdout_metrics": evaluation["holdout_metrics"],
                "holdout_origins": evaluation["holdout_origins"],
                "holdout_rows": evaluation["holdout_rows"],
                "holdout_start_date": evaluation["results"]["forecast_start_date"].min(),
                "holdout_end_date": evaluation["results"]["forecast_end_date"].max(),
            }
            for horizon, evaluation in evaluations.items()
        },
        "note": (
            "Direct cumulative horizon forecasts. Holdout origins are spaced by the "
            "forecast horizon to prevent overlap between evaluated target windows. "
            "The 30-day result has few independent holdout windows and must be "
            "interpreted with that limitation."
        ),
    }
    METADATA_FILE.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    report_lines = [
        "# 15-day and 30-day cumulative demand forecast evaluation",
        "",
        f"- Latest source date: {latest_date}.",
        f"- Live status: {status['status']}.",
        f"- Live status reason: {status.get('reason', 'Forecasts available.')}",
        "",
        "| Horizon | Selected model | MAE | RMSE | MAPE* | MAPE n | WAPE | 100 - WAPE | Origins | Rows |",
        "|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for horizon, evaluation in evaluations.items():
        selected_metrics = evaluation["holdout_metrics"][
            evaluation["selected_model_name"]
        ]
        report_lines.append(
            f"| {horizon} days | {evaluation['selected_model_name']} | "
            f"{selected_metrics['mae_units_per_series_horizon']:.2f} | "
            f"{selected_metrics['rmse_units_per_series_horizon']:.2f} | "
            f"{selected_metrics['mape_percent']:.2f}% | "
            f"{selected_metrics['mape_included_rows']}/"
            f"{selected_metrics['mape_excluded_zero_actual_rows']} excluded | "
            f"{selected_metrics['wape_percent']:.2f}% | "
            f"{100 - selected_metrics['wape_percent']:.2f}% | "
            f"{len(evaluation['holdout_origins'])} | {evaluation['holdout_rows']:,} |"
        )
    report_lines.extend([
        "",
        "*MAPE is calculated only on rows where actual cumulative demand is greater "
        "than zero; zero-actual rows are excluded because percentage error is undefined.",
        "",
        "## Metrics by model and horizon",
        "",
        "| Horizon | Model | MAE | RMSE | MAPE* | MAPE n | WAPE | Validation WAPE |",
        "|---:|---|---:|---:|---:|---:|---:|---:|",
    ])
    for horizon, evaluation in evaluations.items():
        for name, validation_wape in evaluation["validation_metrics"].items():
            metrics = evaluation["holdout_metrics"][name]
            report_lines.append(
                f"| {horizon} days | {name} | "
                f"{metrics['mae_units_per_series_horizon']:.2f} | "
                f"{metrics['rmse_units_per_series_horizon']:.2f} | "
                f"{metrics['mape_percent']:.2f}% | "
                f"{metrics['mape_included_rows']}/"
                f"{metrics['mape_excluded_zero_actual_rows']} excluded | "
                f"{metrics['wape_percent']:.2f}% | {validation_wape:.2f}% |"
            )
    report_lines.extend([
        "",
        "`100 - WAPE` is an aggregate relative-error score, not classification accuracy.",
        "MAE and RMSE are measured in units per warehouse-product pair over the full horizon; "
        "they are not daily averages.",
        "Holdout windows are non-overlapping; the 30-day metric is based on a small "
        "number of independent time origins and is not yet a strong reliability claim.",
        "Live forecasts are blocked when source data is more than seven days old.",
        "",
        "Artifacts: `datasets/gold/horizon_forecast_results.csv` (holdout), "
        "`datasets/gold/horizon_next_forecast.csv` (live forecast), and "
        "`datasets/gold/horizon_live_forecast_status.json` (freshness status).",
        "",
    ])
    REPORT_FILE.write_text("\n".join(report_lines), encoding="utf-8")
    update_daily_report(evaluations, latest_date, source_age_days)
    print(f"15/30-day cumulative forecast evaluation: {REPORT_FILE}")
    print(f"Live forecast status: {status['status']}")


if __name__ == "__main__":
    main()
