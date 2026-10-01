-- =========================================================
-- CENTRAL DATABASE
-- 07_seed_data.sql
-- =========================================================
-- Seed data cho CENTRAL.
--
-- Mục đích:
--   1. Tạo dữ liệu KHO dùng chung tại CENTRAL
--   2. Tạo tài khoản mẫu theo 5 role hệ thống
--   3. Tạo dữ liệu mẫu cho Data Mining / điều chuyển nếu cần
--
-- KHÔNG seed tại đây:
--   - TON_KHO của NODE
--   - PHIEU_NHAP / PHIEU_XUAT của NODE
--   - STOCK_LEDGER của NODE
--   - LICH_SU_TON_KHO của NODE
--
-- Các dữ liệu nghiệp vụ trên được tạo bởi seed_nodes.py
-- và đồng bộ về CENTRAL bằng sync_service.
--
-- LƯU Ý:
--   Mật khẩu dưới đây chỉ phục vụ môi trường demo/test.
--   Backend thực tế phải lưu password dạng hash.
-- =========================================================

BEGIN;


-- =========================================================
-- 1. KHO TẠI CENTRAL
-- =========================================================

INSERT INTO kho (
    ma_kho,
    ten_kho,
    dia_chi,
    thanh_pho,
    node_name,
    node_host,
    node_port,
    trang_thai,
    dong_bo_luc
)
VALUES
(
    'HN01',
    'Kho Hà Nội',
    'Hà Nội',
    'Hà Nội',
    'NODE_HN',
    'postgres_hn',
    5432,
    'ONLINE',
    CURRENT_TIMESTAMP
),
(
    'DN01',
    'Kho Đà Nẵng',
    'Đà Nẵng',
    'Đà Nẵng',
    'NODE_DN',
    'postgres_dn',
    5432,
    'ONLINE',
    CURRENT_TIMESTAMP
),
(
    'HCM01',
    'Kho Hồ Chí Minh',
    'TP. Hồ Chí Minh',
    'Hồ Chí Minh',
    'NODE_HCM',
    'postgres_hcm',
    5432,
    'ONLINE',
    CURRENT_TIMESTAMP
),
(
    'TRANSIT',
    'Kho hàng đang vận chuyển',
    NULL,
    NULL,
    'CENTRAL',
    NULL,
    NULL,
    'ONLINE',
    CURRENT_TIMESTAMP
)
ON CONFLICT (ma_kho)
DO UPDATE SET
    ten_kho = EXCLUDED.ten_kho,
    dia_chi = EXCLUDED.dia_chi,
    thanh_pho = EXCLUDED.thanh_pho,
    node_name = EXCLUDED.node_name,
    node_host = EXCLUDED.node_host,
    node_port = EXCLUDED.node_port,
    trang_thai = EXCLUDED.trang_thai,
    dong_bo_luc = EXCLUDED.dong_bo_luc;


-- =========================================================
-- 2. NGƯỜI DÙNG / ROLE
-- =========================================================
--
-- ADMIN
-- QUAN_LY_KHO
-- NHAN_VIEN_KHO
-- DIEU_PHOI
-- DATA_ANALYST
--
-- QUAN_LY_KHO và NHAN_VIEN_KHO phải gắn với kho.
-- Các role còn lại không gắn với kho.
-- =========================================================

INSERT INTO nguoi_dung (
    ten_dang_nhap,
    mat_khau,
    ho_ten,
    email,
    so_dien_thoai,
    vai_tro,
    ma_kho,
    trang_thai
)
VALUES
(
    'admin',
    'admin123',
    'Quản trị hệ thống',
    'admin@warehouse.local',
    '0900000001',
    'ADMIN',
    NULL,
    'ACTIVE'
),
(
    'ql_hn',
    'ql123',
    'Quản lý kho Hà Nội',
    'ql.hn@warehouse.local',
    '0900000002',
    'QUAN_LY_KHO',
    'HN01',
    'ACTIVE'
),
(
    'nv_hn',
    'nv123',
    'Nhân viên kho Hà Nội',
    'nv.hn@warehouse.local',
    '0900000003',
    'NHAN_VIEN_KHO',
    'HN01',
    'ACTIVE'
),
(
    'dieu_phoi',
    'dieuphoi123',
    'Nhân viên điều phối',
    'dieuphoi@warehouse.local',
    '0900000004',
    'DIEU_PHOI',
    NULL,
    'ACTIVE'
),
(
    'data_analyst',
    'analyst123',
    'Chuyên viên phân tích dữ liệu',
    'analyst@warehouse.local',
    '0900000005',
    'DATA_ANALYST',
    NULL,
    'ACTIVE'
)
ON CONFLICT (ten_dang_nhap)
DO UPDATE SET
    ho_ten = EXCLUDED.ho_ten,
    email = EXCLUDED.email,
    so_dien_thoai = EXCLUDED.so_dien_thoai,
    vai_tro = EXCLUDED.vai_tro,
    ma_kho = EXCLUDED.ma_kho,
    trang_thai = EXCLUDED.trang_thai,
    updated_at = CURRENT_TIMESTAMP;


-- =========================================================
-- 3. KIỂM TRA SEED CENTRAL
-- =========================================================

DO $$
DECLARE
    v_count_kho INTEGER;
    v_count_user INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_count_kho
    FROM kho
    WHERE ma_kho IN ('HN01', 'DN01', 'HCM01', 'TRANSIT');

    SELECT COUNT(*)
    INTO v_count_user
    FROM nguoi_dung
    WHERE ten_dang_nhap IN (
        'admin',
        'ql_hn',
        'nv_hn',
        'dieu_phoi',
        'data_analyst'
    );

    RAISE NOTICE 'CENTRAL SEED: % kho', v_count_kho;
    RAISE NOTICE 'CENTRAL SEED: % tai khoan', v_count_user;
END $$;

COMMIT;


-- =========================================================
-- 4. KIỂM TRA SAU KHI SEED
-- =========================================================

-- SELECT
--     ma_kho,
--     ten_kho,
--     node_name,
--     node_host,
--     node_port,
--     trang_thai
-- FROM kho
-- ORDER BY ma_kho;

-- SELECT
--     ma_nguoi_dung,
--     ten_dang_nhap,
--     ho_ten,
--     vai_tro,
--     ma_kho,
--     trang_thai
-- FROM nguoi_dung
-- ORDER BY ma_nguoi_dung;
