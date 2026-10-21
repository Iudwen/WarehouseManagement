
from pathlib import Path

import pandas as pd

ROOT = Path(r"D:\WarehouseManagement")
EXTERNAL = ROOT / "data_mining" / "datasets" / "external"
GOLD = ROOT / "data_mining" / "datasets" / "gold"

DEMAND_FILE = GOLD / "nhu_cau_xuat_hang_daily.csv"
WEATHER_FILE = EXTERNAL / "weather_daily.csv"
CALENDAR_FILE = EXTERNAL / "vietnam_calendar_daily.csv"
ECONOMIC_FILE = EXTERNAL / "vietnam_economic_yearly.csv"

OUTPUT_FILE = GOLD / "nhu_cau_xuat_hang_with_external.csv"
REPORT_FILE = GOLD / "external_integration_report.csv"


def normalize_warehouse(value):
    if pd.isna(value):
        return None

    value = str(value).strip().upper()

    if value.startswith("HCM") or value.startswith("HC"):
        return "HCM"
    if value.startswith("HN"):
        return "HN"
    if value.startswith("DN") or value.startswith("ĐN"):
        return "DN"

    return None


def read_csv_checked(path):
    if not path.exists():
        raise FileNotFoundError(f"Không tìm thấy file: {path}")

    return pd.read_csv(path)


def normalize_date(df, column):
    df[column] = pd.to_datetime(
        df[column], errors="coerce"
    ).dt.normalize()

    return df


def add_report(report_rows, df, column, source):
    if column not in df.columns:
        return

    missing = int(df[column].isna().sum())
    total = len(df)

    report_rows.append({
        "source": source,
        "column_name": column,
        "total_rows": total,
        "missing_count": missing,
        "missing_pct": round(
            missing / total * 100, 2
        ) if total else 0,
    })


