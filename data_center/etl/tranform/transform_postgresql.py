import csv
import json
import os
import sys
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_DIR = Path(
    os.getenv("DATA_LAKE_DIR", Path(__file__).resolve().parents[2] / "data_lake")
)
BRONZE_DIR = BASE_DIR / "bronze" / "postgresql" / "central"
SILVER_DIR = BASE_DIR / "silver" / "postgresql" / "central"
REJECT_DIR = BASE_DIR / "silver" / "quality_reports"

TABLE_RULES = {
    "xuat_hang_central": {
        "columns": ["id", "ma_phieu_xuat", "ma_kho", "ma_sp", "ngay_xuat", "so_luong", "don_gia", "thanh_tien", "source_node", "created_at"],
        "required": ["id", "ma_phieu_xuat", "ma_kho", "ma_sp", "ngay_xuat", "so_luong", "don_gia", "thanh_tien"],
        "key": ["id"],
        "dates": ["ngay_xuat", "created_at"],
        "numbers": ["id", "so_luong", "don_gia", "thanh_tien"],
        "integers": ["id", "so_luong"],
        "positive": ["id", "so_luong"],
        "non_negative": ["don_gia", "thanh_tien"],
    },
    "nhap_hang_central": {
        "columns": ["id", "ma_phieu_nhap", "ma_kho", "ma_sp", "ngay_nhap", "so_luong", "don_gia", "thanh_tien", "source_node", "created_at"],
        "required": ["id", "ma_phieu_nhap", "ma_kho", "ma_sp", "ngay_nhap", "so_luong", "don_gia", "thanh_tien"],
        "key": ["id"],
        "dates": ["ngay_nhap", "created_at"],
        "numbers": ["id", "so_luong", "don_gia", "thanh_tien"],
        "integers": ["id", "so_luong"],
        "positive": ["id", "so_luong"],
        "non_negative": ["don_gia", "thanh_tien"],
    },
    "dieu_chuyen_central": {
        "columns": ["id", "ma_phieu_dc", "kho_xuat", "kho_nhap", "ma_sp", "so_luong", "ngay_dieu_chuyen", "trang_thai", "source_node", "created_at"],
        "required": ["id", "ma_phieu_dc", "kho_xuat", "kho_nhap", "ma_sp", "so_luong", "ngay_dieu_chuyen"],
        "key": ["id"],
        "dates": ["ngay_dieu_chuyen", "created_at"],
        "numbers": ["id", "so_luong"],
        "integers": ["id", "so_luong"],
        "positive": ["id", "so_luong"],
    },
    "kho": {
        "columns": ["ma_kho", "ten_kho", "dia_chi", "thanh_pho", "node_name", "node_host", "node_port", "trang_thai", "dong_bo_luc"],
        "required": ["ma_kho", "ten_kho"],
        "key": ["ma_kho"],
        "dates": ["dong_bo_luc"],
        "numbers": ["node_port"],
        "integers": ["node_port"],
        "positive": ["node_port"],
    },
    "san_pham": {
        "columns": ["ma_sp", "ten_sp", "ma_nhom", "don_vi", "gia_nhap", "gia_ban", "ton_toi_thieu", "ton_an_toan", "trang_thai"],
        "required": ["ma_sp", "ten_sp", "ma_nhom", "don_vi", "gia_nhap", "gia_ban", "ton_toi_thieu", "ton_an_toan"],
        "key": ["ma_sp"],
        "dates": [],
        "numbers": ["gia_nhap", "gia_ban", "ton_toi_thieu", "ton_an_toan"],
        "integers": ["gia_nhap", "gia_ban", "ton_toi_thieu", "ton_an_toan"],
        "non_negative": ["gia_nhap", "gia_ban", "ton_toi_thieu", "ton_an_toan"],
    },
    "nhom_san_pham": {
        "columns": ["ma_nhom", "ten_nhom"],
        "required": ["ma_nhom", "ten_nhom"],
        "key": ["ma_nhom"],
        "dates": [],
        "numbers": [],
        "positive": [],
    },
    "ton_kho_central": {
        "columns": ["ma_kho", "ma_sp", "so_luong", "cap_nhat_luc", "source_node"],
        "required": ["ma_kho", "ma_sp", "so_luong"],
        "key": ["ma_kho", "ma_sp"],
        "dates": ["cap_nhat_luc"],
        "numbers": ["so_luong"],
        "integers": ["so_luong"],
        "non_negative": ["so_luong"],
        "positive": [],
    },
    "lich_su_ton_kho_central": {
        "columns": ["id", "ma_kho", "ma_sp", "ngay", "ton_dau", "nhap", "xuat", "dieu_chuyen_vao", "dieu_chuyen_ra", "ton_cuoi", "source_node", "created_at"],
        "required": ["id", "ma_kho", "ma_sp", "ngay", "ton_dau", "nhap", "xuat", "dieu_chuyen_vao", "dieu_chuyen_ra", "ton_cuoi"],
        "key": ["id"],
        "dates": ["ngay", "created_at"],
        "numbers": [
            "id", "ton_dau", "nhap", "xuat",
            "dieu_chuyen_vao", "dieu_chuyen_ra", "ton_cuoi"
        ],
        "integers": ["id", "ton_dau", "nhap", "xuat", "dieu_chuyen_vao", "dieu_chuyen_ra", "ton_cuoi"],
        "positive": ["id"],
        "non_negative": ["ton_dau", "nhap", "xuat", "dieu_chuyen_vao", "dieu_chuyen_ra", "ton_cuoi"],
    },
    "demand_forecast": {
        "columns": ["id", "ma_kho", "ma_sp", "forecast_date", "predicted_quantity", "model_name", "created_at"],
        "required": ["id", "ma_kho", "ma_sp", "forecast_date", "predicted_quantity"],
        "key": ["id"],
        "dates": ["forecast_date", "created_at"],
        "numbers": ["id", "predicted_quantity"],
        "integers": ["id"],
        "positive": ["id"],
        "non_negative": ["predicted_quantity"],
    },
    "ban_hang_central": {
        "columns": ["id", "ma_phieu_xuat", "ma_kho", "ma_sp", "ngay_ban", "so_luong", "don_gia", "thanh_tien", "source_node", "created_at"],
        "required": ["id", "ma_phieu_xuat", "ma_kho", "ma_sp", "ngay_ban", "so_luong", "don_gia", "thanh_tien"],
        "key": ["id"],
        "dates": ["ngay_ban", "created_at"],
        "numbers": ["id", "so_luong", "don_gia", "thanh_tien"],
        "integers": ["id", "so_luong"],
        "positive": ["id", "so_luong"],
        "non_negative": ["don_gia", "thanh_tien"],
    },
}


