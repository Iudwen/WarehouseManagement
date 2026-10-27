import sys
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

import csv
import os
import tempfile
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
    "xuat_hang_central",
]


def extract_table(conn, table_name, output_dir=None):
    query = sql.SQL("SELECT * FROM {}").format(
        sql.Identifier("public", table_name)
    )

    with conn.cursor() as cur:
        cur.execute(query)
        columns = [column.name for column in cur.description]

        target_dir = output_dir or BRONZE_DIR
        target_dir.mkdir(parents=True, exist_ok=True)
        output_file = target_dir / f"{table_name}.csv"

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

        missing_tables = sorted(set(TABLES) - existing_tables)
        if missing_tables:
            raise RuntimeError(
                "Thiếu bảng PostgreSQL bắt buộc: " + ", ".join(missing_tables)
            )

        BRONZE_DIR.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(
            prefix=".postgresql-extract-",
            dir=BRONZE_DIR.parent,
        ) as staging_dir:
            staged_dir = Path(staging_dir)
            for table_name in TABLES:
                extract_table(conn, table_name, staged_dir)

            for table_name in TABLES:
                os.replace(
                    staged_dir / f"{table_name}.csv",
                    BRONZE_DIR / f"{table_name}.csv",
                )

    print(f"Hoàn tất: {datetime.now().isoformat()}")


if __name__ == "__main__":
    main()
