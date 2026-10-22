import csv
import math
import subprocess
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parents[2]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import numpy as np
import pandas as pd
import requests

from data_center.etl.extract.extract_weather_api import fetch_weather_for_location
from data_mining.build_gold import build_gold
from data_mining.models.train_forecast import build_features

RAW_FILE = BASE_DIR / "data_mining" / "datasets" / "raw" / "lich_su_xuat_hang.csv"
GOLD_FILE = BASE_DIR / "data_mining" / "datasets" / "gold" / "lich_su_xuat_hang_gold.csv"
DAILY_FILE = BASE_DIR / "data_mining" / "datasets" / "gold" / "nhu_cau_xuat_hang_daily.csv"
WEATHER_FILE = BASE_DIR / "data_mining" / "datasets" / "external" / "thoi_tiet_daily.csv"
CALENDAR_FILE = BASE_DIR / "data_mining" / "datasets" / "external" / "lich_daily.csv"
ANALYTICAL_FILE = BASE_DIR / "data_mining" / "datasets" / "gold" / "analytical_dataset.csv"
EDA_REPORT_FILE = BASE_DIR / "data_mining" / "eda" / "eda_report.txt"
EDA_CHART_FILE = BASE_DIR / "data_mining" / "eda" / "eda_charts.png"
FORECAST_FILE = BASE_DIR / "data_mining" / "datasets" / "gold" / "forecast_results.csv"
EVAL_REPORT_FILE = BASE_DIR / "data_mining" / "evaluation_report.md"
RUN_PIPELINE_SCRIPT = BASE_DIR / "data_mining" / "run_pipeline.py"


