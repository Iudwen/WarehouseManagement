import csv
from collections import defaultdict
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

RAW_FILE = Path("data_mining/datasets/raw/lich_su_xuat_hang.csv")
GOLD_DIR = Path("data_mining/datasets/gold")
GOLD_FILE = GOLD_DIR / "lich_su_xuat_hang_gold.csv"

KEY_FIELDS = ("ngay", "ma_kho", "ma_sp")
NUMBER_FIELDS = (
    "so_phieu_xuat",
    "tong_so_luong_xuat",
    "tong_gia_tri_xuat",
)
OUTPUT_FIELDS = [
    "ngay",
    "ma_kho",
    "ma_sp",
    "so_phieu_xuat",
    "tong_so_luong_xuat",
    "tong_gia_tri_xuat",
]


def to_decimal(value):
    try:
        number = Decimal(value.strip())
        if not number.is_finite():
            raise ValueError("Gia tri so khong hop le")
        return number
    except (InvalidOperation, AttributeError):
        raise ValueError(f"Khong phai so hop le: {value!r}")


def build_gold():
    if not RAW_FILE.exists():
        raise FileNotFoundError(f"Khong tim thay file Raw: {RAW_FILE}")

    groups = defaultdict(
        lambda: {
            "so_phieu_xuat": Decimal("0"),
            "tong_so_luong_xuat": Decimal("0"),
            "tong_gia_tri_xuat": Decimal("0"),
        }
    )

    total = 0
    rejected = 0
    valid = 0

    with RAW_FILE.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)

        if reader.fieldnames != OUTPUT_FIELDS:
            raise ValueError(
                f"Cac cot CSV khong dung. Tim thay: {reader.fieldnames}"
            )

        for row in reader:
            total += 1

            try:
                day = row["ngay"].strip()
                date.fromisoformat(day)

                warehouse = row["ma_kho"].strip()
                product = row["ma_sp"].strip()

                if not warehouse or not product:
                    raise ValueError("Thieu ma kho hoac ma san pham")

                values = {
                    field: to_decimal(row[field])
                    for field in NUMBER_FIELDS
                }

                if any(value < 0 for value in values.values()):
                    raise ValueError("So lieu khong duoc am")

                key = (day, warehouse, product)
                for field, value in values.items():
                    groups[key][field] += value

                valid += 1

            except (ValueError, TypeError, KeyError):
                rejected += 1

    GOLD_DIR.mkdir(parents=True, exist_ok=True)

    with GOLD_FILE.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()

        for (day, warehouse, product), values in sorted(groups.items()):
            writer.writerow({
                "ngay": day,
                "ma_kho": warehouse,
                "ma_sp": product,
                "so_phieu_xuat": format(values["so_phieu_xuat"], "f"),
                "tong_so_luong_xuat": format(
                    values["tong_so_luong_xuat"], "f"
                ),
                "tong_gia_tri_xuat": format(
                    values["tong_gia_tri_xuat"], ".2f"
                ),
            })

    print(f"So dong Raw: {total}")
    print(f"So dong hop le: {valid}")
    print(f"So dong bi loai: {rejected}")
    print(f"So nhom Gold: {len(groups)}")
    print(f"So dong trung da gop: {valid - len(groups)}")
    print(f"File Gold: {GOLD_FILE}")


if __name__ == "__main__":
    build_gold()
