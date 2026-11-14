# ĐỀ XUẤT BỐ CỤC SLIDE THUYẾT TRÌNH (14 SLIDES)

> **Dự án:** WarehouseManagement — Hệ thống Quản lý Kho Đa Chi nhánh Phân tán  
> **Tài liệu:** Đề cương chi tiết từng trang slide kèm số liệu thực tế, hình ảnh minh họa và nguồn đối chiếu  
> **Vị trí file:** `presentation_materials/05_slide_outline.md`  

---

### SLIDE 1: TRANG BÌA (TITLE SLIDE)
* **Tiêu đề:** HỆ THỐNG QUẢN LÝ KHO ĐA CHI NHÁNH PHÂN TÁN TÍCH HỢP DATA LAKE, DATA MINING & HỖ TRỢ QUYẾT ĐỊNH ĐIỀU CHUYỂN
* **Tiêu đề phụ:** Distributed Warehouse Management System (Multi-node DB, Saga Transaction, Delta Lakehouse & Demand Forecasting)
* **3–5 ý chính:**
  1. Đồ án môn học: Hệ thống phân tán, Data Lake & Data Mining.
  2. Kiến trúc Multi-node Database phân mảnh theo địa lý kết hợp Trung tâm điều hành tập trung.
  3. Xử lý giao dịch liên kho tin cậy qua Saga Pattern & Outbox Polling Relay.
  4. Phân tích chuỗi thời gian, dự báo nhu cầu học máy & tối ưu cân bằng tồn kho tự động.
* **Số liệu nổi bật:** 3 Kho phân tán (HN, ĐN, HCM) • 1 Trung tâm điều hành • 21,960 bản ghi phân tích • 100% Test suite đạt chuẩn.
* **Hình ảnh/Sơ đồ:** Logo trường/khoa, ảnh mockup giao diện Dashboard Dark-Mode hiện đại.
* **Nguồn đối chiếu:** `README.md`, `package.json`.
* **Trạng thái:** `ĐÃ XÁC MINH TRỰC TIẾP`.

---

### SLIDE 2: BÀI TOÁN THỰC TẾ & MỤC TIÊU ĐỀ TÀI
* **Tiêu đề:** BÀI TOÁN THỰC TẾ TRONG QUẢN TRỊ KHO PHÂN TÁN
* **3–5 ý chính:**
  1. *Thách thức phân tán địa lý:* Doanh nghiệp vận hành 3 kho cách xa hàng trăm km (Hà Nội, Đà Nẵng, TP.HCM); cần tự chủ nhập/xuất cục bộ nhưng dữ liệu phải hợp nhất về Trung tâm.
  2. *Thách thức giao dịch liên kho:* Vận chuyển liên miền mất 2–3 ngày; không thể dùng Two-Phase Commit (2PC) do nguy cơ nghẽn mạng và khóa chết dữ liệu.
  3. *Thách thức dự báo & tồn kho:* Dữ liệu biến động lớn theo ngày nghỉ lễ và mùa vụ; nếu không có dự báo khoa học sẽ dẫn tới nơi thừa hàng - nơi đứt hàng (stockout).
  4. *Mục tiêu đề tài:* Xây dựng hệ thống toàn diện từ giao dịch phân tán đến phân tích dữ liệu lớn và khuyến nghị điều chuyển thông minh.
* **Số liệu nổi bật:** 3 chi nhánh trọng điểm • 20 danh mục sản phẩm chủ lực • Khoảng cách vận chuyển > 900 km.
* **Hình ảnh/Sơ đồ:** Bản đồ 3 cụm kho Việt Nam kết nối về Central Data Center.
* **Nguồn đối chiếu:** `presentation_materials/01_project_overview.md`.
* **Trạng thái:** `ĐÃ XÁC MINH TRỰC TIẾP`.

---

