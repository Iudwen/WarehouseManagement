import os
import sys
import argparse
import random
from datetime import datetime, timedelta, date

import psycopg

# =============================================================================
# CAU HINH HE THONG
# =============================================================================

RANDOM_SEED = 42

DB_USER = os.getenv("POSTGRES_USER", "admin")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "admin123")

DB_CONFIG = {
    "HN": {
        "host": "localhost",
        "port": 5433,
        "dbname": "warehouse_hn",
        "node_name": "NODE_HN",
        "ma_kho": "HN01"
    },
    "DN": {
        "host": "localhost",
        "port": 5434,
        "dbname": "warehouse_dn",
        "node_name": "NODE_DN",
        "ma_kho": "DN01"
    },
    "HCM": {
        "host": "localhost",
        "port": 5435,
        "dbname": "warehouse_hcm",
        "node_name": "NODE_HCM",
        "ma_kho": "HCM01"
    },
}

CENTRAL_CONFIG = {
    "host": "localhost",
    "port": 5436,
    "dbname": "warehouse_central",
    "user": DB_USER,
    "password": DB_PASSWORD
}

WAREHOUSES = {
    "HN": {"ma_kho": "HN01", "ten_kho": "Kho Ha Noi", "dia_chi": "Ha Noi", "thanh_pho": "Ha Noi"},
    "DN": {"ma_kho": "DN01", "ten_kho": "Kho Da Nang", "dia_chi": "Da Nang", "thanh_pho": "Da Nang"},
    "HCM": {"ma_kho": "HCM01", "ten_kho": "Kho Ho Chi Minh", "dia_chi": "TP. Ho Chi Minh", "thanh_pho": "Ho Chi Minh"},
}

PRODUCT_GROUPS = [
    ("N01", "Dien tu"),
    ("N02", "Gia dung"),
    ("N03", "Van phong pham"),
]

PRODUCT_PROFILES = {
    "SP001": {"profile": "HIGH_VALUE_LOW_VOLUME", "export_prob": 0.30, "export_range": (1, 3), "import_range": (15, 35)},
    "SP002": {"profile": "HIGH_VALUE_LOW_VOLUME", "export_prob": 0.28, "export_range": (1, 3), "import_range": (15, 35)},
    "SP003": {"profile": "HIGH_VALUE_LOW_VOLUME", "export_prob": 0.25, "export_range": (1, 3), "import_range": (15, 30)},
    "SP004": {"profile": "FAST_MOVER", "export_prob": 0.85, "export_range": (15, 45), "import_range": (80, 200)},
    "SP005": {"profile": "FAST_MOVER", "export_prob": 0.80, "export_range": (12, 40), "import_range": (80, 200)},
    "SP006": {"profile": "FAST_MOVER", "export_prob": 0.85, "export_range": (15, 45), "import_range": (100, 250)},
    "SP007": {"profile": "FAST_MOVER", "export_prob": 0.75, "export_range": (12, 35), "import_range": (80, 180)},
    "SP012": {"profile": "FAST_MOVER", "export_prob": 0.80, "export_range": (20, 50), "import_range": (100, 250)},
    "SP013": {"profile": "FAST_MOVER", "export_prob": 0.80, "export_range": (20, 50), "import_range": (100, 250)},
    "SP008": {"profile": "INTERMITTENT", "export_prob": 0.35, "export_range": (6, 20), "import_range": (30, 70)},
    "SP009": {"profile": "INTERMITTENT", "export_prob": 0.30, "export_range": (5, 18), "import_range": (30, 60)},
    "SP010": {"profile": "INTERMITTENT", "export_prob": 0.40, "export_range": (5, 15), "import_range": (30, 60)},
    "SP011": {"profile": "INTERMITTENT", "export_prob": 0.35, "export_range": (5, 15), "import_range": (25, 50)},
    "SP014": {"profile": "INTERMITTENT", "export_prob": 0.45, "export_range": (8, 25), "import_range": (40, 90)},
    "SP015": {"profile": "INTERMITTENT", "export_prob": 0.40, "export_range": (6, 20), "import_range": (30, 80)},
    "SP016": {"profile": "INTERMITTENT", "export_prob": 0.25, "export_range": (2, 8),  "import_range": (15, 35)},
    "SP017": {"profile": "INTERMITTENT", "export_prob": 0.25, "export_range": (2, 8),  "import_range": (15, 35)},
    "SP018": {"profile": "SLOW_MOVING", "export_prob": 0.12, "export_range": (1, 3), "import_range": (10, 25)},
    "SP019": {"profile": "SLOW_MOVING", "export_prob": 0.08, "export_range": (1, 2), "import_range": (5, 15)},
    "SP020": {"profile": "SLOW_MOVING", "export_prob": 0.06, "export_range": (1, 2), "import_range": (5, 15)},
}

