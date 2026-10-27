
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


def read_csv_checked(path):
    if not path.exists():
        raise FileNotFoundError(f"Không tìm thấy file: {path}")

    return pd.read_csv(path)


def normalize_date(df, column):
    df[column] = pd.to_datetime(
        df[column], errors="coerce"
    ).dt.normalize()

    return df


def normalize_warehouse(value):
    if pd.isna(value):
        return None

    value = str(value).strip().upper()

    if value.startswith(("HCM", "HC")):
        return "HCM"

    if value.startswith("HN"):
        return "HN"

    if value.startswith(("DN", "ĐN")):
        return "DN"

    return None


def add_report(report_rows, df, columns, source):
    for column in columns:
        if column not in df.columns:
            report_rows.append({
                "source": source,
                "column_name": column,
                "total_rows": len(df),
                "missing_count": len(df),
                "missing_pct": 100.0 if len(df) else 0.0,
                "note": "Cột không tồn tại",
            })
            continue

        missing = int(df[column].isna().sum())
        total = len(df)

        report_rows.append({
            "source": source,
            "column_name": column,
            "total_rows": total,
            "missing_count": missing,
            "missing_pct": round(
                missing / total * 100, 2
            ) if total else 0.0,
            "note": "",
        })


def main():
    demand = read_csv_checked(DEMAND_FILE)
    weather = read_csv_checked(WEATHER_FILE)
    calendar = read_csv_checked(CALENDAR_FILE)
    economic = read_csv_checked(ECONOMIC_FILE)

    original_rows = len(demand)

    required_demand = [
        "ngay",
        "ma_kho",
        "ma_sp",
        "nhu_cau_xuat",
    ]

    missing_columns = [
        column for column in required_demand
        if column not in demand.columns
    ]

    if missing_columns:
        raise ValueError(
            f"Thiếu cột trong dữ liệu nhu cầu: {missing_columns}"
        )

    demand = demand.copy()

    # 1. Chuẩn hóa ngày
    demand = normalize_date(demand, "ngay")
    weather = normalize_date(weather, "date")
    calendar = normalize_date(calendar, "date")

    demand = demand.dropna(subset=["ngay"]).copy()
    weather = weather.dropna(subset=["date"]).copy()
    calendar = calendar.dropna(subset=["date"]).copy()

    if demand.empty:
        raise ValueError("Dữ liệu nhu cầu không có ngày hợp lệ.")

    # 2. Chuẩn hóa mã khu vực và ghép thời tiết
    if "warehouse_code" not in weather.columns:
        raise ValueError(
            "weather_daily.csv không có cột warehouse_code."
        )

    demand["_weather_location"] = (
        demand["ma_kho"].map(normalize_warehouse)
    )

    weather["_weather_location"] = (
        weather["warehouse_code"].map(normalize_warehouse)
    )

    weather_value_columns = [
        "weather_code",
        "temp_max",
        "temp_min",
        "temp_mean",
        "precipitation_sum",
        "precipitation_hours",
        "wind_speed_max",
    ]

    missing_weather_columns = [
        column for column in weather_value_columns
        if column not in weather.columns
    ]

    if missing_weather_columns:
        raise ValueError(
            "Thiếu cột thời tiết: "
            f"{missing_weather_columns}. "
            "Hãy kiểm tra weather_daily.csv."
        )

    weather = weather[
        ["date", "_weather_location"] + weather_value_columns
    ].copy()

    weather = weather.dropna(
        subset=["date", "_weather_location"]
    )

    weather_duplicates = weather.duplicated(
        subset=["date", "_weather_location"],
        keep=False,
    )

    if weather_duplicates.any():
        raise ValueError(
            "weather_daily.csv có nhiều dòng cùng ngày và khu vực kho. "
            "Hãy kiểm tra dữ liệu trước khi ghép."
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

    # 3. Ghép lịch ngày lễ
    calendar_columns = [
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

    missing_calendar_columns = [
        column for column in calendar_columns
        if column not in calendar.columns
    ]

    if missing_calendar_columns:
        print(
            "Cảnh báo: thiếu các cột lịch: "
            f"{missing_calendar_columns}"
        )

    calendar_value_columns = [
        column for column in calendar_columns
        if column in calendar.columns
    ]

    calendar = calendar[
        ["date"] + calendar_value_columns
    ].copy()

    if calendar["date"].duplicated().any():
        raise ValueError(
            "vietnam_calendar_daily.csv có nhiều dòng cùng ngày."
        )

    calendar = calendar.rename(
        columns={
            column: f"calendar_{column}"
            for column in calendar_value_columns
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

    # 4. Ghép dữ liệu kinh tế theo năm
    if "year" not in economic.columns:
        raise ValueError(
            "vietnam_economic_yearly.csv không có cột year."
        )

    economic = economic.copy()

    economic["year"] = pd.to_numeric(
        economic["year"], errors="coerce"
    )

    economic = economic.dropna(subset=["year"]).copy()
    economic["year"] = economic["year"].astype(int)

    if economic["year"].duplicated().any():
        raise ValueError(
            "vietnam_economic_yearly.csv có nhiều dòng cùng năm."
        )

    economic_columns = [
        "exchange_rate_vnd_per_usd",
        "gdp_growth_pct",
        "gdp_usd",
        "inflation_pct",
    ]

    economic_columns = [
        column for column in economic_columns
        if column in economic.columns
    ]

    economic = economic.rename(
        columns={"year": "economic_year"}
    )

    demand["economic_year"] = demand["ngay"].dt.year.astype(int)

    demand = demand.merge(
        economic[["economic_year"] + economic_columns],
        on="economic_year",
        how="left",
        validate="many_to_one",
    )

    demand = demand.drop(columns=["economic_year"])

    # 5. Kiểm tra số dòng trước khi lưu
    if len(demand) != original_rows:
        raise RuntimeError(
            f"Số dòng thay đổi từ {original_rows} "
            f"thành {len(demand)}. Không lưu kết quả."
        )

    # 6. Báo cáo thiếu dữ liệu
    report_rows = []

    weather_check = weather_value_columns

    calendar_check = [
        "calendar_is_weekend",
        "calendar_is_public_holiday",
        "calendar_is_day_off",
        "calendar_is_compensatory",
        "calendar_is_makeup_workday",
        "calendar_holiday_verification_status",
    ]

    economic_check = [
        "gdp_growth_pct",
        "gdp_usd",
        "inflation_pct",
        "exchange_rate_vnd_per_usd",
    ]

    add_report(
        report_rows, demand, weather_check, "Weather"
    )

    add_report(
        report_rows, demand, calendar_check, "Holiday"
    )

    add_report(
        report_rows, demand, economic_check, "Economic"
    )

    report = pd.DataFrame(report_rows)

    # 7. Lưu kết quả
    GOLD.mkdir(parents=True, exist_ok=True)

    demand.to_csv(
        OUTPUT_FILE,
        index=False,
        encoding="utf-8-sig",
    )

    report.to_csv(
        REPORT_FILE,
        index=False,
        encoding="utf-8-sig",
    )

    # 8. In kết quả kiểm tra
    print("\n===== TÍCH HỢP DỮ LIỆU HOÀN TẤT =====")
    print(f"Số dòng đầu vào: {original_rows}")
    print(f"Số dòng đầu ra: {len(demand)}")
    print(f"Số cột đầu ra: {len(demand.columns)}")
    print(f"File Gold: {OUTPUT_FILE}")
    print(f"Báo cáo chất lượng: {REPORT_FILE}")

    print("\n===== BÁO CÁO THIẾU DỮ LIỆU =====")
    print(report.to_string(index=False))

    print("\n===== KIỂM TRA THỜI TIẾT THEO NĂM =====")
    weather_summary_columns = [
        column for column in weather_value_columns
        if column in demand.columns
    ]

    print(
        demand.groupby(demand["ngay"].dt.year)[
            weather_summary_columns
        ].agg(["count", "min", "max"]).to_string()
    )

    print("\n===== KIỂM TRA KINH TẾ THEO NĂM =====")
    if "exchange_rate_vnd_per_usd" in demand.columns:
        economic_summary_columns = [
            column for column in economic_check
            if column in demand.columns
        ]

        print(
            demand.groupby(demand["ngay"].dt.year)[
                economic_summary_columns
            ].agg(["count", "min", "max"]).to_string()
        )

    print("\n===== KIỂM TRA KHOẢNG NGÀY =====")
    print(f"Từ ngày: {demand['ngay'].min().date()}")
    print(f"Đến ngày: {demand['ngay'].max().date()}")

    print("\n===== KIỂM TRA KHU VỰC KHO =====")
    print(
        demand["ma_kho"].map(normalize_warehouse)
        .value_counts(dropna=False)
        .to_string()
    )


if __name__ == "__main__":
    main()
