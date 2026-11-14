# KIẾN TRÚC HỆ THỐNG VÀ CÁC LUỒNG NGHIỆP VỤ THỰC TẾ

> **Tài liệu:** Bóc tách chuyên sâu kiến trúc phân tán, giao dịch Saga, luồng ETL Data Lake và Data Mining  
> **Dự án:** WarehouseManagement  
> **Vị trí file:** `presentation_materials/03_architecture_and_flows.md`  

---

## 1. Kiến trúc Hệ thống Phân tán Thực tế

Hệ thống được thiết kế theo mô hình **Database-per-Node** kết hợp **Central Data Center** và **Event Store** phi cấu trúc:

```mermaid
graph TB
    subgraph ClientZone ["LỚP KHÁCH HÀNG / GIAO DIỆN (PORT 5173)"]
        SPA["Frontend SPA (React 18 + Vite + Tailwind CSS v4)"]
    end

    subgraph AppZone ["LỚP ỨNG DỤNG & ĐIỀU PHỐI (PORT 3000)"]
        API["Backend REST API Server (Node.js / Express / TypeScript)"]
        Router["Dynamic DB Selector / Role Middleware"]
        Worker["Outbox Relay Worker (Batch=10, Poll=3000ms)"]
    end

    subgraph DataZone ["LỚP CƠ SỞ DỮ LIỆU & LƯU TRỮ PHÂN TÁN"]
        subgraph BranchNodes ["CÁC NODE CHI NHÁNH ĐỘC LẬP"]
            DB_HN[("Node Hà Nội (HN01)<br/>PostgreSQL 18: 5433<br/>DB: warehouse_hn")]
            DB_DN[("Node Đà Nẵng (DN01)<br/>PostgreSQL 18: 5434<br/>DB: warehouse_dn")]
            DB_HCM[("Node TP.HCM (HCM01)<br/>PostgreSQL 18: 5435<br/>DB: warehouse_hcm")]
        end

        subgraph CentralServices ["TRUNG TÂM ĐIỀU HÀNH & KIỂM TOÁN"]
            DB_Central[("Central Database<br/>PostgreSQL 18: 5436<br/>DB: warehouse_central")]
            DB_Mongo[("Event Logging Store<br/>MongoDB 8.0: 27018<br/>DB: warehouse_events")]
        end
    end

    subgraph LakehouseZone ["LỚP DATA LAKEHOUSE & MLOPS"]
        ETL["Sync Service (Python 300s Sync)"]
        Bronze["Data Lake Bronze (CSV/JSON Raw)"]
        Silver["Data Lake Silver (11 Cleaned Tables)"]
        GoldDelta["Data Lakehouse Gold (Delta-RS ACID & Parquet)"]
        DM_Engine["Data Mining & Decision Support Engine"]
    end

    %% Tương tác giao diện
    SPA -->|RESTful API + JWT Auth| API
    API --> Router

    %% Phân phối truy vấn nghiệp vụ
    Router -->|Local Transactions| DB_HN
    Router -->|Local Transactions| DB_DN
    Router -->|Local Transactions| DB_HCM
    Router -->|Global Auth & Saga Coordination| DB_Central
    API -->|Audit Log Events| DB_Mongo

    %% Outbox Relay Worker
    DB_HN -.->|SELECT PENDING FOR UPDATE SKIP LOCKED| Worker
    DB_DN -.->|SELECT PENDING FOR UPDATE SKIP LOCKED| Worker
    DB_HCM -.->|SELECT PENDING FOR UPDATE SKIP LOCKED| Worker
    Worker -->|INSERT processed_event & Update Saga| DB_Central

    %% ETL Sync & Lakehouse
    DB_Central --> ETL
    DB_Mongo --> ETL
    ETL --> Bronze --> Silver --> GoldDelta
    GoldDelta --> DM_Engine
    DM_Engine -->|Gold Forecasts & Recommendations| DB_Central
    DM_Engine -.->|API Response Cache| API
```