def generate_products():
    products = []
    product_names = [
        "Laptop Dell", "Laptop HP", "Laptop Lenovo",
        "Chuot Logitech", "Chuot Microsoft", "Ban phim Logitech", "Ban phim Dell",
        "Man hinh Samsung", "Man hinh LG", "Tai nghe Sony", "Tai nghe JBL",
        "USB 32GB", "USB 64GB", "O cung SSD 500GB", "O cung SSD 1TB",
        "May in Canon", "May in HP", "Webcam Logitech", "Loa Bluetooth", "Router Wifi",
    ]

    for i in range(20):
        ma_sp = f"SP{i + 1:03d}"
        ten_sp = product_names[i]

        if i < 15:
            ma_nhom = "N01"
            don_vi = "Cai"
            gia_nhap = [300000, 500000, 1000000, 3000000, 5000000, 8000000, 15000000][i % 7]
        elif i < 18:
            ma_nhom = "N02"
            don_vi = "Cai"
            gia_nhap = [500000, 1000000, 2000000, 3000000][i % 4]
        else:
            ma_nhom = "N03"
            don_vi = "Cai"
            gia_nhap = [50000, 100000, 200000, 300000][i % 4]

        gia_ban = int(gia_nhap * 1.25)
        ton_toi_thieu = [55, 33, 31, 31, 23, 89, 55, 74, 63, 65, 25, 68, 100, 44, 49, 32, 66, 54, 41, 68][i]
        ton_an_toan = [110, 132, 124, 62, 92, 267, 110, 222, 126, 195, 100, 136, 400, 176, 147, 96, 132, 216, 164, 204][i]

        products.append({
            "ma_sp": ma_sp,
            "ten_sp": ten_sp,
            "ma_nhom": ma_nhom,
            "don_vi": don_vi,
            "gia_nhap": gia_nhap,
            "gia_ban": gia_ban,
            "ton_toi_thieu": ton_toi_thieu,
            "ton_an_toan": ton_an_toan,
            "profile": PRODUCT_PROFILES.get(ma_sp, {"export_prob": 0.4, "export_range": (1, 15), "import_range": (20, 50)})
        })

    return products

def get_node_connection(branch):
    config = DB_CONFIG[branch]
    return psycopg.connect(
        host=config["host"],
        port=config["port"],
        dbname=config["dbname"],
        user=DB_USER,
        password=DB_PASSWORD
    )

def get_central_connection():
    return psycopg.connect(
        host=CENTRAL_CONFIG["host"],
        port=CENTRAL_CONFIG["port"],
        dbname=CENTRAL_CONFIG["dbname"],
        user=CENTRAL_CONFIG["user"],
        password=CENTRAL_CONFIG["password"]
    )

def insert_master_data(conn, branch, products):
    warehouse = WAREHOUSES[branch]
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO kho (ma_kho, ten_kho, dia_chi, thanh_pho, trang_thai)
            VALUES (%s, %s, %s, %s, 'ACTIVE')
            ON CONFLICT (ma_kho) DO NOTHING
            """,
            (warehouse["ma_kho"], warehouse["ten_kho"], warehouse["dia_chi"], warehouse["thanh_pho"])
        )

        for ma_nhom, ten_nhom in PRODUCT_GROUPS:
            cur.execute(
                """
                INSERT INTO nhom_san_pham (ma_nhom, ten_nhom)
                VALUES (%s, %s)
                ON CONFLICT (ma_nhom) DO NOTHING
                """,
                (ma_nhom, ten_nhom)
            )

        for p in products:
            cur.execute(
                """
                INSERT INTO san_pham (ma_sp, ten_sp, ma_nhom, don_vi, gia_nhap, gia_ban, ton_toi_thieu, ton_an_toan, trang_thai)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'ACTIVE')
                ON CONFLICT (ma_sp) DO NOTHING
                """,
                (p["ma_sp"], p["ten_sp"], p["ma_nhom"], p["don_vi"], p["gia_nhap"], p["gia_ban"], p["ton_toi_thieu"], p["ton_an_toan"])
            )

        suppliers = [
            ("NCC001", "Cong ty ABC"),
            ("NCC002", "Cong ty XYZ"),
            ("NCC003", "Cong ty Tech Viet"),
            ("NCC004", "Cong ty Dong Nam"),
            ("NCC005", "Cong ty Thiet bi Viet"),
        ]
        for ma_ncc, ten_ncc in suppliers:
            cur.execute(
                """
                INSERT INTO nha_cung_cap (ma_ncc, ten_ncc, so_dien_thoai, email, dia_chi)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (ma_ncc) DO NOTHING
                """,
                (ma_ncc, ten_ncc, f"090000{random.randint(1000, 9999)}", f"{ma_ncc.lower()}@example.com", "Viet Nam")
            )

        for i in range(1, 101):
            ma_kh = f"KH{i:04d}"
            cur.execute(
                """
                INSERT INTO khach_hang (ma_kh, ten_kh, so_dien_thoai, email, dia_chi)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (ma_kh) DO NOTHING
                """,
                (ma_kh, f"Khach hang {i}", f"09{random.randint(10000000, 99999999)}", f"kh{i}@example.com", warehouse["thanh_pho"])
            )

    conn.commit()

def get_carryover_inventory(conn, branch, target_date, products, initial_max_date=None):
    """
    Lay so du ton cuoi cua ngay truoc target_date de lam ton dau ky tiep noi.
    1. Uu tien: SELECT ton_cuoi FROM lich_su_ton_kho WHERE ngay = target_date - 1
    2. Kiem tra tinh toan ven:
       - Neu kho da co du lieu lich su (initial_max_date is not None):
         TUYET DOI KHONG lay ton_kho hien tai lam ton dau ky qua khu. Dung va bao loi ro rang.
       - Neu kho chua tung co du lieu lich su (initial_max_date is None):
         Cho phep lay so du tu ton_kho neu co, hoac khoi tao ton dau ky ngau nhien.
    """
    ma_kho = WAREHOUSES[branch]["ma_kho"]
    prev_date = target_date - timedelta(days=1)
    inventory = {}

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT ma_sp, ton_cuoi
            FROM lich_su_ton_kho
            WHERE ma_kho = %s AND ngay = %s
            """,
            (ma_kho, prev_date)
        )
        rows = cur.fetchall()

        if len(rows) == len(products):
            for ma_sp, ton_cuoi in rows:
                inventory[ma_sp] = int(ton_cuoi)
            print(f"[{branch}] -> Tiep noi ton kho tu ngay truoc ({prev_date}): tong ton = {sum(inventory.values())} chiec.")
            return inventory
        elif len(rows) > 0:
            raise RuntimeError(
                f"[{branch}] DU LIEU LICH SU KHONG DAY DU: Ngay {prev_date} chi co {len(rows)}/{len(products)} san pham "
                f"trong lich_su_ton_kho. Khong the tiep noi so du an toan!"
            )

        # Neu khong tim thay lich su ngay lien truoc (prev_date):
        if initial_max_date is not None:
            if target_date <= initial_max_date:
                raise RuntimeError(
                    f"[{branch}] LOI SO DU DAU KY BACKFILL: Khong tim thay lich su ton kho ngay lien truoc ({prev_date}) "
                    f"de lam ton dau ky cho ngay {target_date} (ngay lich su moi nhat hien co la {initial_max_date}). "
                    f"De tranh lam sai lech ton kho, script dung lai. Vui long bo sung du lieu lien tuc tu ngay co so lieu."
                )
            else:
                raise RuntimeError(
                    f"[{branch}] LOI KHOANG TRONG DU LIEU (GAP): Ngay bat dau sinh ({target_date}) khong tiep noi lien tuc "
                    f"voi ngay lich su gan nhat ({initial_max_date}). "
                    f"Thieu du lieu tu {initial_max_date + timedelta(days=1)} den {prev_date}. "
                    f"Vui long sinh du lieu lien tuc tu {initial_max_date + timedelta(days=1)}."
                )

        # Chi khi kho hoan toan chua co ban ghi lich su nao trong lich_su_ton_kho:
        cur.execute(
            """
            SELECT ma_sp, so_luong
            FROM ton_kho
            WHERE ma_kho = %s
            """,
            (ma_kho,)
        )
        rows = cur.fetchall()
        if len(rows) == len(products):
            for ma_sp, so_luong in rows:
                inventory[ma_sp] = int(so_luong)
            print(f"[{branch}] -> Kho chua co lich su, tiep noi so du tu bang ton_kho ban dau: tong ton = {sum(inventory.values())} chiec.")
            return inventory

    for p in products:
        inventory[p["ma_sp"]] = random.randint(300, 1000)
    print(f"[{branch}] -> Kho hoan toan moi chua co so du, khoi tao ton dau ky ngau nhien.")
    return inventory

