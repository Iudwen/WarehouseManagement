
import csv
from collections import defaultdict
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]

SILVER_FILE = (
    ROOT_DIR
    / "data_center"
    / "data_lake"
    / "silver"
    / "postgresql"
    / "central"
    / "xuat_hang_central.csv"
)

RAW_DIR = ROOT_DIR / "data_mining" / "datasets" / "raw"
RAW_FILE = RAW_DIR / "lich_su_xuat_hang.csv"
REJECTED_FILE = RAW_DIR / "xuat_hang_rejected.csv"

OUTPUT_FIELDS = [
    "ngay",
    "ma_kho",
    "ma_sp",
    "so_phieu_xuat",
    "tong_so_luong_xuat",
    "tong_gia_tri_xuat",
]


def to_decimal(value):
    number = Decimal(value.strip())

    if not number.is_finite() or number < 0:
        raise ValueError(f"So lieu khong hop le: {value!r}")

    return number


def build_raw():
    if not SILVER_FILE.exists():
        raise FileNotFoundError(
            f"Khong tim thay file Silver: {SILVER_FILE}"
        )

    groups = defaultdict(
        lambda: {
            "invoices": set(),
            "quantity": Decimal("0"),
            "value": Decimal("0"),
        }
    )

    total_rows = 0
    valid_rows = 0
    rejected_rows = []

    with SILVER_FILE.open(
        "r", encoding="utf-8-sig", newline=""
    ) as file:
        reader = csv.DictReader(file)

        required = {
            "ma_phieu_xuat",
            "ma_kho",
            "ma_sp",
            "ngay_xuat",
            "so_luong",
            "thanh_tien",
        }

        if not reader.fieldnames or not required.issubset(
            set(reader.fieldnames)
        ):
            raise ValueError(
                f"Thieu cot du lieu. Cac cot hien co: {reader.fieldnames}"
            )

        for row in reader:
            total_rows += 1

            try:
                invoice = (row["ma_phieu_xuat"] or "").strip()
                warehouse = (row["ma_kho"] or "").strip()
                product = (row["ma_sp"] or "").strip()
                timestamp = (row["ngay_xuat"] or "").strip()

                if not invoice or not warehouse or not product:
                    raise ValueError("Thieu ma phieu, ma kho hoac ma san pham")

                day = timestamp[:10]
                date.fromisoformat(day)

                quantity = to_decimal(row["so_luong"])
                value = to_decimal(row["thanh_tien"])

                key = (day, warehouse, product)

                groups[key]["invoices"].add(invoice)
                groups[key]["quantity"] += quantity
                groups[key]["value"] += value

                valid_rows += 1

            except (ValueError, TypeError, InvalidOperation, AttributeError) as error:
                rejected = dict(row)
                rejected["ly_do_loi"] = str(error)
                rejected_rows.append(rejected)

    RAW_DIR.mkdir(parents=True, exist_ok=True)

    with RAW_FILE.open(
        "w", encoding="utf-8-sig", newline=""
    ) as file:
        writer = csv.DictWriter(file, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()

        for (day, warehouse, product), values in sorted(groups.items()):
            writer.writerow({
                "ngay": day,
                "ma_kho": warehouse,
                "ma_sp": product,
                "so_phieu_xuat": len(values["invoices"]),
                "tong_so_luong_xuat": format(values["quantity"], "f"),
                "tong_gia_tri_xuat": format(values["value"], ".2f"),
            })

    rejected_fields = list(
        dict.fromkeys(
            list(reader.fieldnames or []) + ["ly_do_loi"]
        )
    )

    with REJECTED_FILE.open(
        "w", encoding="utf-8-sig", newline=""
    ) as file:
        writer = csv.DictWriter(file, fieldnames=rejected_fields)
        writer.writeheader()
        writer.writerows(rejected_rows)

    print(f"Tong dong Silver: {total_rows}")
    print(f"Dong hop le: {valid_rows}")
    print(f"Dong bi loai: {len(rejected_rows)}")
    print(f"So nhom ngay-kho-san pham: {len(groups)}")
    print(f"Raw file: {RAW_FILE}")
    print(f"Rejected file: {REJECTED_FILE}")


if __name__ == "__main__":
    build_raw()
