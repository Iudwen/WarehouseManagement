
import json
from datetime import datetime
from pathlib import Path

BRONZE_FILE = Path("/app/data_lake/bronze/mongodb/inventory_events.json")
SILVER_DIR = Path("/app/data_lake/silver/mongodb")
SILVER_FILE = SILVER_DIR / "inventory_events.json"


def parse_mongo_date(value):
    if isinstance(value, dict):
        return value.get("$date")
    return value


def clean_inventory():
    if not BRONZE_FILE.exists():
        raise FileNotFoundError(f"Không tìm thấy file: {BRONZE_FILE}")

    with BRONZE_FILE.open("r", encoding="utf-8") as file:
        documents = json.load(file)

    SILVER_DIR.mkdir(parents=True, exist_ok=True)

    result = []
    seen_ids = set()
    rejected = 0

    for doc in documents:
        event_id = doc.get("event_id")
        warehouse_code = doc.get("ma_kho")
        product_code = doc.get("ma_sp")
        quantity = doc.get("quantity", {})
        product = doc.get("product", {})
        event_time = parse_mongo_date(doc.get("event_time"))

        if not event_id or not warehouse_code or not product_code:
            rejected += 1
            continue

        if event_id in seen_ids:
            rejected += 1
            continue

        if not isinstance(quantity, dict):
            rejected += 1
            continue

        before = quantity.get("before")
        change = quantity.get("change")
        after = quantity.get("after")

        if not all(isinstance(v, (int, float)) and not isinstance(v, bool)
                   for v in (before, change, after)):
            rejected += 1
            continue

        if before < 0 or after < 0 or before + change != after:
            rejected += 1
            continue

        if not isinstance(event_time, str):
            rejected += 1
            continue

        try:
            datetime.fromisoformat(event_time.replace("Z", "+00:00"))
        except ValueError:
            rejected += 1
            continue

        result.append({
            "event_id": event_id,
            "loai_su_kien": "INVENTORY_UPDATED",
            "ma_kho": warehouse_code,
            "ma_sp": product_code,
            "ten_sp": product.get("name"),
            "danh_muc": product.get("category"),
            "so_luong_truoc": before,
            "so_luong_thay_doi": change,
            "so_luong_sau": after,
            "ly_do": doc.get("reason"),
            "thoi_gian_su_kien": event_time,
            "nguon_du_lieu": doc.get("source")
        })

        seen_ids.add(event_id)

    with SILVER_FILE.open("w", encoding="utf-8") as file:
        json.dump(result, file, ensure_ascii=False, indent=2)

    print(f"Số sự kiện nguồn: {len(documents)}")
    print(f"Số sự kiện Silver: {len(result)}")
    print(f"Số sự kiện bị loại: {rejected}")
    print(f"File đầu ra: {SILVER_FILE}")


if __name__ == "__main__":
    clean_inventory()
