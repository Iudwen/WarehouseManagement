import psycopg
import time
from datetime import datetime


# ============================================================
# CẤU HÌNH
# ============================================================

DB_USER = "admin"
DB_PASSWORD = "admin123"

SYNC_INTERVAL = 300

WAIT_RETRY_INTERVAL = 10

COMPENSATION_RETRY_INTERVAL = 10


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
# ĐẢM BẢO SCHEMA CENTRAL
# ============================================================

def ensure_central_schema(central_conn):

    sql = """
    CREATE TABLE IF NOT EXISTS xuat_hang_central (
        id BIGSERIAL PRIMARY KEY,
        ma_phieu_xuat VARCHAR(20) NOT NULL,
        ma_kho VARCHAR(10) NOT NULL,
        ma_sp VARCHAR(20) NOT NULL,
        ngay_xuat TIMESTAMP,
        so_luong INT NOT NULL,
        don_gia NUMERIC(15,2),
        thanh_tien NUMERIC(18,2),
        source_node VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_xuat_hang_central_key
    ON xuat_hang_central (
        ma_phieu_xuat,
        ma_kho,
        ma_sp,
        source_node
    );
    """

    with central_conn.cursor() as cursor:
        cursor.execute(sql)

    central_conn.commit()


# ============================================================
# 1. LẤY THÔNG TIN KHO
# ============================================================

def get_warehouses(node_conn):

    sql = """
        SELECT
            ma_kho,
            ten_kho,
            dia_chi,
            thanh_pho
        FROM kho
        WHERE loai_kho = 'BRANCH'
    """

    with node_conn.cursor() as cursor:
        cursor.execute(sql)
        return cursor.fetchall()


# ============================================================
# 2. LẤY THÔNG TIN SẢN PHẨM
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
# 3. LẤY DỮ LIỆU TỒN KHO
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
# 4. LẤY DỮ LIỆU NHẬP KHO
# ============================================================

def get_purchase_receipts(node_conn):

    sql = """
        SELECT
            pn.ma_phieu_nhap,
            pn.ma_kho,
            pn.ngay_nhap,
            ct.ma_sp,
            ct.so_luong,
            ct.don_gia
        FROM phieu_nhap pn
        INNER JOIN ct_phieu_nhap ct
            ON pn.ma_phieu_nhap = ct.ma_phieu_nhap
        WHERE pn.trang_thai IN (
            'CHO_NHAP',
            'DA_NHAP',
            'HOAN_THANH'
        )
        ORDER BY
            pn.ngay_nhap,
            pn.ma_phieu_nhap,
            ct.ma_sp
    """

    with node_conn.cursor() as cursor:
        cursor.execute(sql)
        return cursor.fetchall()


# ============================================================
# 5. LẤY DỮ LIỆU XUẤT KHO
# ============================================================

def get_outbound_shipments(node_conn):

    sql = """
        SELECT
            px.ma_phieu_xuat,
            px.ma_kho,
            px.ngay_xuat,
            ct.ma_sp,
            ct.so_luong,
            ct.don_gia
        FROM phieu_xuat px
        INNER JOIN ct_phieu_xuat ct
            ON px.ma_phieu_xuat = ct.ma_phieu_xuat
        WHERE px.trang_thai IN (
            'CHO_XUAT',
            'DA_XUAT',
            'HOAN_THANH'
        )
        ORDER BY
            px.ngay_xuat,
            px.ma_phieu_xuat,
            ct.ma_sp
    """

    with node_conn.cursor() as cursor:
        cursor.execute(sql)
        return cursor.fetchall()


# ============================================================
# 6. LẤY PHIẾU ĐIỀU CHUYỂN TỪ CENTRAL
# ============================================================

def get_pending_transfers(central_conn):

    sql = """
        SELECT
            id,
            ma_phieu_dc,
            kho_xuat,
            kho_nhap,
            ma_sp,
            so_luong,
            ngay_dieu_chuyen,
            trang_thai,
            source_node
        FROM dieu_chuyen_central
        WHERE trang_thai IN (
            'CHO_XU_LY',
            'CREATED',
            'PENDING'
        )
        ORDER BY
            ngay_dieu_chuyen,
            id
    """

    with central_conn.cursor() as cursor:
        cursor.execute(sql)
        return cursor.fetchall()


# ============================================================
# 7. LẤY WAITING TRANSACTION
# ============================================================

