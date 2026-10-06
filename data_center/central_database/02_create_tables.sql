-- =========================================================
-- CENTRAL DATABASE
-- 02_create_tables.sql
-- =========================================================
--
-- Mục đích:
--   - Lưu dữ liệu tổng hợp từ các node HN / ĐN / HCM
--   - Quản lý tài khoản và phân quyền tập trung
--   - Theo dõi trạng thái các node
--   - Lưu lịch sử đồng bộ
--   - Lưu kết quả dự báo và đề xuất điều chuyển
--   - Quản lý điều chuyển liên chi nhánh
--   - Quản lý kho ảo TRANSIT tại CENTRAL
--
-- =========================================================
-- ROLE HỆ THỐNG
-- =========================================================
--
--   ADMIN
--       Quản trị toàn bộ hệ thống.
--
--   QUAN_LY_KHO
--       Quản lý nghiệp vụ của kho được phân công.
--
--   NHAN_VIEN_KHO
--       Thực hiện nghiệp vụ nhập, xuất, kiểm kê, nhận hàng.
--
--   DIEU_PHOI
--       Điều phối và theo dõi điều chuyển giữa các kho.
--
--   DATA_ANALYST
--       Phân tích dữ liệu, dự báo và đề xuất điều chuyển.
--
-- =========================================================
-- LƯU Ý
-- =========================================================
--
--   - NGUOI_DUNG chỉ tồn tại tại CENTRAL.
--   - Không tạo NGUOI_DUNG riêng tại các NODE.
--   - Tài khoản được quản lý tập trung tại CENTRAL.
--   - QUAN_LY_KHO và NHAN_VIEN_KHO phải gắn với một kho.
--   - ADMIN / DIEU_PHOI / DATA_ANALYST không gắn với kho.
--
--   - sync_log CHỈ tồn tại tại CENTRAL.
--   - node HN / ĐN / HCM chỉ chứa dữ liệu nghiệp vụ.
--   - TRANSIT là kho ảo thuộc CENTRAL.
--   - Không tạo TRANSIT tại các node.
--   - Không tạo FK xuyên database.
--
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

    -- Thông tin kết nối tới node
    node_host VARCHAR(100),

    node_port INT,

    -- Trạng thái kho
    trang_thai VARCHAR(20) DEFAULT 'ACTIVE',

    -- Thời điểm dữ liệu kho được đồng bộ gần nhất
    dong_bo_luc TIMESTAMP
);


-- =========================================================
-- 2. NGƯỜI DÙNG
-- =========================================================
--
-- Quản lý tập trung tại CENTRAL.
--
-- Role:
--   ADMIN
--   QUAN_LY_KHO
--   NHAN_VIEN_KHO
--   DIEU_PHOI
--   DATA_ANALYST
--
-- Quy tắc ma_kho:
--
--   ADMIN
--       -> ma_kho = NULL
--
--   QUAN_LY_KHO
--       -> phải có ma_kho
--
--   NHAN_VIEN_KHO
--       -> phải có ma_kho
--
--   DIEU_PHOI
--       -> ma_kho = NULL
--
--   DATA_ANALYST
--       -> ma_kho = NULL
--
-- =========================================================

