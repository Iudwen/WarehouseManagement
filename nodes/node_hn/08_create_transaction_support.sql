-- ============================================================
-- 08_create_transaction_support.sql
-- NODE - TRANSACTION SUPPORT
--
-- Bao gồm:
--   1. Bổ sung loại kho
--   2. STOCK_RESERVATION
--   3. OUTBOX_EVENT
--   4. STOCK_LEDGER
--   5. Procedure xử lý phiếu nhập
--   6. Procedure xử lý phiếu xuất
--
-- LƯU Ý:
-- SAGA_TRANSACTION nằm tại CENTRAL.
-- NODE chỉ lưu saga_id và ma_giao_dich_global
-- dưới dạng logical ID.
--
-- Không tạo FK xuyên database.
-- ============================================================


BEGIN;


-- ============================================================
-- 1. BỔ SUNG LOẠI KHO
-- ============================================================

ALTER TABLE kho
ADD COLUMN IF NOT EXISTS loai_kho VARCHAR(20)
DEFAULT 'BRANCH';


-- Xóa constraint cũ nếu tồn tại

ALTER TABLE kho
DROP CONSTRAINT IF EXISTS chk_kho_loai;


-- Tạo constraint loại kho

ALTER TABLE kho
ADD CONSTRAINT chk_kho_loai
CHECK (
    loai_kho IN ('BRANCH', 'VIRTUAL')
);


-- Các kho hiện có mặc định là BRANCH

UPDATE kho
SET loai_kho = 'BRANCH'
WHERE loai_kho IS NULL;


-- ============================================================
-- 2. STOCK_RESERVATION
--
-- Quản lý số lượng hàng được giữ lại cho điều chuyển.
--
-- Ví dụ:
--
-- TON_KHO:
-- HN01 / SP001 = 416
--
-- Điều chuyển:
-- HN01 -> DN01
-- SP001 = 20
--
-- STOCK_RESERVATION:
-- 20 RESERVED
--
-- Số lượng có thể sử dụng cho nghiệp vụ khác:
-- 416 - 20 = 396
--
-- Khi gửi hàng:
-- RESERVED -> CONSUMED
--
-- Khi từ chối / hủy:
-- RESERVED -> RELEASED hoặc CANCELLED
--
-- saga_id và ma_giao_dich_global chỉ là logical ID.
-- Không FK tới CENTRAL.
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_reservation (

    reservation_id BIGSERIAL PRIMARY KEY,

    saga_id UUID NOT NULL,

    ma_giao_dich_global UUID,

    ma_phieu_dc VARCHAR(20) NOT NULL,

    ma_kho VARCHAR(10) NOT NULL,

    ma_sp VARCHAR(20) NOT NULL,

    so_luong_reserve INT NOT NULL,

    trang_thai VARCHAR(20) NOT NULL
        DEFAULT 'RESERVED',

    created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    released_at TIMESTAMP,

    release_reason VARCHAR(100),

    CONSTRAINT chk_stock_reservation_quantity
        CHECK (
            so_luong_reserve > 0
        ),

    CONSTRAINT chk_stock_reservation_status
        CHECK (
            trang_thai IN (
                'RESERVED',
                'RELEASED',
                'CONSUMED',
                'CANCELLED'
            )
        ),

    CONSTRAINT fk_stock_reservation_warehouse
        FOREIGN KEY (ma_kho)
        REFERENCES kho(ma_kho),

    CONSTRAINT fk_stock_reservation_product
        FOREIGN KEY (ma_sp)
        REFERENCES san_pham(ma_sp)
);


-- ============================================================
-- INDEX - STOCK_RESERVATION
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_stock_reservation_saga
ON stock_reservation(saga_id);


CREATE INDEX IF NOT EXISTS idx_stock_reservation_global
ON stock_reservation(ma_giao_dich_global);


CREATE INDEX IF NOT EXISTS idx_stock_reservation_transfer
ON stock_reservation(ma_phieu_dc);


CREATE INDEX IF NOT EXISTS idx_stock_reservation_warehouse
ON stock_reservation(ma_kho);


CREATE INDEX IF NOT EXISTS idx_stock_reservation_product
ON stock_reservation(ma_sp);


CREATE INDEX IF NOT EXISTS idx_stock_reservation_status
ON stock_reservation(trang_thai);


CREATE INDEX IF NOT EXISTS idx_stock_reservation_created
ON stock_reservation(created_at);


-- ============================================================
-- 3. OUTBOX_EVENT
--
-- Node ghi các sự kiện nghiệp vụ vào Outbox.
--
-- Central sẽ đọc các event này để cập nhật Saga.
--
-- Ví dụ event:
--
-- SOURCE_ACCEPTED
-- TRANSFER_REJECTED
-- TRANSFER_RESERVED
-- TRANSFER_SHIPPED
-- TRANSFER_RECEIVED
-- TRANSFER_DISCREPANCY
--
-- KHÔNG tạo FK:
--
-- saga_id -> saga_transaction
--
-- vì saga_transaction nằm tại CENTRAL.
-- ============================================================

CREATE TABLE IF NOT EXISTS outbox_event (

    event_id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    saga_id UUID,

    ma_giao_dich_global UUID,

    event_type VARCHAR(50) NOT NULL,

    aggregate_id VARCHAR(50) NOT NULL,

    payload JSONB NOT NULL,

    status VARCHAR(20) NOT NULL
        DEFAULT 'PENDING',

    retry_count INT NOT NULL
        DEFAULT 0,

    created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    processed_at TIMESTAMP,

    error_message TEXT,

    CONSTRAINT chk_outbox_status
        CHECK (
            status IN (
                'PENDING',
                'PROCESSING',
                'PROCESSED',
                'FAILED'
            )
        )
);


-- ============================================================
-- INDEX - OUTBOX_EVENT
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_outbox_status
ON outbox_event(status);


CREATE INDEX IF NOT EXISTS idx_outbox_saga
ON outbox_event(saga_id);