def get_waiting_transactions(node_conn):

    sql = """
        SELECT
            wait_id,
            transaction_type,
            transaction_id,
            ma_kho,
            ma_sp,
            so_luong,
            saga_id,
            ma_giao_dich_global,
            trang_thai,
            retry_count,
            max_retry_count,
            next_retry_at,
            reason,
            error_message
        FROM transaction_wait_queue
        WHERE trang_thai = 'WAITING'
          AND next_retry_at <= CURRENT_TIMESTAMP
          AND retry_count < max_retry_count
        ORDER BY
            next_retry_at,
            wait_id
    """

    with node_conn.cursor() as cursor:
        cursor.execute(sql)
        return cursor.fetchall()


# ============================================================
# 8. XỬ LÝ WAIT / RETRY TRÊN NODE
# ============================================================

def process_waiting_transactions(
    node_code,
    node_config
):

    node_name = node_config["node_name"]

    node_conn = None

    try:

        node_conn = connect_database(node_config)

        waiting = get_waiting_transactions(node_conn)

        if not waiting:
            return 0

        print()
        print(
            f"[WAIT] {node_name}: "
            f"{len(waiting)} giao dịch đến hạn retry"
        )

        for item in waiting:

            print(
                f"[WAIT] "
                f"wait_id={item[0]} | "
                f"type={item[1]} | "
                f"id={item[2]} | "
                f"retry={item[9]}/{item[10]}"
            )

        with node_conn.cursor() as cursor:

            cursor.execute(
                "SELECT sp_process_waiting_transactions(%s);",
                (WAIT_RETRY_INTERVAL,)
            )

            result = cursor.fetchone()

        node_conn.commit()

        processed_count = 0

        if result and result[0] is not None:
            processed_count = result[0]

        print(
            f"[RETRY] {node_name}: "
            f"đã xử lý {processed_count} giao dịch"
        )

        return processed_count

    except Exception as error:

        print(
            f"[WAIT ERROR] {node_name}: "
            f"{error}"
        )

        if node_conn is not None:

            try:
                node_conn.rollback()
            except Exception:
                pass

        return 0

    finally:

        if node_conn is not None:
            node_conn.close()


# ============================================================
# 9. ĐỒNG BỘ BẢNG KHO
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
# 10. ĐỒNG BỘ SẢN PHẨM
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
            cursor.execute(sql, product)

    central_conn.commit()


# ============================================================
# 11. ĐỒNG BỘ TỒN KHO
# ============================================================

def sync_inventory(
    central_conn,
    inventory,
    node_config
):

    sql = """
        INSERT INTO ton_kho_central (
            ma_kho,
            ma_sp,
            so_luong,
            cap_nhat_luc,
            source_node
        )
        VALUES (
            %s,
            %s,
            %s,
            %s,
            %s
        )
        ON CONFLICT (ma_kho, ma_sp)
        DO UPDATE SET
            so_luong = EXCLUDED.so_luong,
            cap_nhat_luc = EXCLUDED.cap_nhat_luc,
            source_node = EXCLUDED.source_node
    """

    with central_conn.cursor() as cursor:

        for item in inventory:

            cursor.execute(
                sql,
                (
                    item[0],
                    item[1],
                    item[2],
                    item[3],
                    node_config["node_name"]
                )
            )

    central_conn.commit()


# ============================================================
# 12. ĐỒNG BỘ NHẬP HÀNG
# ============================================================

def sync_purchase_receipts(
    central_conn,
    purchases,
    node_config
):

    sql = """
        INSERT INTO nhap_hang_central (
            ma_phieu_nhap,
            ma_kho,
            ma_sp,
            ngay_nhap,
            so_luong,
            don_gia,
            thanh_tien,
            source_node
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
        ON CONFLICT (
            ma_phieu_nhap,
            ma_kho,
            ma_sp,
            source_node
        )
        DO UPDATE SET
            ngay_nhap = EXCLUDED.ngay_nhap,
            so_luong = EXCLUDED.so_luong,
            don_gia = EXCLUDED.don_gia,
            thanh_tien = EXCLUDED.thanh_tien
    """

    with central_conn.cursor() as cursor:

        for purchase in purchases:

            ma_phieu_nhap = purchase[0]
            ma_kho = purchase[1]
            ngay_nhap = purchase[2]
            ma_sp = purchase[3]
            so_luong = purchase[4]
            don_gia = purchase[5]

            thanh_tien = so_luong * don_gia

            cursor.execute(
                sql,
                (
                    ma_phieu_nhap,
                    ma_kho,
                    ma_sp,
                    ngay_nhap,
                    so_luong,
                    don_gia,
                    thanh_tien,
                    node_config["node_name"]
                )
            )

    central_conn.commit()


