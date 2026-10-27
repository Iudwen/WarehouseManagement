# -*- coding: utf-8 -*-
"""
Module: mlops_retrain_pipeline.py
Mục đích: Thực thi quy trình tái huấn luyện và đánh giá mô hình định kỳ (Automated Retraining & Evaluation).
"""

import sys
import json
import time
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional

try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import numpy as np
import pandas as pd
import joblib

# Thiết lập đường dẫn
BASE_DIR = Path(__file__).resolve().parents[2]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

DATA_DIR = BASE_DIR / "data_mining" / "datasets" / "gold"
ANALYTICAL_FILE = DATA_DIR / "analytical_dataset.csv"
REGISTRY_DIR = BASE_DIR / "data_mining" / "models" / "model_registry"
STAGING_DIR = REGISTRY_DIR / "staging"
RUNS_LOG_FILE = REGISTRY_DIR / "training_runs.json"

from data_mining.models.model_registry.model_tracker import (
    load_version_history,
    compare_with_active,
    record_model_version
)
from data_mining.models.train_forecast import build_features


def load_run_history() -> Dict[str, Any]:
    """Tải lịch sử các lần chạy huấn luyện từ training_runs.json"""
    if not RUNS_LOG_FILE.exists():
        return {
            "total_runs": 0,
            "successful_runs": 0,
            "failed_runs": 0,
            "runs": []
        }
    try:
        with RUNS_LOG_FILE.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {
            "total_runs": 0,
            "successful_runs": 0,
            "failed_runs": 0,
            "runs": []
        }


