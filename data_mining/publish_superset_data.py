import csv
import json
import math
import os
import sys
from datetime import date, datetime
from pathlib import Path

import psycopg
from dotenv import load_dotenv

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")


BASE_DIR = Path(__file__).resolve().parents[1]
GOLD_DIR = BASE_DIR / "data_mining" / "datasets" / "gold"
SUPERSET_ROLE = "superset_dashboard_reader"
TABLES = (
    "dm_history_demand_superset",
    "dm_forecast_series_superset",
    "dm_model_metrics_superset",
    "dm_forecast_errors_superset",
    "dm_inventory_balance_superset",
    "dm_live_horizon_superset",
    "dm_transfer_recommendations_superset",
    "dm_transfer_status_superset",
)


def read_csv_rows(filename, required_columns):
    path = GOLD_DIR / filename
    if not path.is_file():
        raise FileNotFoundError(f"Required Superset source file is missing: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames is None:
            raise ValueError(f"CSV has no header: {path}")
        missing = set(required_columns) - set(reader.fieldnames)
        if missing:
            raise ValueError(f"{path.name} is missing columns: {sorted(missing)}")
        return list(reader)


def parse_number(value, column, allow_empty=False):
    if allow_empty and (value is None or value.strip() == ""):
        return None
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"Non-finite value in {column}: {value!r}")
    return result


def parse_date(value, column):
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid date in {column}: {value!r}") from exc


def parse_flag(value, column):
    if value not in ("0", "1"):
        raise ValueError(f"Expected 0 or 1 in {column}, got {value!r}")
    return value == "1"


def build_history_rows(rows):
    result = []
    for row in rows:
        result.append(
            (
                parse_date(row["ngay"], "ngay"),
                row["ma_kho"].strip(),
                row["ma_sp"].strip(),
                parse_number(row["nhu_cau_xuat"], "nhu_cau_xuat"),
                parse_number(row["nhiet_do_tb"], "nhiet_do_tb", allow_empty=True),
                parse_number(row["luong_mua"], "luong_mua", allow_empty=True),
                int(row["thu_trong_tuan"]),
                row["ten_thu"].strip(),
                parse_flag(row["la_cuoi_tuan"], "la_cuoi_tuan"),
                parse_flag(row["la_ngay_le"], "la_ngay_le"),
                row["ten_ngay_le"].strip(),
            )
        )
    return result


def build_forecast_rows(rows):
    series = []
    errors = []
    model_values = {"Baseline (rolling mean 7)": [], "Ridge Regression": []}
    actual_total = 0.0
    zero_actual_count = 0

    for row in rows:
        forecast_date = parse_date(row["ngay"], "ngay")
        actual = parse_number(row["thuc_te"], "thuc_te")
        baseline = parse_number(row["du_bao_baseline"], "du_bao_baseline")
        ridge = parse_number(row["du_bao_ridge"], "du_bao_ridge")
        warehouse = row["ma_kho"].strip()
        product = row["ma_sp"].strip()
        actual_total += abs(actual)
        zero_actual_count += actual == 0

        for series_name, quantity in (
            ("Actual", actual),
            ("Baseline (rolling mean 7)", baseline),
            ("Ridge Regression", ridge),
        ):
            series.append(
                (forecast_date, warehouse, product, series_name, quantity, "HISTORICAL_HOLDOUT")
            )

        for model_name, predicted in (
            ("Baseline (rolling mean 7)", baseline),
            ("Ridge Regression", ridge),
        ):
            signed_error = predicted - actual
            absolute_error = abs(signed_error)
            absolute_percentage_error = (
                absolute_error / abs(actual) * 100 if actual != 0 else None
            )
            model_values[model_name].append((actual, predicted, absolute_error))
            errors.append(
                (
                    forecast_date,
                    warehouse,
                    product,
                    model_name,
                    actual,
                    predicted,
                    signed_error,
                    absolute_error,
                    absolute_percentage_error,
                )
            )

    metrics = []
    for model_name, values in model_values.items():
        if not values:
            continue
        absolute_errors = [value[2] for value in values]
        squared_errors = [(value[1] - value[0]) ** 2 for value in values]
        nonzero_actuals = [value for value in values if value[0] != 0]
        mape = (
            sum(
                abs(actual - predicted) / abs(actual) * 100
                for actual, predicted, _ in nonzero_actuals
            )
            / len(nonzero_actuals)
            if nonzero_actuals
            else None
        )
        wape = sum(absolute_errors) / actual_total * 100 if actual_total else None
        metrics.append(
            (
                model_name,
                round(sum(absolute_errors) / len(values), 4),
                round(math.sqrt(sum(squared_errors) / len(values)), 4),
                round(mape, 4) if mape is not None else None,
                round(wape, 4) if wape is not None else None,
                len(values),
                zero_actual_count,
                "HISTORICAL_HOLDOUT",
            )
        )
    return series, metrics, errors


