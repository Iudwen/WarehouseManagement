    -- ============================================================
    -- 06_create_saga_monitoring.sql
    -- CENTRAL - TRANSFER / SAGA
    --
    -- Chức năng:
    --   1. TRANSFER_RECOMMENDATION
    --   2. SAGA_TRANSACTION
    --   3. SAGA_MONITORING
    --   4. VWH_TRANSFER
    --   5. TRANSFER_DISCREPANCY
    --
    -- Tất cả các thành phần Saga được quản lý tại CENTRAL.
    --
    -- Data Mining
    --      ↓
    -- TRANSFER_RECOMMENDATION
    --      ↓ Admin APPROVED
    -- DIEU_CHUYEN_CENTRAL
    --      ↓
    -- SAGA_TRANSACTION
    --      ↓
    -- NODE KHO XUẤT → VWH → NODE KHO NHẬN
    --
    -- Lưu ý:
    --   - CENTRAL quản lý metadata và trạng thái Saga.
    --   - NODE quản lý TON_KHO và các giao dịch tồn kho.
    --   - Không tạo FK xuyên database.
    -- ============================================================


    BEGIN;


    -- ============================================================
    -- 1. EXTENSION
    -- ============================================================

    CREATE EXTENSION IF NOT EXISTS pgcrypto;


    -- ============================================================
    -- BƯỚC 1
    -- TRANSFER_RECOMMENDATION
    --
    -- Data Mining tạo đề xuất điều chuyển.
    -- Admin Central xem và phê duyệt.
    --
    -- Chỉ khi APPROVED mới tạo phiếu điều chuyển chính thức.
    -- ============================================================

    CREATE TABLE IF NOT EXISTS transfer_recommendation (

        recommendation_id BIGSERIAL PRIMARY KEY,

        ma_sp VARCHAR(20) NOT NULL,

        kho_xuat VARCHAR(10) NOT NULL,

        kho_nhap VARCHAR(10) NOT NULL,

        so_luong_de_xuat INT NOT NULL,

        ly_do TEXT,

        forecast_source VARCHAR(100),

        status VARCHAR(20) NOT NULL
            DEFAULT 'PENDING',

        created_at TIMESTAMP NOT NULL
            DEFAULT CURRENT_TIMESTAMP,

        approved_at TIMESTAMP,

        approved_by VARCHAR(50),


        -- ========================================================
        -- CONSTRAINT - SỐ LƯỢNG
        -- ========================================================

        CONSTRAINT chk_transfer_recommendation_quantity
            CHECK (
                so_luong_de_xuat > 0
            ),


        -- ========================================================
        -- CONSTRAINT - KHO
        -- ========================================================

        CONSTRAINT chk_transfer_recommendation_warehouse
            CHECK (
                kho_xuat <> kho_nhap
            ),


        -- ========================================================
        -- CONSTRAINT - TRẠNG THÁI
        -- ========================================================

        CONSTRAINT chk_transfer_recommendation_status
            CHECK (
                status IN (
                    'PENDING',
                    'APPROVED',
                    'REJECTED'
                )
            ),


        -- ========================================================
        -- FOREIGN KEY
        -- ========================================================

        CONSTRAINT fk_transfer_recommendation_product
            FOREIGN KEY (ma_sp)
            REFERENCES san_pham(ma_sp),

        CONSTRAINT fk_transfer_recommendation_source
            FOREIGN KEY (kho_xuat)
            REFERENCES kho(ma_kho),

        CONSTRAINT fk_transfer_recommendation_destination
            FOREIGN KEY (kho_nhap)
            REFERENCES kho(ma_kho)
    );


    -- ============================================================
    -- INDEX - TRANSFER_RECOMMENDATION
    -- ============================================================

    CREATE INDEX IF NOT EXISTS idx_transfer_recommendation_product
    ON transfer_recommendation(ma_sp);

    CREATE INDEX IF NOT EXISTS idx_transfer_recommendation_source
    ON transfer_recommendation(kho_xuat);

    CREATE INDEX IF NOT EXISTS idx_transfer_recommendation_destination
    ON transfer_recommendation(kho_nhap);

    CREATE INDEX IF NOT EXISTS idx_transfer_recommendation_status
    ON transfer_recommendation(status);

    CREATE INDEX IF NOT EXISTS idx_transfer_recommendation_created
    ON transfer_recommendation(created_at);


    -- ============================================================
    -- BƯỚC 2
    -- SAGA_TRANSACTION
    --
    -- CENTRAL quản lý vòng đời của giao dịch điều chuyển.
    --
    -- Saga KHÔNG trực tiếp cập nhật TON_KHO.
    -- Việc thay đổi tồn kho được thực hiện tại các NODE.
    --
    -- saga_id và ma_giao_dich_global được dùng làm logical ID
    -- khi trao đổi giữa CENTRAL và các NODE.
    -- ============================================================

    CREATE TABLE IF NOT EXISTS saga_transaction (

        saga_id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),


        -- ========================================================
        -- ID GIAO DỊCH TOÀN CỤC
        -- ========================================================

        ma_giao_dich_global UUID NOT NULL UNIQUE,


        -- ========================================================
        -- PHIẾU ĐIỀU CHUYỂN CENTRAL
        -- ========================================================

        ma_phieu_dc VARCHAR(20) NOT NULL UNIQUE,


        -- ========================================================
        -- KHO XUẤT
        -- ========================================================

        kho_xuat VARCHAR(10) NOT NULL,


        -- ========================================================
        -- KHO NHẬP
        -- ========================================================

        kho_nhap VARCHAR(10) NOT NULL,


        -- ========================================================
        -- SẢN PHẨM
        -- ========================================================

        ma_sp VARCHAR(20) NOT NULL,


        -- ========================================================
        -- SỐ LƯỢNG YÊU CẦU
        -- ========================================================

        so_luong_yeu_cau INT NOT NULL,


        -- ========================================================
        -- SỐ LƯỢNG ĐÃ XUẤT
        -- ========================================================

        so_luong_da_xuat INT NOT NULL
            DEFAULT 0,


        -- ========================================================
        -- SỐ LƯỢNG THỰC NHẬN
        -- ========================================================

        so_luong_thuc_nhan INT NOT NULL
            DEFAULT 0,


        -- ========================================================
        -- SỐ LƯỢNG CHÊNH LỆCH
        -- ========================================================

        so_luong_chenh_lech INT NOT NULL
            DEFAULT 0,


        -- ========================================================
        -- TRẠNG THÁI CHI TIẾT CỦA SAGA
        -- ========================================================

        current_state VARCHAR(40) NOT NULL
            DEFAULT 'CREATED',


        -- ========================================================
        -- TRẠNG THÁI TỔNG QUÁT
        -- ========================================================

        status VARCHAR(20) NOT NULL
            DEFAULT 'RUNNING',


        -- ========================================================
        -- NODE KHO XUẤT
        -- ========================================================

        source_node VARCHAR(50),


        -- ========================================================
        -- NODE KHO NHẬP
        -- ========================================================

        destination_node VARCHAR(50),


        -- ========================================================
        -- DEADLINE XÁC NHẬN KHO NGUỒN
        -- ========================================================

        source_confirm_deadline TIMESTAMP,


        -- ========================================================
        -- DEADLINE XUẤT HÀNG
        -- ========================================================

        ship_deadline TIMESTAMP,


        -- ========================================================
        -- DEADLINE NHẬN HÀNG
        -- ========================================================

        receive_deadline TIMESTAMP,


        -- ========================================================
        -- THỜI GIAN
        -- ========================================================

        created_at TIMESTAMP NOT NULL
            DEFAULT CURRENT_TIMESTAMP,

        updated_at TIMESTAMP NOT NULL
            DEFAULT CURRENT_TIMESTAMP,

        completed_at TIMESTAMP,


        -- ========================================================
        -- LỖI
        -- ========================================================

        error_message TEXT,


        -- ========================================================
        -- CONSTRAINT - SỐ LƯỢNG
        -- ========================================================

        CONSTRAINT chk_saga_quantity
            CHECK (
                so_luong_yeu_cau > 0
            ),

        CONSTRAINT chk_saga_quantity_exported
            CHECK (
                so_luong_da_xuat >= 0
                AND so_luong_da_xuat <= so_luong_yeu_cau
            ),

        CONSTRAINT chk_saga_quantity_received
            CHECK (
                so_luong_thuc_nhan >= 0
                AND so_luong_thuc_nhan <= so_luong_da_xuat
            ),

        CONSTRAINT chk_saga_quantity_difference
            CHECK (
                so_luong_chenh_lech >= 0
            ),


        -- ========================================================
        -- CONSTRAINT - KHO
        -- ========================================================

        CONSTRAINT chk_saga_warehouse
            CHECK (
                kho_xuat <> kho_nhap
            ),


        -- ========================================================
        -- CONSTRAINT - STATE
        -- ========================================================

        CONSTRAINT chk_saga_state
            CHECK (
                current_state IN (
                    'CREATED',
                    'WAITING_SOURCE_CONFIRMATION',
                    'SOURCE_ACCEPTED',
                    'SOURCE_REJECTED',
                    'RESERVED',
                    'TRANSFER_OUT',
                    'IN_TRANSIT',
                    'WAITING_DESTINATION_CONFIRMATION',
                    'TRANSFER_IN',
                    'RECEIVED',
                    'RECEIVED_WITH_DISCREPANCY',
                    'COMPENSATION_REQUIRED',
                    'COMPENSATION_COMPLETED',
                    'TIMEOUT',
                    'COMPLETED',
                    'FAILED',
                    'CANCELLED'
                )
            ),


        -- ========================================================
        -- CONSTRAINT - STATUS
        -- ========================================================

        CONSTRAINT chk_saga_status
            CHECK (
                status IN (
                    'RUNNING',
                    'SUCCESS',
                    'FAILED',
                    'CANCELLED'
                )
            ),


        -- ========================================================
        -- FOREIGN KEY
        -- ========================================================

        CONSTRAINT fk_saga_transfer
            FOREIGN KEY (ma_phieu_dc)
            REFERENCES dieu_chuyen_central(ma_phieu_dc),

        CONSTRAINT fk_saga_product
            FOREIGN KEY (ma_sp)
            REFERENCES san_pham(ma_sp)
    );


    -- ============================================================
    -- INDEX - SAGA_TRANSACTION
    -- ============================================================

    CREATE INDEX IF NOT EXISTS idx_saga_transaction_global
    ON saga_transaction(ma_giao_dich_global);

    CREATE INDEX IF NOT EXISTS idx_saga_transaction_transfer
    ON saga_transaction(ma_phieu_dc);

    CREATE INDEX IF NOT EXISTS idx_saga_transaction_product
    ON saga_transaction(ma_sp);

    CREATE INDEX IF NOT EXISTS idx_saga_transaction_source
    ON saga_transaction(kho_xuat);

    CREATE INDEX IF NOT EXISTS idx_saga_transaction_destination
    ON saga_transaction(kho_nhap);

    CREATE INDEX IF NOT EXISTS idx_saga_transaction_state
    ON saga_transaction(current_state);

    CREATE INDEX IF NOT EXISTS idx_saga_transaction_status
    ON saga_transaction(status);

    CREATE INDEX IF NOT EXISTS idx_saga_transaction_created
    ON saga_transaction(created_at);


    -- ============================================================
    -- BƯỚC 3
    -- SAGA_MONITORING
    --
    -- Theo dõi trạng thái và tiến trình của Saga.
    --
    -- SAGA_TRANSACTION:
    --   Lưu trạng thái nghiệp vụ chính.
    --
    -- SAGA_MONITORING:
    --   Phục vụ giám sát, timeout, event tracking và dashboard.
    -- ============================================================

    CREATE TABLE IF NOT EXISTS saga_monitoring (

        id BIGSERIAL PRIMARY KEY,

        saga_id UUID NOT NULL,

        ma_giao_dich_global UUID NOT NULL,

        ma_phieu_dc VARCHAR(20) NOT NULL,

        kho_xuat VARCHAR(10) NOT NULL,

        kho_nhap VARCHAR(10) NOT NULL,

        ma_sp VARCHAR(20),

        so_luong_yeu_cau INT NOT NULL DEFAULT 0,

        so_luong_da_xuat INT NOT NULL DEFAULT 0,

        so_luong_thuc_nhan INT NOT NULL DEFAULT 0,

        so_luong_chenh_lech INT NOT NULL DEFAULT 0,

        current_state VARCHAR(40) NOT NULL,

        status VARCHAR(20) NOT NULL,

        source_node VARCHAR(50),

        destination_node VARCHAR(50),

        last_event_type VARCHAR(50),

        last_event_at TIMESTAMP,

        source_confirm_deadline TIMESTAMP,

        ship_deadline TIMESTAMP,

        receive_deadline TIMESTAMP,

        created_at TIMESTAMP NOT NULL
            DEFAULT CURRENT_TIMESTAMP,

        updated_at TIMESTAMP NOT NULL
            DEFAULT CURRENT_TIMESTAMP,

        error_message TEXT,


        -- ========================================================
        -- CONSTRAINT - SỐ LƯỢNG
        -- ========================================================

        CONSTRAINT chk_saga_monitoring_quantity
            CHECK (
                so_luong_yeu_cau >= 0
                AND so_luong_da_xuat >= 0
                AND so_luong_thuc_nhan >= 0
                AND so_luong_chenh_lech >= 0
            ),


        -- ========================================================
        -- CONSTRAINT - STATE
        -- ========================================================

        CONSTRAINT chk_saga_monitoring_state
            CHECK (
                current_state IN (
                    'CREATED',
                    'WAITING_SOURCE_CONFIRMATION',
                    'SOURCE_ACCEPTED',
                    'SOURCE_REJECTED',
                    'RESERVED',
                    'TRANSFER_OUT',
                    'IN_TRANSIT',
                    'WAITING_DESTINATION_CONFIRMATION',
                    'TRANSFER_IN',
                    'RECEIVED',
                    'RECEIVED_WITH_DISCREPANCY',
                    'COMPENSATION_REQUIRED',
                    'COMPENSATION_COMPLETED',
                    'TIMEOUT',
                    'COMPLETED',
                    'FAILED',
                    'CANCELLED'
                )
            ),


        -- ========================================================
        -- CONSTRAINT - STATUS
        -- ========================================================

        CONSTRAINT chk_saga_monitoring_status
            CHECK (
                status IN (
                    'RUNNING',
                    'SUCCESS',
                    'FAILED',
                    'CANCELLED'
                )
            )
    );


    -- ============================================================
    -- INDEX - SAGA_MONITORING
    -- ============================================================

    CREATE INDEX IF NOT EXISTS idx_saga_monitoring_saga
    ON saga_monitoring(saga_id);

    CREATE INDEX IF NOT EXISTS idx_saga_monitoring_global
    ON saga_monitoring(ma_giao_dich_global);

    CREATE INDEX IF NOT EXISTS idx_saga_monitoring_status
    ON saga_monitoring(status);

    CREATE INDEX IF NOT EXISTS idx_saga_monitoring_state
    ON saga_monitoring(current_state);

    CREATE INDEX IF NOT EXISTS idx_saga_monitoring_transfer
    ON saga_monitoring(ma_phieu_dc);

    CREATE INDEX IF NOT EXISTS idx_saga_monitoring_product
    ON saga_monitoring(ma_sp);

    CREATE INDEX IF NOT EXISTS idx_saga_monitoring_source
    ON saga_monitoring(kho_xuat);

    CREATE INDEX IF NOT EXISTS idx_saga_monitoring_destination
    ON saga_monitoring(kho_nhap);

    CREATE INDEX IF NOT EXISTS idx_saga_monitoring_created
    ON saga_monitoring(created_at);

    CREATE INDEX IF NOT EXISTS idx_saga_monitoring_deadline
    ON saga_monitoring(receive_deadline);


    -- ============================================================
    -- BƯỚC 4
    -- VWH_TRANSFER
    --
    -- VWH = Virtual Warehouse
    --
    -- VWH đại diện cho hàng hóa đang vận chuyển giữa các NODE.
    --
    -- Ví dụ:
    --
    -- HN01 -> DN01
    -- SP001
    -- Gửi: 20
    -- Đã nhận: 18
    -- Còn đang vận chuyển: 2
    --
    -- VWH chỉ thuộc CENTRAL.
    -- Không lưu trực tiếp vào TON_KHO của các NODE.
    -- ============================================================

    CREATE TABLE IF NOT EXISTS vwh_transfer (

        vwh_id BIGSERIAL PRIMARY KEY,

        saga_id UUID NOT NULL,

        ma_phieu_dc VARCHAR(20) NOT NULL,

        ma_sp VARCHAR(20) NOT NULL,

        kho_xuat VARCHAR(10) NOT NULL,

        kho_nhap VARCHAR(10) NOT NULL,

        so_luong_xuat INT NOT NULL,

        so_luong_da_nhan INT NOT NULL
            DEFAULT 0,

        so_luong_dang_van_chuyen INT NOT NULL
            DEFAULT 0,

        trang_thai VARCHAR(30) NOT NULL
            DEFAULT 'IN_TRANSIT',

        created_at TIMESTAMP NOT NULL
            DEFAULT CURRENT_TIMESTAMP,

        updated_at TIMESTAMP NOT NULL
            DEFAULT CURRENT_TIMESTAMP,

        received_at TIMESTAMP,


        -- ========================================================
        -- CONSTRAINT - SỐ LƯỢNG
        -- ========================================================

        CONSTRAINT chk_vwh_quantity_export
            CHECK (
                so_luong_xuat > 0
            ),

        CONSTRAINT chk_vwh_quantity_received
            CHECK (
                so_luong_da_nhan >= 0
                AND so_luong_da_nhan <= so_luong_xuat
            ),

        CONSTRAINT chk_vwh_quantity_transit
            CHECK (
                so_luong_dang_van_chuyen >= 0
                AND so_luong_dang_van_chuyen
                    = so_luong_xuat - so_luong_da_nhan
            ),


        -- ========================================================
        -- CONSTRAINT - KHO
        -- ========================================================

        CONSTRAINT chk_vwh_warehouse
            CHECK (
                kho_xuat <> kho_nhap
            ),


        -- ========================================================
        -- CONSTRAINT - STATUS
        -- ========================================================

        CONSTRAINT chk_vwh_status
            CHECK (
                trang_thai IN (
                    'IN_TRANSIT',
                    'PARTIALLY_RECEIVED',
                    'RECEIVED',
                    'DISCREPANCY',
                    'COMPENSATING',
                    'CLOSED'
                )
            ),


        -- ========================================================
        -- FOREIGN KEY
        -- ========================================================

        CONSTRAINT fk_vwh_saga
            FOREIGN KEY (saga_id)
            REFERENCES saga_transaction(saga_id),

        CONSTRAINT fk_vwh_transfer
            FOREIGN KEY (ma_phieu_dc)
            REFERENCES dieu_chuyen_central(ma_phieu_dc),

        CONSTRAINT fk_vwh_product
            FOREIGN KEY (ma_sp)
            REFERENCES san_pham(ma_sp),

        CONSTRAINT fk_vwh_source
            FOREIGN KEY (kho_xuat)
            REFERENCES kho(ma_kho),

        CONSTRAINT fk_vwh_destination
            FOREIGN KEY (kho_nhap)
            REFERENCES kho(ma_kho)
    );


    -- ============================================================
    -- INDEX - VWH_TRANSFER
    -- ============================================================

    CREATE INDEX IF NOT EXISTS idx_vwh_transfer_saga
    ON vwh_transfer(saga_id);

    CREATE INDEX IF NOT EXISTS idx_vwh_transfer_transfer
    ON vwh_transfer(ma_phieu_dc);

    CREATE INDEX IF NOT EXISTS idx_vwh_transfer_product
    ON vwh_transfer(ma_sp);

    CREATE INDEX IF NOT EXISTS idx_vwh_transfer_source
    ON vwh_transfer(kho_xuat);

    CREATE INDEX IF NOT EXISTS idx_vwh_transfer_destination
    ON vwh_transfer(kho_nhap);

    CREATE INDEX IF NOT EXISTS idx_vwh_transfer_status
    ON vwh_transfer(trang_thai);

    CREATE INDEX IF NOT EXISTS idx_vwh_transfer_created
    ON vwh_transfer(created_at);


    -- ============================================================
    -- BƯỚC 5
    -- TRANSFER_DISCREPANCY
    --
    -- Quản lý chênh lệch giữa số lượng xuất và số lượng thực nhận.
    --
    -- Ví dụ:
    --
    -- HN xuất 20
    -- DN nhận 18
    -- Chênh lệch = 2
    --
    -- 2 sản phẩm chưa tự động coi là mất.
    -- Admin xác định hướng xử lý:
    --
    --   RETURN_TO_SOURCE
    --   LOSS
    --   ADJUSTMENT
    -- ============================================================

    CREATE TABLE IF NOT EXISTS transfer_discrepancy (

        discrepancy_id BIGSERIAL PRIMARY KEY,

        saga_id UUID NOT NULL,

        vwh_id BIGINT NOT NULL,

        ma_phieu_dc VARCHAR(20) NOT NULL,

        ma_sp VARCHAR(20) NOT NULL,

        kho_xuat VARCHAR(10) NOT NULL,

        kho_nhap VARCHAR(10) NOT NULL,

        so_luong_xuat INT NOT NULL,

        so_luong_thuc_nhan INT NOT NULL,

        so_luong_chenh_lech INT NOT NULL,

        ly_do TEXT,

        huong_xu_ly VARCHAR(30),

        trang_thai VARCHAR(20) NOT NULL
            DEFAULT 'PENDING',

        created_at TIMESTAMP NOT NULL
            DEFAULT CURRENT_TIMESTAMP,

        resolved_at TIMESTAMP,

        resolved_by VARCHAR(50),

        resolution_note TEXT,


        -- ========================================================
        -- CONSTRAINT - SỐ LƯỢNG
        -- ========================================================

        CONSTRAINT chk_discrepancy_quantity_export
            CHECK (
                so_luong_xuat > 0
            ),

        CONSTRAINT chk_discrepancy_quantity_received
            CHECK (
                so_luong_thuc_nhan >= 0
                AND so_luong_thuc_nhan <= so_luong_xuat
            ),

        CONSTRAINT chk_discrepancy_quantity_difference
            CHECK (
                so_luong_chenh_lech =
                so_luong_xuat - so_luong_thuc_nhan
            ),


        -- ========================================================
        -- CONSTRAINT - KHO
        -- ========================================================

        CONSTRAINT chk_discrepancy_warehouse
            CHECK (
                kho_xuat <> kho_nhap
            ),


        -- ========================================================
        -- CONSTRAINT - STATUS
        -- ========================================================

        CONSTRAINT chk_discrepancy_status
            CHECK (
                trang_thai IN (
                    'PENDING',
                    'RESOLVED',
                    'CANCELLED'
                )
            ),


        -- ========================================================
        -- CONSTRAINT - HƯỚNG XỬ LÝ
        -- ========================================================

        CONSTRAINT chk_discrepancy_resolution
            CHECK (
                huong_xu_ly IS NULL
                OR huong_xu_ly IN (
                    'RETURN_TO_SOURCE',
                    'LOSS',
                    'ADJUSTMENT'
                )
            ),


        -- ========================================================
        -- FOREIGN KEY
        -- ========================================================

        CONSTRAINT fk_discrepancy_saga
            FOREIGN KEY (saga_id)
            REFERENCES saga_transaction(saga_id),

        CONSTRAINT fk_discrepancy_vwh
            FOREIGN KEY (vwh_id)
            REFERENCES vwh_transfer(vwh_id),

        CONSTRAINT fk_discrepancy_transfer
            FOREIGN KEY (ma_phieu_dc)
            REFERENCES dieu_chuyen_central(ma_phieu_dc),

        CONSTRAINT fk_discrepancy_product
            FOREIGN KEY (ma_sp)
            REFERENCES san_pham(ma_sp),

        CONSTRAINT fk_discrepancy_source
            FOREIGN KEY (kho_xuat)
            REFERENCES kho(ma_kho),

        CONSTRAINT fk_discrepancy_destination
            FOREIGN KEY (kho_nhap)
            REFERENCES kho(ma_kho)
    );


    -- ============================================================
    -- INDEX - TRANSFER_DISCREPANCY
    -- ============================================================

    CREATE INDEX IF NOT EXISTS idx_discrepancy_saga
    ON transfer_discrepancy(saga_id);

    CREATE INDEX IF NOT EXISTS idx_discrepancy_vwh
    ON transfer_discrepancy(vwh_id);

    CREATE INDEX IF NOT EXISTS idx_discrepancy_transfer
    ON transfer_discrepancy(ma_phieu_dc);

    CREATE INDEX IF NOT EXISTS idx_discrepancy_product
    ON transfer_discrepancy(ma_sp);

    CREATE INDEX IF NOT EXISTS idx_discrepancy_source
    ON transfer_discrepancy(kho_xuat);

    CREATE INDEX IF NOT EXISTS idx_discrepancy_destination
    ON transfer_discrepancy(kho_nhap);

    CREATE INDEX IF NOT EXISTS idx_discrepancy_status
    ON transfer_discrepancy(trang_thai);

    CREATE INDEX IF NOT EXISTS idx_discrepancy_created
    ON transfer_discrepancy(created_at);

    -- ============================================================
    --TRANSFER_RECEIVED
    -- ============================================================
   -- ============================================================
