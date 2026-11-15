-- =========================================================
-- NODE DN (DN01)
-- MIGRATION & SEED: WAREHOUSE SLOTTING & STORAGE BINS
-- =========================================================

BEGIN;

-- 1. Bảng danh mục ô lưu trữ (Storage Bin Master)
CREATE TABLE IF NOT EXISTS vi_tri_kho (
    ma_vi_tri VARCHAR(20) NOT NULL,
    ma_kho VARCHAR(10) NOT NULL REFERENCES kho(ma_kho),
    day_ke VARCHAR(5) NOT NULL,
    tang INT NOT NULL CHECK (tang >= 1 AND tang <= 5),
    ngan INT NOT NULL CHECK (ngan >= 1 AND ngan <= 10),
    vung_luu_tru VARCHAR(20) NOT NULL CHECK (vung_luu_tru IN ('GOLDEN_ZONE', 'MID_ZONE', 'TOP_STORAGE')),
    suc_chua_toi_da INT NOT NULL CHECK (suc_chua_toi_da > 0),
    trang_thai VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (trang_thai IN ('ACTIVE', 'MAINTENANCE')),
    cap_nhat_luc TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ma_kho, ma_vi_tri),
    CONSTRAINT uq_dn_day_tang_ngan UNIQUE (ma_kho, day_ke, tang, ngan),
    CONSTRAINT chk_dn_vung_tang CHECK (
        (tang IN (1, 2) AND vung_luu_tru = 'GOLDEN_ZONE') OR
        (tang IN (3, 4) AND vung_luu_tru = 'MID_ZONE') OR
        (tang = 5 AND vung_luu_tru = 'TOP_STORAGE')
    )
);

-- 2. Bảng phân bổ sản phẩm vào ô kệ (Bin Allocation)
CREATE TABLE IF NOT EXISTS phan_bo_o_ke (
    id BIGSERIAL PRIMARY KEY,
    ma_kho VARCHAR(10) NOT NULL,
    ma_vi_tri VARCHAR(20) NOT NULL,
    ma_sp VARCHAR(20) NOT NULL REFERENCES san_pham(ma_sp),
    so_luong INT NOT NULL CHECK (so_luong > 0),
    cap_nhat_luc TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ma_kho, ma_vi_tri) REFERENCES vi_tri_kho(ma_kho, ma_vi_tri) ON DELETE CASCADE,
    CONSTRAINT uq_dn_kho_vi_tri_sp UNIQUE (ma_kho, ma_vi_tri, ma_sp),
    CONSTRAINT uq_dn_kho_sp_single_bin UNIQUE (ma_kho, ma_sp)
);

CREATE INDEX IF NOT EXISTS idx_dn_vi_tri_vung ON vi_tri_kho(ma_kho, vung_luu_tru);
CREATE INDEX IF NOT EXISTS idx_dn_phan_bo_sp ON phan_bo_o_ke(ma_kho, ma_sp);

