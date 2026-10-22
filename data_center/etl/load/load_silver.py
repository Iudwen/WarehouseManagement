import os
import subprocess
import sys
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

def get_data_lake_dir():
    if "DATA_LAKE_DIR" in os.environ:
        return Path(os.environ["DATA_LAKE_DIR"])
    if Path("/app/data_lake").is_dir():
        return Path("/app/data_lake")
    return Path(__file__).resolve().parents[2] / "data_lake"

BASE_DIR = get_data_lake_dir()
ETL_DIR = Path(__file__).resolve().parents[1]

def load_silver():
    """
    Chuyển đổi và làm sạch dữ liệu từ Bronze sang Silver:
    - Chạy transform_postgresql.py: Làm sạch 11 bảng, khử trùng, kiểm tra schema, sinh quality reports.
    - Chạy transform_events.py: Làm sạch các sự kiện MongoDB.
    """
    print("=" * 80)
    print("NẠP DỮ LIỆU TẦNG SILVER & DATA QUALITY (DATA LAKE)")
    print("=" * 80)

    # 1. Transform PostgreSQL
    print("[1/2] Thực thi làm sạch & kiểm định chất lượng PostgreSQL...")
    script_pg = ETL_DIR / "tranform" / "transform_postgresql.py"
    res_pg = subprocess.run([sys.executable, str(script_pg)], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if res_pg.returncode != 0:
        print(f"[LỖI] transform_postgresql.py thất bại:\n{res_pg.stderr}")
        raise RuntimeError("Không thể hoàn thành transform_postgresql")
    for line in res_pg.stdout.strip().split("\n"):
        print(f"  {line}")

    # 2. Transform MongoDB Events
    print("[2/2] Thực thi làm sạch sự kiện MongoDB...")
    script_mg = ETL_DIR / "tranform" / "transform_events.py"
    res_mg = subprocess.run([sys.executable, str(script_mg)], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if res_mg.returncode != 0:
        print(f"[CẢNH BÁO] transform_events.py:\n{res_mg.stderr.strip()[:200]}")
    else:
        for line in res_mg.stdout.strip().split("\n"):
            print(f"  {line}")

    silver_pg = BASE_DIR / "silver" / "postgresql" / "central"
    qr_dir = BASE_DIR / "silver" / "quality_reports"
    print(f"[*] Hoàn tất nạp tầng Silver:")
    print(f"  - Thư mục Silver: {silver_pg}")
    print(f"  - Báo cáo chất lượng dữ liệu: {qr_dir}")
    print("=" * 80)
    return True

if __name__ == "__main__":
    load_silver()