# ============================================================
# 13. ĐỒNG BỘ XUẤT HÀNG
# ============================================================

def sync_outbound_shipments(
    central_conn,
    shipments,
    node_config
):

    sql = """
        INSERT INTO xuat_hang_central (
            ma_phieu_xuat,
            ma_kho,
            ma_sp,
            ngay_xuat,
            so_luong,
            don_gia,
            thanh_tien,
            source_node
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
        ON CONFLICT (
            ma_phieu_xuat,
            ma_kho,
            ma_sp,
            source_node
        )
        DO UPDATE SET
            ngay_xuat = EXCLUDED.ngay_xuat,
            so_luong = EXCLUDED.so_luong,
            don_gia = EXCLUDED.don_gia,
            thanh_tien = EXCLUDED.thanh_tien
    """

    with central_conn.cursor() as cursor:

        for shipment in shipments:

            ma_phieu_xuat = shipment[0]
            ma_kho = shipment[1]
            ngay_xuat = shipment[2]
            ma_sp = shipment[3]
            so_luong = shipment[4]
            don_gia = shipment[5]

            thanh_tien = so_luong * don_gia

            cursor.execute(
                sql,
                (
                    ma_phieu_xuat,
                    ma_kho,
                    ma_sp,
                    ngay_xuat,
                    so_luong,
                    don_gia,
                    thanh_tien,
                    node_config["node_name"]
                )
            )

    central_conn.commit()


# ============================================================
# 14. CẬP NHẬT NODE STATUS
# ============================================================

def update_node_status(
    central_conn,
    node_name,
    node_config,
    status,
    error_message=None,
    last_sync=False
):

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
# 15. GHI LOG ĐỒNG BỘ
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
# 16. ĐỒNG BỘ MỘT NODE
# ============================================================

def sync_node(
    node_code,
    node_config,
    central_conn
):

    node_name = node_config["node_name"]

    started_at = datetime.now()

    print()
    print("=" * 70)
    print(
        f"[{started_at}] ĐỒNG BỘ {node_name}"
    )
    print("=" * 70)

    node_conn = None

    records_processed = 0
    records_success = 0
    records_failed = 0

    try:

        node_conn = connect_database(node_config)

        print(
            f"[OK] Kết nối {node_name}"
        )

        warehouses = get_warehouses(node_conn)

        print(
            f"[DATA] Số kho: {len(warehouses)}"
        )

        products = get_products(node_conn)

        print(
            f"[DATA] Số sản phẩm: {len(products)}"
        )

        inventory = get_inventory(node_conn)

        print(
            f"[DATA] Số bản ghi tồn kho: {len(inventory)}"
        )

        purchases = get_purchase_receipts(node_conn)

        print(
            f"[DATA] Số dòng nhập hàng: {len(purchases)}"
        )

        shipments = get_outbound_shipments(node_conn)

        print(
            f"[DATA] Số dòng xuất hàng: {len(shipments)}"
        )

        records_processed = (
            len(warehouses)
            + len(products)
            + len(inventory)
            + len(purchases)
            + len(shipments)
        )

        sync_warehouses(
            central_conn,
            warehouses,
            node_config
        )

        print(
            "[SYNC] Bảng kho: OK"
        )

        sync_products(
            central_conn,
            products
        )

        print(
            "[SYNC] Bảng sản phẩm: OK"
        )

        sync_inventory(
            central_conn,
            inventory,
            node_config
        )

        print(
            "[SYNC] Bảng tồn kho: OK"
        )

        sync_purchase_receipts(
            central_conn,
            purchases,
            node_config
        )

        print(
            "[SYNC] Bảng nhập hàng: OK"
        )

        sync_outbound_shipments(
            central_conn,
            shipments,
            node_config
        )

        print(
            "[SYNC] Bảng xuất hàng: OK"
        )

        records_success = records_processed

        update_node_status(
            central_conn,
            node_name,
            node_config,
            "ONLINE",
            None,
            True
        )

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

        return True

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

        try:
            central_conn.rollback()
        except Exception:
            pass

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

            print(status_error)

            try:
                central_conn.rollback()
            except Exception:
                pass

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

            print(log_error)

            try:
                central_conn.rollback()
            except Exception:
                pass

        return False

    finally:

        if node_conn is not None:

            node_conn.close()

            print(
                f"[CLOSE] Đóng kết nối {node_name}"
            )


