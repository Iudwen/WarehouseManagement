import csv
import json
import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path

import psycopg
from dotenv import load_dotenv

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")


BASE_DIR = Path(__file__).resolve().parents[2]
RAW_FILE = (
    BASE_DIR
    / "data_mining"
    / "datasets"
    / "raw"
    / "lich_su_xuat_hang.csv"
)
STATUS_FILE = (
    BASE_DIR
    / "data_mining"
    / "datasets"
    / "gold"
    / "live_db_extract_status.json"
)
OUTPUT_FIELDS = [
    "ngay",
    "ma_kho",
    "ma_sp",
    "so_phieu_xuat",
    "tong_so_luong_xuat",
    "tong_gia_tri_xuat",
]


def get_connection_config():
    load_dotenv(BASE_DIR / ".env", override=False)
    return {
        "host": os.getenv("POSTGRES_HOST_CENTRAL", "127.0.0.1"),
        "port": int(os.getenv("POSTGRES_PORT_CENTRAL", "5436")),
        "dbname": os.getenv("POSTGRES_DB_CENTRAL", "warehouse_central"),
        "user": os.getenv("POSTGRES_USER", "admin"),
        "password": os.getenv("POSTGRES_PASSWORD", ""),
        "connect_timeout": 10,
        "application_name": "warehouse_demand_forecast_extract",
    }


def fetch_daily_demand(conn):
    with conn.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) FROM xuat_hang_central")
        source_transaction_rows = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM ban_hang_central")
        sales_transaction_rows = cursor.fetchone()[0]
        cursor.execute(
            """
            SELECT COUNT(*)
            FROM xuat_hang_central
            WHERE ngay_xuat::date > CURRENT_DATE
            """
        )
        future_transaction_rows_ignored = cursor.fetchone()[0]

        cursor.execute(
            """
            SELECT COUNT(*)
            FROM xuat_hang_central
            WHERE ngay_xuat IS NULL
               OR NULLIF(BTRIM(ma_kho), '') IS NULL
               OR NULLIF(BTRIM(ma_sp), '') IS NULL
               OR so_luong IS NULL
               OR so_luong < 0
            """
        )
        invalid_rows = cursor.fetchone()[0]
        if invalid_rows:
            raise ValueError(
                "Bảng xuat_hang_central có "
                f"{invalid_rows} dòng thiếu khóa/ngày hoặc số lượng âm/rỗng."
            )

        cursor.execute(
            """
            SELECT
                ngay_xuat::date AS ngay,
                BTRIM(ma_kho) AS ma_kho,
                BTRIM(ma_sp) AS ma_sp,
                COUNT(DISTINCT ma_phieu_xuat) AS so_phieu_xuat,
                SUM(so_luong) AS tong_so_luong_xuat,
                SUM(COALESCE(thanh_tien, so_luong * don_gia, 0))
                    AS tong_gia_tri_xuat
            FROM xuat_hang_central
            WHERE ngay_xuat::date <= CURRENT_DATE
            GROUP BY ngay_xuat::date, BTRIM(ma_kho), BTRIM(ma_sp)
            ORDER BY ngay, ma_kho, ma_sp
            """
        )
        rows = cursor.fetchall()

    if not rows:
        raise ValueError(
            "Bảng xuat_hang_central không có dữ liệu để dự báo."
        )

    return (
        rows,
        source_transaction_rows,
        sales_transaction_rows,
        future_transaction_rows_ignored,
    )


def write_extracted_data(
    rows,
    source_transaction_rows=None,
    sales_transaction_rows=None,
    future_transaction_rows_ignored=0,
    output_file=RAW_FILE,
    status_file=STATUS_FILE,
):
    output_file = Path(output_file)
    status_file = Path(status_file)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    status_file.parent.mkdir(parents=True, exist_ok=True)

    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8-sig",
            newline="",
            dir=output_file.parent,
            prefix=f".{output_file.name}.",
            suffix=".tmp",
            delete=False,
        ) as file:
            temporary_path = Path(file.name)
            writer = csv.writer(file)
            writer.writerow(OUTPUT_FIELDS)
            for row in rows:
                day, warehouse, product, invoices, quantity, value = row
                writer.writerow([
                    day.isoformat(),
                    warehouse,
                    product,
                    invoices,
                    format(quantity, "f"),
                    format(value or 0, "f"),
                ])

        temporary_path.replace(output_file)
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()

    quantities = [float(row[4]) for row in rows]
    extracted_at = datetime.now().astimezone().isoformat()
    status = {
        "source": "PostgreSQL central.xuat_hang_central",
        "extracted_at": extracted_at,
        "source_transaction_rows": source_transaction_rows,
        "sales_transaction_rows": sales_transaction_rows,
        "future_transaction_rows_ignored": future_transaction_rows_ignored,
        "rows": len(rows),
        "total_quantity": sum(quantities),
        "start_date": min(row[0] for row in rows).isoformat(),
        "end_date": max(row[0] for row in rows).isoformat(),
    }
    status_file.write_text(
        json.dumps(status, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return status


def main():
    try:
        with psycopg.connect(**get_connection_config()) as conn:
            (
                rows,
                source_transaction_rows,
                sales_transaction_rows,
                future_transaction_rows_ignored,
            ) = fetch_daily_demand(conn)
    except psycopg.Error as exc:
        raise RuntimeError(
            "Không thể đọc dữ liệu dự báo từ PostgreSQL central. "
            "Kiểm tra container, cổng và cấu hình POSTGRES_* trong .env."
        ) from exc

    status = write_extracted_data(
        rows,
        source_transaction_rows=source_transaction_rows,
        sales_transaction_rows=sales_transaction_rows,
        future_transaction_rows_ignored=future_transaction_rows_ignored,
    )
    print(
        f"[OK] {status['source']}: "
        f"{status['source_transaction_rows']:,} giao dịch -> "
        f"{status['rows']:,} nhóm ngày-kho-sản phẩm, "
        f"{status['total_quantity']:,.0f} đơn vị, "
        f"{status['start_date']} đến {status['end_date']}; "
        f"bỏ qua {status['future_transaction_rows_ignored']:,} giao dịch tương lai."
    )
    print(f"Đã cập nhật dữ liệu Raw: {RAW_FILE}")


if __name__ == "__main__":
    main()