-- 3. Seed dữ liệu danh mục 45 ô vị trí kệ
INSERT INTO vi_tri_kho (ma_vi_tri, ma_kho, day_ke, tang, ngan, vung_luu_tru, suc_chua_toi_da, trang_thai) VALUES
  ('DN-A-01-01', 'DN01', 'A', 1, 1, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('DN-A-01-02', 'DN01', 'A', 1, 2, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('DN-A-01-03', 'DN01', 'A', 1, 3, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('DN-A-02-01', 'DN01', 'A', 2, 1, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('DN-A-02-02', 'DN01', 'A', 2, 2, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('DN-A-02-03', 'DN01', 'A', 2, 3, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('DN-A-03-01', 'DN01', 'A', 3, 1, 'MID_ZONE', 7500, 'ACTIVE'),
  ('DN-A-03-02', 'DN01', 'A', 3, 2, 'MID_ZONE', 7500, 'ACTIVE'),
  ('DN-A-03-03', 'DN01', 'A', 3, 3, 'MID_ZONE', 7500, 'ACTIVE'),
  ('DN-A-04-01', 'DN01', 'A', 4, 1, 'MID_ZONE', 7500, 'ACTIVE'),
  ('DN-A-04-02', 'DN01', 'A', 4, 2, 'MID_ZONE', 7500, 'ACTIVE'),
  ('DN-A-04-03', 'DN01', 'A', 4, 3, 'MID_ZONE', 7500, 'ACTIVE'),
  ('DN-A-05-01', 'DN01', 'A', 5, 1, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('DN-A-05-02', 'DN01', 'A', 5, 2, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('DN-A-05-03', 'DN01', 'A', 5, 3, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('DN-B-01-01', 'DN01', 'B', 1, 1, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('DN-B-01-02', 'DN01', 'B', 1, 2, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('DN-B-01-03', 'DN01', 'B', 1, 3, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('DN-B-02-01', 'DN01', 'B', 2, 1, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('DN-B-02-02', 'DN01', 'B', 2, 2, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('DN-B-02-03', 'DN01', 'B', 2, 3, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('DN-B-03-01', 'DN01', 'B', 3, 1, 'MID_ZONE', 7500, 'ACTIVE'),
  ('DN-B-03-02', 'DN01', 'B', 3, 2, 'MID_ZONE', 7500, 'ACTIVE'),
  ('DN-B-03-03', 'DN01', 'B', 3, 3, 'MID_ZONE', 7500, 'ACTIVE'),
  ('DN-B-04-01', 'DN01', 'B', 4, 1, 'MID_ZONE', 7500, 'ACTIVE'),
  ('DN-B-04-02', 'DN01', 'B', 4, 2, 'MID_ZONE', 7500, 'ACTIVE'),
  ('DN-B-04-03', 'DN01', 'B', 4, 3, 'MID_ZONE', 7500, 'ACTIVE'),
  ('DN-B-05-01', 'DN01', 'B', 5, 1, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('DN-B-05-02', 'DN01', 'B', 5, 2, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('DN-B-05-03', 'DN01', 'B', 5, 3, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('DN-C-01-01', 'DN01', 'C', 1, 1, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('DN-C-01-02', 'DN01', 'C', 1, 2, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('DN-C-01-03', 'DN01', 'C', 1, 3, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('DN-C-02-01', 'DN01', 'C', 2, 1, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('DN-C-02-02', 'DN01', 'C', 2, 2, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('DN-C-02-03', 'DN01', 'C', 2, 3, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('DN-C-03-01', 'DN01', 'C', 3, 1, 'MID_ZONE', 7500, 'ACTIVE'),
  ('DN-C-03-02', 'DN01', 'C', 3, 2, 'MID_ZONE', 7500, 'ACTIVE'),
  ('DN-C-03-03', 'DN01', 'C', 3, 3, 'MID_ZONE', 7500, 'ACTIVE'),
  ('DN-C-04-01', 'DN01', 'C', 4, 1, 'MID_ZONE', 7500, 'ACTIVE'),
  ('DN-C-04-02', 'DN01', 'C', 4, 2, 'MID_ZONE', 7500, 'ACTIVE'),
  ('DN-C-04-03', 'DN01', 'C', 4, 3, 'MID_ZONE', 7500, 'ACTIVE'),
  ('DN-C-05-01', 'DN01', 'C', 5, 1, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('DN-C-05-02', 'DN01', 'C', 5, 2, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('DN-C-05-03', 'DN01', 'C', 5, 3, 'TOP_STORAGE', 7000, 'ACTIVE')
ON CONFLICT (ma_kho, ma_vi_tri) DO NOTHING;

-- 4. Seed dữ liệu phân bổ sản phẩm vào ô kệ
INSERT INTO phan_bo_o_ke (ma_kho, ma_vi_tri, ma_sp, so_luong) VALUES
  ('DN01', 'DN-A-01-01', 'SP001', 4123),
  ('DN01', 'DN-A-01-02', 'SP002', 2781),
  ('DN01', 'DN-A-01-03', 'SP003', 4066),
  ('DN01', 'DN-A-02-01', 'SP004', 5269),
  ('DN01', 'DN-A-02-02', 'SP005', 5048),
  ('DN01', 'DN-A-02-03', 'SP020', 5487),
  ('DN01', 'DN-A-03-01', 'SP006', 4909),
  ('DN01', 'DN-A-03-02', 'SP007', 4674),
  ('DN01', 'DN-B-01-01', 'SP008', 45),
  ('DN01', 'DN-B-01-02', 'SP009', 3188),
  ('DN01', 'DN-B-02-01', 'SP010', 4751),
  ('DN01', 'DN-B-03-01', 'SP011', 2543),
  ('DN01', 'DN-B-04-01', 'SP012', 6456),
  ('DN01', 'DN-B-04-02', 'SP013', 4107),
  ('DN01', 'DN-C-03-01', 'SP015', 4474),
  ('DN01', 'DN-C-03-02', 'SP016', 5594),
  ('DN01', 'DN-C-04-01', 'SP017', 3819),
  ('DN01', 'DN-C-05-01', 'SP014', 6263),
  ('DN01', 'DN-C-05-02', 'SP018', 3260),
  ('DN01', 'DN-C-05-03', 'SP019', 4534)
ON CONFLICT (ma_kho, ma_vi_tri, ma_sp) DO NOTHING;

COMMIT;