### SLIDE 3: TỔNG QUAN CHỨC NĂNG HỆ THỐNG
* **Tiêu đề:** HỆ SINH THÁI CHỨC NĂNG NGHIỆP VỤ ĐÃ TRIỂN KHAI
* **3–5 ý chính:**
  1. *Quản lý Kho cốt lõi:* Vòng đời 3 giai đoạn cho Nhập kho (`CHO_DUYET` -> `DA_DUYET` -> `DA_NHAP`/`THIEU_HANG`) và Xuất kho (`CHO_DUYET` -> `DA_DUYET` -> `DA_XUAT`).
  2. *Điều phối Liên kho (Saga):* 5 bước phối hợp kho nguồn, kho đích và kho ảo TRANSIT với cơ chế giữ hàng (`RESERVED`) và đền bù tự động.
  3. *Dashboard Thống kê Thời gian thực:* Lọc đa chiều (Ngày/Tháng/Kho), biểu đồ cột kép SVG Nhập vs Xuất, tỷ trọng chi nhánh và xuất file CSV UTF-8 BOM.
  4. *Hỗ trợ Ra quyết định (DSS):* Phân loại ABC-XYZ, gợi ý gom cụm vị trí lấy hàng (Market Basket), đề xuất điều chuyển cân bằng tồn kho.
* **Số liệu nổi bật:** 8 phân hệ API hoàn chỉnh • 5 vai trò người dùng được phân quyền chặt chẽ.
* **Hình ảnh/Sơ đồ:** Sơ đồ khối các phân hệ chức năng tương tác với Backend và Database.
* **Nguồn đối chiếu:** `backend/src/routes/`, `frontend/src/pages/`.
* **Trạng thái:** `ĐÃ XÁC MINH TRỰC TIẾP (Code & Chức năng)`.

---

### SLIDE 4: KIẾN TRÚC HỆ THỐNG PHÂN TÁN (DISTRIBUTED ARCHITECTURE)
* **Tiêu đề:** KIẾN TRÚC MULTI-NODE DATABASE & TRUNG TÂM ĐIỀU HÀNH
* **3–5 ý chính:**
  1. *Mô hình Database-per-Node:* Mỗi chi nhánh chạy PostgreSQL độc lập (HN: 5433, ĐN: 5434, HCM: 5435), bảo đảm chi nhánh vẫn bán/nhập hàng bình thường khi đứt cáp mạng.
  2. *Central Data Center (Port 5436):* Quản lý người dùng, kho ảo TRANSIT, Saga monitor và khử trùng lặp sự kiện `processed_event`.
  3. *MongoDB Event Store (Port 27018):* Lưu trữ log kiểm toán sự kiện kho phi cấu trúc phục vụ truy vết dòng đời.
  4. *Lưu ý kiến trúc:* Hệ thống giao tiếp qua Outbox Relay Worker chuyên dụng; **không sử dụng Kafka** để giữ kiến trúc tinh gọn, đúng yêu cầu bài toán.
* **Số liệu nổi bật:** 4 Database PostgreSQL (1 Central + 3 Nodes) • 1 MongoDB Cluster • 1 Outbox Worker đa luồng.
* **Hình ảnh/Sơ đồ:** Sơ đồ kiến trúc Mermaid phân tầng Client - Backend - Database phân tán (lấy từ Slide 3 trong `03_architecture_and_flows.md`).
* **Nguồn đối chiếu:** `docker-compose.yml`, `backend/src/config/postgresql.ts`.
* **Trạng thái:** `ĐÃ XÁC MINH TRỰC TIẾP`.

---

### SLIDE 5: THIẾT KẾ CƠ SỞ DỮ LIỆU & PHÂN MẢNH DỮ LIỆU
* **Tiêu đề:** MÔ HÌNH DỮ LIỆU PHÂN MẢNH THEO ĐỊA LÝ & PHÂN QUYỀN
* **3–5 ý chính:**
  1. *Phân mảnh ngang (Horizontal Fragmentation):* Các bảng nghiệp vụ phát sinh (`phieu_nhap`, `phieu_xuat`, `ton_kho`) được lưu trữ vật lý tại đúng database của chi nhánh sở hữu.
  2. *Bảng dùng chung nhân bản (Replication):* Danh mục hàng hóa (`san_pham`), nhà cung cấp, khách hàng được đồng bộ dùng chung.
  3. *Cơ chế kiểm soát phân quyền (Scoping):* Tài khoản quản lý và nhân viên bị khóa cứng phạm vi chi nhánh (`ma_kho`); chỉ Quản trị viên và Điều phối viên mới được truy xuất toàn quốc.
  4. *Cơ chế khóa mềm:* Bảng `stock_reservation` tại node giúp cô lập lượng hàng chờ điều chuyển, ngăn chặn bán âm kho.
