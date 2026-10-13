
import csv
from pathlib import Path

BASE_DIR = Path("/app/data_lake")
BRONZE_FILE = BASE_DIR / "bronze/postgresql/central/nhom_san_pham.csv"
SILVER_DIR = BASE_DIR / "silver/postgresql"
SILVER_FILE = SILVER_DIR / "nhom_san_pham.csv"
REJECTED_FILE = SILVER_DIR / "nhom_san_pham_rejected.csv"

COLUMNS = ["ma_nhom", "ten_nhom"]

def main():
    SILVER_DIR.mkdir(parents=True, exist_ok=True)

    valid_rows = []
    rejected_rows = []
    seen_ids = set()

    with BRONZE_FILE.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)

        if reader.fieldnames != COLUMNS:
            raise ValueError(f"Cấu trúc cột không đúng: {reader.fieldnames}")

        for line_number, row in enumerate(reader, start=2):
            row = {
                key: (value.strip() if value is not None else "")
                for key, value in row.items()
            }
            errors = []

            for column in COLUMNS:
                if not row[column]:
                    errors.append(f"Thiếu {column}")

            ma_nhom = row["ma_nhom"]
            if ma_nhom:
                if ma_nhom in seen_ids:
                    errors.append("Trùng ma_nhom")
                else:
                    seen_ids.add(ma_nhom)

            if errors:
                rejected_rows.append({
                    **row,
                    "line_number": line_number,
                    "reject_reason": "; ".join(errors)
                })
            else:
                valid_rows.append(row)

    def write_csv(path, rows, columns):
        temp_path = path.with_suffix(path.suffix + ".tmp")
        with temp_path.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=columns)
            writer.writeheader()
            writer.writerows(rows)
        temp_path.replace(path)

    write_csv(SILVER_FILE, valid_rows, COLUMNS)
    write_csv(
        REJECTED_FILE,
        rejected_rows,
        COLUMNS + ["line_number", "reject_reason"]
    )

    print(f"Tổng số dòng đọc: {len(valid_rows) + len(rejected_rows)}")
    print(f"Dòng hợp lệ: {len(valid_rows)}")
    print(f"Dòng bị loại: {len(rejected_rows)}")
    print(f"Silver: {SILVER_FILE}")
    print(f"Bản ghi lỗi: {REJECTED_FILE}")

if __name__ == "__main__":
    main()
