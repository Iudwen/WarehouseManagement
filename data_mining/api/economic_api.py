
import logging
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(r"D:\WarehouseManagement")
OUT = ROOT / "data_mining" / "datasets" / "external"

START_YEAR = 2020
END_YEAR = 2027

API_URL = "https://api.worldbank.org/v2/country/VNM/indicator"

INDICATORS = {
    "NY.GDP.MKTP.CD": "gdp_usd",
    "NY.GDP.MKTP.KD.ZG": "gdp_growth_pct",
    "FP.CPI.TOTL.ZG": "inflation_pct",
    "PA.NUS.FCRF": "exchange_rate_vnd_per_usd",
}

RAW_FILE = OUT / "economic_api_raw.csv"
WIDE_FILE = OUT / "vietnam_economic_yearly.csv"
LOG_FILE = OUT / "economic_fetch_log.csv"


def fetch_indicator(code, name):
    url = f"{API_URL}/{code}"
    params = {
        "format": "json",
        "date": f"{START_YEAR}:{END_YEAR}",
        "per_page": 100,
    }

    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()
    payload = response.json()

    if not isinstance(payload, list) or len(payload) < 2:
        raise ValueError(f"Phản hồi API không hợp lệ: {code}")

    records = []

    for item in payload[1] or []:
        records.append({
            "year": int(item["date"]),
            "indicator_code": code,
            "indicator_name": name,
            "value": item["value"],
            "unit": item.get("unit"),
            "source": "World Bank",
        })

    return records


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    all_records = []
    logs = []

    for code, name in INDICATORS.items():
        try:
            records = fetch_indicator(code, name)
            all_records.extend(records)

            logs.append({
                "indicator_code": code,
                "indicator_name": name,
                "status": "SUCCESS",
                "records": len(records),
                "error": "",
            })

            print(f"OK: {name} - {len(records)} bản ghi")

        except Exception as exc:
            logs.append({
                "indicator_code": code,
                "indicator_name": name,
                "status": "ERROR",
                "records": 0,
                "error": str(exc),
            })

            print(f"ERROR: {name} - {exc}")

    raw_df = pd.DataFrame(
        all_records,
        columns=[
            "year",
            "indicator_code",
            "indicator_name",
            "value",
            "unit",
            "source",
        ],
    )

    raw_df.to_csv(RAW_FILE, index=False, encoding="utf-8-sig")

    if not raw_df.empty:
        wide_df = raw_df.pivot_table(
            index="year",
            columns="indicator_name",
            values="value",
            aggfunc="first",
        ).reset_index()

        wide_df.columns.name = None
        wide_df.to_csv(
            WIDE_FILE,
            index=False,
            encoding="utf-8-sig",
        )

    pd.DataFrame(logs).to_csv(
        LOG_FILE,
        index=False,
        encoding="utf-8-sig",
    )

    print("\nHoàn thành Economic API.")
    print(f"Raw: {RAW_FILE}")
    print(f"Yearly: {WIDE_FILE}")
    print(f"Log: {LOG_FILE}")


if __name__ == "__main__":
    main()
