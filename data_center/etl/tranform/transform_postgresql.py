
import csv
import json
from collections import Counter
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2] / "data_lake"
BRONZE_DIR = BASE_DIR / "bronze" / "postgresql" / "central"
SILVER_DIR = BASE_DIR / "silver" / "postgresql" / "central"
REJECT_DIR = BASE_DIR / "silver" / "quality_reports"

TABLE_RULES = {
    "xuat_hang_central": {
        "required": ["id", "ma_phieu_xuat", "ma_kho", "ma_sp", "ngay_xuat", "so_luong"],
        "key": ["id"],
        "dates": ["ngay_xuat", "created_at"],
        "numbers": ["id", "so_luong", "don_gia", "thanh_tien"],
        "positive": ["so_luong"],
    },
    "nhap_hang_central": {
        "required": ["id", "ma_phieu_nhap", "ma_kho", "ma_sp", "ngay_nhap", "so_luong"],
        "key": ["id"],
        "dates": ["ngay_nhap", "created_at"],
        "numbers": ["id", "so_luong", "don_gia", "thanh_tien"],
        "positive": ["so_luong"],
    },
    "dieu_chuyen_central": {
        "required": ["id", "ma_phieu_dc", "kho_xuat", "kho_nhap", "ma_sp", "so_luong"],
        "key": ["id"],
        "dates": ["ngay_dieu_chuyen", "created_at"],
        "numbers": ["id", "so_luong"],
        "positive": ["so_luong"],
    },
    "kho": {
        "required": ["ma_kho", "ten_kho"],
        "key": ["ma_kho"],
        "dates": ["dong_bo_luc"],
        "numbers": ["node_port"],
        "positive": [],
    },
    "san_pham": {
        "required": ["ma_sp", "ten_sp"],
        "key": ["ma_sp"],
        "dates": [],
        "numbers": ["gia_nhap", "gia_ban", "ton_toi_thieu", "ton_an_toan"],
        "positive": [],
    },
    "nhom_san_pham": {
        "required": ["ma_nhom", "ten_nhom"],
        "key": ["ma_nhom"],
        "dates": [],
        "numbers": [],
        "positive": [],
    },
    "ton_kho_central": {
        "required": ["ma_kho", "ma_sp", "so_luong"],
        "key": ["ma_kho", "ma_sp"],
        "dates": ["cap_nhat_luc"],
        "numbers": ["so_luong"],
        "positive": [],
    },
    "ton_kho_hien_tai": {
        "required": ["ma_kho", "ma_sp", "so_luong"],
        "key": ["ma_kho", "ma_sp"],
        "dates": ["cap_nhat_luc"],
        "numbers": ["so_luong"],
        "positive": [],
    },
    "lich_su_ton_kho_central": {
        "required": ["id", "ma_kho", "ma_sp", "ngay"],
        "key": ["id"],
        "dates": ["ngay", "created_at"],
        "numbers": [
            "id", "ton_dau", "nhap", "xuat",
            "dieu_chuyen_vao", "dieu_chuyen_ra", "ton_cuoi"
        ],
        "positive": [],
    },
    "demand_forecast": {
        "required": ["id", "ma_kho", "ma_sp", "forecast_date", "predicted_quantity"],
        "key": ["id"],
        "dates": ["forecast_date", "created_at"],
        "numbers": ["id", "predicted_quantity"],
        "positive": [],
    },
    "ban_hang_central": {
        "required": [],
        "key": [],
        "dates": [],
        "numbers": [],
        "positive": [],
    },
}


def parse_date(value):
    value = value.strip()
    if not value:
        return
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def transform_table(table, rules):
    source = BRONZE_DIR / f"{table}.csv"
    target = SILVER_DIR / f"{table}.csv"
    rejected_file = REJECT_DIR / f"{table}_rejected.csv"

    if not source.exists():
        print(f"[SKIP] Không tìm thấy {source.name}")
        return

    accepted = []
    rejected = []
    seen_keys = set()
    duplicate_count = 0
    invalid_count = 0

    with source.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)

        if not reader.fieldnames:
            print(f"[ERROR] File không có header: {source.name}")
            return

        columns = reader.fieldnames

        for row_number, original in enumerate(reader, start=2):
            row = {
                key: (value.strip() if isinstance(value, str) else value)
                for key, value in original.items()
                if key is not None
            }
            errors = []

            for field in rules["required"]:
                if field not in columns:
                    errors.append(f"THIEU_COT:{field}")
                elif not row.get(field):
                    errors.append(f"THIEU_GIA_TRI:{field}")

            for field in rules["dates"]:
                if field not in columns or not row.get(field):
                    continue
                if parse_date(row[field]) is None:
                    errors.append(f"NGAY_KHONG_HOP_LE:{field}")

            for field in rules["numbers"]:
                if field not in columns or not row.get(field):
                    continue
                try:
                    number = float(row[field])
                    if number != number or abs(number) == float("inf"):
                        raise ValueError
                except ValueError:
                    errors.append(f_SO_LOI(field))
                    continue

                if field in rules["positive"] and number <= 0:
                    errors.append(f"SO_LUONG_KHONG_DUONG:{field}")

            key_fields = rules["key"]
            if key_fields and all(row.get(field) for field in key_fields):
                key = tuple(row[field] for field in key_fields)
                if key in seen_keys:
                    duplicate_count += 1
                    errors.append("TRUNG_KHOA:" + ",".join(key_fields))
                else:
                    seen_keys.add(key)

            if errors:
                invalid_count += 1
                rejected.append({
                    **row,
                    "_row_number": row_number,
                    "_errors": ";".join(errors),
                })
            else:
                accepted.append(row)

    SILVER_DIR.mkdir(parents=True, exist_ok=True)
    REJECT_DIR.mkdir(parents=True, exist_ok=True)

    with target.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=columns)
        writer.writeheader()
        writer.writerows(accepted)

    reject_columns = columns + ["_row_number", "_errors"]
    with rejected_file.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=reject_columns)
        writer.writeheader()
        writer.writerows(rejected)

    report = {
        "table": table,
        "source_file": str(source),
        "silver_file": str(target),
        "source_rows": len(accepted) + len(rejected),
        "silver_rows": len(accepted),
        "rejected_rows": len(rejected),
        "duplicate_rows_detected": duplicate_count,
        "invalid_rows": invalid_count,
        "processed_at": datetime.now().isoformat(),
    }

    report_file = REJECT_DIR / f"{table}_report.json"
    report_file.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(
        f"[OK] {table}: nguồn={report['source_rows']}, "
        f"Silver={len(accepted)}, lỗi={len(rejected)}, "
        f"trùng khóa={duplicate_count}"
    )


def _f_so_loi(field):
    return f"SO_KHONG_HOP_LE:{field}"


def f_SO_LOI(field):
    return _f_so_loi(field)


def main():
    for table, rules in TABLE_RULES.items():
        transform_table(table, rules)


if __name__ == "__main__":
    main()
