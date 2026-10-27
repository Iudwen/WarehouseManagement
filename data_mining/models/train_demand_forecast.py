from pathlib import Path
import warnings

import numpy as np
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.ensemble import (
    ExtraTreesRegressor,
    HistGradientBoostingRegressor,
    RandomForestRegressor,
)
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


# ============================================================
# 1. CAU HINH DU AN
# ============================================================

PROJECT_DIR = Path(r"D:\WarehouseManagement")

INPUT_FILE = (
    PROJECT_DIR
    / "data_mining"
    / "datasets"
    / "gold"
    / "nhu_cau_xuat_hang_features.csv"
)

OUTPUT_DIR = (
    PROJECT_DIR
    / "data_mining"
    / "models"
    / "results"
)

DATE_COL = "ngay"
WAREHOUSE_COL = "ma_kho"
PRODUCT_COL = "ma_sp"
TARGET_COL = "nhu_cau_xuat"

TEST_RATIO = 0.20
RANDOM_STATE = 42

# Chi bat True neu ngay khong co giao dich thuc su co nghia la nhu cau = 0.
FILL_MISSING_DAYS_WITH_ZERO = False


# ============================================================
# 2. CAC HAM HO TRO
# ============================================================

def calculate_metrics(y_true, y_pred):
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)

    mae = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))

    denominator = np.sum(np.abs(y_true))

    if denominator > 0:
        wape = np.sum(np.abs(y_true - y_pred)) / denominator * 100
    else:
        wape = np.nan

    return {
        "MAE": float(mae),
        "RMSE": float(rmse),
        "WAPE_percent": float(wape) if np.isfinite(wape) else np.nan,
    }


def make_one_hot_encoder():
    try:
        return OneHotEncoder(
            handle_unknown="ignore",
            sparse_output=False
        )
    except TypeError:
        return OneHotEncoder(
            handle_unknown="ignore",
            sparse=False
        )


def add_date_features(df):
    df = df.copy()
    dates = pd.to_datetime(df[DATE_COL], errors="coerce")

    if "day_of_week" not in df.columns:
        df["day_of_week"] = dates.dt.dayofweek

    if "month" not in df.columns:
        df["month"] = dates.dt.month

    if "day_of_month" not in df.columns:
        df["day_of_month"] = dates.dt.day

    if "day_of_year" not in df.columns:
        df["day_of_year"] = dates.dt.dayofyear

    if "week_of_year" not in df.columns:
        df["week_of_year"] = (
            dates.dt.isocalendar().week.astype("float64")
        )

    if "is_weekend" not in df.columns:
        df["is_weekend"] = (
            dates.dt.dayofweek.isin([5, 6]).astype(int)
        )

    return df


# ============================================================
# 3. DOC VA KIEM TRA DU LIEU
# ============================================================

