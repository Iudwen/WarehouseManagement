-- ============================================================
-- 07_saga_procedures.sql
-- CENTRAL - SAGA PROCEDURES
--
-- BƯỚC 9.1
-- Tạo Saga từ phiếu điều chuyển đã được Admin xác nhận.
--
-- LUỒNG:
--
-- TRANSFER_RECOMMENDATION
--        ↓
-- Admin APPROVE
--        ↓
-- DIEU_CHUYEN_CENTRAL
--        ↓
-- sp_create_saga()
--        ↓
-- SAGA_TRANSACTION
--        ↓
-- SAGA_MONITORING
--
-- Procedure này CHỈ xử lý tại CENTRAL.
-- Không trực tiếp UPDATE TON_KHO tại NODE.
--
-- Nguyên tắc:
-- 1. Khóa phiếu điều chuyển bằng FOR UPDATE.
-- 2. Chỉ tạo Saga khi phiếu đang chờ xử lý.
-- 3. Không tạo Saga trùng cho cùng một phiếu.
-- 4. Xác định node nguồn và node đích từ CENTRAL.
-- 5. Tạo Saga ở trạng thái WAITING_SOURCE_CONFIRMATION.
-- 6. Chưa reserve/trừ tồn kho tại bước này.
-- 7. Chưa xử lý hàng đang vận chuyển tại bước này.
-- ============================================================


BEGIN;


-- ============================================================
-- 0. ĐẢM BẢO EXTENSION UUID
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- 1. PROCEDURE: sp_create_saga
--
-- Input:
--     p_ma_phieu_dc
--
-- Output:
--     UUID - saga_id
--
-- Chức năng:
--     Tạo một Saga cho phiếu điều chuyển đã được Admin xác nhận.
--
-- Kết quả:
--     - Tạo record trong saga_transaction
--     - Tạo record trong saga_monitoring
--     - Cập nhật trạng thái phiếu điều chuyển
--
-- Saga bắt đầu tại:
--     WAITING_SOURCE_CONFIRMATION
-- ============================================================

