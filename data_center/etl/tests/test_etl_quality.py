import csv
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from data_center.etl.load import load_bronze, load_gold
from data_center.etl.tranform import transform_postgresql
from data_mining.data_preprocessing.extract_live_demand import fetch_daily_demand


class PostgresTransformTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        root = Path(self.temp_dir.name)
        self.bronze_dir = root / "bronze"
        self.silver_dir = root / "silver"
        self.report_dir = root / "reports"
        self.bronze_dir.mkdir()
        self._patches = [
            patch.object(transform_postgresql, "BRONZE_DIR", self.bronze_dir),
            patch.object(transform_postgresql, "SILVER_DIR", self.silver_dir),
            patch.object(transform_postgresql, "REJECT_DIR", self.report_dir),
        ]
        for item in self._patches:
            item.start()
            self.addCleanup(item.stop)

    def write_source(self, table, columns, rows):
        with (self.bronze_dir / f"{table}.csv").open(
            "w", encoding="utf-8", newline=""
        ) as file:
            writer = csv.DictWriter(file, fieldnames=columns)
            writer.writeheader()
            writer.writerows(rows)

    def test_transform_requires_full_schema_even_when_source_is_empty(self):
        self.write_source("ban_hang_central", ["id"], [])

        with self.assertRaisesRegex(ValueError, "Schema Bronze"):
            transform_postgresql.transform_table(
                "ban_hang_central",
                transform_postgresql.TABLE_RULES["ban_hang_central"],
            )

    def test_ban_hang_rows_are_validated_and_reported(self):
        table = "ban_hang_central"
        columns = transform_postgresql.TABLE_RULES[table]["columns"]
        row = {
            "id": "1",
            "ma_phieu_xuat": "PX-1",
            "ma_kho": "HN01",
            "ma_sp": "SP001",
            "ngay_ban": "2026-09-25",
            "so_luong": "0",
            "don_gia": "10",
            "thanh_tien": "0",
        }
        self.write_source(table, columns, [row])

        report = transform_postgresql.transform_table(
            table, transform_postgresql.TABLE_RULES[table]
        )

        self.assertEqual(report["source_rows"], 1)
        self.assertEqual(report["silver_rows"], 0)
        self.assertEqual(report["rejected_rows"], 1)
        self.assertTrue((self.report_dir / "ban_hang_central_rejected.csv").exists())

    def test_numeric_domains_reject_fractional_quantities_and_negative_amounts(self):
        table = "ban_hang_central"
        columns = transform_postgresql.TABLE_RULES[table]["columns"]
        rows = [
            {
                "id": "2",
                "ma_phieu_xuat": "PX-2",
                "ma_kho": "HN01",
                "ma_sp": "SP001",
                "ngay_ban": "2026-09-25",
                "so_luong": "1.5",
                "don_gia": "10",
                "thanh_tien": "15",
            },
            {
                "id": "3",
                "ma_phieu_xuat": "PX-3",
                "ma_kho": "HN01",
                "ma_sp": "SP001",
                "ngay_ban": "2026-09-25",
                "so_luong": "1",
                "don_gia": "10",
                "thanh_tien": "-10",
            },
        ]
        self.write_source(table, columns, rows)

        report = transform_postgresql.transform_table(
            table, transform_postgresql.TABLE_RULES[table]
        )

        self.assertEqual(report["silver_rows"], 0)
        self.assertEqual(report["rejected_rows"], 2)