def record_current_stock_opening_balance(conn, branch, products):
    """
    Create an explicit history boundary from the current stock snapshot.
    Existing history is preserved; adjustments are recorded in stock_ledger.
    """
    ma_kho = WAREHOUSES[branch]["ma_kho"]
    expected_products = {p["ma_sp"] for p in products}
    marker_prefix = f"SEED-OPEN-{branch}-"

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT MIN(thoi_gian::date), MAX(thoi_gian::date)
            FROM stock_ledger
            WHERE ma_kho = %s AND loai_giao_dich = 'DIEU_CHINH'
              AND ma_chung_tu LIKE %s
            """,
            (ma_kho, f"{marker_prefix}%")
        )
        marker_dates = cur.fetchone()

        if marker_dates and marker_dates[0] is not None:
            if marker_dates[0] != marker_dates[1]:
                raise RuntimeError(
                    f"[{branch}] Phat hien nhieu ngay mo so du seed: {marker_dates}. "
                    "Can doi soat thu cong truoc khi tiep tuc."
                )
            opening_date = marker_dates[0]
            cur.execute(
                """
                SELECT ma_sp, ton_dau, nhap, xuat, dieu_chuyen_vao,
                       dieu_chuyen_ra, ton_cuoi
                FROM lich_su_ton_kho
                WHERE ma_kho = %s AND ngay = %s
                """,
                (ma_kho, opening_date)
            )
            rows = cur.fetchall()
            if (
                len(rows) != len(expected_products)
                or {row[0] for row in rows} != expected_products
                or any(
                    row[1] != row[6] or any(value != 0 for value in row[2:6])
                    for row in rows
                )
            ):
                raise RuntimeError(
                    f"[{branch}] Moc so du seed {opening_date} khong day du/khong hop le."
                )
            print(f"[{branch}] -> Da co moc so du seed tai {opening_date}; dung lai moc nay.")
            return opening_date

        opening_date = date.today()
        cur.execute(
            """
            SELECT ma_sp, so_luong
            FROM ton_kho
            WHERE ma_kho = %s
            """,
            (ma_kho,)
        )
        stock_rows = cur.fetchall()
        current_inventory = {ma_sp: int(quantity) for ma_sp, quantity in stock_rows}
        if (
            len(stock_rows) != len(expected_products)
            or set(current_inventory) != expected_products
            or any(quantity < 0 for quantity in current_inventory.values())
        ):
            raise RuntimeError(
                f"[{branch}] Ton kho hien tai khong co du {len(expected_products)} "
                "san pham hoac co so du am; khong the tao moc dau ky."
            )

        cur.execute(
            """
            SELECT MAX(ngay)
            FROM lich_su_ton_kho
            WHERE ma_kho = %s
            """,
            (ma_kho,)
        )
        latest_history_date = cur.fetchone()[0]
        if latest_history_date is not None and latest_history_date >= opening_date:
            raise RuntimeError(
                f"[{branch}] Lich su da co ngay {latest_history_date} >= ngay mo "
                f"so du {opening_date}; tu choi ghi de."
            )

        cur.execute(
            """
            SELECT ma_sp, ton_dau, nhap, xuat, dieu_chuyen_vao,
                   dieu_chuyen_ra, ton_cuoi
            FROM lich_su_ton_kho
            WHERE ma_kho = %s AND ngay = %s
            """,
            (ma_kho, opening_date)
        )
        existing_rows = cur.fetchall()
        if existing_rows:
            if (
                len(existing_rows) != len(expected_products)
                or {row[0] for row in existing_rows} != expected_products
                or any(
                    row[1] != current_inventory[row[0]]
                    or row[6] != current_inventory[row[0]]
                    or any(value != 0 for value in row[2:6])
                    for row in existing_rows
                )
            ):
                raise RuntimeError(
                    f"[{branch}] Da co lich su khong tuong thich tai ngay mo so "
                    f"du {opening_date}; tu choi ghi de."
                )
            print(
                f"[{branch}] -> Da co snapshot ton kho day du tai {opening_date}; "
                "su dung lai snapshot nay."
            )
            return opening_date

        cur.execute(
            """
            SELECT DISTINCT ON (ma_sp) ma_sp, ton_cuoi
            FROM lich_su_ton_kho
            WHERE ma_kho = %s
            ORDER BY ma_sp, ngay DESC
            """,
            (ma_kho,)
        )
        previous_inventory = {
            ma_sp: int(quantity) for ma_sp, quantity in cur.fetchall()
        }

        baseline_at = datetime.combine(opening_date, datetime.min.time())
        for ma_sp in sorted(expected_products):
            quantity = current_inventory[ma_sp]
            previous_quantity = previous_inventory.get(ma_sp, 0)
            adjustment = quantity - previous_quantity

            cur.execute(
                """
                INSERT INTO lich_su_ton_kho
                    (ma_kho, ma_sp, ngay, ton_dau, nhap, xuat,
                     dieu_chuyen_vao, dieu_chuyen_ra, ton_cuoi)
                VALUES (%s, %s, %s, %s, 0, 0, 0, 0, %s)
                """,
                (ma_kho, ma_sp, opening_date, quantity, quantity)
            )

            if adjustment:
                cur.execute(
                    """
                    INSERT INTO stock_ledger
                        (ma_kho, ma_sp, loai_giao_dich, so_luong,
                         so_luong_thay_doi, ma_chung_tu, thoi_gian,
                         nguoi_thuc_hien, ghi_chu)
                    VALUES (%s, %s, 'DIEU_CHINH', %s, %s, %s, %s,
                            'SIMULATOR', %s)
                    """,
                    (
                        ma_kho,
                        ma_sp,
                        abs(adjustment),
                        adjustment,
                        f"{marker_prefix}{opening_date:%Y%m%d}-{ma_sp}",
                        baseline_at,
                        "Opening balance reconciled from ton_kho after an incomplete history gap.",
                    )
                )

        cur.execute(
            """
            UPDATE ton_kho
            SET cap_nhat_luc = %s
            WHERE ma_kho = %s
            """,
            (datetime.now(), ma_kho)
        )

    try:
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    total_quantity = sum(current_inventory.values())
    print(
        f"[{branch}] -> Da ghi moc so du {opening_date}: "
        f"{len(current_inventory)} san pham, tong ton={total_quantity}."
    )
    return opening_date

def check_node_empty_for_full_mode(conn, branch):
    """
    Kiem tra toan bo cac bang nghiep vu / ton kho truoc khi cho phep chay mode 'full'.
    Chi cho phep chay khi database trong hoan toan.
    """
    ma_kho = WAREHOUSES[branch]["ma_kho"]
    tables_to_check = [
        ("lich_su_ton_kho", "ma_kho"),
        ("ton_kho", "ma_kho"),
        ("phieu_nhap", "ma_kho"),
        ("phieu_xuat", "ma_kho"),
        ("stock_ledger", "ma_kho"),
    ]
    non_empty_tables = []
    with conn.cursor() as cur:
        for tbl, col in tables_to_check:
            cur.execute(f"SELECT COUNT(*) FROM {tbl} WHERE {col} = %s", (ma_kho,))
            cnt = cur.fetchone()[0]
            if cnt > 0:
                non_empty_tables.append(f"{tbl} ({cnt} ban ghi)")

    if non_empty_tables:
        tables_str = ", ".join(non_empty_tables)
        raise RuntimeError(
            f"[{branch}] CHAN CHE DO FULL: Database kho {branch} ({ma_kho}) da ton tai du lieu nghiep vu "
            f"tai cac bang: {tables_str}. Che do 'full' chi ho tro khoi tao database moi chua co du lieu. "
            f"De bao ve toan ven du lieu, script dung lai. Vui long su dung che do 'append' de sinh tiep noi, "
            f"hoac kiem tra lai co so du lieu truoc khi chay!"
        )

def generate_date_range_transactions(conn, branch, products, start_date, end_date, mode="append"):
    ma_kho = WAREHOUSES[branch]["ma_kho"]
    print(f"\n[{branch}] Xu ly sinh giao dich tu {start_date} den {end_date} (Che do: {mode.upper()})...")

    # Xac dinh ngay lich su lon nhat hien co truoc khi sinh de phan biet append va backfill
    with conn.cursor() as cur:
        cur.execute("SELECT MAX(ngay) FROM lich_su_ton_kho WHERE ma_kho = %s", (ma_kho,))
        row = cur.fetchone()
        initial_max_date = row[0] if row and row[0] is not None else None

    if mode == "full":
        check_node_empty_for_full_mode(conn, branch)
        # Khoi tao baseline ton kho ban dau trong bo nho RAM
        # Khong commit doc lap vao database truoc vong lap de tranh trang thai do dang neu ngay dau that bai
        inventory = {p["ma_sp"]: random.randint(300, 1000) for p in products}
    else:
        inventory = get_carryover_inventory(conn, branch, start_date, products, initial_max_date=initial_max_date)

    total_days = (end_date - start_date).days + 1
    generated_days_count = 0
    skipped_days_count = 0

    for day_offset in range(total_days):
        current_date = start_date + timedelta(days=day_offset)
        date_str = current_date.strftime("%Y%m%d")
        current_datetime = datetime.combine(current_date, datetime.min.time())

        # KIEM TRA TRUNG LAP & TINH DAY DU: Neu ngay da ton tai trong lich_su_ton_kho
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) FROM lich_su_ton_kho
                WHERE ma_kho = %s AND ngay = %s
                """,
                (ma_kho, current_date)
            )
            exists_count = cur.fetchone()[0]

            if exists_count > 0:
                cur.execute(
                    """
                    SELECT ma_sp, ton_cuoi FROM lich_su_ton_kho
                    WHERE ma_kho = %s AND ngay = %s
                    """,
                    (ma_kho, current_date)
                )
                rows = cur.fetchall()
                expected_product_count = len(products)
                actual_product_count = len(rows)

                expected_sp_set = {p["ma_sp"] for p in products}
                actual_sp_set = {r[0] for r in rows}

                if actual_product_count == expected_product_count and actual_sp_set == expected_sp_set:
                    print(
                        f"[{branch}] Ngay {current_date.strftime('%Y-%m-%d')} DA TON TAI DAY DU "
                        f"({actual_product_count}/{expected_product_count} san pham). Bo qua de tranh sinh trung!"
                    )
                    for sp, ton_c in rows:
                        inventory[sp] = int(ton_c)
                    skipped_days_count += 1
                    continue
                else:
                    raise RuntimeError(
                        f"[{branch}] DU LIEU LICH SU KHONG DAY DU: Ngay {current_date.strftime('%Y-%m-%d')} "
                        f"chi co {actual_product_count}/{expected_product_count} san pham hop le trong lich_su_ton_kho. "
                        f"Script khong the bo qua vi se gay sai lech so du cac ngay tiep theo. "
                        f"Vui long kiem tra hoac don dep du lieu do dang cua ngay nay truoc khi chay tiep."
                    )

        # Xac dinh xem ngay hien tai co duoc phep cap nhat ton_kho hien tai khong
        # Chi cap nhat ton_kho khi:
        # - mode == "full"
        # - Hoac mode == "append" va:
        #   + Kho chua co lich su cu (initial_max_date is None)
        #   + Hoac dot chay nay huong toi tuong lai (end_date >= initial_max_date) va ngay dang sinh dat moc moi (current_date >= initial_max_date)
        should_update_ton_kho = False
        if mode == "full":
            should_update_ton_kho = True
        elif mode == "append":
            if initial_max_date is None:
                should_update_ton_kho = True
            elif end_date >= initial_max_date and current_date >= initial_max_date:
                should_update_ton_kho = True

        # BAT DAU TRANSACTION CHO TOAN BO CAC THAO TAC TRONG NGAY
        opening_inventory = inventory.copy()
        inventory_before_day = inventory.copy()
        daily_import = {p["ma_sp"]: 0 for p in products}
        daily_export = {p["ma_sp"]: 0 for p in products}

        try:
            # 1. SINH PHIEU NHAP (2 - 4 phieu / ngay)
            num_imports = random.randint(2, 4)
            for import_idx in range(num_imports):
                ma_phieu_nhap = f"PN-{branch}-{date_str}-{import_idx + 1:02d}"
                supplier_id = random.randint(1, 5)
                ngay_nhap = current_datetime + timedelta(hours=random.randint(7, 16), minutes=random.randint(0, 59))

                low_stock_products = [p for p in products if inventory[p["ma_sp"]] <= p["ton_toi_thieu"]]
                normal_products = [p for p in products if p not in low_stock_products]

                items_to_import = []
                if low_stock_products:
                    items_to_import.extend(random.sample(low_stock_products, min(len(low_stock_products), 2)))
                if normal_products and len(items_to_import) < 3:
                    items_to_import.extend(random.sample(normal_products, min(len(normal_products), 3 - len(items_to_import))))

                if not items_to_import:
                    items_to_import = random.sample(products, 2)

                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO phieu_nhap (ma_phieu_nhap, ma_kho, ma_ncc, ngay_nhap, trang_thai)
                        VALUES (%s, %s, %s, %s, 'HOAN_THANH')
                        ON CONFLICT (ma_phieu_nhap) DO NOTHING
                        """,
                        (ma_phieu_nhap, ma_kho, f"NCC{supplier_id:03d}", ngay_nhap)
                    )

                    for p in items_to_import:
                        ma_sp = p["ma_sp"]
                        prof = p["profile"]
                        so_luong = random.randint(prof["import_range"][0], prof["import_range"][1])
                        don_gia = p["gia_nhap"]

                        cur.execute(
                            """
                            INSERT INTO ct_phieu_nhap (ma_phieu_nhap, ma_sp, so_luong, don_gia)
                            VALUES (%s, %s, %s, %s)
                            ON CONFLICT (ma_phieu_nhap, ma_sp) DO NOTHING
                            """,
                            (ma_phieu_nhap, ma_sp, so_luong, don_gia)
                        )

                        inventory[ma_sp] += so_luong
                        daily_import[ma_sp] += so_luong

                        cur.execute(
                            """
                            INSERT INTO stock_ledger (ma_kho, ma_sp, loai_giao_dich, so_luong, so_luong_thay_doi, ma_chung_tu, thoi_gian, nguoi_thuc_hien)
                            VALUES (%s, %s, 'NHAP', %s, %s, %s, %s, 'SIMULATOR')
                            """,
                            (ma_kho, ma_sp, so_luong, so_luong, ma_phieu_nhap, ngay_nhap)
                        )
                    # Da loai bo conn.commit() trung gian de dam bao tinh nguyen tu theo ngay

            # 2. SINH PHIEU XUAT (8 - 12 phieu / ngay) - THEO PROFILE SAN PHAM
            num_exports = random.randint(8, 12)
            for export_idx in range(num_exports):
                ma_phieu_xuat = f"PX-{branch}-{date_str}-{export_idx + 1:02d}"
                customer_id = random.randint(1, 100)
                ngay_xuat = current_datetime + timedelta(hours=random.randint(8, 20), minutes=random.randint(0, 59))

                candidate_products = []
                for p in products:
                    ma_sp = p["ma_sp"]
                    if inventory[ma_sp] > 0:
                        prob = p["profile"]["export_prob"]
                        if random.random() <= prob:
                            candidate_products.append(p)

                if not candidate_products:
                    candidate_products = [p for p in products if inventory[p["ma_sp"]] > 0][:2]

                if not candidate_products:
                    continue

                selected_products = random.sample(candidate_products, min(len(candidate_products), random.randint(1, 3)))

                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO phieu_xuat (ma_phieu_xuat, ma_kho, ma_kh, ngay_xuat, trang_thai)
                        VALUES (%s, %s, %s, %s, 'HOAN_THANH')
                        ON CONFLICT (ma_phieu_xuat) DO NOTHING
                        """,
                        (ma_phieu_xuat, ma_kho, f"KH{customer_id:04d}", ngay_xuat)
                    )

                    for p in selected_products:
                        ma_sp = p["ma_sp"]
                        prof = p["profile"]
                        qty_min, qty_max = prof["export_range"]
                        desired_qty = random.randint(qty_min, qty_max)
                        so_luong = min(desired_qty, inventory[ma_sp])

                        if so_luong <= 0:
                            continue

                        don_gia = p["gia_ban"]

                        cur.execute(
                            """
                            INSERT INTO ct_phieu_xuat (ma_phieu_xuat, ma_sp, so_luong, don_gia)
                            VALUES (%s, %s, %s, %s)
                            ON CONFLICT (ma_phieu_xuat, ma_sp) DO NOTHING
                            """,
                            (ma_phieu_xuat, ma_sp, so_luong, don_gia)
                        )

                        inventory[ma_sp] -= so_luong
                        daily_export[ma_sp] += so_luong

                        cur.execute(
                            """
                            INSERT INTO stock_ledger (ma_kho, ma_sp, loai_giao_dich, so_luong, so_luong_thay_doi, ma_chung_tu, thoi_gian, nguoi_thuc_hien)
                            VALUES (%s, %s, 'XUAT', %s, %s, %s, %s, 'SIMULATOR')
                            """,
                            (ma_kho, ma_sp, so_luong, -so_luong, ma_phieu_xuat, ngay_xuat)
                        )
                    # Da loai bo conn.commit() trung gian de dam bao tinh nguyen tu theo ngay

            # 3. KIEM TRA BAT BIEN KE TOAN VA GHI LICH SU TON KHO
            with conn.cursor() as cur:
                for p in products:
                    ma_sp = p["ma_sp"]
                    ton_dau = opening_inventory[ma_sp]
                    nhap = daily_import[ma_sp]
                    xuat = daily_export[ma_sp]
                    ton_cuoi = inventory[ma_sp]

                    expected_ton = ton_dau + nhap - xuat
                    if ton_cuoi != expected_ton:
                        raise ValueError(
                            f"[{branch}] VI PHAM KE TOAN KHO tai ngay {current_date}: "
                            f"SP={ma_sp}, TonDau={ton_dau}, Nhap={nhap}, Xuat={xuat}, TonCuoi={ton_cuoi}, Expected={expected_ton}"
                        )
                    if ton_cuoi < 0:
                        raise ValueError(f"[{branch}] PHAT HIEN TON AM tai ngay {current_date}: SP={ma_sp}, Ton={ton_cuoi}")

                    cur.execute(
                        """
                        INSERT INTO lich_su_ton_kho (ma_kho, ma_sp, ngay, ton_dau, nhap, xuat, dieu_chuyen_vao, dieu_chuyen_ra, ton_cuoi)
                        VALUES (%s, %s, %s, %s, %s, %s, 0, 0, %s)
                        ON CONFLICT (ma_kho, ma_sp, ngay) DO UPDATE SET
                            ton_dau = EXCLUDED.ton_dau,
                            nhap = EXCLUDED.nhap,
                            xuat = EXCLUDED.xuat,
                            ton_cuoi = EXCLUDED.ton_cuoi
                        """,
                        (ma_kho, ma_sp, current_date, ton_dau, nhap, xuat, ton_cuoi)
                    )

                if should_update_ton_kho:
                    for ma_sp, so_luong in inventory.items():
                        cur.execute(
                            """
                            INSERT INTO ton_kho (ma_kho, ma_sp, so_luong, cap_nhat_luc)
                            VALUES (%s, %s, %s, %s)
                            ON CONFLICT (ma_kho, ma_sp) DO UPDATE SET
                                so_luong = EXCLUDED.so_luong,
                                cap_nhat_luc = EXCLUDED.cap_nhat_luc
                            """,
                            (ma_kho, ma_sp, so_luong, current_datetime + timedelta(hours=23, minutes=59))
                        )

            # CAM KET TOAN BO THAO TAC CUA NGAY TRONG 1 TRANSACTION DUY NHAT
            conn.commit()
            generated_days_count += 1

        except Exception as e:
            # ROLLBACK TOAN BO THAY DOI CUA NGAY VA KHOI PHUC INVENTORY IN-MEMORY
            conn.rollback()
            inventory = inventory_before_day
            print(f"[{branch}] LOI NGHIEP VU tai ngay {current_date.strftime('%Y-%m-%d')}: {e}")
            print(f"[{branch}] -> DA ROLLBACK toan bo thao tac trong ngay {current_date.strftime('%Y-%m-%d')}.")
            raise

    print(f"[{branch}] -> Ket qua: Da sinh moi {generated_days_count} ngay, Bo qua {skipped_days_count} ngay da co.")