* **Số liệu nổi bật:** 20 sản phẩm chuẩn • 3 chi nhánh • 5 vai trò hệ thống (`ADMIN`, `DIEU_PHOI`, `DATA_ANALYST`, `QUAN_LY_KHO`, `NHAN_VIEN_KHO`).
* **Hình ảnh/Sơ đồ:** Sơ đồ ERD quan hệ giữa các thực thể bảng phân mảnh và bảng Central.
* **Nguồn đối chiếu:** `nodes/node_hn/02_create_global_tables.sql`, `03_create_hn_fragments.sql`, `08_create_transaction_support.sql`.
* **Trạng thái:** `ĐÃ XÁC MINH TRỰC TIẾP`.

---

### SLIDE 6: GIAO DỊCH ĐIỀU CHUYỂN LIÊN KHO & SAGA PATTERN
* **Tiêu đề:** GIAO DỊCH PHÂN TÁN SAGA & OUTBOX RELAY WORKER
* **3–5 ý chính:**
  1. *5 Bước Saga hoàn chỉnh:* Khởi tạo (`CHO_DUYET`) -> Duyệt (`DANG_XU_LY`) -> Khóa giữ hàng kho nguồn (`RESERVED`) -> Xuất kho vào kho ảo (`IN_TRANSIT`) -> Kho đích thực nhận (`COMPLETED`).
  2. *Cơ chế Outbox Polling Relay:* Worker quét bảng `outbox_event` mỗi 3000ms bằng `SELECT ... FOR UPDATE SKIP LOCKED` giúp nhiều luồng chạy song song không nghẽn.
  3. *Bảo đảm an toàn giao dịch:* Khóa phiên bản OCC (`version = version + 1`) chống Race Condition; bảng `processed_event` tại Central khử trùng lặp 100% (Idempotency).
  4. *Đền bù tự động (Compensation):* Khi kho nguồn từ chối hoặc hết hàng, phát sinh `TRANSFER_REJECTED` tự động giải phóng tài nguyên.
* **Số liệu nổi bật:** 26 bản ghi cũ được cách ly an toàn (`Quarantine`) • 0 lỗi trùng lặp sự kiện • Chu kỳ quét 3,000ms.
* **Hình ảnh/Sơ đồ:** Sơ đồ Sequence Diagram 5 bước điều phối Saga (lấy từ mục 2.2 file `03_architecture_and_flows.md`).
* **Nguồn đối chiếu:** `backend/src/workers/outboxWorker.ts`, `backend/tests/test_unit_source_confirm.js`.
* **Trạng thái:** `ĐÃ XÁC MINH & CHẠY TEST THỰC TẾ (100% PASS)`.

---

### SLIDE 7: KIẾN TRÚC DATA LAKEHOUSE & QUY TRÌNH ETL
* **Tiêu đề:** DATA LAKEHOUSE MEDALLION & CHUẨN HÓA DỮ LIỆU
* **3–5 ý chính:**
  1. *Tầng Bronze (Raw):* Lưu trữ nguyên bản snapshot giao dịch định kỳ (CSV từ PostgreSQL Central và JSON sự kiện từ MongoDB).
  2. *Tầng Silver (Cleaned):* Làm sạch, chuẩn hóa kiểu dữ liệu, khử trùng lặp và sinh tự động 11 báo cáo kiểm định chất lượng (`Quality Reports`).
  3. *Tầng Gold (Analytical & Lakehouse):* Tổng hợp bảng xuất kho theo ngày, tích hợp Delta Lake (Delta-RS) hỗ trợ giao dịch ACID và truy vấn lịch sử Time Travel.
  4. *Kiểm định chất lượng Silver:* Bảng `xuat_hang_central` đạt **21,949 dòng vào = 21,949 dòng ra; 0 dòng lỗi, 0 trùng lặp**.
* **Số liệu nổi bật:** 11 bảng kiểm định chất lượng • 21,949 dòng xuất sạch • Chu kỳ ETL 300s.
* **Hình ảnh/Sơ đồ:** Sơ đồ 3 tầng Medallion Bronze -> Silver -> Gold (lấy từ mục 3 file `03_architecture_and_flows.md`).
* **Nguồn đối chiếu:** `data_center/etl/run_data_lake_etl.py`, `data_center/data_lake/lakehouse_manager.py`.
* **Trạng thái:** `ĐÃ XÁC MINH TRỰC TIẾP`.

---

