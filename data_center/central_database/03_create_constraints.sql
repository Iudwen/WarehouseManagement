-- =========================================================
-- CENTRAL DATABASE
-- 03_create_constraints.sql
-- =========================================================


-- =========================================================
-- KHO → NHÓM / SẢN PHẨM
-- =========================================================

ALTER TABLE san_pham
ADD CONSTRAINT fk_central_sp_nhom
FOREIGN KEY (ma_nhom)
REFERENCES nhom_san_pham(ma_nhom);


-- =========================================================
-- TỒN KHO
-- =========================================================

ALTER TABLE ton_kho_central
ADD CONSTRAINT fk_central_ton_kho
FOREIGN KEY (ma_kho)
REFERENCES kho(ma_kho);


ALTER TABLE ton_kho_central
ADD CONSTRAINT fk_central_ton_sp
FOREIGN KEY (ma_sp)
REFERENCES san_pham(ma_sp);


-- =========================================================
-- LỊCH SỬ TỒN KHO
-- =========================================================

ALTER TABLE lich_su_ton_kho_central
ADD CONSTRAINT fk_central_history_kho
FOREIGN KEY (ma_kho)
REFERENCES kho(ma_kho);


ALTER TABLE lich_su_ton_kho_central
ADD CONSTRAINT fk_central_history_sp
FOREIGN KEY (ma_sp)
REFERENCES san_pham(ma_sp);


-- =========================================================
-- BÁN HÀNG
-- =========================================================

ALTER TABLE ban_hang_central
ADD CONSTRAINT fk_central_sales_kho
FOREIGN KEY (ma_kho)
REFERENCES kho(ma_kho);


ALTER TABLE ban_hang_central
ADD CONSTRAINT fk_central_sales_sp
FOREIGN KEY (ma_sp)
REFERENCES san_pham(ma_sp);


-- =========================================================
-- NHẬP HÀNG
-- =========================================================

ALTER TABLE nhap_hang_central
ADD CONSTRAINT fk_central_import_kho
FOREIGN KEY (ma_kho)
REFERENCES kho(ma_kho);


ALTER TABLE nhap_hang_central
ADD CONSTRAINT fk_central_import_sp
FOREIGN KEY (ma_sp)
REFERENCES san_pham(ma_sp);


-- =========================================================
-- ĐIỀU CHUYỂN
-- =========================================================

ALTER TABLE dieu_chuyen_central
ADD CONSTRAINT fk_central_transfer_sp
FOREIGN KEY (ma_sp)
REFERENCES san_pham(ma_sp);


ALTER TABLE dieu_chuyen_central
ADD CONSTRAINT fk_central_transfer_source
FOREIGN KEY (kho_xuat)
REFERENCES kho(ma_kho);


ALTER TABLE dieu_chuyen_central
ADD CONSTRAINT fk_central_transfer_destination
FOREIGN KEY (kho_nhap)
REFERENCES kho(ma_kho);


-- =========================================================
-- DỰ BÁO
-- =========================================================

ALTER TABLE demand_forecast
ADD CONSTRAINT fk_forecast_kho
FOREIGN KEY (ma_kho)
REFERENCES kho(ma_kho);


ALTER TABLE demand_forecast
ADD CONSTRAINT fk_forecast_sp
FOREIGN KEY (ma_sp)
REFERENCES san_pham(ma_sp);


-- =========================================================
-- ĐỀ XUẤT ĐIỀU CHUYỂN
-- =========================================================

ALTER TABLE transfer_recommendation
ADD CONSTRAINT fk_recommendation_sp
FOREIGN KEY (ma_sp)
REFERENCES san_pham(ma_sp);


ALTER TABLE transfer_recommendation
ADD CONSTRAINT fk_recommendation_source
FOREIGN KEY (kho_xuat)
REFERENCES kho(ma_kho);


ALTER TABLE transfer_recommendation
ADD CONSTRAINT fk_recommendation_destination
FOREIGN KEY (kho_nhap)
REFERENCES kho(ma_kho);