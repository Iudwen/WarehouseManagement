import psycopg
import time
from datetime import datetime


# ============================================================
# CẤU HÌNH
# ============================================================

DB_USER = "admin"
DB_PASSWORD = "admin123"

# Đồng bộ mỗi 5 phút
SYNC_INTERVAL = 300


# ============================================================
# CÁC NODE POSTGRESQL
# ============================================================

NODES = {
    "HN": {
        "host": "postgres_hn",
        "port": 5432,
        "database": "warehouse_hn",
        "node_name": "NODE_HN"
    },

    "DN": {
        "host": "postgres_dn",
        "port": 5432,
        "database": "warehouse_dn",
        "node_name": "NODE_DN"
    },

    "HCM": {
        "host": "postgres_hcm",
        "port": 5432,
        "database": "warehouse_hcm",
        "node_name": "NODE_HCM"
    }
}


# ============================================================
# CENTRAL DATABASE
# ============================================================

CENTRAL = {
    "host": "postgres_central",
    "port": 5432,
    "database": "warehouse_central"
}


# ============================================================
# KẾT NỐI DATABASE
# ============================================================

def connect_database(config):

    return psycopg.connect(
        host=config["host"],
        port=config["port"],
        dbname=config["database"],
        user=DB_USER,
        password=DB_PASSWORD
    )


# ============================================================
# LẤY THÔNG TIN KHO
# ============================================================

def get_warehouses(node_conn):

    sql = """
        SELECT
            ma_kho,
            ten_kho,
            dia_chi,
            thanh_pho
        FROM kho
    """

    with node_conn.cursor() as cursor:
        cursor.execute(sql)
        return cursor.fetchall()


# ============================================================
# LẤY THÔNG TIN SẢN PHẨM
# ============================================================

def get_products(node_conn):

    sql = """
        SELECT
            ma_sp,
            ten_sp,
            ma_nhom,
            don_vi,
            gia_nhap,
            gia_ban,
            ton_toi_thieu,
            ton_an_toan
        FROM san_pham
    """

    with node_conn.cursor() as cursor:
        cursor.execute(sql)
        return cursor.fetchall()


# ============================================================
# LẤY DỮ LIỆU TỒN KHO
# ============================================================

def get_inventory(node_conn):

    sql = """
        SELECT
            ma_kho,
            ma_sp,
            so_luong,
            cap_nhat_luc
        FROM ton_kho
    """

    with node_conn.cursor() as cursor:
        cursor.execute(sql)
        return cursor.fetchall()


# ============================================================
# ĐỒNG BỘ BẢNG KHO
# ============================================================

def sync_warehouses(
    central_conn,
    warehouses,
    node_config
):

    sql = """
        INSERT INTO kho (
            ma_kho,
            ten_kho,
            dia_chi,
            thanh_pho,
            node_name,
            node_host,
            node_port,
            trang_thai,
            dong_bo_luc
        )
        VALUES (
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            'ONLINE',
            CURRENT_TIMESTAMP
        )

        ON CONFLICT (ma_kho)
        DO UPDATE SET
            ten_kho = EXCLUDED.ten_kho,
            dia_chi = EXCLUDED.dia_chi,
            thanh_pho = EXCLUDED.thanh_pho,
            node_name = EXCLUDED.node_name,
            node_host = EXCLUDED.node_host,
            node_port = EXCLUDED.node_port,
            trang_thai = 'ONLINE',
            dong_bo_luc = CURRENT_TIMESTAMP
    """

    with central_conn.cursor() as cursor:

        for warehouse in warehouses:

            cursor.execute(
                sql,
                (
                    warehouse[0],
                    warehouse[1],
                    warehouse[2],
                    warehouse[3],
                    node_config["node_name"],
                    node_config["host"],
                    node_config["port"]
                )
            )

    central_conn.commit()


# ============================================================
# ĐỒNG BỘ SẢN PHẨM
# ============================================================