### SLIDE 8: DỮ LIỆU NGOẠI SINH, TIỀN XỬ LÝ & BẢO TOÀN SẢN LƯỢNG
* **Tiêu đề:** TÍCH HỢP ĐA NGUỒN & ĐỊNH LUẬT BẢO TOÀN DỮ LIỆU
* **3–5 ý chính:**
  1. *Dữ liệu Ngoại sinh thực tế:* Thu thập 1,098 bản ghi thời tiết từ Open-Meteo API và 366 ngày lịch với 14 ngày lễ chính thức theo Điều 112 Bộ luật Lao động 2019.
  2. *Xử lý Chuỗi thời gian & Zero-filling:* Tạo lưới đầy đủ 366 ngày x 3 kho x 20 SP = 21,960 dòng; điền 0 cho 7,696 ngày không phát sinh xuất (chiếm 35.05%).
  3. *Bảo toàn sản lượng tuyệt đối 100%:* Tổng sản lượng xuất $\sum = \mathbf{341,163.0}$ sản phẩm được bảo toàn nguyên vẹn qua cả 3 tầng (Gold -> Daily Grid -> Analytical).
  4. *Chống rò rỉ dữ liệu (Data Leakage Protection):* Biến đổi `shift(1)` thực thi trước `rolling(7)`; vector đặc trưng ngày $t$ bất biến khi nhiễu target ngày $t$.
* **Số liệu nổi bật:** 21,960 dòng hợp nhất • 341,163 sản phẩm bảo toàn • 1,098 bản ghi thời tiết • 14 ngày nghỉ lễ.
* **Hình ảnh/Sơ đồ:** Biểu đồ kiểm chứng bảo toàn sản lượng và ma trận kiểm tra chống rò rỉ dữ liệu.
* **Nguồn đối chiếu:** `data_mining/data_preprocessing/build_analytical_dataset.py`, `test_data_mining_suite.py` (Test A3).
* **Trạng thái:** `ĐÃ XÁC MINH & CHẠY TEST THỰC TẾ (100% PASS)`.

---

### SLIDE 9: PHÂN TÍCH KHÁM PHÁ (EDA) & BỘ MÔ HÌNH DỰ BÁO
* **Tiêu đề:** PHÂN TÍCH ĐA CHIỀU (EDA) & THIẾT KẾ MÔ HÌNH HỌC MÁY
* **3–5 ý chính:**
  1. *Phát hiện EDA quan trọng:* Sản lượng chia đều 3 miền (ĐN 33.5%, HCM 33.3%, HN 33.2%). Thời tiết có tương quan tuyến tính rất yếu ($r = -0.0041$), yếu tố quyết định là thứ trong tuần và chuỗi trễ gần nhất.
  2. *Bài toán dự báo:* Dự báo 1 bước thời gian (1-step-ahead forecast) cho từng cặp (Kho, Sản phẩm).
  3. *Phân chia dữ liệu theo thời gian (Temporal Split):* Tập Train 18,600 dòng (10 tháng) và Tập Test 2,940 dòng (49 ngày cuối), không xáo trộn ngẫu nhiên.
  4. *Bộ 4 mô hình đối sánh:* Baseline (Rolling Mean 7 ngày), Linear Ridge Regression ($L_2$ Regularization), Random Forest (100 cây), LightGBM Regressor.
* **Số liệu nổi bật:** 31 đặc trưng đầu vào • 18,600 dòng Train • 2,940 dòng Test (49 ngày liên tục).
* **Hình ảnh/Sơ đồ:** Ảnh biểu đồ phân tích khám phá `data_mining/eda/eda_charts.png`.
* **Nguồn đối chiếu:** `data_mining/eda/eda_report.txt`, `data_mining/evaluation_report.md`.
* **Trạng thái:** `ĐÃ XÁC MINH TRỰC TIẾP`.

---

### SLIDE 10: KẾT QUẢ ĐÁNH GIÁ MÔ HÌNH MACHINE LEARNING
* **Tiêu đề:** KẾT QUẢ THỰC NGHIỆM ĐÁNH GIÁ TRÊN TẬP TEST (2,940 DÒNG)
* **3–5 ý chính:**
  1. *Bảng so sánh tổng thể:*
     - **Baseline:** MAE = 14.7424 | RMSE = 18.2691 | WAPE = 98.09% (Chuẩn đối sánh).
     - **Linear Ridge (Tốt nhất):** MAE = **13.9641** | RMSE = **16.9765** | WAPE = **92.91%** (**Cải thiện +5.28%**).
     - **Random Forest:** MAE = 13.9994 | RMSE = 17.0254 (Cải thiện +5.04%).
     - **LightGBM:** MAE = 14.0044 | RMSE = 17.0346 (Cải thiện +5.01%).
  2. *Căn cứ chọn Linear Ridge làm Production Model:* MAE thấp nhất, không có tính hộp đen, suy luận $< 0.05$s, file artifact siêu nhẹ **1.6 KB** (so với 4.8 MB của Random Forest).
  3. *Hiệu quả trên ngày có đơn hàng (>0):* Cả 3 mô hình học máy giảm hơn **1.05 điểm MAE (cải thiện ~7.4%)** so với Baseline.