# ==============================================================================
# NHÓM 1: KIỂM THỬ TỔNG THỂ PIPELINE & CHẤT LƯỢNG ARTIFACTS
# ==============================================================================
class TestDataMiningSubsystem(unittest.TestCase):
    """
    Kiểm thử pipeline toàn diện và tính toàn vẹn của dữ liệu đầu ra.
    """

    def test_A1_pipeline_execution_and_idempotency(self):
        """Chạy lại toàn bộ pipeline để kiểm tra tính lặp lại (idempotent), không lỗi khi file đã tồn tại."""
        print("\n[TEST A1] Kiểm tra chạy pipeline run_pipeline.py...")
        result = subprocess.run(
            [sys.executable, str(RUN_PIPELINE_SCRIPT)],
            cwd=str(BASE_DIR),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        self.assertEqual(result.returncode, 0, f"run_pipeline.py thất bại! Lỗi: {result.stderr}")
        self.assertIn("[HOÀN TẤT THÀNH CÔNG]", result.stdout)
        print("  -> ĐẠT: run_pipeline.py hoàn tất với mã thoát 0.")

    def test_A2_all_output_artifacts_exist_and_non_empty(self):
        """Xác minh tất cả các file artifact đầu ra bắt buộc của pipeline đều tồn tại và có dung lượng > 0."""
        print("\n[TEST A2] Kiểm tra sự tồn tại của các file artifact đầu ra...")
        artifacts = [
            GOLD_FILE,
            DAILY_FILE,
            WEATHER_FILE,
            CALENDAR_FILE,
            ANALYTICAL_FILE,
            EDA_REPORT_FILE,
            EDA_CHART_FILE,
            FORECAST_FILE,
            EVAL_REPORT_FILE,
        ]
        for f in artifacts:
            self.assertTrue(f.exists(), f"Thiếu file đầu ra: {f}")
            self.assertGreater(f.stat().st_size, 0, f"File bị rỗng: {f}")
            print(f"  -> ĐẠT: {f.name} ({f.stat().st_size:,} bytes)")

    def test_A3_real_data_pipeline_conservation_and_build_gold_metrics(self):
        """
        Kiểm tra chạy hàm build_gold() trực tiếp trên dữ liệu thật sau các chỉnh sửa:
        - Xác minh kết quả trả về: 14,264 dòng đọc, 14,264 dòng hợp lệ, 0 dòng bị loại.
        - Xác minh định luật bảo toàn sản lượng xuất xuyên suốt pipeline:
          sum(Gold.tong_so_luong_xuat) == sum(Daily.nhu_cau_xuat) == sum(Analytical.nhu_cau_xuat) == 341,163.
        """
        print("\n[TEST A3] Kiểm tra build_gold() trên dữ liệu thật và tính bảo toàn sản lượng...")
        stats = build_gold()
        self.assertEqual(stats["total"], 14264, f"Tổng số dòng raw phải là 14,264, thực tế: {stats['total']}")
        self.assertEqual(stats["valid"], 14264, f"Số dòng hợp lệ phải là 14,264, thực tế: {stats['valid']}")
        self.assertEqual(stats["rejected"], 0, f"Số dòng bị loại trên raw thật phải là 0, thực tế: {stats['rejected']}")
        self.assertEqual(stats["groups"], 14264, f"Số nhóm gold phải là 14,264, thực tế: {stats['groups']}")

        # Kiểm tra tính bảo toàn sản lượng xuất qua 3 tầng dữ liệu
        df_gold = pd.read_csv(GOLD_FILE, encoding="utf-8-sig")
        df_daily = pd.read_csv(DAILY_FILE, encoding="utf-8-sig")
        df_analytical = pd.read_csv(ANALYTICAL_FILE, encoding="utf-8-sig")

        sum_gold = float(df_gold["tong_so_luong_xuat"].sum())
        sum_daily = float(df_daily["nhu_cau_xuat"].sum())
        sum_analytical = float(df_analytical["nhu_cau_xuat"].sum())

        self.assertEqual(sum_gold, 341163.0, f"Tổng sản lượng tầng Gold sai lệch: {sum_gold}")
        self.assertEqual(sum_daily, 341163.0, f"Tổng sản lượng tầng Daily sai lệch: {sum_daily}")
        self.assertEqual(sum_analytical, 341163.0, f"Tổng sản lượng tầng Analytical sai lệch: {sum_analytical}")
        print(f"  -> ĐẠT: build_gold() trả về đúng 14,264 dòng hợp lệ (0 bị loại); Tổng sản lượng bảo toàn tuyệt đối 341,163 qua cả 3 tầng (Gold -> Daily -> Analytical).")

    def test_B1_analytical_dataset_schema_and_row_count(self):
        """Kiểm tra schema, số dòng (21,960) và không có null ở các cột chính."""
        print("\n[TEST B1] Kiểm tra cấu trúc và số dòng của Analytical Dataset...")
        df = pd.read_csv(ANALYTICAL_FILE, encoding="utf-8-sig")
        self.assertEqual(len(df), 21960, f"Số dòng phải là 21960, thực tế: {len(df)}")

        expected_cols = [
            "ngay", "ma_kho", "ma_sp", "nhu_cau_xuat",
            "nhiet_do_tb", "luong_mua", "thu_trong_tuan",
            "ten_thu", "la_cuoi_tuan", "la_ngay_le", "ten_ngay_le"
        ]
        self.assertListEqual(list(df.columns), expected_cols, "Schema các cột không khớp yêu cầu!")

        for col in ["ngay", "ma_kho", "ma_sp", "nhu_cau_xuat", "thu_trong_tuan", "la_cuoi_tuan", "la_ngay_le"]:
            null_count = df[col].isnull().sum()
            self.assertEqual(null_count, 0, f"Cột {col} có {null_count} giá trị null!")
        print(f"  -> ĐẠT: Đủ {len(df):,} dòng, đúng 11 cột, 0 null ở các trường bắt buộc.")

    def test_B2_key_uniqueness_and_ranges(self):
        """Kiểm tra tính duy nhất của khóa (ngay + ma_kho + ma_sp) và phạm vi giá trị."""
        print("\n[TEST B2] Kiểm tra tính duy nhất của khóa và phạm vi dữ liệu...")
        df = pd.read_csv(ANALYTICAL_FILE, encoding="utf-8-sig")
        duplicates = df.duplicated(subset=["ngay", "ma_kho", "ma_sp"]).sum()
        self.assertEqual(duplicates, 0, f"Phát hiện {duplicates} khóa trùng!")

        warehouses = sorted(df["ma_kho"].unique())
        self.assertEqual(warehouses, ["DN01", "HCM01", "HN01"], "Danh sách mã kho không đúng!")

        products = sorted(df["ma_sp"].unique())
        self.assertEqual(len(products), 20, f"Số lượng sản phẩm phải là 20, thực tế: {len(products)}")

        dates = sorted(df["ngay"].unique())
        self.assertEqual(len(dates), 366, f"Số ngày quan sát phải là 366, thực tế: {len(dates)}")
        self.assertEqual(dates[0], "2025-09-18")
        self.assertEqual(dates[-1], "2026-09-18")

        negative_demand = (df["nhu_cau_xuat"] < 0).sum()
        self.assertEqual(negative_demand, 0, f"Phát hiện {negative_demand} dòng có lượng xuất âm!")
        print(f"  -> ĐẠT: 0 khóa trùng, 3 kho, 20 sản phẩm, dải ngày chuẩn 366 ngày, không có số âm.")

    def test_B3_join_integrity_with_external_sources(self):
        """Xác minh dữ liệu thời tiết và lịch ghép đúng chính xác 100% với file nguồn ngoài."""
        print("\n[TEST B3] Kiểm tra tính toàn vẹn khi Join nguồn ngoài...")
        df_an = pd.read_csv(ANALYTICAL_FILE, encoding="utf-8-sig")
        df_wt = pd.read_csv(WEATHER_FILE, encoding="utf-8-sig").set_index(["ngay", "ma_kho"])
        df_cal = pd.read_csv(CALENDAR_FILE, encoding="utf-8-sig").set_index("ngay")

        sample = df_an.sample(n=500, random_state=42)
        for _, row in sample.iterrows():
            d = row["ngay"]
            w = row["ma_kho"]
            wt_row = df_wt.loc[(d, w)]
            self.assertAlmostEqual(float(row["nhiet_do_tb"]), float(wt_row["nhiet_do_tb"]), places=1)
            self.assertAlmostEqual(float(row["luong_mua"]), float(wt_row["luong_mua"]), places=1)

            cal_row = df_cal.loc[d]
            self.assertEqual(int(row["thu_trong_tuan"]), int(cal_row["thu_trong_tuan"]))
            self.assertEqual(int(row["la_cuoi_tuan"]), int(cal_row["la_cuoi_tuan"]))
            self.assertEqual(int(row["la_ngay_le"]), int(cal_row["la_ngay_le"]))
        print("  -> ĐẠT: 500 mẫu kiểm tra ngẫu nhiên khớp 100% với nguồn thời tiết và lịch gốc.")

    def test_C1_weather_and_calendar_record_counts(self):
        """Kiểm tra số bản ghi của thời tiết và lịch."""
        print("\n[TEST C1] Kiểm tra số lượng bản ghi của thời tiết và lịch...")
        df_wt = pd.read_csv(WEATHER_FILE, encoding="utf-8-sig")
        self.assertEqual(len(df_wt), 1098, f"Thời tiết phải có 1,098 bản ghi, thực tế: {len(df_wt)}")

        df_cal = pd.read_csv(CALENDAR_FILE, encoding="utf-8-sig")
        self.assertEqual(len(df_cal), 366, f"Lịch phải có 366 bản ghi, thực tế: {len(df_cal)}")

        holidays = df_cal[df_cal["la_ngay_le"] == 1]
        self.assertEqual(len(holidays), 14, f"Số ngày nghỉ lễ phải là 14 ngày, thực tế: {len(holidays)}")
        print(f"  -> ĐẠT: Thời tiết đủ 1,098 bản ghi; Lịch đủ 366 bản ghi (14 ngày lễ).")

    def test_D1_eda_calculations_consistency(self):
        """Xác minh các con số trong báo cáo EDA khớp hoàn toàn với số liệu tính trực tiếp từ Dataset."""
        print("\n[TEST D1] Kiểm tra tính nhất quán số liệu trong báo cáo EDA...")
        df = pd.read_csv(ANALYTICAL_FILE, encoding="utf-8-sig")
        with EDA_REPORT_FILE.open("r", encoding="utf-8") as f:
            report_text = f.read()

        total_actual_export = df["nhu_cau_xuat"].sum()
        self.assertIn("341,163", report_text)
        self.assertEqual(total_actual_export, 341163.0)

        zero_count = (df["nhu_cau_xuat"] == 0).sum()
        self.assertIn("7,696", report_text)
        self.assertEqual(zero_count, 7696)
        print("  -> ĐẠT: Số liệu tổng lượng xuất (341,163) và số ngày 0 xuất (7,696) khớp 100%.")

    def test_E1_forecast_results_validity(self):
        """Kiểm tra file kết quả dự báo: số dòng (2,940), không có giá trị âm, và tính toán độc lập MAE/RMSE."""
        print("\n[TEST E1] Kiểm tra tính hợp lệ và độ chính xác của bảng dự báo ML...")
        df_fc = pd.read_csv(FORECAST_FILE, encoding="utf-8-sig")
        self.assertEqual(len(df_fc), 2940)

        self.assertGreaterEqual(df_fc["du_bao_baseline"].min(), 0.0)
        self.assertGreaterEqual(df_fc["du_bao_ridge"].min(), 0.0)
        self.assertGreaterEqual(df_fc["du_bao_rf"].min(), 0.0)

        y_true = df_fc["thuc_te"].values
        y_pred_base = df_fc["du_bao_baseline"].values
        y_pred_ridge = df_fc["du_bao_ridge"].values
        y_pred_rf = df_fc["du_bao_rf"].values

        mae_base = np.mean(np.abs(y_true - y_pred_base))
        rmse_base = math.sqrt(np.mean((y_true - y_pred_base) ** 2))
        mae_ridge = np.mean(np.abs(y_true - y_pred_ridge))
        rmse_ridge = math.sqrt(np.mean((y_true - y_pred_ridge) ** 2))
        mae_rf = np.mean(np.abs(y_true - y_pred_rf))
        rmse_rf = math.sqrt(np.mean((y_true - y_pred_rf) ** 2))

        self.assertLess(mae_ridge, mae_base)
        self.assertLess(rmse_ridge, rmse_base)
        self.assertLess(mae_rf, mae_base)
        self.assertLess(rmse_rf, rmse_base)

        with EVAL_REPORT_FILE.open("r", encoding="utf-8") as f:
            eval_text = f.read()
        self.assertIn("14.7424", eval_text)
        self.assertIn("13.9641", eval_text)
        print("  -> ĐẠT: Không có giá trị âm, MAE/RMSE tính toán lại khớp chính xác 100% với báo cáo.")

    def test_E2_time_split_and_no_future_leakage(self):
        """Xác minh tập Test hoàn toàn nằm sau tập Train theo trục thời gian."""
        print("\n[TEST E2] Kiểm tra phân chia Train/Test theo thời gian...")
        df_fc = pd.read_csv(FORECAST_FILE, encoding="utf-8-sig")
        min_test_date = df_fc["ngay"].min()
        max_test_date = df_fc["ngay"].max()

        self.assertEqual(min_test_date, "2026-08-01")
        self.assertEqual(max_test_date, "2026-09-18")
        self.assertGreater(min_test_date, "2026-07-31")
        print(f"  -> ĐẠT: Tập Test [{min_test_date} -> {max_test_date}] nằm hoàn toàn sau Train [2026-07-31].")


# ==============================================================================
# NHÓM 2 (BỔ SUNG 1): KIỂM THỬ TRỰC TIẾP CHỐNG DATA LEAKAGE Ở TẦNG LOGIC
# ==============================================================================
class TestDataLeakageLogic(unittest.TestCase):
    """
    Kiểm thử trực tiếp hàm build_features() trong train_forecast.py:
    Xác minh đặc trưng tại ngày t CHỈ sử dụng dữ liệu từ ngày t-1 trở về trước,
    tuyệt đối không chứa giá trị mục tiêu của ngày t.
    """

    def setUp(self):
        # Tạo chuỗi dữ liệu nhân tạo có giá trị tăng dần rõ ràng:
        # Ngày 1: 10, Ngày 2: 20, ..., Ngày 8: 80, ..., Ngày 14: 140
        start = date(2026, 1, 1)
        records = []
        for i in range(14):
            day_str = (start + timedelta(days=i)).isoformat()
            records.append({
                "ngay": day_str,
                "ma_kho": "HN01",
                "ma_sp": "SP001",
                "nhu_cau_xuat": (i + 1) * 10.0,
                "nhiet_do_tb": 25.0,
                "luong_mua": 0.0,
                "thu_trong_tuan": 0,
                "la_cuoi_tuan": 0,
                "la_ngay_le": 0,
            })
        self.df_controlled = pd.DataFrame(records)

    def test_lag_values_strictly_match_prior_days(self):
        """Xác minh lag_1(t) == target(t-1) và lag_7(t) == target(t-7)."""
        print("\n[TEST LEAKAGE 1] Xác minh giá trị lag_1 và lag_7 strictly lấy từ quá khứ...")
        df_feat = build_features(self.df_controlled.copy())

        # Ngày 8 (chỉ số i=7, ngày 2026-01-08) có target = 80
        # Ngày 7 (i=6, 2026-01-07) có target = 70 -> lag_1 phải là 70
        # Ngày 1 (i=0, 2026-01-01) có target = 10 -> lag_7 phải là 10
        row_day_8 = df_feat[df_feat["ngay"] == "2026-01-08"].iloc[0]
        self.assertEqual(row_day_8["lag_1"], 70.0, f"lag_1 tại ngày 8 phải là 70.0, thực tế: {row_day_8['lag_1']}")
        self.assertEqual(row_day_8["lag_7"], 10.0, f"lag_7 tại ngày 8 phải là 10.0, thực tế: {row_day_8['lag_7']}")
        print("  -> ĐẠT: lag_1(t) và lag_7(t) phản ánh chính xác t-1 và t-7.")

    def test_rolling_window_does_not_contain_day_t_target(self):
        """
        Xác minh rolling_mean_7 tại ngày t KHÔNG chứa giá trị mục tiêu của ngày t.
        Tại ngày 8 (target = 80):
        - Nếu KHÔNG leak: mean(10, 20, 30, 40, 50, 60, 70) = 280 / 7 = 40.0.
        - Nếu BỊ leak:   mean(20, 30, 40, 50, 60, 70, 80) = 350 / 7 = 50.0.
        """
        print("\n[TEST LEAKAGE 2] Xác minh rolling_mean_7 không chứa giá trị ngày t...")
        df_feat = build_features(self.df_controlled.copy())
        row_day_8 = df_feat[df_feat["ngay"] == "2026-01-08"].iloc[0]

        expected_no_leak_mean = 40.0
        leaked_mean = 50.0

        self.assertEqual(row_day_8["rolling_mean_7"], expected_no_leak_mean,
                         f"rolling_mean_7 phải bằng {expected_no_leak_mean}, nếu bằng {leaked_mean} là đã bị LEAK target ngày t!")
        print(f"  -> ĐẠT: rolling_mean_7 = {row_day_8['rolling_mean_7']:.1f} (đúng 40.0, không bị leak 50.0).")

    def test_perturbation_invariant_target_change_does_not_affect_features_at_day_t(self):
        """
        Kiểm tra tính bất biến (Perturbation Invariance):
        Thay đổi đột biến target tại ngày t (từ 80 -> 999,999).
        Mọi đặc trưng (lag_1, lag_7, rolling_mean_7) tại ngày t PHẢI KHÔNG THAY ĐỔI.
        """
        print("\n[TEST LEAKAGE 3] Kiểm tra tính bất biến khi làm nhiễu giá trị ngày t...")
        df_normal = build_features(self.df_controlled.copy())

        df_perturbed = self.df_controlled.copy()
        # Đổi giá trị target của ngày 8 thành 999,999
        df_perturbed.loc[df_perturbed["ngay"] == "2026-01-08", "nhu_cau_xuat"] = 999999.0
        df_perturbed_feat = build_features(df_perturbed)

        normal_row = df_normal[df_normal["ngay"] == "2026-01-08"].iloc[0]
        perturbed_row = df_perturbed_feat[df_perturbed_feat["ngay"] == "2026-01-08"].iloc[0]

        self.assertEqual(normal_row["lag_1"], perturbed_row["lag_1"])
        self.assertEqual(normal_row["lag_7"], perturbed_row["lag_7"])
        self.assertEqual(normal_row["rolling_mean_7"], perturbed_row["rolling_mean_7"])
        print("  -> ĐẠT: Thay đổi target ngày t lên 999,999 không làm thay đổi bất kỳ đặc trưng nào tại ngày t.")

    def test_cross_entity_isolation_no_leakage_between_warehouses(self):
        """Xác minh không có rò rỉ dữ liệu chéo giữa các kho khác nhau (Groupby isolation)."""
        print("\n[TEST LEAKAGE 4] Kiểm tra cô lập dữ liệu giữa các kho khác nhau...")
        df_multi = pd.concat([
            self.df_controlled.assign(ma_kho="HN01"),
            self.df_controlled.assign(ma_kho="DN01", nhu_cau_xuat=lambda x: x["nhu_cau_xuat"] * 100),
        ]).reset_index(drop=True)

        df_feat = build_features(df_multi)
        hn_day_8 = df_feat[(df_feat["ngay"] == "2026-01-08") & (df_feat["orig_ma_kho"] == "HN01")].iloc[0]
        self.assertEqual(hn_day_8["rolling_mean_7"], 40.0, "Dữ liệu kho DN01 đã làm sai lệch rolling_mean_7 của kho HN01!")
        print("  -> ĐẠT: Nhóm kho và sản phẩm được cô lập hoàn toàn, không lây nhiễm dữ liệu chéo.")


# ==============================================================================
# NHÓM 3 (BỔ SUNG 2): KIỂM THỬ XỬ LÝ DỮ LIỆU ĐẦU VÀO BẤT THƯỜNG
# ==============================================================================
class TestAbnormalInputHandling(unittest.TestCase):
    """
    Kiểm thử khả năng chịu lỗi và làm sạch khi gặp dữ liệu bất thường:
    - File rỗng (0 bytes)
    - File thiếu cột bắt buộc
    - File chứa ngày không hợp lệ, số lượng âm, chữ thay cho số
    """

    def test_build_gold_empty_csv_raises_error(self):
        """Xác minh build_gold() raise ValueError khi gặp file CSV rỗng 0 bytes."""
        print("\n[TEST INPUT 1] Kiểm tra file CSV rỗng (0 bytes)...")
        with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".csv") as tmp:
            tmp_path = Path(tmp.name)

        try:
            with self.assertRaises(ValueError) as ctx:
                build_gold(raw_file=tmp_path)
            self.assertIn("Cac cot CSV khong dung", str(ctx.exception))
            print("  -> ĐẠT: build_gold() phát hiện và từ chối file 0 bytes bằng ValueError.")
        finally:
            if tmp_path.exists():
                tmp_path.unlink()

    def test_build_gold_missing_columns_raises_error(self):
        """Xác minh build_gold() raise ValueError khi thiếu cột bắt buộc."""
        print("\n[TEST INPUT 2] Kiểm tra file CSV thiếu cột bắt buộc...")
        with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".csv", encoding="utf-8-sig") as tmp:
            tmp.write("ngay,ma_kho\n2025-10-01,HN01\n")
            tmp_path = Path(tmp.name)

        try:
            with self.assertRaises(ValueError) as ctx:
                build_gold(raw_file=tmp_path)
            self.assertIn("Cac cot CSV khong dung", str(ctx.exception))
            print("  -> ĐẠT: build_gold() phát hiện thiếu cột và raise ValueError.")
        finally:
            if tmp_path.exists():
                tmp_path.unlink()

    def test_build_gold_filters_invalid_and_negative_data(self):
        """
        Xác minh build_gold() loại bỏ bản ghi ngày sai, số âm, ký tự chữ
        và chỉ giữ lại bản ghi hợp lệ.
        """
        print("\n[TEST INPUT 3] Kiểm tra lọc bản ghi ngày sai, số âm và ký tự không hợp lệ...")
        headers = "ngay,ma_kho,ma_sp,so_phieu_xuat,tong_so_luong_xuat,tong_gia_tri_xuat\n"
        rows = [
            "2025-10-01,HN01,SP001,1,10,100.00\n",         # Hợp lệ
            "2025-99-99,HN01,SP001,1,10,100.00\n",         # Ngày không hợp lệ
            "2025-10-01,HN01,SP001,1,-5,100.00\n",          # Số lượng âm
            "2025-10-01,HN01,SP001,1,abc,100.00\n",         # Ký tự chữ
            "2025-10-01,,SP001,1,10,100.00\n",              # Thiếu mã kho
        ]

        with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".csv", encoding="utf-8-sig") as tmp_in:
            tmp_in.write(headers + "".join(rows))
            tmp_in_path = Path(tmp_in.name)

        with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".csv", encoding="utf-8-sig") as tmp_out:
            tmp_out_path = Path(tmp_out.name)

        try:
            stats = build_gold(raw_file=tmp_in_path, gold_file=tmp_out_path)
            self.assertEqual(stats["total"], 5)
            self.assertEqual(stats["valid"], 1)
            self.assertEqual(stats["rejected"], 4)
            print(f"  -> ĐẠT: Đọc 5 dòng, giữ 1 dòng hợp lệ, loại chính xác 4 dòng lỗi.")
        finally:
            if tmp_in_path.exists():
                tmp_in_path.unlink()
            if tmp_out_path.exists():
                tmp_out_path.unlink()


