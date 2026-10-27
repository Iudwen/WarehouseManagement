import math
import random
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


PROJECT_DIR = Path(__file__).resolve().parents[2]
DEMAND_KEYS_FILE = (
    PROJECT_DIR
    / "data_mining"
    / "datasets"
    / "gold"
    / "nhu_cau_xuat_hang_daily.csv"
)
REAL_FORECAST_FILE = (
    PROJECT_DIR
    / "data_mining"
    / "datasets"
    / "gold"
    / "forecast_results.csv"
)
OUTPUT_FILE = (
    PROJECT_DIR
    / "data_mining"
    / "models"
    / "results"
    / "synthetic_accuracy_benchmark.csv"
)

NUMERIC_FEATURES = [
    "day_of_week",
    "month",
    "day_of_year",
    "lag_1",
    "lag_7",
    "rolling_mean_7",
]
CATEGORICAL_FEATURES = ["ma_kho", "ma_sp"]

SCENARIOS = {
    "current_like_synthetic": {
        "noise_sigma": 0.18,
        "zero_probability": 0.10,
        "outlier_probability": 0.02,
    },
    "controlled_low_noise": {
        "noise_sigma": 0.05,
        "zero_probability": 0.01,
        "outlier_probability": 0.0,
    },
}


def calculate_wape(actual, predicted):
    actual = np.asarray(actual, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    denominator = np.abs(actual).sum()

    if denominator == 0:
        raise ValueError("Không thể tính WAPE khi tổng nhu cầu thực bằng 0.")

    return float(np.abs(actual - predicted).sum() / denominator * 100)


def generate_synthetic_demand(keys, scenario, seed=42):
    rng = random.Random(seed)
    products = sorted(keys["ma_sp"].unique())
    pairs = sorted(set(zip(keys["ma_kho"], keys["ma_sp"])))

    product_base = {
        product: rng.uniform(8, 22)
        for product in products
    }
    pair_factor = {
        pair: rng.uniform(0.90, 1.10)
        for pair in pairs
    }
    warehouse_factors = {
        "HN01": 1.00,
        "DN01": 0.85,
        "HCM01": 1.15,
    }
    weekday_factors = [1.08, 1.04, 1.00, 1.03, 1.12, 0.90, 0.78]
    month_factors = {
        1: 1.08,
        2: 0.92,
        3: 0.98,
        4: 1.00,
        5: 1.02,
        6: 1.00,
        7: 0.98,
        8: 1.00,
        9: 1.03,
        10: 1.06,
        11: 1.10,
        12: 1.18,
    }
    rows = []

    ordered_keys = keys.sort_values(
        ["ngay", "ma_kho", "ma_sp"]
    )
    for row in ordered_keys.itertuples(index=False):
        day = row.ngay.date()
        day_of_year = day.timetuple().tm_yday
        seasonal_factor = 1.0 + 0.15 * math.cos(
            2 * math.pi * (day_of_year - 330) / 365.25
        )
        expected = (
            product_base[row.ma_sp]
            * warehouse_factors.get(row.ma_kho, 1.0)
            * pair_factor[(row.ma_kho, row.ma_sp)]
            * weekday_factors[day.weekday()]
            * seasonal_factor
            * month_factors[day.month]
        )
        quantity = expected * rng.lognormvariate(
            0,
            scenario["noise_sigma"],
        )

        if rng.random() < scenario["zero_probability"]:
            quantity = 0
        else:
            if rng.random() < scenario["outlier_probability"]:
                quantity *= rng.uniform(1.5, 2.2)
            quantity = max(0, round(quantity))

        rows.append((row.ngay, row.ma_kho, row.ma_sp, quantity))

    return pd.DataFrame(
        rows,
        columns=["ngay", "ma_kho", "ma_sp", "nhu_cau_xuat"],
    )


def add_history_features(df):
    df = df.sort_values(
        ["ma_kho", "ma_sp", "ngay"]
    ).reset_index(drop=True)
    grouped = df.groupby(
        ["ma_kho", "ma_sp"],
        sort=False,
    )["nhu_cau_xuat"]

    df["lag_1"] = grouped.shift(1)
    df["lag_7"] = grouped.shift(7)
    df["rolling_mean_7"] = grouped.transform(
        lambda values: values.shift(1).rolling(
            window=7,
            min_periods=7,
        ).mean()
    )
    df["day_of_week"] = df["ngay"].dt.dayofweek
    df["month"] = df["ngay"].dt.month
    df["day_of_year"] = df["ngay"].dt.dayofyear

    return df.dropna(
        subset=["lag_1", "lag_7", "rolling_mean_7"]
    ).copy()


def evaluate_synthetic_scenario(keys, scenario):
    df = add_history_features(
        generate_synthetic_demand(keys, scenario)
    )
    dates = sorted(df["ngay"].unique())
    split_date = dates[int(len(dates) * 0.8)]
    train = df[df["ngay"] < split_date]
    test = df[df["ngay"] >= split_date]

    if train.empty or test.empty:
        raise ValueError("Không đủ dữ liệu để chia train/test theo thời gian.")

    numeric_pipeline = Pipeline(
        steps=[("imputer", SimpleImputer(strategy="median"))]
    )
    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            (
                "onehot",
                OneHotEncoder(handle_unknown="ignore"),
            ),
        ]
    )
    preprocessor = ColumnTransformer(
        transformers=[
            ("numeric", numeric_pipeline, NUMERIC_FEATURES),
            ("categorical", categorical_pipeline, CATEGORICAL_FEATURES),
        ]
    )
    model = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            (
                "regressor",
                GradientBoostingRegressor(
                    loss="absolute_error",
                    n_estimators=100,
                    max_depth=2,
                    min_samples_leaf=20,
                    random_state=42,
                ),
            ),
        ]
    )
    feature_columns = NUMERIC_FEATURES + CATEGORICAL_FEATURES
    model.fit(
        train[feature_columns],
        train["nhu_cau_xuat"],
    )
    predictions = np.maximum(
        0,
        model.predict(test[feature_columns]),
    )
    wape = calculate_wape(
        test["nhu_cau_xuat"],
        predictions,
    )

    return {
        "scenario": scenario["name"],
        "data_kind": "synthetic_only",
        "test_rows": len(test),
        "test_start": test["ngay"].min().date().isoformat(),
        "test_end": test["ngay"].max().date().isoformat(),
        "wape_percent": wape,
        "accuracy_100_minus_wape_percent": 100 - wape,
        "meets_90_percent_target": 100 - wape > 90,
    }