### 1.1. Phân chia trách nhiệm giữa các Node
1. **Các Node Chi nhánh (`HN01`, `DN01`, `HCM01`):**
   - **Tự chủ nghiệp vụ (Local Autonomy):** Thực thi giao dịch nhập hàng, xuất hàng, kiểm kê tại chỗ mà không phụ thuộc vào tình trạng kết nối tới Central hay các node khác.
   - **Bảng dữ liệu phân mảnh:** `phieu_nhap`, `ct_phieu_nhap`, `phieu_xuat`, `ct_phieu_xuat`, `ton_kho`, `lich_su_ton_kho`.
   - **Thành phần hỗ trợ phân tán:**
     - `stock_reservation`: Khóa mềm số lượng hàng (`RESERVED`) phục vụ điều chuyển, bảo đảm không bị xuất bán mất trong khi xe chưa tới lấy hàng.
     - `outbox_event`: Bảng sự kiện cục bộ ghi nhận các thay đổi nghiệp vụ cần thông báo ra ngoài, bảo đảm giao dịch cơ sở dữ liệu và ghi log diễn ra trong cùng một ACID transaction.
2. **Central Data Center (`warehouse_central`):**
   - **Quản lý danh mục & phân quyền tập trung:** Bảng `kho`, `nguoi_dung` (5 roles: `ADMIN`, `DIEU_PHOI`, `DATA_ANALYST`, `QUAN_LY_KHO`, `NHAN_VIEN_KHO`).
   - **Kho ảo TRANSIT:** Quản lý hàng hóa đang trên đường vận chuyển giữa các tỉnh thành (`loai_kho = 'VIRTUAL'`).
   - **Saga Orchestrator & Monitoring:** Bảng `saga_transaction`, `saga_monitoring`, `vwh_transfer`, `transfer_discrepancy`.
   - **Khử trùng lặp sự kiện (Idempotency Barrier):** Bảng `processed_event` lưu vết các `event_id` đã xử lý thành công, ngăn chặn việc xử lý lặp lại khi mạng bị chập chờn hoặc worker retry.
3. **Audit Event Store (`warehouse_events` - MongoDB):**
   - Lưu trữ phi cấu trúc các sự kiện: `warehouse_events`, `inventory_events`, `outbound_events`, `transfer_events`, `system_logs`.
   - Cung cấp dữ liệu truy vết kiểm toán dòng đời hàng hóa (Traceability & Compliance).

---

## 2. Giao dịch Phân tán và Luồng Saga Điều chuyển Hàng (Distributed Saga)

### 2.1. Bản chất nghiệp vụ và Giải pháp Saga
Khi điều chuyển 15 chiếc Laptop Dell từ Đà Nẵng (`DN01`) ra TP. Hồ Chí Minh (`HCM01`), khoảng cách hơn 900 km và thời gian vận chuyển kéo dài từ 2 đến 3 ngày. Hệ thống **không thể giữ kết nối mạng mở (blocking connection)** giữa 2 database trong suốt 3 ngày.

**Giải pháp:** Áp dụng **Saga Pattern (Orchestration-based)** kết hợp **Kho ảo trung gian (`TRANSIT`)** và **Transactional Outbox Worker**.

### 2.2. Chi tiết 5 bước của luồng Saga

