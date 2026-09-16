import os
import random
from datetime import datetime, timedelta

import psycopg


# =========================================================
# CẤU HÌNH
# =========================================================

RANDOM_SEED = 42
random.seed(RANDOM_SEED)

# Số ngày dữ liệu lịch sử
NUMBER_OF_DAYS = 365

# Số phiếu nhập / ngày / kho
IMPORTS_PER_DAY = 3

# Số phiếu xuất / ngày / kho
EXPORTS_PER_DAY = 10

# Số sản phẩm
NUMBER_OF_PRODUCTS = 20

# =========================================================
# DATABASE
# Chạy Python từ máy Windows nên dùng localhost + port
# =========================================================

DB_CONFIG = {
    "HN": {
        "host": "localhost",
        "port": 5433,
        "dbname": "warehouse_hn",
    },
    "DN": {
        "host": "localhost",
        "port": 5434,
        "dbname": "warehouse_dn",
    },
    "HCM": {
        "host": "localhost",
        "port": 5435,
        "dbname": "warehouse_hcm",
    },
}

DB_USER = os.getenv("POSTGRES_USER", "admin")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "admin123")


# =========================================================
# THÔNG TIN KHO
# =========================================================

WAREHOUSES = {
    "HN": {
        "ma_kho": "HN01",
        "ten_kho": "Kho Hà Nội",
        "dia_chi": "Hà Nội",
        "thanh_pho": "Hà Nội",
    },
    "DN": {
        "ma_kho": "DN01",
        "ten_kho": "Kho Đà Nẵng",
        "dia_chi": "Đà Nẵng",
        "thanh_pho": "Đà Nẵng",
    },
    "HCM": {
        "ma_kho": "HCM01",
        "ten_kho": "Kho Hồ Chí Minh",
        "dia_chi": "TP. Hồ Chí Minh",
        "thanh_pho": "Hồ Chí Minh",
    },
}


# =========================================================
# NHÓM SẢN PHẨM
# =========================================================

PRODUCT_GROUPS = [
    ("N01", "Điện tử"),
    ("N02", "Gia dụng"),
    ("N03", "Văn phòng phẩm"),
]


# =========================================================
# TẠO SẢN PHẨM
# =========================================================

def generate_products():
    products = []

    product_names = [
        "Laptop Dell",
        "Laptop HP",
        "Laptop Lenovo",
        "Chuột Logitech",
        "Chuột Microsoft",
        "Bàn phím Logitech",
        "Bàn phím Dell",
        "Màn hình Samsung",
        "Màn hình LG",
        "Tai nghe Sony",
        "Tai nghe JBL",
        "USB 32GB",
        "USB 64GB",
        "Ổ cứng SSD 500GB",
        "Ổ cứng SSD 1TB",
        "Máy in Canon",
        "Máy in HP",
        "Webcam Logitech",
        "Loa Bluetooth",
        "Router Wifi",
    ]

    for i in range(NUMBER_OF_PRODUCTS):
        ma_sp = f"SP{i + 1:03d}"
        ten_sp = product_names[i]

        if i < 15:
            ma_nhom = "N01"
            don_vi = "Cái"

            gia_nhap = random.choice([
                300000,
                500000,
                1000000,
                3000000,
                5000000,
                8000000,
                15000000,
            ])

        elif i < 18:
            ma_nhom = "N02"
            don_vi = "Cái"

            gia_nhap = random.choice([
                500000,
                1000000,
                2000000,
                3000000,
            ])

        else:
            ma_nhom = "N03"
            don_vi = "Cái"

            gia_nhap = random.choice([
                50000,
                100000,
                200000,
                300000,
            ])

        gia_ban = int(gia_nhap * random.uniform(1.15, 1.40))

        ton_toi_thieu = random.randint(20, 100)

        ton_an_toan = ton_toi_thieu * random.randint(2, 4)

        products.append({
            "ma_sp": ma_sp,
            "ten_sp": ten_sp,
            "ma_nhom": ma_nhom,
            "don_vi": don_vi,
            "gia_nhap": gia_nhap,
            "gia_ban": gia_ban,
            "ton_toi_thieu": ton_toi_thieu,
            "ton_an_toan": ton_an_toan,
        })

    return products


# =========================================================
# KẾT NỐI DATABASE
# =========================================================

def get_connection(branch):

    config = DB_CONFIG[branch]

    return psycopg.connect(
        host=config["host"],
        port=config["port"],
        dbname=config["dbname"],
        user=DB_USER,
        password=DB_PASSWORD
    )