def sync_branch_to_central(branch, start_date, end_date):
    node_cfg = DB_CONFIG[branch]
    ma_kho = node_cfg["ma_kho"]
    source_node = node_cfg["node_name"]

    print(f"[{branch}] Dong bo du lieu sang Central Database ({start_date} -> {end_date})...")

    with get_node_connection(branch) as node_conn, get_central_connection() as central_conn:
        with node_conn.cursor() as n_cur, central_conn.cursor() as c_cur:
            n_cur.execute(
                """
                SELECT px.ma_phieu_xuat, px.ma_kho, ct.ma_sp, px.ngay_xuat, ct.so_luong, ct.don_gia, (ct.so_luong * ct.don_gia)
                FROM phieu_xuat px
                JOIN ct_phieu_xuat ct ON px.ma_phieu_xuat = ct.ma_phieu_xuat
                WHERE px.ma_kho = %s AND px.ngay_xuat >= %s AND px.ngay_xuat <= %s
                """,
                (ma_kho, start_date, datetime.combine(end_date, datetime.max.time()))
            )
            exports = n_cur.fetchall()

            for exp in exports:
                c_cur.execute(
                    """
                    INSERT INTO xuat_hang_central (ma_phieu_xuat, ma_kho, ma_sp, ngay_xuat, so_luong, don_gia, thanh_tien, source_node)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (ma_phieu_xuat, ma_kho, ma_sp, source_node) DO UPDATE SET
                        ngay_xuat = EXCLUDED.ngay_xuat,
                        so_luong = EXCLUDED.so_luong,
                        don_gia = EXCLUDED.don_gia,
                        thanh_tien = EXCLUDED.thanh_tien
                    """,
                    (exp[0], exp[1], exp[2], exp[3], exp[4], exp[5], exp[6], source_node)
                )

            n_cur.execute(
                """
                SELECT pn.ma_phieu_nhap, pn.ma_kho, ct.ma_sp, pn.ngay_nhap, ct.so_luong, ct.don_gia, (ct.so_luong * ct.don_gia)
                FROM phieu_nhap pn
                JOIN ct_phieu_nhap ct ON pn.ma_phieu_nhap = ct.ma_phieu_nhap
                WHERE pn.ma_kho = %s AND pn.ngay_nhap >= %s AND pn.ngay_nhap <= %s
                """,
                (ma_kho, start_date, datetime.combine(end_date, datetime.max.time()))
            )
            imports = n_cur.fetchall()

            for imp in imports:
                c_cur.execute(
                    """
                    INSERT INTO nhap_hang_central (ma_phieu_nhap, ma_kho, ma_sp, ngay_nhap, so_luong, don_gia, thanh_tien, source_node)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (ma_phieu_nhap, ma_kho, ma_sp, source_node) DO UPDATE SET
                        ngay_nhap = EXCLUDED.ngay_nhap,
                        so_luong = EXCLUDED.so_luong,
                        don_gia = EXCLUDED.don_gia,
                        thanh_tien = EXCLUDED.thanh_tien
                    """,
                    (imp[0], imp[1], imp[2], imp[3], imp[4], imp[5], imp[6], source_node)
                )

            n_cur.execute(
                """
                SELECT ma_kho, ma_sp, so_luong, cap_nhat_luc
                FROM ton_kho
                WHERE ma_kho = %s
                """,
                (ma_kho,)
            )
            stocks = n_cur.fetchall()

            for st in stocks:
                c_cur.execute(
                    """
                    INSERT INTO ton_kho_central (ma_kho, ma_sp, so_luong, cap_nhat_luc, source_node)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (ma_kho, ma_sp) DO UPDATE SET
                        so_luong = EXCLUDED.so_luong,
                        cap_nhat_luc = EXCLUDED.cap_nhat_luc,
                        source_node = EXCLUDED.source_node
                    """,
                    (st[0], st[1], st[2], st[3], source_node)
                )

            n_cur.execute(
                """
                SELECT ma_kho, ma_sp, ngay, ton_dau, nhap, xuat,
                       dieu_chuyen_vao, dieu_chuyen_ra, ton_cuoi
                FROM lich_su_ton_kho
                WHERE ma_kho = %s AND ngay >= %s AND ngay <= %s
                """,
                (ma_kho, start_date, end_date)
            )
            history = n_cur.fetchall()

            for entry in history:
                c_cur.execute(
                    """
                    INSERT INTO lich_su_ton_kho_central
                        (ma_kho, ma_sp, ngay, ton_dau, nhap, xuat,
                         dieu_chuyen_vao, dieu_chuyen_ra, ton_cuoi, source_node)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (ma_kho, ma_sp, ngay) DO UPDATE SET
                        ton_dau = EXCLUDED.ton_dau,
                        nhap = EXCLUDED.nhap,
                        xuat = EXCLUDED.xuat,
                        dieu_chuyen_vao = EXCLUDED.dieu_chuyen_vao,
                        dieu_chuyen_ra = EXCLUDED.dieu_chuyen_ra,
                        ton_cuoi = EXCLUDED.ton_cuoi,
                        source_node = EXCLUDED.source_node
                    """,
                    (*entry, source_node)
                )

            central_conn.commit()
            print(
                f"[{branch}] -> Dong bo thanh cong: {len(exports)} dong xuat, "
                f"{len(imports)} dong nhap, {len(history)} dong lich su sang Central."
            )

