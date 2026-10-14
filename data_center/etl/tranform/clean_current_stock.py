
import csv
from datetime import datetime
from pathlib import Path

BASE_DIR = Path("/app/data_lake")
BRONZE_FILE = BASE_DIR / "bronze/postgresql/central/ton_kho_hien_tai.csv"
SILVER_DIR = BASE_DIR / "silver/postgresql"
SILVER_FILE = SILVER_DIR / "ton_kho_hien_tai.csv"
REJECTED_FILE = SILVER_DIR / "ton_kho_hien_tai_rejected.csv"

COLUMNS = [
    "ma_kho", "ma_sp", "so_luong", "cap_nhat_luc", "source_node"
]

def main():
    SILVER_DIR.mkdir(parents=True, exist_ok=True)

    valid_rows = []
    rejected_rows = []
    seen_keys = set()

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

            key = (row["ma_kho"], row["ma_sp"])
            if all(key):
                if key in seen_keys:
                    errors.append("Trùng cặp ma_kho + ma_sp")
                else:
                    seen_keys.add(key)

            try:
                quantity = int(row["so_luong"])
                if quantity < 0:
                    errors.append("so_luong không được âm")
            except ValueError:
                errors.append("so_luong phải là số nguyên")

            try:
                datetime.fromisoformat(row["cap_nhat_luc"])
            except ValueError:
                errors.append("cap_nhat_luc không hợp lệ")

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
