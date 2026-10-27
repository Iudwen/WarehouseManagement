import csv
import json
import os
import sys
from collections import defaultdict
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

def get_data_lake_dir():
    if "DATA_LAKE_DIR" in os.environ:
        return Path(os.environ["DATA_LAKE_DIR"])
    if Path("/app/data_lake").is_dir():
        return Path("/app/data_lake")
    return Path(__file__).resolve().parents[2] / "data_lake"

BASE_DIR = get_data_lake_dir()
SILVER_XUAT_FILE = BASE_DIR / "silver" / "postgresql" / "central" / "xuat_hang_central.csv"
DATA_LAKE_GOLD_DIR = BASE_DIR / "gold"
DATA_LAKE_GOLD_FILE = DATA_LAKE_GOLD_DIR / "lich_su_xuat_hang_gold.csv"

REPO_ROOT = Path(__file__).resolve().parents[3]
DM_GOLD_DIR = REPO_ROOT / "data_mining" / "datasets" / "gold"
DM_GOLD_FILE = DM_GOLD_DIR / "lich_su_xuat_hang_gold.csv"

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
        num = Decimal(str(value).strip())
        if not num.is_finite():
            raise ValueError()
        return num
    except (InvalidOperation, ValueError):
        raise ValueError(f"Giá trị số không hợp lệ: {value!r}")

def load_gold(source_file=None):
    """
    Nạp dữ liệu tầng Gold từ Silver Data Lake:
    - Đọc dữ liệu chi tiết xuất kho Silver (xuat_hang_central.csv).
    - Tổng hợp sản lượng theo (ngay, ma_kho, ma_sp).
    - Bảo toàn toàn vẹn tổng sản lượng.
    - Data Lake Gold giữ toàn bộ giao dịch; Data Mining Gold chỉ giữ giao dịch đến hôm nay.
    """
    print("=" * 80)
    print("NẠP DỮ LIỆU TẦNG GOLD (DATA LAKE & DATA MINING)")
    print("=" * 80)

    DATA_LAKE_GOLD_DIR.mkdir(parents=True, exist_ok=True)
    DM_GOLD_DIR.mkdir(parents=True, exist_ok=True)

    src = Path(source_file) if source_file else SILVER_XUAT_FILE
    if not src.exists():
        raise FileNotFoundError(f"Không tìm thấy file Silver bắt buộc: {src}")

    groups = defaultdict(lambda: {
        "phieu_set": set(),
        "tong_so_luong_xuat": Decimal("0"),
        "tong_gia_tri_xuat": Decimal("0"),
    })

    total_rows = 0
    valid_rows = 0
    rejected_rows = 0

    with src.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        is_silver = "ngay_xuat" in (reader.fieldnames or [])
        required_fields = (
            {"ngay_xuat", "ma_kho", "ma_sp", "so_luong", "thanh_tien", "ma_phieu_xuat"}
            if is_silver else
            {"ngay", "ma_kho", "ma_sp", "tong_so_luong_xuat", "tong_gia_tri_xuat"}
        )
        missing_fields = required_fields - set(reader.fieldnames or [])
        if missing_fields:
            raise ValueError(
                f"Schema nguồn Gold không hợp lệ; thiếu cột: "
                + ", ".join(sorted(missing_fields))
            )

        for row in reader:
            total_rows += 1
            try:
                if is_silver:
                    # Đọc từ Silver xuat_hang_central.csv
                    raw_date = row["ngay_xuat"].strip()
                    day = raw_date[:10]
                    date.fromisoformat(day)
                    warehouse = row["ma_kho"].strip()
                    product = row["ma_sp"].strip()
                    qty = to_decimal(row["so_luong"])
                    price = to_decimal(row.get("thanh_tien", 0))
                    voucher = row.get("ma_phieu_xuat", "").strip()
                else:
                    # Đọc từ format raw gom nhóm cũ
                    day = row["ngay"].strip()
                    date.fromisoformat(day)
                    warehouse = row["ma_kho"].strip()
                    product = row["ma_sp"].strip()
                    qty = to_decimal(row["tong_so_luong_xuat"])
                    price = to_decimal(row["tong_gia_tri_xuat"])
                    voucher = row.get("so_phieu_xuat", "1").strip()

                if not warehouse or not product:
                    raise ValueError("Thiếu mã kho hoặc sản phẩm")
                if qty < 0 or price < 0:
                    raise ValueError("Số lượng hoặc đơn giá âm")

                key = (day, warehouse, product)
                groups[key]["tong_so_luong_xuat"] += qty
                groups[key]["tong_gia_tri_xuat"] += price
                if voucher:
                    groups[key]["phieu_set"].add(voucher)

                valid_rows += 1
            except (ValueError, KeyError, TypeError):
                rejected_rows += 1

    if rejected_rows:
        raise ValueError(
            f"Từ chối tạo Gold: {rejected_rows}/{total_rows} dòng lỗi trong "
            f"{src}. Gold hiện hữu được giữ nguyên."
        )
    if valid_rows == 0:
        raise ValueError(f"Không có bản ghi hợp lệ nào từ {src}. Giữ nguyên tập Gold hiện hữu.")

    all_groups = sorted(groups.items())
    observed_groups = [
        item for item in all_groups if date.fromisoformat(item[0][0]) <= date.today()
    ]
    if not observed_groups:
        raise ValueError(
            "Không có nhóm Gold đến ngày hiện tại cho Data Mining; "
            "giữ nguyên snapshot Gold hiện hữu."
        )

    def write_groups(target, grouped_rows):
        with target.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=OUTPUT_FIELDS)
            writer.writeheader()
            for (day, warehouse, product), val in grouped_rows:
                so_phieu = len(val["phieu_set"]) if val["phieu_set"] else 1
                writer.writerow({
                    "ngay": day,
                    "ma_kho": warehouse,
                    "ma_sp": product,
                    "so_phieu_xuat": str(so_phieu),
                    "tong_so_luong_xuat": format(val["tong_so_luong_xuat"], "f"),
                    "tong_gia_tri_xuat": format(val["tong_gia_tri_xuat"], ".2f"),
                })

    write_groups(DATA_LAKE_GOLD_FILE, all_groups)
    write_groups(DM_GOLD_FILE, observed_groups)

    total_qty = sum(v["tong_so_luong_xuat"] for v in groups.values())
    mining_total_qty = sum(
        values["tong_so_luong_xuat"] for _, values in observed_groups
    )
    print(f"[*] Nguồn: {src.name} ({total_rows} dòng)")
    print(f"[*] Bản ghi hợp lệ: {valid_rows}, Loại: {rejected_rows}")
    print(f"[*] Số nhóm Gold: {len(groups)}")
    print(f"[*] Tổng sản lượng bảo toàn: {total_qty}")
    print(
        f"[*] Data Mining: {len(observed_groups)} nhóm đến {date.today()}, "
        f"tổng lượng={mining_total_qty}"
    )
    print(f"[*] Đã xuất ra:")
    print(f"    1. Data Lake Gold: {DATA_LAKE_GOLD_FILE}")
    print(f"    2. Data Mining Gold: {DM_GOLD_FILE}")
    print("=" * 80)
    return {
        "total_rows": total_rows,
        "valid_rows": valid_rows,
        "groups": len(groups),
        "total_quantity": total_qty,
        "data_mining_groups": len(observed_groups),
        "data_mining_quantity": mining_total_qty,
    }

if __name__ == "__main__":
    load_gold()
