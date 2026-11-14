-- =========================================================
-- NODE HN
-- CÁC BẢNG DÙNG CHUNG
-- =========================================================

CREATE TABLE IF NOT EXISTS kho (
    ma_kho VARCHAR(10) PRIMARY KEY,
    ten_kho VARCHAR(100) NOT NULL,
    dia_chi VARCHAR(255),
    thanh_pho VARCHAR(100),
    trang_thai VARCHAR(20) DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS nhom_san_pham (
    ma_nhom VARCHAR(10) PRIMARY KEY,
    ten_nhom VARCHAR(100) NOT NULL
);

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

CREATE TABLE IF NOT EXISTS nha_cung_cap (
    ma_ncc VARCHAR(20) PRIMARY KEY,
    ten_ncc VARCHAR(150) NOT NULL,
    so_dien_thoai VARCHAR(20),
    email VARCHAR(100),
    dia_chi VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS khach_hang (
    ma_kh VARCHAR(20) PRIMARY KEY,
    ten_kh VARCHAR(150) NOT NULL,
    so_dien_thoai VARCHAR(20),
    email VARCHAR(100),
    dia_chi VARCHAR(255)
);