def sync_products(
    central_conn,
    products
):

    sql = """
        INSERT INTO san_pham (
            ma_sp,
            ten_sp,
            ma_nhom,
            don_vi,
            gia_nhap,
            gia_ban,
            ton_toi_thieu,
            ton_an_toan
        )
        VALUES (
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            %s
        )

        ON CONFLICT (ma_sp)
        DO UPDATE SET
            ten_sp = EXCLUDED.ten_sp,
            ma_nhom = EXCLUDED.ma_nhom,
            don_vi = EXCLUDED.don_vi,
            gia_nhap = EXCLUDED.gia_nhap,
            gia_ban = EXCLUDED.gia_ban,
            ton_toi_thieu = EXCLUDED.ton_toi_thieu,
            ton_an_toan = EXCLUDED.ton_an_toan
    """

    with central_conn.cursor() as cursor:

        for product in products:

            cursor.execute(
                sql,
                product
            )

    central_conn.commit()


# ============================================================
# ĐỒNG BỘ TỒN KHO
# ============================================================

def sync_inventory(
    central_conn,
    inventory
):

    sql = """
        INSERT INTO ton_kho_central (
            ma_kho,
            ma_sp,
            so_luong,
            cap_nhat_luc
        )
        VALUES (
            %s,
            %s,
            %s,
            %s
        )

        ON CONFLICT (ma_kho, ma_sp)
        DO UPDATE SET
            so_luong = EXCLUDED.so_luong,
            cap_nhat_luc = EXCLUDED.cap_nhat_luc
    """

    with central_conn.cursor() as cursor:

        for item in inventory:

            cursor.execute(
                sql,
                item
            )

    central_conn.commit()


# ============================================================
# CẬP NHẬT TRẠNG THÁI NODE
# ============================================================

def update_node_status(
    central_conn,
    node_name,
    node_config,
    status,
    error_message=None,
    last_sync=False
):

    # Xác định mã kho tương ứng với node
    ma_kho_map = {
        "NODE_HN": "HN01",
        "NODE_DN": "DN01",
        "NODE_HCM": "HCM01"
    }

    ma_kho = ma_kho_map.get(node_name)

    if last_sync:

        sql = """
            INSERT INTO node_status (
                node_name,
                ma_kho,
                host,
                port,
                status,
                last_check,
                last_sync,
                error_message
            )
            VALUES (
                %s,
                %s,
                %s,
                %s,
                %s,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP,
                %s
            )

            ON CONFLICT (node_name)
            DO UPDATE SET
                ma_kho = EXCLUDED.ma_kho,
                host = EXCLUDED.host,
                port = EXCLUDED.port,
                status = EXCLUDED.status,
                last_check = CURRENT_TIMESTAMP,
                last_sync = CURRENT_TIMESTAMP,
                error_message = EXCLUDED.error_message
        """

    else:

        sql = """
            INSERT INTO node_status (
                node_name,
                ma_kho,
                host,
                port,
                status,
                last_check,
                error_message
            )
            VALUES (
                %s,
                %s,
                %s,
                %s,
                %s,
                CURRENT_TIMESTAMP,
                %s
            )

            ON CONFLICT (node_name)
            DO UPDATE SET
                ma_kho = EXCLUDED.ma_kho,
                host = EXCLUDED.host,
                port = EXCLUDED.port,
                status = EXCLUDED.status,
                last_check = CURRENT_TIMESTAMP,
                error_message = EXCLUDED.error_message
        """

    try:

        with central_conn.cursor() as cursor:

            cursor.execute(
                sql,
                (
                    node_name,
                    ma_kho,
                    node_config["host"],
                    node_config["port"],
                    status,
                    error_message
                )
            )

        central_conn.commit()

    except Exception:

        central_conn.rollback()
        raise


# ============================================================
# GHI LOG ĐỒNG BỘ
# ============================================================