def main():
    demand = read_csv_checked(DEMAND_FILE)
    weather = read_csv_checked(WEATHER_FILE)
    calendar = read_csv_checked(CALENDAR_FILE)
    economic = read_csv_checked(ECONOMIC_FILE)

    original_rows = len(demand)

    required_demand = [
        "ngay", "ma_kho", "ma_sp", "nhu_cau_xuat"
    ]

    missing_columns = [
        c for c in required_demand if c not in demand.columns
    ]

    if missing_columns:
        raise ValueError(
            f"Thiếu cột trong dữ liệu nhu cầu: {missing_columns}"
        )

    # --------------------------------------------------
    # 1. Chuẩn hóa ngày
    # --------------------------------------------------
    demand = normalize_date(demand, "ngay")
    weather = normalize_date(weather, "date")
    calendar = normalize_date(calendar, "date")

    demand = demand.dropna(subset=["ngay"]).copy()
    weather = weather.dropna(subset=["date"]).copy()
    calendar = calendar.dropna(subset=["date"]).copy()

    # --------------------------------------------------
    # 2. Chuẩn hóa mã khu vực kho và ghép thời tiết
    # --------------------------------------------------
    demand["_weather_location"] = (
        demand["ma_kho"].map(normalize_warehouse)
    )

    if "warehouse_code" not in weather.columns:
        raise ValueError(
            "weather_daily.csv không có cột warehouse_code"
        )

    weather["_weather_location"] = (
        weather["warehouse_code"].map(normalize_warehouse)
    )

    weather_columns = [
        "date",
        "_weather_location",
        "weather_code",
        "temp_max",
        "temp_min",
        "rain_probability_max",
        "temp_hourly_mean",
        "rain_probability_hourly_mean",
    ]

    weather_columns = [
        c for c in weather_columns if c in weather.columns
    ]

    weather = weather[weather_columns].copy()

    # Nếu có nhiều dòng cùng ngày/khu vực, không cho phép
    # merge làm nhân bản dữ liệu nhu cầu.
    weather = weather.drop_duplicates(
        subset=["date", "_weather_location"],
        keep="last",
    )

    weather = weather.rename(
        columns={"date": "_weather_date"}
    )

    demand = demand.merge(
        weather,
        left_on=["ngay", "_weather_location"],
        right_on=["_weather_date", "_weather_location"],
        how="left",
        validate="many_to_one",
    )

    demand = demand.drop(
        columns=["_weather_date", "_weather_location"],
        errors="ignore",
    )

    # --------------------------------------------------
    # 3. Ghép lịch ngày lễ theo ngày
    # --------------------------------------------------
    calendar_columns = [
        "date",
        "day_of_week",
        "day_of_week_num",
        "is_weekend",
        "is_public_holiday",
        "is_day_off",
        "is_compensatory",
        "is_makeup_workday",
        "holiday_name",
        "holiday_verification_status",
    ]

    calendar_columns = [
        c for c in calendar_columns if c in calendar.columns
    ]

    calendar = calendar[calendar_columns].copy()

    calendar = calendar.drop_duplicates(
        subset=["date"],
        keep="last",
    )

    calendar = calendar.rename(
        columns={
            c: f"calendar_{c}"
            for c in calendar.columns
            if c != "date"
        }
    )

    demand = demand.merge(
        calendar,
        left_on="ngay",
        right_on="date",
        how="left",
        validate="many_to_one",
    )

    demand = demand.drop(columns=["date"], errors="ignore")

    # --------------------------------------------------
    # 4. Ghép dữ liệu kinh tế theo năm
    # --------------------------------------------------
    if "year" not in economic.columns:
        raise ValueError(
            "vietnam_economic_yearly.csv không có cột year"
        )

    economic["year"] = pd.to_numeric(
        economic["year"], errors="coerce"
    )

    economic = economic.dropna(subset=["year"]).copy()
    economic["year"] = economic["year"].astype(int)
    economic = economic.drop_duplicates(
        subset=["year"], keep="last"
    )

    economic = economic.rename(
        columns={"year": "economic_year"}
    )

    demand["economic_year"] = demand["ngay"].dt.year.astype(int)

    demand = demand.merge(
        economic,
        on="economic_year",
        how="left",
        validate="many_to_one",
        suffixes=("", "_economic"),
    )

    demand = demand.drop(columns=["economic_year"])


    # --------------------------------------------------
    # 5. Kiểm tra số dòng và lưu kết quả
    # --------------------------------------------------
    if len(demand) != len(demand.drop_duplicates()):
        print(
            "CẢNH BÁO: Có dòng trùng hoàn toàn trong kết quả. "
            "Không tự động xóa để tránh mất dữ liệu."
        )

    if len(demand) != original_rows:
        raise RuntimeError(
            f"Số dòng đã thay đổi: "
            f"{original_rows} -> {len(demand)}. "
            "Dừng để tránh xuất dữ liệu sai."
        )

    GOLD.mkdir(parents=True, exist_ok=True)

    demand.to_csv(
        OUTPUT_FILE,
        index=False,
        encoding="utf-8-sig",
    )

    # --------------------------------------------------
    # 6. Báo cáo chất lượng dữ liệu
    # --------------------------------------------------
    report_rows = []

    weather_check = [
        "weather_code",
        "temp_max",
        "temp_min",
        "rain_probability_max",
        "temp_hourly_mean",
        "rain_probability_hourly_mean",
    ]

    calendar_check = [
        "calendar_is_weekend",
        "calendar_is_public_holiday",
        "calendar_is_day_off",
        "calendar_is_makeup_workday",
    ]

    economic_check = [
        "gdp_growth_pct",
        "gdp_usd",
        "inflation_pct",
        "exchange_rate_vnd_per_usd",
    ]

    for column in weather_check:
        add_report(report_rows, demand, column, "Weather")

    for column in calendar_check:
        add_report(report_rows, demand, column, "Holiday")

    for column in economic_check:
        add_report(report_rows, demand, column, "Economic")

    report = pd.DataFrame(report_rows)

    report.to_csv(
        REPORT_FILE,
        index=False,
        encoding="utf-8-sig",
    )

    print("\n===== TÍCH HỢP API HOÀN TẤT =====")
    print(f"Dòng nhu cầu đầu vào: {original_rows}")
    print(f"Dòng dữ liệu đầu ra: {len(demand)}")
    print(f"Số cột đầu ra: {len(demand.columns)}")
    print(f"File Gold: {OUTPUT_FILE}")
    print(f"Báo cáo chất lượng: {REPORT_FILE}")

    print("\n===== BÁO CÁO THIẾU DỮ LIỆU =====")
    print(report.to_string(index=False))

    print("\n===== KIỂM TRA TỶ GIÁ THEO NĂM =====")
    if "exchange_rate_vnd_per_usd" in demand.columns:
        print(
            demand.groupby(demand["ngay"].dt.year)[
                "exchange_rate_vnd_per_usd"
            ].agg(["count", "min", "max"]).to_string()
        )


if __name__ == "__main__":
    main()
