-- =========================================================
-- NODE HN
-- INDEX
-- =========================================================

CREATE INDEX idx_hn_san_pham_nhom
ON san_pham(ma_nhom);

CREATE INDEX idx_hn_phieu_nhap_kho
ON phieu_nhap(ma_kho);

CREATE INDEX idx_hn_phieu_nhap_ngay
ON phieu_nhap(ngay_nhap);

CREATE INDEX idx_hn_phieu_xuat_kho
ON phieu_xuat(ma_kho);

CREATE INDEX idx_hn_phieu_xuat_ngay
ON phieu_xuat(ngay_xuat);

CREATE INDEX idx_hn_ton_kho_sp
ON ton_kho(ma_sp);

CREATE INDEX idx_hn_lich_su_ngay
ON lich_su_ton_kho(ngay);

CREATE INDEX idx_hn_lich_su_sp
ON lich_su_ton_kho(ma_sp);