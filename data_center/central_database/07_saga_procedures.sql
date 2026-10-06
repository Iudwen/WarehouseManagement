-- ============================================================
-- 07_saga_procedures.sql
-- ============================================================


BEGIN;


-- ============================================================
-- 0. UUID EXTENSION
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- 1. BẢNG COMPENSATION REQUEST
-- ============================================================

CREATE TABLE IF NOT EXISTS saga_compensation_request (

    compensation_id BIGSERIAL PRIMARY KEY,

    saga_id UUID NOT NULL,

    ma_giao_dich_global UUID NOT NULL,

    ma_phieu_dc VARCHAR(20) NOT NULL,

    vwh_id BIGINT,

    discrepancy_id BIGINT,

    compensation_type VARCHAR(30) NOT NULL,

    source_node VARCHAR(50),

    destination_node VARCHAR(50),

    ma_kho VARCHAR(10),

    ma_sp VARCHAR(20),

    so_luong INT NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',

    retry_count INT NOT NULL DEFAULT 0,

    max_retry_count INT NOT NULL DEFAULT 3,

    last_retry_at TIMESTAMP,

    next_retry_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    processed_at TIMESTAMP,

    error_message TEXT,

    resolution_note TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_compensation_type
        CHECK (
            compensation_type IN (
                'RETURN_TO_SOURCE',
                'ADJUSTMENT'
            )
        ),

    CONSTRAINT chk_compensation_status
        CHECK (
            status IN (
                'PENDING',
                'PROCESSING',
                'COMPLETED',
                'FAILED',
                'TIMEOUT'
            )
        ),

    CONSTRAINT chk_compensation_quantity
        CHECK (
            so_luong > 0
        ),

    CONSTRAINT chk_compensation_retry
        CHECK (
            retry_count >= 0
            AND max_retry_count > 0
            AND retry_count <= max_retry_count
        )
);


-- ============================================================
-- 2. INDEX COMPENSATION
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_compensation_saga
ON saga_compensation_request(saga_id);


CREATE INDEX IF NOT EXISTS idx_compensation_status
ON saga_compensation_request(status);


CREATE INDEX IF NOT EXISTS idx_compensation_next_retry
ON saga_compensation_request(next_retry_at);


CREATE INDEX IF NOT EXISTS idx_compensation_node
ON saga_compensation_request(source_node);


CREATE INDEX IF NOT EXISTS idx_compensation_discrepancy
ON saga_compensation_request(discrepancy_id);


CREATE UNIQUE INDEX IF NOT EXISTS uq_compensation_active
ON saga_compensation_request(
    saga_id,
    compensation_type
)
WHERE status IN (
    'PENDING',
    'PROCESSING'
);


-- ============================================================
-- 3. PROCEDURE: sp_create_saga
-- ============================================================

