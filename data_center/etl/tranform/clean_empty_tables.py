import csv
from pathlib import Path

BRONZE_DIR = Path("/app/data_lake/bronze/postgresql/central")
SILVER_DIR = Path("/app/data_lake/silver/postgresql")

TABLES = [
    "ban_hang_central.csv",
    "demand_forecast.csv",
    "lich_su_ton_kho_central.csv",
]


def process_table(filename):
    source = BRONZE_DIR / filename
    output = SILVER_DIR / filename
    rejected = SILVER_DIR / filename.replace(".csv", "_rejected.csv")

    if not source.exists():
        print(f"[ERROR] Không tìm thấy: {source}")
        return

    with source.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        rows = list(reader)

    if header is None:
        print(f"[ERROR] File không có header: {filename}")
        return

    if rows:
        print(
            f"[SKIP] {filename}: có {len(rows)} dòng dữ liệu. "
            "Cần kiểm tra và làm sạch dữ liệu trước."
        )
        return

    SILVER_DIR.mkdir(parents=True, exist_ok=True)

    for path in (output, rejected):
        with path.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(header)

    print(f"[OK] {filename}: 0 dòng dữ liệu")
    print(f"     Silver: {output}")
    print(f"     Rejected: {rejected}")


if __name__ == "__main__":
    for table in TABLES:
        process_table(table)