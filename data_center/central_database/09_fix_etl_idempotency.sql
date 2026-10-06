BEGIN;

ALTER TABLE nhap_hang_central
    DROP CONSTRAINT IF EXISTS uq_nhap_hang_central;

ALTER TABLE nhap_hang_central
    ADD CONSTRAINT uq_nhap_hang_central
    UNIQUE (ma_phieu_nhap, ma_kho, ma_sp, source_node);

COMMIT;