def write_sync_log(
    central_conn,
    node_name,
    started_at,
    finished_at,
    records_processed,
    records_success,
    records_failed,
    status,
    error_message=None
):

    sql = """
        INSERT INTO sync_log (
            node_name,
            sync_type,
            started_at,
            finished_at,
            records_processed,
            records_success,
            records_failed,
            status,
            error_message
        )
        VALUES (
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            %s
        )
    """

    try:

        with central_conn.cursor() as cursor:

            cursor.execute(
                sql,
                (
                    node_name,
                    "FULL",
                    started_at,
                    finished_at,
                    records_processed,
                    records_success,
                    records_failed,
                    status,
                    error_message
                )
            )

        central_conn.commit()

    except Exception:

        central_conn.rollback()
        raise


# ============================================================
# ĐỒNG BỘ MỘT NODE
# ============================================================

def sync_node(
    node_code,
    node_config,
    central_conn
):

    node_name = node_config["node_name"]

    started_at = datetime.now()

    print()
    print("=" * 60)

    print(
        f"[{started_at}] "
        f"ĐỒNG BỘ {node_name}"
    )

    print("=" * 60)

    node_conn = None

    records_processed = 0
    records_success = 0
    records_failed = 0

    try:

        # ----------------------------------------------------
        # 1. Kết nối NODE
        # ----------------------------------------------------

        node_conn = connect_database(
            node_config
        )

        print(
            f"[OK] Kết nối {node_name}"
        )

        # ----------------------------------------------------
        # 2. Lấy dữ liệu KHO
        # ----------------------------------------------------

        warehouses = get_warehouses(
            node_conn
        )

        print(
            f"[DATA] Số kho: "
            f"{len(warehouses)}"
        )

        # ----------------------------------------------------
        # 3. Lấy dữ liệu SẢN PHẨM
        # ----------------------------------------------------

        products = get_products(
            node_conn
        )

        print(
            f"[DATA] Số sản phẩm: "
            f"{len(products)}"
        )

        # ----------------------------------------------------
        # 4. Lấy dữ liệu TỒN KHO
        # ----------------------------------------------------

        inventory = get_inventory(
            node_conn
        )

        print(
            f"[DATA] Số bản ghi tồn kho: "
            f"{len(inventory)}"
        )

        records_processed = (
            len(warehouses)
            + len(products)
            + len(inventory)
        )

        # ----------------------------------------------------
        # 5. ĐỒNG BỘ KHO
        # ----------------------------------------------------

        sync_warehouses(
            central_conn,
            warehouses,
            node_config
        )

        print(
            "[SYNC] Bảng kho: OK"
        )

        # ----------------------------------------------------
        # 6. ĐỒNG BỘ SẢN PHẨM
        # ----------------------------------------------------

        sync_products(
            central_conn,
            products
        )

        print(
            "[SYNC] Bảng sản phẩm: OK"
        )

        # ----------------------------------------------------
        # 7. ĐỒNG BỘ TỒN KHO
        # ----------------------------------------------------

        sync_inventory(
            central_conn,
            inventory
        )

        print(
            "[SYNC] Bảng tồn kho: OK"
        )

        records_success = records_processed

        # ----------------------------------------------------
        # 8. NODE ONLINE
        # ----------------------------------------------------

        update_node_status(
            central_conn,
            node_name,
            node_config,
            "ONLINE",
            None,
            True
        )

        # ----------------------------------------------------
        # 9. GHI LOG SUCCESS
        # ----------------------------------------------------

        finished_at = datetime.now()

        write_sync_log(
            central_conn,
            node_name,
            started_at,
            finished_at,
            records_processed,
            records_success,
            records_failed,
            "SUCCESS",
            None
        )

        print(
            f"[SUCCESS] {node_name} "
            f"đồng bộ thành công"
        )

        print(
            f"[INFO] Thành công: "
            f"{records_success}/{records_processed}"
        )

    except Exception as error:

        finished_at = datetime.now()

        print()
        print(
            f"[ERROR] {node_name}"
        )

        print(
            f"Chi tiết: {error}"
        )

        records_failed = max(
            records_processed - records_success,
            1
        )

        # ----------------------------------------------------
        # Rollback transaction Central
        # ----------------------------------------------------

        try:
            central_conn.rollback()
        except Exception:
            pass

        # ----------------------------------------------------
        # Cập nhật NODE OFFLINE
        # ----------------------------------------------------

        try:

            update_node_status(
                central_conn,
                node_name,
                node_config,
                "OFFLINE",
                str(error),
                False
            )

            print(
                f"[STATUS] {node_name} -> OFFLINE"
            )

        except Exception as status_error:

            print(
                "[ERROR] Không thể cập nhật node_status:"
            )

            print(
                status_error
            )

            try:
                central_conn.rollback()
            except Exception:
                pass

        # ----------------------------------------------------
        # GHI LOG FAILED
        # ----------------------------------------------------

        try:

            write_sync_log(
                central_conn,
                node_name,
                started_at,
                finished_at,
                records_processed,
                records_success,
                records_failed,
                "FAILED",
                str(error)
            )

            print(
                f"[LOG] Đã ghi log FAILED cho "
                f"{node_name}"
            )

        except Exception as log_error:

            print(
                "[ERROR] Không thể ghi sync_log:"
            )

            print(
                log_error
            )

            try:
                central_conn.rollback()
            except Exception:
                pass

    finally:

        if node_conn is not None:

            node_conn.close()

            print(
                f"[CLOSE] Đóng kết nối "
                f"{node_name}"
            )