# ============================================================
# 17. XỬ LÝ WAIT/RETRY CHO TOÀN BỘ NODE
# ============================================================

def process_all_waiting_transactions():

    total_processed = 0

    print()
    print("=" * 70)
    print(
        "[WAIT/RETRY] KIỂM TRA HÀNG ĐỢI GIAO DỊCH"
    )
    print("=" * 70)

    for node_code, node_config in NODES.items():

        processed = process_waiting_transactions(
            node_code,
            node_config
        )

        total_processed += processed

    print()
    print(
        f"[WAIT/RETRY] Tổng số giao dịch đã xử lý: "
        f"{total_processed}"
    )

    return total_processed


# ============================================================
# 18. LẤY COMPENSATION REQUEST TỪ CENTRAL
# ============================================================

def get_pending_compensation_requests(
    central_conn,
    limit=20
):

    sql = """
        SELECT
            compensation_id,
            saga_id,
            ma_giao_dich_global,
            ma_phieu_dc,
            vwh_id,
            discrepancy_id,
            compensation_type,
            source_node,
            destination_node,
            ma_kho,
            ma_sp,
            so_luong,
            status,
            retry_count,
            max_retry_count,
            next_retry_at,
            error_message
        FROM saga_compensation_request
        WHERE status IN (
            'PENDING',
            'FAILED'
        )
          AND next_retry_at <= CURRENT_TIMESTAMP
          AND retry_count < max_retry_count
        ORDER BY
            next_retry_at,
            compensation_id
        LIMIT %s
    """

    with central_conn.cursor() as cursor:

        cursor.execute(
            sql,
            (limit,)
        )

        return cursor.fetchall()


# ============================================================
# 19. BẮT ĐẦU COMPENSATION
# ============================================================

def start_compensation(
    central_conn,
    compensation_id
):

    try:

        with central_conn.cursor() as cursor:

            cursor.execute(
                """
                SELECT sp_start_compensation(%s);
                """,
                (compensation_id,)
            )

        central_conn.commit()

        return True

    except Exception as error:

        central_conn.rollback()

        print(
            f"[COMPENSATION ERROR] "
            f"Không thể START ID={compensation_id}: "
            f"{error}"
        )

        return False


# ============================================================
# 20. ĐÁNH DẤU COMPENSATION FAILED
# ============================================================

def fail_compensation(
    central_conn,
    compensation_id,
    error_message
):

    try:

        with central_conn.cursor() as cursor:

            cursor.execute(
                """
                SELECT sp_fail_compensation(
                    %s,
                    %s,
                    %s
                );
                """,
                (
                    compensation_id,
                    error_message,
                    COMPENSATION_RETRY_INTERVAL
                )
            )

        central_conn.commit()

    except Exception as error:

        central_conn.rollback()

        print(
            f"[COMPENSATION ERROR] "
            f"Không thể FAIL ID={compensation_id}: "
            f"{error}"
        )


# ============================================================
# 21. ĐỌC COMPENSATION
# ============================================================