CREATE INDEX IF NOT EXISTS idx_outbox_global
ON outbox_event(ma_giao_dich_global);


CREATE INDEX IF NOT EXISTS idx_outbox_created
ON outbox_event(created_at);


CREATE INDEX IF NOT EXISTS idx_outbox_event_type
ON outbox_event(event_type);


CREATE INDEX IF NOT EXISTS idx_outbox_aggregate
ON outbox_event(aggregate_id);


-- ============================================================
-- 4. STOCK_LEDGER
--
-- Lưu toàn bộ lịch sử biến động tồn kho.
--
-- NHAP
-- XUAT
-- DIEU_CHUYEN_VAO
-- DIEU_CHUYEN_RA
-- DIEU_CHINH
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_ledger (

    id BIGSERIAL PRIMARY KEY,

    ma_kho VARCHAR(10) NOT NULL,

    ma_sp VARCHAR(20) NOT NULL,

    loai_giao_dich VARCHAR(30) NOT NULL,

    so_luong INT NOT NULL
        CHECK (so_luong > 0),

    so_luong_thay_doi INT NOT NULL,

    ma_chung_tu VARCHAR(30),

    thoi_gian TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    nguoi_thuc_hien VARCHAR(50),

    ghi_chu TEXT,

    CONSTRAINT chk_stock_ledger_type
        CHECK (
            loai_giao_dich IN (
                'NHAP',
                'XUAT',
                'DIEU_CHUYEN_VAO',
                'DIEU_CHUYEN_RA',
                'DIEU_CHINH'
            )
        ),

    CONSTRAINT fk_stock_ledger_kho
        FOREIGN KEY (ma_kho)
        REFERENCES kho(ma_kho),

    CONSTRAINT fk_stock_ledger_sp
        FOREIGN KEY (ma_sp)
        REFERENCES san_pham(ma_sp)
);


-- ============================================================
-- INDEX - STOCK_LEDGER
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_stock_ledger_kho_sp
ON stock_ledger(ma_kho, ma_sp);


CREATE INDEX IF NOT EXISTS idx_stock_ledger_thoi_gian
ON stock_ledger(thoi_gian);


CREATE INDEX IF NOT EXISTS idx_stock_ledger_loai
ON stock_ledger(loai_giao_dich);


CREATE INDEX IF NOT EXISTS idx_stock_ledger_chung_tu
ON stock_ledger(ma_chung_tu);


COMMIT;


-- ============================================================
-- 5. PROCEDURE XỬ LÝ PHIẾU NHẬP
-- ============================================================

