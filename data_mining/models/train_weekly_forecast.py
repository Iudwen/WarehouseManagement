import json
import math
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.ensemble import (
    ExtraTreesRegressor,
    GradientBoostingRegressor,
    RandomForestRegressor,
)
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parents[2]
INPUT_FILE = BASE_DIR / "data_mining" / "datasets" / "gold" / "analytical_dataset.csv"
OUTPUT_DIR = BASE_DIR / "data_mining" / "datasets" / "gold"
FORECAST_FILE = OUTPUT_DIR / "weekly_forecast_results.csv"
DATA_LAKE_FORECAST_FILE = (
    BASE_DIR / "data_center" / "data_lake" / "gold" / "weekly_forecast_results.csv"
)
REPORT_FILE = BASE_DIR / "data_mining" / "weekly_evaluation_report.md"
DAILY_REPORT_FILES = [
    BASE_DIR / "data_mining" / "evaluation_report.md",
    BASE_DIR / "data_mining" / "reports" / "evaluation_report.md",
]
REGISTRY_DIR = BASE_DIR / "data_mining" / "models" / "model_registry"
MODEL_FILE = REGISTRY_DIR / "weekly_model.joblib"
FEATURES_FILE = REGISTRY_DIR / "weekly_feature_columns.joblib"
MODEL_METADATA_FILE = REGISTRY_DIR / "weekly_model.json"

TEST_RATIO = 0.20
VALIDATION_RATIO = 0.15
CALIBRATION_SCALES = np.arange(0.50, 1.501, 0.01)
TARGET = "nhu_cau_xuat"
ENTITY_COLUMNS = ["ma_kho", "ma_sp"]
NEXT_FORECAST_FILE = OUTPUT_DIR / "weekly_next_forecast.csv"
NEXT_FORECAST_STATUS_FILE = OUTPUT_DIR / "weekly_live_forecast_status.json"
MAX_SOURCE_AGE_DAYS = 7


class ForecastNotReadyError(ValueError):
    pass


def calculate_wape(y_true, y_pred):
    actual = np.asarray(y_true, dtype=float)
    predicted = np.asarray(y_pred, dtype=float)
    denominator = np.abs(actual).sum()
    if denominator == 0:
        return float("nan")
    return float(np.abs(actual - predicted).sum() / denominator * 100)


def build_weekly_features(daily_data):
    required = {"ngay", "ma_kho", "ma_sp", TARGET}
    missing = required - set(daily_data.columns)
    if missing:
        raise ValueError(
            "Analytical dataset is missing weekly forecast columns: "
            + ", ".join(sorted(missing))
        )

    daily = daily_data[["ngay", "ma_kho", "ma_sp", TARGET]].copy()
    daily["ngay"] = pd.to_datetime(daily["ngay"], errors="raise")
    daily[TARGET] = pd.to_numeric(daily[TARGET], errors="raise")
    if not np.isfinite(daily[TARGET]).all() or (daily[TARGET] < 0).any():
        raise ValueError("Weekly demand must contain finite, non-negative quantities.")
    if daily.duplicated(["ngay", *ENTITY_COLUMNS]).any():
        raise ValueError("Analytical dataset contains duplicate date/warehouse/product rows.")
    if daily[ENTITY_COLUMNS].isna().any().any():
        raise ValueError("Analytical dataset contains missing warehouse or product IDs.")
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

    first_date = daily["ngay"].min().date()
    last_date = daily["ngay"].max().date()
    first_full_week = pd.Timestamp(
        first_date + pd.Timedelta(days=(-first_date.weekday()) % 7)
    )
    last_sunday = pd.Timestamp(
        last_date - pd.Timedelta(days=(last_date.weekday() + 1) % 7)
    )
    last_full_week = last_sunday - pd.Timedelta(days=6)
    if first_full_week > last_full_week:
        raise ValueError("At least one complete Monday-Sunday week is required.")

    week_starts = pd.date_range(first_full_week, last_full_week, freq="7D")
    weekly_totals = daily.assign(
        week_start=daily["ngay"].dt.to_period("W-SUN").dt.start_time
    ).groupby([*ENTITY_COLUMNS, "week_start"], as_index=False)[TARGET].sum()
    entities = daily[ENTITY_COLUMNS].drop_duplicates().sort_values(ENTITY_COLUMNS)
    complete_grid = entities.assign(_join_key=1).merge(
        pd.DataFrame({"week_start": week_starts, "_join_key": 1}),
        on="_join_key",
    ).drop(columns="_join_key")
    weekly = complete_grid.merge(
        weekly_totals,
        on=[*ENTITY_COLUMNS, "week_start"],
        how="left",
        validate="one_to_one",
    )
    weekly[TARGET] = weekly[TARGET].fillna(0.0)
    weekly = weekly.sort_values([*ENTITY_COLUMNS, "week_start"]).reset_index(drop=True)

    for lag in (1, 2, 4, 8):
        weekly[f"lag_{lag}"] = weekly.groupby(ENTITY_COLUMNS)[TARGET].shift(lag)
    for window in (2, 4, 8):
        weekly[f"mean_{window}"] = weekly.groupby(ENTITY_COLUMNS)[TARGET].transform(
            lambda values: values.shift(1).rolling(window, min_periods=window).mean()
        )
        weekly[f"median_{window}"] = weekly.groupby(ENTITY_COLUMNS)[TARGET].transform(
            lambda values: values.shift(1).rolling(window, min_periods=window).median()
        )

    weekly["orig_ma_kho"] = weekly["ma_kho"]
    weekly["orig_ma_sp"] = weekly["ma_sp"]
    weekly = weekly.dropna(
        subset=["lag_1", "lag_2", "lag_4", "lag_8", "mean_4", "mean_8"]
    ).copy()
    weekly = pd.get_dummies(
        weekly,
        columns=ENTITY_COLUMNS,
        drop_first=False,
        dtype=int,
    )
    feature_columns = [
        column
        for column in weekly.columns
        if column.startswith(("lag_", "mean_", "median_", "ma_kho_", "ma_sp_"))
    ]
    return weekly, feature_columns, first_date, last_date