```mermaid
sequenceDiagram
    autonumber
    actor DP as Điều phối viên (DIEU_PHOI)
    actor QL as Quản lý kho (QUAN_LY_KHO)
    actor NV_Src as Nhân viên kho xuất (HN01/DN01)
    actor NV_Dest as Nhân viên kho nhận (HCM01)
    participant Central as Central Database (Port 5436)
    participant Outbox as Outbox Relay Worker
    participant NodeSrc as Node Nguồn (PostgreSQL)
    participant NodeDest as Node Đích (PostgreSQL)

    %% Bước 1: Khởi tạo
    DP->>Central: 1. POST /transfers (Tạo yêu cầu điều chuyển)
    Note over Central: Trạng thái: CHO_DUYET<br/>Saga State: INITIALIZED

    %% Bước 2: Duyệt
    QL->>Central: 2. POST /transfers/:id/approve (Quản lý duyệt)
    Note over Central: Trạng thái: DANG_XU_LY<br/>Saga State: WAITING_SOURCE_CONFIRMATION

    %% Bước 3: Kho nguồn xác nhận & Giữ hàng
    NV_Src->>NodeSrc: 3. POST /transfers/:id/source-confirm
    NodeSrc->>NodeSrc: Tạo stock_reservation (so_luong, 'RESERVED')
    NodeSrc->>NodeSrc: Ghi outbox_event ('TRANSFER_ACCEPTED', status='PENDING')
    Outbox->>NodeSrc: Poll outbox_event (Lease Lock, version=1)
    Outbox->>Central: Relay TRANSFER_ACCEPTED
    Central->>Central: Kiểm tra uq_processed_event, Cập nhật Saga -> SOURCE_ACCEPTED

    %% Bước 4: Kho nguồn xuất hàng vào TRANSIT
    NV_Src->>NodeSrc: 4. POST /transfers/:id/source-ship
    NodeSrc->>NodeSrc: Trừ ton_kho kho nguồn, Chuyển reservation -> 'CONSUMED'
    NodeSrc->>NodeSrc: Ghi outbox_event ('TRANSFER_SHIPPED')
    Outbox->>NodeSrc: Poll outbox_event
    Outbox->>Central: Relay TRANSFER_SHIPPED
    Central->>Central: Cập nhật Saga -> IN_TRANSIT<br/>Tăng tồn kho ảo TRANSIT tại Central

    %% Bước 5: Kho đích tiếp nhận hàng
    NV_Dest->>NodeDest: 5. POST /transfers/:id/destination-receive (Kiểm đếm thực nhận)
    NodeDest->>NodeDest: Tăng ton_kho kho đích
    NodeDest->>NodeDest: Ghi outbox_event ('TRANSFER_RECEIVED')
    Outbox->>NodeDest: Poll outbox_event
    Outbox->>Central: Relay TRANSFER_RECEIVED
    Central->>Central: Giảm tồn kho ảo TRANSIT<br/>Cập nhật Saga -> COMPLETED (Hoàn tất giao dịch)
```

### 2.3. Cơ chế Outbox Polling Relay & Kiểm soát đồng thời (OCC Fencing)

1. **Quét và Khóa hàng độc quyền (Exclusive Lease Lock):**
   - Outbox Worker sử dụng câu lệnh SQL chuẩn:
     ```sql
     SELECT event_id, aggregate_id, event_type, payload, version, retry_count
     FROM outbox_event
     WHERE status = 'PENDING' AND next_retry_at <= CURRENT_TIMESTAMP
     ORDER BY created_at ASC
     LIMIT 10
     FOR UPDATE SKIP LOCKED;
     ```
   - Cơ chế `FOR UPDATE SKIP LOCKED` giúp nhiều luồng/worker chạy song song mà không bao giờ tranh chấp hay khóa chết (deadlock) lẫn nhau.
2. **Khóa lạc quan chống Race Condition (OCC Version Check):**
   - Khi cập nhật trạng thái sự kiện sang `PROCESSED`:
     ```sql
     UPDATE outbox_event
     SET status = 'PROCESSED', version = version + 1, processed_at = CURRENT_TIMESTAMP
     WHERE event_id = $1 AND version = $2;
     ```
   - Nếu một worker khác đã can thiệp khiến `version` thay đổi, câu lệnh trả về `rowCount = 0` và tiến trình lập tức hủy bỏ lượt xử lý để bảo đảm an toàn.
3. **Khử trùng lặp Idempotent tại Central Database:**
   - Central Database lưu giữ bảng `processed_event` với khóa chính `event_id UUID`.
   - Nếu worker gửi lại một sự kiện cũ do timeout mạng, Central kích hoạt cơ chế `ON CONFLICT (event_id) DO NOTHING` hoặc trả cờ `IDEMPOTENT_IGNORED`, cam kết tuyệt đối không nhân đôi giao dịch.
4. **Cơ chế Đền bù (Compensation Logic):**
   - Nếu tại Bước 3 kho nguồn kiểm tra tồn kho thấy không đủ hàng, hệ thống phát sinh sự kiện `TRANSFER_REJECTED`.
   - Central Saga chuyển sang trạng thái `REJECTED`, tự động kích hoạt procedure hủy phiếu, không thực hiện trừ kho và thông báo lý do thiếu hàng về màn hình Điều phối viên.

