-- ============================================================
-- 08_create_transaction_support.sql
-- NODE - TRANSACTION SUPPORT
--
-- Bao gồm:
-- 1. Bổ sung loại kho
-- 2. STOCK_RESERVATION
-- 3. OUTBOX_EVENT
-- 4. STOCK_LEDGER
-- 5. TRANSACTION_WAIT_QUEUE
-- 6. WAIT / RETRY
-- 7. Xử lý phiếu nhập
-- 8. Xử lý phiếu xuất
-- 9. Saga ACCEPT
-- 10. Saga REJECT
-- 11. Saga SHIP
-- 12. Saga RECEIVE
-- ============================================================


BEGIN;


-- ============================================================
-- 1. BỔ SUNG LOẠI KHO
-- ============================================================

ALTER TABLE kho
ADD COLUMN IF NOT EXISTS loai_kho VARCHAR(20)
DEFAULT 'BRANCH';


ALTER TABLE kho
DROP CONSTRAINT IF EXISTS chk_kho_loai;


ALTER TABLE kho
ADD CONSTRAINT chk_kho_loai
CHECK (
    loai_kho IN ('BRANCH', 'VIRTUAL')
);


UPDATE kho
SET loai_kho = 'BRANCH'
WHERE loai_kho IS NULL;


-- ============================================================
-- 2. STOCK_RESERVATION
--
-- Quản lý số lượng hàng được giữ lại cho điều chuyển.
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
-- Hỗ trợ WAIT / RETRY / TIMEOUT.
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

    max_retry_count INT NOT NULL
        DEFAULT 3,

    created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    last_retry_at TIMESTAMP,

    next_retry_at TIMESTAMP NOT NULL
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
        ),

    CONSTRAINT chk_outbox_retry_count
        CHECK (
            retry_count >= 0
        ),

    CONSTRAINT chk_outbox_max_retry
        CHECK (
            max_retry_count > 0
        )
);


-- ============================================================
-- BỔ SUNG CỘT CHO OUTBOX CŨ
--
-- Trường hợp database đã tồn tại outbox_event từ phiên bản cũ.
-- ============================================================

ALTER TABLE outbox_event
ADD COLUMN IF NOT EXISTS max_retry_count INT
DEFAULT 3;


ALTER TABLE outbox_event
ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMP;


ALTER TABLE outbox_event
ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP;


UPDATE outbox_event
SET max_retry_count = 3
WHERE max_retry_count IS NULL;


UPDATE outbox_event
SET next_retry_at = created_at
WHERE next_retry_at IS NULL;


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


CREATE INDEX IF NOT EXISTS idx_outbox_next_retry
ON outbox_event(status, next_retry_at);


-- ============================================================
-- 4. STOCK_LEDGER
--
-- Lưu toàn bộ lịch sử biến động tồn kho.
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
-- 5. TRANSACTION_WAIT_QUEUE
--
-- Hàng đợi giao dịch cần chờ / retry.
-- ============================================================

CREATE TABLE IF NOT EXISTS transaction_wait_queue (

    wait_id BIGSERIAL PRIMARY KEY,

    transaction_type VARCHAR(30) NOT NULL,

    transaction_id VARCHAR(50) NOT NULL,

    ma_kho VARCHAR(10),

    ma_sp VARCHAR(20),

    so_luong INT,

    saga_id UUID,

    ma_giao_dich_global UUID,

    trang_thai VARCHAR(20) NOT NULL
        DEFAULT 'WAITING',

    retry_count INT NOT NULL
        DEFAULT 0,

    max_retry_count INT NOT NULL
        DEFAULT 3,

    next_retry_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    last_retry_at TIMESTAMP,

    created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    completed_at TIMESTAMP,

    reason TEXT,

    error_message TEXT,

    CONSTRAINT chk_transaction_wait_type
        CHECK (
            transaction_type IN (
                'NHAP',
                'XUAT',
                'DIEU_CHUYEN_ACCEPT',
                'DIEU_CHUYEN_SHIP',
                'DIEU_CHUYEN_RECEIVE',
                'OUTBOX'
            )
        ),

    CONSTRAINT chk_transaction_wait_status
        CHECK (
            trang_thai IN (
                'WAITING',
                'PROCESSING',
                'COMPLETED',
                'TIMEOUT',
                'FAILED'
            )
        ),

    CONSTRAINT chk_transaction_wait_retry
        CHECK (
            retry_count >= 0
            AND max_retry_count > 0
        ),

    CONSTRAINT chk_transaction_wait_quantity
        CHECK (
            so_luong IS NULL
            OR so_luong > 0
        )
);