def parse_args():
    parser = argparse.ArgumentParser(
        description="Warehouse Data Generator & Simulator (Support Append Mode & Product Profiles)"
    )
    parser.add_argument(
        "--mode",
        choices=["append", "full"],
        default="append",
        help="Che do chay: 'append' (bo sung khoang ngay) hoac 'full' (tao lai 365 ngay)."
    )
    parser.add_argument(
        "--start-date",
        type=str,
        default=None,
        help="Ngay bat dau (YYYY-MM-DD). Trong append mode, mac dinh lay max(ngay) + 1."
    )
    parser.add_argument(
        "--end-date",
        type=str,
        default=None,
        help="Ngay ket thuc (YYYY-MM-DD). Mac dinh: 30 ngay toi voi append, hom nay voi full."
    )
    parser.add_argument(
        "--use-current-stock-opening",
        action="store_true",
        help="Dung ton_kho hien tai lam moc dau ky moi trong append mode; giu nguyen lich su cu."
    )
    parser.add_argument(
        "--branches",
        type=str,
        default="HN,DN,HCM",
        help="Danh sach cac chi nhanh can sinh (HN,DN,HCM)."
    )
    parser.add_argument(
        "--sync-central",
        action="store_true",
        default=True,
        help="Dong bo ngay du lieu sinh sang Central Database (Port 5436)."
    )
    parser.add_argument(
        "--no-sync-central",
        dest="sync_central",
        action="store_false",
        help="Khong dong bo sang Central Database."
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=RANDOM_SEED,
        help="Seed ngau nhien (mac dinh: 42)."
    )
    return parser.parse_args()

