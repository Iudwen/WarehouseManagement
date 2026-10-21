
import csv
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "data_mining" / "datasets" / "gold" / "nhu_cau_xuat_hang_daily.csv"
OUTPUT = ROOT / "data_mining" / "results"

TEST_DAYS = 60
RANDOM_STATE = 42


def load_data():
    if not SOURCE.exists():
        raise FileNotFoundError(f"Khong tim thay file: {SOURCE}")

    df = pd.read_csv(SOURCE, encoding="utf-8-sig")

    required = {"ngay", "ma_kho", "ma_sp", "nhu_cau_xuat"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Thieu cot: {sorted(missing)}")

    df["ngay"] = pd.to_datetime(df["ngay"], errors="raise")
    df["nhu_cau_xuat"] = pd.to_numeric(
        df["nhu_cau_xuat"], errors="raise"
    )

    if df[list(required)].isna().any().any():
        raise ValueError("Du lieu co gia tri rong")

    if (df["nhu_cau_xuat"] < 0).any():
        raise ValueError("Nhu cau xuat khong duoc am")

    if df.duplicated(["ngay", "ma_kho", "ma_sp"]).any():
        raise ValueError("Phat hien khoa ngay-kho-san pham bi trung")

    df = df.sort_values(["ma_kho", "ma_sp", "ngay"]).reset_index(drop=True)
    return df


def create_features(df):
    result = []

    for (warehouse, product), group in df.groupby(
        ["ma_kho", "ma_sp"], sort=False
    ):
        group = group.sort_values("ngay").copy()
        group["ma_kho"] = warehouse
        group["ma_sp"] = product

        group["day_of_week"] = group["ngay"].dt.dayofweek
        group["day_of_month"] = group["ngay"].dt.day
        group["month"] = group["ngay"].dt.month
        group["is_weekend"] = (
            group["day_of_week"] >= 5
        ).astype(int)

        for lag in [1, 7, 14, 28]:
            group[f"lag_{lag}"] = group["nhu_cau_xuat"].shift(lag)

        for window in [7, 14, 28]:
            group[f"rolling_mean_{window}"] = (
                group["nhu_cau_xuat"]
                .shift(1)
                .rolling(window, min_periods=window)
                .mean()
            )

        group["lag_1"] = group["lag_1"].fillna(0)

        result.append(group)

    data = pd.concat(result, ignore_index=True)

    feature_columns = [
        "ma_kho",
        "ma_sp",
        "day_of_week",
        "day_of_month",
        "month",
        "is_weekend",
        "lag_1",
        "lag_7",
        "lag_14",
        "lag_28",
        "rolling_mean_7",
        "rolling_mean_14",
        "rolling_mean_28",
    ]

    data = data.dropna(subset=[
        "lag_7",
        "lag_14",
        "lag_28",
        "rolling_mean_7",
        "rolling_mean_14",
        "rolling_mean_28",
    ]).reset_index(drop=True)

    data[["ma_kho", "ma_sp"]] = data[
        ["ma_kho", "ma_sp"]
    ].astype(str)

    return data, feature_columns


def calculate_metrics(actual, predicted):
    actual = np.asarray(actual, dtype=float)
    predicted = np.maximum(np.asarray(predicted, dtype=float), 0)

    mae = mean_absolute_error(actual, predicted)
    rmse = np.sqrt(mean_squared_error(actual, predicted))
    total_actual = np.abs(actual).sum()

    wape = (
        np.abs(actual - predicted).sum() / total_actual * 100
        if total_actual > 0
        else np.nan
    )

    return {
        "MAE": float(mae),
        "RMSE": float(rmse),
        "WAPE_percent": float(wape) if np.isfinite(wape) else None,
    }


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)

    df = load_data()
    data, feature_columns = create_features(df)

    unique_dates = sorted(data["ngay"].unique())
    if len(unique_dates) <= TEST_DAYS:
        raise ValueError("Khong du ngay de chia train/test")

    test_dates = set(unique_dates[-TEST_DAYS:])
    train = data[~data["ngay"].isin(test_dates)].copy()
    test = data[data["ngay"].isin(test_dates)].copy()

    if train.empty or test.empty:
        raise ValueError("Tap train/test rong")

    categorical = ["ma_kho", "ma_sp"]
    numeric = [c for c in feature_columns if c not in categorical]

    X_train = pd.get_dummies(
        train[feature_columns],
        columns=categorical,
        dtype=int,
    )
    X_test = pd.get_dummies(
        test[feature_columns],
        columns=categorical,
        dtype=int,
    ).reindex(columns=X_train.columns, fill_value=0)

    y_train = train["nhu_cau_xuat"]
    y_test = test["nhu_cau_xuat"]

    results = {}
    predictions = []

    baseline = np.maximum(test["lag_7"].to_numpy(), 0)
    results["Naive_lag7"] = calculate_metrics(y_test, baseline)

    baseline_part = test[
        ["ngay", "ma_kho", "ma_sp", "nhu_cau_xuat"]
    ].copy()

    baseline_part["du_bao"] = baseline
    baseline_part["mo_hinh"] = "Naive_lag7"
    predictions = [baseline_part]

    models = {
        "RandomForest": RandomForestRegressor(
            n_estimators=200,
            min_samples_leaf=2,
            random_state=RANDOM_STATE,
            n_jobs=-1,
        ),
        "HistGradientBoosting": HistGradientBoostingRegressor(
            max_iter=200,
            learning_rate=0.06,
            max_leaf_nodes=15,
            l2_regularization=1.0,
            random_state=RANDOM_STATE,
        ),
    }

    for name, model in models.items():
        model.fit(X_train, y_train)
        pred = np.maximum(model.predict(X_test), 0)

        results[name] = calculate_metrics(y_test, pred)

        part = test[
            ["ngay", "ma_kho", "ma_sp", "nhu_cau_xuat"]
        ].copy()
        part["du_bao"] = pred
        part["mo_hinh"] = name
        predictions.append(part)

    with (OUTPUT / "model_metrics.json").open(
        "w", encoding="utf-8"
    ) as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    pd.concat(predictions, ignore_index=True).to_csv(
        OUTPUT / "test_predictions.csv",
        index=False,
        encoding="utf-8-sig",
    )

    pd.DataFrame([
        {"mo_hinh": name, **metrics}
        for name, metrics in results.items()
    ]).sort_values("MAE").to_csv(
        OUTPUT / "model_comparison.csv",
        index=False,
        encoding="utf-8-sig",
    )

    print("===== DU LIEU =====")
    print(f"So dong daily ban dau: {len(df)}")
    print(f"So dong sau tao dac trung: {len(data)}")
    print(f"So ngay train: {train['ngay'].nunique()}")
    print(f"So ngay test: {test['ngay'].nunique()}")
    print(f"So dong train: {len(train)}")
    print(f"So dong test: {len(test)}")

    print("\n===== SO SANH MO HINH =====")
    print(pd.DataFrame([
        {"Mo_hinh": name, **metrics}
        for name, metrics in results.items()
    ]).sort_values("MAE").to_string(index=False))

    print(f"\nKet qua da luu tai: {OUTPUT}")


if __name__ == "__main__":
    main()