# ============================================================
# ĐỒNG BỘ TOÀN BỘ HỆ THỐNG
# ============================================================

def sync_all_nodes():

    print()
    print("#" * 70)

    print(
        "        WAREHOUSE CENTRAL SYNC SERVICE"
    )

    print("#" * 70)

    print(
        f"Thời gian: {datetime.now()}"
    )

    central_conn = None

    try:

        # ----------------------------------------------------
        # KẾT NỐI CENTRAL
        # ----------------------------------------------------

        central_conn = connect_database(
            CENTRAL
        )

        print(
            "[OK] Kết nối CENTRAL"
        )

        # ----------------------------------------------------
        # ĐỒNG BỘ 3 NODE
        # ----------------------------------------------------

        for node_code, node_config in NODES.items():

            sync_node(
                node_code,
                node_config,
                central_conn
            )

        print()
        print(
            "[DONE] Hoàn tất chu kỳ đồng bộ"
        )

    except Exception as error:

        print()
        print(
            "[ERROR] Không thể kết nối CENTRAL"
        )

        print(
            f"Chi tiết: {error}"
        )

    finally:

        if central_conn is not None:

            central_conn.close()

            print(
                "[CLOSE] Đóng kết nối CENTRAL"
            )


# ============================================================
# MAIN
# ============================================================

def main():

    print()
    print("#" * 70)

    print(
        "       HỆ THỐNG ĐỒNG BỘ DỮ LIỆU KHO"
    )

    print("#" * 70)

    print(
        f"Chu kỳ đồng bộ: "
        f"{SYNC_INTERVAL} giây"
    )

    print(
        "Các node:"
    )

    for node_code, config in NODES.items():

        print(
            f"  - {node_code}: "
            f"{config['host']}:{config['port']}"
        )

    print(
        f"  - CENTRAL: "
        f"{CENTRAL['host']}:{CENTRAL['port']}"
    )

    print()
    print(
        "Service đang chạy..."
    )

    # --------------------------------------------------------
    # CHẠY LIÊN TỤC
    # --------------------------------------------------------

    while True:

        try:

            sync_all_nodes()

        except KeyboardInterrupt:

            print()
            print(
                "Đã dừng Sync Service."
            )

            break

        except Exception as error:

            print(
                f"[ERROR] {error}"
            )

        print()
        print(
            f"Chờ {SYNC_INTERVAL} giây..."
        )

        try:

            time.sleep(
                SYNC_INTERVAL
            )

        except KeyboardInterrupt:

            print()
            print(
                "Đã dừng Sync Service."
            )

            break


# ============================================================
# CHẠY CHƯƠNG TRÌNH
# ============================================================

if __name__ == "__main__":

    main()