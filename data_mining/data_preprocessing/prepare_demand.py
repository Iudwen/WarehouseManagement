import sys
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

import csv
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
SOURCE = BASE_DIR / "data_mining" / "datasets" / "gold" / "lich_su_xuat_hang_gold.csv"
OUTPUT = BASE_DIR / "data_mining" / "datasets" / "gold" / "nhu_cau_xuat_hang_daily.csv"
DATA_LAKE_OUTPUT = BASE_DIR / "data_center" / "data_lake" / "gold" / "nhu_cau_xuat_hang_daily.csv"


def main():
    records = {}
    pairs = set()
    dates = set()

    with SOURCE.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        required_fields = {"ngay", "ma_kho", "ma_sp", "tong_so_luong_xuat"}
        missing_fields = required_fields - set(reader.fieldnames or [])
        if missing_fields:
            raise ValueError(
                "Thieu cot bat buoc trong Gold: "
                + ", ".join(sorted(missing_fields))
            )

        for row in reader:
            day = date.fromisoformat(row["ngay"])
            warehouse = row["ma_kho"].strip()
            product = row["ma_sp"].strip()
            quantity = Decimal(row["tong_so_luong_xuat"].strip())
            if not warehouse or not product:
                raise ValueError("Thieu ma kho hoac ma san pham trong Gold")
            if not quantity.is_finite() or quantity < 0:
                raise ValueError(
                    f"So luong xuat khong hop le tai {day}/{warehouse}/{product}"
                )

            key = (day, warehouse, product)
            if key in records:
                raise ValueError(f"Trung khoa du lieu: {key}")

            records[key] = quantity
            pairs.add((warehouse, product))
            dates.add(day)

    if not records:
        raise ValueError("Gold khong co du lieu; khong the tao chuoi nhu cau")

    start = min(dates)
    end = max(dates)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    DATA_LAKE_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    for target in [OUTPUT, DATA_LAKE_OUTPUT]:
        with target.open("w", encoding="utf-8-sig", newline="") as f:
            fields = ["ngay", "ma_kho", "ma_sp", "nhu_cau_xuat"]
            writer = csv.DictWriter(f, fieldnames=fields)
            writer.writeheader()

            day = start
            while day <= end:
                for warehouse, product in sorted(pairs):
                    key = (day, warehouse, product)
                    quantity = records.get(key, Decimal("0"))

                    writer.writerow({
                        "ngay": day.isoformat(),
                        "ma_kho": warehouse,
                        "ma_sp": product,
                        "nhu_cau_xuat": format(quantity, "f"),
                    })

                day += timedelta(days=1)

    expected = (end - start).days + 1
    print(f"So ngay: {expected}")
    print(f"So cap kho-san pham: {len(pairs)}")
    print(f"So dong daily du kien: {expected * len(pairs)}")
    print(
        "Luu y: ngay khong co giao dich duoc gan 0 luong xuat ghi nhan; "
        "khong khang dinh nhu cau thuc te bang 0."
    )
    print(f"File dau ra: {OUTPUT}")


if __name__ == "__main__":
    main()