CREATE OR REPLACE PROCEDURE sp_xu_ly_phieu_nhap(
    p_ma_phieu_nhap VARCHAR(20),
    p_nguoi_thuc_hien VARCHAR(50) DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE

    v_ma_kho VARCHAR(10);

    v_trang_thai VARCHAR(20);

    v_count INT;

    r RECORD;

    v_ton_truoc INT;

    v_ton_sau INT;

BEGIN

    -- ========================================================
    -- 5.1 Khóa phiếu nhập
    -- ========================================================

    SELECT
        ma_kho,
        trang_thai
    INTO
        v_ma_kho,
        v_trang_thai
    FROM phieu_nhap
    WHERE ma_phieu_nhap = p_ma_phieu_nhap
    FOR UPDATE;


    -- ========================================================
    -- 5.2 Kiểm tra phiếu tồn tại
    -- ========================================================

    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Không tồn tại phiếu nhập: %',
            p_ma_phieu_nhap;

    END IF;


    -- ========================================================
    -- 5.3 Không cho xử lý lại
    -- ========================================================

    IF v_trang_thai = 'DA_NHAP' THEN

        RAISE EXCEPTION
            'Phiếu nhập % đã được xử lý',
            p_ma_phieu_nhap;

    END IF;


    -- ========================================================
    -- 5.4 Kiểm tra chi tiết phiếu nhập
    -- ========================================================

    SELECT COUNT(*)
    INTO v_count
    FROM ct_phieu_nhap
    WHERE ma_phieu_nhap = p_ma_phieu_nhap;


    IF v_count = 0 THEN

        RAISE EXCEPTION
            'Phiếu nhập % không có chi tiết',
            p_ma_phieu_nhap;

    END IF;


    -- ========================================================
    -- 5.5 Xử lý từng sản phẩm
    -- ========================================================

    FOR r IN
        SELECT
            ma_sp,
            so_luong
        FROM ct_phieu_nhap
        WHERE ma_phieu_nhap = p_ma_phieu_nhap
    LOOP


        -- ====================================================
        -- 5.6 Khóa dòng tồn kho
        -- ====================================================

        SELECT so_luong
        INTO v_ton_truoc
        FROM ton_kho
        WHERE ma_kho = v_ma_kho
          AND ma_sp = r.ma_sp
        FOR UPDATE;


        -- ====================================================
        -- 5.7 Nếu chưa có tồn kho
        -- ====================================================

        IF NOT FOUND THEN

            v_ton_truoc := 0;

            INSERT INTO ton_kho (
                ma_kho,
                ma_sp,
                so_luong,
                cap_nhat_luc
            )
            VALUES (
                v_ma_kho,
                r.ma_sp,
                r.so_luong,
                CURRENT_TIMESTAMP
            );

        ELSE

            -- =================================================
            -- 5.8 Nếu đã có tồn kho
            -- =================================================

            UPDATE ton_kho
            SET
                so_luong = so_luong + r.so_luong,
                cap_nhat_luc = CURRENT_TIMESTAMP
            WHERE ma_kho = v_ma_kho
              AND ma_sp = r.ma_sp;

        END IF;


        -- ====================================================
        -- 5.9 Tính tồn sau nhập
        -- ====================================================

        v_ton_sau :=
            v_ton_truoc + r.so_luong;


        -- ====================================================
        -- 5.10 Ghi STOCK_LEDGER
        -- ====================================================

        INSERT INTO stock_ledger (
            ma_kho,
            ma_sp,
            loai_giao_dich,
            so_luong,
            so_luong_thay_doi,
            ma_chung_tu,
            thoi_gian,
            nguoi_thuc_hien,
            ghi_chu
        )
        VALUES (
            v_ma_kho,
            r.ma_sp,
            'NHAP',
            r.so_luong,
            r.so_luong,
            p_ma_phieu_nhap,
            CURRENT_TIMESTAMP,
            p_nguoi_thuc_hien,
            'Nhập kho'
        );


        -- ====================================================
        -- 5.11 Cập nhật LỊCH SỬ TỒN KHO
        -- ====================================================

        INSERT INTO lich_su_ton_kho (
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
        VALUES (
            v_ma_kho,
            r.ma_sp,
            CURRENT_DATE,
            v_ton_truoc,
            r.so_luong,
            0,
            0,
            0,
            v_ton_sau
        )
        ON CONFLICT (ma_kho, ma_sp, ngay)
        DO UPDATE SET
            nhap = lich_su_ton_kho.nhap
                    + EXCLUDED.nhap,

            ton_cuoi = lich_su_ton_kho.ton_cuoi
                       + EXCLUDED.nhap;

    END LOOP;


    -- ========================================================
    -- 5.12 Đánh dấu phiếu đã nhập
    -- ========================================================

    UPDATE phieu_nhap
    SET trang_thai = 'DA_NHAP'
    WHERE ma_phieu_nhap = p_ma_phieu_nhap;


    RAISE NOTICE
        'Đã xử lý phiếu nhập % thành công',
        p_ma_phieu_nhap;

END;
$$;


-- ============================================================
-- 6. PROCEDURE XỬ LÝ PHIẾU XUẤT
-- ============================================================

CREATE OR REPLACE PROCEDURE sp_xu_ly_phieu_xuat(
    p_ma_phieu_xuat VARCHAR(20),
    p_nguoi_thuc_hien VARCHAR(50)
)
LANGUAGE plpgsql
AS $$
DECLARE

    v_ma_kho VARCHAR(10);

    v_trang_thai VARCHAR(20);

    v_ma_sp VARCHAR(20);

    v_so_luong INT;

    v_ton_hien_tai INT;

    v_ton_sau INT;

BEGIN

    -- ========================================================
    -- 6.1 Khóa phiếu xuất
    -- ========================================================

    SELECT
        ma_kho,
        trang_thai
    INTO
        v_ma_kho,
        v_trang_thai
    FROM phieu_xuat
    WHERE ma_phieu_xuat = p_ma_phieu_xuat
    FOR UPDATE;


    -- ========================================================
    -- 6.2 Kiểm tra phiếu tồn tại
    -- ========================================================

    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Không tìm thấy phiếu xuất %',
            p_ma_phieu_xuat;

    END IF;


    -- ========================================================
    -- 6.3 Không cho xử lý lại
    -- ========================================================

    IF v_trang_thai = 'DA_XUAT' THEN

        RAISE EXCEPTION
            'Phiếu xuất % đã được xử lý',
            p_ma_phieu_xuat;

    END IF;


    -- ========================================================
    -- 6.4 Xử lý từng sản phẩm
    -- ========================================================

    FOR v_ma_sp, v_so_luong IN
        SELECT
            ma_sp,
            so_luong
        FROM ct_phieu_xuat
        WHERE ma_phieu_xuat = p_ma_phieu_xuat
    LOOP


        -- ====================================================
        -- 6.5 Khóa dòng tồn kho
        -- ====================================================

        SELECT so_luong
        INTO v_ton_hien_tai
        FROM ton_kho
        WHERE ma_kho = v_ma_kho
          AND ma_sp = v_ma_sp
        FOR UPDATE;


        -- ====================================================
        -- 6.6 Kiểm tra tồn kho
        -- ====================================================

        IF NOT FOUND THEN

            RAISE EXCEPTION
                'Không tìm thấy tồn kho: kho %, sản phẩm %',
                v_ma_kho,
                v_ma_sp;

        END IF;


        -- ====================================================
        -- 6.7 Kiểm tra đủ số lượng
        -- ====================================================

        IF v_ton_hien_tai < v_so_luong THEN

            RAISE EXCEPTION
                'Không đủ tồn kho: kho %, sản phẩm %, tồn %, cần xuất %',
                v_ma_kho,
                v_ma_sp,
                v_ton_hien_tai,
                v_so_luong;

        END IF;


        -- ====================================================
        -- 6.8 Tính tồn sau xuất
        -- ====================================================

        v_ton_sau :=
            v_ton_hien_tai - v_so_luong;


        -- ====================================================
        -- 6.9 Trừ tồn kho
        -- ====================================================

        UPDATE ton_kho
        SET
            so_luong = v_ton_sau,
            cap_nhat_luc = CURRENT_TIMESTAMP
        WHERE ma_kho = v_ma_kho
          AND ma_sp = v_ma_sp;


        -- ====================================================
        -- 6.10 Ghi STOCK_LEDGER
        -- ====================================================

        INSERT INTO stock_ledger (
            ma_kho,
            ma_sp,
            loai_giao_dich,
            so_luong,
            so_luong_thay_doi,
            ma_chung_tu,
            thoi_gian,
            nguoi_thuc_hien,
            ghi_chu
        )
        VALUES (
            v_ma_kho,
            v_ma_sp,
            'XUAT',
            v_so_luong,
            -v_so_luong,
            p_ma_phieu_xuat,
            CURRENT_TIMESTAMP,
            p_nguoi_thuc_hien,
            'Xuất kho từ phiếu xuất'
        );


        -- ====================================================
        -- 6.11 Cập nhật LỊCH SỬ TỒN KHO
        -- ====================================================

        INSERT INTO lich_su_ton_kho (
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
        VALUES (
            v_ma_kho,
            v_ma_sp,
            CURRENT_DATE,
            v_ton_hien_tai,
            0,
            v_so_luong,
            0,
            0,
            v_ton_sau
        )
        ON CONFLICT (ma_kho, ma_sp, ngay)
        DO UPDATE SET
            xuat = lich_su_ton_kho.xuat
                   + EXCLUDED.xuat,

            ton_cuoi = lich_su_ton_kho.ton_cuoi
                       - EXCLUDED.xuat;

    END LOOP;


    -- ========================================================
    -- 6.12 Đánh dấu phiếu đã xuất
    -- ========================================================

    UPDATE phieu_xuat
    SET trang_thai = 'DA_XUAT'
    WHERE ma_phieu_xuat = p_ma_phieu_xuat;


    RAISE NOTICE
        'Đã xử lý phiếu xuất % thành công',
        p_ma_phieu_xuat;

END;
$$;

-- ============================================================
-- SAGA - SOURCE ACCEPT TRANSFER
--
-- Node nguồn xác nhận có thể thực hiện điều chuyển.
--
-- Không trừ TON_KHO tại bước này.
-- Chỉ RESERVE số lượng hàng.
--
-- Mục đích:
--   Không cho hàng đã được giữ để điều chuyển bị bán/xuất
--   bởi giao dịch khác.
-- ============================================================

CREATE OR REPLACE FUNCTION sp_accept_transfer(
    p_saga_id UUID,
    p_global_id UUID,
    p_ma_phieu_dc VARCHAR(20),
    p_ma_kho VARCHAR(10),
    p_ma_sp VARCHAR(20),
    p_so_luong INT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE

    v_ton_kho INT;
    v_reserved INT;

BEGIN

    -- ========================================================
    -- 1. KIỂM TRA INPUT
    -- ========================================================

    IF p_so_luong <= 0 THEN

        RAISE EXCEPTION
            'Số lượng điều chuyển phải > 0';

    END IF;


    -- ========================================================
    -- 2. KHÓA TON_KHO
    --
    -- FOR UPDATE đảm bảo hai giao dịch đồng thời không cùng
    -- lấy một lượng tồn kho.
    -- ========================================================

    SELECT so_luong
    INTO v_ton_kho
    FROM ton_kho
    WHERE ma_kho = p_ma_kho
      AND ma_sp = p_ma_sp
    FOR UPDATE;


    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Không tồn tại tồn kho: kho=%, sản phẩm=%',
            p_ma_kho,
            p_ma_sp;

    END IF;


    -- ========================================================
    -- 3. TÍNH SỐ LƯỢNG ĐÃ RESERVE
    -- ========================================================

    SELECT COALESCE(
        SUM(so_luong_reserve),
        0
    )
    INTO v_reserved
    FROM stock_reservation
    WHERE ma_kho = p_ma_kho
      AND ma_sp = p_ma_sp
      AND trang_thai = 'RESERVED';


    -- ========================================================
    -- 4. KIỂM TRA TỒN KHẢ DỤNG
    --
    -- Available = TON_KHO - RESERVED
    -- ========================================================

    IF (v_ton_kho - v_reserved) < p_so_luong THEN

        RAISE EXCEPTION
            'Không đủ tồn kho khả dụng. Kho=%, SP=%, TON=%, RESERVED=%, REQUEST=%',
            p_ma_kho,
            p_ma_sp,
            v_ton_kho,
            v_reserved,
            p_so_luong;

    END IF;


    -- ========================================================
    -- 5. TẠO RESERVATION
    -- ========================================================

    INSERT INTO stock_reservation (

        saga_id,

        ma_giao_dich_global,

        ma_phieu_dc,

        ma_kho,

        ma_sp,

        so_luong_reserve,

        trang_thai,

        created_at

    )
    VALUES (

        p_saga_id,

        p_global_id,

        p_ma_phieu_dc,

        p_ma_kho,

        p_ma_sp,

        p_so_luong,

        'RESERVED',

        CURRENT_TIMESTAMP

    );


    -- ========================================================
    -- 6. GHI OUTBOX EVENT
    -- ========================================================

    INSERT INTO outbox_event (

        saga_id,

        ma_giao_dich_global,

        event_type,

        aggregate_id,

        payload,

        status,

        created_at

    )
    VALUES (

        p_saga_id,

        p_global_id,

        'TRANSFER_ACCEPTED',

        p_ma_phieu_dc,

        jsonb_build_object(

            'saga_id', p_saga_id,

            'ma_giao_dich_global', p_global_id,

            'ma_phieu_dc', p_ma_phieu_dc,

            'ma_kho', p_ma_kho,

            'ma_sp', p_ma_sp,

            'so_luong', p_so_luong,

            'event_time', CURRENT_TIMESTAMP

        ),

        'PENDING',

        CURRENT_TIMESTAMP

    );

END;
$$;

-- ============================================================
-- SAGA - SOURCE REJECT TRANSFER
--
-- Node nguồn từ chối điều chuyển.
--
-- Nếu trước đó đã RESERVE thì giải phóng reservation.
-- ============================================================

CREATE OR REPLACE FUNCTION sp_reject_transfer(
    p_saga_id UUID,
    p_global_id UUID,
    p_ma_phieu_dc VARCHAR(20),
    p_ma_kho VARCHAR(10),
    p_ma_sp VARCHAR(20),
    p_so_luong INT,
    p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN

    -- ========================================================
    -- 1. GIẢI PHÓNG RESERVATION
    -- ========================================================

    UPDATE stock_reservation

    SET
        trang_thai = 'RELEASED',
        released_at = CURRENT_TIMESTAMP

    WHERE saga_id = p_saga_id
      AND ma_phieu_dc = p_ma_phieu_dc
      AND ma_kho = p_ma_kho
      AND ma_sp = p_ma_sp
      AND trang_thai = 'RESERVED';


    -- ========================================================
    -- 2. GHI OUTBOX EVENT
    -- ========================================================

    INSERT INTO outbox_event (

        saga_id,

        ma_giao_dich_global,

        event_type,

        aggregate_id,

        payload,

        status,

        created_at

    )
    VALUES (

        p_saga_id,

        p_global_id,

        'TRANSFER_REJECTED',

        p_ma_phieu_dc,

        jsonb_build_object(

            'saga_id', p_saga_id,

            'ma_giao_dich_global', p_global_id,

            'ma_phieu_dc', p_ma_phieu_dc,

            'ma_kho', p_ma_kho,

            'ma_sp', p_ma_sp,

            'so_luong', p_so_luong,

            'reason', p_reason,

            'event_time', CURRENT_TIMESTAMP

        ),

        'PENDING',

        CURRENT_TIMESTAMP

    );

END;
$$;
-- ============================================================
-- SAGA - SOURCE SHIP TRANSFER
--
-- Node nguồn thực hiện xuất hàng để điều chuyển.
--
-- Luồng:
--
-- RESERVATION RESERVED
--        ↓
-- Khóa reservation
--        ↓
-- Khóa TON_KHO
--        ↓
-- Trừ TON_KHO
--        ↓
-- Ghi STOCK_LEDGER
--        ↓
-- Cập nhật LICH_SU_TON_KHO
--        ↓
-- Reservation -> CONSUMED
--        ↓
-- OUTBOX_EVENT -> TRANSFER_SHIPPED
--
-- LƯU Ý:
-- - Chỉ chạy tại NODE nguồn.
-- - Không cập nhật NODE đích.
-- - Không cập nhật CENTRAL trực tiếp.
-- - Không cập nhật VWH trực tiếp.
-- - Central/Backend sẽ xử lý event TRANSFER_SHIPPED.
-- ============================================================

CREATE OR REPLACE FUNCTION sp_ship_transfer(
    p_saga_id UUID,
    p_global_id UUID,
    p_ma_phieu_dc VARCHAR(20),
    p_ma_kho VARCHAR(10),
    p_ma_sp VARCHAR(20)
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE

    v_reservation_id BIGINT;
    v_so_luong INT;
    v_trang_thai VARCHAR(20);

    v_ton_hien_tai INT;
    v_ton_sau INT;

BEGIN

    -- ========================================================
    -- 1. KIỂM TRA INPUT
    -- ========================================================

    IF p_saga_id IS NULL THEN

        RAISE EXCEPTION
            'saga_id không được NULL';

    END IF;


    IF p_ma_phieu_dc IS NULL
       OR TRIM(p_ma_phieu_dc) = '' THEN

        RAISE EXCEPTION
            'ma_phieu_dc không được NULL hoặc rỗng';

    END IF;


    IF p_ma_kho IS NULL
       OR TRIM(p_ma_kho) = '' THEN

        RAISE EXCEPTION
            'ma_kho không được NULL hoặc rỗng';

    END IF;


    IF p_ma_sp IS NULL
       OR TRIM(p_ma_sp) = '' THEN

        RAISE EXCEPTION
            'ma_sp không được NULL hoặc rỗng';

    END IF;


    -- ========================================================
    -- 2. KHÓA RESERVATION
    --
    -- Chỉ reservation đang RESERVED mới được phép ship.
    -- ========================================================

    SELECT
        reservation_id,
        so_luong_reserve,
        trang_thai
    INTO
        v_reservation_id,
        v_so_luong,
        v_trang_thai
    FROM stock_reservation
    WHERE saga_id = p_saga_id
      AND ma_phieu_dc = p_ma_phieu_dc
      AND ma_kho = p_ma_kho
      AND ma_sp = p_ma_sp
    ORDER BY reservation_id
    LIMIT 1
    FOR UPDATE;


    -- ========================================================
    -- 3. KIỂM TRA RESERVATION
    -- ========================================================

    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Không tìm thấy reservation cho Saga %, phiếu %, kho %, SP %',
            p_saga_id,
            p_ma_phieu_dc,
            p_ma_kho,
            p_ma_sp;

    END IF;


    -- ========================================================
    -- 4. KIỂM TRA TRẠNG THÁI
    -- ========================================================

    IF v_trang_thai = 'CONSUMED' THEN

        RAISE EXCEPTION
            'Điều chuyển % đã được ship trước đó',
            p_ma_phieu_dc;

    END IF;


    IF v_trang_thai <> 'RESERVED' THEN

        RAISE EXCEPTION
            'Reservation % không ở trạng thái RESERVED. Trạng thái hiện tại: %',
            v_reservation_id,
            v_trang_thai;

    END IF;


    -- ========================================================
    -- 5. KIỂM TRA SỐ LƯỢNG
    -- ========================================================

    IF v_so_luong IS NULL OR v_so_luong <= 0 THEN

        RAISE EXCEPTION
            'Số lượng reservation không hợp lệ: %',
            v_so_luong;

    END IF;


    -- ========================================================
    -- 6. KHÓA TON_KHO
    --
    -- Đảm bảo không có giao dịch khác đồng thời thay đổi
    -- tồn kho trong lúc thực hiện ship.
    -- ========================================================

    SELECT so_luong
    INTO v_ton_hien_tai
    FROM ton_kho
    WHERE ma_kho = p_ma_kho
      AND ma_sp = p_ma_sp
    FOR UPDATE;


    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Không tồn tại tồn kho: kho=%, sản phẩm=%',
            p_ma_kho,
            p_ma_sp;

    END IF;


    -- ========================================================
    -- 7. KIỂM TRA ĐỦ TỒN
    -- ========================================================

    IF v_ton_hien_tai < v_so_luong THEN

        RAISE EXCEPTION
            'Không đủ tồn kho để ship. Kho=%, SP=%, TON=%, cần=%',
            p_ma_kho,
            p_ma_sp,
            v_ton_hien_tai,
            v_so_luong;

    END IF;


    -- ========================================================
    -- 8. TÍNH TỒN SAU KHI SHIP
    -- ========================================================

    v_ton_sau :=
        v_ton_hien_tai - v_so_luong;


    -- ========================================================
    -- 9. TRỪ TON_KHO
    -- ========================================================

    UPDATE ton_kho
    SET
        so_luong = v_ton_sau,
        cap_nhat_luc = CURRENT_TIMESTAMP
    WHERE ma_kho = p_ma_kho
      AND ma_sp = p_ma_sp;


    -- ========================================================
    -- 10. GHI STOCK_LEDGER
    --
    -- DIEU_CHUYEN_RA:
    --   so_luong = số lượng điều chuyển
    --   so_luong_thay_doi = số âm
    -- ========================================================

    INSERT INTO stock_ledger (
        ma_kho,
        ma_sp,
        loai_giao_dich,
        so_luong,
        so_luong_thay_doi,
        ma_chung_tu,
        thoi_gian,
        nguoi_thuc_hien,
        ghi_chu
    )
    VALUES (
        p_ma_kho,
        p_ma_sp,
        'DIEU_CHUYEN_RA',
        v_so_luong,
        -v_so_luong,
        p_ma_phieu_dc,
        CURRENT_TIMESTAMP,
        'SAGA',
        'Xuất hàng để điều chuyển'
    );


    -- ========================================================
    -- 11. CẬP NHẬT LỊCH SỬ TỒN KHO
    -- ========================================================

    INSERT INTO lich_su_ton_kho (
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
    VALUES (
        p_ma_kho,
        p_ma_sp,
        CURRENT_DATE,
        v_ton_hien_tai,
        0,
        0,
        0,
        v_so_luong,
        v_ton_sau
    )
    ON CONFLICT (ma_kho, ma_sp, ngay)
    DO UPDATE SET

        dieu_chuyen_ra =
            lich_su_ton_kho.dieu_chuyen_ra
            + EXCLUDED.dieu_chuyen_ra,

        ton_cuoi =
            lich_su_ton_kho.ton_cuoi
            - EXCLUDED.dieu_chuyen_ra;


    -- ========================================================
    -- 12. ĐÁNH DẤU RESERVATION ĐÃ CONSUME
    -- ========================================================

    UPDATE stock_reservation
    SET
        trang_thai = 'CONSUMED'
    WHERE reservation_id = v_reservation_id;


    -- ========================================================
    -- 13. GHI OUTBOX EVENT
    --
    -- Central/Backend sẽ đọc event này để tiếp tục Saga:
    --
    -- NODE HN
    --    ↓
    -- TRANSFER_SHIPPED
    --    ↓
    -- CENTRAL
    --    ↓
    -- VWH_TRANSFER
    --    ↓
    -- NODE DN
    -- ========================================================

    INSERT INTO outbox_event (
        saga_id,
        ma_giao_dich_global,
        event_type,
        aggregate_id,
        payload,
        status,
        retry_count,
        created_at
    )
    VALUES (
        p_saga_id,
        p_global_id,
        'TRANSFER_SHIPPED',
        p_ma_phieu_dc,

        jsonb_build_object(
            'saga_id',
            p_saga_id,

            'ma_giao_dich_global',
            p_global_id,

            'ma_phieu_dc',
            p_ma_phieu_dc,

            'ma_kho',
            p_ma_kho,

            'ma_sp',
            p_ma_sp,

            'so_luong',
            v_so_luong,

            'ton_truoc',
            v_ton_hien_tai,

            'ton_sau',
            v_ton_sau,

            'event_time',
            CURRENT_TIMESTAMP
        ),

        'PENDING',
        0,
        CURRENT_TIMESTAMP
    );


    -- ========================================================
    -- 14. THÔNG BÁO
    -- ========================================================

    RAISE NOTICE
        'Ship điều chuyển thành công: phiếu=%, kho=%, SP=%, SL=%, tồn % -> %',
        p_ma_phieu_dc,
        p_ma_kho,
        p_ma_sp,
        v_so_luong,
        v_ton_hien_tai,
        v_ton_sau;

END;
$$;
-- ============================================================
-- SAGA - DESTINATION RECEIVE TRANSFER
--
-- Node đích xác nhận đã nhận hàng.
--
-- Node đích:
--   1. Cộng TON_KHO
--   2. Ghi STOCK_LEDGER
--   3. Cập nhật LỊCH SỬ TỒN KHO
--   4. Ghi OUTBOX_EVENT
--
-- Node đích KHÔNG cập nhật VWH trực tiếp.
-- Central xử lý event TRANSFER_RECEIVED.
-- ============================================================

CREATE OR REPLACE FUNCTION sp_receive_transfer(
    p_saga_id UUID,
    p_global_id UUID,
    p_ma_phieu_dc VARCHAR(20),
    p_ma_kho VARCHAR(10),
    p_ma_sp VARCHAR(20),
    p_so_luong_thuc_nhan INT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE

    v_ton_hien_tai INT;
    v_ton_sau INT;
    v_da_nhan BOOLEAN;

BEGIN

    -- ========================================================
    -- 1. KIỂM TRA INPUT
    -- ========================================================

    IF p_saga_id IS NULL THEN
        RAISE EXCEPTION
            'saga_id không được NULL';
    END IF;

    IF p_global_id IS NULL THEN
        RAISE EXCEPTION
            'global_id không được NULL';
    END IF;

    IF p_ma_phieu_dc IS NULL
       OR TRIM(p_ma_phieu_dc) = '' THEN

        RAISE EXCEPTION
            'ma_phieu_dc không được NULL hoặc rỗng';

    END IF;

    IF p_ma_kho IS NULL
       OR TRIM(p_ma_kho) = '' THEN

        RAISE EXCEPTION
            'ma_kho không được NULL hoặc rỗng';

    END IF;

    IF p_ma_sp IS NULL
       OR TRIM(p_ma_sp) = '' THEN

        RAISE EXCEPTION
            'ma_sp không được NULL hoặc rỗng';

    END IF;

    IF p_so_luong_thuc_nhan IS NULL
       OR p_so_luong_thuc_nhan <= 0 THEN

        RAISE EXCEPTION
            'Số lượng thực nhận phải lớn hơn 0: %',
            p_so_luong_thuc_nhan;

    END IF;


    -- ========================================================
    -- 2. KIỂM TRA RECEIVE TRÙNG
    -- ========================================================

    SELECT EXISTS (
        SELECT 1
        FROM outbox_event
        WHERE saga_id = p_saga_id
          AND event_type = 'TRANSFER_RECEIVED'
          AND aggregate_id = p_ma_phieu_dc
          AND status IN (
              'PENDING',
              'PROCESSING',
              'PROCESSED'
          )
    )
    INTO v_da_nhan;

    IF v_da_nhan THEN

        RAISE EXCEPTION
            'Điều chuyển % đã được nhận trước đó',
            p_ma_phieu_dc;

    END IF;


    -- ========================================================
    -- 3. KHÓA TỒN KHO
    -- ========================================================

    SELECT so_luong
    INTO v_ton_hien_tai
    FROM ton_kho
    WHERE ma_kho = p_ma_kho
      AND ma_sp = p_ma_sp
    FOR UPDATE;


    -- ========================================================
    -- 4. NẾU CHƯA CÓ TỒN KHO -> TẠO MỚI
    -- ========================================================

    IF NOT FOUND THEN

        v_ton_hien_tai := 0;

        v_ton_sau := p_so_luong_thuc_nhan;

        INSERT INTO ton_kho (
            ma_kho,
            ma_sp,
            so_luong,
            cap_nhat_luc
        )
        VALUES (
            p_ma_kho,
            p_ma_sp,
            p_so_luong_thuc_nhan,
            CURRENT_TIMESTAMP
        );

    ELSE

        -- ====================================================
        -- 5. CỘNG TỒN KHO
        -- ====================================================

        v_ton_sau :=
            v_ton_hien_tai + p_so_luong_thuc_nhan;

        UPDATE ton_kho
        SET
            so_luong = v_ton_sau,
            cap_nhat_luc = CURRENT_TIMESTAMP
        WHERE ma_kho = p_ma_kho
          AND ma_sp = p_ma_sp;

    END IF;


    -- ========================================================
    -- 6. GHI STOCK_LEDGER
    -- ========================================================

    INSERT INTO stock_ledger (
        ma_kho,
        ma_sp,
        loai_giao_dich,
        so_luong,
        so_luong_thay_doi,
        ma_chung_tu,
        thoi_gian,
        nguoi_thuc_hien,
        ghi_chu
    )
    VALUES (
        p_ma_kho,
        p_ma_sp,
        'DIEU_CHUYEN_VAO',
        p_so_luong_thuc_nhan,
        p_so_luong_thuc_nhan,
        p_ma_phieu_dc,
        CURRENT_TIMESTAMP,
        'SAGA',
        'Nhận hàng điều chuyển'
    );


    -- ========================================================
    -- 7. CẬP NHẬT LỊCH SỬ TỒN KHO
    -- ========================================================

    INSERT INTO lich_su_ton_kho (
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
    VALUES (
        p_ma_kho,
        p_ma_sp,
        CURRENT_DATE,
        v_ton_hien_tai,
        0,
        0,
        p_so_luong_thuc_nhan,
        0,
        v_ton_sau
    )
    ON CONFLICT (ma_kho, ma_sp, ngay)
    DO UPDATE SET

        dieu_chuyen_vao =
            lich_su_ton_kho.dieu_chuyen_vao
            + EXCLUDED.dieu_chuyen_vao,

        ton_cuoi =
            lich_su_ton_kho.ton_cuoi
            + EXCLUDED.dieu_chuyen_vao;


    -- ========================================================
    -- 8. GHI OUTBOX EVENT
    -- ========================================================

    INSERT INTO outbox_event (
        saga_id,
        ma_giao_dich_global,
        event_type,
        aggregate_id,
        payload,
        status,
        retry_count,
        created_at
    )
    VALUES (
        p_saga_id,
        p_global_id,
        'TRANSFER_RECEIVED',
        p_ma_phieu_dc,

        jsonb_build_object(
            'saga_id', p_saga_id,
            'ma_giao_dich_global', p_global_id,
            'ma_phieu_dc', p_ma_phieu_dc,
            'ma_kho', p_ma_kho,
            'ma_sp', p_ma_sp,
            'so_luong_thuc_nhan', p_so_luong_thuc_nhan,
            'ton_truoc', v_ton_hien_tai,
            'ton_sau', v_ton_sau,
            'event_time', CURRENT_TIMESTAMP
        ),

        'PENDING',
        0,
        CURRENT_TIMESTAMP
    );


    -- ========================================================
    -- 9. THÔNG BÁO
    -- ========================================================

    RAISE NOTICE
        'Nhận hàng thành công: phiếu=%, kho=%, SP=%, SL=%, tồn % -> %',
        p_ma_phieu_dc,
        p_ma_kho,
        p_ma_sp,
        p_so_luong_thuc_nhan,
        v_ton_hien_tai,
        v_ton_sau;

END;
$$;

-- ============================================================
-- 8. PROCEDURE NHẬN HÀNG ĐIỀU CHUYỂN
-- ============================================================

CREATE OR REPLACE FUNCTION sp_receive_transfer(
    p_saga_id UUID,
    p_global_id UUID,
    p_ma_phieu_dc VARCHAR(20),
    p_ma_kho VARCHAR(10),
    p_ma_sp VARCHAR(20),
    p_so_luong_thuc_nhan INT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_ton_hien_tai INT;
    v_ton_sau INT;
    v_da_nhan BOOLEAN;
BEGIN

    -- --------------------------------------------------------
    -- 1. VALIDATE INPUT
    -- --------------------------------------------------------

    IF p_saga_id IS NULL THEN
        RAISE EXCEPTION 'saga_id không được NULL';
    END IF;

    IF p_global_id IS NULL THEN
        RAISE EXCEPTION 'global_id không được NULL';
    END IF;

    IF p_ma_phieu_dc IS NULL
       OR TRIM(p_ma_phieu_dc) = '' THEN
        RAISE EXCEPTION
            'ma_phieu_dc không được NULL hoặc rỗng';
    END IF;

    IF p_ma_kho IS NULL
       OR TRIM(p_ma_kho) = '' THEN
        RAISE EXCEPTION
            'ma_kho không được NULL hoặc rỗng';
    END IF;

    IF p_ma_sp IS NULL
       OR TRIM(p_ma_sp) = '' THEN
        RAISE EXCEPTION
            'ma_sp không được NULL hoặc rỗng';
    END IF;

    IF p_so_luong_thuc_nhan IS NULL
       OR p_so_luong_thuc_nhan <= 0 THEN
        RAISE EXCEPTION
            'Số lượng thực nhận phải lớn hơn 0: %',
            p_so_luong_thuc_nhan;
    END IF;


    -- --------------------------------------------------------
    -- 2. KIỂM TRA ĐÃ NHẬN TRƯỚC ĐÓ CHƯA
    -- --------------------------------------------------------

    SELECT EXISTS (
        SELECT 1
        FROM outbox_event
        WHERE saga_id = p_saga_id
          AND event_type = 'TRANSFER_RECEIVED'
          AND aggregate_id = p_ma_phieu_dc
          AND status IN (
              'PENDING',
              'PROCESSING',
              'PROCESSED'
          )
    )
    INTO v_da_nhan;

    IF v_da_nhan THEN
        RAISE EXCEPTION
            'Điều chuyển % đã được nhận trước đó',
            p_ma_phieu_dc;
    END IF;


    -- --------------------------------------------------------
    -- 3. KHÓA TON_KHO
    -- --------------------------------------------------------

    SELECT so_luong
    INTO v_ton_hien_tai
    FROM ton_kho
    WHERE ma_kho = p_ma_kho
      AND ma_sp = p_ma_sp
    FOR UPDATE;


    -- --------------------------------------------------------
    -- 4. NẾU CHƯA CÓ DÒNG TON_KHO → TẠO MỚI
    -- --------------------------------------------------------

    IF NOT FOUND THEN

        v_ton_hien_tai := 0;
        v_ton_sau := p_so_luong_thuc_nhan;

        INSERT INTO ton_kho (
            ma_kho,
            ma_sp,
            so_luong,
            cap_nhat_luc
        )
        VALUES (
            p_ma_kho,
            p_ma_sp,
            p_so_luong_thuc_nhan,
            CURRENT_TIMESTAMP
        );

    ELSE

        -- ----------------------------------------------------
        -- 5. CỘNG HÀNG VÀO KHO NHẬN
        -- ----------------------------------------------------

        v_ton_sau :=
            v_ton_hien_tai + p_so_luong_thuc_nhan;

        UPDATE ton_kho
        SET
            so_luong = v_ton_sau,
            cap_nhat_luc = CURRENT_TIMESTAMP
        WHERE ma_kho = p_ma_kho
          AND ma_sp = p_ma_sp;

    END IF;


    -- --------------------------------------------------------
    -- 6. GHI STOCK LEDGER
    -- --------------------------------------------------------

    INSERT INTO stock_ledger (
        ma_kho,
        ma_sp,
        loai_giao_dich,
        so_luong,
        so_luong_thay_doi,
        ma_chung_tu,
        thoi_gian,
        nguoi_thuc_hien,
        ghi_chu
    )
    VALUES (
        p_ma_kho,
        p_ma_sp,
        'DIEU_CHUYEN_VAO',
        p_so_luong_thuc_nhan,
        p_so_luong_thuc_nhan,
        p_ma_phieu_dc,
        CURRENT_TIMESTAMP,
        'SAGA',
        'Nhận hàng điều chuyển'
    );


    -- --------------------------------------------------------
    -- 7. CẬP NHẬT LỊCH SỬ TỒN KHO
    -- --------------------------------------------------------

    INSERT INTO lich_su_ton_kho (
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
    VALUES (
        p_ma_kho,
        p_ma_sp,
        CURRENT_DATE,
        v_ton_hien_tai,
        0,
        0,
        p_so_luong_thuc_nhan,
        0,
        v_ton_sau
    )
    ON CONFLICT (ma_kho, ma_sp, ngay)
    DO UPDATE SET
        dieu_chuyen_vao =
            lich_su_ton_kho.dieu_chuyen_vao
            + EXCLUDED.dieu_chuyen_vao,

        ton_cuoi =
            lich_su_ton_kho.ton_cuoi
            + EXCLUDED.dieu_chuyen_vao;


    -- --------------------------------------------------------
    -- 8. GHI OUTBOX EVENT
    -- --------------------------------------------------------

    INSERT INTO outbox_event (
        saga_id,
        ma_giao_dich_global,
        event_type,
        aggregate_id,
        payload,
        status,
        retry_count,
        created_at
    )
    VALUES (
        p_saga_id,
        p_global_id,
        'TRANSFER_RECEIVED',
        p_ma_phieu_dc,

        jsonb_build_object(
            'saga_id', p_saga_id,
            'ma_giao_dich_global', p_global_id,
            'ma_phieu_dc', p_ma_phieu_dc,
            'ma_kho', p_ma_kho,
            'ma_sp', p_ma_sp,
            'so_luong_thuc_nhan',
                p_so_luong_thuc_nhan,
            'ton_truoc',
                v_ton_hien_tai,
            'ton_sau',
                v_ton_sau,
            'event_time',
                CURRENT_TIMESTAMP
        ),

        'PENDING',
        0,
        CURRENT_TIMESTAMP
    );


    RAISE NOTICE
        'Nhận hàng thành công: phiếu=%, kho=%, SP=%, SL=%, tồn % -> %',
        p_ma_phieu_dc,
        p_ma_kho,
        p_ma_sp,
        p_so_luong_thuc_nhan,
        v_ton_hien_tai,
        v_ton_sau;

END;
$$;
-- ============================================================
-- KẾT THÚC FILE
-- ============================================================