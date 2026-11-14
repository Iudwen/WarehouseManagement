"""
Kịch bản Tự Động Hóa Giả Lập Biến Động Xuất Bán Thực Tế & Retrain Machine Learning
Dự Án: Distributed Warehouse Management System (Warehouse DSS)
================================================================================
Mục đích:
1. Giả lập một đợt bùng nổ nhu cầu xuất hàng (Flash Sale / Sự kiện bán hàng lớn)
   tại Chi nhánh Đà Nẵng (DN01) cho mã SP001 (Laptop Dell) vào đầu tháng 8/2026.
2. Tự động kích hoạt quy trình MLOps Retraining (train_forecast.py) để các mô hình
   học lại dữ liệu và sinh ra bảng kết quả dự báo mới.
3. Người dùng reload (F5) trang http://localhost:3000/reports để thấy bảng dữ liệu
   và đường biểu đồ Thực tế (màu xanh) thay đổi 100%!
================================================================================
"""

import sys
import os
import shutil
import argparse
import subprocess
import time
from pathlib import Path
import pandas as pd

# Thiết lập encoding UTF-8 cho Windows Console
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT_DIR = Path(__file__).resolve().parents[1]
DATASET_FILE = ROOT_DIR / "data_mining" / "datasets" / "gold" / "analytical_dataset.csv"
BACKUP_FILE = ROOT_DIR / "data_mining" / "datasets" / "gold" / "analytical_dataset.csv.bak"
TRAIN_SCRIPT = ROOT_DIR / "data_mining" / "models" / "train_forecast.py"


def apply_surge():
    print("\n[1/3] CẬP NHẬT DỮ LIỆU XUẤT BÁN THỰC TẾ (FLASH SALE / ĐƠN HÀNG LỚN)...")
    if not BACKUP_FILE.exists():
        shutil.copy(DATASET_FILE, BACKUP_FILE)
        print("  -> Đã tạo bản sao lưu an toàn: analytical_dataset.csv.bak")

    df = pd.read_csv(DATASET_FILE)

    # Đợt xuất bán bùng nổ tại Đà Nẵng (DN01) cho Laptop Dell (SP001)
    updates = [
        {"ngay": "2026-08-01", "ma_kho": "DN01", "ma_sp": "SP001", "new_qty": 88, "old_qty": 41},
        {"ngay": "2026-08-02", "ma_kho": "DN01", "ma_sp": "SP001", "new_qty": 54, "old_qty": 0},
        {"ngay": "2026-08-03", "ma_kho": "DN01", "ma_sp": "SP001", "new_qty": 62, "old_qty": 0},
        {"ngay": "2026-08-04", "ma_kho": "DN01", "ma_sp": "SP001", "new_qty": 47, "old_qty": 0},
        {"ngay": "2026-08-05", "ma_kho": "DN01", "ma_sp": "SP001", "new_qty": 70, "old_qty": 14},
    ]

    for u in updates:
        mask = (df["ngay"] == u["ngay"]) & (df["ma_kho"] == u["ma_kho"]) & (df["ma_sp"] == u["ma_sp"])
        df.loc[mask, "nhu_cau_xuat"] = u["new_qty"]
        print(f"  * {u['ngay']} | {u['ma_kho']} | {u['ma_sp']}: Xuất thực tế tăng từ {u['old_qty']} -> {u['new_qty']} SP")

    df.to_csv(DATASET_FILE, index=False, encoding="utf-8-sig")
    print("  -> Đã lưu cập nhật vào analytical_dataset.csv thành công!")


def reset_original():
    print("\n[1/3] PHỤC HỒI DỮ LIỆU GỐC TỪ BẢN SAO LƯU...")
    if BACKUP_FILE.exists():
        shutil.copy(BACKUP_FILE, DATASET_FILE)
        print("  -> Đã khôi phục analytical_dataset.csv về nguyên bản ban đầu!")
    else:
        print("  -> Không tìm thấy file backup, giữ nguyên dữ liệu hiện tại.")


def run_ml_retraining():
    print("\n[2/3] KÍCH HOẠT QUY TRÌNH ML RETRAINING (RIDGE, RANDOM FOREST, LIGHTGBM)...")
    t0 = time.time()
    res = subprocess.run([sys.executable, str(TRAIN_SCRIPT)], cwd=str(ROOT_DIR), capture_output=True, text=True, encoding="utf-8", errors="replace")
    if res.returncode != 0:
        print(f"[LỖI RETRAINING]: {res.stderr[:200]}")
    else:
        print(f"  -> Huấn luyện và cập nhật kết quả dự báo thành công trong {time.time() - t0:.2f}s!")
        print("  -> Đã ghi đè forecast_results.csv tại cả data_mining và data_center/data_lake/gold.")


def inspect_forecast():
    print("\n[3/3] BẢNG ĐỐI CHIẾU DỮ LIỆU MỚI NHẤT TRÊN TEST SET (ĐÀ NẴNG - SP001):")
    print("=" * 80)
    csv_file = ROOT_DIR / "data_mining" / "datasets" / "gold" / "forecast_results.csv"
    df = pd.read_csv(csv_file)
    sub = df[(df["ma_kho"] == "DN01") & (df["ma_sp"] == "SP001")].head(6)

    print(f"{'NGÀY':<12} | {'KHO':<6} | {'SKU':<6} | {'THỰC TẾ':<10} | {'DỰ BÁO RIDGE':<14} | {'BASELINE':<10} | {'SAI SỐ (MAE)':<12}")
    print("-" * 80)
    for _, r in sub.iterrows():
        mae_r = abs(r["thuc_te"] - r["du_bao_ridge"])
        print(f"{r['ngay']:<12} | {r['ma_kho']:<6} | {r['ma_sp']:<6} | {r['thuc_te']:<10.0f} | {r['du_bao_ridge']:<14.1f} | {r['du_bao_baseline']:<10.1f} | {mae_r:<12.1f}")
    print("=" * 80)
    print("\n>>> BÂY GIỜ BẠN HÃY LÊN TRÌNH DUYỆT BẤM [F5] TẠI: http://localhost:3000/reports")
    print("    Xem Tab [3. Dự Báo & Machine Learning] -> [3.1 Chi Tiết Chuỗi Thời Gian & Bảng Dự Báo]:")
    print("    - Dòng 1: Thực tế nhảy từ 41 -> 88 SP!")
    print("    - Dòng 2 & 3: Thực tế nhảy từ 0 -> 54 và 62 SP!")
    print("    - Biểu đồ đường màu xanh dương (Thực tế) vọt lên đỉnh cao mới!\n")


def main():
    parser = argparse.ArgumentParser(description="Kịch bản giả lập biến động xuất bán & retrain ML")
    parser.add_argument(
        "--scenario",
        choices=["surge", "reset"],
        default="surge",
        help="surge: Giả lập bùng nổ nhu cầu xuất hàng (Mặc định) | reset: Khôi phục dữ liệu gốc",
    )
    args = parser.parse_args()

    start_time = time.time()
    print("=" * 80)
    print("HỆ THỐNG DỰ BÁO NHU CẦU - SIMULATE SALES UPDATE & RETRAIN ML")
    print("=" * 80)

    if args.scenario == "surge":
        apply_surge()
    else:
        reset_original()

    run_ml_retraining()
    inspect_forecast()

    print(f"[HOÀN THÀNH] Toàn bộ kịch bản chạy trong {time.time() - start_time:.2f} giây.")


if __name__ == "__main__":
    main()
