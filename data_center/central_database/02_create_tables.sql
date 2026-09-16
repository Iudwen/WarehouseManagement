-- =========================================================
-- CENTRAL DATABASE
-- 02_create_tables.sql
-- =========================================================
-- Mục đích:
--   - Lưu dữ liệu tổng hợp từ các node HN / ĐN / HCM
--   - Theo dõi trạng thái các node
--   - Lưu lịch sử đồng bộ
--   - Lưu kết quả dự báo và đề xuất điều chuyển
--
-- LƯU Ý:
--   - sync_log CHỈ tồn tại tại CENTRAL
--   - node HN / ĐN / HCM chỉ chứa dữ liệu nghiệp vụ
-- =========================================================


-- =========================================================
-- 1. KHO
-- =========================================================

CREATE TABLE IF NOT EXISTS kho (
    ma_kho VARCHAR(10) PRIMARY KEY,
    ten_kho VARCHAR(100) NOT NULL,
    dia_chi VARCHAR(255),
    thanh_pho VARCHAR(100),

    -- Node sở hữu dữ liệu kho
    node_name VARCHAR(50) NOT NULL,

    node_host VARCHAR(100),
    node_port INT,

    trang_thai VARCHAR(20) DEFAULT 'ACTIVE',

    -- Thời điểm dữ liệu kho được đồng bộ gần nhất
    dong_bo_luc TIMESTAMP
);


-- =========================================================
-- 2. NHÓM SẢN PHẨM
-- =========================================================

CREATE TABLE IF NOT EXISTS nhom_san_pham (
    ma_nhom VARCHAR(10) PRIMARY KEY,
    ten_nhom VARCHAR(100) NOT NULL
);


-- =========================================================
-- 3. SẢN PHẨM
-- =========================================================

CREATE TABLE IF NOT EXISTS san_pham (
    ma_sp VARCHAR(20) PRIMARY KEY,

    ten_sp VARCHAR(150) NOT NULL,

    ma_nhom VARCHAR(10),

    don_vi VARCHAR(30),

    gia_nhap NUMERIC(15,2),

    gia_ban NUMERIC(15,2),

    ton_toi_thieu INT DEFAULT 0,

    ton_an_toan INT DEFAULT 0,

    trang_thai VARCHAR(20) DEFAULT 'ACTIVE'
);


-- =========================================================
-- 4. TỒN KHO TỔNG HỢP
-- =========================================================
-- Tổng hợp tồn kho từ các node:
--   NODE_HN
--   NODE_DN
--   NODE_HCM
--
-- Mỗi cặp (ma_kho, ma_sp) chỉ có một bản ghi.
-- =========================================================

CREATE TABLE IF NOT EXISTS ton_kho_central (
    ma_kho VARCHAR(10) NOT NULL,

    ma_sp VARCHAR(20) NOT NULL,

    so_luong INT NOT NULL DEFAULT 0,

    cap_nhat_luc TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Node nguồn dữ liệu
    source_node VARCHAR(50),

    PRIMARY KEY (ma_kho, ma_sp)
);


-- =========================================================
-- 5. LỊCH SỬ TỒN KHO
-- =========================================================

