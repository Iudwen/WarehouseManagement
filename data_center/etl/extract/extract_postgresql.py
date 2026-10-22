import sys
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

import csv
import os
from datetime import datetime
from pathlib import Path

import psycopg
from psycopg import sql

DATA_LAKE_DIR = Path(os.getenv("DATA_LAKE_DIR", Path(__file__).resolve().parents[2] / "data_lake"))
BRONZE_DIR = DATA_LAKE_DIR / "bronze" / "postgresql" / "central"

DB_CONFIG = {
    "host": os.getenv("POSTGRES_HOST", "postgres_central"),
    "port": int(os.getenv("POSTGRES_PORT", "5432")),
    "dbname": os.getenv("POSTGRES_DB", "warehouse_central"),
    "user": os.getenv("POSTGRES_USER", "admin"),
    "password": os.getenv("POSTGRES_PASSWORD", ""),
}

TABLES = [
    "ban_hang_central",
    "demand_forecast",
    "dieu_chuyen_central",
    "kho",
    "lich_su_ton_kho_central",
    "nhap_hang_central",
    "nhom_san_pham",
    "san_pham",
    "ton_kho_central",
    "ton_kho_hien_tai",
    "xuat_hang_central",
]


def extract_table(conn, table_name):
    query = sql.SQL("SELECT * FROM {}").format(
        sql.Identifier("public", table_name)
    )

    with conn.cursor() as cur:
        cur.execute(query)
        columns = [column.name for column in cur.description]

        BRONZE_DIR.mkdir(parents=True, exist_ok=True)
        output_file = BRONZE_DIR / f"{table_name}.csv"

        row_count = 0

        with output_file.open(
            "w", encoding="utf-8-sig", newline=""
        ) as file:
            writer = csv.writer(file)
            writer.writerow(columns)

            while True:
                rows = cur.fetchmany(2000)
                if not rows:
                    break

                writer.writerows(rows)
                row_count += len(rows)

    print(f"[OK] {table_name}: {row_count} dòng -> {output_file}")


def main():
    print(f"Thời điểm bắt đầu: {datetime.now().isoformat()}")

    with psycopg.connect(**DB_CONFIG) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                """
            )
            existing_tables = {row[0] for row in cur.fetchall()}

        for table_name in TABLES:
            if table_name not in existing_tables:
                print(f"[SKIP] Không tìm thấy bảng: {table_name}")
                continue

            try:
                extract_table(conn, table_name)
            except Exception as exc:
                print(f"[ERROR] {table_name}: {exc}")

    print(f"Hoàn tất: {datetime.now().isoformat()}")


if __name__ == "__main__":
    main()
