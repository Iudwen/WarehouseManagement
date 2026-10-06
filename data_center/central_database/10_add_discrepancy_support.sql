-- Migration 10: Add discrepancy support for Option A (COMPLETED_WITH_DISCREPANCY)

-- 1. Bổ sung các cột chênh lệch vào saga_transaction
ALTER TABLE saga_transaction
  ADD COLUMN IF NOT EXISTS so_luong_thuc_nhan INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ly_do_thieu TEXT DEFAULT NULL;


-- 2. Mở rộng CHECK constraint current_state cho saga_transaction
ALTER TABLE saga_transaction
  DROP CONSTRAINT IF EXISTS saga_transaction_current_state_check;

ALTER TABLE saga_transaction
  ADD CONSTRAINT saga_transaction_current_state_check
  CHECK (current_state IN (
    'WAITING_SOURCE_CONFIRMATION',
    'SOURCE_ACCEPTED',
    'IN_TRANSIT',
    'COMPLETED',
    'COMPLETED_WITH_DISCREPANCY',
    'CANCELLED'
  ));


-- 2.1. Mở rộng CHECK constraint chk_saga_state
ALTER TABLE saga_transaction
  DROP CONSTRAINT IF EXISTS chk_saga_state;

ALTER TABLE saga_transaction
  ADD CONSTRAINT chk_saga_state
  CHECK (current_state IN (
    'CREATED',
    'WAITING_SOURCE_CONFIRMATION',
    'SOURCE_ACCEPTED',
    'SOURCE_REJECTED',
    'RESERVED',
    'TRANSFER_OUT',
    'IN_TRANSIT',
    'WAITING_DESTINATION_CONFIRMATION',
    'TRANSFER_IN',
    'RECEIVED',
    'RECEIVED_WITH_DISCREPANCY',
    'COMPENSATION_REQUIRED',
    'COMPENSATION_COMPLETED',
    'TIMEOUT',
    'COMPLETED',
    'COMPLETED_WITH_DISCREPANCY',
    'FAILED',
    'CANCELLED'
  ));


-- 3. Mở rộng CHECK constraint trang_thai cho dieu_chuyen_central
ALTER TABLE dieu_chuyen_central
  DROP CONSTRAINT IF EXISTS dieu_chuyen_central_trang_thai_check;

ALTER TABLE dieu_chuyen_central
  ADD CONSTRAINT dieu_chuyen_central_trang_thai_check
  CHECK (trang_thai IN (
    'PENDING',
    'DANG_XU_LY',
    'HOAN_THANH',
    'HOAN_THANH_THIEU',
    'DA_HUY'
  ));