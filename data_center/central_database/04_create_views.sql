-- =========================================================
-- CENTRAL DATABASE
-- 04_create_views.sql
-- =========================================================


-- =========================================================
-- 1. TỔNG TỒN KHO TOÀN HỆ THỐNG
-- =========================================================

CREATE OR REPLACE VIEW vw_ton_kho_toan_he_thong AS

SELECT
    tk.ma_sp,

    sp.ten_sp,

    SUM(tk.so_luong) AS tong_ton_kho

FROM ton_kho_central tk

JOIN san_pham sp
    ON tk.ma_sp = sp.ma_sp

GROUP BY
    tk.ma_sp,
    sp.ten_sp;


-- =========================================================
-- 2. TỒN KHO THEO KHO
-- =========================================================

CREATE OR REPLACE VIEW vw_ton_kho_theo_kho AS

SELECT

    k.ma_kho,

    k.ten_kho,

    tk.ma_sp,

    sp.ten_sp,

    tk.so_luong,

    sp.ton_toi_thieu,

    sp.ton_an_toan,

    CASE

        WHEN tk.so_luong < sp.ton_toi_thieu
            THEN 'THIEU'

        WHEN tk.so_luong < sp.ton_an_toan
            THEN 'CAN_BO_SUNG'

        ELSE 'BINH_THUONG'

    END AS trang_thai_ton

FROM ton_kho_central tk

JOIN kho k
    ON tk.ma_kho = k.ma_kho

JOIN san_pham sp
    ON tk.ma_sp = sp.ma_sp;


-- =========================================================
-- 3. SẢN PHẨM TỒN THẤP
-- =========================================================

CREATE OR REPLACE VIEW vw_san_pham_ton_thap AS

SELECT *

FROM vw_ton_kho_theo_kho

WHERE so_luong < ton_an_toan;


-- =========================================================
-- 4. TỔNG BÁN HÀNG
-- =========================================================

CREATE OR REPLACE VIEW vw_tong_ban_hang AS

SELECT

    ma_sp,

    SUM(so_luong) AS tong_so_luong_ban,

    SUM(thanh_tien) AS tong_doanh_thu

FROM ban_hang_central

GROUP BY ma_sp;


-- =========================================================
-- 5. BÁN HÀNG THEO KHO
-- =========================================================

CREATE OR REPLACE VIEW vw_ban_hang_theo_kho AS

SELECT

    bh.ma_kho,

    k.ten_kho,

    bh.ma_sp,

    sp.ten_sp,

    SUM(bh.so_luong) AS tong_so_luong_ban,

    SUM(bh.thanh_tien) AS tong_doanh_thu

FROM ban_hang_central bh

JOIN kho k
    ON bh.ma_kho = k.ma_kho

JOIN san_pham sp
    ON bh.ma_sp = sp.ma_sp

GROUP BY

    bh.ma_kho,
    k.ten_kho,
    bh.ma_sp,
    sp.ten_sp;


-- =========================================================
-- 6. TÌNH TRẠNG NODE
-- =========================================================

CREATE OR REPLACE VIEW vw_node_status AS

SELECT

    node_name,

    ma_kho,

    status,

    last_check,

    last_sync,

    CASE

        WHEN status = 'ONLINE'
            THEN 'HOAT_DONG'

        WHEN status = 'OFFLINE'
            THEN 'MAT_KET_NOI'

        ELSE 'UNKNOWN'

    END AS trang_thai

FROM node_status;


-- =========================================================
-- 7. DỰ BÁO NHU CẦU
-- =========================================================

CREATE OR REPLACE VIEW vw_demand_forecast AS

SELECT

    df.ma_kho,

    k.ten_kho,

    df.ma_sp,

    sp.ten_sp,

    df.forecast_date,

    df.predicted_quantity,

    df.model_name

FROM demand_forecast df

JOIN kho k
    ON df.ma_kho = k.ma_kho

JOIN san_pham sp
    ON df.ma_sp = sp.ma_sp;