def parse_date(value):
    if value is None:
        return None
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
        raise FileNotFoundError(f"Không tìm thấy bảng Bronze bắt buộc: {source}")

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
        missing_columns = sorted(set(rules["columns"]) - set(columns))
        if missing_columns:
            raise ValueError(
                f"Schema Bronze không hợp lệ cho {table}; thiếu cột: "
                + ", ".join(missing_columns)
            )

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
                    number = Decimal(row[field])
                    if not number.is_finite():
                        raise ValueError
                except (InvalidOperation, ValueError):
                    errors.append(f"SO_KHONG_HOP_LE:{field}")
                    continue

                if field in rules.get("integers", []) and number != number.to_integral_value():
                    errors.append(f"SO_KHONG_PHAI_SO_NGUYEN:{field}")
                if field in rules.get("positive", []) and number <= 0:
                    errors.append(f"SO_LUONG_KHONG_DUONG:{field}")
                if field in rules.get("non_negative", []) and number < 0:
                    errors.append(f"SO_LUONG_AM:{field}")

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
    return report


def main():
    total_rejected = 0
    for table, rules in TABLE_RULES.items():
        report = transform_table(table, rules)
        total_rejected += report["rejected_rows"]
    if total_rejected:
        raise RuntimeError(
            f"Silver từ chối {total_rejected} dòng dữ liệu; dừng ETL để không "
            "tạo Gold từ snapshot một phần. Xem báo cáo trong quality_reports."
        )


if __name__ == "__main__":
    main()