def load_data():

    if not INPUT_FILE.exists():
        raise FileNotFoundError(
            f"Khong tim thay file du lieu:\n{INPUT_FILE}\n"
            "Hay kiem tra duong dan INPUT_FILE."
        )

    df = pd.read_csv(INPUT_FILE)

    required_columns = [
        DATE_COL,
        WAREHOUSE_COL,
        PRODUCT_COL,
        TARGET_COL,
        "lag_7",
        "rolling_mean_7",
    ]

    missing_columns = [
        col for col in required_columns
        if col not in df.columns
    ]

    if missing_columns:
        raise ValueError(
            "File du lieu thieu cac cot bat buoc: "
            + ", ".join(missing_columns)
            + ". Hay chay lai feature_engineering_forecast.py."
        )

    original_rows = len(df)

    df[DATE_COL] = pd.to_datetime(
        df[DATE_COL],
        errors="coerce"
    )

    df[TARGET_COL] = pd.to_numeric(
        df[TARGET_COL],
        errors="coerce"
    )

    df = df.dropna(
        subset=[
            DATE_COL,
            WAREHOUSE_COL,
            PRODUCT_COL,
            TARGET_COL,
        ]
    ).copy()

    removed_rows = original_rows - len(df)

    if (df[TARGET_COL] < 0).any():
        raise ValueError(
            f"Phat hien gia tri am trong cot {TARGET_COL}. "
            "Hay kiem tra du lieu truoc khi huan luyen."
        )

    key_columns = [
        DATE_COL,
        WAREHOUSE_COL,
        PRODUCT_COL,
    ]

    duplicate_count = int(
        df.duplicated(key_columns).sum()
    )

    if duplicate_count > 0:
        raise ValueError(
            f"Phat hien {duplicate_count} dong trung "
            "ngay-kho-san pham. Hay xu ly du lieu trung lap."
        )

    df = add_date_features(df)

    df = df.sort_values(
        [WAREHOUSE_COL, PRODUCT_COL, DATE_COL]
    ).reset_index(drop=True)

    # Bao cao cac ngay bi thieu trong tung chuoi kho-san pham.
    continuity_rows = []

    for (warehouse, product), group in df.groupby(
        [WAREHOUSE_COL, PRODUCT_COL]
    ):
        observed_dates = pd.DatetimeIndex(
            group[DATE_COL].dropna().unique()
        ).sort_values()

        if len(observed_dates) < 2:
            missing_days = 0
        else:
            full_dates = pd.date_range(
                observed_dates.min(),
                observed_dates.max(),
                freq="D",
            )

            missing_days = len(
                full_dates.difference(observed_dates)
            )

        continuity_rows.append({
            WAREHOUSE_COL: warehouse,
            PRODUCT_COL: product,
            "so_ngay_co_du_lieu": len(observed_dates),
            "ngay_bat_dau": (
                observed_dates.min()
                if len(observed_dates)
                else pd.NaT
            ),
            "ngay_ket_thuc": (
                observed_dates.max()
                if len(observed_dates)
                else pd.NaT
            ),
            "so_ngay_thieu_trong_khoang": missing_days,
        })

    continuity_df = pd.DataFrame(continuity_rows)

    # Chi dien ngay thieu bang 0 khi da xac nhan ngay vang giao dich
    # thuc su co nhu cau bang 0.
    if FILL_MISSING_DAYS_WITH_ZERO:

        completed_groups = []

        for (warehouse, product), group in df.groupby(
            [WAREHOUSE_COL, PRODUCT_COL]
        ):
            group = group.sort_values(DATE_COL).set_index(DATE_COL)

            full_dates = pd.date_range(
                group.index.min(),
                group.index.max(),
                freq="D",
            )

            group = group.reindex(full_dates)

            group[WAREHOUSE_COL] = warehouse
            group[PRODUCT_COL] = product
            group[TARGET_COL] = group[TARGET_COL].fillna(0)

            completed_groups.append(
                group.rename_axis(DATE_COL).reset_index()
            )

        df = pd.concat(
            completed_groups,
            ignore_index=True,
        )

        df = add_date_features(df)

        df = df.sort_values(
            [WAREHOUSE_COL, PRODUCT_COL, DATE_COL]
        ).reset_index(drop=True)

        # Tao lai lag va rolling sau khi bo sung ngay thieu.
        for lag in [1, 7, 14, 28]:
            df[f"lag_{lag}"] = df.groupby(
                [WAREHOUSE_COL, PRODUCT_COL]
            )[TARGET_COL].shift(lag)

        for window in [7, 14, 28]:
            df[f"rolling_mean_{window}"] = df.groupby(
                [WAREHOUSE_COL, PRODUCT_COL]
            )[TARGET_COL].transform(
                lambda s: s.shift(1).rolling(
                    window=window,
                    min_periods=window,
                ).mean()
            )

        df["rolling_std_7"] = df.groupby(
            [WAREHOUSE_COL, PRODUCT_COL]
        )[TARGET_COL].transform(
            lambda s: s.shift(1).rolling(
                window=7,
                min_periods=7,
            ).std()
        )

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    continuity_df.to_csv(
        OUTPUT_DIR / "daily_continuity_report.csv",
        index=False,
        encoding="utf-8-sig",
    )

    print("=" * 70)
    print("KIEM TRA DU LIEU")
    print("=" * 70)

    print(f"So dong ban dau: {original_rows:,}")
    print(f"So dong loai bo do du lieu khong hop le: {removed_rows:,}")
    print(f"So dong trung khoa: {duplicate_count:,}")
    print(f"So dong sau kiem tra: {len(df):,}")
    print(f"So kho: {df[WAREHOUSE_COL].nunique():,}")
    print(f"So san pham: {df[PRODUCT_COL].nunique():,}")
    print(f"Ngay bat dau: {df[DATE_COL].min().date()}")
    print(f"Ngay ket thuc: {df[DATE_COL].max().date()}")

    zero_ratio = (df[TARGET_COL] == 0).mean() * 100

    print(f"Ty le nhu cau bang 0: {zero_ratio:.2f}%")

    print(
        "Tong ngay thieu trong cac chuoi kho-san pham: "
        f"{int(continuity_df['so_ngay_thieu_trong_khoang'].sum()):,}"
    )

    print(
        "Da luu bao cao ngay thieu:",
        OUTPUT_DIR / "daily_continuity_report.csv",
    )

    return df


