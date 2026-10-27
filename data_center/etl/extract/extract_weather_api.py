import csv
import sys
import time
from datetime import date
from pathlib import Path
import requests

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

WAREHOUSE_LOCATIONS = {
    "HN01": {"name": "Hanoi", "latitude": 21.0285, "longitude": 105.8542},
    "DN01": {"name": "Da Nang", "latitude": 16.0544, "longitude": 108.2022},
    "HCM01": {"name": "Ho Chi Minh", "latitude": 10.8231, "longitude": 106.6297},
}

BASE_DIR = Path(__file__).resolve().parents[3]
DEMAND_FILE = (
    BASE_DIR
    / "data_mining"
    / "datasets"
    / "gold"
    / "nhu_cau_xuat_hang_daily.csv"
)
OUTPUT_FILE = BASE_DIR / "data_mining" / "datasets" / "external" / "thoi_tiet_daily.csv"
OUTPUT_FIELDS = ["ngay", "ma_kho", "nhiet_do_tb", "luong_mua"]


def get_demand_date_range():
    if not DEMAND_FILE.exists():
        raise FileNotFoundError(
            f"Không tìm thấy dữ liệu nhu cầu để xác định dải ngày: {DEMAND_FILE}"
        )

    with DEMAND_FILE.open("r", encoding="utf-8-sig", newline="") as file:
        dates = [
            date.fromisoformat(row["ngay"].strip())
            for row in csv.DictReader(file)
            if row.get("ngay", "").strip()
        ]

    if not dates:
        raise ValueError(f"Không có ngày hợp lệ trong dữ liệu: {DEMAND_FILE}")
    return min(dates).isoformat(), max(dates).isoformat()


def fetch_weather_for_location(
    warehouse_id,
    info,
    retry_delay=2,
    max_retries=3,
    start_date=None,
    end_date=None,
):
    if start_date is None or end_date is None:
        source_start, source_end = get_demand_date_range()
        start_date = start_date or source_start
        end_date = end_date or source_end

    url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude": info["latitude"],
        "longitude": info["longitude"],
        "start_date": start_date,
        "end_date": end_date,
        "daily": "temperature_2m_mean,precipitation_sum",
        "timezone": "Asia/Bangkok",
    }

    for attempt in range(1, max_retries + 1):
        try:
            print(f"[{warehouse_id}] Đang tải dữ liệu thời tiết ({info['name']})... (Lần thử {attempt})")
            response = requests.get(url, params=params, timeout=15)
            response.raise_for_status()
            data = response.json()

            daily = data.get("daily")
            if not isinstance(daily, dict) or not daily.get("time"):
                raise ValueError("Phản hồi JSON thiếu trường 'daily' hoặc 'time' bị rỗng")

            times = daily.get("time", [])
            temps = daily.get("temperature_2m_mean", [])
            precips = daily.get("precipitation_sum", [])

            records = []
            for t, temp, precip in zip(times, temps, precips):
                records.append({
                    "ngay": t,
                    "ma_kho": warehouse_id,
                    "nhiet_do_tb": "" if temp is None else f"{temp:.1f}",
                    "luong_mua": "" if precip is None else f"{precip:.1f}",
                })
            print(f"[{warehouse_id}] Thành công: {len(records)} ngày")
            return records
        except Exception as exc:
            print(f"[{warehouse_id}] Lỗi (lần {attempt}/{max_retries}): {exc}")
            if retry_delay > 0:
                time.sleep(retry_delay)

    raise RuntimeError(f"Không thể tải thời tiết cho {warehouse_id} sau {max_retries} lần thử.")


def main():
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    all_records = []
    start_date, end_date = get_demand_date_range()

    for warehouse_id, info in WAREHOUSE_LOCATIONS.items():
        records = fetch_weather_for_location(
            warehouse_id,
            info,
            start_date=start_date,
            end_date=end_date,
        )
        all_records.extend(records)

    with OUTPUT_FILE.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(all_records)

    print(f"\n[HOÀN TẤT] Đã lưu {len(all_records)} dòng thời tiết vào: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
