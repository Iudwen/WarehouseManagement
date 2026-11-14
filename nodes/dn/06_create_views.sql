CREATE OR REPLACE VIEW vw_ton_kho_dn AS
SELECT
    tk.ma_kho,
    k.ten_kho,
    tk.ma_sp,
    sp.ten_sp,
    tk.so_luong,
    sp.ton_toi_thieu,
    sp.ton_an_toan,
    tk.cap_nhat_luc
FROM ton_kho tk
JOIN kho k
    ON tk.ma_kho = k.ma_kho
JOIN san_pham sp
    ON tk.ma_sp = sp.ma_sp
WHERE tk.ma_kho = 'DN01';


CREATE OR REPLACE VIEW vw_nhap_xuat_dn AS
SELECT
    'NHAP' AS loai_giao_dich,
    pn.ma_phieu_nhap AS ma_phieu,
    pn.ma_kho,
    ctpn.ma_sp,
    ctpn.so_luong,
    pn.ngay_nhap AS thoi_gian
FROM phieu_nhap pn
JOIN ct_phieu_nhap ctpn
    ON pn.ma_phieu_nhap = ctpn.ma_phieu_nhap

UNION ALL

SELECT
    'XUAT',
    px.ma_phieu_xuat,
    px.ma_kho,
    ctpx.ma_sp,
    ctpx.so_luong,
    px.ngay_xuat
FROM phieu_xuat px
JOIN ct_phieu_xuat ctpx
    ON px.ma_phieu_xuat = ctpx.ma_phieu_xuat;