import csv
import json
import math
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
try:
    import lightgbm as lgb
except ImportError:
    lgb = None
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parents[2]
INPUT_FILE = BASE_DIR / "data_mining" / "datasets" / "gold" / "analytical_dataset.csv"
OUTPUT_DIR = BASE_DIR / "data_mining" / "datasets" / "gold"
FORECAST_RESULTS_FILE = OUTPUT_DIR / "forecast_results.csv"
DATA_LAKE_FORECAST_FILE = BASE_DIR / "data_center" / "data_lake" / "gold" / "forecast_results.csv"
EVALUATION_REPORT_FILE = BASE_DIR / "data_mining" / "evaluation_report.md"
SECONDARY_EVALUATION_REPORT_FILE = (
    BASE_DIR / "data_mining" / "reports" / "evaluation_report.md"
)
MODEL_SELECTION_FILE = (
    BASE_DIR
    / "data_mining"
    / "models"
    / "model_registry"
    / "primary_model.json"
)

TEST_RATIO = 0.20
VALIDATION_RATIO = 0.15
CALIBRATION_SCALES = np.arange(0.50, 1.501, 0.01)


def calculate_wape(y_true, y_pred):
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    denominator = np.abs(y_true).sum()
    if denominator == 0:
        return float("nan")
    return float(np.abs(y_true - y_pred).sum() / denominator * 100)


