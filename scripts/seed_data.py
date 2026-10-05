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
    """
    Sinh dữ liệu nhập/xuất trong NUMBER_OF_DAYS ngày.

    Quy tắc nghiệp vụ:
        Tồn cuối ngày = Tồn đầu ngày + Nhập - Xuất

    Dữ liệu được ghi vào:
        1. ton_kho              : tồn hiện tại
        2. lich_su_ton_kho      : tổng hợp tồn theo ngày
        3. stock_ledger         : từng biến động nhập/xuất

    Lưu ý:
        - Tồn đầu kỳ của mỗi sản phẩm chỉ random MỘT LẦN.
        - Không random lại tồn cuối.
        - Không cho phép tồn âm.
        - Ledger sử dụng số dương cho NHAP và số âm cho XUAT.
    """

    ma_kho = WAREHOUSES[branch]["ma_kho"]
    start_date = (
        datetime.now().replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        - timedelta(days=NUMBER_OF_DAYS - 1)
    )

    # =========================================================
    # 1. TỒN ĐẦU KỲ
    # =========================================================

    # Mỗi sản phẩm chỉ xác định tồn đầu kỳ MỘT LẦN.
    # Từ đây trở đi mọi tồn kho đều được tính dựa trên biến inventory.
    inventory = {
        product["ma_sp"]: random.randint(300, 1000)
        for product in products
    }

    # Kiểm tra bảng stock_ledger đã tồn tại.
    # Bảng này thuộc phần Level 2 của database.
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name = 'stock_ledger'
            )
            """
        )

        ledger_exists = cur.fetchone()[0]

        if not ledger_exists:
            raise RuntimeError(
                f"[{branch}] Chưa có bảng stock_ledger. "
                "Hãy chạy file SQL Level 2 trước khi seed dữ liệu."
            )

        # Tạo tồn ban đầu.
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
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (ma_kho, ma_sp)
                DO UPDATE SET
                    so_luong = EXCLUDED.so_luong,
                    cap_nhat_luc = EXCLUDED.cap_nhat_luc
                """,
                (
                    ma_kho,
                    ma_sp,
                    so_luong,
                    start_date,
                )
            )

        conn.commit()

    # =========================================================
    # 2. SINH DỮ LIỆU THEO NGÀY
    # =========================================================

    for day_index in range(NUMBER_OF_DAYS):

        current_date = start_date + timedelta(days=day_index)

        # Snapshot tồn đầu ngày.
        opening_inventory = inventory.copy()

        # Tổng nhập/xuất của từng sản phẩm trong ngày.
        daily_import = {
            product["ma_sp"]: 0
            for product in products
        }

        daily_export = {
            product["ma_sp"]: 0
            for product in products
        }

        # =====================================================
        # 2.1. NHẬP HÀNG
        # =====================================================

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

            selected_products = random.sample(
                products,
                random.randint(
                    1,
                    min(3, len(products))
                )
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
                    ON CONFLICT (ma_phieu_nhap) DO NOTHING
                    """,
                    (
                        ma_phieu,
                        ma_kho,
                        f"NCC{supplier:03d}",
                        ngay_nhap,
                    )
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
                        ON CONFLICT
                            (ma_phieu_nhap, ma_sp)
                        DO NOTHING
                        """,
                        (
                            ma_phieu,
                            ma_sp,
                            so_luong,
                            don_gia,
                        )
                    )

                    # Cập nhật tồn trong bộ nhớ.
                    inventory[ma_sp] += so_luong

                    # Cập nhật tổng nhập trong ngày.
                    daily_import[ma_sp] += so_luong

                    # Ghi ledger.
                    cur.execute(
                        """
                        INSERT INTO stock_ledger
                        (
                            ma_kho,
                            ma_sp,
                            loai_giao_dich,
                            so_luong,
                            so_luong_thay_doi,
                            ma_chung_tu,
                            thoi_gian,
                            nguoi_thuc_hien
                        )
                        VALUES
                        (
                            %s, %s, 'NHAP',
                            %s, %s, %s, %s, %s
                        )
                        """,
                        (
                            ma_kho,
                            ma_sp,
                            so_luong,
                            so_luong,
                            ma_phieu,
                            ngay_nhap,
                            "SYSTEM_SEED",
                        )
                    )

                conn.commit()

        # =====================================================
        # 2.2. XUẤT HÀNG
        # =====================================================

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

            # Chỉ chọn sản phẩm còn tồn.
            available_products = [
                product
                for product in products
                if inventory[product["ma_sp"]] > 0
            ]

            if not available_products:
                continue

            selected_products = random.sample(
                available_products,
                random.randint(
                    1,
                    min(3, len(available_products))
                )
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
                    ON CONFLICT (ma_phieu_xuat) DO NOTHING
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

                    # Không cho phép xuất vượt quá tồn.
                    max_export = min(
                        random.randint(1, 30),
                        inventory[ma_sp]
                    )

                    so_luong = max_export

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
                        ON CONFLICT
                            (ma_phieu_xuat, ma_sp)
                        DO NOTHING
                        """,
                        (
                            ma_phieu,
                            ma_sp,
                            so_luong,
                            don_gia,
                        )
                    )

                    # Trừ tồn.
                    inventory[ma_sp] -= so_luong

                    # Tổng xuất trong ngày.
                    daily_export[ma_sp] += so_luong

                    # Ghi ledger.
                    cur.execute(
                        """
                        INSERT INTO stock_ledger
                        (
                            ma_kho,
                            ma_sp,
                            loai_giao_dich,
                            so_luong,
                            so_luong_thay_doi,
                            ma_chung_tu,
                            thoi_gian,
                            nguoi_thuc_hien
                        )
                        VALUES
                        (
                            %s, %s, 'XUAT',
                            %s, %s, %s, %s, %s
                        )
                        """,
                        (
                            ma_kho,
                            ma_sp,
                            so_luong,
                            -so_luong,
                            ma_phieu,
                            ngay_xuat,
                            "SYSTEM_SEED",
                        )
                    )

                conn.commit()

        # =====================================================
        # 2.3. GHI LỊCH SỬ TỒN KHO THEO NGÀY
        # =====================================================

        with conn.cursor() as cur:

            for product in products:

                ma_sp = product["ma_sp"]

                ton_dau = opening_inventory[ma_sp]
                nhap = daily_import[ma_sp]
                xuat = daily_export[ma_sp]
                ton_cuoi = inventory[ma_sp]

                # =================================================
                # KIỂM TRA CÔNG THỨC TỒN
                # =================================================

                expected_final = (
                    ton_dau
                    + nhap
                    - xuat
                )

                if ton_cuoi != expected_final:
                    raise ValueError(
                        f"[{branch}] Sai cân bằng tồn kho "
                        f"SP={ma_sp}, "
                        f"ngày={current_date.date()}: "
                        f"ton_dau={ton_dau}, "
                        f"nhap={nhap}, "
                        f"xuat={xuat}, "
                        f"ton_cuoi={ton_cuoi}, "
                        f"expected={expected_final}"
                    )

                if ton_cuoi < 0:
                    raise ValueError(
                        f"[{branch}] Phát hiện tồn âm "
                        f"SP={ma_sp}: {ton_cuoi}"
                    )

                # =================================================
                # GHI LỊCH SỬ
                # =================================================

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
                        %s, %s, %s,
                        0, 0, %s
                    )
                    ON CONFLICT DO NOTHING
                    """,
                    (
                        ma_kho,
                        ma_sp,
                        current_date.date(),
                        ton_dau,
                        nhap,
                        xuat,
                        ton_cuoi,
                    )
                )

            conn.commit()

        # =====================================================
        # 2.4. CẬP NHẬT TỒN HIỆN TẠI
        # =====================================================

        with conn.cursor() as cur:

            for ma_sp, so_luong in inventory.items():

                cur.execute(
                    """
                    UPDATE ton_kho
                    SET
                        so_luong = %s,
                        cap_nhat_luc = %s
                    WHERE ma_kho = %s
                      AND ma_sp = %s
                    """,
                    (
                        so_luong,
                        current_date + timedelta(
                            hours=23,
                            minutes=59
                        ),
                        ma_kho,
                        ma_sp,
                    )
                )

            conn.commit()

        if (day_index + 1) % 30 == 0:

            print(
                f"[{branch}] "
                f"Đã sinh {day_index + 1}/"
                f"{NUMBER_OF_DAYS} ngày"
            )

    # =========================================================
    # 3. KIỂM TRA CUỐI CÙNG
    # =========================================================

    with conn.cursor() as cur:

        cur.execute(
            """
            SELECT
                COUNT(*),
                COALESCE(SUM(so_luong), 0)
            FROM ton_kho
            WHERE ma_kho = %s
            """,
            (ma_kho,)
        )

        row_count, total_inventory = cur.fetchone()

        print(
            f"[{branch}] "
            f"Kiểm tra tồn cuối: "
            f"{row_count} sản phẩm, "
            f"tổng tồn = {total_inventory}"
        )

    print(
        f"[{branch}] "
        f"Hoàn tất sinh {NUMBER_OF_DAYS} ngày dữ liệu."
    )


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

            print(f"[{branch}] Đã sinh dữ liệu giao dịch + lịch sử + ledger")

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