def make_models():
    return {
        "Extra Trees Regressor (weekly)": ExtraTreesRegressor(
            n_estimators=100,
            max_depth=8,
            min_samples_leaf=10,
            n_jobs=-1,
            random_state=42,
        ),
        "Ridge Regression (weekly)": Ridge(alpha=10),
        "Gradient Boosting (weekly)": GradientBoostingRegressor(
            loss="absolute_error",
            n_estimators=100,
            max_depth=2,
            min_samples_leaf=20,
            random_state=42,
        ),
        "Random Forest Regressor (weekly)": RandomForestRegressor(
            n_estimators=100,
            max_depth=8,
            min_samples_leaf=10,
            n_jobs=-1,
            random_state=42,
        ),
    }


def get_time_folds(dates, fold_count=2):
    validation_weeks = max(1, int(math.ceil(len(dates) * VALIDATION_RATIO)))
    if len(dates) <= fold_count * validation_weeks:
        raise ValueError("Not enough weekly observations for walk-forward validation.")

    first_start = len(dates) - fold_count * validation_weeks
    return [
        (
            pd.Timestamp(dates[first_start + index * validation_weeks]),
            pd.Timestamp(
                dates[
                    min(
                        first_start + (index + 1) * validation_weeks,
                        len(dates),
                    )
                    - 1
                ]
            ),
        )
        for index in range(fold_count)
    ]


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


def build_next_week_forecast(
    daily_data,
    model,
    feature_columns,
    calibration_scale,
    as_of=None,
):
    latest_date = pd.to_datetime(daily_data["ngay"], errors="raise").max().date()
    current_date = as_of or date.today()
    if latest_date.weekday() != 6:
        raise ForecastNotReadyError(
            "A next-week forecast requires data through a complete Sunday."
        )
    age_days = (current_date - latest_date).days
    if age_days < 0:
        raise ForecastNotReadyError("Source data contains dates after the as-of date.")
    if age_days > MAX_SOURCE_AGE_DAYS:
        raise ForecastNotReadyError(
            f"Latest actual date {latest_date} is {age_days} days old; "
            f"maximum allowed age is {MAX_SOURCE_AGE_DAYS} days."
        )

    next_monday = pd.Timestamp(latest_date + pd.Timedelta(days=1))
    future_dates = pd.date_range(next_monday, periods=7, freq="D")
    entities = daily_data[ENTITY_COLUMNS].drop_duplicates()
    future_grid = entities.assign(_join_key=1).merge(
        pd.DataFrame({"ngay": future_dates, "_join_key": 1}),
        on="_join_key",
    ).drop(columns="_join_key")
    future_grid[TARGET] = 0.0
    extended = pd.concat(
        [daily_data[["ngay", *ENTITY_COLUMNS, TARGET]], future_grid],
        ignore_index=True,
    )
    weekly, _columns, _start, _end = build_weekly_features(extended)
    forecast_rows = weekly[weekly["week_start"] == next_monday].copy()
    if forecast_rows.empty or forecast_rows[feature_columns].isna().any().any():
        raise ForecastNotReadyError(
            "Not enough complete weekly history to create the next-week features."
        )

    predictions = np.clip(
        model.predict(forecast_rows[feature_columns]) * calibration_scale,
        0,
        None,
    )
    return pd.DataFrame({
        "tuan_bat_dau": next_monday.date().isoformat(),
        "tuan_ket_thuc": (next_monday + pd.Timedelta(days=6)).date().isoformat(),
        "ma_kho": forecast_rows["orig_ma_kho"].to_numpy(),
        "ma_sp": forecast_rows["orig_ma_sp"].to_numpy(),
        "du_bao_nhu_cau_tuan": np.round(predictions, 2),
    })


