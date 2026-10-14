
-- =========================================================
-- CENTRAL DATABASE
-- 03_create_constraints.sql
-- =========================================================

-- KHO -> NHOM / SAN PHAM
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_central_sp_nhom'
          AND conrelid = 'san_pham'::regclass
    ) THEN
        ALTER TABLE san_pham
        ADD CONSTRAINT fk_central_sp_nhom
        FOREIGN KEY (ma_nhom)
        REFERENCES nhom_san_pham(ma_nhom);
    END IF;
END
$$;

-- TON KHO
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_central_ton_kho'
          AND conrelid = 'ton_kho_central'::regclass
    ) THEN
        ALTER TABLE ton_kho_central
        ADD CONSTRAINT fk_central_ton_kho
        FOREIGN KEY (ma_kho) REFERENCES kho(ma_kho);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_central_ton_sp'
          AND conrelid = 'ton_kho_central'::regclass
    ) THEN
        ALTER TABLE ton_kho_central
        ADD CONSTRAINT fk_central_ton_sp
        FOREIGN KEY (ma_sp) REFERENCES san_pham(ma_sp);
    END IF;
END
$$;

-- LICH SU TON KHO
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_central_history_kho'
          AND conrelid = 'lich_su_ton_kho_central'::regclass
    ) THEN
        ALTER TABLE lich_su_ton_kho_central
        ADD CONSTRAINT fk_central_history_kho
        FOREIGN KEY (ma_kho) REFERENCES kho(ma_kho);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_central_history_sp'
          AND conrelid = 'lich_su_ton_kho_central'::regclass
    ) THEN
        ALTER TABLE lich_su_ton_kho_central
        ADD CONSTRAINT fk_central_history_sp
        FOREIGN KEY (ma_sp) REFERENCES san_pham(ma_sp);
    END IF;
END
$$;

-- XUAT HANG
CREATE INDEX IF NOT EXISTS idx_central_xuat_hang_date
ON xuat_hang_central(ngay_xuat);

CREATE INDEX IF NOT EXISTS idx_central_xuat_hang_product
ON xuat_hang_central(ma_sp);

CREATE INDEX IF NOT EXISTS idx_central_xuat_hang_warehouse
ON xuat_hang_central(ma_kho);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_central_export_kho'
          AND conrelid = 'xuat_hang_central'::regclass
    ) THEN
        ALTER TABLE xuat_hang_central
        ADD CONSTRAINT fk_central_export_kho
        FOREIGN KEY (ma_kho) REFERENCES kho(ma_kho);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_central_export_sp'
          AND conrelid = 'xuat_hang_central'::regclass
    ) THEN
        ALTER TABLE xuat_hang_central
        ADD CONSTRAINT fk_central_export_sp
        FOREIGN KEY (ma_sp) REFERENCES san_pham(ma_sp);
    END IF;
END
$$;

-- NHAP HANG
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_central_import_kho'
          AND conrelid = 'nhap_hang_central'::regclass
    ) THEN
        ALTER TABLE nhap_hang_central
        ADD CONSTRAINT fk_central_import_kho
        FOREIGN KEY (ma_kho) REFERENCES kho(ma_kho);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_central_import_sp'
          AND conrelid = 'nhap_hang_central'::regclass
    ) THEN
        ALTER TABLE nhap_hang_central
        ADD CONSTRAINT fk_central_import_sp
        FOREIGN KEY (ma_sp) REFERENCES san_pham(ma_sp);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_nhap_hang_central'
          AND conrelid = 'nhap_hang_central'::regclass
    ) THEN
        ALTER TABLE nhap_hang_central
        ADD CONSTRAINT uq_nhap_hang_central
        UNIQUE (ma_phieu_nhap, ma_kho, ma_sp, source_node);
    END IF;
END
$$;

-- DIEU CHUYEN
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_central_transfer_sp'
          AND conrelid = 'dieu_chuyen_central'::regclass
    ) THEN
        ALTER TABLE dieu_chuyen_central
        ADD CONSTRAINT fk_central_transfer_sp
        FOREIGN KEY (ma_sp) REFERENCES san_pham(ma_sp);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_central_transfer_source'
          AND conrelid = 'dieu_chuyen_central'::regclass
    ) THEN
        ALTER TABLE dieu_chuyen_central
        ADD CONSTRAINT fk_central_transfer_source
        FOREIGN KEY (kho_xuat) REFERENCES kho(ma_kho);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_central_transfer_destination'
          AND conrelid = 'dieu_chuyen_central'::regclass
    ) THEN
        ALTER TABLE dieu_chuyen_central
        ADD CONSTRAINT fk_central_transfer_destination
        FOREIGN KEY (kho_nhap) REFERENCES kho(ma_kho);
    END IF;
END
$$;

-- DU BAO
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_forecast_kho'
          AND conrelid = 'demand_forecast'::regclass
    ) THEN
        ALTER TABLE demand_forecast
        ADD CONSTRAINT fk_forecast_kho
        FOREIGN KEY (ma_kho) REFERENCES kho(ma_kho);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_forecast_sp'
          AND conrelid = 'demand_forecast'::regclass
    ) THEN
        ALTER TABLE demand_forecast
        ADD CONSTRAINT fk_forecast_sp
        FOREIGN KEY (ma_sp) REFERENCES san_pham(ma_sp);
    END IF;
END
$$;

-- DE XUAT DIEU CHUYEN
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_recommendation_sp'
          AND conrelid = 'transfer_recommendation'::regclass
    ) THEN
        ALTER TABLE transfer_recommendation
        ADD CONSTRAINT fk_recommendation_sp
        FOREIGN KEY (ma_sp) REFERENCES san_pham(ma_sp);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_recommendation_source'
          AND conrelid = 'transfer_recommendation'::regclass
    ) THEN
        ALTER TABLE transfer_recommendation
        ADD CONSTRAINT fk_recommendation_source
        FOREIGN KEY (kho_xuat) REFERENCES kho(ma_kho);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_recommendation_destination'
          AND conrelid = 'transfer_recommendation'::regclass
    ) THEN
        ALTER TABLE transfer_recommendation
        ADD CONSTRAINT fk_recommendation_destination
        FOREIGN KEY (kho_nhap) REFERENCES kho(ma_kho);
    END IF;
END
$$;
