
import csv
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

SOURCE = Path("data_mining/datasets/gold/lich_su_xuat_hang_gold.csv")
OUTPUT = Path("data_mining/datasets/gold/nhu_cau_xuat_hang_daily.csv")


def main():
    records = {}
    pairs = set()
    dates = set()

    with SOURCE.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)

        for row in reader:
            day = date.fromisoformat(row["ngay"])
            warehouse = row["ma_kho"]
            product = row["ma_sp"]
            quantity = Decimal(row["tong_so_luong_xuat"])

            key = (day, warehouse, product)
            if key in records:
                raise ValueError(f"Trung khoa du lieu: {key}")

            records[key] = quantity
            pairs.add((warehouse, product))
            dates.add(day)

    start = min(dates)
    end = max(dates)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    with OUTPUT.open("w", encoding="utf-8-sig", newline="") as f:
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
    print(f"File dau ra: {OUTPUT}")


if __name__ == "__main__":
    main()
