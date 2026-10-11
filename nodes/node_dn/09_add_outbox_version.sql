-- Migration: Bổ sung cột version phục vụ Optimistic Concurrency Control cho Outbox Worker.
-- An toàn (Idempotent): Chạy nhiều lần không lỗi, không ảnh hưởng dữ liệu cũ.

ALTER TABLE outbox_event 
ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