* **Số liệu nổi bật:** Ridge MAE 13.9641 • Cải thiện +5.28% • Kích thước mô hình 1.6 KB • Thời gian suy luận < 0.05s.
* **Hình ảnh/Sơ đồ:** Bảng số liệu so sánh 4 mô hình và biểu đồ sai số tuyệt đối.
* **Nguồn đối chiếu:** `data_mining/evaluation_report.md`, `data_mining/models/model_registry/ridge_model.joblib`.
* **Trạng thái:** `ĐÃ XÁC MINH & CHẠY TEST THỰC TẾ`.

---

### SLIDE 11: CÔNG CỤ HỖ TRỢ RA QUYẾT ĐỊNH (DSS)
* **Tiêu đề:** HỆ THỐNG HỖ TRỢ RA QUYẾT ĐỊNH (DSS) & CÂN BẰNG TỒN KHO
* **3–5 ý chính:**
  1. *Phân loại Hàng hóa ABC-XYZ:* 20 mặt hàng được phân định rõ: Nhóm A (6 SP chiếm 80% doanh thu: SSD, Màn hình Samsung, Laptop Dell); Nhóm X (14 SP nhu cầu ổn định).
  2. *Khai phá Luật kết hợp Apriori:* Khai phá từ 10,952 giao dịch, tìm ra 378 luật và 189 cặp mặt hàng thường xuất chung; Top 1: Tai nghe JBL & USB 64GB (101 lần xuất chung) -> Gợi ý bố trí cạnh nhau để giảm quãng đường picking.
  3. *Đề xuất Điều chuyển Cân bằng Kho:* Tự động phát hiện 2 đề xuất tối ưu:
     - Đề xuất 1: Chuyển 15 Laptop Dell từ DN01 sang HCM01 (Trị giá 141.34 triệu, Mức độ: CAO).
     - Đề xuất 2: Chuyển 25 Chuột Logitech từ HN01 sang HCM01 (Trị giá 86.85 triệu, Mức độ: TRUNG BÌNH).
  4. *Ranh giới an toàn:* DSS chỉ đóng vai trò khuyến nghị trên giao diện, không tự ý sửa đổi số dư tồn kho.
* **Số liệu nổi bật:** 20 SP phân loại ABC • 378 luật kết hợp • 2 đề xuất điều chuyển • Tổng giá trị đề xuất: 228.18 triệu VNĐ.
* **Hình ảnh/Sơ đồ:** Bảng phân loại ABC-XYZ và thẻ khuyến nghị điều chuyển kho trên giao diện.
* **Nguồn đối chiếu:** `data_mining/datasets/gold/abc_xyz_analysis.json`, `market_basket_rules.json`, `transfer_recommendations.json`.
* **Trạng thái:** `ĐÃ XÁC MINH TRỰC TIẾP`.

---

### SLIDE 12: GIAO DIỆN NGƯỜI DÙNG & TỔNG HỢP API
* **Tiêu đề:** TRẢI NGHIỆM GIAO DIỆN DASHBOARD & HỆ THỐNG RESTFUL API
* **3–5 ý chính:**
  1. *Dashboard Thống kê Nhập - Xuất:* Thiết kế Dark-Mode hiện đại; biểu đồ tương tác SVG cột kép Nhập (Emerald) vs Xuất (Indigo); chuyển đổi xem theo Ngày/Tháng; nút Xuất CSV định dạng chuẩn.
  2. *Màn hình Dự báo & DSS:* Tích hợp 6 tab chuyên sâu: ABC-XYZ Matrix, Luật kết hợp Giỏ hàng, Đề xuất điều chuyển, Bảng dự báo 2,940 dòng và Phương pháp luận.
  3. *Màn hình Điều phối Liên kho:* Theo dõi trạng thái Saga theo thời gian thực (5 bước) kèm bộ lọc theo chi nhánh.
  4. *Hệ thống 8 Cụm RESTful API:* Được bảo vệ bằng Bearer JWT và kiểm soát phân quyền 5 nhóm vai trò nghiêm ngặt.