def main():
    args = parse_args()
    random.seed(args.seed)

    print("=" * 70)
    print("WAREHOUSE MANAGEMENT - DATA GENERATOR & SIMULATOR (EXPANDED)")
    print("=" * 70)
    print(f"Che do         : {args.mode.upper()}")
    print(f"Seed           : {args.seed}")
    print(f"Dong bo Central: {'CO' if args.sync_central else 'KHONG'}")

    products = generate_products()
    branches = [b.strip().upper() for b in args.branches.split(",") if b.strip().upper() in DB_CONFIG]
    if not branches:
        raise ValueError("Khong co chi nhanh hop le nao de sinh du lieu.")
    if args.use_current_stock_opening and args.mode != "append":
        raise ValueError("--use-current-stock-opening chi dung voi --mode append.")

    for branch in branches:
        print("\n" + "-" * 60)
        print(f"XU LY NODE: {branch} ({DB_CONFIG[branch]['ma_kho']})")
        print("-" * 60)

        with get_node_connection(branch) as conn:
            if args.mode == "full":
                check_node_empty_for_full_mode(conn, branch)

            insert_master_data(conn, branch, products)

            opening_date = None
            if args.use_current_stock_opening:
                opening_date = record_current_stock_opening_balance(
                    conn, branch, products
                )

            if args.mode == "append":
                if args.start_date:
                    start_d = datetime.strptime(args.start_date, "%Y-%m-%d").date()
                else:
                    with conn.cursor() as cur:
                        cur.execute("SELECT MAX(ngay) FROM lich_su_ton_kho WHERE ma_kho = %s", (DB_CONFIG[branch]["ma_kho"],))
                        row = cur.fetchone()
                        max_d = row[0] if row else None
                        if max_d:
                            start_d = max_d + timedelta(days=1)
                        else:
                            start_d = date(2025, 10, 9)

                if args.end_date:
                    end_d = datetime.strptime(args.end_date, "%Y-%m-%d").date()
                else:
                    end_d = date.today() + timedelta(days=30)

                if opening_date is not None and start_d <= opening_date:
                    raise ValueError(
                        f"[{branch}] Ngay bat dau {start_d} phai sau moc dau ky "
                        f"{opening_date}."
                    )
                if start_d > end_d:
                    print(f"[{branch}] start_date ({start_d}) > end_date ({end_d}). Node nay da du du lieu, khong can sinh them.")
                else:
                    generate_date_range_transactions(conn, branch, products, start_d, end_d, mode="append")

            else:
                end_d = datetime.strptime(args.end_date, "%Y-%m-%d").date() if args.end_date else date.today()
                start_d = end_d - timedelta(days=364)
                generate_date_range_transactions(conn, branch, products, start_d, end_d, mode="full")

        if args.sync_central:
            sync_start_date = opening_date or start_d
            if sync_start_date <= end_d:
                sync_branch_to_central(branch, sync_start_date, end_d)

    print("\n" + "=" * 70)
    print("HOAN TAT THUC THI DATA GENERATOR!")
    print("=" * 70)

if __name__ == "__main__":
    main()
