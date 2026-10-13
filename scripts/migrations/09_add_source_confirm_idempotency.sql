-- ============================================================
-- MIGRATION: 09_add_source_confirm_idempotency.sql
-- Mục đích: Đảm bảo Idempotency và Concurrency Safety cho bước Source Confirm
-- Áp dụng cho: Tất cả các Node chi nhánh (HN01, DN01, HCM01)
-- ============================================================

BEGIN;

-- 1. Chuẩn hóa dữ liệu cũ (nếu có bản ghi trùng lặp từ trước): chuyển các bản ghi dư thừa sang CANCELLED, bảo toàn dữ liệu lịch sử
UPDATE stock_reservation r
SET trang_thai = 'CANCELLED',
    released_at = CURRENT_TIMESTAMP,
    release_reason = 'Deduplicated during migration 09'
WHERE r.trang_thai = 'RESERVED'
  AND r.reservation_id NOT IN (
      SELECT MIN(reservation_id)
      FROM stock_reservation
      WHERE trang_thai = 'RESERVED'
      GROUP BY saga_id, ma_phieu_dc
  );

-- 2. Thêm Unique Partial Index chống tạo trùng reservation active
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_reservation_active
ON stock_reservation(saga_id, ma_phieu_dc)
WHERE trang_thai = 'RESERVED';

-- 2. Cập nhật Stored Procedure sp_accept_transfer với cơ chế Idempotency
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
    v_existing_reservation_id BIGINT;
BEGIN
    IF p_so_luong <= 0 THEN
        RAISE EXCEPTION 'Số lượng điều chuyển phải > 0';
    END IF;

    -- ========================================================
    -- 1. KIỂM TRA IDEMPOTENCY: NẾU ĐÃ CÓ RESERVATION ĐANG HOẠT ĐỘNG
    -- ========================================================
    SELECT reservation_id
    INTO v_existing_reservation_id
    FROM stock_reservation
    WHERE saga_id = p_saga_id
      AND ma_phieu_dc = p_ma_phieu_dc
      AND ma_kho = p_ma_kho
      AND ma_sp = p_ma_sp
      AND trang_thai = 'RESERVED'
    LIMIT 1;

    IF FOUND THEN
        -- Đã giữ hàng thành công trước đó -> Bỏ qua an toàn (Idempotent)
        RETURN;
    END IF;

    -- Nếu đã xuất hàng rồi (CONSUMED), không cho phép xác nhận giữ hàng lại
    IF EXISTS (
        SELECT 1 FROM stock_reservation
        WHERE saga_id = p_saga_id
          AND ma_phieu_dc = p_ma_phieu_dc
          AND trang_thai = 'CONSUMED'
    ) THEN
        RAISE EXCEPTION 'Phiếu điều chuyển % đã được xuất kho (CONSUMED), không thể xác nhận lại', p_ma_phieu_dc;
    END IF;

    -- ========================================================
    -- 2. KHÓA TỒN KHO VÀ KIỂM TRA KHẢ DỤNG
    -- ========================================================
    SELECT so_luong
    INTO v_ton_kho
    FROM ton_kho
    WHERE ma_kho = p_ma_kho
      AND ma_sp = p_ma_sp
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tồn tại tồn kho: kho=%, sản phẩm=%', p_ma_kho, p_ma_sp;
    END IF;

    -- Kiểm tra lại sau khi đã lấy khóa ton_kho để chống race condition giữa 2 transactions
    SELECT reservation_id
    INTO v_existing_reservation_id
    FROM stock_reservation
    WHERE saga_id = p_saga_id
      AND ma_phieu_dc = p_ma_phieu_dc
      AND ma_kho = p_ma_kho
      AND ma_sp = p_ma_sp
      AND trang_thai = 'RESERVED'
    LIMIT 1;

    IF FOUND THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(so_luong_reserve), 0)
    INTO v_reserved
    FROM stock_reservation
    WHERE ma_kho = p_ma_kho
      AND ma_sp = p_ma_sp
      AND trang_thai = 'RESERVED';

    IF (v_ton_kho - v_reserved) < p_so_luong THEN
        RAISE EXCEPTION 'Không đủ tồn kho khả dụng. Kho=%, SP=%, TON=%, RESERVED=%, REQUEST=%',
            p_ma_kho, p_ma_sp, v_ton_kho, v_reserved, p_so_luong;
    END IF;

    -- ========================================================
    -- 3. TẠO RESERVATION VÀ OUTBOX EVENT
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

    IF NOT EXISTS (
        SELECT 1 FROM outbox_event
        WHERE saga_id = p_saga_id
          AND event_type = 'TRANSFER_ACCEPTED'
    ) THEN
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
    END IF;

END;
$$;

COMMIT;
