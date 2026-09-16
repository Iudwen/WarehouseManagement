-- =========================================================
-- CENTRAL DATABASE
-- 05_create_indexes.sql
-- =========================================================


-- =========================================================
-- TỒN KHO
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_central_inventory_product
ON ton_kho_central(ma_sp);


CREATE INDEX IF NOT EXISTS idx_central_inventory_warehouse
ON ton_kho_central(ma_kho);


-- =========================================================
-- LỊCH SỬ TỒN KHO
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_central_history_date
ON lich_su_ton_kho_central(ngay);


CREATE INDEX IF NOT EXISTS idx_central_history_product
ON lich_su_ton_kho_central(ma_sp);


CREATE INDEX IF NOT EXISTS idx_central_history_warehouse
ON lich_su_ton_kho_central(ma_kho);


CREATE INDEX IF NOT EXISTS idx_central_history_product_date
ON lich_su_ton_kho_central(ma_sp, ngay);


-- =========================================================
-- BÁN HÀNG
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_central_sales_date
ON ban_hang_central(ngay_ban);


CREATE INDEX IF NOT EXISTS idx_central_sales_product
ON ban_hang_central(ma_sp);


CREATE INDEX IF NOT EXISTS idx_central_sales_warehouse
ON ban_hang_central(ma_kho);


-- =========================================================
-- NHẬP HÀNG
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_central_import_date
ON nhap_hang_central(ngay_nhap);


CREATE INDEX IF NOT EXISTS idx_central_import_product
ON nhap_hang_central(ma_sp);


-- =========================================================
-- ĐIỀU CHUYỂN
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_central_transfer_date
ON dieu_chuyen_central(ngay_dieu_chuyen);


CREATE INDEX IF NOT EXISTS idx_central_transfer_product
ON dieu_chuyen_central(ma_sp);


CREATE INDEX IF NOT EXISTS idx_central_transfer_source
ON dieu_chuyen_central(kho_xuat);


CREATE INDEX IF NOT EXISTS idx_central_transfer_destination
ON dieu_chuyen_central(kho_nhap);


-- =========================================================
-- NODE STATUS
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_node_status
ON node_status(status);


-- =========================================================
-- SYNC LOG
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_sync_log_node
ON sync_log(node_name);


CREATE INDEX IF NOT EXISTS idx_sync_log_status
ON sync_log(status);


-- =========================================================
-- FORECAST
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_forecast_date
ON demand_forecast(forecast_date);


CREATE INDEX IF NOT EXISTS idx_forecast_product
ON demand_forecast(ma_sp);


CREATE INDEX IF NOT EXISTS idx_forecast_warehouse
ON demand_forecast(ma_kho);


-- =========================================================
-- RECOMMENDATION
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_recommendation_product
ON transfer_recommendation(ma_sp);


CREATE INDEX IF NOT EXISTS idx_recommendation_status
ON transfer_recommendation(status);