CREATE TABLE IF NOT EXISTS lich_su_ton_kho_central (
    id BIGSERIAL PRIMARY KEY,

    ma_kho VARCHAR(10) NOT NULL,

    ma_sp VARCHAR(20) NOT NULL,

    ngay DATE NOT NULL,

    ton_dau INT DEFAULT 0,

    nhap INT DEFAULT 0,

    xuat INT DEFAULT 0,

    dieu_chuyen_vao INT DEFAULT 0,

    dieu_chuyen_ra INT DEFAULT 0,

    ton_cuoi INT DEFAULT 0,

    source_node VARCHAR(50),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 6. BÁN HÀNG TỔNG HỢP
-- =========================================================

CREATE TABLE IF NOT EXISTS ban_hang_central (
    id BIGSERIAL PRIMARY KEY,

    ma_phieu_xuat VARCHAR(20),

    ma_kho VARCHAR(10),

    ma_sp VARCHAR(20),

    ngay_ban TIMESTAMP,

    so_luong INT,

    don_gia NUMERIC(15,2),

    thanh_tien NUMERIC(18,2),

    source_node VARCHAR(50),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 7. NHẬP HÀNG TỔNG HỢP
-- =========================================================

CREATE TABLE IF NOT EXISTS nhap_hang_central (
    id BIGSERIAL PRIMARY KEY,

    ma_phieu_nhap VARCHAR(20),

    ma_kho VARCHAR(10),

    ma_sp VARCHAR(20),

    ngay_nhap TIMESTAMP,

    so_luong INT,

    don_gia NUMERIC(15,2),

    thanh_tien NUMERIC(18,2),

    source_node VARCHAR(50),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 8. ĐIỀU CHUYỂN TỔNG HỢP
-- =========================================================

CREATE TABLE IF NOT EXISTS dieu_chuyen_central (
    id BIGSERIAL PRIMARY KEY,

    ma_phieu_dc VARCHAR(20) UNIQUE,

    kho_xuat VARCHAR(10),

    kho_nhap VARCHAR(10),

    ma_sp VARCHAR(20),

    so_luong INT,

    ngay_dieu_chuyen TIMESTAMP,

    trang_thai VARCHAR(30),

    source_node VARCHAR(50),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 9. TRẠNG THÁI NODE
-- =========================================================
-- Bảng này CHỈ tồn tại tại Central.
--
-- Dùng để theo dõi:
--   NODE_HN
--   NODE_DN
--   NODE_HCM
-- =========================================================

CREATE TABLE IF NOT EXISTS node_status (
    node_name VARCHAR(50) PRIMARY KEY,

    ma_kho VARCHAR(10),

    host VARCHAR(100),

    port INT,

    status VARCHAR(20),

    last_check TIMESTAMP,

    last_sync TIMESTAMP,

    error_message TEXT
);


-- =========================================================
-- 10. LỊCH SỬ ĐỒNG BỘ
-- =========================================================
-- Bảng này CHỈ tồn tại tại Central.
--
-- Không tạo sync_log ở các node nghiệp vụ.
--
-- Cấu trúc phải khớp với sync_service.py:
--   node_name
--   sync_type
--   started_at
--   finished_at
--   records_processed
--   records_success
--   records_failed
--   status
--   error_message
-- =========================================================

CREATE TABLE IF NOT EXISTS sync_log (
    id BIGSERIAL PRIMARY KEY,

    node_name VARCHAR(50) NOT NULL,

    sync_type VARCHAR(30),

    started_at TIMESTAMP,

    finished_at TIMESTAMP,

    records_processed INT DEFAULT 0,

    records_success INT DEFAULT 0,

    records_failed INT DEFAULT 0,

    status VARCHAR(20),

    error_message TEXT
);


-- =========================================================
-- 11. KẾT QUẢ DỰ BÁO NHU CẦU
-- =========================================================
-- Dữ liệu được tạo bởi Data Mining / Machine Learning.
-- =========================================================

CREATE TABLE IF NOT EXISTS demand_forecast (
    id BIGSERIAL PRIMARY KEY,

    ma_kho VARCHAR(10),

    ma_sp VARCHAR(20),

    forecast_date DATE,

    predicted_quantity NUMERIC(15,2),

    model_name VARCHAR(100),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 12. ĐỀ XUẤT ĐIỀU CHUYỂN
-- =========================================================
-- Kết quả phân tích tồn kho + dự báo nhu cầu.
-- =========================================================

CREATE TABLE IF NOT EXISTS transfer_recommendation (
    id BIGSERIAL PRIMARY KEY,

    ma_sp VARCHAR(20),

    kho_xuat VARCHAR(10),

    kho_nhap VARCHAR(10),

    current_quantity_source INT,

    current_quantity_destination INT,

    predicted_demand_destination NUMERIC(15,2),

    recommended_quantity INT,

    reason TEXT,

    model_name VARCHAR(100),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    status VARCHAR(30) DEFAULT 'PENDING'
);