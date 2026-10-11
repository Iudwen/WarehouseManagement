-- ============================================================
-- Thêm cột payload vào bảng processed_event để phục vụ Idempotency
-- An toàn chạy nhiều lần (IF NOT EXISTS)
-- ============================================================

ALTER TABLE processed_event 
ADD COLUMN IF NOT EXISTS payload JSONB;