# =========================================================
# INSERT DỮ LIỆU CHUNG
# =========================================================

def insert_master_data(conn, branch, products):

    warehouse = WAREHOUSES[branch]

    with conn.cursor() as cur:

        # -------------------------------------------------
        # KHO
        # -------------------------------------------------

        cur.execute(
            """
            INSERT INTO kho
            (
                ma_kho,
                ten_kho,
                dia_chi,
                thanh_pho,
                trang_thai
            )
            VALUES (%s, %s, %s, %s, 'ACTIVE')
            ON CONFLICT (ma_kho) DO NOTHING
            """,
            (
                warehouse["ma_kho"],
                warehouse["ten_kho"],
                warehouse["dia_chi"],
                warehouse["thanh_pho"],
            )
        )

        # -------------------------------------------------
        # NHÓM SẢN PHẨM
        # -------------------------------------------------

        for ma_nhom, ten_nhom in PRODUCT_GROUPS:

            cur.execute(
                """
                INSERT INTO nhom_san_pham
                (
                    ma_nhom,
                    ten_nhom
                )
                VALUES (%s, %s)
                ON CONFLICT (ma_nhom) DO NOTHING
                """,
                (ma_nhom, ten_nhom)
            )

        # -------------------------------------------------
        # SẢN PHẨM
        # -------------------------------------------------

        for p in products:

            cur.execute(
                """
                INSERT INTO san_pham
                (
                    ma_sp,
                    ten_sp,
                    ma_nhom,
                    don_vi,
                    gia_nhap,
                    gia_ban,
                    ton_toi_thieu,
                    ton_an_toan,
                    trang_thai
                )
                VALUES
                (
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, 'ACTIVE'
                )
                ON CONFLICT (ma_sp) DO NOTHING
                """,
                (
                    p["ma_sp"],
                    p["ten_sp"],
                    p["ma_nhom"],
                    p["don_vi"],
                    p["gia_nhap"],
                    p["gia_ban"],
                    p["ton_toi_thieu"],
                    p["ton_an_toan"],
                )
            )

        # -------------------------------------------------
        # NHÀ CUNG CẤP
        # -------------------------------------------------

        suppliers = [
            ("NCC001", "Công ty ABC"),
            ("NCC002", "Công ty XYZ"),
            ("NCC003", "Công ty Tech Việt"),
            ("NCC004", "Công ty Phân phối Đông Nam"),
            ("NCC005", "Công ty Thiết bị Việt"),
        ]

        for ma_ncc, ten_ncc in suppliers:

            cur.execute(
                """
                INSERT INTO nha_cung_cap
                (
                    ma_ncc,
                    ten_ncc,
                    so_dien_thoai,
                    email,
                    dia_chi
                )
                VALUES
                (%s, %s, %s, %s, %s)
                ON CONFLICT (ma_ncc) DO NOTHING
                """,
                (
                    ma_ncc,
                    ten_ncc,
                    f"090000{random.randint(1000, 9999)}",
                    f"{ma_ncc.lower()}@example.com",
                    "Việt Nam",
                )
            )

        # -------------------------------------------------
        # KHÁCH HÀNG
        # -------------------------------------------------

        for i in range(1, 101):

            ma_kh = f"KH{i:04d}"

            cur.execute(
                """
                INSERT INTO khach_hang
                (
                    ma_kh,
                    ten_kh,
                    so_dien_thoai,
                    email,
                    dia_chi
                )
                VALUES
                (%s, %s, %s, %s, %s)
                ON CONFLICT (ma_kh) DO NOTHING
                """,
                (
                    ma_kh,
                    f"Khách hàng {i}",
                    f"09{random.randint(10000000, 99999999)}",
                    f"kh{i}@example.com",
                    warehouse["thanh_pho"],
                )
            )

    conn.commit()


# =========================================================
# SINH DỮ LIỆU NHẬP / XUẤT
# =========================================================

