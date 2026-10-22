import os
import sys
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

import json
from pathlib import Path
from datetime import datetime

DATA_LAKE_DIR = Path(os.getenv("DATA_LAKE_DIR", Path(__file__).resolve().parents[2] / "data_lake"))
BRONZE_DIR = DATA_LAKE_DIR / "bronze" / "mongodb"
SILVER_DIR = DATA_LAKE_DIR / "silver" / "mongodb"


def parse_mongo_date(value):
    if isinstance(value, dict) and "$date" in value:
        return value["$date"]
    return value


def transform_outbound_events():
    input_file = BRONZE_DIR / "outbound_events.json"
    output_file = SILVER_DIR / "outbound_events.json"

    if not input_file.exists():
        raise FileNotFoundError(f"Không tìm thấy {input_file}")

    SILVER_DIR.mkdir(parents=True, exist_ok=True)

    with input_file.open("r", encoding="utf-8") as f:
        documents = json.load(f)

    result = []
    seen_event_ids = set()

    for doc in documents:
        event_id = doc.get("event_id")
        warehouse_code = doc.get("ma_kho")
        voucher_code = doc.get("ma_phieu_xuat")
        event_time = parse_mongo_date(doc.get("event_time"))
        items = doc.get("items", [])

        if not event_id or not warehouse_code or not voucher_code:
            continue

        if event_id in seen_event_ids:
            continue

        if not isinstance(items, list) or not items:
            continue

        try:
            datetime.fromisoformat(
                event_time.replace("Z", "+00:00")
            )
        except (ValueError, AttributeError):
            continue

        clean_items = []

        for item in items:
            product_code = item.get("ma_sp")
            quantity = item.get("quantity")

            if not product_code or not isinstance(quantity, (int, float)):
                continue

            if quantity <= 0:
                continue

            clean_items.append({
                "ma_sp": product_code,
                "ten_sp": item.get("name"),
                "so_luong": quantity,
                "don_gia_tham_khao": item.get("price")
            })

        if not clean_items:
            continue

        result.append({
            "event_id": event_id,
            "loai_su_kien_nguon": doc.get("event_type"),
            "loai_su_kien": "OUTBOUND_COMPLETED",
            "ma_kho": warehouse_code,
            "ma_phieu_xuat": voucher_code,
            "thoi_gian_xuat": event_time,
            "items": clean_items,
            "nguon_du_lieu": doc.get("source")
        })

        seen_event_ids.add(event_id)

    with output_file.open("w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"Số sự kiện nguồn: {len(documents)}")
    print(f"Số sự kiện Silver: {len(result)}")
    print(f"Số sự kiện bị loại: {len(documents) - len(result)}")
    print(f"File đầu ra: {output_file}")


if __name__ == "__main__":
    transform_outbound_events()