def save_run_history(history: Dict[str, Any]) -> None:
    """Lưu lịch sử các lần chạy huấn luyện"""
    REGISTRY_DIR.mkdir(parents=True, exist_ok=True)
    with RUNS_LOG_FILE.open("w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)


def log_training_run(run_record: Dict[str, Any]) -> None:
    """Ghi nhận bản ghi một lần chạy vào training_runs.json"""
    history = load_run_history()
    history["runs"].append(run_record)
    history["total_runs"] = len(history["runs"])
    if run_record.get("status") == "SUCCESS":
        history["successful_runs"] = history.get("successful_runs", 0) + 1
    else:
        history["failed_runs"] = history.get("failed_runs", 0) + 1
    save_run_history(history)


def prepare_retrain_data(df: pd.DataFrame, test_days: int = 49):
    """
    Tiền xử lý và chia tập Time-series Split cho chuỗi thời gian.
    """
    df = df.copy()
    df["nhu_cau_xuat"] = pd.to_numeric(df["nhu_cau_xuat"], errors="coerce").fillna(0.0)
    df["nhiet_do_tb"] = pd.to_numeric(df["nhiet_do_tb"], errors="coerce")
    if df["nhiet_do_tb"].isna().any():
        df["nhiet_do_tb"] = df["nhiet_do_tb"].fillna(df["nhiet_do_tb"].mean())
    df["luong_mua"] = pd.to_numeric(df["luong_mua"], errors="coerce").fillna(0.0)
    df["thu_trong_tuan"] = pd.to_numeric(df["thu_trong_tuan"], errors="coerce")
    df["la_cuoi_tuan"] = pd.to_numeric(df["la_cuoi_tuan"], errors="coerce")
    df["la_ngay_le"] = pd.to_numeric(df["la_ngay_le"], errors="coerce")

    # Tạo đặc trưng chuỗi thời gian và One-hot
    df_feat = build_features(df)

    # Chia train/test theo test_days ngày cuối cùng
    all_dates = sorted(df_feat["ngay"].unique())
    if len(all_dates) <= test_days:
        raise ValueError(f"Không đủ số ngày để chia tập test ({len(all_dates)} ngày <= {test_days} ngày test)")

    test_dates = set(all_dates[-test_days:])
    train_mask = ~df_feat["ngay"].isin(test_dates)
    test_mask = df_feat["ngay"].isin(test_dates)

    train_data = df_feat[train_mask].copy()
    test_data = df_feat[test_mask].copy()

    feature_cols = [
        "lag_1",
        "lag_7",
        "rolling_mean_7",
        "nhiet_do_tb",
        "luong_mua",
        "thu_trong_tuan",
        "la_cuoi_tuan",
        "la_ngay_le",
    ] + [c for c in df_feat.columns if c.startswith("ma_kho_") or c.startswith("ma_sp_")]

    X_train = train_data[feature_cols]
    y_train = train_data["nhu_cau_xuat"]
    X_test = test_data[feature_cols]
    y_test = test_data["nhu_cau_xuat"]

    return X_train, y_train, X_test, y_test, train_data, test_data, feature_cols


def run_mlops_retraining(test_days: int = 49, threshold_pct: float = 10.0, save_staging: bool = True) -> Dict[str, Any]:
    """
    Thực thi quy trình tái huấn luyện tự động.
    """
    start_time = time.time()
    run_id = f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    start_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    print(f"================================================================================")
    print(f"[MLOps Retrain] Starting automated retraining session: {run_id}")
    print(f"Start time: {start_iso}")
    print(f"================================================================================")

    # 1. Kiểm tra tập dữ liệu Analytical
    if not ANALYTICAL_FILE.exists():
        err_msg = f"Analytical dataset not found at: {ANALYTICAL_FILE}"
        print(f"[MLOps Error] {err_msg}")
        record = {
            "run_id": run_id,
            "start_time": start_iso,
            "end_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "duration_seconds": round(time.time() - start_time, 2),
            "status": "FAILED",
            "error_type": "FILE_NOT_FOUND",
            "message": err_msg
        }
        log_training_run(record)
        return record

    try:
        df = pd.read_csv(ANALYTICAL_FILE)
    except Exception as e:
        err_msg = f"Error reading Analytical dataset: {str(e)}"
        print(f"[MLOps Error] {err_msg}")
        record = {
            "run_id": run_id,
            "start_time": start_iso,
            "end_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "duration_seconds": round(time.time() - start_time, 2),
            "status": "FAILED",
            "error_type": "READ_ERROR",
            "message": err_msg
        }
        log_training_run(record)
        return record

    # Kiểm tra số lượng dòng tối thiểu
    MIN_REQUIRED_ROWS = 5000
    if len(df) < MIN_REQUIRED_ROWS:
        err_msg = f"Dataset too small ({len(df)} rows < {MIN_REQUIRED_ROWS} minimum required)."
        print(f"[MLOps Warning] {err_msg}")
        record = {
            "run_id": run_id,
            "start_time": start_iso,
            "end_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "duration_seconds": round(time.time() - start_time, 2),
            "status": "INSUFFICIENT_DATA",
            "dataset_rows": len(df),
            "message": err_msg
        }
        log_training_run(record)
        return record

    try:
        # 2. Xử lý dữ liệu và chia tập Time-series Split
        from sklearn.linear_model import Ridge
        import lightgbm as lgb

        X_train, y_train, X_test, y_test, train_df, test_df, feature_cols = prepare_retrain_data(df, test_days=test_days)

        train_info = {
            "train_rows": len(X_train),
            "test_rows": len(X_test),
            "train_range": f"{train_df['ngay'].min()} -> {train_df['ngay'].max()}",
            "test_range": f"{test_df['ngay'].min()} -> {test_df['ngay'].max()}",
            "feature_count": len(feature_cols)
        }

        # 3. Huấn luyện mô hình ứng viên (Candidate Models)
        print(f"[*] Training candidate models on {len(X_train)} training rows...")
        # Ridge Candidate
        ridge_cand = Ridge(alpha=100.0, random_state=42)
        ridge_cand.fit(X_train, y_train)
        pred_ridge = np.clip(ridge_cand.predict(X_test), 0, None)
        mae_ridge = float(np.mean(np.abs(y_test.values - pred_ridge)))
        rmse_ridge = float(np.sqrt(np.mean((y_test.values - pred_ridge) ** 2)))

        # LightGBM Candidate
        lgb_cand = lgb.LGBMRegressor(
            n_estimators=100,
            learning_rate=0.05,
            num_leaves=31,
            random_state=42,
            verbosity=-1,
            n_jobs=2
        )
        lgb_cand.fit(X_train, y_train)
        pred_lgb = np.clip(lgb_cand.predict(X_test), 0, None)
        mae_lgb = float(np.mean(np.abs(y_test.values - pred_lgb)))
        rmse_lgb = float(np.sqrt(np.mean((y_test.values - pred_lgb) ** 2)))

        candidate_metrics = {
            "ridge": {"mae": round(mae_ridge, 4), "rmse": round(rmse_ridge, 4)},
            "lightgbm": {"mae": round(mae_lgb, 4), "rmse": round(rmse_lgb, 4)}
        }

        # 4. So sánh với mô hình Active trong Production
        comp_result = compare_with_active(
            candidate_metrics={"mae": mae_lgb, "rmse": rmse_lgb},
            model_name="lightgbm",
            threshold_pct=threshold_pct
        )

        # 5. Lưu mô hình vào Staging nếu đạt tiêu chuẩn đề xuất APPROVE
        staging_saved = False
        if comp_result.get("recommendation") == "APPROVE_FOR_STAGING" and save_staging:
            STAGING_DIR.mkdir(parents=True, exist_ok=True)
            joblib.dump(ridge_cand, STAGING_DIR / f"candidate_ridge_{run_id}.joblib")
            joblib.dump(lgb_cand, STAGING_DIR / f"candidate_lgb_{run_id}.joblib")
            staging_saved = True
            print(f"[MLOps Staging] Candidate models saved to: {STAGING_DIR}")

        # 6. Ghi nhận phiên bản ứng viên vào Model Registry (nhưng KHÔNG active)
        cand_version_id = f"candidate-{run_id}"
        record_model_version(
            version_id=cand_version_id,
            metrics=candidate_metrics,
            dataset_info=train_info,
            features=feature_cols,
            description=f"Automated retraining candidate {run_id}",
            set_as_active=False  # TUYỆT ĐỐI KHÔNG tự động thay thế production
        )

        duration = round(time.time() - start_time, 2)
        record = {
            "run_id": run_id,
            "start_time": start_iso,
            "end_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "duration_seconds": duration,
            "status": "SUCCESS",
            "dataset_info": train_info,
            "candidate_metrics": candidate_metrics,
            "evaluation_against_active": comp_result,
            "staging_saved": staging_saved,
            "production_updated": False,  # Luôn luôn False để bảo vệ mô hình Active
            "message": comp_result.get("message", "Huấn luyện và đánh giá hoàn tất.")
        }

        log_training_run(record)
        print(f"[MLOps Complete] Status: SUCCESS ({duration}s)")
        print(f"Candidate evaluation: {comp_result.get('status')} -> {comp_result.get('recommendation')}")
        print(f"Active Production Model: PROTECTED (Unchanged).")
        return record

    except Exception as e:
        err_msg = f"Training exception: {str(e)}"
        print(f"[MLOps Error] {err_msg}")
        record = {
            "run_id": run_id,
            "start_time": start_iso,
            "end_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "duration_seconds": round(time.time() - start_time, 2),
            "status": "FAILED",
            "error_type": "TRAINING_EXCEPTION",
            "message": err_msg
        }
        log_training_run(record)
        return record


if __name__ == "__main__":
    result = run_mlops_retraining()
    print("\nSummary of MLOps run:")
    print(f"Run ID: {result.get('run_id')} | Status: {result.get('status')} | Duration: {result.get('duration_seconds')}s")
    print(f"Candidate LightGBM MAE: {result.get('candidate_metrics', {}).get('lightgbm', {}).get('mae')}")
    print(f"Recommendation: {result.get('evaluation_against_active', {}).get('recommendation')}")
    print(f"Production Updated: {result.get('production_updated')}")