def select_calibration_scale(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Choose a forecast scale using walk-forward validation predictions."""
    best_scale = min(
        CALIBRATION_SCALES,
        key=lambda scale: (
            calculate_wape(y_true, np.clip(y_pred * scale, 0, None)),
            abs(scale - 1.0),
        ),
    )
    return float(best_scale)


def build_features(df):
    """
    Trích xuất đặc trưng chuỗi thời gian:
    - lag_1: Lượng xuất hôm qua (t-1)
    - lag_7: Lượng xuất 7 ngày trước (cùng thứ tuần trước t-7)
    - rolling_mean_7: Trung bình trượt 7 ngày gần nhất (t-7 đến t-1)
    Lưu ý quan trọng: KHÔNG dùng dữ liệu ngày t để tính đặc trưng cho ngày t (tránh data leakage).
    """
    df = df.sort_values(by=["ma_kho", "ma_sp", "ngay"]).reset_index(drop=True)

    # Nhóm theo từng cặp kho - sản phẩm để tạo lags
    grouped = df.groupby(["ma_kho", "ma_sp"])["nhu_cau_xuat"]

    # lag_1 và lag_7
    df["lag_1"] = grouped.shift(1)
    df["lag_7"] = grouped.shift(7)
    df["rolling_mean_7"] = grouped.transform(lambda x: x.shift(1).rolling(window=7, min_periods=7).mean())

    # Giữ lại cột orig_ma_kho và orig_ma_sp để xuất file kết quả
    df["orig_ma_kho"] = df["ma_kho"]
    df["orig_ma_sp"] = df["ma_sp"]

    # Loại bỏ các ngày khởi động đầu tiên không đủ 7 ngày quá khứ để tạo đặc trưng
    df_clean = df.dropna(subset=["lag_1", "lag_7", "rolling_mean_7"]).copy()

    # One-hot encoding cho mã kho và mã sản phẩm
    df_encoded = pd.get_dummies(df_clean, columns=["ma_kho", "ma_sp"], drop_first=False)

    return df_encoded


def evaluate_validation_folds(
    df: pd.DataFrame,
    feature_cols: list[str],
) -> tuple[dict[str, float], float]:
    unique_dates = np.sort(df["ngay"].dropna().unique())
    fold_count = 2
    validation_days = max(
        1,
        int(math.ceil(len(unique_dates) * VALIDATION_RATIO)),
    )
    if len(unique_dates) <= fold_count * validation_days:
        raise ValueError(
            "Không đủ dữ liệu lịch sử để tạo hai cửa sổ walk-forward."
        )

    first_validation_start = len(unique_dates) - fold_count * validation_days
    fold_ranges = []
    for fold_index in range(fold_count):
        start_index = first_validation_start + fold_index * validation_days
        end_index = min(start_index + validation_days, len(unique_dates))
        fold_ranges.append((
            pd.Timestamp(unique_dates[start_index]),
            pd.Timestamp(unique_dates[end_index - 1]),
        ))

    scores = {"Ridge Regression": [], "Gradient Boosting (absolute_error)": []}
    gradient_boosting_validation = []

    for start_date, end_date in fold_ranges:
        train_fold = df[df["ngay"] < start_date]
        validation_fold = df[
            (df["ngay"] >= start_date)
            & (df["ngay"] <= end_date)
        ]

        if train_fold.empty or validation_fold.empty:
            raise ValueError(
                f"Không đủ dữ liệu cho validation window "
                f"{start_date} đến {end_date}."
            )

        X_train_fold = train_fold[feature_cols]
        y_train_fold = train_fold["nhu_cau_xuat"]
        X_validation_fold = validation_fold[feature_cols]
        y_validation_fold = validation_fold["nhu_cau_xuat"]

        models = {
            "Ridge Regression": Ridge(alpha=1.0),
            "Gradient Boosting (absolute_error)": GradientBoostingRegressor(
                loss="absolute_error",
                n_estimators=100,
                max_depth=2,
                min_samples_leaf=20,
                random_state=42,
            ),
        }

        for model_name, model in models.items():
            model.fit(X_train_fold, y_train_fold)
            predictions = np.clip(
                model.predict(X_validation_fold),
                0,
                None,
            )
            if model_name == "Gradient Boosting (absolute_error)":
                gradient_boosting_validation.append(
                    (y_validation_fold.to_numpy(), predictions)
                )
            else:
                scores[model_name].append(
                    mean_absolute_error(y_validation_fold, predictions)
                )

    validation_y = np.concatenate(
        [actual for actual, _predictions in gradient_boosting_validation]
    )
    validation_predictions = np.concatenate(
        [predictions for _actual, predictions in gradient_boosting_validation]
    )
    calibration_scale = select_calibration_scale(
        validation_y,
        validation_predictions,
    )
    scores["Gradient Boosting (absolute_error)"] = [
        mean_absolute_error(
            actual,
            np.clip(predictions * calibration_scale, 0, None),
        )
        for actual, predictions in gradient_boosting_validation
    ]

    return {
        model_name: float(np.mean(model_scores))
        for model_name, model_scores in scores.items()
    }, calibration_scale


def main():
    print("===== BẮT ĐẦU PIPELINE MACHINE LEARNING DỰ BÁO NHU CẦU =====")
    if not INPUT_FILE.exists():
        raise FileNotFoundError(f"Không tìm thấy file: {INPUT_FILE}")

    # Đọc dữ liệu
    df = pd.read_csv(INPUT_FILE, encoding="utf-8-sig")
    df["ngay"] = pd.to_datetime(df["ngay"], errors="raise")
    print(f"Tổng số dòng ban đầu: {len(df):,}")

    # Chuyển đổi kiểu dữ liệu
    df["nhu_cau_xuat"] = pd.to_numeric(df["nhu_cau_xuat"], errors="coerce").fillna(0.0)
    df["thu_trong_tuan"] = pd.to_numeric(df["thu_trong_tuan"], errors="coerce")
    df["la_cuoi_tuan"] = pd.to_numeric(df["la_cuoi_tuan"], errors="coerce")
    df["la_ngay_le"] = pd.to_numeric(df["la_ngay_le"], errors="coerce")

    # Tạo đặc trưng
    print("Đang tạo đặc trưng chuỗi thời gian và lịch (không dùng thời tiết tương lai)...")
    df_feat = build_features(df)
    print(f"Số dòng sau khi tạo lag features: {len(df_feat):,}")

    # Phân chia Train/Test theo thời gian
    unique_dates = np.sort(df_feat["ngay"].dropna().unique())
    if len(unique_dates) < 10:
        raise ValueError("Không đủ ngày dữ liệu để đánh giá dự báo.")
    test_days = max(1, int(math.ceil(len(unique_dates) * TEST_RATIO)))
    test_start_date = pd.Timestamp(unique_dates[-test_days])
    train_data = df_feat[df_feat["ngay"] < test_start_date].copy()
    test_data = df_feat[df_feat["ngay"] >= test_start_date].copy()

    print(f"Tập Train: {len(train_data):,} dòng (Từ {train_data['ngay'].min().date()} đến {train_data['ngay'].max().date()})")
    print(f"Tập Test:  {len(test_data):,} dòng (Từ {test_data['ngay'].min().date()} đến {test_data['ngay'].max().date()})")

    # Danh sách các cột đặc trưng (Feature columns)
    feature_cols = [
        "lag_1",
        "lag_7",
        "rolling_mean_7",
        "thu_trong_tuan",
        "la_cuoi_tuan",
        "la_ngay_le",
    ] + [c for c in df_feat.columns if c.startswith("ma_kho_") or c.startswith("ma_sp_")]

    validation_scores, calibration_scale = evaluate_validation_folds(
        train_data,
        feature_cols,
    )
    primary_model_name = min(
        validation_scores,
        key=validation_scores.get,
    )
    print("\n===== WALK-FORWARD VALIDATION (MAE) =====")
    for model_name, score in validation_scores.items():
        print(f"{model_name}: {score:.4f}")
    print(f"Mô hình chính được chọn: {primary_model_name}")

    X_train = train_data[feature_cols]
    y_train = train_data["nhu_cau_xuat"]
    X_test = test_data[feature_cols]
    y_test = test_data["nhu_cau_xuat"]

    # 1. BASELINE MODEL: Trung bình trượt 7 ngày gần nhất (rolling_mean_7)
    # Chuẩn so sánh tự nhiên nhất trong quản lý kho chuỗi thời gian
    y_pred_baseline = test_data["rolling_mean_7"].values

    mae_baseline = mean_absolute_error(y_test, y_pred_baseline)
    rmse_baseline = math.sqrt(mean_squared_error(y_test, y_pred_baseline))

    # 2. MODEL ML 1: Ridge Regression (Mô hình tuyến tính có điều chuẩn L2)
    print("\nĐang huấn luyện Model 1: Ridge Regression...")
    model_ridge = Ridge(alpha=1.0)
    model_ridge.fit(X_train, y_train)
    y_pred_ridge = model_ridge.predict(X_test)
    y_pred_ridge = np.clip(y_pred_ridge, 0, None)  # Bảo đảm an toàn: nhu cầu xuất không thể âm

    mae_ridge = mean_absolute_error(y_test, y_pred_ridge)
    rmse_ridge = math.sqrt(mean_squared_error(y_test, y_pred_ridge))

    # 3. MODEL ML 2: Random Forest Regressor (Mô hình học máy phi tuyến, dễ giải thích)
    print("Đang huấn luyện Model 2: Random Forest Regressor (n_estimators=100)...")
    model_rf = RandomForestRegressor(
        n_estimators=100,
        max_depth=10,
        random_state=42,
        n_jobs=-1
    )
    model_rf.fit(X_train, y_train)
    y_pred_rf = model_rf.predict(X_test)
    y_pred_rf = np.clip(y_pred_rf, 0, None)

    mae_rf = mean_absolute_error(y_test, y_pred_rf)
    rmse_rf = math.sqrt(mean_squared_error(y_test, y_pred_rf))

    # 4. MODEL ML 3: LightGBM Regressor (Gradient Boosting trên cây quyết định)
    print("Đang huấn luyện Model 3: LightGBM Regressor (n_estimators=100)...")
    if lgb is not None:
        model_lgb = lgb.LGBMRegressor(
            n_estimators=100,
            max_depth=6,
            learning_rate=0.03,
            num_leaves=31,
            random_state=42,
            verbose=-1
        )
        model_lgb.fit(X_train, y_train)
        y_pred_lgb = np.clip(model_lgb.predict(X_test), 0, None)
    else:
        from sklearn.ensemble import HistGradientBoostingRegressor
        model_lgb = HistGradientBoostingRegressor(max_iter=100, max_depth=6, random_state=42)
        model_lgb.fit(X_train, y_train)
        y_pred_lgb = np.clip(model_lgb.predict(X_test), 0, None)

    mae_lgb = mean_absolute_error(y_test, y_pred_lgb)
    rmse_lgb = math.sqrt(mean_squared_error(y_test, y_pred_lgb))

    print(
        "Đang huấn luyện Gradient Boosting Regressor "
        "(loss=absolute_error, n_estimators=100)..."
    )
    model_gradient_boosting = GradientBoostingRegressor(
        loss="absolute_error",
        n_estimators=100,
        max_depth=2,
        min_samples_leaf=20,
        random_state=42,
    )
    model_gradient_boosting.fit(X_train, y_train)
    y_pred_gradient_boosting = np.clip(
        model_gradient_boosting.predict(X_test),
        0,
        None,
    )
    mae_gradient_boosting = mean_absolute_error(
        y_test,
        y_pred_gradient_boosting,
    )
    rmse_gradient_boosting = math.sqrt(
        mean_squared_error(y_test, y_pred_gradient_boosting)
    )

    primary_predictions = (
        np.clip(y_pred_gradient_boosting * calibration_scale, 0, None)
        if primary_model_name == "Gradient Boosting (absolute_error)"
        else y_pred_ridge
    )
    mae_primary = mean_absolute_error(y_test, primary_predictions)
    rmse_primary = math.sqrt(
        mean_squared_error(y_test, primary_predictions)
    )
    wape_baseline = calculate_wape(y_test, np.round(y_pred_baseline, 2))
    wape_ridge = calculate_wape(y_test, np.round(y_pred_ridge, 2))
    wape_rf = calculate_wape(y_test, np.round(y_pred_rf, 2))
    wape_lgb = calculate_wape(y_test, np.round(y_pred_lgb, 2))
    wape_gradient_boosting = calculate_wape(
        y_test,
        np.round(y_pred_gradient_boosting, 2),
    )
    wape_primary = calculate_wape(
        y_test,
        np.round(primary_predictions, 2),
    )
    accuracy_primary = 100 - wape_primary

    # Lưu mô hình đã huấn luyện vào Model Registry
    MODEL_REGISTRY_DIR = BASE_DIR / "data_mining" / "models" / "model_registry"
    MODEL_REGISTRY_DIR.mkdir(parents=True, exist_ok=True)
    import joblib

    production_features = df_feat[feature_cols]
    production_target = df_feat["nhu_cau_xuat"]
    registry_models = {
        "ridge_model.joblib": model_ridge,
        "rf_model.joblib": model_rf,
        "lgb_model.joblib": model_lgb,
        "gradient_boosting_model.joblib": model_gradient_boosting,
    }
    for model_file, model in registry_models.items():
        production_model = clone(model)
        production_model.fit(production_features, production_target)
        joblib.dump(production_model, MODEL_REGISTRY_DIR / model_file)
    joblib.dump(
        production_features.columns.tolist(),
        MODEL_REGISTRY_DIR / "feature_columns.joblib",
    )
    print(
        "[MODEL REGISTRY] Đã huấn luyện lại các mô hình trên toàn bộ "
        f"{len(df_feat):,} dòng lịch sử và lưu vào: {MODEL_REGISTRY_DIR}"
    )

    with MODEL_SELECTION_FILE.open("w", encoding="utf-8") as f:
        json.dump(
            {
                "model_name": primary_model_name,
                "selection_metric": "walk_forward_mean_MAE_after_scale_calibration",
                "validation_mae": validation_scores,
                "prediction_calibration_scale": calibration_scale,
                "calibration_selection_metric": "walk_forward_WAPE",
                "holdout_start_date": test_data["ngay"].min().date().isoformat(),
                "holdout_end_date": test_data["ngay"].max().date().isoformat(),
                "holdout_rows": len(test_data),
                "holdout_wape_percent": wape_primary,
                "holdout_accuracy_100_minus_wape_percent": accuracy_primary,
                "production_training_rows": len(df_feat),
                "production_training_end_date": (
                    df_feat["ngay"].max().date().isoformat()
                ),
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    print(
        "\n===== KẾT QUẢ HOLDOUT THEO THỜI GIAN "
        f"({test_data['ngay'].min().date()} -> "
        f"{test_data['ngay'].max().date()}) ====="
    )
    print(
        f"{'Mô hình':30s} | {'MAE':10s} | {'RMSE':10s} | "
        f"{'WAPE':10s} | {'100-WAPE':10s}"
    )
    print("-" * 86)
    print(f"{'1. Baseline (Rolling Mean 7)':30s} | {mae_baseline:10.4f} | {rmse_baseline:10.4f} | {wape_baseline:9.2f}% | {100 - wape_baseline:9.2f}%")
    print(f"{'2. Linear Ridge Regression':30s} | {mae_ridge:10.4f} | {rmse_ridge:10.4f} | {wape_ridge:9.2f}% | {100 - wape_ridge:9.2f}%")
    print(f"{'3. Random Forest Regressor':30s} | {mae_rf:10.4f} | {rmse_rf:10.4f} | {wape_rf:9.2f}% | {100 - wape_rf:9.2f}%")
    print(f"{'4. LightGBM Regressor':30s} | {mae_lgb:10.4f} | {rmse_lgb:10.4f} | {wape_lgb:9.2f}% | {100 - wape_lgb:9.2f}%")
    print(
        f"{'5. Gradient Boosting (MAE)':30s} | "
        f"{mae_gradient_boosting:10.4f} | {rmse_gradient_boosting:10.4f} | "
        f"{wape_gradient_boosting:9.2f}% | {100 - wape_gradient_boosting:9.2f}%"
    )
    print(
        f"Primary={primary_model_name}; accuracy quy đổi "
        f"{accuracy_primary:.2f}% "
        f"({'đạt' if accuracy_primary > 90 else 'chưa đạt'} mục tiêu >90%)."
    )

    # Xuất file kết quả dự báo
    results_df = pd.DataFrame({
        "ngay": test_data["ngay"].values,
        "ma_kho": test_data["orig_ma_kho"].values,
        "ma_sp": test_data["orig_ma_sp"].values,
        "thuc_te": y_test.values,
        "du_bao_baseline": np.round(y_pred_baseline, 2),
        "du_bao_ridge": np.round(y_pred_ridge, 2),
        "du_bao_rf": np.round(y_pred_rf, 2),
        "du_bao_lgb": np.round(y_pred_lgb, 2),
        "du_bao_gradient_boosting": np.round(y_pred_gradient_boosting, 2),
        "du_bao_primary": np.round(primary_predictions, 2),
        "sai_so_tuyet_doi_rf": np.round(np.abs(y_test.values - y_pred_rf), 2),
    })

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    results_df.to_csv(FORECAST_RESULTS_FILE, index=False, encoding="utf-8-sig")
    DATA_LAKE_FORECAST_FILE.parent.mkdir(parents=True, exist_ok=True)
    results_df.to_csv(DATA_LAKE_FORECAST_FILE, index=False, encoding="utf-8-sig")
    print(f"\n[HOÀN TẤT] Đã lưu bảng kết quả dự báo ({len(results_df)} dòng) vào: {FORECAST_RESULTS_FILE}")

        # Tính toán chi tiết các phân khúc để phục vụ báo cáo
    kho_stats = []
    for kho in sorted(results_df["ma_kho"].unique()):
        sub = results_df[results_df["ma_kho"] == kho]
        k_base = mean_absolute_error(sub["thuc_te"], sub["du_bao_baseline"])
        k_ridge = mean_absolute_error(sub["thuc_te"], sub["du_bao_ridge"])
        k_rf = mean_absolute_error(sub["thuc_te"], sub["du_bao_rf"])
        k_lgb = mean_absolute_error(sub["thuc_te"], sub["du_bao_lgb"])
        k_gb = mean_absolute_error(
            sub["thuc_te"],
            sub["du_bao_gradient_boosting"],
        )
        k_mean = sub["thuc_te"].mean()
        k_zero = (sub["thuc_te"] == 0).mean() * 100
        kho_stats.append(
            (kho, len(sub), k_mean, k_zero, k_base, k_ridge, k_rf, k_lgb, k_gb)
        )

    # 2. Theo ngày có xuất vs ngày không xuất
    sub_zero = results_df[results_df["thuc_te"] == 0]
    sub_pos = results_df[results_df["thuc_te"] > 0]
    zero_base_mae = mean_absolute_error(sub_zero["thuc_te"], sub_zero["du_bao_baseline"])
    zero_ridge_mae = mean_absolute_error(sub_zero["thuc_te"], sub_zero["du_bao_ridge"])
    zero_rf_mae = mean_absolute_error(sub_zero["thuc_te"], sub_zero["du_bao_rf"])
    zero_lgb_mae = mean_absolute_error(sub_zero["thuc_te"], sub_zero["du_bao_lgb"])
    zero_gb_mae = mean_absolute_error(
        sub_zero["thuc_te"],
        sub_zero["du_bao_gradient_boosting"],
    )

    pos_base_mae = mean_absolute_error(sub_pos["thuc_te"], sub_pos["du_bao_baseline"])
    pos_ridge_mae = mean_absolute_error(sub_pos["thuc_te"], sub_pos["du_bao_ridge"])
    pos_rf_mae = mean_absolute_error(sub_pos["thuc_te"], sub_pos["du_bao_rf"])
    pos_lgb_mae = mean_absolute_error(sub_pos["thuc_te"], sub_pos["du_bao_lgb"])
    pos_gb_mae = mean_absolute_error(
        sub_pos["thuc_te"],
        sub_pos["du_bao_gradient_boosting"],
    )

    extraction_status_file = OUTPUT_DIR / "live_db_extract_status.json"
    sales_transaction_rows = None
    if extraction_status_file.exists():
        with extraction_status_file.open("r", encoding="utf-8") as f:
            extraction_status = json.load(f)
        sales_transaction_rows = extraction_status.get(
            "sales_transaction_rows"
        )
        future_transaction_rows_ignored = extraction_status.get(
            "future_transaction_rows_ignored", 0
        )
        sales_transaction_description = (
            f"{sales_transaction_rows:,} sales transactions"
            if sales_transaction_rows is not None
            else "sales transaction count not recorded"
        )
        source_description = (
            f"{extraction_status['source']}; "
            f"snapshot {extraction_status['extracted_at']}; "
            f"{extraction_status['source_transaction_rows']:,} source transactions; "
            f"{sales_transaction_description}; "
            f"{future_transaction_rows_ignored:,} future transactions ignored; "
            f"{extraction_status['rows']:,} daily warehouse-product groups; "
            f"{extraction_status['start_date']} to "
            f"{extraction_status['end_date']}."
        )
    else:
        sales_transaction_description = "sales transaction count not available"
        source_description = (
            "Source snapshot metadata is missing; the CSV's database "
            "freshness cannot be verified."
        )

    # 6. Ghi báo cáo đánh giá chuyên sâu (Markdown)
    report_lines = [
        "# BÁO CÁO ĐÁNH GIÁ MÔ HÌNH MACHINE LEARNING DỰ BÁO NHU CẦU XUẤT KHO",
        "",
        "**Dự Án:** Distributed Warehouse Management System (Phân hệ Data Mining)  ",
        f"**Thời điểm tạo:** {date.today().isoformat()} (Walk-forward calibration và time holdout)",
        "**Môi trường thực thi:** Python 3.11.5, scikit-learn, lightgbm, pandas, numpy  ",
        "**Mã nguồn thực thi:** `data_mining/models/train_forecast.py`",
        f"**Nguồn dữ liệu gần nhất:** {source_description}",
        "",
        "---",
        "",
        "## 1. Bài toán dự báo và đơn vị dự báo",
        "* **Bài toán nghiệp vụ:** Dự báo sản lượng xuất hàng ngắn hạn (1 ngày tới / 1-step-ahead forecast) cho từng mặt hàng tại từng kho phân tán (HN01, DN01, HCM01), phục vụ kế hoạch xuất kho và cảnh báo điều phối tồn kho liên kho.",
        "* **Đơn vị dự báo (Granularity):** Ngày × Kho × Mã sản phẩm (`ngay`, `ma_kho`, `ma_sp`).",
        "* **Biến mục tiêu ($y$):** `nhu_cau_xuat` (số lượng kiện/sản phẩm thực tế xuất ra trong ngày, giá trị thực >= 0).",
        "",
        "---",
        "",
        "## 2. Dữ liệu đầu vào và các đặc trưng sử dụng",
        f"Dữ liệu mô hình lấy từ Analytical Dataset (`data_mining/datasets/gold/analytical_dataset.csv`, {len(df):,} dòng). Nhu cầu gốc được đồng bộ từ PostgreSQL Central; các đặc trưng lịch/API được ghép trước khi huấn luyện.",
        "1. **Đặc trưng độ trễ chuỗi thời gian (Time-series Lags):**",
        "   * `lag_1`: Lượng xuất thực tế ngày hôm qua ($t-1$) của đúng cặp (kho, sản phẩm).",
        "   * `lag_7`: Lượng xuất thực tế cùng thứ tuần trước ($t-7$) để bắt tính chu kỳ tuần.",
        "2. **Đặc trưng thống kê trượt (Rolling Statistics):**",
        "   * `rolling_mean_7`: Trung bình trượt 7 ngày gần nhất ($t-7$ đến $t-1$), tính bằng `shift(1).rolling(7)`.",
        f"   * Hiệu chỉnh dự báo Gradient Boosting bằng một hệ số chung được chọn chỉ từ dự báo out-of-fold walk-forward: `{calibration_scale:.2f}`.",
        "3. **Đặc trưng lịch và ngày nghỉ lễ Việt Nam:**",
        "   * `thu_trong_tuan`: Thứ trong tuần (0: Thứ Hai đến 6: Chủ Nhật).",
        "   * `la_cuoi_tuan`: 1 nếu là Thứ Bảy hoặc Chủ Nhật, 0 nếu ngày thường.",
        "   * `la_ngay_le`: 1 nếu là ngày nghỉ lễ chính thức theo Điều 112 Bộ Luật Lao Động 2019, 0 nếu không.",
        "4. **Đặc trưng định danh thực thể (One-hot Encoding):**",
        "   * 3 biến định danh kho: `ma_kho_DN01`, `ma_kho_HCM01`, `ma_kho_HN01`.",
        "   * 20 biến định danh sản phẩm: `ma_sp_SP001` đến `ma_sp_SP020`.",
        "   * Không dùng thời tiết quan trắc của ngày dự báo vì thông tin đó chưa có tại thời điểm dự báo.",
        "",
        "---",
        "",
        "## 3. Cách chia Train/Test theo thời gian & Chống rò rỉ dữ liệu",
        "* **Phương pháp chia tập:** Phân chia nghiêm ngặt theo trục thời gian (Time-series Split), tuyệt đối không xáo trộn ngẫu nhiên (no random shuffle) nhằm mô phỏng đúng thực tế vận hành:",
        f"  * **Tập Huấn luyện (Train set):** Từ `{train_data['ngay'].min().date()}` đến `{train_data['ngay'].max().date()}` ({len(train_data):,} bản ghi).",
        f"  * **Tập Kiểm thử (Test set):** Từ `{test_data['ngay'].min().date()}` đến `{test_data['ngay'].max().date()}` ({len(test_data):,} bản ghi, {test_data['ngay'].nunique()} ngày out-of-sample; chiếm 20% số ngày).",
        f"  * **Walk-forward validation trước test:** MAE Ridge trung bình {validation_scores['Ridge Regression']:.4f}; Gradient Boosting sau hiệu chỉnh {validation_scores['Gradient Boosting (absolute_error)']:.4f}; hệ số hiệu chỉnh được chọn bằng WAPE trên các dự báo out-of-fold.",
        "* **Bảo đảm không rò rỉ thông tin tương lai (Data Leakage):**",
        "  * `shift(1)` được thực thi TRƯỚC khi tính cửa sổ `rolling(7)`, bảo đảm đặc trưng tại ngày $t$ không chứa target ngày $t$.",
        f"  * Toàn bộ tập Test nằm sau tập Train (`min(Test) = {test_data['ngay'].min().date()} > max(Train) = {train_data['ngay'].max().date()}`).",
        "  * Các kiểm thử toán học trong `test_data_mining_suite.py` đã xác minh: khi cố tình thay đổi nhãn ngày $t$ thành 999,999, vector đặc trưng ngày $t$ hoàn toàn bất biến.",
        "",
        "---",
        "",
        "## 4. Nguyên lý của các mô hình so sánh",
        "",
        "1. **Baseline (Trung bình trượt 7 ngày - Rolling Mean 7):**",
        "   * *Nguyên lý:* Lấy trung bình cộng lượng xuất của 7 ngày quá khứ gần nhất làm dự báo cho ngày mai.",
        "   * *Ý nghĩa:* Đại diện cho quy tắc kinh nghiệm truyền thống của quản lý kho khi chưa ứng dụng Machine Learning.",
        "2. **Linear Ridge Regression (Hồi quy tuyến tính có điều chuẩn L2):**",
        "   * *Nguyên lý:* Thiết lập hàm hồi quy tuyến tính y_hat = w^T * x + b, tối thiểu hóa tổng sai số bình phương kết hợp chế tài trọng số L2 (alpha = 1.0) để triệt tiêu hiện tượng đa cộng tuyến giữa lag_1, lag_7 và rolling_mean_7.",
        "   * *Ưu điểm:* Nghiệm giải tích ổn định tuyệt đối, tốc độ huấn luyện tức thì, trọng số dễ diễn giải.",
        "3. **Random Forest Regressor (Rừng cây quyết định ngẫu nhiên):**",
        "   * *Nguyên lý:* Mô hình Ensemble gồm 100 cây quyết định (`n_estimators=100`, `max_depth=10`, `random_state=42`) huấn luyện theo cơ chế Bagging. Kết quả là trung bình dự báo của tất cả các cây con.",
        "   * *Ưu điểm:* Tự động nắm bắt các tương tác phi tuyến tính giữa yếu tố ngày lễ, thứ trong tuần và lượng xuất quá khứ.",
        "4. **LightGBM Regressor (Gradient Boosting Decision Tree tối ưu tốc độ):**",
        "   * *Nguyên lý:* Thuật toán tăng cường độ dốc phát triển cây theo cơ chế lá (leaf-wise) kết hợp histogram-based learning, tối ưu hóa hàm mất mát L2 với các siêu tham số chuẩn hóa (`n_estimators=100`, `learning_rate=0.05`, `num_leaves=31`).",
        "   * *Ưu điểm:* Tốc độ huấn luyện siêu tốc, xử lý xuất sắc các đặc trưng dạng bảng và quan hệ phi tuyến phức tạp trong dữ liệu chuỗi thời gian phân tán.",
        "5. **Gradient Boosting Regressor (absolute error):**",
        "   * *Nguyên lý:* Tối ưu trực tiếp sai số tuyệt đối (MAE), dùng 100 cây nông (`max_depth=2`, `min_samples_leaf=20`) để giảm quá khớp trên chuỗi nhu cầu nhiễu.",
        "",
        "---",
        "",
        "## 5. Bảng MAE/RMSE từ lần chạy thực tế mới nhất",
        "",
        f"### 5.1. Đánh giá tổng thể trên toàn bộ tập Test ({len(test_data):,} dòng)",
        "",
        "| Mô hình | MAE | RMSE | WAPE (%) | Accuracy quy đổi (100 − WAPE) |",
        "| :--- | :---: | :---: | :---: | :---: |",
        f"| **Baseline (Rolling Mean 7)** | **{mae_baseline:.4f}** | **{rmse_baseline:.4f}** | {wape_baseline:.2f}% | {100 - wape_baseline:.2f}% |",
        f"| **Linear Ridge Regression** | **{mae_ridge:.4f}** | **{rmse_ridge:.4f}** | {wape_ridge:.2f}% | {100 - wape_ridge:.2f}% |",
        f"| **Random Forest Regressor** | **{mae_rf:.4f}** | **{rmse_rf:.4f}** | {wape_rf:.2f}% | {100 - wape_rf:.2f}% |",
        f"| **LightGBM Regressor** | **{mae_lgb:.4f}** | **{rmse_lgb:.4f}** | {wape_lgb:.2f}% | {100 - wape_lgb:.2f}% |",
        f"| **Gradient Boosting (absolute_error)** | **{mae_gradient_boosting:.4f}** | **{rmse_gradient_boosting:.4f}** | {wape_gradient_boosting:.2f}% | {100 - wape_gradient_boosting:.2f}% |",
        f"| **Mô hình chính ({primary_model_name})** | **{mae_primary:.4f}** | **{rmse_primary:.4f}** | **{wape_primary:.2f}%** | **{accuracy_primary:.2f}%** |",
        "",
        f"Accuracy quy đổi của mô hình chính là **{accuracy_primary:.2f}%**; mục tiêu trên 90% {'đạt' if accuracy_primary > 90 else 'chưa đạt'}. Đây là `100 − WAPE`, không phải tỷ lệ phân loại đúng.",
        "",
        "### 5.2. Đánh giá chi tiết theo từng kho",
        "",
        "| Mã kho | MAE Baseline | MAE Ridge | MAE Random Forest | MAE LightGBM | MAE Gradient Boosting |",
        "| :--- | :---: | :---: | :---: | :---: | :---: |",
        f"| DN01 | {kho_stats[0][4]:.4f} | {kho_stats[0][5]:.4f} | {kho_stats[0][6]:.4f} | {kho_stats[0][7]:.4f} | {kho_stats[0][8]:.4f} |",
        f"| HCM01 | {kho_stats[1][4]:.4f} | {kho_stats[1][5]:.4f} | {kho_stats[1][6]:.4f} | {kho_stats[1][7]:.4f} | {kho_stats[1][8]:.4f} |",
        f"| HN01 | {kho_stats[2][4]:.4f} | {kho_stats[2][5]:.4f} | {kho_stats[2][6]:.4f} | {kho_stats[2][7]:.4f} | {kho_stats[2][8]:.4f} |",
        "",
        "### 5.3. Đánh giá theo nhóm ngày: Nhu cầu bằng 0 vs Nhu cầu dương",
        "",
        "| Phân khúc ngày | Số bản ghi | Tỷ lệ (%) | MAE Baseline | MAE Ridge | MAE Random Forest | MAE LightGBM | MAE Gradient Boosting |",
        "| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |",
        f"| Nhu cầu = 0 | {len(sub_zero):,} | {len(sub_zero)/len(results_df)*100:.2f}% | {zero_base_mae:.4f} | {zero_ridge_mae:.4f} | {zero_rf_mae:.4f} | {zero_lgb_mae:.4f} | {zero_gb_mae:.4f} |",
        f"| Nhu cầu > 0 | {len(sub_pos):,} | {len(sub_pos)/len(results_df)*100:.2f}% | {pos_base_mae:.4f} | {pos_ridge_mae:.4f} | {pos_rf_mae:.4f} | {pos_lgb_mae:.4f} | {pos_gb_mae:.4f} |",
        "",
        "---",
        "",
        "## 6. Mô hình được lựa chọn và căn cứ quyết định",
        f"* **Mô hình khuyến nghị triển khai chính (Primary):** **{primary_model_name}**, dự báo nhân hệ số hiệu chỉnh `{calibration_scale:.2f}` được chọn từ walk-forward validation.",
        "* **Mô hình đối sánh:** Ridge Regression, Random Forest và LightGBM.",
        "* **Các căn cứ khoa học & thực tiễn:**",
        f"  1. **Walk-forward validation:** MAE trung bình của mô hình chính sau hiệu chỉnh là {validation_scores[primary_model_name]:.4f}; Ridge là {validation_scores['Ridge Regression']:.4f}.",
        f"  2. **Kiểm thử cuối:** MAE mô hình chính {mae_primary:.4f}, baseline {mae_baseline:.4f}, cải thiện {(mae_baseline - mae_primary) / mae_baseline * 100:.2f}% so với baseline.",
        f"  3. **Đánh đổi chỉ số:** RMSE mô hình chính là {rmse_primary:.4f}, Ridge là {rmse_ridge:.4f}; mô hình được chọn để tối ưu MAE, không phải mọi loại sai số.",
        "  4. Mô hình và dự báo đã được chặn cận dưới 0; tập kiểm thử không dùng thời tiết quan trắc của chính ngày cần dự báo.",
        f"  5. Model Registry đã được huấn luyện lại trên toàn bộ {len(df_feat):,} quan sát có đặc trưng (đến {df_feat['ngay'].max().date()}); holdout metrics ở trên vẫn chỉ tính từ mô hình huấn luyện trên phần Train.",
        "",
        "---",
        "",
        "## 7. Hạn chế của dữ liệu và mô hình cần lưu ý",
        "1. **Bài toán 1 bước thời gian (1-step-ahead):** Mô hình dự báo ngày mai dựa trên số liệu thực tế đã chốt hôm nay. Nếu muốn dự báo 7 ngày hay 30 ngày liên tiếp mà không có số liệu thực tế xen kẽ, cần triển khai cơ chế Recursive Forecasting.",
        f"2. **Nhu cầu ngắt quãng (Intermittent Demand):** {len(sub_zero) / len(results_df) * 100:.2f}% các dòng trong tập test có nhu cầu xuất bằng 0. Gradient Boosting có MAE nhóm này {zero_gb_mae:.4f}, và MAE nhóm có nhu cầu dương {pos_gb_mae:.4f}; cần theo dõi cả hai phân khúc.",
        "3. **Ảnh hưởng của thời tiết:** Mô hình không dùng thời tiết quan trắc cùng ngày vì không khả dụng tại thời điểm dự báo. Nếu muốn dùng, cần ghép dự báo thời tiết có dấu thời gian phát hành để tránh nhìn trước tương lai.",
        "4. **Giả định lượng xuất quan sát được (Observed vs Unmet Demand):** Dữ liệu xuất kho phản ánh số lượng đã xuất thành công. Nếu kho bị đứt hàng (stockout), lượng xuất bằng 0 nhưng nhu cầu khách vẫn có; mô hình hiện tại dự báo lượng xuất thực tế quan sát được, không phải nhu cầu tiềm năng.",
        (
            "5. **Thiếu dữ liệu đơn hàng khách hàng:** "
            f"Snapshot DB hiện có {extraction_status['sales_transaction_rows']:,} dòng "
            "trong `ban_hang_central`; do đó chưa thể huấn luyện/đánh giá nhu cầu khách "
            "chưa được đáp ứng từ bảng này. Muốn dự báo nhu cầu thực thay vì lượng đã xuất, "
            "cần ghi nhận đơn đặt hàng, số lượng yêu cầu, giao thiếu/hủy và trạng thái hết hàng."
            if sales_transaction_rows is not None
            else "5. **Thiếu dữ liệu đơn hàng khách hàng:** Snapshot trích xuất chưa ghi nhận số lượng dòng `ban_hang_central`; chạy lại toàn bộ pipeline để cập nhật metadata."
        ),
        "",
        "---",
        "",
        "## 8. Hướng dẫn chạy lại và tái lập kết quả",
        "",
        "* **Chạy lại toàn bộ pipeline tự động (ETL + EDA + ML + Quyết định kho):**",
        "  ```powershell",
        "  py data_mining/run_pipeline.py",
        "  ```",
        "* **Chạy toàn bộ bộ kiểm thử tự động:**",
        "  ```powershell",
        "  py -m unittest data_mining/tests/test_data_mining_suite.py",
        "  ```",
        "* **Chạy riêng phân hệ Machine Learning:**",
        "  ```powershell",
        "  py data_mining/models/train_forecast.py",
        "  ```"
    ]
    report_content = "\n".join(report_lines)

    for report_file in (
        EVALUATION_REPORT_FILE,
        SECONDARY_EVALUATION_REPORT_FILE,
    ):
        report_file.parent.mkdir(parents=True, exist_ok=True)
        report_file.write_text(report_content, encoding="utf-8")
        print(f"[HOÀN TẤT] Đã lưu báo cáo đánh giá vào: {report_file}")



if __name__ == "__main__":
    main()
