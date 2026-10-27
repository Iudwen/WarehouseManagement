import os
import sys
import time
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

ETL_DIR = Path(__file__).resolve().parent
LOAD_DIR = ETL_DIR / "load"

# Import các loader chính
sys.path.insert(0, str(LOAD_DIR))
from load_bronze import load_bronze
from load_silver import load_silver
from load_gold import load_gold
import load_lakehouse


def run_full_etl(run_live_extract=False):
    """
    Điều phối toàn bộ luồng ETL Data Lakehouse: Bronze -> Silver -> Gold CSV -> Gold Delta Lakehouse:
    1. Bronze: Xác minh / Trích xuất dữ liệu thô (PostgreSQL Central & MongoDB).
    2. Silver: Làm sạch, khử trùng lặp, kiểm định schema 10 bảng và tạo Data Quality Reports.
    3. Gold CSV: Tổng hợp dữ liệu phân tích xuất kho theo (ngày, kho, sản phẩm), bảo toàn sản lượng.
    4. Gold Delta Lakehouse: Đồng bộ bảng Delta Lake hỗ trợ ACID transactions và Time Travel.
    """
    start_time = time.time()
    print("================================================================================")
    print("KHỞI CHẠY TOÀN BỘ LUỒNG ETL DATA LAKEHOUSE: BRONZE -> SILVER -> GOLD (DELTA LAKE)")
    print("================================================================================\n")

    # Bước 1: Bronze
    print(">>> [BƯỚC 1/4] NẠP DỮ LIỆU TẦNG BRONZE...")
    t0 = time.time()
    load_bronze(run_live_extract=run_live_extract)
    print(f"  -> Hoàn tất nạp Bronze trong {time.time() - t0:.2f}s.\n")

    # Bước 2: Silver
    print(">>> [BƯỚC 2/4] NẠP DỮ LIỆU TẦNG SILVER & DATA QUALITY...")
    t1 = time.time()
    load_silver()
    print(f"  -> Hoàn tất nạp Silver trong {time.time() - t1:.2f}s.\n")

    # Bước 3: Gold CSV
    print(">>> [BƯỚC 3/4] NẠP DỮ LIỆU TẦNG GOLD CSV & ĐỒNG BỘ DATA MINING...")
    t2 = time.time()
    load_gold()
    print(f"  -> Hoàn tất nạp Gold CSV trong {time.time() - t2:.2f}s.\n")

    # Bước 4: Gold Delta Lakehouse
    print(">>> [BƯỚC 4/4] ĐỒNG BỘ DATA LAKEHOUSE (DELTA LAKE & ACID LOG)...")
    t3 = time.time()
    load_lakehouse.main()
    print(f"  -> Hoàn tất nạp Delta Lakehouse trong {time.time() - t3:.2f}s.\n")

    total_time = time.time() - start_time
    print("================================================================================")
    print(f"[HOÀN TẤT THÀNH CÔNG] Toàn bộ luồng ETL Data Lakehouse hoàn thành trong {total_time:.2f} giây.")
    print("================================================================================")


if __name__ == "__main__":
    live_flag = "--live" in sys.argv
    run_full_etl(run_live_extract=live_flag)