-- ============================================================
-- INDEX - TRANSACTION_WAIT_QUEUE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_wait_queue_status
ON transaction_wait_queue(trang_thai);


CREATE INDEX IF NOT EXISTS idx_wait_queue_next_retry
ON transaction_wait_queue(next_retry_at);


CREATE INDEX IF NOT EXISTS idx_wait_queue_transaction
ON transaction_wait_queue(
    transaction_type,
    transaction_id
);


CREATE INDEX IF NOT EXISTS idx_wait_queue_saga
ON transaction_wait_queue(saga_id);


CREATE INDEX IF NOT EXISTS idx_wait_queue_kho_sp
ON transaction_wait_queue(ma_kho, ma_sp);


-- ============================================================
-- 5.1. TRÁNH TẠO NHIỀU WAIT CHO CÙNG GIAO DỊCH
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_wait_active_transaction
ON transaction_wait_queue(
    transaction_type,
    transaction_id
)
WHERE trang_thai IN ('WAITING', 'PROCESSING');


-- ============================================================
-- 6. HÀM ĐƯA GIAO DỊCH VÀO HÀNG ĐỢI
-- ============================================================

CREATE OR REPLACE FUNCTION sp_wait_transaction(
    p_transaction_type VARCHAR(30),
    p_transaction_id VARCHAR(50),
    p_ma_kho VARCHAR(10) DEFAULT NULL,
    p_ma_sp VARCHAR(20) DEFAULT NULL,
    p_so_luong INT DEFAULT NULL,
    p_saga_id UUID DEFAULT NULL,
    p_global_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
    p_wait_seconds INT DEFAULT 10,
    p_max_retry_count INT DEFAULT 3
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_wait_id BIGINT;
BEGIN

    IF p_wait_seconds < 0 THEN
        RAISE EXCEPTION
            'Thời gian chờ không được âm';
    END IF;


    IF p_max_retry_count <= 0 THEN
        RAISE EXCEPTION
            'Số lần retry phải > 0';
    END IF;


    IF p_so_luong IS NOT NULL
       AND p_so_luong <= 0 THEN

        RAISE EXCEPTION
            'Số lượng phải > 0';
    END IF;


    SELECT wait_id
    INTO v_wait_id
    FROM transaction_wait_queue
    WHERE transaction_type = p_transaction_type
      AND transaction_id = p_transaction_id
      AND trang_thai IN ('WAITING', 'PROCESSING')
    ORDER BY wait_id DESC
    LIMIT 1;


    IF FOUND THEN

        RETURN v_wait_id;

    END IF;


    INSERT INTO transaction_wait_queue (
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
        reason
    )
    VALUES (
        p_transaction_type,
        p_transaction_id,
        p_ma_kho,
        p_ma_sp,
        p_so_luong,
        p_saga_id,
        p_global_id,
        'WAITING',
        0,
        p_max_retry_count,
        CURRENT_TIMESTAMP
            + make_interval(secs => p_wait_seconds),
        p_reason
    )
    RETURNING wait_id
    INTO v_wait_id;


    RAISE NOTICE
        'Giao dịch % được đưa vào hàng đợi. wait_id=%, retry sau % giây',
        p_transaction_id,
        v_wait_id,
        p_wait_seconds;


    RETURN v_wait_id;

END;
$$;


-- ============================================================
-- 7. LẤY CÁC GIAO DỊCH ĐẾN THỜI GIAN RETRY
-- ============================================================

CREATE OR REPLACE FUNCTION sp_get_waiting_transactions()
RETURNS TABLE (
    wait_id BIGINT,
    transaction_type VARCHAR(30),
    transaction_id VARCHAR(50),
    ma_kho VARCHAR(10),
    ma_sp VARCHAR(20),
    so_luong INT,
    saga_id UUID,
    ma_giao_dich_global UUID,
    retry_count INT,
    max_retry_count INT,
    next_retry_at TIMESTAMP
)
LANGUAGE plpgsql
AS $$
BEGIN

    RETURN QUERY

    SELECT
        w.wait_id,
        w.transaction_type,
        w.transaction_id,
        w.ma_kho,
        w.ma_sp,
        w.so_luong,
        w.saga_id,
        w.ma_giao_dich_global,
        w.retry_count,
        w.max_retry_count,
        w.next_retry_at

    FROM transaction_wait_queue w

    WHERE w.trang_thai = 'WAITING'

      AND w.next_retry_at <= CURRENT_TIMESTAMP

      AND w.retry_count < w.max_retry_count

    ORDER BY w.next_retry_at;

END;
$$;


-- ============================================================
-- 8. RETRY MỘT GIAO DỊCH
-- ============================================================

CREATE OR REPLACE FUNCTION sp_retry_transaction(
    p_wait_id BIGINT,
    p_wait_seconds INT DEFAULT 10,
    p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_retry_count INT;
    v_max_retry INT;
BEGIN

    SELECT
        retry_count,
        max_retry_count

    INTO
        v_retry_count,
        v_max_retry

    FROM transaction_wait_queue

    WHERE wait_id = p_wait_id

    FOR UPDATE;


    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Không tồn tại wait_id=%',
            p_wait_id;

    END IF;


    v_retry_count := v_retry_count + 1;


    IF v_retry_count >= v_max_retry THEN

        UPDATE transaction_wait_queue

        SET
            trang_thai = 'TIMEOUT',
            retry_count = v_retry_count,
            last_retry_at = CURRENT_TIMESTAMP,
            completed_at = CURRENT_TIMESTAMP,
            error_message = p_error_message

        WHERE wait_id = p_wait_id;


        RAISE NOTICE
            'Giao dịch wait_id=% TIMEOUT sau % lần retry',
            p_wait_id,
            v_retry_count;

    ELSE

        UPDATE transaction_wait_queue

        SET
            trang_thai = 'WAITING',
            retry_count = v_retry_count,
            last_retry_at = CURRENT_TIMESTAMP,
            next_retry_at =
                CURRENT_TIMESTAMP
                + make_interval(secs => p_wait_seconds),
            error_message = p_error_message

        WHERE wait_id = p_wait_id;


        RAISE NOTICE
            'Giao dịch wait_id=% retry lần %. Chờ % giây',
            p_wait_id,
            v_retry_count,
            p_wait_seconds;

    END IF;

END;
$$;


-- ============================================================
-- 9. PROCEDURE XỬ LÝ PHIẾU NHẬP
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

    SELECT
        ma_kho,
        trang_thai

    INTO
        v_ma_kho,
        v_trang_thai

    FROM phieu_nhap

    WHERE ma_phieu_nhap = p_ma_phieu_nhap

    FOR UPDATE;


    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Không tồn tại phiếu nhập: %',
            p_ma_phieu_nhap;

    END IF;


    IF v_trang_thai = 'DA_NHAP' THEN

        RAISE EXCEPTION
            'Phiếu nhập % đã được xử lý',
            p_ma_phieu_nhap;

    END IF;


    SELECT COUNT(*)
    INTO v_count

    FROM ct_phieu_nhap

    WHERE ma_phieu_nhap = p_ma_phieu_nhap;


    IF v_count = 0 THEN

        RAISE EXCEPTION
            'Phiếu nhập % không có chi tiết',
            p_ma_phieu_nhap;

    END IF;


    FOR r IN

        SELECT
            ma_sp,
            so_luong

        FROM ct_phieu_nhap

        WHERE ma_phieu_nhap = p_ma_phieu_nhap

    LOOP

        SELECT so_luong
        INTO v_ton_truoc

        FROM ton_kho

        WHERE ma_kho = v_ma_kho
          AND ma_sp = r.ma_sp

        FOR UPDATE;


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

            UPDATE ton_kho

            SET
                so_luong = so_luong + r.so_luong,
                cap_nhat_luc = CURRENT_TIMESTAMP

            WHERE ma_kho = v_ma_kho
              AND ma_sp = r.ma_sp;

        END IF;


        v_ton_sau :=
            v_ton_truoc + r.so_luong;


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

        ON CONFLICT (
            ma_kho,
            ma_sp,
            ngay
        )

        DO UPDATE SET

            nhap =
                lich_su_ton_kho.nhap
                + EXCLUDED.nhap,

            ton_cuoi =
                lich_su_ton_kho.ton_cuoi
                + EXCLUDED.nhap;

    END LOOP;


    UPDATE phieu_nhap

    SET
        trang_thai = 'DA_NHAP'

    WHERE ma_phieu_nhap = p_ma_phieu_nhap;


    RAISE NOTICE
        'Đã xử lý phiếu nhập % thành công',
        p_ma_phieu_nhap;

END;
$$;


-- ============================================================
-- 10. PROCEDURE XỬ LÝ PHIẾU XUẤT
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

    SELECT
        ma_kho,
        trang_thai

    INTO
        v_ma_kho,
        v_trang_thai

    FROM phieu_xuat

    WHERE ma_phieu_xuat = p_ma_phieu_xuat

    FOR UPDATE;


    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Không tìm thấy phiếu xuất %',
            p_ma_phieu_xuat;

    END IF;


    IF v_trang_thai = 'DA_XUAT' THEN

        RAISE EXCEPTION
            'Phiếu xuất % đã được xử lý',
            p_ma_phieu_xuat;

    END IF;


    FOR v_ma_sp, v_so_luong IN

        SELECT
            ma_sp,
            so_luong

        FROM ct_phieu_xuat

        WHERE ma_phieu_xuat = p_ma_phieu_xuat

    LOOP

        SELECT so_luong

        INTO v_ton_hien_tai

        FROM ton_kho

        WHERE ma_kho = v_ma_kho
          AND ma_sp = v_ma_sp

        FOR UPDATE;


        IF NOT FOUND THEN

            RAISE EXCEPTION
                'Không tìm thấy tồn kho: kho %, sản phẩm %',
                v_ma_kho,
                v_ma_sp;

        END IF;


        IF v_ton_hien_tai < v_so_luong THEN

            RAISE EXCEPTION
                'Không đủ tồn kho: kho %, sản phẩm %, tồn %, cần xuất %',
                v_ma_kho,
                v_ma_sp,
                v_ton_hien_tai,
                v_so_luong;

        END IF;


        v_ton_sau :=
            v_ton_hien_tai - v_so_luong;


        UPDATE ton_kho

        SET
            so_luong = v_ton_sau,
            cap_nhat_luc = CURRENT_TIMESTAMP

        WHERE ma_kho = v_ma_kho
          AND ma_sp = v_ma_sp;


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

        ON CONFLICT (
            ma_kho,
            ma_sp,
            ngay
        )

        DO UPDATE SET

            xuat =
                lich_su_ton_kho.xuat
                + EXCLUDED.xuat,

            ton_cuoi =
                lich_su_ton_kho.ton_cuoi
                - EXCLUDED.xuat;

    END LOOP;


    UPDATE phieu_xuat

    SET
        trang_thai = 'DA_XUAT'

    WHERE ma_phieu_xuat = p_ma_phieu_xuat;


    RAISE NOTICE
        'Đã xử lý phiếu xuất % thành công',
        p_ma_phieu_xuat;

END;
$$;


-- ============================================================
-- 11. SAGA - SOURCE ACCEPT TRANSFER
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

    IF p_so_luong <= 0 THEN

        RAISE EXCEPTION
            'Số lượng điều chuyển phải > 0';

    END IF;


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


    SELECT COALESCE(
        SUM(so_luong_reserve),
        0
    )

    INTO v_reserved

    FROM stock_reservation

    WHERE ma_kho = p_ma_kho
      AND ma_sp = p_ma_sp
      AND trang_thai = 'RESERVED';


    IF (v_ton_kho - v_reserved) < p_so_luong THEN

        RAISE EXCEPTION
            'Không đủ tồn kho khả dụng. Kho=%, SP=%, TON=%, RESERVED=%, REQUEST=%',
            p_ma_kho,
            p_ma_sp,
            v_ton_kho,
            v_reserved,
            p_so_luong;

    END IF;


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
        0,
        CURRENT_TIMESTAMP
    );

END;
$$;


-- ============================================================
-- 12. SAGA - SOURCE REJECT TRANSFER
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

    UPDATE stock_reservation

    SET
        trang_thai = 'RELEASED',
        released_at = CURRENT_TIMESTAMP,
        release_reason = p_reason

    WHERE saga_id = p_saga_id
      AND ma_phieu_dc = p_ma_phieu_dc
      AND ma_kho = p_ma_kho
      AND ma_sp = p_ma_sp
      AND trang_thai = 'RESERVED';


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
-- 13. SAGA - SOURCE SHIP TRANSFER
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


    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Không tìm thấy reservation cho Saga %, phiếu %, kho %, SP %',
            p_saga_id,
            p_ma_phieu_dc,
            p_ma_kho,
            p_ma_sp;

    END IF;


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


    IF v_so_luong IS NULL
       OR v_so_luong <= 0 THEN

        RAISE EXCEPTION
            'Số lượng reservation không hợp lệ: %',
            v_so_luong;

    END IF;


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


    IF v_ton_hien_tai < v_so_luong THEN

        RAISE EXCEPTION
            'Không đủ tồn kho để ship. Kho=%, SP=%, TON=%, cần=%',
            p_ma_kho,
            p_ma_sp,
            v_ton_hien_tai,
            v_so_luong;

    END IF;


    v_ton_sau :=
        v_ton_hien_tai - v_so_luong;


    UPDATE ton_kho

    SET
        so_luong = v_ton_sau,
        cap_nhat_luc = CURRENT_TIMESTAMP

    WHERE ma_kho = p_ma_kho
      AND ma_sp = p_ma_sp;


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

    ON CONFLICT (
        ma_kho,
        ma_sp,
        ngay
    )

    DO UPDATE SET

        dieu_chuyen_ra =
            lich_su_ton_kho.dieu_chuyen_ra
            + EXCLUDED.dieu_chuyen_ra,

        ton_cuoi =
            lich_su_ton_kho.ton_cuoi
            - EXCLUDED.dieu_chuyen_ra;


    UPDATE stock_reservation

    SET
        trang_thai = 'CONSUMED'

    WHERE reservation_id = v_reservation_id;


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
            'saga_id', p_saga_id,
            'ma_giao_dich_global', p_global_id,
            'ma_phieu_dc', p_ma_phieu_dc,
            'ma_kho', p_ma_kho,
            'ma_sp', p_ma_sp,
            'so_luong', v_so_luong,
            'ton_truoc', v_ton_hien_tai,
            'ton_sau', v_ton_sau,
            'event_time', CURRENT_TIMESTAMP
        ),

        'PENDING',
        0,
        CURRENT_TIMESTAMP
    );


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
-- 14. SAGA - DESTINATION RECEIVE TRANSFER
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


    SELECT so_luong

    INTO v_ton_hien_tai

    FROM ton_kho

    WHERE ma_kho = p_ma_kho
      AND ma_sp = p_ma_sp

    FOR UPDATE;


    IF NOT FOUND THEN

        v_ton_hien_tai := 0;

        v_ton_sau :=
            p_so_luong_thuc_nhan;


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

        v_ton_sau :=
            v_ton_hien_tai
            + p_so_luong_thuc_nhan;


        UPDATE ton_kho

        SET
            so_luong = v_ton_sau,
            cap_nhat_luc = CURRENT_TIMESTAMP

        WHERE ma_kho = p_ma_kho
          AND ma_sp = p_ma_sp;

    END IF;


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

    ON CONFLICT (
        ma_kho,
        ma_sp,
        ngay
    )

    DO UPDATE SET

        dieu_chuyen_vao =
            lich_su_ton_kho.dieu_chuyen_vao
            + EXCLUDED.dieu_chuyen_vao,

        ton_cuoi =
            lich_su_ton_kho.ton_cuoi
            + EXCLUDED.dieu_chuyen_vao;


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
-- 15. XỬ LÝ TỰ ĐỘNG CÁC GIAO DỊCH ĐANG WAIT
--
-- WAITING
--    ↓
-- PROCESSING
--    ↓
-- Gọi lại function/procedure gốc
--    ↓
-- SUCCESS → COMPLETED
--
-- ERROR
--    ↓
-- retry_count + 1
--    ↓
-- còn retry → WAITING
-- hết retry → TIMEOUT
-- ============================================================

