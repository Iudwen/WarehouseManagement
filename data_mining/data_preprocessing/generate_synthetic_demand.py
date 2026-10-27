
import csv
import math
import random
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SOURCE = ROOT / "datasets" / "gold" / "nhu_cau_xuat_hang_daily.csv"
OUTPUT = ROOT / "datasets" / "gold" / "nhu_cau_xuat_hang_daily_synthetic.csv"

RANDOM_SEED = 42

WAREHOUSE_FACTORS = {
    "HN01": 1.00,
    "DN01": 0.85,
    "HCM01": 1.15,
}

WEEKDAY_FACTORS = {
    0: 1.08,
    1: 1.04,
    2: 1.00,
    3: 1.03,
    4: 1.12,
    5: 0.90,
    6: 0.78,
}


def main():
    rng = random.Random(RANDOM_SEED)

    if not SOURCE.exists():
        raise FileNotFoundError(f"Khong tim thay file: {SOURCE}")

    rows = []
    keys = set()
    dates = set()
    pairs = set()

    with SOURCE.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)

        required = {"ngay", "ma_kho", "ma_sp", "nhu_cau_xuat"}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError(
                f"File nguon phai co cac cot: {sorted(required)}"
            )

        for row in reader:
            day = date.fromisoformat(row["ngay"])
            warehouse = row["ma_kho"]
            product = row["ma_sp"]
            key = (day, warehouse, product)

            if key in keys:
                raise ValueError(f"Trung khoa du lieu: {key}")

            keys.add(key)
            dates.add(day)
            pairs.add((warehouse, product))
            rows.append((day, warehouse, product))

    if not rows:
        raise ValueError("File nguon khong co du lieu.")

    # Tao muc nhu cau rieng cho tung san pham.
    products = sorted({product for _, _, product in rows})
    product_base = {
        product: rng.uniform(8, 22)
        for product in products
    }

    # Tao he so rieng cho tung cap kho-san pham.
    pair_factor = {
        pair: rng.uniform(0.90, 1.10)
        for pair in pairs
    }

    # Giu nguyen tap ngay, kho va san pham tu file nguon.
    output_rows = []
    demand_values = []

    for day, warehouse, product in sorted(rows):
        day_of_year = day.timetuple().tm_yday

        # Chu ky mua sam theo mua trong nam.
        seasonal_factor = (
            1.0
            + 0.15 * math.cos(
                2 * math.pi * (day_of_year - 330) / 365.25
            )
        )

        # Dieu chinh nhe theo thang.
        month_factor = {
            1: 1.08,
            2: 0.92,
            3: 0.98,
            4: 1.00,
            5: 1.02,
            6: 1.00,
            7: 0.98,
            8: 1.00,
            9: 1.03,
            10: 1.06,
            11: 1.10,
            12: 1.18,
        }[day.month]

        expected = (
            product_base[product]
            * WAREHOUSE_FACTORS.get(warehouse, 1.0)
            * pair_factor[(warehouse, product)]
            * WEEKDAY_FACTORS[day.weekday()]
            * seasonal_factor
            * month_factor
        )

        # Bien dong tu nhien quanh muc nhu cau ky vong.
        noisy_demand = expected * rng.lognormvariate(0, 0.18)

        # Mot so ngay khong phat sinh nhu cau.
        if rng.random() < 0.10:
            demand = 0
        else:
            # Mot so it ngay co nhu cau tang dot bien.
            if rng.random() < 0.02:
                noisy_demand *= rng.uniform(1.5, 2.2)

            demand = max(0, round(noisy_demand))

        output_rows.append({
            "ngay": day.isoformat(),
            "ma_kho": warehouse,
            "ma_sp": product,
            "nhu_cau_xuat": demand,
        })
        demand_values.append(demand)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    with OUTPUT.open("w", encoding="utf-8-sig", newline="") as f:
        fields = ["ngay", "ma_kho", "ma_sp", "nhu_cau_xuat"]
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(output_rows)

    zero_count = sum(value == 0 for value in demand_values)

    print("DA TAO DU LIEU MO PHONG")
    print(f"So dong: {len(output_rows)}")
    print(f"So ngay: {len(dates)}")
    print(f"So cap kho-san pham: {len(pairs)}")
    print(f"Nhu cau trung binh: {sum(demand_values) / len(demand_values):.2f}")
    print(f"So dong nhu cau bang 0: {zero_count}")
    print(f"Ty le bang 0: {zero_count / len(demand_values) * 100:.2f}%")
    print(f"Gia tri nho nhat: {min(demand_values)}")
    print(f"Gia tri lon nhat: {max(demand_values)}")
    print(f"File dau ra: {OUTPUT}")


if __name__ == "__main__":
    main()
