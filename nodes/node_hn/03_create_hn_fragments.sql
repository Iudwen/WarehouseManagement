-- =========================================================
-- NODE HN
-- CÁC MẢNH DỮ LIỆU CỦA HÀ NỘI
-- =========================================================

CREATE TABLE IF NOT EXISTS phieu_nhap (
    ma_phieu_nhap VARCHAR(20) PRIMARY KEY,
    ma_kho VARCHAR(10) NOT NULL,
    ma_ncc VARCHAR(20),
    ngay_nhap TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    trang_thai VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS ct_phieu_nhap (
    ma_phieu_nhap VARCHAR(20),
    ma_sp VARCHAR(20),
    so_luong INT NOT NULL CHECK (so_luong > 0),
    don_gia NUMERIC(15,2) NOT NULL,
    PRIMARY KEY (ma_phieu_nhap, ma_sp)
);

CREATE TABLE IF NOT EXISTS phieu_xuat (
    ma_phieu_xuat VARCHAR(20) PRIMARY KEY,
    ma_kho VARCHAR(10) NOT NULL,
    ma_kh VARCHAR(20),
    ngay_xuat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    trang_thai VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS ct_phieu_xuat (
    ma_phieu_xuat VARCHAR(20),
    ma_sp VARCHAR(20),
    so_luong INT NOT NULL CHECK (so_luong > 0),
    don_gia NUMERIC(15,2) NOT NULL,
    PRIMARY KEY (ma_phieu_xuat, ma_sp)
);

CREATE TABLE IF NOT EXISTS ton_kho (
    ma_kho VARCHAR(10),
    ma_sp VARCHAR(20),
    so_luong INT NOT NULL DEFAULT 0 CHECK (so_luong >= 0),
    cap_nhat_luc TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ma_kho, ma_sp)
);

CREATE TABLE IF NOT EXISTS phieu_dieu_chuyen (
    ma_phieu_dc VARCHAR(20) PRIMARY KEY,
    kho_xuat VARCHAR(10) NOT NULL,
    kho_nhap VARCHAR(10) NOT NULL,
    ngay_dieu_chuyen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    trang_thai VARCHAR(30) DEFAULT 'CHO_DUYET',
    CHECK (kho_xuat <> kho_nhap)
);

CREATE TABLE IF NOT EXISTS ct_dieu_chuyen (
    ma_phieu_dc VARCHAR(20),
    ma_sp VARCHAR(20),
    so_luong INT NOT NULL CHECK (so_luong > 0),
    PRIMARY KEY (ma_phieu_dc, ma_sp)
);

CREATE TABLE IF NOT EXISTS lich_su_ton_kho (
    id BIGSERIAL PRIMARY KEY,
    ma_kho VARCHAR(10) NOT NULL,
    ma_sp VARCHAR(20) NOT NULL,
    ngay DATE NOT NULL,
    ton_dau INT DEFAULT 0,
    nhap INT DEFAULT 0,
    xuat INT DEFAULT 0,
    dieu_chuyen_vao INT DEFAULT 0,
    dieu_chuyen_ra INT DEFAULT 0,
    ton_cuoi INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS nguoi_dung (
    ma_nguoi_dung VARCHAR(20) PRIMARY KEY,
    ma_kho VARCHAR(10),
    ho_ten VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    mat_khau VARCHAR(255) NOT NULL,
    vai_tro VARCHAR(30),
    trang_thai VARCHAR(20) DEFAULT 'ACTIVE'
);