CREATE TABLE IF NOT EXISTS nguoi_dung (
    ma_nguoi_dung BIGSERIAL PRIMARY KEY,

    -- Tên đăng nhập
    ten_dang_nhap VARCHAR(50) NOT NULL UNIQUE,

    -- Mật khẩu đã được hash
    mat_khau VARCHAR(255) NOT NULL,

    -- Họ và tên
    ho_ten VARCHAR(100) NOT NULL,

    -- Email
    email VARCHAR(100),

    -- Số điện thoại
    so_dien_thoai VARCHAR(20),

    -- Vai trò người dùng
    vai_tro VARCHAR(30) NOT NULL,

    -- Kho phụ trách
    -- NULL đối với ADMIN / DIEU_PHOI / DATA_ANALYST
    ma_kho VARCHAR(10),

    -- Trạng thái tài khoản
    trang_thai VARCHAR(20) NOT NULL
        DEFAULT 'ACTIVE',

    created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,


    -- =====================================================
    -- CONSTRAINT - VAI TRÒ
    -- =====================================================

    CONSTRAINT chk_nguoi_dung_vai_tro
        CHECK (
            vai_tro IN (
                'ADMIN',
                'QUAN_LY_KHO',
                'NHAN_VIEN_KHO',
                'DIEU_PHOI',
                'DATA_ANALYST'
            )
        ),


    -- =====================================================
    -- CONSTRAINT - TRẠNG THÁI
    -- =====================================================

    CONSTRAINT chk_nguoi_dung_trang_thai
        CHECK (
            trang_thai IN (
                'ACTIVE',
                'LOCKED',
                'INACTIVE'
            )
        ),


    -- =====================================================
    -- CONSTRAINT - ROLE VÀ KHO
    -- =====================================================

    CONSTRAINT chk_nguoi_dung_role_kho
        CHECK (
            (
                vai_tro IN (
                    'QUAN_LY_KHO',
                    'NHAN_VIEN_KHO'
                )
                AND ma_kho IS NOT NULL
            )
            OR
            (
                vai_tro IN (
                    'ADMIN',
                    'DIEU_PHOI',
                    'DATA_ANALYST'
                )
                AND ma_kho IS NULL
            )
        ),


    -- =====================================================
    -- FOREIGN KEY
    -- =====================================================

    CONSTRAINT fk_nguoi_dung_kho
        FOREIGN KEY (ma_kho)
        REFERENCES kho(ma_kho)
);


-- =========================================================
-- INDEX - NGƯỜI DÙNG
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_nguoi_dung_vai_tro
ON nguoi_dung(vai_tro);

CREATE INDEX IF NOT EXISTS idx_nguoi_dung_ma_kho
ON nguoi_dung(ma_kho);

CREATE INDEX IF NOT EXISTS idx_nguoi_dung_trang_thai
ON nguoi_dung(trang_thai);


-- =========================================================
-- 3. NHÓM SẢN PHẨM
-- =========================================================

CREATE TABLE IF NOT EXISTS nhom_san_pham (
    ma_nhom VARCHAR(10) PRIMARY KEY,

    ten_nhom VARCHAR(100) NOT NULL
);


-- =========================================================
-- 4. SẢN PHẨM
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
-- 5. TỒN KHO TỔNG HỢP
-- =========================================================
--
-- Tổng hợp tồn kho từ:
--   NODE_HN
--   NODE_DN
--   NODE_HCM
--
-- Mỗi cặp (ma_kho, ma_sp) chỉ có một bản ghi.
--
-- CENTRAL chỉ lưu dữ liệu tổng hợp.
-- Không trực tiếp thay đổi TON_KHO tại NODE.
--
-- =========================================================

CREATE TABLE IF NOT EXISTS ton_kho_central (
    ma_kho VARCHAR(10) NOT NULL,

    ma_sp VARCHAR(20) NOT NULL,

    so_luong INT NOT NULL DEFAULT 0,

    cap_nhat_luc TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,

    -- Node nguồn dữ liệu
    source_node VARCHAR(50),

    PRIMARY KEY (ma_kho, ma_sp)
);


-- =========================================================
-- 6. LỊCH SỬ TỒN KHO
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

    created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 7. XUẤT HÀNG TỔNG HỢP
-- =========================================================

CREATE TABLE IF NOT EXISTS xuat_hang_central (
    id BIGSERIAL PRIMARY KEY,

    ma_phieu_xuat VARCHAR(20),

    ma_kho VARCHAR(10),

    ma_sp VARCHAR(20),

    ngay_xuat TIMESTAMP,

    so_luong INT,

    don_gia NUMERIC(15,2),

    thanh_tien NUMERIC(18,2),

    source_node VARCHAR(50),

    created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
);

-- UNIQUE KEY phục vụ đồng bộ dữ liệu xuất hàng
CREATE UNIQUE INDEX IF NOT EXISTS uq_xuat_hang_central_key
ON xuat_hang_central(
    ma_phieu_xuat,
    ma_kho,
    ma_sp,
    source_node
);

