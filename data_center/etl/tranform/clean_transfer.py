
import csv
from datetime import datetime
from pathlib import Path

BASE_DIR = Path("/app/data_lake")
BRONZE_FILE = BASE_DIR / "bronze/postgresql/central/dieu_chuyen_central.csv"
SILVER_DIR = BASE_DIR / "silver/postgresql"
SILVER_FILE = SILVER_DIR / "dieu_chuyen_central.csv"
REJECTED_FILE = SILVER_DIR / "dieu_chuyen_central_rejected.csv"

COLUMNS = [
    "id", "ma_phieu_dc", "kho_xuat", "kho_nhap", "ma_sp",
    "so_luong", "ngay_dieu_chuyen", "trang_thai",
    "source_node", "created_at"
]

def main():
    SILVER_DIR.mkdir(parents=True, exist_ok=True)

    valid_rows = []
    rejected_rows = []
    seen_ids = set()
    seen_codes = set()

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

            if row["id"]:
                if row["id"] in seen_ids:
                    errors.append("Trùng id")
                else:
                    seen_ids.add(row["id"])

            if row["ma_phieu_dc"]:
                if row["ma_phieu_dc"] in seen_codes:
                    errors.append("Trùng ma_phieu_dc")
                else:
                    seen_codes.add(row["ma_phieu_dc"])

            if row["kho_xuat"] and row["kho_nhap"]:
                if row["kho_xuat"] == row["kho_nhap"]:
                    errors.append("Kho xuất và kho nhập giống nhau")

            try:
                quantity = int(row["so_luong"])
                if quantity <= 0:
                    errors.append("so_luong phải lớn hơn 0")
            except ValueError:
                errors.append("so_luong phải là số nguyên")

            for column in ["ngay_dieu_chuyen", "created_at"]:
                try:
                    datetime.fromisoformat(row[column])
                except ValueError:
                    errors.append(f"{column} không hợp lệ")

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

