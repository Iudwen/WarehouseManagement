
import csv
from datetime import datetime
from pathlib import Path

BASE_DIR = Path("/app/data_lake")
BRONZE_FILE = BASE_DIR / "bronze/postgresql/central/kho.csv"
SILVER_DIR = BASE_DIR / "silver/postgresql"
SILVER_FILE = SILVER_DIR / "kho.csv"
REJECTED_FILE = SILVER_DIR / "kho_rejected.csv"

COLUMNS = [
    "ma_kho", "ten_kho", "dia_chi", "thanh_pho",
    "node_name", "node_host", "node_port", "trang_thai",
    "dong_bo_luc"
]

VALID_STATUSES = {"ONLINE", "OFFLINE"}

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

            for column in ["ma_kho", "ten_kho", "trang_thai", "dong_bo_luc"]:
                if not row[column]:
                    errors.append(f"Thiếu {column}")

            ma_kho = row["ma_kho"]

            if ma_kho:
                if ma_kho in seen_ids:
                    errors.append("Trùng ma_kho")
                else:
                    seen_ids.add(ma_kho)

            if row["trang_thai"] and row["trang_thai"] not in VALID_STATUSES:
                errors.append("trang_thai không hợp lệ")

            if row["node_port"]:
                try:
                    port = int(row["node_port"])
                    if not 1 <= port <= 65535:
                        errors.append("node_port ngoài phạm vi hợp lệ")
                except ValueError:
                    errors.append("node_port không phải số nguyên")

            try:
                datetime.fromisoformat(row["dong_bo_luc"])
            except ValueError:
                errors.append("dong_bo_luc không hợp lệ")

            # TRANSIT là kho trung chuyển, không bắt buộc thông tin node.
            # Các kho chi nhánh cần có node_name, node_host và node_port.
            if ma_kho != "TRANSIT":
                for column in ["dia_chi", "thanh_pho", "node_name", "node_host", "node_port"]:
                    if not row[column]:
                        errors.append(f"Thiếu {column}")

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
