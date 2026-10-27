# -*- coding: utf-8 -*-
"""
Bộ kiểm thử tự động cho Data Lakehouse (Delta Lake) và cơ chế Time Travel thực sự.
"""

import sys
import unittest
from pathlib import Path
import pandas as pd

BASE_DIR = Path(__file__).resolve().parents[2]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

GOLD_CSV_FILE = BASE_DIR / "data_center" / "data_lake" / "gold" / "lich_su_xuat_hang_gold.csv"
DELTA_TABLE_PATH = BASE_DIR / "data_center" / "data_lake" / "gold" / "lakehouse" / "lich_su_xuat_hang_delta"
DELTA_LOG_DIR = DELTA_TABLE_PATH / "_delta_log"

from data_center.data_lake.lakehouse_manager import (
    init_or_sync_lakehouse,
    query_lakehouse,
    get_lakehouse_history,
    apply_controlled_test_change
)
from deltalake import DeltaTable


class TestLakehouseTimeTravel(unittest.TestCase):
    """
    Kiểm thử chức năng Data Lakehouse Delta Lake và Time Travel thực sự.
    """

    @classmethod
    def setUpClass(cls):
        # Đảm bảo bảng Delta Lakehouse được đồng bộ trạng thái chuẩn từ Gold CSV
        init_or_sync_lakehouse(mode="overwrite")

    def test_01_schema_and_initial_reconciliation(self):
        """1. Đọc lại và đối chiếu schema, số dòng và tổng số lượng xuất giữa CSV và Delta."""
        self.assertTrue(DELTA_TABLE_PATH.exists(), f"Bảng Delta chưa tồn tại tại: {DELTA_TABLE_PATH}")
        self.assertTrue(DELTA_LOG_DIR.exists(), f"Thiếu thư mục Delta Transaction Log: {DELTA_LOG_DIR}")

        df_csv = pd.read_csv(GOLD_CSV_FILE)
        df_delta = query_lakehouse()

        # Đối chiếu số dòng
        self.assertEqual(len(df_delta), len(df_csv), f"Số dòng Delta ({len(df_delta)}) phải khớp CSV ({len(df_csv)})")
        self.assertEqual(len(df_delta), 14264, "Số dòng tầng Gold phải là 14,264 nhóm xuất theo ngày")

        # Đối chiếu tổng sản lượng xuất
        sum_csv = int(df_csv["tong_so_luong_xuat"].sum())
        sum_delta = int(df_delta["tong_so_luong_xuat"].sum())
        self.assertEqual(sum_delta, sum_csv, "Tổng sản lượng xuất phải khớp chính xác tuyệt đối")
        self.assertEqual(sum_delta, 341163, "Tổng sản lượng xuất bảo toàn phải là 341,163")

        # Đối chiếu schema các cột
        expected_columns = ["ngay", "ma_kho", "ma_sp", "so_phieu_xuat", "tong_so_luong_xuat", "tong_gia_tri_xuat"]
        self.assertListEqual(list(df_delta.columns), expected_columns, "Schema cột của Delta phải khớp chuẩn Gold")

    def test_02_delta_transaction_log_structure(self):
        """2. Xác nhận thư mục _delta_log chứa các commit JSON hợp lệ theo giao thức Delta Lake."""
        log_files = list(DELTA_LOG_DIR.glob("*.json"))
        self.assertGreater(len(log_files), 0, "Phải có ít nhất 1 file commit log trong _delta_log/")
        
        # Đọc lịch sử commit từ engine Delta-RS
        history = get_lakehouse_history()
        self.assertGreater(len(history), 0, "Lịch sử Delta history không được rỗng")
        first_commit = history[-1]  # Commit đầu tiên
        self.assertIn("version", first_commit)
        self.assertIn("operation", first_commit)

    def test_03_controlled_change_and_true_time_travel(self):
        """
        3 & 4 & 5. Thực hiện thay đổi kiểm thử có kiểm soát, tạo snapshot mới,
        và truy vấn lại phiên bản cũ bằng cơ chế Time Travel thực sự của Delta Lake.
        """
        dt_current = DeltaTable(str(DELTA_TABLE_PATH))
        version_before = dt_current.version()

        # Đọc dữ liệu trước khi thay đổi (Baseline)
        df_before = query_lakehouse(version=version_before)
        baseline_rows = len(df_before)
        baseline_sum = int(df_before["tong_so_luong_xuat"].sum())

        # Thực hiện thay đổi kiểm thử có kiểm soát (Append 1 batch test 50 sp)
        old_v, new_v, test_rec = apply_controlled_test_change()
        self.assertEqual(old_v, version_before)
        self.assertGreater(new_v, old_v, "Version mới phải tăng sau khi ghi commit mới")

        # Đọc dữ liệu phiên bản mới
        df_new = query_lakehouse(version=new_v)
        self.assertEqual(len(df_new), baseline_rows + 1, "Phiên bản mới phải có thêm đúng 1 dòng")
        self.assertEqual(
            int(df_new["tong_so_luong_xuat"].sum()),
            baseline_sum + 50,
            "Phiên bản mới phải tăng đúng 50 sản phẩm kiểm thử"
        )

        # TRUY VẤN TIME TRAVEL VỀ PHIÊN BẢN CŨ BẰNG NATIVE DELTA TIME TRAVEL
        df_time_travel = query_lakehouse(version=version_before)

        # XÁC NHẬN TÍNH TOÀN VẸN CỦA PHIÊN BẢN CŨ (TIME TRAVEL VERIFICATION)
        self.assertEqual(
            len(df_time_travel),
            baseline_rows,
            f"Time travel về Version {version_before} phải giữ nguyên vẹn {baseline_rows} dòng!"
        )
        self.assertEqual(
            int(df_time_travel["tong_so_luong_xuat"].sum()),
            baseline_sum,
            f"Time travel về Version {version_before} phải giữ nguyên vẹn tổng sản lượng {baseline_sum}!"
        )

    def test_04_original_csv_integrity_preserved(self):
        """6. Xác nhận file CSV gốc lich_su_xuat_hang_gold.csv hoàn toàn không bị ảnh hưởng bởi bài test."""
        df_csv = pd.read_csv(GOLD_CSV_FILE)
        self.assertEqual(len(df_csv), 14264, "CSV gốc phải giữ nguyên 14,264 dòng")
        self.assertEqual(int(df_csv["tong_so_luong_xuat"].sum()), 341163, "CSV gốc phải giữ nguyên 341,163 sp")

    def test_05_idempotency_and_safe_rerun(self):
        """7. Kiểm tra khả năng chạy lặp an toàn (Idempotency): Đồng bộ lại từ Gold CSV đưa Lakehouse về snapshot sạch."""
        info = init_or_sync_lakehouse(mode="overwrite")
        self.assertEqual(info["num_rows"], 14264)
        self.assertEqual(info["total_quantity"], 341163)

        df_restored = query_lakehouse()
        self.assertEqual(len(df_restored), 14264)
        self.assertEqual(int(df_restored["tong_so_luong_xuat"].sum()), 341163)


if __name__ == "__main__":
    unittest.main()
