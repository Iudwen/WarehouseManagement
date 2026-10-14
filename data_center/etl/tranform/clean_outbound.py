
import csv
from decimal import Decimal, InvalidOperation
from datetime import datetime
from pathlib import Path

BASE_DIR = Path("/app/data_lake")
BRONZE_FILE = BASE_DIR / "bronze/postgresql/central/xuat_hang_central.csv"
SILVER_DIR = BASE_DIR / "silver/postgresql"
SILVER_FILE = SILVER_DIR / "xuat_hang_central.csv"
REJECTED_FILE = SILVER_DIR / "xuat_hang_central_rejected.csv"

REQUIRED_COLUMNS = [
    "id", "ma_phieu_xuat", "ma_kho", "ma_sp",
    "ngay_xuat", "so_luong", "don_gia", "thanh_tien",
    "source_node", "created_at"
]

def parse_datetime(value):
    return datetime.fromisoformat(value.strip())

def parse_decimal(value):
    return Decimal(value.strip())

def main():
    SILVER_DIR.mkdir(parents=True, exist_ok=True)

    valid_rows = []
    rejected_rows = []
    seen_ids = set()

    with BRONZE_FILE.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)

        if reader.fieldnames != REQUIRED_COLUMNS:
            raise ValueError(
                f"Cấu trúc cột không đúng. Nhận được: {reader.fieldnames}"
            )

        for line_number, row in enumerate(reader, start=2):
            errors = []

            for column in REQUIRED_COLUMNS:
                if row.get(column) is None or not row[column].strip():
                    errors.append(f"Thiếu {column}")

            if errors:
                rejected_rows.append({
                    **row,
                    "line_number": line_number,
                    "reject_reason": "; ".join(errors)
                })
                continue

            record_id = row["id"].strip()

            if record_id in seen_ids:
                errors.append("Trùng id")
            else:
                seen_ids.add(record_id)

            try:
                int(record_id)
            except ValueError:
                errors.append("id không phải số nguyên")

            try:
                parse_datetime(row["ngay_xuat"])
                parse_datetime(row["created_at"])
            except ValueError:
                errors.append("Ngày giờ không hợp lệ")

            try:
                quantity = int(row["so_luong"])
                if quantity <= 0:
                    errors.append("so_luong phải lớn hơn 0")
            except ValueError:
                quantity = None
                errors.append("so_luong không phải số nguyên")

            try:
                unit_price = parse_decimal(row["don_gia"])
                total_amount = parse_decimal(row["thanh_tien"])

                if unit_price < 0:
                    errors.append("don_gia âm")
                if total_amount < 0:
                    errors.append("thanh_tien âm")

                if quantity is not None and total_amount != unit_price * quantity:
                    errors.append("thanh_tien không khớp so_luong x don_gia")
            except InvalidOperation:
                errors.append("Đơn giá hoặc thành tiền không hợp lệ")

            if errors:
                rejected_rows.append({
                    **row,
                    "line_number": line_number,
                    "reject_reason": "; ".join(errors)
                })
            else:
                valid_rows.append({
                    **row,
                    "id": record_id,
                    "ma_phieu_xuat": row["ma_phieu_xuat"].strip(),
                    "ma_kho": row["ma_kho"].strip(),
                    "ma_sp": row["ma_sp"].strip(),
                    "source_node": row["source_node"].strip()
                })

    def write_csv(path, rows, columns):
        temp_path = path.with_suffix(path.suffix + ".tmp")
        with temp_path.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=columns)
            writer.writeheader()
            writer.writerows(rows)
        temp_path.replace(path)

    write_csv(SILVER_FILE, valid_rows, REQUIRED_COLUMNS)

    rejected_columns = REQUIRED_COLUMNS + ["line_number", "reject_reason"]
    write_csv(REJECTED_FILE, rejected_rows, rejected_columns)

    print(f"Tổng số dòng đọc: {len(valid_rows) + len(rejected_rows)}")
    print(f"Dòng hợp lệ: {len(valid_rows)}")
    print(f"Dòng bị loại: {len(rejected_rows)}")
    print(f"Silver: {SILVER_FILE}")
    print(f"Bản ghi lỗi: {REJECTED_FILE}")

if __name__ == "__main__":
    main()