def build_horizon_rows(rows):
    return [
        (
            int(row["horizon_days"]),
            parse_date(row["forecast_start_date"], "forecast_start_date"),
            parse_date(row["forecast_end_date"], "forecast_end_date"),
            row["ma_kho"].strip(),
            row["ma_sp"].strip(),
            parse_number(row["predicted_total_demand"], "predicted_total_demand"),
            parse_number(row["predicted_daily_average"], "predicted_daily_average"),
            "LIVE_FORECAST",
        )
        for row in rows
    ]


def build_recommendation_rows(rows):
    result = []
    for row in rows:
        result.append(
            (
                int(row["id"]),
                row["ma_sp"].strip(),
                row["kho_nguon"].strip(),
                row["kho_dich"].strip(),
                int(row["so_luong_de_xuat"]),
                parse_number(row["gia_tri_uoc_tinh"], "gia_tri_uoc_tinh"),
                row["priority_code"].strip(),
            )
        )
    return result


def read_json(path):
    if not path.is_file():
        raise FileNotFoundError(f"Required Superset source file is missing: {path}")
    with path.open("r", encoding="utf-8") as source:
        return json.load(source)


def get_connection_config():
    load_dotenv(BASE_DIR / ".env", override=False)
    return {
        "host": os.getenv("POSTGRES_HOST_CENTRAL", "127.0.0.1"),
        "port": int(os.getenv("POSTGRES_PORT_CENTRAL", "5436")),
        "dbname": os.getenv("POSTGRES_DB_CENTRAL", "warehouse_central"),
        "user": os.getenv("POSTGRES_USER", "admin"),
        "password": os.getenv("POSTGRES_PASSWORD", ""),
        "connect_timeout": 10,
        "application_name": "warehouse_superset_data_publisher",
    }


def create_tables(cursor):
    definitions = {
        "dm_history_demand_superset": """
            ngay date NOT NULL, ma_kho text NOT NULL, ma_sp text NOT NULL,
            nhu_cau_xuat double precision NOT NULL, nhiet_do_tb double precision,
            luong_mua double precision, thu_trong_tuan integer NOT NULL,
            ten_thu text NOT NULL, la_cuoi_tuan boolean NOT NULL,
            la_ngay_le boolean NOT NULL, ten_ngay_le text NOT NULL
        """,
        "dm_forecast_series_superset": """
            ngay date NOT NULL, ma_kho text NOT NULL, ma_sp text NOT NULL,
            loai_chuoi text NOT NULL, so_luong double precision NOT NULL,
            nguon_du_lieu text NOT NULL
        """,
        "dm_model_metrics_superset": """
            model_name text NOT NULL, mae double precision NOT NULL,
            rmse double precision NOT NULL, mape_percent double precision,
            wape_percent double precision, observations integer NOT NULL,
            zero_actual_observations integer NOT NULL, evaluation_scope text NOT NULL
        """,
        "dm_forecast_errors_superset": """
            ngay date NOT NULL, ma_kho text NOT NULL, ma_sp text NOT NULL,
            model_name text NOT NULL, actual double precision NOT NULL,
            predicted double precision NOT NULL, signed_error double precision NOT NULL,
            absolute_error double precision NOT NULL, absolute_percentage_error double precision
        """,
        "dm_inventory_balance_superset": """
            ma_kho text NOT NULL, ten_kho text NOT NULL, ma_sp text NOT NULL,
            ten_sp text NOT NULL, so_luong bigint NOT NULL, ton_toi_thieu bigint NOT NULL,
            ton_an_toan bigint NOT NULL, chenhlech_voi_ton_an_toan bigint NOT NULL,
            so_luong_can_bo_sung bigint NOT NULL, trang_thai_ton text NOT NULL
        """,
        "dm_live_horizon_superset": """
            horizon_days integer NOT NULL, forecast_start_date date NOT NULL,
            forecast_end_date date NOT NULL, ma_kho text NOT NULL, ma_sp text NOT NULL,
            predicted_total_demand double precision NOT NULL,
            predicted_daily_average double precision NOT NULL, forecast_scope text NOT NULL
        """,
        "dm_transfer_recommendations_superset": """
            id bigint NOT NULL, ma_sp text NOT NULL, kho_nguon text NOT NULL,
            kho_dich text NOT NULL, so_luong_de_xuat bigint NOT NULL,
            gia_tri_uoc_tinh double precision NOT NULL, priority_code text NOT NULL
        """,
        "dm_transfer_status_superset": """
            status text NOT NULL, weekly_forecast_status text NOT NULL,
            latest_observation_date date, reason text NOT NULL,
            recommendations_count integer NOT NULL, generated_at timestamp NOT NULL
        """,
    }
    for table, columns in definitions.items():
        cursor.execute(
            psycopg.sql.SQL("CREATE TABLE IF NOT EXISTS {} ({})").format(
                psycopg.sql.Identifier(table),
                psycopg.sql.SQL(columns),
            )
        )
        cursor.execute(
            psycopg.sql.SQL("COMMENT ON TABLE {} IS {}").format(
                psycopg.sql.Identifier(table),
                psycopg.sql.Literal(
                    "Superset Data Mining dashboard source; refreshed by the Data Mining pipeline."
                ),
            )
        )
    cursor.execute(
        psycopg.sql.SQL("GRANT SELECT ON {} TO {}").format(
            psycopg.sql.SQL(", ").join(map(psycopg.sql.Identifier, TABLES)),
            psycopg.sql.Identifier(SUPERSET_ROLE),
        )
    )


