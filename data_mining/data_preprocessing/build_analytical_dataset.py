import csv
import sys
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parents[2]
DEMAND_FILE = BASE_DIR / "data_mining" / "datasets" / "gold" / "nhu_cau_xuat_hang_daily.csv"
WEATHER_FILE = BASE_DIR / "data_mining" / "datasets" / "external" / "thoi_tiet_daily.csv"
CALENDAR_FILE = BASE_DIR / "data_mining" / "datasets" / "external" / "lich_daily.csv"

OUTPUT_FILE = BASE_DIR / "data_mining" / "datasets" / "gold" / "analytical_dataset.csv"
DATA_LAKE_GOLD_FILE = BASE_DIR / "data_center" / "data_lake" / "gold" / "analytical_dataset.csv"

OUTPUT_FIELDS = [
    "ngay",
    "ma_kho",
    "ma_sp",
    "nhu_cau_xuat",
    "nhiet_do_tb",
    "luong_mua",
    "thu_trong_tuan",
    "ten_thu",
    "la_cuoi_tuan",
    "la_ngay_le",
    "ten_ngay_le",
]


def load_weather():
    if not WEATHER_FILE.exists():
        raise FileNotFoundError(f"Không tìm thấy file thời tiết: {WEATHER_FILE}")

    weather_map = {}
    with WEATHER_FILE.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = (row["ngay"].strip(), row["ma_kho"].strip())
            weather_map[key] = {
                "nhiet_do_tb": row["nhiet_do_tb"].strip(),
                "luong_mua": row["luong_mua"].strip(),
            }
    return weather_map


def load_calendar():
    if not CALENDAR_FILE.exists():
        raise FileNotFoundError(f"Không tìm thấy file lịch: {CALENDAR_FILE}")

    calendar_map = {}
    with CALENDAR_FILE.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = row["ngay"].strip()
            calendar_map[key] = {
                "thu_trong_tuan": row["thu_trong_tuan"].strip(),
                "ten_thu": row["ten_thu"].strip(),
                "la_cuoi_tuan": row["la_cuoi_tuan"].strip(),
                "la_ngay_le": row["la_ngay_le"].strip(),
                "ten_ngay_le": row["ten_ngay_le"].strip(),
            }
    return calendar_map


def build_analytical_dataset():
    if not DEMAND_FILE.exists():
        raise FileNotFoundError(f"Không tìm thấy file nhu cầu xuất kho: {DEMAND_FILE}")

    weather_map = load_weather()
    calendar_map = load_calendar()

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    total_rows = 0
    missing_weather = 0
    missing_calendar = 0
    seen_keys = set()
    duplicate_keys = 0

    integrated_records = []

    with DEMAND_FILE.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            total_rows += 1
            day = row["ngay"].strip()
            warehouse = row["ma_kho"].strip()
            product = row["ma_sp"].strip()
            demand = row["nhu_cau_xuat"].strip()

            key = (day, warehouse, product)
            if key in seen_keys:
                duplicate_keys += 1
            else:
                seen_keys.add(key)

            # Ghép thời tiết theo (ngay, ma_kho)
            weather_info = weather_map.get((day, warehouse))
            if weather_info is None:
                missing_weather += 1
                temp = ""
                precip = ""
            else:
                temp = weather_info["nhiet_do_tb"]
                precip = weather_info["luong_mua"]

            # Ghép lịch lễ theo ngay
            calendar_info = calendar_map.get(day)
            if calendar_info is None:
                missing_calendar += 1
                weekday = ""
                weekday_name = ""
                is_weekend = ""
                is_holiday = ""
                holiday_name = ""
            else:
                weekday = calendar_info["thu_trong_tuan"]
                weekday_name = calendar_info["ten_thu"]
                is_weekend = calendar_info["la_cuoi_tuan"]
                is_holiday = calendar_info["la_ngay_le"]
                holiday_name = calendar_info["ten_ngay_le"]

            integrated_records.append({
                "ngay": day,
                "ma_kho": warehouse,
                "ma_sp": product,
                "nhu_cau_xuat": demand,
                "nhiet_do_tb": temp,
                "luong_mua": precip,
                "thu_trong_tuan": weekday,
                "ten_thu": weekday_name,
                "la_cuoi_tuan": is_weekend,
                "la_ngay_le": is_holiday,
                "ten_ngay_le": holiday_name,
            })

    DATA_LAKE_GOLD_FILE.parent.mkdir(parents=True, exist_ok=True)
    for target in [OUTPUT_FILE, DATA_LAKE_GOLD_FILE]:
        with target.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=OUTPUT_FIELDS)
            writer.writeheader()
            writer.writerows(integrated_records)

    print("===== TỔNG KẾT TÍCH HỢP ANALYTICAL DATASET =====")
    print(f"Tổng số dòng xuất ra: {len(integrated_records)}")
    print(f"Số khóa trùng: {duplicate_keys}")
    print(f"Số bản ghi thiếu thời tiết: {missing_weather}")
    print(f"Số bản ghi thiếu lịch: {missing_calendar}")
    print(f"Đường dẫn file: {OUTPUT_FILE}")


if __name__ == "__main__":
    build_analytical_dataset()