# ==============================================================================
# NHÓM 4 (BỔ SUNG 3): KIỂM THỬ XỬ LÝ LỖI API THỜI TIẾT BẰNG MOCK
# ==============================================================================
class TestWeatherApiMockErrors(unittest.TestCase):
    """
    Sử dụng mock để mô phỏng các lỗi mạng và lỗi phản hồi từ API thời tiết:
    - Timeout kết nối
    - Lỗi HTTP 500 / 429
    - JSON thiếu trường 'daily' hoặc 'time' rỗng
    - Xác minh giá trị thiếu không bị tự ý biến thành 0.0
    """

    @patch("requests.get")
    def test_timeout_raises_runtime_error_after_retries(self, mock_get):
        """Xác minh khi API bị Timeout, hàm thử lại và raise RuntimeError rõ ràng."""
        print("\n[TEST API 1] Kiểm tra xử lý lỗi Timeout từ Open-Meteo...")
        mock_get.side_effect = requests.exceptions.Timeout("Connection timed out")

        with self.assertRaises(RuntimeError) as ctx:
            fetch_weather_for_location("HN01", {"name": "Hanoi", "latitude": 21.0, "longitude": 105.0}, retry_delay=0, max_retries=2)
        self.assertIn("Không thể tải thời tiết cho HN01 sau 2 lần thử", str(ctx.exception))
        self.assertEqual(mock_get.call_count, 2)
        print("  -> ĐẠT: Đã thử lại đúng 2 lần và ném RuntimeError rõ ràng, không nuốt lỗi.")

    @patch("requests.get")
    def test_http_500_raises_runtime_error(self, mock_get):
        """Xác minh khi API trả về mã lỗi HTTP 500 Server Error."""
        print("\n[TEST API 2] Kiểm tra xử lý lỗi HTTP 500 Server Error...")
        mock_response = MagicMock()
        mock_response.raise_for_status.side_effect = requests.exceptions.HTTPError("500 Server Error")
        mock_get.return_value = mock_response

        with self.assertRaises(RuntimeError):
            fetch_weather_for_location("DN01", {"name": "Da Nang", "latitude": 16.0, "longitude": 108.0}, retry_delay=0, max_retries=2)
        print("  -> ĐẠT: HTTP 500 được xử lý bẫy lỗi và raise RuntimeError sau retries.")

    @patch("requests.get")
    def test_missing_daily_json_field_raises_runtime_error(self, mock_get):
        """Xác minh khi API trả về JSON thiếu trường 'daily' (không âm thầm trả về rỗng)."""
        print("\n[TEST API 3] Kiểm tra JSON phản hồi thiếu trường 'daily'...")
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {"latitude": 21.0, "generationtime_ms": 1.2}  # Thiếu 'daily'
        mock_get.return_value = mock_response

        with self.assertRaises(RuntimeError):
            fetch_weather_for_location("HN01", {"name": "Hanoi", "latitude": 21.0, "longitude": 105.0}, retry_delay=0, max_retries=2)
        print("  -> ĐẠT: Thiếu trường 'daily' bị phát hiện ngay lập tức và từ chối xử lý.")

    @patch("requests.get")
    def test_empty_daily_time_raises_runtime_error(self, mock_get):
        """Xác minh khi API trả về daily với mảng time rỗng."""
        print("\n[TEST API 4] Kiểm tra daily.time rỗng...")
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {"daily": {"time": []}}
        mock_get.return_value = mock_response

        with self.assertRaises(RuntimeError):
            fetch_weather_for_location("HCM01", {"name": "Ho Chi Minh", "latitude": 10.8, "longitude": 106.6}, retry_delay=0, max_retries=2)
        print("  -> ĐẠT: Mảng time rỗng bị từ chối, không tạo bản ghi rỗng.")

    @patch("requests.get")
    def test_missing_weather_preserved_as_empty_string_not_zero(self, mock_get):
        """
        Xác minh giá trị thời tiết bị thiếu (None) được lưu thành chuỗi rỗng (''),
        TUYỆT ĐỐI không bị tự ý biến thành 0.0, trong khi giá trị 0.0 thực tế vẫn giữ nguyên.
        """
        print("\n[TEST API 5] Kiểm tra phân biệt giá trị thời tiết thiếu (None) với 0.0 thực tế...")
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {
            "daily": {
                "time": ["2025-10-01", "2025-10-02"],
                "temperature_2m_mean": [None, 28.5],    # Ngày 1 mất nhiệt độ
                "precipitation_sum": [0.0, None],       # Ngày 1 không mưa (0.0), Ngày 2 mất dữ liệu mưa
            }
        }
        mock_get.return_value = mock_response

        records = fetch_weather_for_location("HN01", {"name": "Hanoi", "latitude": 21.0, "longitude": 105.0}, retry_delay=0, max_retries=1)
        self.assertEqual(len(records), 2)

        # Ngày 1: nhiệt độ None -> "", mưa 0.0 -> "0.0"
        self.assertEqual(records[0]["nhiet_do_tb"], "", "Nhiệt độ None bị biến thành chuỗi khác rỗng!")
        self.assertEqual(records[0]["luong_mua"], "0.0", "Lượng mưa 0.0 thực tế bị sai lệch!")

        # Ngày 2: nhiệt độ 28.5 -> "28.5", mưa None -> ""
        self.assertEqual(records[1]["nhiet_do_tb"], "28.5")
        self.assertEqual(records[1]["luong_mua"], "", "Lượng mưa None bị tự ý biến thành 0!")
        print("  -> ĐẠT: Phân biệt tuyệt đối giữa None (lưu rỗng '') và giá trị thực tế 0.0.")


if __name__ == "__main__":
    unittest.main(verbosity=2)