def main():
    if not DEMAND_KEYS_FILE.exists():
        raise FileNotFoundError(
            f"Không tìm thấy dữ liệu khóa nhu cầu: {DEMAND_KEYS_FILE}"
        )
    if not REAL_FORECAST_FILE.exists():
        raise FileNotFoundError(
            f"Không tìm thấy kết quả dự báo thực: {REAL_FORECAST_FILE}"
        )

    demand_keys = pd.read_csv(
        DEMAND_KEYS_FILE,
        encoding="utf-8-sig",
        usecols=["ngay", "ma_kho", "ma_sp"],
    )
    demand_keys["ngay"] = pd.to_datetime(
        demand_keys["ngay"],
        errors="raise",
    )

    real_predictions = pd.read_csv(
        REAL_FORECAST_FILE,
        encoding="utf-8-sig",
        usecols=["thuc_te", "du_bao_gradient_boosting"],
    )
    real_wape = calculate_wape(
        real_predictions["thuc_te"],
        real_predictions["du_bao_gradient_boosting"],
    )
    results = [
        {
            "scenario": "real_holdout_current_model",
            "data_kind": "real_project_holdout",
            "test_rows": len(real_predictions),
            "test_start": "",
            "test_end": "",
            "wape_percent": real_wape,
            "accuracy_100_minus_wape_percent": 100 - real_wape,
            "meets_90_percent_target": 100 - real_wape > 90,
        }
    ]

    for scenario_name, scenario in SCENARIOS.items():
        result = evaluate_synthetic_scenario(
            demand_keys,
            {**scenario, "name": scenario_name},
        )
        result["noise_sigma"] = scenario["noise_sigma"]
        result["zero_probability"] = scenario["zero_probability"]
        result["outlier_probability"] = scenario["outlier_probability"]
        results.append(result)

    results_df = pd.DataFrame(results)
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    results_df.to_csv(
        OUTPUT_FILE,
        index=False,
        encoding="utf-8-sig",
    )

    print(results_df.to_string(index=False))
    print(
        "\nLưu ý: kết quả synthetic chỉ minh họa theo giả định mô phỏng; "
        "không thay thế độ chính xác trên dữ liệu thực."
    )
    print(f"Báo cáo riêng: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