CREATE OR REPLACE FUNCTION sp_process_waiting_transactions(
    p_wait_seconds INT DEFAULT 10
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE

    r RECORD;

    v_processed INT := 0;

    v_error_message TEXT;

    v_retry_count INT;

BEGIN

    FOR r IN

        SELECT *

        FROM transaction_wait_queue

        WHERE trang_thai = 'WAITING'

          AND next_retry_at <= CURRENT_TIMESTAMP

          AND retry_count < max_retry_count

        ORDER BY next_retry_at

        FOR UPDATE SKIP LOCKED

    LOOP

        UPDATE transaction_wait_queue

        SET
            trang_thai = 'PROCESSING'

        WHERE wait_id = r.wait_id;


        BEGIN

            -- =================================================
            -- NHẬP KHO
            -- =================================================

            IF r.transaction_type = 'NHAP' THEN

                CALL sp_xu_ly_phieu_nhap(
                    r.transaction_id,
                    'WAIT_RETRY'
                );


            -- =================================================
            -- XUẤT KHO
            -- =================================================

            ELSIF r.transaction_type = 'XUAT' THEN

                CALL sp_xu_ly_phieu_xuat(
                    r.transaction_id,
                    'WAIT_RETRY'
                );


            -- =================================================
            -- ĐIỀU CHUYỂN ACCEPT
            -- =================================================

            ELSIF r.transaction_type = 'DIEU_CHUYEN_ACCEPT' THEN

                PERFORM sp_accept_transfer(
                    r.saga_id,
                    r.ma_giao_dich_global,
                    r.transaction_id,
                    r.ma_kho,
                    r.ma_sp,
                    r.so_luong
                );


            -- =================================================
            -- ĐIỀU CHUYỂN SHIP
            -- =================================================

            ELSIF r.transaction_type = 'DIEU_CHUYEN_SHIP' THEN

                PERFORM sp_ship_transfer(
                    r.saga_id,
                    r.ma_giao_dich_global,
                    r.transaction_id,
                    r.ma_kho,
                    r.ma_sp
                );


            -- =================================================
            -- ĐIỀU CHUYỂN RECEIVE
            -- =================================================

            ELSIF r.transaction_type = 'DIEU_CHUYEN_RECEIVE' THEN

                PERFORM sp_receive_transfer(
                    r.saga_id,
                    r.ma_giao_dich_global,
                    r.transaction_id,
                    r.ma_kho,
                    r.ma_sp,
                    r.so_luong
                );


            -- =================================================
            -- OUTBOX
            --
            -- Đưa event về PENDING để sync_service xử lý lại.
            -- =================================================

            ELSIF r.transaction_type = 'OUTBOX' THEN

                UPDATE outbox_event

                SET
                    status = 'PENDING',
                    next_retry_at = CURRENT_TIMESTAMP,
                    error_message = NULL

                WHERE event_id = r.transaction_id::UUID;


            ELSE

                RAISE EXCEPTION
                    'Loại giao dịch không hỗ trợ: %',
                    r.transaction_type;

            END IF;


            -- =================================================
            -- THÀNH CÔNG
            -- =================================================

            UPDATE transaction_wait_queue

            SET
                trang_thai = 'COMPLETED',
                completed_at = CURRENT_TIMESTAMP,
                last_retry_at = CURRENT_TIMESTAMP,
                error_message = NULL

            WHERE wait_id = r.wait_id;


            v_processed := v_processed + 1;


        EXCEPTION
            WHEN OTHERS THEN

                v_error_message := SQLERRM;

                v_retry_count :=
                    r.retry_count + 1;


                -- =============================================
                -- HẾT SỐ LẦN RETRY
                -- =============================================

                IF v_retry_count >= r.max_retry_count THEN

                    UPDATE transaction_wait_queue

                    SET
                        trang_thai = 'TIMEOUT',
                        retry_count = v_retry_count,
                        last_retry_at = CURRENT_TIMESTAMP,
                        completed_at = CURRENT_TIMESTAMP,
                        error_message = v_error_message

                    WHERE wait_id = r.wait_id;


                -- =============================================
                -- CÒN RETRY
                -- =============================================

                ELSE

                    UPDATE transaction_wait_queue

                    SET
                        trang_thai = 'WAITING',
                        retry_count = v_retry_count,
                        last_retry_at = CURRENT_TIMESTAMP,
                        next_retry_at =
                            CURRENT_TIMESTAMP
                            + make_interval(
                                secs => p_wait_seconds
                            ),
                        error_message = v_error_message

                    WHERE wait_id = r.wait_id;

                END IF;

        END;

    END LOOP;


    RETURN v_processed;

END;
$$;


-- ============================================================
-- 16. HÀM TẠO WAIT CHO PHIẾU XUẤT
--
-- Dùng khi không đủ tồn kho.
-- ============================================================

CREATE OR REPLACE FUNCTION sp_wait_phieu_xuat(
    p_ma_phieu_xuat VARCHAR(20),
    p_ma_kho VARCHAR(10),
    p_ma_sp VARCHAR(20),
    p_so_luong INT,
    p_reason TEXT DEFAULT NULL,
    p_wait_seconds INT DEFAULT 10
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
BEGIN

    RETURN sp_wait_transaction(
        'XUAT',
        p_ma_phieu_xuat,
        p_ma_kho,
        p_ma_sp,
        p_so_luong,
        NULL,
        NULL,
        COALESCE(
            p_reason,
            'Chờ bổ sung tồn kho để thực hiện xuất'
        ),
        p_wait_seconds,
        3
    );

END;
$$;


-- ============================================================
-- 17. HÀM TẠO WAIT CHO ACCEPT ĐIỀU CHUYỂN
-- ============================================================

CREATE OR REPLACE FUNCTION sp_wait_accept_transfer(
    p_saga_id UUID,
    p_global_id UUID,
    p_ma_phieu_dc VARCHAR(20),
    p_ma_kho VARCHAR(10),
    p_ma_sp VARCHAR(20),
    p_so_luong INT,
    p_reason TEXT DEFAULT NULL,
    p_wait_seconds INT DEFAULT 10
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
BEGIN

    RETURN sp_wait_transaction(
        'DIEU_CHUYEN_ACCEPT',
        p_ma_phieu_dc,
        p_ma_kho,
        p_ma_sp,
        p_so_luong,
        p_saga_id,
        p_global_id,
        COALESCE(
            p_reason,
            'Chờ đủ tồn kho khả dụng để xác nhận điều chuyển'
        ),
        p_wait_seconds,
        3
    );

END;
$$;


-- ============================================================
-- 18. HÀM TẠO WAIT CHO SHIP ĐIỀU CHUYỂN
-- ============================================================

CREATE OR REPLACE FUNCTION sp_wait_ship_transfer(
    p_saga_id UUID,
    p_global_id UUID,
    p_ma_phieu_dc VARCHAR(20),
    p_ma_kho VARCHAR(10),
    p_ma_sp VARCHAR(20),
    p_so_luong INT,
    p_reason TEXT DEFAULT NULL,
    p_wait_seconds INT DEFAULT 10
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
BEGIN

    RETURN sp_wait_transaction(
        'DIEU_CHUYEN_SHIP',
        p_ma_phieu_dc,
        p_ma_kho,
        p_ma_sp,
        p_so_luong,
        p_saga_id,
        p_global_id,
        COALESCE(
            p_reason,
            'Chờ đủ tồn kho để thực hiện ship điều chuyển'
        ),
        p_wait_seconds,
        3
    );

END;
$$;


-- ============================================================
-- 19. HÀM TẠO WAIT CHO RECEIVE ĐIỀU CHUYỂN
-- ============================================================

CREATE OR REPLACE FUNCTION sp_wait_receive_transfer(
    p_saga_id UUID,
    p_global_id UUID,
    p_ma_phieu_dc VARCHAR(20),
    p_ma_kho VARCHAR(10),
    p_ma_sp VARCHAR(20),
    p_so_luong_thuc_nhan INT,
    p_reason TEXT DEFAULT NULL,
    p_wait_seconds INT DEFAULT 10
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
BEGIN

    RETURN sp_wait_transaction(
        'DIEU_CHUYEN_RECEIVE',
        p_ma_phieu_dc,
        p_ma_kho,
        p_ma_sp,
        p_so_luong_thuc_nhan,
        p_saga_id,
        p_global_id,
        COALESCE(
            p_reason,
            'Chờ node đích sẵn sàng để nhận hàng'
        ),
        p_wait_seconds,
        3
    );

END;
$$;


-- ============================================================
-- 20. HÀM TẠO WAIT CHO OUTBOX
-- ============================================================

CREATE OR REPLACE FUNCTION sp_wait_outbox(
    p_event_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_wait_seconds INT DEFAULT 10
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
BEGIN

    RETURN sp_wait_transaction(
        'OUTBOX',
        p_event_id::VARCHAR,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        COALESCE(
            p_reason,
            'Chờ retry Outbox event'
        ),
        p_wait_seconds,
        3
    );

END;
$$;


-- ============================================================
-- 21. KIỂM TRA TRẠNG THÁI WAIT/RETRY
-- ============================================================

CREATE OR REPLACE VIEW v_transaction_wait_queue
AS
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

    last_retry_at,

    created_at,

    completed_at,

    reason,

    error_message

FROM transaction_wait_queue;


-- ============================================================
-- 22. KẾT THÚC FILE
-- ============================================================