def generate_transactions(conn, branch, products):

    ma_kho = WAREHOUSES[branch]["ma_kho"]

    start_date = datetime.now() - timedelta(days=NUMBER_OF_DAYS)

    inventory = {}

    # -----------------------------------------------------
    # TỒN ĐẦU KỲ
    # -----------------------------------------------------

    for product in products:

        inventory[product["ma_sp"]] = random.randint(100, 1000)

    with conn.cursor() as cur:

        # -------------------------------------------------
        # TẠO TỒN KHO BAN ĐẦU
        # -------------------------------------------------

        for ma_sp, so_luong in inventory.items():

            cur.execute(
                """
                INSERT INTO ton_kho
                (
                    ma_kho,
                    ma_sp,
                    so_luong,
                    cap_nhat_luc
                )
                VALUES
                (%s, %s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (ma_kho, ma_sp)
                DO UPDATE SET
                    so_luong = EXCLUDED.so_luong,
                    cap_nhat_luc = CURRENT_TIMESTAMP
                """,
                (
                    ma_kho,
                    ma_sp,
                    so_luong,
                )
            )

        conn.commit()

    # -----------------------------------------------------
    # SINH DỮ LIỆU THEO NGÀY
    # -----------------------------------------------------

    for day_index in range(NUMBER_OF_DAYS):

        current_date = start_date + timedelta(days=day_index)

        # ================================================
        # NHẬP HÀNG
        # ================================================

        for import_index in range(IMPORTS_PER_DAY):

            ma_phieu = (
                f"PN{branch}"
                f"{day_index:04d}"
                f"{import_index:02d}"
            )

            supplier = random.randint(1, 5)

            ngay_nhap = current_date + timedelta(
                hours=random.randint(7, 17)
            )

            with conn.cursor() as cur:

                cur.execute(
                    """
                    INSERT INTO phieu_nhap
                    (
                        ma_phieu_nhap,
                        ma_kho,
                        ma_ncc,
                        ngay_nhap,
                        trang_thai
                    )
                    VALUES
                    (%s, %s, %s, %s, 'HOAN_THANH')
                    """,
                    (
                        ma_phieu,
                        ma_kho,
                        f"NCC{supplier:03d}",
                        ngay_nhap,
                    )
                )

                # 1-3 sản phẩm / phiếu
                selected_products = random.sample(
                    products,
                    random.randint(1, 3)
                )

                for product in selected_products:

                    ma_sp = product["ma_sp"]

                    so_luong = random.randint(20, 150)

                    don_gia = product["gia_nhap"]

                    cur.execute(
                        """
                        INSERT INTO ct_phieu_nhap
                        (
                            ma_phieu_nhap,
                            ma_sp,
                            so_luong,
                            don_gia
                        )
                        VALUES
                        (%s, %s, %s, %s)
                        """,
                        (
                            ma_phieu,
                            ma_sp,
                            so_luong,
                            don_gia,
                        )
                    )

                    inventory[ma_sp] += so_luong

                conn.commit()

        # ================================================
        # XUẤT HÀNG
        # ================================================

        for export_index in range(EXPORTS_PER_DAY):

            ma_phieu = (
                f"PX{branch}"
                f"{day_index:04d}"
                f"{export_index:02d}"
            )

            customer = random.randint(1, 100)

            ngay_xuat = current_date + timedelta(
                hours=random.randint(8, 20)
            )

            # Chỉ chọn sản phẩm còn đủ tồn
            available_products = [
                p for p in products
                if inventory[p["ma_sp"]] > 20
            ]

            if not available_products:
                continue

            selected_products = random.sample(
                available_products,
                random.randint(1, 3)
            )

            with conn.cursor() as cur:

                cur.execute(
                    """
                    INSERT INTO phieu_xuat
                    (
                        ma_phieu_xuat,
                        ma_kho,
                        ma_kh,
                        ngay_xuat,
                        trang_thai
                    )
                    VALUES
                    (%s, %s, %s, %s, 'HOAN_THANH')
                    """,
                    (
                        ma_phieu,
                        ma_kho,
                        f"KH{customer:04d}",
                        ngay_xuat,
                    )
                )

                for product in selected_products:

                    ma_sp = product["ma_sp"]

                    # Số lượng bán có biến động
                    so_luong = random.randint(1, 30)

                    # Không cho tồn âm
                    so_luong = min(
                        so_luong,
                        inventory[ma_sp]
                    )

                    if so_luong <= 0:
                        continue

                    don_gia = product["gia_ban"]

                    cur.execute(
                        """
                        INSERT INTO ct_phieu_xuat
                        (
                            ma_phieu_xuat,
                            ma_sp,
                            so_luong,
                            don_gia
                        )
                        VALUES
                        (%s, %s, %s, %s)
                        """,
                        (
                            ma_phieu,
                            ma_sp,
                            so_luong,
                            don_gia,
                        )
                    )

                    inventory[ma_sp] -= so_luong

                conn.commit()

        # ================================================
        # GHI LỊCH SỬ TỒN KHO
        # ================================================

        with conn.cursor() as cur:

            for product in products:

                ma_sp = product["ma_sp"]

                # Lấy tồn cuối ngày
                ton_cuoi = inventory[ma_sp]

                cur.execute(
                    """
                    INSERT INTO lich_su_ton_kho
                    (
                        ma_kho,
                        ma_sp,
                        ngay,
                        ton_dau,
                        nhap,
                        xuat,
                        dieu_chuyen_vao,
                        dieu_chuyen_ra,
                        ton_cuoi
                    )
                    VALUES
                    (
                        %s, %s, %s,
                        %s, 0, 0, 0, 0, %s
                    )
                    """,
                    (
                        ma_kho,
                        ma_sp,
                        current_date.date(),
                        ton_cuoi,
                        ton_cuoi,
                    )
                )

            conn.commit()

        if (day_index + 1) % 30 == 0:

            print(
                f"[{branch}] "
                f"Đã sinh {day_index + 1}/{NUMBER_OF_DAYS} ngày"
            )


