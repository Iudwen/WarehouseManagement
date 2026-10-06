-- Migration 11: Add discrepancy support for Node HCM
-- File path: nodes/node_hcm/11_add_discrepancy_support.sql

-- 1. Bổ sung các cột chênh lệch vào bảng phieu_dieu_chuyen
ALTER TABLE phieu_dieu_chuyen
  ADD COLUMN IF NOT EXISTS so_luong_thuc_nhan INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ly_do_thieu TEXT DEFAULT NULL;

-- 2. Xóa chữ ký 6 tham số cũ
DROP FUNCTION IF EXISTS sp_receive_transfer(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, INT);

-- 3. Tạo Stored Function sp_receive_transfer chuẩn 8 tham số
CREATE OR REPLACE FUNCTION sp_receive_transfer(
    p_saga_id UUID,
    p_global_id UUID,
    p_ma_phieu_dc VARCHAR,
    p_ma_kho VARCHAR,
    p_ma_sp VARCHAR,
    p_so_luong INT,                       -- Số lượng yêu cầu (20)
    p_so_luong_thuc_nhan INT DEFAULT NULL, -- Số lượng thực nhận (18)
    p_ly_do_thieu TEXT DEFAULT NULL        -- Lý do thiếu nếu có
) RETURNS VOID AS $$
DECLARE
    v_so_luong_nhan INT;
    v_so_luong_thieu INT;
    v_trang_thai_phieu VARCHAR;
    v_kho_xuat VARCHAR;
BEGIN
    -- Lock dòng phiếu điều chuyển
    SELECT trang_thai, kho_xuat 
    INTO v_trang_thai_phieu, v_kho_xuat
    FROM phieu_dieu_chuyen
    WHERE ma_phieu_dc = p_ma_phieu_dc
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy phiếu điều chuyển %', p_ma_phieu_dc;
    END IF;

    IF v_trang_thai_phieu = 'DA_NHAN' THEN
        RAISE EXCEPTION 'Phiếu điều chuyển % đã được nhận kho trước đó', p_ma_phieu_dc;
    END IF;

    -- Tính toán số lượng thực nhận và số lượng thiếu
    v_so_luong_nhan := COALESCE(p_so_luong_thuc_nhan, p_so_luong);
    v_so_luong_thieu := p_so_luong - v_so_luong_nhan;

    IF v_so_luong_nhan <= 0 THEN
        RAISE EXCEPTION 'Số lượng thực nhận phải lớn hơn 0';
    END IF;

    IF v_so_luong_nhan > p_so_luong THEN
        RAISE EXCEPTION 'Số lượng thực nhận (%) không được lớn hơn số lượng yêu cầu (%)', v_so_luong_nhan, p_so_luong;
    END IF;

    IF v_so_luong_thieu > 0 AND (p_ly_do_thieu IS NULL OR trim(p_ly_do_thieu) = '') THEN
        RAISE EXCEPTION 'Bắt buộc phải nhập lý do thiếu khi số lượng thực nhận không đủ';
    END IF;

    -- 1. Cập nhật bảng phieu_dieu_chuyen
    UPDATE phieu_dieu_chuyen
    SET trang_thai = 'DA_NHAN',
        so_luong_thuc_nhan = v_so_luong_nhan,
        ly_do_thieu = p_ly_do_thieu,
        ngay_nhan = CURRENT_TIMESTAMP
    WHERE ma_phieu_dc = p_ma_phieu_dc;

    -- 2. Cộng số lượng thực nhận vào tồn kho (ton_kho)
    UPDATE ton_kho
    SET so_luong = so_luong + v_so_luong_nhan
    WHERE ma_kho = p_ma_kho AND ma_sp = p_ma_sp;

    -- 3. Phân nhánh phát sinh Outbox Event
    IF v_so_luong_thieu = 0 THEN
        -- HAPPY PATH: Nhận đủ (20/20)
        INSERT INTO outbox_event (event_id, aggregate_type, aggregate_id, event_type, payload, status)
        VALUES (
            gen_random_uuid(),
            'TRANSFER',
            p_ma_phieu_dc,
            'TRANSFER_COMPLETED',
            json_build_object(
                'saga_id', p_saga_id,
                'global_id', p_global_id,
                'ma_phieu_dc', p_ma_phieu_dc,
                'kho_xuat', v_kho_xuat,
                'kho_nhap', p_ma_kho,
                'ma_sp', p_ma_sp,
                'so_luong', v_so_luong_nhan
            ),
            'PENDING'
        );
    ELSE
        -- DISCREPANCY PATH: Nhận thiếu (18/20)
        INSERT INTO outbox_event (event_id, aggregate_type, aggregate_id, event_type, payload, status)
        VALUES (
            gen_random_uuid(),
            'TRANSFER',
            p_ma_phieu_dc,
            'TRANSFER_COMPLETED_WITH_DISCREPANCY',
            json_build_object(
                'saga_id', p_saga_id,
                'global_id', p_global_id,
                'ma_phieu_dc', p_ma_phieu_dc,
                'kho_xuat', v_kho_xuat,
                'kho_nhap', p_ma_kho,
                'ma_sp', p_ma_sp,
                'so_luong_yeu_cau', p_so_luong,
                'so_luong_thuc_nhan', v_so_luong_nhan,
                'so_luong_thieu', v_so_luong_thieu,
                'ly_do_thieu', p_ly_do_thieu
            ),
            'PENDING'
        );
    END IF;
END;
$$ LANGUAGE plpgsql;