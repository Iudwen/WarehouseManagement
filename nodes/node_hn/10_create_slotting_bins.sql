-- =========================================================
-- NODE HN (HN01)
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
    CONSTRAINT uq_hn_day_tang_ngan UNIQUE (ma_kho, day_ke, tang, ngan),
    CONSTRAINT chk_hn_vung_tang CHECK (
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
    CONSTRAINT uq_hn_kho_vi_tri_sp UNIQUE (ma_kho, ma_vi_tri, ma_sp),
    CONSTRAINT uq_hn_kho_sp_single_bin UNIQUE (ma_kho, ma_sp)
);

CREATE INDEX IF NOT EXISTS idx_hn_vi_tri_vung ON vi_tri_kho(ma_kho, vung_luu_tru);
CREATE INDEX IF NOT EXISTS idx_hn_phan_bo_sp ON phan_bo_o_ke(ma_kho, ma_sp);

-- 3. Seed dữ liệu danh mục 45 ô vị trí kệ
INSERT INTO vi_tri_kho (ma_vi_tri, ma_kho, day_ke, tang, ngan, vung_luu_tru, suc_chua_toi_da, trang_thai) VALUES
  ('HN-A-01-01', 'HN01', 'A', 1, 1, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HN-A-01-02', 'HN01', 'A', 1, 2, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HN-A-01-03', 'HN01', 'A', 1, 3, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HN-A-02-01', 'HN01', 'A', 2, 1, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HN-A-02-02', 'HN01', 'A', 2, 2, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HN-A-02-03', 'HN01', 'A', 2, 3, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HN-A-03-01', 'HN01', 'A', 3, 1, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HN-A-03-02', 'HN01', 'A', 3, 2, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HN-A-03-03', 'HN01', 'A', 3, 3, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HN-A-04-01', 'HN01', 'A', 4, 1, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HN-A-04-02', 'HN01', 'A', 4, 2, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HN-A-04-03', 'HN01', 'A', 4, 3, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HN-A-05-01', 'HN01', 'A', 5, 1, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('HN-A-05-02', 'HN01', 'A', 5, 2, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('HN-A-05-03', 'HN01', 'A', 5, 3, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('HN-B-01-01', 'HN01', 'B', 1, 1, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HN-B-01-02', 'HN01', 'B', 1, 2, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HN-B-01-03', 'HN01', 'B', 1, 3, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HN-B-02-01', 'HN01', 'B', 2, 1, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HN-B-02-02', 'HN01', 'B', 2, 2, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HN-B-02-03', 'HN01', 'B', 2, 3, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HN-B-03-01', 'HN01', 'B', 3, 1, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HN-B-03-02', 'HN01', 'B', 3, 2, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HN-B-03-03', 'HN01', 'B', 3, 3, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HN-B-04-01', 'HN01', 'B', 4, 1, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HN-B-04-02', 'HN01', 'B', 4, 2, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HN-B-04-03', 'HN01', 'B', 4, 3, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HN-B-05-01', 'HN01', 'B', 5, 1, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('HN-B-05-02', 'HN01', 'B', 5, 2, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('HN-B-05-03', 'HN01', 'B', 5, 3, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('HN-C-01-01', 'HN01', 'C', 1, 1, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HN-C-01-02', 'HN01', 'C', 1, 2, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HN-C-01-03', 'HN01', 'C', 1, 3, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HN-C-02-01', 'HN01', 'C', 2, 1, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HN-C-02-02', 'HN01', 'C', 2, 2, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HN-C-02-03', 'HN01', 'C', 2, 3, 'GOLDEN_ZONE', 8000, 'ACTIVE'),
  ('HN-C-03-01', 'HN01', 'C', 3, 1, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HN-C-03-02', 'HN01', 'C', 3, 2, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HN-C-03-03', 'HN01', 'C', 3, 3, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HN-C-04-01', 'HN01', 'C', 4, 1, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HN-C-04-02', 'HN01', 'C', 4, 2, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HN-C-04-03', 'HN01', 'C', 4, 3, 'MID_ZONE', 7500, 'ACTIVE'),
  ('HN-C-05-01', 'HN01', 'C', 5, 1, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('HN-C-05-02', 'HN01', 'C', 5, 2, 'TOP_STORAGE', 7000, 'ACTIVE'),
  ('HN-C-05-03', 'HN01', 'C', 5, 3, 'TOP_STORAGE', 7000, 'ACTIVE')
ON CONFLICT (ma_kho, ma_vi_tri) DO NOTHING;

-- 4. Seed dữ liệu phân bổ sản phẩm vào ô kệ
INSERT INTO phan_bo_o_ke (ma_kho, ma_vi_tri, ma_sp, so_luong) VALUES
  ('HN01', 'HN-A-01-01', 'SP001', 3489),
  ('HN01', 'HN-A-01-02', 'SP002', 4315),
  ('HN01', 'HN-A-01-03', 'SP003', 4815),
  ('HN01', 'HN-A-02-01', 'SP004', 4864),
  ('HN01', 'HN-A-02-02', 'SP005', 4257),
  ('HN01', 'HN-A-02-03', 'SP020', 3912),
  ('HN01', 'HN-A-03-01', 'SP006', 5863),
  ('HN01', 'HN-A-03-02', 'SP007', 4578),
  ('HN01', 'HN-B-01-01', 'SP008', 4295),
  ('HN01', 'HN-B-01-02', 'SP009', 3202),
  ('HN01', 'HN-B-02-01', 'SP010', 4973),
  ('HN01', 'HN-B-03-01', 'SP011', 3562),
  ('HN01', 'HN-B-04-01', 'SP012', 4767),
  ('HN01', 'HN-B-04-02', 'SP013', 4440),
  ('HN01', 'HN-C-03-01', 'SP015', 4200),
  ('HN01', 'HN-C-03-02', 'SP016', 4094),
  ('HN01', 'HN-C-04-01', 'SP017', 4899),
  ('HN01', 'HN-C-05-01', 'SP014', 4173),
  ('HN01', 'HN-C-05-02', 'SP018', 5598),
  ('HN01', 'HN-C-05-03', 'SP019', 5657)
ON CONFLICT (ma_kho, ma_vi_tri, ma_sp) DO NOTHING;

COMMIT;