* **Số liệu nổi bật:** 8 nhóm API endpoint • 4 màn hình nghiệp vụ chính • 100% Type-Safe TypeScript.
* **Hình ảnh/Sơ đồ:** Ảnh chụp giao diện Dashboard thống kê nhập xuất và màn hình Dự báo nhu cầu DSS.
* **Nguồn đối chiếu:** `frontend/src/pages/Dashboard.tsx`, `DemandForecast.tsx`, `Transfer.tsx`.
* **Trạng thái:** `ĐÃ XÁC MINH TRỰC TIẾP (Code & UI Components)`.

---

### SLIDE 13: BẰNG CHỨNG KIỂM THỬ TOÀN DIỆN (QUALITY ASSURANCE)
* **Tiêu đề:** MINH CHỨNG KIỂM THỬ THỰC TẾ & BẢO ĐẢM CHẤT LƯỢNG
* **3–5 ý chính:**
  1. *Python Data Mining Test Suite:* **51/51 bài kiểm thử ĐẠT (100% PASS)** trong 23.43 giây (`Ran 51 tests in 23.429s. OK`).
  2. *Backend Unit Test Suite:* **20/20 bài kiểm thử ĐẠT (100% PASS)** xác minh tính Idempotency, thống kê nhập xuất và dịch vụ DSS.
  3. *Kiểm thử cách ly an toàn Outbox:* Bảo vệ nguyên vẹn 26 bản ghi cũ trên các node; cơ chế fallback đọc 16,400 bản ghi lịch sử thật khi database dev offline.
  4. *Kiểm định chất lượng dữ liệu Silver:* 11 bảng đạt chuẩn, 0 bản ghi lỗi, 0 trùng lặp.
* **Số liệu nổi bật:** 51/51 Python tests PASS • 20/20 Backend tests PASS • 0 bản ghi lỗi ở tầng Silver.
* **Hình ảnh/Sơ đồ:** Ảnh chụp màn hình terminal chạy `py -m unittest discover -s data_mining/tests` hiển thị `Ran 51 tests ... OK`.
* **Nguồn đối chiếu:** `presentation_materials/04_test_evidence.md`.
* **Trạng thái:** `ĐÃ CHẠY VÀ XÁC MINH THỰC TẾ`.

---

### SLIDE 14: HẠN CHẾ, KẾT LUẬN & HƯỚNG PHÁT TRIỂN
* **Tiêu đề:** KẾT LUẬN, BÀI HỌC KINH NGHIỆM & ĐỊNH HƯỚNG TƯƠNG LAI
* **3–5 ý chính:**
  1. *Kết quả đạt được:* Xây dựng thành công hệ thống quản lý kho phân tán đa chi nhánh, giải quyết trọn vẹn giao dịch Saga, hoàn thiện Data Lakehouse Delta-RS và mô hình học máy hỗ trợ quyết định.
  2. *Hạn chế cần ghi nhận trung thực:*
     - Dự báo hiện tại là 1 bước thời gian (1-step-ahead); chưa tối ưu trọn vẹn cho Lead Time vận chuyển 2–3 ngày.
     - Chưa có dữ liệu tọa độ kệ vật lý 3D trong kho; khuyến nghị bố trí mới dừng ở mức phân vùng.
     - Chưa tích hợp Apache Kafka do giới hạn tài nguyên và ưu tiên tính ổn định của Outbox Relay Worker.
  3. *Hướng phát triển:* Nâng cấp mô hình 2 giai đoạn (Hurdle Model) xử lý chuỗi ngày có nhu cầu bằng 0; phát triển dự báo đệ quy đa bước; tích hợp tọa độ kệ 3D tối ưu đường đi picking.
* **Số liệu nổi bật:** Hoàn thành 100% yêu cầu cốt lõi • Sẵn sàng mở rộng kiến trúc trong môi trường doanh nghiệp thực tế.
* **Hình ảnh/Sơ đồ:** Sơ đồ lộ trình nâng cấp hệ thống trong tương lai.
* **Nguồn đối chiếu:** `data_mining/evaluation_report.md`.
* **Trạng thái:** `ĐÃ XÁC MINH TRỰC TIẾP`.
