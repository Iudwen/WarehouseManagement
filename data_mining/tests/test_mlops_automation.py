# -*- coding: utf-8 -*-
"""
Bộ kiểm thử tự động cho hệ thống MLOps Retrain Pipeline & Task Scheduler.
"""

import sys
import json
import unittest
from pathlib import Path
import pandas as pd

BASE_DIR = Path(__file__).resolve().parents[2]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

REGISTRY_DIR = BASE_DIR / "data_mining" / "models" / "model_registry"
RUNS_LOG_FILE = REGISTRY_DIR / "training_runs.json"
STAGING_DIR = REGISTRY_DIR / "staging"
ANALYTICAL_FILE = BASE_DIR / "data_mining" / "datasets" / "gold" / "analytical_dataset.csv"

from data_mining.models.mlops_retrain_pipeline import (
    load_run_history,
    run_mlops_retraining,
    prepare_retrain_data
)
from data_mining.models.model_registry.model_tracker import (
    load_version_history,
    compare_with_active
)


class TestMlopsAutomation(unittest.TestCase):
    """
    Kiểm thử tự động hóa quy trình tái huấn luyện và giám sát mô hình định kỳ (MLOps).
    """

    def test_run_history_file_and_schema(self):
        """Kiểm tra file training_runs.json tồn tại và có schema chuẩn mực."""
        self.assertTrue(RUNS_LOG_FILE.exists(), f"Thiếu file: {RUNS_LOG_FILE}")
        history = load_run_history()
        self.assertIn("total_runs", history)
        self.assertIn("successful_runs", history)
        self.assertIn("runs", history)
        self.assertGreater(history["total_runs"], 0, "Phải có ít nhất 1 lần chạy được ghi nhận")

        last_run = history["runs"][-1]
        required_fields = ["run_id", "start_time", "end_time", "duration_seconds", "status"]
        for field in required_fields:
            self.assertIn(field, last_run, f"Thiếu trường {field} trong bản ghi lần chạy")

    def test_active_model_protection(self):
        """Kiểm tra cơ chế bảo vệ: Mô hình Production tuyệt đối không bị tự động thay thế."""
        history = load_run_history()
        for run in history["runs"]:
            if run.get("status") == "SUCCESS":
                self.assertFalse(
                    run.get("production_updated", False),
                    "LỖI BẢO VỆ: production_updated phải luôn là False khi chạy tự động!"
                )

    def test_staging_model_artifacts_saved(self):
        """Kiểm tra thư mục staging lưu trữ các mô hình ứng viên đạt tiêu chuẩn APPROVE."""
        self.assertTrue(STAGING_DIR.exists(), f"Thiếu thư mục staging: {STAGING_DIR}")
        staging_files = list(STAGING_DIR.glob("*.joblib"))
        self.assertGreater(len(staging_files), 0, "Phải có ít nhất 1 mô hình ứng viên trong staging")

    def test_insufficient_data_error_handling(self):
        """Kiểm tra xử lý ngoại lệ khi tập dữ liệu không đủ dòng (dưới 5000 dòng)."""
        import tempfile
        from unittest.mock import patch

        # Tạo file tạm thời chỉ có 10 dòng
        small_df = pd.DataFrame({
            "ngay": ["2026-08-01"] * 10,
            "ma_kho": ["HN01"] * 10,
            "ma_sp": ["SP001"] * 10,
            "nhu_cau_xuat": [10] * 10,
            "nhiet_do_tb": [28.0] * 10,
            "luong_mua": [0.0] * 10,
            "thu_trong_tuan": [5] * 10,
            "la_cuoi_tuan": [1] * 10,
            "la_ngay_le": [0] * 10
        })

        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp:
            tmp_path = Path(tmp.name)
            small_df.to_csv(tmp_path, index=False)

        try:
            with patch("data_mining.models.mlops_retrain_pipeline.ANALYTICAL_FILE", tmp_path):
                res = run_mlops_retraining()
                self.assertEqual(res["status"], "INSUFFICIENT_DATA")
                self.assertIn("too small", res["message"])
        finally:
            if tmp_path.exists():
                tmp_path.unlink()

    def test_missing_dataset_error_handling(self):
        """Kiểm tra xử lý ngoại lệ khi file Analytical không tồn tại."""
        from unittest.mock import patch
        fake_path = BASE_DIR / "data_mining" / "datasets" / "non_existent_file.csv"

        with patch("data_mining.models.mlops_retrain_pipeline.ANALYTICAL_FILE", fake_path):
            res = run_mlops_retraining()
            self.assertEqual(res["status"], "FAILED")
            self.assertEqual(res["error_type"], "FILE_NOT_FOUND")

    def test_weekly_batch_script_exists_and_configured(self):
        """Kiểm tra các script Windows Task Scheduler tồn tại và cấu hình đúng."""
        retrain_bat = BASE_DIR / "scripts" / "mlops_weekly_retrain.bat"
        register_bat = BASE_DIR / "scripts" / "register_mlops_task.bat"
        self.assertTrue(retrain_bat.exists(), f"Thiếu file: {retrain_bat}")
        self.assertTrue(register_bat.exists(), f"Thiếu file: {register_bat}")

        content = retrain_bat.read_text(encoding="utf-8", errors="ignore")
        self.assertIn("mlops_retrain_pipeline.py", content)
        self.assertIn("mlops_weekly_run.log", content)


if __name__ == "__main__":
    unittest.main()
