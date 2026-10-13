
import csv
from collections import defaultdict
from datetime import date
from decimal import Decimal
from pathlib import Path

FILE = Path("data_mining/datasets/gold/lich_su_xuat_hang_gold.csv")


def main():
    daily_total = defaultdict(Decimal)
    warehouse_total = defaultdict(Decimal)
    product_total = defaultdict(Decimal)
    warehouse_product_total = defaultdict(Decimal)
    dates = set()
    warehouses = set()
    products = set()
    rows = 0
    total_quantity = Decimal("0")
    total_value = Decimal("0")

    with FILE.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)

        for row in reader:
            day = date.fromisoformat(row["ngay"])
            warehouse = row["ma_kho"]
            product = row["ma_sp"]
            quantity = Decimal(row["tong_so_luong_xuat"])
            value = Decimal(row["tong_gia_tri_xuat"])

            daily_total[day] += quantity
            warehouse_total[warehouse] += quantity
            product_total[product] += quantity
            warehouse_product_total[(warehouse, product)] += quantity

            dates.add(day)
            warehouses.add(warehouse)
            products.add(product)
            total_quantity += quantity
            total_value += value
            rows += 1

    print("===== TONG QUAN DU LIEU =====")
    print(f"So dong: {rows}")
    print(f"So ngay co du lieu: {len(dates)}")
    print(f"So kho: {len(warehouses)}")
    print(f"So san pham: {len(products)}")
    print(f"Tong luong xuat: {total_quantity}")
    print(f"Tong gia tri xuat: {total_value:,.2f}")

    print("\n===== LUONG XUAT THEO KHO =====")
    for warehouse, quantity in sorted(
        warehouse_total.items(), key=lambda x: x[1], reverse=True
    ):
        print(f"{warehouse}: {quantity}")

    print("\n===== TOP 10 SAN PHAM XUAT NHIEU NHAT =====")
    for product, quantity in sorted(
        product_total.items(), key=lambda x: x[1], reverse=True
    )[:10]:
        print(f"{product}: {quantity}")

    print("\n===== 10 NGAY XUAT NHIEU NHAT =====")
    for day, quantity in sorted(
        daily_total.items(), key=lambda x: x[1], reverse=True
    )[:10]:
        print(f"{day}: {quantity}")

    print("\n===== TOP 10 CAP KHO - SAN PHAM =====")
    for (warehouse, product), quantity in sorted(
        warehouse_product_total.items(),
        key=lambda x: x[1],
        reverse=True
    )[:10]:
        print(f"{warehouse} - {product}: {quantity}")

    print("\n===== KIEM TRA KHOANG THOI GIAN =====")
    print(f"Tu ngay: {min(dates)}")
    print(f"Den ngay: {max(dates)}")


if __name__ == "__main__":
    main()