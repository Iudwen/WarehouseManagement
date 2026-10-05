BEGIN;

ALTER TABLE phieu_nhap
    ADD COLUMN IF NOT EXISTS nguoi_tao VARCHAR(20),
    ADD COLUMN IF NOT EXISTS nguoi_duyet VARCHAR(20),
    ADD COLUMN IF NOT EXISTS tao_luc TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS duyet_luc TIMESTAMP,
    ADD COLUMN IF NOT EXISTS ly_do_tu_choi TEXT,
    ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE phieu_xuat
    ADD COLUMN IF NOT EXISTS nguoi_tao VARCHAR(20),
    ADD COLUMN IF NOT EXISTS nguoi_duyet VARCHAR(20),
    ADD COLUMN IF NOT EXISTS tao_luc TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS duyet_luc TIMESTAMP,
    ADD COLUMN IF NOT EXISTS ly_do_tu_choi TEXT,
    ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS phieu_workflow_history (
    id BIGSERIAL PRIMARY KEY,
    loai_phieu VARCHAR(20) NOT NULL CHECK (loai_phieu IN ('NHAP', 'XUAT')),
    ma_phieu VARCHAR(20) NOT NULL,
    trang_thai_cu VARCHAR(30),
    trang_thai_moi VARCHAR(30) NOT NULL,
    nguoi_thuc_hien VARCHAR(20),
    ly_do TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_phieu_nhap_workflow
    ON phieu_nhap(ma_kho, trang_thai);
CREATE INDEX IF NOT EXISTS idx_phieu_xuat_workflow
    ON phieu_xuat(ma_kho, trang_thai);
CREATE INDEX IF NOT EXISTS idx_workflow_history_lookup
    ON phieu_workflow_history(loai_phieu, ma_phieu, created_at);

ALTER TABLE phieu_nhap
    DROP CONSTRAINT IF EXISTS chk_phieu_nhap_trang_thai;
ALTER TABLE phieu_nhap
    ADD CONSTRAINT chk_phieu_nhap_trang_thai
    CHECK (trang_thai IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED'));

ALTER TABLE phieu_xuat
    DROP CONSTRAINT IF EXISTS chk_phieu_xuat_trang_thai;
ALTER TABLE phieu_xuat
    ADD CONSTRAINT chk_phieu_xuat_trang_thai
    CHECK (trang_thai IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED'));

COMMIT;
