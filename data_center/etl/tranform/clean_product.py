
import csv
from decimal import Decimal, InvalidOperation
from pathlib import Path

BASE_DIR = Path("/app/data_lake")
BRONZE_FILE = BASE_DIR / "bronze/postgresql/central/san_pham.csv"
SILVER_DIR = BASE_DIR / "silver/postgresql"
SILVER_FILE = SILVER_DIR / "san_pham.csv"
REJECTED_FILE = SILVER_DIR / "san_pham_rejected.csv"

COLUMNS = [
    "ma_sp", "ten_sp", "ma_nhom", "don_vi", "gia_nhap",
    "gia_ban", "ton_toi_thieu", "ton_an_toan", "trang_thai"
]

VALID_STATUSES = {"ACTIVE", "INACTIVE"}

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
            errors = []
            cleaned = {
                key: (value.strip() if value is not None else "")
                for key, value in row.items()
            }

            for column in COLUMNS:
                if not cleaned[column]:
                    errors.append(f"Thiếu {column}")

            ma_sp = cleaned["ma_sp"]
            if ma_sp:
                if ma_sp in seen_ids:
                    errors.append("Trùng ma_sp")
                else:
                    seen_ids.add(ma_sp)

            for column in ["gia_nhap", "gia_ban"]:
                value = cleaned[column]
                if value:
                    try:
                        number = Decimal(value)
                        if not number.is_finite() or number < 0:
                            errors.append(f"{column} không hợp lệ")
                    except InvalidOperation:
                        errors.append(f"{column} không phải số hợp lệ")

            for column in ["ton_toi_thieu", "ton_an_toan"]:
                value = cleaned[column]
                if value:
                    try:
                        number = int(value)
                        if number < 0:
                            errors.append(f"{column} không được âm")
                    except ValueError:
                        errors.append(f"{column} phải là số nguyên")

            if cleaned["trang_thai"] and cleaned["trang_thai"] not in VALID_STATUSES:
                errors.append("trang_thai không hợp lệ")

            if errors:
                rejected_rows.append({
                    **cleaned,
                    "line_number": line_number,
                    "reject_reason": "; ".join(errors)
                })
            else:
                valid_rows.append(cleaned)

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