def process_compensation_requests(
    central_conn
):

    total = 0

    try:

        requests = get_pending_compensation_requests(
            central_conn
        )

        if not requests:

            return 0

        print()
        print("=" * 70)
        print(
            "[COMPENSATION] "
            f"Có {len(requests)} yêu cầu cần xử lý"
        )
        print("=" * 70)

        for item in requests:

            compensation_id = item[0]
            saga_id = item[1]
            global_id = item[2]
            ma_phieu_dc = item[3]
            vwh_id = item[4]
            discrepancy_id = item[5]
            compensation_type = item[6]
            source_node = item[7]
            destination_node = item[8]
            ma_kho = item[9]
            ma_sp = item[10]
            so_luong = item[11]
            status = item[12]
            retry_count = item[13]
            max_retry_count = item[14]

            print(
                f"[COMPENSATION] "
                f"ID={compensation_id} | "
                f"type={compensation_type} | "
                f"phiếu={ma_phieu_dc} | "
                f"kho={ma_kho} | "
                f"SP={ma_sp} | "
                f"SL={so_luong} | "
                f"node={source_node} | "
                f"retry={retry_count}/{max_retry_count}"
            )

            if source_node is None:

                fail_compensation(
                    central_conn,
                    compensation_id,
                    "Không xác định được source_node"
                )

                continue

            node_config = None

            for node_code, config in NODES.items():

                if config["node_name"] == source_node:

                    node_config = config
                    break

            if node_config is None:

                fail_compensation(
                    central_conn,
                    compensation_id,
                    f"Không tìm thấy cấu hình node: {source_node}"
                )

                continue

            started = start_compensation(
                central_conn,
                compensation_id
            )

            if not started:
                continue

            print(
                f"[COMPENSATION] "
                f"ID={compensation_id} "
                f"-> PROCESSING"
            )

            print(
                f"[COMPENSATION] "
                f"Node đích xử lý: {source_node}"
            )

            print(
                f"[COMPENSATION] "
                f"Loại: {compensation_type}"
            )

            print(
                "[COMPENSATION] "
                "Đang chờ procedure phía NODE xử lý."
            )

            total += 1

        return total

    except Exception as error:

        print(
            "[COMPENSATION ERROR]"
        )

        print(error)

        try:
            central_conn.rollback()
        except Exception:
            pass

        return total


# ============================================================
# 22. KIỂM TRA COMPENSATION TIMEOUT
# ============================================================

def check_compensation_timeout(
    central_conn
):

    sql = """
        SELECT
            compensation_id,
            retry_count,
            max_retry_count
        FROM saga_compensation_request
        WHERE status = 'PROCESSING'
          AND retry_count >= max_retry_count
    """

    try:

        with central_conn.cursor() as cursor:

            cursor.execute(sql)

            rows = cursor.fetchall()

        if not rows:
            return 0

        timeout_count = 0

        for row in rows:

            compensation_id = row[0]

            fail_compensation(
                central_conn,
                compensation_id,
                "Compensation vượt quá số lần retry"
            )

            timeout_count += 1

        return timeout_count

    except Exception as error:

        print(
            f"[COMPENSATION TIMEOUT ERROR] {error}"
        )

        central_conn.rollback()

        return 0


# ============================================================
# 23. KIỂM TRA CÁC PHIẾU ĐIỀU CHUYỂN
# ============================================================

def check_pending_transfers(
    central_conn
):

    try:

        transfers = get_pending_transfers(
            central_conn
        )

        print()
        print(
            f"[TRANSFER] Có {len(transfers)} "
            f"phiếu điều chuyển đang chờ xử lý"
        )

        for transfer in transfers:

            print(
                f"[TRANSFER] "
                f"{transfer[1]} | "
                f"{transfer[2]} -> {transfer[3]} | "
                f"{transfer[4]} | "
                f"SL={transfer[5]} | "
                f"STATUS={transfer[7]}"
            )

        return transfers

    except Exception as error:

        print(
            "[ERROR] Không thể đọc "
            "dieu_chuyen_central:"
        )

        print(error)

        central_conn.rollback()

        return []


# ============================================================
# 24. ĐỒNG BỘ TOÀN BỘ NODE
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

        central_conn = connect_database(
            CENTRAL
        )

        print(
            "[OK] Kết nối CENTRAL"
        )

        ensure_central_schema(
            central_conn
        )

        # ----------------------------------------------------
        # 1. SYNC 3 NODE
        # ----------------------------------------------------

        for node_code, node_config in NODES.items():

            sync_node(
                node_code,
                node_config,
                central_conn
            )

        # ----------------------------------------------------
        # 2. WAIT / RETRY
        # ----------------------------------------------------

        process_all_waiting_transactions()

        # ----------------------------------------------------
        # 3. COMPENSATION
        # ----------------------------------------------------

        process_compensation_requests(
            central_conn
        )

        # ----------------------------------------------------
        # 4. KIỂM TRA TIMEOUT
        # ----------------------------------------------------

        check_compensation_timeout(
            central_conn
        )

        # ----------------------------------------------------
        # 5. KIỂM TRA PHIẾU ĐIỀU CHUYỂN
        # ----------------------------------------------------

        check_pending_transfers(
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
# 25. MAIN
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
        f"Chu kỳ WAIT/RETRY: "
        f"{WAIT_RETRY_INTERVAL} giây"
    )

    print(
        f"Chu kỳ COMPENSATION RETRY: "
        f"{COMPENSATION_RETRY_INTERVAL} giây"
    )

    print()

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