# ============================================================
# 4. CHIA TRAIN VA TEST THEO THOI GIAN
# ============================================================

def time_split(df):

    # Chi loai cac dong thieu cac tinh nang lich su cot loi.
    # Cac tinh nang thoi tiet va lich bi thieu se duoc xu ly
    # trong pipeline, khong loai bo toan bo dong.
    df = df.dropna(
        subset=["lag_7", "rolling_mean_7"]
    ).copy()

    df = df.sort_values(
        [DATE_COL, WAREHOUSE_COL, PRODUCT_COL]
    ).reset_index(drop=True)

    unique_dates = np.array(
        sorted(df[DATE_COL].dropna().unique())
    )

    if len(unique_dates) < 5:
        raise ValueError(
            "Khong du ngay du lieu de chia train/test."
        )

    split_index = int(
        len(unique_dates) * (1 - TEST_RATIO)
    )

    split_index = min(
        max(split_index, 1),
        len(unique_dates) - 1,
    )

    split_date = pd.Timestamp(
        unique_dates[split_index]
    )

    train_df = df[
        df[DATE_COL] < split_date
    ].copy()

    test_df = df[
        df[DATE_COL] >= split_date
    ].copy()

    if train_df.empty or test_df.empty:
        raise ValueError(
            "Tap train hoac test bi rong."
        )

    print("\n" + "=" * 70)
    print("CHIA DU LIEU THEO THOI GIAN")
    print("=" * 70)

    print(f"So dong dung cho mo hinh: {len(df):,}")
    print(f"So dong train: {len(train_df):,}")
    print(f"So dong test: {len(test_df):,}")

    print(
        "Ngay cuoi train:",
        train_df[DATE_COL].max().date(),
    )

    print(
        "Ngay dau test:",
        test_df[DATE_COL].min().date(),
    )

    return train_df, test_df


# ============================================================
# 5. CHON CAC DAC TRUNG
# ============================================================

def select_features(df):

    numeric_candidates = [
        "day_of_week",
        "month",
        "day_of_month",
        "day_of_year",
        "week_of_year",
        "is_weekend",
        "lag_1",
        "lag_7",
        "lag_14",
        "lag_28",
        "rolling_mean_7",
        "rolling_mean_14",
        "rolling_mean_28",
        "rolling_std_7",
        "calendar_is_weekend",
        "calendar_is_public_holiday",
        "calendar_is_day_off",
        "calendar_is_compensatory",
        "calendar_is_makeup_workday",
    ]

    categorical_candidates = [
        WAREHOUSE_COL,
        PRODUCT_COL,
    ]

    numeric_features = [
        col for col in numeric_candidates
        if col in df.columns
    ]

    categorical_features = [
        col for col in categorical_candidates
        if col in df.columns
    ]

    if not numeric_features:
        raise ValueError(
            "Khong tim thay dac trung so de huan luyen."
        )

    feature_columns = (
        numeric_features + categorical_features
    )

    return (
        feature_columns,
        numeric_features,
        categorical_features,
    )