-- CENTRAL - PROCESS TRANSFER RECEIVED
-- ============================================================
--
-- Event:
--     TRANSFER_RECEIVED
--
-- Luồng:
--     NODE ĐÍCH nhận hàng
--          ↓
--     OUTBOX_EVENT
--          ↓
--     CENTRAL xử lý event
--          ↓
--     VWH cập nhật số lượng đã nhận
--          ↓
--     SAGA cập nhật trạng thái
--          ↓
--     DIEU_CHUYEN_CENTRAL cập nhật trạng thái
--          ↓
--     SAGA_MONITORING cập nhật trạng thái
--
-- Lưu ý:
-- - Function này chỉ chạy tại CENTRAL.
-- - NODE đích chịu trách nhiệm cập nhật TON_KHO.
-- - CENTRAL không cập nhật TON_KHO của NODE đích.
-- - VWH đại diện cho hàng đang vận chuyển giữa các node.
-- ============================================================

CREATE OR REPLACE FUNCTION sp_process_transfer_received(
    p_saga_id UUID,
    p_global_id UUID,
    p_ma_phieu_dc VARCHAR(20),
    p_so_luong_thuc_nhan INT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_global_id UUID;

    v_so_luong_da_xuat INT;

    v_vwh_id BIGINT;
    v_ma_sp VARCHAR(20);
    v_kho_xuat VARCHAR(10);
    v_kho_nhap VARCHAR(10);
    v_so_luong_xuat INT;
    v_da_nhan_hien_tai INT;
    v_dang_van_chuyen INT;

    v_chenh_lech INT;
BEGIN

    -- ========================================================
    -- 1. VALIDATE INPUT
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

    IF p_so_luong_thuc_nhan IS NULL
       OR p_so_luong_thuc_nhan <= 0 THEN

        RAISE EXCEPTION
            'Số lượng thực nhận phải lớn hơn 0';
    END IF;


    -- ========================================================
    -- 2. KHÓA SAGA
    -- ========================================================

    SELECT
        ma_giao_dich_global,
        so_luong_da_xuat
    INTO
        v_global_id,
        v_so_luong_da_xuat
    FROM saga_transaction
    WHERE saga_id = p_saga_id
      AND ma_phieu_dc = p_ma_phieu_dc
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Không tìm thấy Saga cho phiếu %',
            p_ma_phieu_dc;
    END IF;


    -- ========================================================
    -- 3. KIỂM TRA GLOBAL ID
    -- ========================================================

    IF v_global_id <> p_global_id THEN
        RAISE EXCEPTION
            'global_id không khớp với Saga %',
            p_saga_id;
    END IF;


    -- ========================================================
    -- 4. KIỂM TRA SỐ LƯỢNG
    -- ========================================================

    IF p_so_luong_thuc_nhan > v_so_luong_da_xuat THEN
        RAISE EXCEPTION
            'Số lượng thực nhận (%) lớn hơn số lượng đã xuất (%)',
            p_so_luong_thuc_nhan,
            v_so_luong_da_xuat;
    END IF;


    -- ========================================================
    -- 5. KHÓA VWH
    -- ========================================================

    SELECT
    vwh_id,
    ma_sp,
    kho_xuat,
    kho_nhap,
    so_luong_xuat,
    so_luong_da_nhan,
    so_luong_dang_van_chuyen
INTO
    v_vwh_id,
    v_ma_sp,
    v_kho_xuat,
    v_kho_nhap,
    v_so_luong_xuat,
    v_da_nhan_hien_tai,
    v_dang_van_chuyen
FROM vwh_transfer
WHERE saga_id = p_saga_id
  AND ma_phieu_dc = p_ma_phieu_dc
FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Không tìm thấy VWH cho phiếu %',
            p_ma_phieu_dc;
    END IF;


    -- ========================================================
    -- 6. KIỂM TRA KHÔNG NHẬN QUÁ SỐ ĐANG VẬN CHUYỂN
    -- ========================================================

    IF p_so_luong_thuc_nhan > v_dang_van_chuyen THEN
        RAISE EXCEPTION
            'Số lượng thực nhận (%) lớn hơn số lượng đang vận chuyển (%)',
            p_so_luong_thuc_nhan,
            v_dang_van_chuyen;
    END IF;


    -- ========================================================
    -- 7. TÍNH CHÊNH LỆCH
    -- ========================================================

    v_chenh_lech :=
        v_so_luong_xuat
        -
        (
            v_da_nhan_hien_tai
            + p_so_luong_thuc_nhan
        );


    -- ========================================================
    -- 8. CẬP NHẬT VWH
    -- ========================================================

    UPDATE vwh_transfer
    SET
        so_luong_da_nhan =
            so_luong_da_nhan
            + p_so_luong_thuc_nhan,

        so_luong_dang_van_chuyen =
            so_luong_dang_van_chuyen
            - p_so_luong_thuc_nhan,

        trang_thai =
            CASE
                WHEN
                    so_luong_dang_van_chuyen
                    - p_so_luong_thuc_nhan = 0
                THEN 'RECEIVED'

                ELSE 'DISCREPANCY'
            END,

        received_at =
            CASE
                WHEN
                    so_luong_dang_van_chuyen
                    - p_so_luong_thuc_nhan = 0
                THEN CURRENT_TIMESTAMP

                ELSE received_at
            END,

        updated_at = CURRENT_TIMESTAMP

    WHERE vwh_id = v_vwh_id;

-- ========================================================
-- TẠO TRANSFER DISCREPANCY
-- ========================================================

IF v_chenh_lech > 0 THEN

    INSERT INTO transfer_discrepancy (
        saga_id,
        vwh_id,
        ma_phieu_dc,
        ma_sp,
        kho_xuat,
        kho_nhap,
        so_luong_xuat,
        so_luong_thuc_nhan,
        so_luong_chenh_lech,
        ly_do,
        trang_thai
    )
    VALUES (
        p_saga_id,
        v_vwh_id,
        p_ma_phieu_dc,
        v_ma_sp,
        v_kho_xuat,
        v_kho_nhap,
        v_so_luong_xuat,
        v_da_nhan_hien_tai + p_so_luong_thuc_nhan,
        v_chenh_lech,
        'Chênh lệch giữa số lượng xuất và thực nhận',
        'PENDING'
    );

END IF;
    -- ========================================================
    -- 9. CẬP NHẬT SAGA TRANSACTION
    -- ========================================================

    UPDATE saga_transaction
    SET
        so_luong_thuc_nhan =
            so_luong_thuc_nhan
            + p_so_luong_thuc_nhan,

        so_luong_chenh_lech =
            GREATEST(
                0,
                so_luong_yeu_cau
                -
                (
                    so_luong_thuc_nhan
                    + p_so_luong_thuc_nhan
                )
            ),

        current_state =
            CASE
                WHEN
                    so_luong_thuc_nhan
                    + p_so_luong_thuc_nhan
                    = so_luong_yeu_cau
                THEN 'COMPLETED'

                ELSE 'RECEIVED_WITH_DISCREPANCY'
            END,

        -- SUCCESS mới là trạng thái hoàn thành hợp lệ
        -- của cột status.
        status =
            CASE
                WHEN
                    so_luong_thuc_nhan
                    + p_so_luong_thuc_nhan
                    = so_luong_yeu_cau
                THEN 'SUCCESS'

                ELSE 'RUNNING'
            END,

        completed_at =
            CASE
                WHEN
                    so_luong_thuc_nhan
                    + p_so_luong_thuc_nhan
                    = so_luong_yeu_cau
                THEN CURRENT_TIMESTAMP

                ELSE completed_at
            END,

        updated_at = CURRENT_TIMESTAMP

    WHERE saga_id = p_saga_id;


    -- ========================================================
    -- 10. CẬP NHẬT PHIẾU ĐIỀU CHUYỂN CENTRAL
    -- ========================================================

    UPDATE dieu_chuyen_central
    SET
        trang_thai =
            CASE
                WHEN v_chenh_lech = 0
                THEN 'HOAN_THANH'

                ELSE 'CHENH_LECH'
            END

    WHERE ma_phieu_dc = p_ma_phieu_dc;


    -- ========================================================
    -- 11. CẬP NHẬT SAGA MONITORING
    -- ========================================================

    UPDATE saga_monitoring
    SET
        current_state =
            CASE
                WHEN v_chenh_lech = 0
                THEN 'COMPLETED'

                ELSE 'RECEIVED_WITH_DISCREPANCY'
            END,

        -- SUCCESS mới là trạng thái hoàn thành hợp lệ.
        status =
            CASE
                WHEN v_chenh_lech = 0
                THEN 'SUCCESS'

                ELSE 'RUNNING'
            END,

        so_luong_thuc_nhan =
            so_luong_thuc_nhan
            + p_so_luong_thuc_nhan,

        so_luong_chenh_lech =
            GREATEST(
                0,
                so_luong_yeu_cau
                -
                (
                    so_luong_thuc_nhan
                    + p_so_luong_thuc_nhan
                )
            ),

        last_event_type = 'TRANSFER_RECEIVED',

        last_event_at = CURRENT_TIMESTAMP,

        updated_at = CURRENT_TIMESTAMP,

        error_message = NULL

    WHERE saga_id = p_saga_id;


    -- ========================================================
    -- 12. LOG
    -- ========================================================

    RAISE NOTICE
        'Xử lý RECEIVE thành công: phiếu=%, nhận=%, chênh lệch=%',
        p_ma_phieu_dc,
        p_so_luong_thuc_nhan,
        v_chenh_lech;

END;
$$;


    -- ============================================================
    -- KẾT THÚC FILE
    -- ============================================================

    COMMIT;