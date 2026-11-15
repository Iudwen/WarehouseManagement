-- =========================================================
-- NODE HCM (HCM01)
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
    CONSTRAINT uq_hcm_day_tang_ngan UNIQUE (ma_kho, day_ke, tang, ngan),
    CONSTRAINT chk_hcm_vung_tang CHECK (
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
    CONSTRAINT uq_hcm_kho_vi_tri_sp UNIQUE (ma_kho, ma_vi_tri, ma_sp),
    CONSTRAINT uq_hcm_kho_sp_single_bin UNIQUE (ma_kho, ma_sp)
);

CREATE INDEX IF NOT EXISTS idx_hcm_vi_tri_vung ON vi_tri_kho(ma_kho, vung_luu_tru);
CREATE INDEX IF NOT EXISTS idx_hcm_phan_bo_sp ON phan_bo_o_ke(ma_kho, ma_sp);

-- 3. Seed dữ liệu danh mục 45 ô vị trí kệ
INSERT INTO vi_tri_kho (ma_vi_tri, ma_kho, day_ke, tang, ngan, vung_luu_tru, suc_chua_toi_da, trang_thai) VALUES
  ('HCM-A-01-01', 'HCM01', 'A', 1, 1, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HCM-A-01-02', 'HCM01', 'A', 1, 2, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HCM-A-01-03', 'HCM01', 'A', 1, 3, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HCM-A-02-01', 'HCM01', 'A', 2, 1, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HCM-A-02-02', 'HCM01', 'A', 2, 2, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HCM-A-02-03', 'HCM01', 'A', 2, 3, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HCM-A-03-01', 'HCM01', 'A', 3, 1, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HCM-A-03-02', 'HCM01', 'A', 3, 2, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HCM-A-03-03', 'HCM01', 'A', 3, 3, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HCM-A-04-01', 'HCM01', 'A', 4, 1, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HCM-A-04-02', 'HCM01', 'A', 4, 2, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HCM-A-04-03', 'HCM01', 'A', 4, 3, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HCM-A-05-01', 'HCM01', 'A', 5, 1, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('HCM-A-05-02', 'HCM01', 'A', 5, 2, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('HCM-A-05-03', 'HCM01', 'A', 5, 3, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('HCM-B-01-01', 'HCM01', 'B', 1, 1, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HCM-B-01-02', 'HCM01', 'B', 1, 2, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HCM-B-01-03', 'HCM01', 'B', 1, 3, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HCM-B-02-01', 'HCM01', 'B', 2, 1, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HCM-B-02-02', 'HCM01', 'B', 2, 2, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HCM-B-02-03', 'HCM01', 'B', 2, 3, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HCM-B-03-01', 'HCM01', 'B', 3, 1, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HCM-B-03-02', 'HCM01', 'B', 3, 2, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HCM-B-03-03', 'HCM01', 'B', 3, 3, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HCM-B-04-01', 'HCM01', 'B', 4, 1, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HCM-B-04-02', 'HCM01', 'B', 4, 2, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HCM-B-04-03', 'HCM01', 'B', 4, 3, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HCM-B-05-01', 'HCM01', 'B', 5, 1, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('HCM-B-05-02', 'HCM01', 'B', 5, 2, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('HCM-B-05-03', 'HCM01', 'B', 5, 3, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('HCM-C-01-01', 'HCM01', 'C', 1, 1, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HCM-C-01-02', 'HCM01', 'C', 1, 2, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HCM-C-01-03', 'HCM01', 'C', 1, 3, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HCM-C-02-01', 'HCM01', 'C', 2, 1, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HCM-C-02-02', 'HCM01', 'C', 2, 2, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HCM-C-02-03', 'HCM01', 'C', 2, 3, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HCM-C-03-01', 'HCM01', 'C', 3, 1, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HCM-C-03-02', 'HCM01', 'C', 3, 2, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HCM-C-03-03', 'HCM01', 'C', 3, 3, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HCM-C-04-01', 'HCM01', 'C', 4, 1, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HCM-C-04-02', 'HCM01', 'C', 4, 2, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HCM-C-04-03', 'HCM01', 'C', 4, 3, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HCM-C-05-01', 'HCM01', 'C', 5, 1, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('HCM-C-05-02', 'HCM01', 'C', 5, 2, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('HCM-C-05-03', 'HCM01', 'C', 5, 3, 'TOP_STORAGE', 7000, 'ACTIVE')
ON CONFLICT (ma_kho, ma_vi_tri) DO NOTHING;

-- 4. Seed dữ liệu phân bổ sản phẩm vào ô kệ
INSERT INTO phan_bo_o_ke (ma_kho, ma_vi_tri, ma_sp, so_luong) VALUES
  ('HCM01', 'HCM-A-01-01', 'SP001', 120),
  ('HCM01', 'HCM-A-01-02', 'SP002', 4896),
  ('HCM01', 'HCM-A-01-03', 'SP003', 6158),
  ('HCM01', 'HCM-A-02-01', 'SP004', 60),
  ('HCM01', 'HCM-A-02-02', 'SP005', 2109),
  ('HCM01', 'HCM-A-02-03', 'SP020', 4171),
  ('HCM01', 'HCM-A-03-01', 'SP006', 6443),
  ('HCM01', 'HCM-A-03-02', 'SP007', 2357),
  ('HCM01', 'HCM-B-01-01', 'SP008', 6041),
  ('HCM01', 'HCM-B-01-02', 'SP009', 4026),
  ('HCM01', 'HCM-B-02-01', 'SP010', 4966),
  ('HCM01', 'HCM-B-03-01', 'SP011', 3579),
  ('HCM01', 'HCM-B-04-01', 'SP012', 6385),
  ('HCM01', 'HCM-B-04-02', 'SP013', 3604),
  ('HCM01', 'HCM-C-03-01', 'SP015', 3535),
  ('HCM01', 'HCM-C-03-02', 'SP016', 3377),
  ('HCM01', 'HCM-C-04-01', 'SP017', 4267),
  ('HCM01', 'HCM-C-05-01', 'SP014', 4722),
  ('HCM01', 'HCM-C-05-02', 'SP018', 3805),
  ('HCM01', 'HCM-C-05-03', 'SP019', 3066)
ON CONFLICT (ma_kho, ma_vi_tri, ma_sp) DO NOTHING;

COMMIT;
