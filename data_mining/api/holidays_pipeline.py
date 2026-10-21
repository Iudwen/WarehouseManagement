
import os

import logging
from pathlib import Path

import pandas as pd
import requests
from dotenv import load_dotenv
ROOT = Path(r"D:\WarehouseManagement")
OUT = ROOT / "data_mining" / "datasets" / "external"
load_dotenv(ROOT / ".env")
START_YEAR = 2023
END_YEAR = 2027
API_YEAR = 2026

API_URL = "https://api.api-ninjas.com/v2/holidays"
API_KEY = os.getenv("API_NINJAS_KEY", "").strip()

RAW_FILE = OUT / "holidays_api_raw.csv"
OVERRIDE_FILE = OUT / "official_holiday_overrides.csv"
EVENTS_FILE = OUT / "vietnam_holiday_events.csv"
CALENDAR_FILE = OUT / "vietnam_calendar_daily.csv"
LOG_FILE = OUT / "holidays_fetch_log.csv"

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s: %(message)s"
)

OVERRIDE_COLUMNS = [
    "date", "event_name", "record_type", "is_public_holiday",
    "is_day_off", "is_compensatory", "is_makeup_workday",
    "applicability", "source", "source_url",
    "verification_status", "notes"
]


def fetch_year(year):
    response = requests.get(
        API_URL,
        params={"country": "VN", "year": year},
        headers={"X-Api-Key": API_KEY},
        timeout=30
    )
    response.raise_for_status()

    data = response.json()

    if isinstance(data, dict):
        data = data.get("holidays", data.get("data", []))

    rows = []

    for item in data:
        date = pd.to_datetime(item.get("date"), errors="coerce")

        if pd.isna(date):
            continue

        rows.append({
            "date": date.strftime("%Y-%m-%d"),
            "event_name": item.get("name", "Unknown holiday"),
            "country": item.get("country", "Vietnam"),
            "iso": item.get("iso", "VN"),
            "year": year,
            "type": str(item.get("type", "")),
            "source": "API_NINJAS_V2"
        })

    return rows


def truthy(value):
    return str(value).strip().lower() in {
        "1", "true", "yes", "y", "x", "co", "có"
    }