-- =========================================================
-- 8. NHẬP HÀNG TỔNG HỢP
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

    created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 9. ĐIỀU CHUYỂN TỔNG HỢP
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

    created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 10. TRẠNG THÁI NODE
-- =========================================================
--
-- Bảng này CHỈ tồn tại tại CENTRAL.
--
-- Theo dõi:
--   NODE_HN
--   NODE_DN
--   NODE_HCM
--
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
-- 11. LỊCH SỬ ĐỒNG BỘ
-- =========================================================
--
-- Bảng này CHỈ tồn tại tại CENTRAL.
--
-- Cấu trúc khớp với sync_service.py:
--
--   node_name
--   sync_type
--   started_at
--   finished_at
--   records_processed
--   records_success
--   records_failed
--   status
--   error_message
--
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
-- 12. KẾT QUẢ DỰ BÁO NHU CẦU
-- =========================================================
--
-- Dữ liệu được tạo bởi Data Mining / Machine Learning.
--
-- =========================================================

CREATE TABLE IF NOT EXISTS demand_forecast (
    id BIGSERIAL PRIMARY KEY,

    ma_kho VARCHAR(10),

    ma_sp VARCHAR(20),

    forecast_date DATE,

    predicted_quantity NUMERIC(15,2),

    model_name VARCHAR(100),

    created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 13. ĐỀ XUẤT ĐIỀU CHUYỂN
-- =========================================================
--
-- Kết quả phân tích tồn kho + dự báo nhu cầu.
--
-- Data Analyst / Data Mining tạo đề xuất.
-- Quản lý / Admin phê duyệt.
-- Sau khi phê duyệt mới tạo phiếu điều chuyển chính thức.
--
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

    created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,

    status VARCHAR(30)
        DEFAULT 'PENDING'
);


-- =========================================================
-- 14. KHO TRANSIT
-- =========================================================
--
-- TRANSIT là kho ảo dùng để biểu diễn hàng đang vận chuyển
-- giữa các node.
--
-- TRANSIT thuộc CENTRAL.
--
-- Không tạo TRANSIT tại:
--   NODE_HN
--   NODE_DN
--   NODE_HCM
--
-- ON CONFLICT xử lý:
--   1. Database mới chưa có TRANSIT
--   2. Database cũ đã có TRANSIT nhưng thông tin sai
--
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
VALUES (
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
    ten_kho = 'Kho hàng đang vận chuyển',
    node_name = 'CENTRAL',
    node_host = NULL,
    node_port = NULL,
    trang_thai = 'ONLINE',
    dong_bo_luc = CURRENT_TIMESTAMP;

-- ============================================================
-- PROCESSED_EVENT
-- Theo dõi các event CDC đã được xử lý tại CENTRAL
-- Phục vụ Debezium / Kafka / ETL
-- ============================================================

CREATE TABLE IF NOT EXISTS processed_event (

    event_id UUID PRIMARY KEY,

    source_node VARCHAR(50) NOT NULL,

    event_type VARCHAR(100) NOT NULL,

    processed_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    status VARCHAR(20) NOT NULL
        DEFAULT 'SUCCESS',

    error_message TEXT,

    CONSTRAINT chk_processed_event_status
        CHECK (
            status IN (
                'SUCCESS',
                'FAILED'
            )
        )
);

CREATE INDEX IF NOT EXISTS idx_processed_event_source
ON processed_event(source_node);

CREATE INDEX IF NOT EXISTS idx_processed_event_type
ON processed_event(event_type);

CREATE INDEX IF NOT EXISTS idx_processed_event_processed_at
ON processed_event(processed_at);

CREATE INDEX IF NOT EXISTS idx_processed_event_status
ON processed_event(status);
-- =========================================================
-- 15. DỮ LIỆU KHO MẶC ĐỊNH
-- =========================================================
--
-- Phần này có thể dùng khi CENTRAL được khởi tạo mới.
--
-- Nếu dữ liệu KHO đã được sync từ các NODE thì có thể bỏ qua.
--
-- =========================================================

-- Ví dụ:
--
-- INSERT INTO kho (...)
-- VALUES (...);


-- =========================================================
-- KẾT THÚC 02_create_tables.sql
-- =========================================================