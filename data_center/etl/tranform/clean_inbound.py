
import csv
from decimal import Decimal, InvalidOperation
from datetime import datetime
from pathlib import Path

BASE_DIR = Path("/app/data_lake")
BRONZE_FILE = BASE_DIR / "bronze/postgresql/central/nhap_hang_central.csv"
SILVER_DIR = BASE_DIR / "silver/postgresql"
SILVER_FILE = SILVER_DIR / "nhap_hang_central.csv"
REJECTED_FILE = SILVER_DIR / "nhap_hang_central_rejected.csv"

COLUMNS = [
    "id", "ma_phieu_nhap", "ma_kho", "ma_sp",
    "ngay_nhap", "so_luong", "don_gia", "thanh_tien",
    "source_node", "created_at"
]

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

            for column in COLUMNS:
                if not row.get(column) or not row[column].strip():
                    errors.append(f"Thiếu {column}")

            if errors:
                rejected_rows.append({
                    **row,
                    "line_number": line_number,
                    "reject_reason": "; ".join(errors)
                })
                continue

            record_id = row["id"].strip()

            try:
                int(record_id)
                if record_id in seen_ids:
                    errors.append("Trùng id")
                seen_ids.add(record_id)
            except ValueError:
                errors.append("id không phải số nguyên")

            try:
                datetime.fromisoformat(row["ngay_nhap"].strip())
                datetime.fromisoformat(row["created_at"].strip())
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
                unit_price = Decimal(row["don_gia"].strip())
                total_amount = Decimal(row["thanh_tien"].strip())

                if not unit_price.is_finite() or not total_amount.is_finite():
                    errors.append("Đơn giá hoặc thành tiền không hữu hạn")
                else:
                    if unit_price < 0:
                        errors.append("don_gia âm")
                    if total_amount < 0:
                        errors.append("thanh_tien âm")
                    if quantity is not None and total_amount != unit_price * quantity:
                        errors.append("thanh_tien không khớp so_luong x don_gia")
            except (InvalidOperation, ValueError):
                errors.append("Đơn giá hoặc thành tiền không hợp lệ")

            if errors:
                rejected_rows.append({
                    **row,
                    "line_number": line_number,
                    "reject_reason": "; ".join(errors)
                })
            else:
                cleaned = {column: row[column].strip() for column in COLUMNS}
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
