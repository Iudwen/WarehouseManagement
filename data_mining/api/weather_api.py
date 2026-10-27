
from pathlib import Path
import requests
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "datasets"
EXTERNAL_DIR = DATA_DIR / "external"
GOLD_DIR = DATA_DIR / "gold"

EXTERNAL_DIR.mkdir(parents=True, exist_ok=True)

API_URL = "https://archive-api.open-meteo.com/v1/archive"

WAREHOUSES = {
    "HN": {"latitude": 21.0285, "longitude": 105.8542},
    "DN": {"latitude": 16.0544, "longitude": 108.2022},
    "HCM": {"latitude": 10.823, "longitude": 106.6296},
}

def fetch_weather(warehouse, coordinates, start_date, end_date):
    params = {
        "latitude": coordinates["latitude"],
        "longitude": coordinates["longitude"],
        "start_date": start_date,
        "end_date": end_date,
        "daily": (
            "weather_code,temperature_2m_max,temperature_2m_min,"
            "temperature_2m_mean,precipitation_sum,precipitation_hours,"
            "wind_speed_10m_max"
        ),
        "timezone": "Asia/Ho_Chi_Minh",
    }

    response = requests.get(API_URL, params=params, timeout=120)
    response.raise_for_status()

    data = response.json()
    daily = pd.DataFrame(data["daily"])
    daily = daily.rename(columns={
        "time": "date",
        "temperature_2m_max": "temp_max",
        "temperature_2m_min": "temp_min",
        "temperature_2m_mean": "temp_mean",
        "precipitation_sum": "precipitation_sum",
        "precipitation_hours": "precipitation_hours",
        "wind_speed_10m_max": "wind_speed_max",
    })

    daily["date"] = pd.to_datetime(daily["date"]).dt.strftime("%Y-%m-%d")
    daily["warehouse_code"] = warehouse

    return daily

def main():
    demand_file = GOLD_DIR / "nhu_cau_xuat_hang_daily.csv"

    if not demand_file.exists():
        raise FileNotFoundError(f"Không tìm thấy: {demand_file}")

    demand = pd.read_csv(demand_file)
    demand["ngay"] = pd.to_datetime(demand["ngay"], errors="coerce")
    start_date = demand["ngay"].min().strftime("%Y-%m-%d")
    end_date = min(
        demand["ngay"].max().normalize(),
        pd.Timestamp.now().normalize() - pd.Timedelta(days=1)
    ).strftime("%Y-%m-%d")

    frames = []

    for warehouse, coordinates in WAREHOUSES.items():
        try:
            df = fetch_weather(
                warehouse, coordinates, start_date, end_date
            )
            frames.append(df)
            print(f"{warehouse}: lấy được {len(df)} ngày")
        except Exception as error:
            print(f"{warehouse}: lỗi - {error}")

    if not frames:
        raise RuntimeError("Không lấy được dữ liệu thời tiết.")

    result = pd.concat(frames, ignore_index=True)
    output_file = EXTERNAL_DIR / "weather_daily.csv"
    result.to_csv(output_file, index=False, encoding="utf-8-sig")

    print(f"\nĐã lưu: {output_file}")
    print(f"Số dòng: {len(result)}")
    print(f"Khoảng ngày: {start_date} đến {end_date}")
    print("\nSố giá trị thiếu:")
    print(result.isna().sum().to_string())
    print("\nDữ liệu mẫu:")
    print(result.head().to_string(index=False))

if __name__ == "__main__":
    main()
    