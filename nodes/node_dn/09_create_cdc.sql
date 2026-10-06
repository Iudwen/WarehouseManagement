-- ============================================================
-- 09_create_cdc.sql
-- NODE - DEBEZIUM CDC
--
-- Mục đích:
--   Chuẩn bị PostgreSQL Node cho Debezium.
--
-- Luồng:
--   PostgreSQL
--       ↓
--      WAL
--       ↓
--    Debezium
--       ↓
--      Kafka
--
-- LƯU Ý:
--   - Không thay đổi nghiệp vụ hiện tại.
--   - Không tạo FK xuyên database.
--   - Không tạo lại OUTBOX_EVENT.
--   - Không tạo lại STOCK_LEDGER.
-- ============================================================


-- ============================================================
-- 1. PUBLICATION CHO DEBEZIUM
-- ============================================================

DO $$
BEGIN

    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication
        WHERE pubname = 'dbz_publication'
    ) THEN

        CREATE PUBLICATION dbz_publication
        FOR TABLE
            kho,
            nhom_san_pham,
            san_pham,
            nha_cung_cap,
            khach_hang,
            phieu_nhap,
            ct_phieu_nhap,
            phieu_xuat,
            ct_phieu_xuat,
            ton_kho,
            phieu_dieu_chuyen,
            ct_dieu_chuyen,
            lich_su_ton_kho,
            stock_reservation,
            stock_ledger,
            outbox_event;

    END IF;

END;
$$;


-- ============================================================
-- 2. KIỂM TRA PUBLICATION
-- ============================================================

SELECT
    pubname,
    puballtables
FROM pg_publication
WHERE pubname = 'dbz_publication';


-- ============================================================
-- 3. KIỂM TRA CÁC BẢNG ĐƯỢC CDC
-- ============================================================

SELECT
    schemaname,
    tablename
FROM pg_publication_tables
WHERE pubname = 'dbz_publication'
ORDER BY tablename;