CREATE OR REPLACE FUNCTION sp_create_saga(
    p_ma_phieu_dc VARCHAR(20)
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE

    v_saga_id UUID;
    v_global_id UUID;

    v_ma_sp VARCHAR(20);

    v_kho_xuat VARCHAR(10);
    v_kho_nhap VARCHAR(10);

    v_so_luong INT;

    v_current_status VARCHAR(30);

    v_source_node VARCHAR(50);
    v_destination_node VARCHAR(50);

BEGIN

    -- ========================================================
    -- 1. VALIDATE INPUT
    -- ========================================================

    IF p_ma_phieu_dc IS NULL
       OR TRIM(p_ma_phieu_dc) = '' THEN

        RAISE EXCEPTION
            'Mã phiếu điều chuyển không được để trống';

    END IF;


    -- ========================================================
    -- 2. KHÓA PHIẾU
    -- ========================================================

    SELECT
        ma_sp,
        kho_xuat,
        kho_nhap,
        so_luong,
        trang_thai

    INTO
        v_ma_sp,
        v_kho_xuat,
        v_kho_nhap,
        v_so_luong,
        v_current_status

    FROM dieu_chuyen_central

    WHERE ma_phieu_dc = p_ma_phieu_dc

    FOR UPDATE;


    -- ========================================================
    -- 3. KIỂM TRA TỒN TẠI
    -- ========================================================

    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Không tìm thấy phiếu điều chuyển: %',
            p_ma_phieu_dc;

    END IF;


    -- ========================================================
    -- 4. KIỂM TRA TRẠNG THÁI
    -- ========================================================

    IF v_current_status NOT IN (
        'CHO_XU_LY',
        'CREATED',
        'PENDING'
    ) THEN

        RAISE EXCEPTION
            'Phiếu % không ở trạng thái chờ xử lý. Trạng thái hiện tại: %',
            p_ma_phieu_dc,
            v_current_status;

    END IF;


    -- ========================================================
    -- 5. VALIDATE SẢN PHẨM
    -- ========================================================

    IF v_ma_sp IS NULL
       OR TRIM(v_ma_sp) = '' THEN

        RAISE EXCEPTION
            'Sản phẩm của phiếu % không hợp lệ',
            p_ma_phieu_dc;

    END IF;


    -- ========================================================
    -- 6. VALIDATE SỐ LƯỢNG
    -- ========================================================

    IF v_so_luong IS NULL
       OR v_so_luong <= 0 THEN

        RAISE EXCEPTION
            'Số lượng điều chuyển không hợp lệ: %',
            v_so_luong;

    END IF;


    -- ========================================================
    -- 7. VALIDATE KHO XUẤT
    -- ========================================================

    IF v_kho_xuat IS NULL
       OR TRIM(v_kho_xuat) = '' THEN

        RAISE EXCEPTION
            'Kho xuất không hợp lệ cho phiếu: %',
            p_ma_phieu_dc;

    END IF;


    -- ========================================================
    -- 8. VALIDATE KHO NHẬP
    -- ========================================================

    IF v_kho_nhap IS NULL
       OR TRIM(v_kho_nhap) = '' THEN

        RAISE EXCEPTION
            'Kho nhập không hợp lệ cho phiếu: %',
            p_ma_phieu_dc;

    END IF;


    -- ========================================================
    -- 9. KHO XUẤT != KHO NHẬP
    -- ========================================================

    IF v_kho_xuat = v_kho_nhap THEN

        RAISE EXCEPTION
            'Kho xuất và kho nhập không được giống nhau: %',
            v_kho_xuat;

    END IF;


    -- ========================================================
    -- 10. KIỂM TRA SAGA ĐÃ TỒN TẠI
    -- ========================================================

    SELECT saga_id
    INTO v_saga_id
    FROM saga_transaction
    WHERE ma_phieu_dc = p_ma_phieu_dc
    LIMIT 1;


    IF FOUND THEN

        RAISE EXCEPTION
            'Phiếu % đã có Saga: %',
            p_ma_phieu_dc,
            v_saga_id;

    END IF;


    -- ========================================================
    -- 11. LẤY NODE NGUỒN
    -- ========================================================

    SELECT node_name
    INTO v_source_node
    FROM kho
    WHERE ma_kho = v_kho_xuat;


    IF NOT FOUND
       OR v_source_node IS NULL
       OR TRIM(v_source_node) = '' THEN

        RAISE EXCEPTION
            'Không xác định được node của kho xuất: %',
            v_kho_xuat;

    END IF;


    -- ========================================================
    -- 12. LẤY NODE ĐÍCH
    -- ========================================================

    SELECT node_name
    INTO v_destination_node
    FROM kho
    WHERE ma_kho = v_kho_nhap;


    IF NOT FOUND
       OR v_destination_node IS NULL
       OR TRIM(v_destination_node) = '' THEN

        RAISE EXCEPTION
            'Không xác định được node của kho nhập: %',
            v_kho_nhap;

    END IF;


    -- ========================================================
    -- 13. GLOBAL TRANSACTION ID
    -- ========================================================

    v_global_id := gen_random_uuid();


    -- ========================================================
    -- 14. TẠO SAGA
    -- ========================================================

    INSERT INTO saga_transaction (

        saga_id,

        ma_giao_dich_global,

        ma_phieu_dc,

        kho_xuat,

        kho_nhap,

        ma_sp,

        so_luong_yeu_cau,

        so_luong_da_xuat,

        so_luong_thuc_nhan,

        so_luong_chenh_lech,

        current_state,

        status,

        source_node,

        destination_node,

        source_confirm_deadline,

        ship_deadline,

        receive_deadline,

        created_at,

        updated_at

    )

    VALUES (

        gen_random_uuid(),

        v_global_id,

        p_ma_phieu_dc,

        v_kho_xuat,

        v_kho_nhap,

        v_ma_sp,

        v_so_luong,

        0,

        0,

        0,

        'WAITING_SOURCE_CONFIRMATION',

        'RUNNING',

        v_source_node,

        v_destination_node,

        CURRENT_TIMESTAMP + INTERVAL '30 minutes',

        CURRENT_TIMESTAMP + INTERVAL '2 hours',

        CURRENT_TIMESTAMP + INTERVAL '24 hours',

        CURRENT_TIMESTAMP,

        CURRENT_TIMESTAMP

    )

    RETURNING saga_id
    INTO v_saga_id;


    -- ========================================================
    -- 15. TẠO MONITORING
    -- ========================================================

    INSERT INTO saga_monitoring (

        saga_id,

        ma_giao_dich_global,

        ma_phieu_dc,

        kho_xuat,

        kho_nhap,

        ma_sp,

        so_luong_yeu_cau,

        so_luong_da_xuat,

        so_luong_thuc_nhan,

        so_luong_chenh_lech,

        current_state,

        status,

        source_node,

        destination_node,

        last_event_type,

        last_event_at,

        source_confirm_deadline,

        ship_deadline,

        receive_deadline,

        created_at,

        updated_at

    )

    SELECT

        s.saga_id,

        s.ma_giao_dich_global,

        s.ma_phieu_dc,

        s.kho_xuat,

        s.kho_nhap,

        s.ma_sp,

        s.so_luong_yeu_cau,

        s.so_luong_da_xuat,

        s.so_luong_thuc_nhan,

        s.so_luong_chenh_lech,

        s.current_state,

        s.status,

        s.source_node,

        s.destination_node,

        'SAGA_CREATED',

        CURRENT_TIMESTAMP,

        s.source_confirm_deadline,

        s.ship_deadline,

        s.receive_deadline,

        CURRENT_TIMESTAMP,

        CURRENT_TIMESTAMP

    FROM saga_transaction s

    WHERE s.saga_id = v_saga_id;


    -- ========================================================
    -- 16. CẬP NHẬT PHIẾU
    -- ========================================================

    UPDATE dieu_chuyen_central

    SET
        trang_thai = 'DANG_XU_LY'

    WHERE ma_phieu_dc = p_ma_phieu_dc;


    RETURN v_saga_id;

END;
$$;


-- ============================================================
-- 4. PROCEDURE: sp_create_vwh_transfer
-- ============================================================

CREATE OR REPLACE FUNCTION sp_create_vwh_transfer(
    p_saga_id UUID,
    p_global_id UUID,
    p_ma_phieu_dc VARCHAR(20),
    p_so_luong_xuat INT
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE

    v_vwh_id BIGINT;

    v_ma_giao_dich_global UUID;

    v_ma_phieu_dc VARCHAR(20);

    v_ma_sp VARCHAR(20);

    v_kho_xuat VARCHAR(10);
    v_kho_nhap VARCHAR(10);

    v_so_luong_yeu_cau INT;
    v_so_luong_da_xuat INT;

    v_status VARCHAR(20);

    v_vwh_exists BIGINT;

BEGIN

    -- ========================================================
    -- 1. VALIDATE
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
            'Mã phiếu điều chuyển không được để trống';

    END IF;


    IF p_so_luong_xuat IS NULL
       OR p_so_luong_xuat <= 0 THEN

        RAISE EXCEPTION
            'Số lượng xuất phải lớn hơn 0: %',
            p_so_luong_xuat;

    END IF;


    -- ========================================================
    -- 2. KHÓA SAGA
    -- ========================================================

    SELECT

        ma_giao_dich_global,

        ma_phieu_dc,

        ma_sp,

        kho_xuat,

        kho_nhap,

        so_luong_yeu_cau,

        so_luong_da_xuat,

        status

    INTO

        v_ma_giao_dich_global,

        v_ma_phieu_dc,

        v_ma_sp,

        v_kho_xuat,

        v_kho_nhap,

        v_so_luong_yeu_cau,

        v_so_luong_da_xuat,

        v_status

    FROM saga_transaction

    WHERE saga_id = p_saga_id

    FOR UPDATE;


    -- ========================================================
    -- 3. KIỂM TRA SAGA
    -- ========================================================

    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Không tìm thấy Saga: %',
            p_saga_id;

    END IF;


    -- ========================================================
    -- 4. GLOBAL ID
    -- ========================================================

    IF v_ma_giao_dich_global <> p_global_id THEN

        RAISE EXCEPTION
            'global_id không khớp với Saga %',
            p_saga_id;

    END IF;


    -- ========================================================
    -- 5. PHIẾU
    -- ========================================================

    IF v_ma_phieu_dc <> p_ma_phieu_dc THEN

        RAISE EXCEPTION
            'Phiếu % không khớp với Saga %',
            p_ma_phieu_dc,
            p_saga_id;

    END IF;


    -- ========================================================
    -- 6. STATUS
    -- ========================================================

    IF v_status <> 'RUNNING' THEN

        RAISE EXCEPTION
            'Saga % không ở trạng thái RUNNING. Status=%',
            p_saga_id,
            v_status;

    END IF;


    -- ========================================================
    -- 7. SỐ LƯỢNG
    -- ========================================================

    IF p_so_luong_xuat > v_so_luong_yeu_cau THEN

        RAISE EXCEPTION
            'Số lượng xuất (%) vượt số lượng yêu cầu (%)',
            p_so_luong_xuat,
            v_so_luong_yeu_cau;

    END IF;


    IF v_so_luong_da_xuat + p_so_luong_xuat
       > v_so_luong_yeu_cau THEN

        RAISE EXCEPTION
            'Tổng số lượng đã xuất vượt số lượng yêu cầu';

    END IF;


    -- ========================================================
    -- 8. KIỂM TRA VWH
    -- ========================================================

    SELECT vwh_id
    INTO v_vwh_exists

    FROM vwh_transfer

    WHERE saga_id = p_saga_id

    ORDER BY vwh_id

    LIMIT 1

    FOR UPDATE;


    IF FOUND THEN

        RAISE NOTICE
            'VWH đã tồn tại: vwh_id=%',
            v_vwh_exists;

        RETURN v_vwh_exists;

    END IF;


    -- ========================================================
    -- 9. TẠO VWH
    -- ========================================================

    INSERT INTO vwh_transfer (

        saga_id,

        ma_phieu_dc,

        ma_sp,

        kho_xuat,

        kho_nhap,

        so_luong_xuat,

        so_luong_da_nhan,

        so_luong_dang_van_chuyen,

        trang_thai,

        created_at,

        updated_at

    )

    VALUES (

        p_saga_id,

        p_ma_phieu_dc,

        v_ma_sp,

        v_kho_xuat,

        v_kho_nhap,

        p_so_luong_xuat,

        0,

        p_so_luong_xuat,

        'IN_TRANSIT',

        CURRENT_TIMESTAMP,

        CURRENT_TIMESTAMP

    )

    RETURNING vwh_id
    INTO v_vwh_id;


    -- ========================================================
    -- 10. UPDATE SAGA
    -- ========================================================

    UPDATE saga_transaction

    SET

        so_luong_da_xuat =
            so_luong_da_xuat + p_so_luong_xuat,

        current_state = 'IN_TRANSIT',

        updated_at = CURRENT_TIMESTAMP

    WHERE saga_id = p_saga_id;


    -- ========================================================
    -- 11. UPDATE MONITORING
    -- ========================================================

    UPDATE saga_monitoring

    SET

        so_luong_da_xuat =
            so_luong_da_xuat + p_so_luong_xuat,

        current_state = 'IN_TRANSIT',

        last_event_type = 'TRANSFER_SHIPPED',

        last_event_at = CURRENT_TIMESTAMP,

        updated_at = CURRENT_TIMESTAMP,

        error_message = NULL

    WHERE saga_id = p_saga_id;


    RAISE NOTICE
        'Tạo VWH thành công: vwh_id=%, phiếu=%, SP=%, SL=%',
        v_vwh_id,
        p_ma_phieu_dc,
        v_ma_sp,
        p_so_luong_xuat;


    RETURN v_vwh_id;

END;
$$;


-- ============================================================
-- 5. PROCEDURE: sp_create_compensation_request
-- ============================================================

CREATE OR REPLACE FUNCTION sp_create_compensation_request(
    p_saga_id UUID,
    p_discrepancy_id BIGINT,
    p_compensation_type VARCHAR(30),
    p_so_luong INT,
    p_resolution_note TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE

    v_compensation_id BIGINT;

    v_global_id UUID;
    v_ma_phieu_dc VARCHAR(20);

    v_vwh_id BIGINT;

    v_kho_xuat VARCHAR(10);
    v_kho_nhap VARCHAR(10);

    v_ma_sp VARCHAR(20);

    v_source_node VARCHAR(50);
    v_destination_node VARCHAR(50);

BEGIN

    -- ========================================================
    -- 1. VALIDATE
    -- ========================================================

    IF p_saga_id IS NULL THEN

        RAISE EXCEPTION
            'saga_id không được NULL';

    END IF;


    IF p_compensation_type NOT IN (
        'RETURN_TO_SOURCE',
        'ADJUSTMENT'
    ) THEN

        RAISE EXCEPTION
            'Loại compensation không hợp lệ: %',
            p_compensation_type;

    END IF;


    IF p_so_luong IS NULL
       OR p_so_luong <= 0 THEN

        RAISE EXCEPTION
            'Số lượng compensation không hợp lệ: %',
            p_so_luong;

    END IF;


    -- ========================================================
    -- 2. KHÓA SAGA
    -- ========================================================

    SELECT

        ma_giao_dich_global,

        ma_phieu_dc,

        kho_xuat,

        kho_nhap,

        ma_sp,

        source_node,

        destination_node

    INTO

        v_global_id,

        v_ma_phieu_dc,

        v_kho_xuat,

        v_kho_nhap,

        v_ma_sp,

        v_source_node,

        v_destination_node

    FROM saga_transaction

    WHERE saga_id = p_saga_id

    FOR UPDATE;


    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Không tìm thấy Saga: %',
            p_saga_id;

    END IF;


    -- ========================================================
    -- 3. LẤY VWH
    -- ========================================================

    SELECT vwh_id

    INTO v_vwh_id

    FROM vwh_transfer

    WHERE saga_id = p_saga_id

    ORDER BY vwh_id DESC

    LIMIT 1;


    -- ========================================================
    -- 4. KIỂM TRA REQUEST ĐANG ACTIVE
    -- ========================================================

    SELECT compensation_id

    INTO v_compensation_id

    FROM saga_compensation_request

    WHERE saga_id = p_saga_id

      AND compensation_type = p_compensation_type

      AND status IN (
          'PENDING',
          'PROCESSING'
      )

    LIMIT 1;


    IF FOUND THEN

        RETURN v_compensation_id;

    END IF;


    -- ========================================================
    -- 5. TẠO REQUEST
    -- ========================================================

    INSERT INTO saga_compensation_request (

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

        resolution_note,

        created_at,

        updated_at

    )

    VALUES (

        p_saga_id,

        v_global_id,

        v_ma_phieu_dc,

        v_vwh_id,

        p_discrepancy_id,

        p_compensation_type,

        v_source_node,

        v_destination_node,

        v_kho_xuat,

        v_ma_sp,

        p_so_luong,

        'PENDING',

        0,

        3,

        CURRENT_TIMESTAMP,

        p_resolution_note,

        CURRENT_TIMESTAMP,

        CURRENT_TIMESTAMP

    )

    RETURNING compensation_id

    INTO v_compensation_id;


    RETURN v_compensation_id;

END;
$$;


-- ============================================================
-- 6. PROCEDURE: sp_resolve_transfer_discrepancy
-- ============================================================

CREATE OR REPLACE FUNCTION sp_resolve_transfer_discrepancy(
    p_discrepancy_id BIGINT,
    p_huong_xu_ly VARCHAR(30),
    p_resolved_by VARCHAR(50),
    p_resolution_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE

    v_saga_id UUID;

    v_vwh_id BIGINT;

    v_ma_phieu_dc VARCHAR(20);

    v_so_luong_chenh_lech INT;

    v_trang_thai VARCHAR(20);

    v_kho_xuat VARCHAR(10);

    v_kho_nhap VARCHAR(10);

    v_compensation_id BIGINT;

BEGIN

    -- ========================================================
    -- 1. VALIDATE
    -- ========================================================

    IF p_discrepancy_id IS NULL THEN

        RAISE EXCEPTION
            'discrepancy_id không được NULL';

    END IF;


    IF p_huong_xu_ly IS NULL
       OR p_huong_xu_ly NOT IN (
            'RETURN_TO_SOURCE',
            'LOSS',
            'ADJUSTMENT'
       ) THEN

        RAISE EXCEPTION
            'Hướng xử lý không hợp lệ: %',
            p_huong_xu_ly;

    END IF;


    IF p_resolved_by IS NULL
       OR TRIM(p_resolved_by) = '' THEN

        RAISE EXCEPTION
            'resolved_by không được NULL hoặc rỗng';

    END IF;


    -- ========================================================
    -- 2. KHÓA DISCREPANCY
    -- ========================================================

    SELECT

        saga_id,

        vwh_id,

        ma_phieu_dc,

        so_luong_chenh_lech,

        trang_thai,

        kho_xuat,

        kho_nhap

    INTO

        v_saga_id,

        v_vwh_id,

        v_ma_phieu_dc,

        v_so_luong_chenh_lech,

        v_trang_thai,

        v_kho_xuat,

        v_kho_nhap

    FROM transfer_discrepancy

    WHERE discrepancy_id = p_discrepancy_id

    FOR UPDATE;


    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Không tìm thấy discrepancy ID=%',
            p_discrepancy_id;

    END IF;


    -- ========================================================
    -- 3. CHỈ XỬ LÝ PENDING
    -- ========================================================

    IF v_trang_thai <> 'PENDING' THEN

        RAISE EXCEPTION
            'Discrepancy ID=% đã được xử lý, trạng thái=%',
            p_discrepancy_id,
            v_trang_thai;

    END IF;


    -- ========================================================
    -- 4. VALIDATE SỐ LƯỢNG
    -- ========================================================

    IF v_so_luong_chenh_lech IS NULL
       OR v_so_luong_chenh_lech <= 0 THEN

        RAISE EXCEPTION
            'Discrepancy ID=% không có số lượng chênh lệch',
            p_discrepancy_id;

    END IF;


    -- ========================================================
    -- 5. VALIDATE SAGA
    -- ========================================================

    IF v_saga_id IS NULL THEN

        RAISE EXCEPTION
            'Discrepancy ID=% không có saga_id',
            p_discrepancy_id;

    END IF;


    -- ========================================================
    -- 6. CẬP NHẬT DISCREPANCY
    -- ========================================================

    UPDATE transfer_discrepancy

    SET

        huong_xu_ly = p_huong_xu_ly,

        trang_thai = 'RESOLVED',

        resolved_at = CURRENT_TIMESTAMP,

        resolved_by = p_resolved_by,

        resolution_note = p_resolution_note

    WHERE discrepancy_id = p_discrepancy_id;


    -- ========================================================
    -- 7. RETURN TO SOURCE
    -- ========================================================

    IF p_huong_xu_ly = 'RETURN_TO_SOURCE' THEN

        UPDATE vwh_transfer

        SET

            trang_thai = 'COMPENSATING',

            updated_at = CURRENT_TIMESTAMP

        WHERE vwh_id = v_vwh_id;


        UPDATE saga_transaction

        SET

            so_luong_chenh_lech =
                v_so_luong_chenh_lech,

            current_state =
                'COMPENSATION_REQUIRED',

            status =
                'RUNNING',

            updated_at =
                CURRENT_TIMESTAMP

        WHERE saga_id = v_saga_id;


        UPDATE saga_monitoring

        SET

            so_luong_chenh_lech =
                v_so_luong_chenh_lech,

            current_state =
                'COMPENSATION_REQUIRED',

            status =
                'RUNNING',

            last_event_type =
                'COMPENSATION_REQUIRED',

            last_event_at =
                CURRENT_TIMESTAMP,

            updated_at =
                CURRENT_TIMESTAMP,

            error_message =
                NULL

        WHERE saga_id = v_saga_id;


        -- ----------------------------------------------------
        -- TẠO COMPENSATION REQUEST
        -- ----------------------------------------------------

        v_compensation_id :=
            sp_create_compensation_request(
                v_saga_id,
                p_discrepancy_id,
                'RETURN_TO_SOURCE',
                v_so_luong_chenh_lech,
                p_resolution_note
            );


        RAISE NOTICE
            'Tạo compensation RETURN_TO_SOURCE: ID=%',
            v_compensation_id;


    -- ========================================================
    -- LOSS
    -- ========================================================

    ELSIF p_huong_xu_ly = 'LOSS' THEN

        UPDATE vwh_transfer

        SET

            so_luong_dang_van_chuyen =
                GREATEST(
                    so_luong_dang_van_chuyen
                    - v_so_luong_chenh_lech,
                    0
                ),

            trang_thai =

                CASE

                    WHEN
                        GREATEST(
                            so_luong_dang_van_chuyen
                            - v_so_luong_chenh_lech,
                            0
                        ) = 0

                    THEN 'CLOSED'

                    ELSE 'DISCREPANCY'

                END,

            updated_at =
                CURRENT_TIMESTAMP

        WHERE vwh_id = v_vwh_id;


        UPDATE saga_transaction

        SET

            so_luong_chenh_lech = 0,

            current_state =
                'COMPLETED',

            status =
                'SUCCESS',

            completed_at =
                CURRENT_TIMESTAMP,

            updated_at =
                CURRENT_TIMESTAMP

        WHERE saga_id = v_saga_id;


        UPDATE saga_monitoring

        SET

            so_luong_chenh_lech = 0,

            current_state =
                'COMPLETED',

            status =
                'SUCCESS',

            last_event_type =
                'DISCREPANCY_LOSS_RESOLVED',

            last_event_at =
                CURRENT_TIMESTAMP,

            updated_at =
                CURRENT_TIMESTAMP,

            error_message =
                NULL

        WHERE saga_id = v_saga_id;


    -- ========================================================
    -- ADJUSTMENT
    -- ========================================================

    ELSIF p_huong_xu_ly = 'ADJUSTMENT' THEN

        UPDATE vwh_transfer

        SET

            trang_thai =
                'COMPENSATING',

            updated_at =
                CURRENT_TIMESTAMP

        WHERE vwh_id = v_vwh_id;


        UPDATE saga_transaction

        SET

            so_luong_chenh_lech =
                v_so_luong_chenh_lech,

            current_state =
                'COMPENSATION_REQUIRED',

            status =
                'RUNNING',

            updated_at =
                CURRENT_TIMESTAMP

        WHERE saga_id = v_saga_id;


        UPDATE saga_monitoring

        SET

            so_luong_chenh_lech =
                v_so_luong_chenh_lech,

            current_state =
                'COMPENSATION_REQUIRED',

            status =
                'RUNNING',

            last_event_type =
                'COMPENSATION_REQUIRED',

            last_event_at =
                CURRENT_TIMESTAMP,

            updated_at =
                CURRENT_TIMESTAMP,

            error_message =
                NULL

        WHERE saga_id = v_saga_id;


        -- ----------------------------------------------------
        -- TẠO COMPENSATION REQUEST
        -- ----------------------------------------------------

        v_compensation_id :=
            sp_create_compensation_request(
                v_saga_id,
                p_discrepancy_id,
                'ADJUSTMENT',
                v_so_luong_chenh_lech,
                p_resolution_note
            );


        RAISE NOTICE
            'Tạo compensation ADJUSTMENT: ID=%',
            v_compensation_id;

    END IF;


    -- ========================================================
    -- 8. LOG
    -- ========================================================

    RAISE NOTICE
        'Đã xử lý discrepancy: ID=%, phiếu=%, hướng=%, chênh lệch=%',
        p_discrepancy_id,
        v_ma_phieu_dc,
        p_huong_xu_ly,
        v_so_luong_chenh_lech;

END;
$$;


-- ============================================================
-- 7. LẤY CÁC COMPENSATION ĐẾN HẠN RETRY
-- ============================================================

CREATE OR REPLACE FUNCTION sp_get_pending_compensation_requests(
    p_limit INT DEFAULT 20
)
RETURNS TABLE (

    compensation_id BIGINT,

    saga_id UUID,

    ma_giao_dich_global UUID,

    ma_phieu_dc VARCHAR(20),

    vwh_id BIGINT,

    discrepancy_id BIGINT,

    compensation_type VARCHAR(30),

    source_node VARCHAR(50),

    destination_node VARCHAR(50),

    ma_kho VARCHAR(10),

    ma_sp VARCHAR(20),

    so_luong INT,

    status VARCHAR(20),

    retry_count INT,

    max_retry_count INT,

    next_retry_at TIMESTAMP,

    error_message TEXT

)
LANGUAGE plpgsql
AS $$
BEGIN

    RETURN QUERY

    SELECT

        c.compensation_id,

        c.saga_id,

        c.ma_giao_dich_global,

        c.ma_phieu_dc,

        c.vwh_id,

        c.discrepancy_id,

        c.compensation_type,

        c.source_node,

        c.destination_node,

        c.ma_kho,

        c.ma_sp,

        c.so_luong,

        c.status,

        c.retry_count,

        c.max_retry_count,

        c.next_retry_at,

        c.error_message

    FROM saga_compensation_request c

    WHERE c.status IN (
        'PENDING',
        'FAILED'
    )

      AND c.next_retry_at <= CURRENT_TIMESTAMP

      AND c.retry_count < c.max_retry_count

    ORDER BY
        c.next_retry_at,
        c.compensation_id

    LIMIT GREATEST(p_limit, 1);

END;
$$;


-- ============================================================
-- 8. MARK COMPENSATION PROCESSING
-- ============================================================

CREATE OR REPLACE FUNCTION sp_start_compensation(
    p_compensation_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE

    v_status VARCHAR(20);

    v_retry_count INT;

    v_max_retry_count INT;

BEGIN

    SELECT
        status,
        retry_count,
        max_retry_count

    INTO
        v_status,
        v_retry_count,
        v_max_retry_count

    FROM saga_compensation_request

    WHERE compensation_id =
        p_compensation_id

    FOR UPDATE;


    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Không tìm thấy compensation ID=%',
            p_compensation_id;

    END IF;


    IF v_status NOT IN (
        'PENDING',
        'FAILED'
    ) THEN

        RAISE EXCEPTION
            'Compensation ID=% không thể PROCESSING. Status=%',
            p_compensation_id,
            v_status;

    END IF;


    UPDATE saga_compensation_request

    SET

        status =
            'PROCESSING',

        retry_count =
            v_retry_count + 1,

        last_retry_at =
            CURRENT_TIMESTAMP,

        updated_at =
            CURRENT_TIMESTAMP

    WHERE compensation_id =
        p_compensation_id;

END;
$$;


-- ============================================================
-- 9. MARK COMPENSATION COMPLETED
-- ============================================================

CREATE OR REPLACE FUNCTION sp_complete_compensation(
    p_compensation_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE

    v_saga_id UUID;

    v_vwh_id BIGINT;

    v_compensation_type VARCHAR(30);

    v_so_luong INT;

    v_retry_count INT;

BEGIN

    SELECT

        saga_id,

        vwh_id,

        compensation_type,

        so_luong,

        retry_count

    INTO

        v_saga_id,

        v_vwh_id,

        v_compensation_type,

        v_so_luong,

        v_retry_count

    FROM saga_compensation_request

    WHERE compensation_id =
        p_compensation_id

    FOR UPDATE;


    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Không tìm thấy compensation ID=%',
            p_compensation_id;

    END IF;


    UPDATE saga_compensation_request

    SET

        status =
            'COMPLETED',

        processed_at =
            CURRENT_TIMESTAMP,

        error_message =
            NULL,

        updated_at =
            CURRENT_TIMESTAMP

    WHERE compensation_id =
        p_compensation_id;


    -- ========================================================
    -- UPDATE VWH
    -- ========================================================

    IF v_vwh_id IS NOT NULL THEN

        UPDATE vwh_transfer

        SET

            so_luong_dang_van_chuyen =
                GREATEST(
                    so_luong_dang_van_chuyen
                    - v_so_luong,
                    0
                ),

            trang_thai =
                'CLOSED',

            updated_at =
                CURRENT_TIMESTAMP

        WHERE vwh_id =
            v_vwh_id;

    END IF;


    -- ========================================================
    -- UPDATE SAGA
    -- ========================================================

    UPDATE saga_transaction

    SET

        so_luong_chenh_lech =
            0,

        current_state =
            'COMPLETED',

        status =
            'SUCCESS',

        completed_at =
            CURRENT_TIMESTAMP,

        updated_at =
            CURRENT_TIMESTAMP

    WHERE saga_id =
        v_saga_id;


    -- ========================================================
    -- UPDATE MONITORING
    -- ========================================================

    UPDATE saga_monitoring

    SET

        so_luong_chenh_lech =
            0,

        current_state =
            'COMPLETED',

        status =
            'SUCCESS',

        last_event_type =
            'COMPENSATION_COMPLETED',

        last_event_at =
            CURRENT_TIMESTAMP,

        updated_at =
            CURRENT_TIMESTAMP,

        error_message =
            NULL

    WHERE saga_id =
        v_saga_id;

END;
$$;


-- ============================================================
-- 10. MARK COMPENSATION FAILED / RETRY
-- ============================================================

CREATE OR REPLACE FUNCTION sp_fail_compensation(
    p_compensation_id BIGINT,
    p_error_message TEXT,
    p_retry_delay_seconds INT DEFAULT 10
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE

    v_retry_count INT;

    v_max_retry_count INT;

    v_saga_id UUID;

BEGIN

    SELECT

        retry_count,

        max_retry_count,

        saga_id

    INTO

        v_retry_count,

        v_max_retry_count,

        v_saga_id

    FROM saga_compensation_request

    WHERE compensation_id =
        p_compensation_id

    FOR UPDATE;


    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Không tìm thấy compensation ID=%',
            p_compensation_id;

    END IF;


    IF v_retry_count >= v_max_retry_count THEN

        UPDATE saga_compensation_request

        SET

            status =
                'TIMEOUT',

            error_message =
                p_error_message,

            updated_at =
                CURRENT_TIMESTAMP

        WHERE compensation_id =
            p_compensation_id;


        UPDATE saga_transaction

        SET

            current_state =
                'COMPENSATION_REQUIRED',

            status =
                'FAILED',

            updated_at =
                CURRENT_TIMESTAMP

        WHERE saga_id =
            v_saga_id;


        UPDATE saga_monitoring

        SET

            current_state =
                'COMPENSATION_REQUIRED',

            status =
                'FAILED',

            last_event_type =
                'COMPENSATION_TIMEOUT',

            last_event_at =
                CURRENT_TIMESTAMP,

            error_message =
                p_error_message,

            updated_at =
                CURRENT_TIMESTAMP

        WHERE saga_id =
            v_saga_id;


    ELSE

        UPDATE saga_compensation_request

        SET

            status =
                'FAILED',

            error_message =
                p_error_message,

            next_retry_at =
                CURRENT_TIMESTAMP
                + make_interval(
                    secs => GREATEST(
                        p_retry_delay_seconds,
                        1
                    )
                ),

            updated_at =
                CURRENT_TIMESTAMP

        WHERE compensation_id =
            p_compensation_id;

    END IF;

END;
$$;


-- ============================================================
-- 11. VIEW COMPENSATION MONITORING
-- ============================================================

CREATE OR REPLACE VIEW v_saga_compensation_monitoring AS

SELECT

    c.compensation_id,

    c.saga_id,

    c.ma_giao_dich_global,

    c.ma_phieu_dc,

    c.vwh_id,

    c.discrepancy_id,

    c.compensation_type,

    c.source_node,

    c.destination_node,

    c.ma_kho,

    c.ma_sp,

    c.so_luong,

    c.status,

    c.retry_count,

    c.max_retry_count,

    c.last_retry_at,

    c.next_retry_at,

    c.processed_at,

    c.error_message,

    c.created_at,

    c.updated_at

FROM saga_compensation_request c;


-- ============================================================
-- 12. COMMENT
-- ============================================================

COMMENT ON FUNCTION sp_create_saga(VARCHAR)
IS
'Tạo Saga tại Central từ phiếu điều chuyển đã được Admin xác nhận. Khóa phiếu, kiểm tra trạng thái, tạo saga_transaction và saga_monitoring. Không trực tiếp thay đổi TON_KHO tại các node.';


COMMENT ON FUNCTION sp_create_vwh_transfer(
    UUID,
    UUID,
    VARCHAR,
    INT
)
IS
'Tạo Virtual Warehouse Transfer sau khi node nguồn xuất hàng thành công. Không cộng TON_KHO tại node đích.';


COMMENT ON FUNCTION sp_create_compensation_request(
    UUID,
    BIGINT,
    VARCHAR,
    INT,
    TEXT
)
IS
'Tạo yêu cầu compensation tại Central cho RETURN_TO_SOURCE hoặc ADJUSTMENT. Không trực tiếp thay đổi TON_KHO tại Node.';


COMMENT ON FUNCTION sp_resolve_transfer_discrepancy(
    BIGINT,
    VARCHAR,
    VARCHAR,
    TEXT
)
IS
'Xử lý discrepancy. LOSS hoàn tất Saga; RETURN_TO_SOURCE và ADJUSTMENT tạo compensation request để Node thực hiện xử lý.';


COMMENT ON FUNCTION sp_get_pending_compensation_requests(INT)
IS
'Lấy các compensation request đang chờ hoặc cần retry.';


COMMENT ON FUNCTION sp_start_compensation(BIGINT)
IS
'Đưa compensation request sang PROCESSING và tăng retry_count.';


COMMENT ON FUNCTION sp_complete_compensation(BIGINT)
IS
'Đánh dấu compensation hoàn tất và cập nhật Saga/VWH tại Central.';


COMMENT ON FUNCTION sp_fail_compensation(BIGINT, TEXT, INT)
IS
'Đánh dấu compensation lỗi, lập lịch retry hoặc TIMEOUT khi vượt quá số lần retry.';


-- ============================================================
-- 13. KẾT THÚC
-- ============================================================

COMMIT;