# =========================================================
# CẬP NHẬT TỒN KHO CUỐI CÙNG
# =========================================================

def update_final_inventory(conn, branch, products):

    ma_kho = WAREHOUSES[branch]["ma_kho"]

    with conn.cursor() as cur:

        for product in products:

            ma_sp = product["ma_sp"]

            cur.execute(
                """
                SELECT COALESCE(
                    SUM(ct.so_luong), 0
                )
                FROM ct_phieu_nhap ct
                JOIN phieu_nhap pn
                    ON ct.ma_phieu_nhap = pn.ma_phieu_nhap
                WHERE pn.ma_kho = %s
                  AND ct.ma_sp = %s
                """,
                (
                    ma_kho,
                    ma_sp,
                )
            )

            total_import = cur.fetchone()[0]

            cur.execute(
                """
                SELECT COALESCE(
                    SUM(ct.so_luong), 0
                )
                FROM ct_phieu_xuat ct
                JOIN phieu_xuat px
                    ON ct.ma_phieu_xuat = px.ma_phieu_xuat
                WHERE px.ma_kho = %s
                  AND ct.ma_sp = %s
                """,
                (
                    ma_kho,
                    ma_sp,
                )
            )

            total_export = cur.fetchone()[0]

            # Lấy tồn ban đầu
            initial_inventory = random.randint(100, 1000)

            final_inventory = (
                initial_inventory
                + total_import
                - total_export
            )

            if final_inventory < 0:
                final_inventory = 0

            cur.execute(
                """
                UPDATE ton_kho
                SET
                    so_luong = %s,
                    cap_nhat_luc = CURRENT_TIMESTAMP
                WHERE ma_kho = %s
                  AND ma_sp = %s
                """,
                (
                    final_inventory,
                    ma_kho,
                    ma_sp,
                )
            )

    conn.commit()


# =========================================================
# CHẠY CHO MỘT NODE
# =========================================================

def seed_branch(branch, products):

    print()
    print("=" * 60)
    print(f"BẮT ĐẦU SINH DỮ LIỆU NODE {branch}")
    print("=" * 60)

    try:

        with get_connection(branch) as conn:

            print(f"[{branch}] Kết nối PostgreSQL thành công")

            insert_master_data(
                conn,
                branch,
                products
            )

            print(f"[{branch}] Đã tạo dữ liệu danh mục")

            generate_transactions(
                conn,
                branch,
                products
            )

            print(f"[{branch}] Đã sinh dữ liệu giao dịch")

        print(f"[{branch}] HOÀN THÀNH")

    except Exception as e:

        print(f"[{branch}] LỖI:")
        print(e)


# =========================================================
# MAIN
# =========================================================

def main():

    print("=" * 60)
    print("WAREHOUSE PROJECT - DATA GENERATOR")
    print("=" * 60)

    print()
    print(f"Số sản phẩm : {NUMBER_OF_PRODUCTS}")
    print(f"Số ngày     : {NUMBER_OF_DAYS}")
    print(f"Nhập/ngày   : {IMPORTS_PER_DAY}")
    print(f"Xuất/ngày   : {EXPORTS_PER_DAY}")

    products = generate_products()

    print()
    print("Đã tạo danh sách sản phẩm.")

    for branch in ["HN", "DN", "HCM"]:

        seed_branch(
            branch,
            products
        )

    print()
    print("=" * 60)
    print("ĐÃ SINH XONG DỮ LIỆU")
    print("=" * 60)


if __name__ == "__main__":
    main()