class DataLakeLoadTests(unittest.TestCase):
    def test_live_extraction_failure_does_not_continue_with_bronze_snapshot(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            with patch.object(load_bronze, "BRONZE_DIR", root / "bronze"), patch.object(
                load_bronze.subprocess,
                "run",
                return_value=type("Result", (), {
                    "returncode": 1,
                    "stdout": "",
                    "stderr": "database unavailable",
                })(),
            ):
                with self.assertRaisesRegex(RuntimeError, "PostgreSQL Central"):
                    load_bronze.load_bronze(run_live_extract=True)

    def test_gold_rejects_bad_rows_without_overwriting_existing_snapshot(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "silver.csv"
            source.write_text(
                "id,ma_phieu_xuat,ma_kho,ma_sp,ngay_xuat,so_luong,don_gia,"
                "thanh_tien,source_node,created_at\n"
                "1,PX-1,HN01,SP001,2026-09-25,not-a-number,10,10,NODE_HN,\n",
                encoding="utf-8",
            )
            data_lake_gold = root / "lake-gold.csv"
            mining_gold = root / "mining-gold.csv"
            data_lake_gold.write_text("existing lake snapshot", encoding="utf-8")
            mining_gold.write_text("existing mining snapshot", encoding="utf-8")

            with patch.object(load_gold, "DATA_LAKE_GOLD_DIR", root), patch.object(
                load_gold, "DATA_LAKE_GOLD_FILE", data_lake_gold
            ), patch.object(load_gold, "DM_GOLD_DIR", root), patch.object(
                load_gold, "DM_GOLD_FILE", mining_gold
            ):
                with self.assertRaisesRegex(ValueError, "Từ chối tạo Gold"):
                    load_gold.load_gold(source)

            self.assertEqual(data_lake_gold.read_text(encoding="utf-8"), "existing lake snapshot")
            self.assertEqual(mining_gold.read_text(encoding="utf-8"), "existing mining snapshot")

    def test_future_rows_remain_in_lake_gold_but_not_mining_gold(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "silver.csv"
            source.write_text(
                "id,ma_phieu_xuat,ma_kho,ma_sp,ngay_xuat,so_luong,don_gia,"
                "thanh_tien,source_node,created_at\n"
                f"1,PX-1,HN01,SP001,{date.today().isoformat()},2,10,20,NODE_HN,\n"
                "2,PX-2,HN01,SP001,2099-12-31,3,10,30,NODE_HN,\n",
                encoding="utf-8",
            )
            data_lake_gold = root / "lake-gold.csv"
            mining_gold = root / "mining-gold.csv"

            with patch.object(load_gold, "DATA_LAKE_GOLD_DIR", root), patch.object(
                load_gold, "DATA_LAKE_GOLD_FILE", data_lake_gold
            ), patch.object(load_gold, "DM_GOLD_DIR", root), patch.object(
                load_gold, "DM_GOLD_FILE", mining_gold
            ):
                stats = load_gold.load_gold(source)

            with data_lake_gold.open(encoding="utf-8-sig", newline="") as file:
                lake_rows = list(csv.DictReader(file))
            with mining_gold.open(encoding="utf-8-sig", newline="") as file:
                mining_rows = list(csv.DictReader(file))

            self.assertEqual(stats["groups"], 2)
            self.assertEqual(stats["data_mining_groups"], 1)
            self.assertEqual(len(lake_rows), 2)
            self.assertEqual(len(mining_rows), 1)
            self.assertEqual(mining_rows[0]["ngay"], date.today().isoformat())


class LiveDemandExtractionTests(unittest.TestCase):
    def test_future_transactions_are_excluded_from_historical_demand(self):
        class FakeCursor:
            def __init__(self):
                self.queries = []
                self.fetchone_values = iter([(10,), (0,), (2,), (0,)])

            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def execute(self, query):
                self.queries.append(query)

            def fetchone(self):
                return next(self.fetchone_values)

            def fetchall(self):
                return [("2026-10-27", "HN01", "SP001", 1, 5, 50)]

        class FakeConnection:
            def __init__(self):
                self.fake_cursor = FakeCursor()

            def cursor(self):
                return self.fake_cursor

        connection = FakeConnection()
        rows, total, sales, ignored_future = fetch_daily_demand(connection)

        self.assertEqual((total, sales, ignored_future), (10, 0, 2))
        self.assertEqual(len(rows), 1)
        self.assertIn("ngay_xuat::date <= CURRENT_DATE", connection.fake_cursor.queries[-1])


if __name__ == "__main__":
    unittest.main()