def main():
    if not INPUT_FILE.exists():
        raise FileNotFoundError(f"Analytical dataset not found: {INPUT_FILE}")

    source = pd.read_csv(INPUT_FILE, encoding="utf-8-sig")
    weekly, feature_columns, source_start, source_end = build_weekly_features(source)
    dates = np.sort(weekly["week_start"].unique())
    if len(dates) < 15:
        raise ValueError(
            f"Not enough complete weekly history after feature generation: {len(dates)}"
        )

    test_weeks = max(1, int(math.ceil(len(dates) * TEST_RATIO)))
    test_start = pd.Timestamp(dates[-test_weeks])
    train_data = weekly[weekly["week_start"] < test_start].copy()
    test_data = weekly[weekly["week_start"] >= test_start].copy()
    folds = get_time_folds(np.sort(train_data["week_start"].unique()))
    models = make_models()
    validation = {
        name: {"actual": [], "predicted": []}
        for name in models
    }

    for validation_start, validation_end in folds:
        fold_train = train_data[train_data["week_start"] < validation_start]
        fold_validation = train_data[
            (train_data["week_start"] >= validation_start)
            & (train_data["week_start"] <= validation_end)
        ]
        if fold_train.empty or fold_validation.empty:
            raise ValueError(
                f"Empty weekly validation fold {validation_start} to {validation_end}."
            )

        for name, prototype in models.items():
            model = clone(prototype)
            model.fit(fold_train[feature_columns], fold_train[TARGET])
            predicted = np.clip(
                model.predict(fold_validation[feature_columns]),
                0,
                None,
            )
            validation[name]["actual"].extend(fold_validation[TARGET].to_numpy())
            validation[name]["predicted"].extend(predicted)

    validation_metrics = {}
    calibration_scales = {}
    for name, values in validation.items():
        actual = np.asarray(values["actual"], dtype=float)
        predicted = np.asarray(values["predicted"], dtype=float)
        scale = select_calibration_scale(actual, predicted)
        calibration_scales[name] = scale
        validation_metrics[name] = {
            "mae": float(mean_absolute_error(actual, np.clip(predicted * scale, 0, None))),
            "wape_percent": calculate_wape(actual, np.clip(predicted * scale, 0, None)),
            "calibration_scale": scale,
        }

    primary_name = min(
        validation_metrics,
        key=lambda name: validation_metrics[name]["wape_percent"],
    )

    holdout_predictions = {}
    holdout_metrics = {}
    for name, prototype in models.items():
        model = clone(prototype)
        model.fit(train_data[feature_columns], train_data[TARGET])
        predicted = np.clip(model.predict(test_data[feature_columns]), 0, None)
        calibrated = np.clip(predicted * calibration_scales[name], 0, None)
        holdout_predictions[name] = calibrated
        holdout_metrics[name] = {
            "mae": float(mean_absolute_error(test_data[TARGET], calibrated)),
            "wape_percent": calculate_wape(test_data[TARGET], calibrated),
        }

    baseline = np.clip(test_data["mean_8"].to_numpy(), 0, None)
    holdout_metrics["Rolling 8-week mean (baseline)"] = {
        "mae": float(mean_absolute_error(test_data[TARGET], baseline)),
        "wape_percent": calculate_wape(test_data[TARGET], baseline),
    }

    results = pd.DataFrame({
        "tuan_bat_dau": test_data["week_start"].dt.date.astype(str).to_numpy(),
        "tuan_ket_thuc": (
            test_data["week_start"] + pd.Timedelta(days=6)
        ).dt.date.astype(str).to_numpy(),
        "ma_kho": test_data["orig_ma_kho"].to_numpy(),
        "ma_sp": test_data["orig_ma_sp"].to_numpy(),
        "thuc_te_tuan": test_data[TARGET].to_numpy(),
        "du_bao_baseline_mean_8_tuan": baseline,
    })
    for name, predicted in holdout_predictions.items():
        results[f"du_bao_{name.split(' ')[0].lower()}"] = np.round(predicted, 2)
    results["du_bao_primary"] = np.round(holdout_predictions[primary_name], 2)
    results["sai_so_tuyet_doi"] = np.round(
        np.abs(results["thuc_te_tuan"] - results["du_bao_primary"]),
        2,
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    DATA_LAKE_FORECAST_FILE.parent.mkdir(parents=True, exist_ok=True)
    results.to_csv(FORECAST_FILE, index=False, encoding="utf-8-sig")
    results.to_csv(DATA_LAKE_FORECAST_FILE, index=False, encoding="utf-8-sig")

    import joblib

    production_model = clone(models[primary_name])
    production_model.fit(weekly[feature_columns], weekly[TARGET])
    REGISTRY_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(production_model, MODEL_FILE)
    joblib.dump(feature_columns, FEATURES_FILE)

    metadata = {
        "model_name": primary_name,
        "selection_metric": "walk_forward_calibrated_WAPE",
        "validation_metrics": validation_metrics,
        "holdout_start_week": test_data["week_start"].min().date().isoformat(),
        "holdout_end_week": test_data["week_start"].max().date().isoformat(),
        "holdout_weeks": int(test_data["week_start"].nunique()),
        "holdout_rows": len(test_data),
        "holdout_training_end_week": (
            train_data["week_start"].max().date().isoformat()
        ),
        "holdout_wape_percent": holdout_metrics[primary_name]["wape_percent"],
        "holdout_accuracy_100_minus_wape_percent": (
            100 - holdout_metrics[primary_name]["wape_percent"]
        ),
        "production_training_rows": len(weekly),
        "production_training_end_week": weekly["week_start"].max().date().isoformat(),
        "source_start_date": source_start.isoformat(),
        "source_latest_observation_date": source_end.isoformat(),
        "source_age_days": (date.today() - source_end).days,
        "note": (
            "Weekly sum forecast; evaluated as a one-week-ahead rolling forecast. "
            "The latest source week may be partial and is excluded from weekly targets."
        ),
    }
    MODEL_METADATA_FILE.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    try:
        next_week_results = build_next_week_forecast(
            source,
            production_model,
            feature_columns,
            calibration_scales[primary_name],
        )
    except ForecastNotReadyError as error:
        pd.DataFrame(columns=[
            "tuan_bat_dau",
            "tuan_ket_thuc",
            "ma_kho",
            "ma_sp",
            "du_bao_nhu_cau_tuan",
        ]).to_csv(NEXT_FORECAST_FILE, index=False, encoding="utf-8-sig")
        live_status = {
            "status": "BLOCKED_SOURCE_NOT_READY",
            "latest_observation_date": source_end.isoformat(),
            "source_age_days": (date.today() - source_end).days,
            "reason": str(error),
        }
    else:
        next_week_results.to_csv(
            NEXT_FORECAST_FILE,
            index=False,
            encoding="utf-8-sig",
        )
        live_status = {
            "status": "READY",
            "latest_observation_date": source_end.isoformat(),
            "source_age_days": (date.today() - source_end).days,
            "forecast_start_week": next_week_results["tuan_bat_dau"].iloc[0],
            "forecast_end_week": next_week_results["tuan_ket_thuc"].iloc[0],
            "forecast_rows": len(next_week_results),
        }
    NEXT_FORECAST_STATUS_FILE.write_text(
        json.dumps(live_status, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    report_lines = [
        "# Weekly demand forecast evaluation",
        "",
        f"- Source analytical data: {source_start} to {source_end}.",
        f"- Complete Monday-Sunday weeks after warm-up: {len(dates)}.",
        f"- Holdout: {test_data['week_start'].min().date()} to "
        f"{(test_data['week_start'].max() + pd.Timedelta(days=6)).date()} "
        f"({test_data['week_start'].nunique()} weekly origins, "
        f"{len(test_data):,} warehouse-product-week rows).",
        "- Forecast target: the total observed quantity per product and warehouse "
        "for the next complete week.",
        "- Model and calibration are selected only on chronological walk-forward "
        "validation; holdout is not used for selection.",
        "",
        "## Walk-forward validation",
        "",
        "| Model | Calibrated WAPE | MAE | Scale |",
        "|---|---:|---:|---:|",
    ]
    for name, metrics in sorted(
        validation_metrics.items(),
        key=lambda item: item[1]["wape_percent"],
    ):
        report_lines.append(
            f"| {name} | {metrics['wape_percent']:.2f}% | "
            f"{metrics['mae']:.2f} | {metrics['calibration_scale']:.2f} |"
        )
    report_lines.extend([
        "",
        "## Untouched weekly holdout",
        "",
        "| Model | WAPE | `100 - WAPE` | MAE |",
        "|---|---:|---:|---:|",
    ])
    for name, metrics in sorted(
        holdout_metrics.items(),
        key=lambda item: item[1]["wape_percent"],
    ):
        report_lines.append(
            f"| {name} | {metrics['wape_percent']:.2f}% | "
            f"{100 - metrics['wape_percent']:.2f}% | {metrics['mae']:.2f} |"
        )
    report_lines.extend([
        "",
        f"Selected production model: **{primary_name}**; calibration scale "
        f"`{calibration_scales[primary_name]:.2f}`. The model was refit on all "
        f"{len(weekly):,} complete warehouse-product-week observations through "
        f"{weekly['week_start'].max().date()} after holdout evaluation.",
        "",
        "> `100 - WAPE` is a relative aggregate-error score, not a classification "
        "accuracy. Weekly results are a different forecast horizon from the daily "
        "one-step results and must not be compared as if they were the same task.",
        "",
        "## Data readiness for live use",
        "",
        f"The latest observed daily row is **{source_end}**, "
        f"{(date.today() - source_end).days} days before this run. "
        + (
            "This is stale for operational forecasting. Reconnect recent real "
            "orders/shipments before using the registry model for replenishment."
            if (date.today() - source_end).days > 7
            else "The source is recent enough for a current weekly forecast."
        )
        + " Seed transactions dated after the source observation window are not "
        "treated as actual demand.",
        "",
        "When using the model, aggregate and refresh actual demand weekly, then "
        "predict the following complete week. This is a one-week rolling forecast, "
        "not a multi-week forecast made in advance.",
        "",
        f"Live forecast generation status: **{live_status['status']}**. "
        f"{live_status['reason'] if 'reason' in live_status else 'See weekly_next_forecast.csv for the next-week output.'} "
        "The forecast output is "
        "`data_mining/datasets/gold/weekly_next_forecast.csv`; the status is also written to "
        "`data_mining/datasets/gold/weekly_live_forecast_status.json`.",
        "",
        "Re-run using `py data_mining/models/train_weekly_forecast.py` or "
        "`py data_mining/run_pipeline.py` after refreshing the analytical dataset.",
    ])
    REPORT_FILE.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

    summary = (
        "## Weekly forecast alternative\n\n"
        f"A separate **one-week-ahead** warehouse-product forecast was evaluated "
        f"on {test_data['week_start'].nunique()} untouched weekly origins. "
        f"The selected {primary_name} achieved WAPE "
        f"**{holdout_metrics[primary_name]['wape_percent']:.2f}%** "
        f"(100 − WAPE: **{100-holdout_metrics[primary_name]['wape_percent']:.2f}%**), "
        f"versus **{holdout_metrics['Rolling 8-week mean (baseline)']['wape_percent']:.2f}%** "
        "for the rolling 8-week baseline. This is a different target horizon from "
        "the daily score above and must not be presented as an improvement to the "
        "daily model. The latest source date is "
        f"{source_end}; refresh real operational data before using it live. "
        "Details: `data_mining/weekly_evaluation_report.md`."
    )
    for daily_report in DAILY_REPORT_FILES:
        if daily_report.exists():
            old_report = daily_report.read_text(encoding="utf-8")
            marker = "## Weekly forecast alternative"
            base_report = old_report.split(marker, maxsplit=1)[0].rstrip()
            while base_report.endswith("---"):
                base_report = base_report[:-3].rstrip()
            daily_report.write_text(
                f"{base_report}\n\n---\n\n"
                + summary
                + "\n",
                encoding="utf-8",
            )

    print(f"Primary weekly model: {primary_name}")
    print(
        f"Walk-forward WAPE: "
        f"{validation_metrics[primary_name]['wape_percent']:.2f}%"
    )
    print(
        f"Weekly holdout WAPE: "
        f"{holdout_metrics[primary_name]['wape_percent']:.2f}% "
        f"(100-WAPE={100-holdout_metrics[primary_name]['wape_percent']:.2f}%)"
    )
    print(
        f"Weekly holdout: {len(test_data):,} rows, "
        f"{test_data['week_start'].nunique()} weeks; "
        f"latest daily source date={source_end}."
    )
    print(f"Forecast: {FORECAST_FILE}")
    print(f"Evaluation report: {REPORT_FILE}")


if __name__ == "__main__":
    main()