CREATE OR REPLACE FUNCTION sp_create_saga(
    p_ma_phieu_dc VARCHAR(20)
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE

    -- ========================================================
    -- BIẾN SAGA
    -- ========================================================

    v_saga_id UUID;
    v_global_id UUID;


    -- ========================================================
    -- THÔNG TIN PHIẾU ĐIỀU CHUYỂN
    -- ========================================================

    v_ma_sp VARCHAR(20);

    v_kho_xuat VARCHAR(10);
    v_kho_nhap VARCHAR(10);

    v_so_luong INT;

    v_current_status VARCHAR(30);


    -- ========================================================
    -- THÔNG TIN NODE
    -- ========================================================

    v_source_node VARCHAR(50);
    v_destination_node VARCHAR(50);


BEGIN

    -- ========================================================
    -- 1. KIỂM TRA INPUT
    -- ========================================================

    IF p_ma_phieu_dc IS NULL
       OR TRIM(p_ma_phieu_dc) = '' THEN

        RAISE EXCEPTION
            'Mã phiếu điều chuyển không được để trống';

    END IF;


    -- ========================================================
    -- 2. KHÓA PHIẾU ĐIỀU CHUYỂN
    --
    -- FOR UPDATE:
    --     Ngăn hai request đồng thời cùng tạo Saga
    --     cho một phiếu.
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
    -- 3. KIỂM TRA PHIẾU CÓ TỒN TẠI KHÔNG
    -- ========================================================

    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Không tìm thấy phiếu điều chuyển: %',
            p_ma_phieu_dc;

    END IF;


    -- ========================================================
    -- 4. KIỂM TRA TRẠNG THÁI PHIẾU
    --
    -- Chỉ cho phép tạo Saga khi phiếu đang ở trạng thái
    -- chờ xử lý.
    --
    -- Các trạng thái được chấp nhận:
    --     CHO_XU_LY
    --     CREATED
    --     PENDING
    --
    -- Nếu phiếu đã được đưa vào Saga hoặc đã hoàn thành
    -- thì không cho tạo Saga mới.
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
    -- 5. KIỂM TRA MÃ SẢN PHẨM
    -- ========================================================

    IF v_ma_sp IS NULL
       OR TRIM(v_ma_sp) = '' THEN

        RAISE EXCEPTION
            'Sản phẩm của phiếu % không hợp lệ',
            p_ma_phieu_dc;

    END IF;


    -- ========================================================
    -- 6. KIỂM TRA SỐ LƯỢNG
    -- ========================================================

    IF v_so_luong IS NULL
       OR v_so_luong <= 0 THEN

        RAISE EXCEPTION
            'Số lượng điều chuyển không hợp lệ: %',
            v_so_luong;

    END IF;


    -- ========================================================
    -- 7. KIỂM TRA KHO XUẤT
    -- ========================================================

    IF v_kho_xuat IS NULL
       OR TRIM(v_kho_xuat) = '' THEN

        RAISE EXCEPTION
            'Kho xuất không hợp lệ cho phiếu: %',
            p_ma_phieu_dc;

    END IF;


    -- ========================================================
    -- 8. KIỂM TRA KHO NHẬP
    -- ========================================================

    IF v_kho_nhap IS NULL
       OR TRIM(v_kho_nhap) = '' THEN

        RAISE EXCEPTION
            'Kho nhập không hợp lệ cho phiếu: %',
            p_ma_phieu_dc;

    END IF;


    -- ========================================================
    -- 9. KHO XUẤT VÀ KHO NHẬP KHÔNG ĐƯỢC GIỐNG NHAU
    -- ========================================================

    IF v_kho_xuat = v_kho_nhap THEN

        RAISE EXCEPTION
            'Kho xuất và kho nhập không được giống nhau: %',
            v_kho_xuat;

    END IF;


    -- ========================================================
    -- 10. KIỂM TRA SAGA ĐÃ TỒN TẠI CHƯA
    --
    -- saga_transaction có UNIQUE(ma_phieu_dc), nhưng kiểm tra
    -- trước giúp trả về thông báo rõ ràng.
    -- ========================================================

    SELECT saga_id

    INTO v_saga_id

    FROM saga_transaction

    WHERE ma_phieu_dc = p_ma_phieu_dc;


    IF FOUND THEN

        RAISE EXCEPTION
            'Phiếu % đã có Saga: %',
            p_ma_phieu_dc,
            v_saga_id;

    END IF;


    -- ========================================================
    -- 11. LẤY NODE CỦA KHO XUẤT
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
    -- 12. LẤY NODE CỦA KHO NHẬP
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
    -- 13. TẠO GLOBAL TRANSACTION ID
    --
    -- ma_giao_dich_global dùng để theo dõi giao dịch
    -- xuyên suốt các node.
    -- ========================================================

    v_global_id := gen_random_uuid();


    -- ========================================================
    -- 14. TẠO SAGA TRANSACTION
    --
    -- Saga bắt đầu:
    --
    --     WAITING_SOURCE_CONFIRMATION
    --
    -- Tại thời điểm này:
    --
    --     Central:
    --         Đã tạo Saga
    --
    --     Node nguồn:
    --         Chưa reserve
    --         Chưa trừ TON_KHO
    --
    --     VWH:
    --         Chưa ghi nhận
    --
    --     Node đích:
    --         Chưa cộng TON_KHO
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
    -- 15. TẠO SAGA MONITORING
    --
    -- Monitoring dùng để theo dõi trạng thái Saga
    -- mà không cần truy vấn trực tiếp logic xử lý tại Node.
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
    -- 16. CẬP NHẬT PHIẾU ĐIỀU CHUYỂN
    --
    -- Saga đã được tạo.
    --
    -- Không dùng:
    --     COMPLETED
    --
    -- vì hàng vẫn chưa được xuất.
    -- ========================================================

    UPDATE dieu_chuyen_central

    SET
        trang_thai = 'DANG_XU_LY'

    WHERE ma_phieu_dc = p_ma_phieu_dc;


    -- ========================================================
    -- 17. TRẢ VỀ SAGA ID
    -- ========================================================

    RETURN v_saga_id;


END;
$$;

-- ============================================================
-- 2. PROCEDURE: sp_create_vwh_transfer
--
-- Chức năng:
--     Tạo bản ghi VWH sau khi NODE nguồn đã SHIP hàng thành công.
--
-- LUỒNG:
--
--     NODE HN
--        ↓
--     sp_ship_transfer()
--        ↓
--     CENTRAL
--        ↓
--     sp_create_vwh_transfer()
--        ↓
--     VWH_TRANSFER
--        ↓
--     SAGA = IN_TRANSIT
--
-- Nguyên tắc:
--     1. Chỉ xử lý Saga đang RUNNING.
--     2. Kiểm tra Saga tồn tại.
--     3. Kiểm tra global transaction ID.
--     4. Không tạo VWH trùng.
--     5. Số lượng vận chuyển không vượt số lượng yêu cầu.
--     6. Chưa cộng TON_KHO tại kho nhận.
--     7. Kho nhận chỉ tăng tồn khi RECEIVE.
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

    v_current_state VARCHAR(40);

    v_vwh_exists BIGINT;

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
    --
    -- FOR UPDATE:
    --     Ngăn hai request đồng thời cùng tạo VWH.
    -- ========================================================

    SELECT
        ma_giao_dich_global,
        ma_phieu_dc,
        ma_sp,
        kho_xuat,
        kho_nhap,
        so_luong_yeu_cau,
        so_luong_da_xuat,
        current_state,
        status

    INTO
        v_ma_giao_dich_global,
        v_ma_phieu_dc,
        v_ma_sp,
        v_kho_xuat,
        v_kho_nhap,
        v_so_luong_yeu_cau,
        v_so_luong_da_xuat,
        v_current_state,
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
    -- 4. KIỂM TRA GLOBAL TRANSACTION ID
    -- ========================================================

    IF v_ma_giao_dich_global <> p_global_id THEN

        RAISE EXCEPTION
            'global_id không khớp với Saga %',
            p_saga_id;

    END IF;


    -- ========================================================
    -- 5. KIỂM TRA PHIẾU ĐIỀU CHUYỂN
    -- ========================================================

    IF v_ma_phieu_dc <> p_ma_phieu_dc THEN

        RAISE EXCEPTION
            'Phiếu % không khớp với Saga %',
            p_ma_phieu_dc,
            p_saga_id;

    END IF;


    -- ========================================================
    -- 6. KIỂM TRA STATUS
    -- ========================================================

    IF v_status <> 'RUNNING' THEN

        RAISE EXCEPTION
            'Saga % không ở trạng thái RUNNING. Status hiện tại: %',
            p_saga_id,
            v_status;

    END IF;


    -- ========================================================
    -- 7. KIỂM TRA SỐ LƯỢNG
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
            'Tổng số lượng đã xuất (%) vượt số lượng yêu cầu (%)',
            v_so_luong_da_xuat + p_so_luong_xuat,
            v_so_luong_yeu_cau;

    END IF;


    -- ========================================================
    -- 8. KIỂM TRA VWH ĐÃ TỒN TẠI CHƯA
    --
    -- Cho phép gọi lại procedure mà không tạo VWH trùng.
    -- ========================================================

    SELECT vwh_id

    INTO v_vwh_exists

    FROM vwh_transfer

    WHERE saga_id = p_saga_id

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
    --
    -- Hàng hiện đang:
    --
    --     NODE HN: đã trừ tồn
    --     VWH:     đang vận chuyển
    --     NODE DN: chưa cộng tồn
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
    -- 10. CẬP NHẬT SAGA_TRANSACTION
    -- ========================================================

    UPDATE saga_transaction

    SET

        so_luong_da_xuat =
            so_luong_da_xuat + p_so_luong_xuat,

        current_state = 'IN_TRANSIT',

        updated_at = CURRENT_TIMESTAMP

    WHERE saga_id = p_saga_id;


    -- ========================================================
    -- 11. CẬP NHẬT SAGA_MONITORING
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


    -- ========================================================
    -- 12. THÔNG BÁO
    -- ========================================================

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
-- 3. COMMENT
-- ============================================================

COMMENT ON FUNCTION sp_create_saga(VARCHAR)
IS
'Tạo Saga tại Central từ phiếu điều chuyển đã được Admin xác nhận. Khóa phiếu, kiểm tra trạng thái, tạo saga_transaction và saga_monitoring. Không trực tiếp thay đổi TON_KHO tại các node.';


-- ============================================================
-- 4. KẾT THÚC TRANSACTION
-- ============================================================
-- ============================================================
-- CENTRAL - RESOLVE TRANSFER DISCREPANCY
-- ============================================================
--
-- Mục đích:
--   Xử lý chênh lệch giữa số lượng xuất và thực nhận.
--
-- Hướng xử lý:
--   RETURN_TO_SOURCE
--   LOSS
--   ADJUSTMENT
--
-- Lưu ý:
--   CENTRAL chỉ cập nhật metadata/Saga/VWH.
--   Không cập nhật TON_KHO của NODE.
--   Việc cập nhật TON_KHO sẽ do NODE thực hiện
--   thông qua event/procedure tương ứng.
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
       )
    THEN
        RAISE EXCEPTION
            'Hướng xử lý không hợp lệ';
    END IF;

    IF p_resolved_by IS NULL
       OR TRIM(p_resolved_by) = ''
    THEN
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
    -- 3. KHÔNG CHO RESOLVE LẠI
    -- ========================================================

    IF v_trang_thai <> 'PENDING' THEN
        RAISE EXCEPTION
            'Discrepancy ID=% đã được xử lý, trạng thái=%',
            p_discrepancy_id,
            v_trang_thai;
    END IF;


    -- ========================================================
    -- 4. KIỂM TRA SỐ LƯỢNG
    -- ========================================================

    IF v_so_luong_chenh_lech <= 0 THEN
        RAISE EXCEPTION
            'Discrepancy ID=% không có số lượng chênh lệch',
            p_discrepancy_id;
    END IF;


    -- ========================================================
    -- 5. CẬP NHẬT DISCREPANCY
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
    -- 6. XỬ LÝ THEO HƯỚNG
    -- ========================================================

    IF p_huong_xu_ly = 'RETURN_TO_SOURCE' THEN

        -- Hàng thiếu được xác định là trả về kho xuất.
        --
        -- CENTRAL chưa cộng TON_KHO tại NODE.
        -- NODE nguồn sẽ xử lý event RETURN_TO_SOURCE.

        UPDATE vwh_transfer
        SET
            trang_thai = 'COMPENSATING',
            updated_at = CURRENT_TIMESTAMP
        WHERE vwh_id = v_vwh_id;


        UPDATE saga_transaction
        SET
            current_state = 'COMPENSATION_REQUIRED',
            status = 'RUNNING',
            updated_at = CURRENT_TIMESTAMP
        WHERE saga_id = v_saga_id;


    ELSIF p_huong_xu_ly = 'LOSS' THEN

        -- Hàng được xác nhận mất.
        --
        -- CENTRAL loại phần hàng mất khỏi VWH.
        -- TON_KHO tại NODE không được CENTRAL cập nhật trực tiếp.

        UPDATE vwh_transfer
        SET
            so_luong_dang_van_chuyen =
                so_luong_dang_van_chuyen
                - v_so_luong_chenh_lech,

            trang_thai =
                CASE
                    WHEN
                        so_luong_dang_van_chuyen
                        - v_so_luong_chenh_lech = 0
                    THEN 'CLOSED'
                    ELSE 'DISCREPANCY'
                END,

            updated_at = CURRENT_TIMESTAMP

        WHERE vwh_id = v_vwh_id;


        UPDATE saga_transaction
        SET
            so_luong_chenh_lech = 0,

            current_state = 'COMPLETED',

            status = 'SUCCESS',

            completed_at = CURRENT_TIMESTAMP,

            updated_at = CURRENT_TIMESTAMP

        WHERE saga_id = v_saga_id;


    ELSIF p_huong_xu_ly = 'ADJUSTMENT' THEN

        -- Adjustment cần được xử lý theo nghiệp vụ
        -- tại Node tương ứng.
        --
        -- CENTRAL chỉ ghi nhận rằng discrepancy
        -- đã được Admin xác nhận điều chỉnh.

        UPDATE vwh_transfer
        SET
            trang_thai = 'COMPENSATING',
            updated_at = CURRENT_TIMESTAMP
        WHERE vwh_id = v_vwh_id;


        UPDATE saga_transaction
        SET
            current_state = 'COMPENSATION_REQUIRED',
            status = 'RUNNING',
            updated_at = CURRENT_TIMESTAMP
        WHERE saga_id = v_saga_id;

    END IF;


    -- ========================================================
    -- 7. SAGA MONITORING
    -- ========================================================

    UPDATE saga_monitoring
    SET
        current_state =
            CASE
                WHEN p_huong_xu_ly = 'LOSS'
                THEN 'COMPLETED'

                ELSE 'COMPENSATION_REQUIRED'
            END,

        status =
            CASE
                WHEN p_huong_xu_ly = 'LOSS'
                THEN 'SUCCESS'

                ELSE 'RUNNING'
            END,

        last_event_type = 'DISCREPANCY_RESOLVED',

        last_event_at = CURRENT_TIMESTAMP,

        updated_at = CURRENT_TIMESTAMP,

        error_message = NULL

    WHERE saga_id = v_saga_id;


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

COMMIT;