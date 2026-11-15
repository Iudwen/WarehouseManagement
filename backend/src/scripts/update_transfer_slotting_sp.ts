import { pools } from '../config/postgresql';

/**
 * Script cập nhật Stored Procedures: sp_ship_transfer & sp_receive_transfer
 * để đồng bộ tự động và bắt buộc với phan_bo_o_ke trong cùng Transaction tại từng Node.
 */
async function updateTransferSPs() {
  console.log('🔄 Đang cập nhật sp_ship_transfer và sp_receive_transfer trên 3 node...');

  const spShipTransferSQL = `
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
        RAISE EXCEPTION 'saga_id không được NULL';
    END IF;

    IF p_ma_phieu_dc IS NULL OR TRIM(p_ma_phieu_dc) = '' THEN
        RAISE EXCEPTION 'ma_phieu_dc không được NULL hoặc rỗng';
    END IF;

    IF p_ma_kho IS NULL OR TRIM(p_ma_kho) = '' THEN
        RAISE EXCEPTION 'ma_kho không được NULL hoặc rỗng';
    END IF;

    IF p_ma_sp IS NULL OR TRIM(p_ma_sp) = '' THEN
        RAISE EXCEPTION 'ma_sp không được NULL hoặc rỗng';
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
        RAISE EXCEPTION 'Không tìm thấy reservation cho Saga %, phiếu %, kho %, SP %',
            p_saga_id, p_ma_phieu_dc, p_ma_kho, p_ma_sp;
    END IF;

    IF v_trang_thai = 'CONSUMED' THEN
        RAISE EXCEPTION 'Điều chuyển % đã được ship trước đó', p_ma_phieu_dc;
    END IF;

    IF v_trang_thai <> 'RESERVED' THEN
        RAISE EXCEPTION 'Reservation % không ở trạng thái RESERVED. Trạng thái hiện tại: %',
            v_reservation_id, v_trang_thai;
    END IF;

    IF v_so_luong IS NULL OR v_so_luong <= 0 THEN
        RAISE EXCEPTION 'Số lượng reservation không hợp lệ: %', v_so_luong;
    END IF;

    SELECT so_luong
    INTO v_ton_hien_tai
    FROM ton_kho
    WHERE ma_kho = p_ma_kho
      AND ma_sp = p_ma_sp
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tồn tại tồn kho: kho=%, sản phẩm=%', p_ma_kho, p_ma_sp;
    END IF;

    IF v_ton_hien_tai < v_so_luong THEN
        RAISE EXCEPTION 'Không đủ tồn kho để ship. Kho=%, SP=%, TON=%, cần=%',
            p_ma_kho, p_ma_sp, v_ton_hien_tai, v_so_luong;
    END IF;

    v_ton_sau := v_ton_hien_tai - v_so_luong;

    -- 1. Cập nhật ton_kho
    UPDATE ton_kho
    SET
        so_luong = v_ton_sau,
        cap_nhat_luc = CURRENT_TIMESTAMP
    WHERE ma_kho = p_ma_kho
      AND ma_sp = p_ma_sp;

    -- 2. Đồng bộ phan_bo_o_ke cho Storage Bin
    IF v_ton_sau = 0 THEN
        DELETE FROM phan_bo_o_ke
        WHERE ma_kho = p_ma_kho AND ma_sp = p_ma_sp;
    ELSE
        UPDATE phan_bo_o_ke
        SET so_luong = v_ton_sau,
            cap_nhat_luc = CURRENT_TIMESTAMP
        WHERE ma_kho = p_ma_kho AND ma_sp = p_ma_sp;
    END IF;

    -- 3. Ghi sổ cái stock_ledger
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

    -- 4. Ghi lịch sử tồn kho
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
        dieu_chuyen_ra = lich_su_ton_kho.dieu_chuyen_ra + EXCLUDED.dieu_chuyen_ra,
        ton_cuoi = EXCLUDED.ton_cuoi;

    -- 5. Cập nhật reservation sang CONSUMED
    UPDATE stock_reservation
    SET
        trang_thai = 'CONSUMED',
        consumed_at = CURRENT_TIMESTAMP
    WHERE reservation_id = v_reservation_id;

    -- 6. Ghi Outbox event
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
        'TRANSFER_SHIPPED',
        p_ma_phieu_dc,
        jsonb_build_object(
            'saga_id', p_saga_id,
            'ma_giao_dich_global', p_global_id,
            'ma_phieu_dc', p_ma_phieu_dc,
            'ma_kho', p_ma_kho,
            'ma_sp', p_ma_sp,
            'so_luong', v_so_luong,
            'event_time', CURRENT_TIMESTAMP
        ),
        'PENDING',
        CURRENT_TIMESTAMP
    );
END;
$$;
`;

  const spReceiveTransferSQL = `
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
        RAISE EXCEPTION 'saga_id không được NULL';
    END IF;

    IF p_global_id IS NULL THEN
        RAISE EXCEPTION 'global_id không được NULL';
    END IF;

    IF p_ma_phieu_dc IS NULL OR TRIM(p_ma_phieu_dc) = '' THEN
        RAISE EXCEPTION 'ma_phieu_dc không được NULL hoặc rỗng';
    END IF;

    IF p_ma_kho IS NULL OR TRIM(p_ma_kho) = '' THEN
        RAISE EXCEPTION 'ma_kho không được NULL hoặc rỗng';
    END IF;

    IF p_ma_sp IS NULL OR TRIM(p_ma_sp) = '' THEN
        RAISE EXCEPTION 'ma_sp không được NULL hoặc rỗng';
    END IF;

    IF p_so_luong_thuc_nhan IS NULL OR p_so_luong_thuc_nhan <= 0 THEN
        RAISE EXCEPTION 'Số lượng thực nhận phải lớn hơn 0: %', p_so_luong_thuc_nhan;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM outbox_event
        WHERE saga_id = p_saga_id
          AND event_type = 'TRANSFER_RECEIVED'
          AND aggregate_id = p_ma_phieu_dc
          AND status IN ('PENDING', 'PROCESSING', 'PROCESSED')
    )
    INTO v_da_nhan;

    IF v_da_nhan THEN
        RAISE EXCEPTION 'Điều chuyển % đã được nhận trước đó', p_ma_phieu_dc;
    END IF;

    SELECT so_luong
    INTO v_ton_hien_tai
    FROM ton_kho
    WHERE ma_kho = p_ma_kho
      AND ma_sp = p_ma_sp
    FOR UPDATE;

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
        v_ton_sau := v_ton_hien_tai + p_so_luong_thuc_nhan;

        UPDATE ton_kho
        SET
            so_luong = v_ton_sau,
            cap_nhat_luc = CURRENT_TIMESTAMP
        WHERE ma_kho = p_ma_kho
          AND ma_sp = p_ma_sp;
    END IF;

    -- Đồng bộ phan_bo_o_ke cho Storage Bin
    IF EXISTS (SELECT 1 FROM phan_bo_o_ke WHERE ma_kho = p_ma_kho AND ma_sp = p_ma_sp) THEN
        UPDATE phan_bo_o_ke
        SET so_luong = v_ton_sau,
            cap_nhat_luc = CURRENT_TIMESTAMP
        WHERE ma_kho = p_ma_kho AND ma_sp = p_ma_sp;
    ELSE
        INSERT INTO phan_bo_o_ke (ma_kho, ma_vi_tri, ma_sp, so_luong, cap_nhat_luc)
        SELECT p_ma_kho, v.ma_vi_tri, p_ma_sp, p_so_luong_thuc_nhan, CURRENT_TIMESTAMP
        FROM vi_tri_kho v
        WHERE v.ma_kho = p_ma_kho AND v.trang_thai = 'ACTIVE'
          AND v.ma_vi_tri NOT IN (SELECT ma_vi_tri FROM phan_bo_o_ke WHERE ma_kho = p_ma_kho)
        ORDER BY v.day_ke, v.tang, v.ngan
        LIMIT 1;
    END IF;

    -- Ghi sổ cái stock_ledger
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
        'Nhận hàng từ điều chuyển'
    );

    -- Ghi lịch sử tồn kho
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
        dieu_chuyen_vao = lich_su_ton_kho.dieu_chuyen_vao + EXCLUDED.dieu_chuyen_vao,
        ton_cuoi = EXCLUDED.ton_cuoi;

    -- Ghi Outbox event
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
        'TRANSFER_RECEIVED',
        p_ma_phieu_dc,
        jsonb_build_object(
            'saga_id', p_saga_id,
            'ma_giao_dich_global', p_global_id,
            'ma_phieu_dc', p_ma_phieu_dc,
            'ma_kho', p_ma_kho,
            'ma_sp', p_ma_sp,
            'so_luong_thuc_nhan', p_so_luong_thuc_nhan,
            'event_time', CURRENT_TIMESTAMP
        ),
        'PENDING',
        CURRENT_TIMESTAMP
    );
END;
$$;
`;

  for (const [nodeName, pool] of Object.entries({ HN: pools.HN, DN: pools.DN, HCM: pools.HCM })) {
    try {
      await pool.query(spShipTransferSQL);
      await pool.query(spReceiveTransferSQL);
      console.log(`✅ [${nodeName}] Đã cập nhật thành công sp_ship_transfer & sp_receive_transfer`);
    } catch (err: any) {
      console.error(`❌ [${nodeName}] Lỗi cập nhật Stored Procedures:`, err.message);
      throw err;
    }
  }

  console.log('🎉 Toàn bộ 3 node đã được nâng cấp Stored Procedures đồng bộ Storage Bin!');
}

updateTransferSPs()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
