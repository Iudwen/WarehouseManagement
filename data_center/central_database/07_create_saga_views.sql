-- =========================================================
-- CENTRAL DATABASE
-- 07_create_saga_views.sql
-- =========================================================
--
-- Các view này phụ thuộc vào các object được tạo bởi:
-- 06_create_saga_monitoring.sql
--
-- Không chạy các view này trước file 06.
-- =========================================================

-- 16. DASHBOARD - SAGA MONITORING
-- =========================================================

CREATE OR REPLACE VIEW v_dashboard_saga_monitoring AS
SELECT
    sm.id,
    sm.saga_id,
    sm.ma_giao_dich_global,
    sm.ma_phieu_dc,

    sm.kho_xuat,
    kx.ten_kho AS ten_kho_xuat,

    sm.kho_nhap,
    kn.ten_kho AS ten_kho_nhap,

    sm.ma_sp,
    sp.ten_sp,

    sm.so_luong_yeu_cau,
    sm.so_luong_da_xuat,
    sm.so_luong_thuc_nhan,
    sm.so_luong_chenh_lech,

    sm.current_state,
    sm.status,

    sm.source_node,
    sm.destination_node,

    sm.last_event_type,
    sm.last_event_at,

    sm.source_confirm_deadline,
    sm.ship_deadline,
    sm.receive_deadline,

    sm.created_at,
    sm.updated_at,
    sm.error_message

FROM saga_monitoring sm

LEFT JOIN kho kx
    ON sm.kho_xuat = kx.ma_kho

LEFT JOIN kho kn
    ON sm.kho_nhap = kn.ma_kho

LEFT JOIN san_pham sp
    ON sm.ma_sp = sp.ma_sp;


-- =========================================================

-- 17. DASHBOARD - VIRTUAL WAREHOUSE
-- =========================================================

CREATE OR REPLACE VIEW v_dashboard_virtual_warehouse AS
SELECT
    vw.vwh_id,
    vw.saga_id,
    vw.ma_phieu_dc,
    vw.ma_sp,
    sp.ten_sp,
    vw.kho_xuat,
    vw.kho_nhap,
    vw.so_luong_xuat,
    vw.so_luong_da_nhan,
    vw.so_luong_dang_van_chuyen,
    vw.trang_thai,
    vw.created_at,
    vw.updated_at,
    vw.received_at
FROM vwh_transfer vw
LEFT JOIN san_pham sp
    ON vw.ma_sp = sp.ma_sp;


-- =========================================================

-- 18. DASHBOARD - CHÊNH LỆCH ĐIỀU CHUYỂN
-- =========================================================

CREATE OR REPLACE VIEW v_dashboard_transfer_discrepancy AS
SELECT
    td.discrepancy_id,
    td.saga_id,
    td.ma_phieu_dc,
    td.ma_sp,
    sp.ten_sp,
    td.kho_xuat,
    td.kho_nhap,
    td.so_luong_xuat,
    td.so_luong_thuc_nhan,
    td.so_luong_chenh_lech,
    td.ly_do,
    td.huong_xu_ly,
    td.trang_thai,
    td.created_at,
    td.resolved_at,
    td.resolved_by,
    td.resolution_note
FROM transfer_discrepancy td
LEFT JOIN san_pham sp
    ON td.ma_sp = sp.ma_sp;


-- =========================================================

-- 20. DASHBOARD - KPI TỔNG QUAN
-- =========================================================

CREATE OR REPLACE VIEW v_dashboard_kpi AS
SELECT

    (
        SELECT COUNT(*)
        FROM kho
    ) AS tong_so_kho,

    (
        SELECT COUNT(*)
        FROM san_pham
    ) AS tong_so_san_pham,

    (
        SELECT COALESCE(SUM(so_luong), 0)
        FROM ton_kho_central
    ) AS tong_so_luong_ton,

    (
        SELECT COALESCE(SUM(so_luong), 0)
        FROM nhap_hang_central
    ) AS tong_so_luong_nhap,

    (
        SELECT COALESCE(SUM(so_luong), 0)
        FROM xuat_hang_central
    ) AS tong_so_luong_xuat,

    (
        SELECT COUNT(*)
        FROM node_status
        WHERE status = 'ONLINE'
    ) AS so_node_online,

    (
        SELECT COUNT(*)
        FROM node_status
        WHERE status = 'OFFLINE'
    ) AS so_node_offline,

    (
        SELECT COUNT(*)
        FROM transfer_recommendation
    ) AS tong_khuyen_nghi_dieu_chuyen,

    (
        SELECT COUNT(*)
        FROM transfer_recommendation
        WHERE status = 'APPROVED'
    ) AS so_khuyen_nghi_da_duyet,

    (
        SELECT COUNT(*)
        FROM transfer_discrepancy
        WHERE trang_thai <> 'RESOLVED'
    ) AS so_chenh_lech_chua_xu_ly,

    (
        SELECT COUNT(*)
        FROM saga_transaction
        WHERE status <> 'SUCCESS'
    ) AS so_saga_chua_hoan_tat,

    (
        SELECT COUNT(*)
        FROM nguoi_dung
        WHERE trang_thai = 'ACTIVE'
    ) AS so_nguoi_dung_active;


-- =========================================================