def fetch_inventory_rows(cursor):
    cursor.execute(
        """
        SELECT ma_kho, ten_kho, ma_sp, ten_sp, so_luong, ton_toi_thieu, ton_an_toan
        FROM vw_ton_kho_theo_kho
        ORDER BY ma_kho, ma_sp
        """
    )
    rows = cursor.fetchall()
    if not rows:
        raise ValueError(
            "Central inventory view returned no rows; "
            "refusing to publish an empty snapshot."
        )
    result = []
    for (
        warehouse,
        warehouse_name,
        product,
        product_name,
        quantity,
        minimum,
        safety,
    ) in rows:
        surplus = quantity - safety
        status = (
            "SHORTAGE"
            if quantity < minimum
            else "REPLENISH"
            if quantity < safety
            else "AT_OR_ABOVE_SAFETY"
        )
        result.append(
            (
                warehouse,
                warehouse_name,
                product,
                product_name,
                quantity,
                minimum,
                safety,
                surplus,
                max(0, safety - quantity),
                status,
            )
        )
    return result


def replace_rows(cursor, table, columns, rows):
    cursor.execute(
        psycopg.sql.SQL("TRUNCATE TABLE {}").format(psycopg.sql.Identifier(table))
    )
    if rows:
        placeholders = psycopg.sql.SQL(", ").join(
            psycopg.sql.Placeholder() for _ in columns
        )
        cursor.executemany(
            psycopg.sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
                psycopg.sql.Identifier(table),
                psycopg.sql.SQL(", ").join(map(psycopg.sql.Identifier, columns)),
                placeholders,
            ),
            rows,
        )


