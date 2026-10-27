import sys
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
import csv
from collections import defaultdict
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
RAW_FILE = BASE_DIR / "data_mining" / "datasets" / "raw" / "lich_su_xuat_hang.csv"
GOLD_DIR = BASE_DIR / "data_mining" / "datasets" / "gold"
GOLD_FILE = GOLD_DIR / "lich_su_xuat_hang_gold.csv"
DATA_LAKE_GOLD_FILE = BASE_DIR / "data_center" / "data_lake" / "gold" / "lich_su_xuat_hang_gold.csv"

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


def build_gold(raw_file=None, gold_file=None):
    raw_path = Path(raw_file) if raw_file else RAW_FILE
    gold_path = Path(gold_file) if gold_file else GOLD_FILE

    if not raw_path.exists():
        raise FileNotFoundError(f"Khong tim thay file Raw: {raw_path}")

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

    with raw_path.open("r", encoding="utf-8-sig", newline="") as file:
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

    if rejected:
        raise ValueError(
            f"Tu choi tao Gold: {rejected}/{total} dong Raw khong hop le; "
            "Gold hien huu duoc giu nguyen."
        )
    if valid == 0:
        raise ValueError("Khong co ban ghi Raw hop le; Gold hien huu duoc giu nguyen.")

    gold_path.parent.mkdir(parents=True, exist_ok=True)

    target_paths = [gold_path]
    if gold_file is None:
        DATA_LAKE_GOLD_FILE.parent.mkdir(parents=True, exist_ok=True)
        if DATA_LAKE_GOLD_FILE not in target_paths:
            target_paths.append(DATA_LAKE_GOLD_FILE)

    for path_to_write in target_paths:
        path_to_write.parent.mkdir(parents=True, exist_ok=True)
        with path_to_write.open("w", encoding="utf-8-sig", newline="") as file:
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
    print(f"File Gold: {gold_path}")

    return {
        "total": total,
        "valid": valid,
        "rejected": rejected,
        "groups": len(groups),
    }


if __name__ == "__main__":
    build_gold()
