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
BRONZE_DIR = BASE_DIR / "bronze"
ETL_DIR = Path(__file__).resolve().parents[1]

def load_bronze(run_live_extract=False):
    """
    Nạp dữ liệu vào tầng Bronze của Data Lake:
    - Nếu run_live_extract=True và DB/API khả dụng, gọi extract_postgresql và extract_mongodb.
    - Luôn đảm bảo các file Bronze cần thiết tồn tại, không rỗng và hợp lệ.
    """
    print("=" * 80)
    print("NẠP DỮ LIỆU TẦNG BRONZE (DATA LAKE)")
    print("=" * 80)

    BRONZE_DIR.mkdir(parents=True, exist_ok=True)
    pg_bronze = BRONZE_DIR / "postgresql" / "central"
    mongo_bronze = BRONZE_DIR / "mongodb"
    pg_bronze.mkdir(parents=True, exist_ok=True)
    mongo_bronze.mkdir(parents=True, exist_ok=True)

    if run_live_extract:
        for source_name, script in (
            ("PostgreSQL Central", ETL_DIR / "extract" / "extract_postgresql.py"),
            ("MongoDB Events", ETL_DIR / "extract" / "extract_mongodb.py"),
        ):
            print(f"[EXTRACT] Trích xuất {source_name}...")
            result = subprocess.run(
                [sys.executable, str(script)],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            if result.stdout.strip():
                print(result.stdout.strip())
            if result.returncode != 0:
                details = result.stderr.strip() or result.stdout.strip()
                raise RuntimeError(
                    f"Trích xuất {source_name} thất bại "
                    f"(exit {result.returncode}): {details}"
                )

    # Kiểm tra tính toàn vẹn tầng Bronze
    required_pg_tables = [
        "ban_hang_central", "demand_forecast", "dieu_chuyen_central",
        "kho", "lich_su_ton_kho_central", "nhap_hang_central",
        "nhom_san_pham", "san_pham", "ton_kho_central",
        "xuat_hang_central"
    ]

    verified_pg = 0
    for tbl in required_pg_tables:
        f = pg_bronze / f"{tbl}.csv"
        if f.exists() and f.stat().st_size > 0:
            verified_pg += 1
        else:
            raise FileNotFoundError(
                f"Thiếu bảng PostgreSQL Bronze bắt buộc hoặc file rỗng: {f}"
            )

    mongo_files = list(mongo_bronze.glob("*.json"))
    print(f"[*] Kết quả xác minh tầng Bronze:")
    print(f"  - Bảng PostgreSQL hợp lệ: {verified_pg}/{len(required_pg_tables)}")
    print(f"  - Tập dữ liệu MongoDB: {len(mongo_files)} files JSON")
    print(f"  - Thư mục Bronze: {BRONZE_DIR}")
    print("=" * 80)

    return True

if __name__ == "__main__":
    live = "--live" in sys.argv
    load_bronze(run_live_extract=live)