# ============================================================
# 6. XAY DUNG PIPELINE TIEN XU LY
# ============================================================

def build_preprocessor(
    numeric_features,
    categorical_features,
):

    transformers = []

    if numeric_features:
        numeric_pipeline = Pipeline(
            steps=[
                (
                    "imputer",
                    SimpleImputer(
                        strategy="median",
                        add_indicator=True,
                    ),
                ),
            ]
        )

        transformers.append(
            (
                "numeric",
                numeric_pipeline,
                numeric_features,
            )
        )

    if categorical_features:
        categorical_pipeline = Pipeline(
            steps=[
                (
                    "imputer",
                    SimpleImputer(
                        strategy="most_frequent",
                    ),
                ),
                (
                    "onehot",
                    make_one_hot_encoder(),
                ),
            ]
        )

        transformers.append(
            (
                "categorical",
                categorical_pipeline,
                categorical_features,
            )
        )

    return ColumnTransformer(
        transformers=transformers,
        remainder="drop",
        verbose_feature_names_out=False,
    )


# ============================================================
# 7. HUAN LUYEN VA DANH GIA
# ============================================================

def main():

    warnings.filterwarnings(
        "ignore",
        category=FutureWarning,
    )

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    df = load_data()

    train_df, test_df = time_split(df)

    (
        feature_columns,
        numeric_features,
        categorical_features,
    ) = select_features(df)

    X_train = train_df[feature_columns].copy()
    X_test = test_df[feature_columns].copy()

    y_train = train_df[TARGET_COL].astype(float)
    y_test = test_df[TARGET_COL].astype(float)

    print("\nCAC DAC TRUNG DUOC SU DUNG")
    print("-" * 70)

    print("So dac trung so:", len(numeric_features))
    print("So dac trung phan loai:", len(categorical_features))

    print(", ".join(feature_columns))

    # --------------------------------------------------------
    # KHAI BAO CAC MO HINH
    # --------------------------------------------------------

    model_configs = {
        "RandomForest": RandomForestRegressor(
            n_estimators=400,
            min_samples_leaf=2,
            max_features=1.0,
            random_state=RANDOM_STATE,
            n_jobs=-1,
        ),

        "ExtraTrees": ExtraTreesRegressor(
            n_estimators=400,
            min_samples_leaf=2,
            max_features=1.0,
            random_state=RANDOM_STATE,
            n_jobs=-1,
        ),

        "HistGradientBoosting": HistGradientBoostingRegressor(
            max_iter=300,
            learning_rate=0.04,
            max_leaf_nodes=20,
            l2_regularization=1.0,
            random_state=RANDOM_STATE,
        ),
    }

    metrics_rows = []

    predictions_df = test_df[
        [
            DATE_COL,
            WAREHOUSE_COL,
            PRODUCT_COL,
            TARGET_COL,
        ]
    ].copy()

    predictions_df = predictions_df.rename(
        columns={TARGET_COL: "actual"}
    )

    # --------------------------------------------------------
    # BASELINE 1: LAG 7
    # --------------------------------------------------------

    if "lag_7" in test_df.columns:

        predictions_df["pred_baseline_lag7"] = (
            pd.to_numeric(
                test_df["lag_7"],
                errors="coerce",
            )
            .fillna(0)
            .clip(lower=0)
            .to_numpy()
        )

        baseline_metrics = calculate_metrics(
            y_test,
            predictions_df["pred_baseline_lag7"],
        )

        metrics_rows.append({
            "model": "Baseline_Lag7",
            **baseline_metrics,
        })

    # --------------------------------------------------------
    # BASELINE 2: LAG 1
    # --------------------------------------------------------

    if "lag_1" in test_df.columns:

        predictions_df["pred_baseline_lag1"] = (
            pd.to_numeric(
                test_df["lag_1"],
                errors="coerce",
            )
            .fillna(0)
            .clip(lower=0)
            .to_numpy()
        )

        baseline_metrics = calculate_metrics(
            y_test,
            predictions_df["pred_baseline_lag1"],
        )

        metrics_rows.append({
            "model": "Baseline_Lag1",
            **baseline_metrics,
        })

    # --------------------------------------------------------
    # HUAN LUYEN CAC MO HINH MACHINE LEARNING
    # --------------------------------------------------------

    for model_name, estimator in model_configs.items():

        print("\n" + "=" * 70)
        print("DANG HUAN LUYEN:", model_name)
        print("=" * 70)

        preprocessor = build_preprocessor(
            numeric_features,
            categorical_features,
        )

        pipeline = Pipeline(
            steps=[
                ("preprocessor", preprocessor),
                ("model", estimator),
            ]
        )

        pipeline.fit(
            X_train,
            y_train,
        )

        train_predictions = np.maximum(
            pipeline.predict(X_train),
            0,
        )

        test_predictions = np.maximum(
            pipeline.predict(X_test),
            0,
        )

        pred_col = f"pred_{model_name.lower()}"

        predictions_df[pred_col] = test_predictions

        train_metrics = calculate_metrics(
            y_train,
            train_predictions,
        )

        test_metrics = calculate_metrics(
            y_test,
            test_predictions,
        )

        metrics_rows.append({
            "model": model_name,
            **test_metrics,
        })

        print(
            f"Train MAE: {train_metrics['MAE']:.4f}"
        )

        print(
            f"Train RMSE: {train_metrics['RMSE']:.4f}"
        )

        print(
            f"Train WAPE: "
            f"{train_metrics['WAPE_percent']:.2f}%"
        )

        print(
            f"Test MAE: {test_metrics['MAE']:.4f}"
        )

        print(
            f"Test RMSE: {test_metrics['RMSE']:.4f}"
        )

        print(
            f"Test WAPE: "
            f"{test_metrics['WAPE_percent']:.2f}%"
        )

        # ----------------------------------------------------
        # FEATURE IMPORTANCE
        # ----------------------------------------------------

        if hasattr(estimator, "feature_importances_"):

            try:
                feature_names = (
                    pipeline.named_steps[
                        "preprocessor"
                    ].get_feature_names_out()
                )

                importance_df = pd.DataFrame({
                    "feature": feature_names,
                    "importance": estimator.feature_importances_,
                })

                importance_df = importance_df.sort_values(
                    "importance",
                    ascending=False,
                )

                importance_df.to_csv(
                    OUTPUT_DIR
                    / f"feature_importance_{model_name.lower()}.csv",
                    index=False,
                    encoding="utf-8-sig",
                )

            except Exception as exc:
                print(
                    "Khong xuat duoc feature importance:",
                    exc,
                )

    # ========================================================
    # 8. LUU KET QUA SO SANH MO HINH
    # ========================================================

    metrics_df = pd.DataFrame(metrics_rows)

    metrics_df = metrics_df.sort_values(
        "WAPE_percent",
        ascending=True,
        na_position="last",
    )

    metrics_path = (
        OUTPUT_DIR / "demand_forecast_metrics_V3.csv"
    )

    metrics_df.to_csv(
        metrics_path,
        index=False,
        encoding="utf-8-sig",
    )

    # ========================================================
    # 9. LUU DU BAO
    # ========================================================

    predictions_path = (
        OUTPUT_DIR / "demand_forecast_predictions_V3.csv"
    )

    predictions_df.to_csv(
        predictions_path,
        index=False,
        encoding="utf-8-sig",
    )

    # ========================================================
    # 10. PHAN TICH SAI SO THEO KHO VA SAN PHAM
    # ========================================================

    prediction_columns = [
        col for col in predictions_df.columns
        if col.startswith("pred_")
    ]

    error_rows = []

    for (warehouse, product), group in predictions_df.groupby(
        [WAREHOUSE_COL, PRODUCT_COL],
        dropna=False,
    ):

        actual = group["actual"].to_numpy(dtype=float)

        for pred_col in prediction_columns:

            predicted = group[pred_col].to_numpy(dtype=float)

            denominator = np.sum(np.abs(actual))

            if denominator > 0:
                wape = (
                    np.sum(np.abs(actual - predicted))
                    / denominator
                    * 100
                )
            else:
                wape = np.nan

            error_rows.append({
                WAREHOUSE_COL: warehouse,
                PRODUCT_COL: product,
                "model": pred_col.replace("pred_", ""),
                "so_ngay_test": len(group),
                "tong_nhu_cau_thuc_te": float(np.sum(actual)),
                "tong_du_doan": float(np.sum(predicted)),
                "MAE": float(
                    mean_absolute_error(actual, predicted)
                ),
                "WAPE_percent": (
                    float(wape)
                    if np.isfinite(wape)
                    else np.nan
                ),
            })

    errors_df = pd.DataFrame(error_rows)

    errors_path = (
        OUTPUT_DIR
        / "demand_forecast_error_by_warehouse_product_V3.csv"
    )

    errors_df.to_csv(
        errors_path,
        index=False,
        encoding="utf-8-sig",
    )

    # ========================================================
    # 11. DANH GIA RIENG NGAY CO NHU CAU = 0 VA > 0
    # ========================================================

    y_test_array = y_test.to_numpy()

    positive_mask = y_test_array > 0
    zero_mask = y_test_array == 0

    subset_rows = []

    for pred_col in prediction_columns:

        predicted = predictions_df[
            pred_col
        ].to_numpy(dtype=float)

        if positive_mask.any():

            positive_metrics = calculate_metrics(
                y_test_array[positive_mask],
                predicted[positive_mask],
            )

            subset_rows.append({
                "model": pred_col.replace("pred_", ""),
                "nhom": "actual > 0",
                "so_dong": int(positive_mask.sum()),
                **positive_metrics,
            })

        if zero_mask.any():

            zero_errors = predicted[zero_mask]

            subset_rows.append({
                "model": pred_col.replace("pred_", ""),
                "nhom": "actual = 0",
                "so_dong": int(zero_mask.sum()),
                "MAE": float(np.mean(np.abs(zero_errors))),
                "RMSE": float(
                    np.sqrt(np.mean(np.square(zero_errors)))
                ),
                "WAPE_percent": np.nan,
            })

    subset_path = (
        OUTPUT_DIR
        / "demand_forecast_metrics_by_demand_group_V3.csv"
    )

    pd.DataFrame(subset_rows).to_csv(
        subset_path,
        index=False,
        encoding="utf-8-sig",
    )

    # ========================================================
    # 12. IN TONG KET
    # ========================================================

    print("\n" + "=" * 70)
    print("TONG KET KET QUA TREN TAP TEST")
    print("=" * 70)

    print(
        metrics_df.to_string(
            index=False,
            float_format=lambda x: f"{x:.4f}",
        )
    )

    print("\nCAC FILE KET QUA:")

    print(f"1. Metrics: {metrics_path}")
    print(f"2. Du bao: {predictions_path}")
    print(f"3. Sai so theo kho/san pham: {errors_path}")
    print(f"4. Chi so theo nhom nhu cau: {subset_path}")

    print(
        "5. Bao cao ngay thieu: "
        f"{OUTPUT_DIR / 'daily_continuity_report.csv'}"
    )

    best_rows = metrics_df.dropna(
        subset=["WAPE_percent"]
    )

    if not best_rows.empty:

        best = best_rows.iloc[0]

        print("\nMO HINH CO WAPE THAP NHAT:")

        print(
            f"{best['model']} - "
            f"WAPE: {best['WAPE_percent']:.2f}%"
        )


if __name__ == "__main__":
    main()