def publish():
    history = build_history_rows(
        read_csv_rows(
            "analytical_dataset.csv",
            (
                "ngay", "ma_kho", "ma_sp", "nhu_cau_xuat", "nhiet_do_tb",
                "luong_mua", "thu_trong_tuan", "ten_thu", "la_cuoi_tuan",
                "la_ngay_le", "ten_ngay_le",
            ),
        )
    )
    holdout = read_csv_rows(
        "forecast_results.csv",
        ("ngay", "ma_kho", "ma_sp", "thuc_te", "du_bao_baseline", "du_bao_ridge"),
    )
    if not holdout:
        raise ValueError("forecast_results.csv contains no holdout observations.")
    series, metrics, errors = build_forecast_rows(holdout)
    if not history:
        raise ValueError("analytical_dataset.csv contains no historical observations.")
    horizon_rows = build_horizon_rows(
        read_csv_rows(
            "horizon_next_forecast.csv",
            (
                "horizon_days", "forecast_start_date", "forecast_end_date",
                "ma_kho", "ma_sp", "predicted_total_demand",
                "predicted_daily_average",
            ),
        )
    )
    recommendation_rows = build_recommendation_rows(
        read_csv_rows(
            "transfer_recommendations.csv",
            (
                "id", "ma_sp", "kho_nguon", "kho_dich",
                "so_luong_de_xuat", "gia_tri_uoc_tinh", "priority_code",
            ),
        )
    )
    transfer_status = read_json(GOLD_DIR / "transfer_recommendations.json")
    weekly_status = read_json(GOLD_DIR / "weekly_live_forecast_status.json")
    latest_observation = weekly_status.get("latest_observation_date")
    latest_observation_date = (
        parse_date(latest_observation, "latest_observation_date")
        if latest_observation
        else None
    )
    generated_at_value = transfer_status.get("thoi_diem_tao")
    generated_at = (
        datetime.fromisoformat(generated_at_value)
        if generated_at_value
        else datetime.now()
    )
    status_rows = [
        (
            transfer_status["status"],
            weekly_status["status"],
            latest_observation_date,
            transfer_status.get(
                "ghi_chu_nghiep_vu",
                transfer_status.get("reason", ""),
            ),
            len(recommendation_rows),
            generated_at,
        )
    ]

    with psycopg.connect(**get_connection_config()) as connection:
        with connection.cursor() as cursor:
            inventory = fetch_inventory_rows(cursor)
            create_tables(cursor)
            replacements = (
                (
                    "dm_history_demand_superset",
                    (
                        "ngay", "ma_kho", "ma_sp", "nhu_cau_xuat",
                        "nhiet_do_tb", "luong_mua", "thu_trong_tuan",
                        "ten_thu", "la_cuoi_tuan", "la_ngay_le",
                        "ten_ngay_le",
                    ),
                    history,
                ),
                (
                    "dm_forecast_series_superset",
                    (
                        "ngay", "ma_kho", "ma_sp", "loai_chuoi",
                        "so_luong", "nguon_du_lieu",
                    ),
                    series,
                ),
                (
                    "dm_model_metrics_superset",
                    (
                        "model_name", "mae", "rmse", "mape_percent",
                        "wape_percent", "observations",
                        "zero_actual_observations", "evaluation_scope",
                    ),
                    metrics,
                ),
                (
                    "dm_forecast_errors_superset",
                    (
                        "ngay", "ma_kho", "ma_sp", "model_name", "actual",
                        "predicted", "signed_error", "absolute_error",
                        "absolute_percentage_error",
                    ),
                    errors,
                ),
                (
                    "dm_inventory_balance_superset",
                    (
                        "ma_kho", "ten_kho", "ma_sp", "ten_sp", "so_luong",
                        "ton_toi_thieu", "ton_an_toan",
                        "chenhlech_voi_ton_an_toan",
                        "so_luong_can_bo_sung", "trang_thai_ton",
                    ),
                    inventory,
                ),
                (
                    "dm_live_horizon_superset",
                    (
                        "horizon_days", "forecast_start_date",
                        "forecast_end_date", "ma_kho", "ma_sp",
                        "predicted_total_demand",
                        "predicted_daily_average", "forecast_scope",
                    ),
                    horizon_rows,
                ),
                (
                    "dm_transfer_recommendations_superset",
                    (
                        "id", "ma_sp", "kho_nguon", "kho_dich",
                        "so_luong_de_xuat", "gia_tri_uoc_tinh",
                        "priority_code",
                    ),
                    recommendation_rows,
                ),
                (
                    "dm_transfer_status_superset",
                    (
                        "status", "weekly_forecast_status",
                        "latest_observation_date", "reason",
                        "recommendations_count", "generated_at",
                    ),
                    status_rows,
                ),
            )
            for table, columns, rows in replacements:
                replace_rows(cursor, table, columns, rows)

    print(
        "Published Superset Data Mining data: "
        f"{len(history)} historical rows, {len(holdout)} holdout rows, "
        f"{len(horizon_rows)} live horizon rows, "
        f"{len(inventory)} inventory rows, "
        f"{len(recommendation_rows)} transfer recommendations."
    )


if __name__ == "__main__":
    publish()