def parse_optional_bool(value):
    if str(value).strip() == "":
        return None
    return int(truthy(value))


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    if not API_KEY:
        raise RuntimeError(
            'Chưa có API key. Chạy trong PowerShell: '
            '$env:API_NINJAS_KEY="API_KEY_CUA_BAN"'
        )

    if not OVERRIDE_FILE.exists():
        pd.DataFrame(columns=OVERRIDE_COLUMNS).to_csv(
            OVERRIDE_FILE,
            index=False,
            encoding="utf-8-sig"
        )

    # Chỉ gọi API cho năm 2026
    logs = []
    api_rows = []

    try:
        api_rows = fetch_year(API_YEAR)

        logs.append({
            "year": API_YEAR,
            "status": "SUCCESS",
            "records": len(api_rows),
            "error": ""
        })

        logging.info(
            "%s: lấy được %s bản ghi",
            API_YEAR,
            len(api_rows)
        )

    except Exception as exc:
        logs.append({
            "year": API_YEAR,
            "status": "ERROR",
            "records": 0,
            "error": str(exc)
        })

        logging.error("API năm %s thất bại: %s", API_YEAR, exc)

    api_df = pd.DataFrame(
        api_rows,
        columns=[
            "date", "event_name", "country", "iso",
            "year", "type", "source"
        ]
    )

    api_df.to_csv(
        RAW_FILE,
        index=False,
        encoding="utf-8-sig"
    )

    pd.DataFrame(logs).to_csv(
        LOG_FILE,
        index=False,
        encoding="utf-8-sig"
    )

    # Đọc dữ liệu ngày lễ bổ sung
    overrides = pd.read_csv(
        OVERRIDE_FILE,
        dtype=str
    ).fillna("")

    for column in OVERRIDE_COLUMNS:
        if column not in overrides.columns:
            overrides[column] = ""

    events = []

    # Chuẩn hóa dữ liệu API
    for _, row in api_df.iterrows():
        events.append({
            "date": row["date"],
            "event_name": row["event_name"],
            "record_type": "API_HOLIDAY",
            "is_public_holiday": 1,
            "is_day_off": "",
            "is_compensatory": 0,
            "is_makeup_workday": 0,
            "applicability": "VERIFY_OFFICIAL_SCHEDULE",
            "source": "API_NINJAS_V2",
            "source_url": "https://api-ninjas.com/api/holidays",
            "verification_status": "API_UNVERIFIED",
            "notes": "Can doi chieu lich nghi chinh thuc."
        })

    # Ghép CSV bổ sung
    for _, row in overrides.iterrows():
        if not row["date"].strip():
            continue

        events.append({
            "date": row["date"],
            "event_name": row["event_name"],
            "record_type": row["record_type"] or "MANUAL_OVERRIDE",
            "is_public_holiday": int(
                truthy(row["is_public_holiday"])
            ),
            "is_day_off": (
                parse_optional_bool(row["is_day_off"])
                if parse_optional_bool(row["is_day_off"]) is not None
                else ""
            ),
            "is_compensatory": int(
                truthy(row["is_compensatory"])
            ),
            "is_makeup_workday": int(
                truthy(row["is_makeup_workday"])
            ),
            "applicability": row["applicability"],
            "source": row["source"],
            "source_url": row["source_url"],
            "verification_status": (
                row["verification_status"] or "MANUAL_REVIEW"
            ),
            "notes": row["notes"]
        })

    event_df = pd.DataFrame(events, columns=OVERRIDE_COLUMNS)

    if not event_df.empty:
        event_df = event_df.drop_duplicates(
            subset=["date", "event_name", "record_type", "source"]
        )

    event_df.to_csv(
        EVENTS_FILE,
        index=False,
        encoding="utf-8-sig"
    )

    # Tạo lịch đầy đủ từng ngày từ 2023 đến 2027
    dates = pd.date_range(
        f"{START_YEAR}-01-01",
        f"{END_YEAR}-12-31",
        freq="D"
    )

    calendar = pd.DataFrame({"date": dates})
    calendar["day_of_week"] = calendar["date"].dt.day_name()
    calendar["day_of_week_num"] = calendar["date"].dt.dayofweek
    calendar["year"] = calendar["date"].dt.year
    calendar["month"] = calendar["date"].dt.month
    calendar["day"] = calendar["date"].dt.day
    calendar["quarter"] = calendar["date"].dt.quarter

    calendar["is_weekend"] = (
        calendar["day_of_week_num"].isin([5, 6]).astype(int)
    )

    calendar["is_public_holiday"] = 0
    calendar["is_day_off"] = calendar["is_weekend"]
    calendar["is_compensatory"] = 0
    calendar["is_makeup_workday"] = 0
    calendar["holiday_name"] = ""
    calendar["holiday_verification_status"] = ""

    if not event_df.empty:
        event_df["date"] = pd.to_datetime(
            event_df["date"],
            errors="coerce"
        )

        event_df = event_df[event_df["date"].notna()]

        for date, group in event_df.groupby("date"):
            mask = calendar["date"].eq(date)

            if not mask.any():
                continue

            for column in [
                "is_public_holiday",
                "is_compensatory",
                "is_makeup_workday"
            ]:
                values = [
                    int(truthy(value))
                    for value in group[column]
                    if str(value).strip() != ""
                ]

                if values:
                    calendar.loc[mask, column] = max(values)

            day_off_values = [
                truthy(value)
                for value in group["is_day_off"]
                if str(value).strip() != ""
            ]

            if day_off_values:
                calendar.loc[mask, "is_day_off"] = int(
                    any(day_off_values)
                )

            if any(
                truthy(value)
                for value in group["is_makeup_workday"]
            ):
                calendar.loc[mask, "is_day_off"] = 0

            names = sorted(set(
                str(value).strip()
                for value in group["event_name"]
                if str(value).strip()
            ))

            calendar.loc[mask, "holiday_name"] = "; ".join(names)

            statuses = sorted(set(
                str(value).strip()
                for value in group["verification_status"]
                if str(value).strip()
            ))

            calendar.loc[
                mask, "holiday_verification_status"
            ] = "; ".join(statuses)

    calendar["date"] = calendar["date"].dt.strftime("%Y-%m-%d")

    calendar.to_csv(
        CALENDAR_FILE,
        index=False,
        encoding="utf-8-sig"
    )

    print("\nHoan thanh pipeline.")
    print(f"API raw: {RAW_FILE}")
    print(f"CSV bo sung ngay nghi: {OVERRIDE_FILE}")
    print(f"Danh sach ngay le: {EVENTS_FILE}")
    print(f"Lich theo ngay: {CALENDAR_FILE}")
    print(f"Log API: {LOG_FILE}")
    print(f"So ngay trong lich: {len(calendar)}")


if __name__ == "__main__":
    main()