---

## 3. Kiến trúc Data Lakehouse và Luồng ETL

Hệ thống triển khai mô hình **Medallion Lakehouse 3 tầng** chuẩn hóa:

```mermaid
graph LR
    subgraph DataSources ["NGUỒN DỮ LIỆU ĐẦU VÀO"]
        PG_Nodes["3 Node PostgreSQL (Giao dịch chi nhánh)"]
        Mongo_Events["MongoDB (Log kiểm toán phi cấu trúc)"]
        OpenMeteo["Open-Meteo Archive API (Thời tiết 3 miền)"]
        VN_Calendar["Lịch Việt Nam (Điều 112 Bộ luật Lao động)"]
    end

    subgraph BronzeLayer ["TẦNG BRONZE (RAW STORAGE)"]
        B_PG["CSV Snapshot từ PostgreSQL<br/>- xuat_hang_central (21,949 dòng)<br/>- nhap_hang_central (784 KB)<br/>- ton_kho_central (3.1 KB)"]
        B_MG["JSON Event Logs từ MongoDB<br/>- inventory_events.json<br/>- transfer_events.json"]
    end

    subgraph SilverLayer ["TẦNG SILVER (CLEANSED & VALIDATED)"]
        S_Clean["Làm sạch, khử trùng lặp<br/>Kiểm định Schema 11 bảng"]
        S_Quality["Báo cáo chất lượng (Quality Reports)<br/>- xuat_hang_central_report.json (0 error)<br/>- ton_kho_central_report.json (0 error)"]
    end

    subgraph GoldLayer ["TẦNG GOLD (ANALYTICAL LAKEHOUSE)"]
        G_CSV["Gold CSV chuẩn:<br/>- lich_su_xuat_hang_gold.csv (14,264 dòng)<br/>- nhu_cau_xuat_hang_daily.csv (21,960 dòng)<br/>- analytical_dataset.csv (21,960 dòng)"]
        G_Delta["Gold Delta Lakehouse (Delta-RS):<br/>- _delta_log/*.json (ACID commit)<br/>- Hỗ trợ Time Travel & Parquet columnar"]
    end

    PG_Nodes -->|Sync Service 300s| B_PG
    Mongo_Events -->|Sync Service 300s| B_MG
    B_PG --> S_Clean
    B_MG --> S_Clean
    S_Clean --> S_Quality
    S_Clean --> G_CSV
    OpenMeteo --> G_CSV
    VN_Calendar --> G_CSV
    G_CSV --> G_Delta
```

### 3.1. Đặc điểm các tầng dữ liệu thực tế
- **Tầng Bronze (Raw):** Trích xuất nguyên bản không qua chỉnh sửa cấu trúc từ Central PostgreSQL và MongoDB.
- **Tầng Silver (Cleaned):**
  - Thực thi kiểm định chất lượng nghiêm ngặt qua 11 file báo cáo độc lập (`data_center/data_lake/silver/quality_reports/`).
  - Kết quả kiểm định thực tế trên bảng quan trọng nhất `xuat_hang_central`: **21,949 dòng vào = 21,949 dòng ra; 0 dòng bị loại (rejected = 0); 0 dòng trùng lặp**.
- **Tầng Gold (Analytical & Lakehouse):**
  - Tổng hợp dữ liệu theo đơn vị chuẩn: `(ngay, ma_kho, ma_sp)`.
  - Lưu trữ đồng thời dưới dạng CSV chuẩn hóa và bảng **Delta Lakehouse (Delta-RS)** có transaction log, cho phép truy vấn Time Travel theo phiên bản `version=0`, `version=1` phục vụ kiểm toán dữ liệu lớn.

---

## 4. Pipeline Khai phá Dữ liệu & Hỗ trợ Quyết định (Data Mining & DSS)

Quy trình tự động hóa 10 bước khép kín thực thi qua `data_mining/run_pipeline.py`:

```mermaid
graph TD
    S1["Bước 1: Làm sạch & Chuẩn hóa xuất thô -> Gold<br/>(14,264 dòng hợp lệ, 0 loại)"] --> S2["Bước 2: Chuỗi thời gian & Zero-filling<br/>(Lưới 366 ngày x 3 kho x 20 SP = 21,960 dòng)"]
    
    S3["Bước 3: Thu thập Thời tiết Lịch sử Open-Meteo<br/>(1,098 bản ghi: Nhiệt độ TB, Lượng mưa)"] --> S5["Bước 5: Tích hợp Đa Nguồn Hợp nhất<br/>(Analytical Dataset: 21,960 dòng x 11 cột)"]
    S4["Bước 4: Trích xuất Lịch & 14 Ngày nghỉ lễ VN<br/>(366 ngày, Điều 112 Bộ luật Lao động)"] --> S5
    
    S2 --> S5
    
    S5 --> S6["Bước 6: Khám phá Dữ liệu Đa chiều (EDA)<br/>(Bảo toàn 341,163 sp, Pearson r = -0.0041)"]
    S5 --> S7["Bước 7: Feature Engineering & Huấn luyện ML<br/>(Lag 1, 7, Rolling 7; Train 18,600 / Test 2,940 dòng)"]
    
    S7 --> M1["Ridge Regression (MAE 13.9641 - Tốt nhất)"]
    S7 --> M2["Random Forest (MAE 13.9994)"]
    S7 --> M3["LightGBM (MAE 14.0044)"]
    S7 --> M0["Baseline Rolling Mean 7 (MAE 14.7424)"]
    
    S7 --> S8["Bước 8: Phân loại Hàng hóa ABC-XYZ<br/>(20 SP, Doanh thu 1.505 nghìn tỷ, A:6, B:5, C:9)"]
    S7 --> S9["Bước 9: Khai phá Luật kết hợp Apriori<br/>(10,952 giao dịch, 378 luật, 189 cặp picking)"]
    
    S8 --> S10["Bước 10: Đề xuất Điều chuyển Cân bằng Kho (DSS)<br/>(2 đề xuất điều phối: SP001 & SP004, trị giá 228.18 triệu)"]
    S7 --> S10
```

### 4.1. Đặc trưng đầu vào của Mô hình Machine Learning (31 Features)
1. **Đặc trưng độ trễ chuỗi thời gian (Lags):** `lag_1` (lượng xuất hôm trước), `lag_7` (lượng xuất cùng thứ tuần trước).
2. **Đặc trưng thống kê trượt (Rolling Stats):** `rolling_mean_7` (trung bình trượt 7 ngày quá khứ tính bằng `shift(1).rolling(7).mean()`).
3. **Đặc trưng ngoại sinh (Thời tiết & Lịch lễ):** `nhiet_do_tb`, `luong_mua`, `thu_trong_tuan`, `la_cuoi_tuan`, `la_ngay_le`.
4. **Biến định danh One-hot Encoding:** 3 biến kho (`ma_kho_DN01`, `ma_kho_HCM01`, `ma_kho_HN01`) và 20 biến sản phẩm (`ma_sp_SP001` đến `ma_sp_SP020`).

### 4.2. Cơ chế Hỗ trợ Quyết định (Decision Support System - DSS)
- Thuật toán Heuristic trong `transfer_recommendation.py` tính toán:
  - **Mức tồn an toàn mục tiêu:** $\text{Target Stock} = \text{Dự báo nhu cầu 14 ngày} + \text{Đệm an toàn (Safety Buffer)}$.
  - **Số ngày đáp ứng tồn kho (Days of Supply - DOS):** $\text{DOS} = \frac{\text{Tồn hiện tại}}{\text{Dự báo xuất ngày TB}}$.
  - **Ghép cặp điều chuyển:** Lấy từ kho thặng dư cao ($\text{DOS} > 30$ ngày) chuyển sang kho nguy cơ đứt hàng ($\text{DOS} < 10$ ngày), tự động làm tròn lô đóng gói 5 sản phẩm.
- **Nguyên tắc phân định ranh giới hệ thống:** DSS chỉ đóng vai trò **khuyến nghị thông minh (Advisory)** trên giao diện cho Điều phối viên xem xét, **tuyệt đối không tự động tạo phiếu điều chuyển và không tự ý thay đổi số dư tồn kho**.
