# KỊCH BẢN VÀ DANH MỤC KIỂM TRA DEMO TRỰC TIẾP (DEMO CHECKLIST)

> **Tài liệu:** Hướng dẫn các kịch bản demo trực tiếp trước hội đồng đánh giá, danh sách màn hình, lệnh kiểm tra và điều kiện tiên quyết  
> **Dự án:** WarehouseManagement  
> **Vị trí file:** `presentation_materials/06_demo_checklist.md`  

---

## 1. Điều kiện tiên quyết trước khi Thuyết trình (Pre-flight Checklist)

Trước khi bắt đầu bài thuyết trình, người thuyết trình **phải kiểm tra 5 điều kiện kỹ thuật** sau:

- [ ] **Môi trường Python:** Mở PowerShell, kiểm tra lệnh `py --version` (Yêu cầu hiển thị `Python 3.11.5` hoặc tương đương).
- [ ] **Môi trường Node.js:** Kiểm tra `node -v` (Node >= 18) và `npm -v`.
- [ ] **Thư viện phụ thuộc:** Đã cài đặt đầy đủ `requirements.txt` và `node_modules` tại `backend/` và `frontend/`.
- [ ] **Trạng thái Database & Docker:**
  - *Nếu có Docker Desktop:* Chạy lệnh `docker-compose up -d` và kiểm tra 5 container khỏe mạnh (`docker ps`).
  - *Nếu Docker chưa bật / Máy yếu:* Backend tích hợp **cơ chế tự phục hồi thông minh (Fallback)**, tự động đọc từ 16,400 bản ghi lịch sử thật và các file Gold JSON/CSV. **Hệ thống vẫn chạy mượt mà trên giao diện Web mà không bị gián đoạn.**
- [ ] **Khởi động Dịch vụ Demo:**
  - Terminal 1 (Backend): Chạy `npm run dev` trong thư mục `backend/` (Cổng 3000).
  - Terminal 2 (Frontend): Chạy `npm run dev` trong thư mục `frontend/` (Cổng 5173).

---

## 2. Danh mục Kịch bản Demo Trực tiếp (Step-by-Step Demo Scenarios)

### KỊCH BẢN 1: TỔNG QUAN DASHBOARD & THỐNG KÊ NHẬP – XUẤT ĐỘNG
* **Mục tiêu demo:** Chứng minh khả năng tổng hợp chỉ số thời gian thực, lọc đa chiều, biểu đồ SVG tương tác và cơ chế xuất dữ liệu chuẩn hóa.
* **Các bước thao tác:**
  1. Mở trình duyệt truy cập `http://localhost:5173`.
  2. Đăng nhập tài khoản Điều phối viên: `dieu_phoi` / mật khẩu: `123456` (hoặc `admin` / `123456`).
  3. Quan sát 4 thẻ KPI đầu trang:
     - Tổng hàng nhập kỳ, Tổng hàng xuất kỳ, Chênh lệch ròng (Net Flow), Số lượng phiếu hoàn thành.
     - Kiểm tra hai thẻ: "Đơn nhập chờ xử lý" và "Đơn xuất chờ xử lý" hiển thị số lượng thực tế từ hệ thống (không còn bị hardcode 12 và 8).
  4. Thao tác trên thanh bộ lọc:
     - Chuyển đổi bộ lọc kho từ `Toàn quốc (ALL)` sang chi nhánh cụ thể: `Hà Nội (HN01)`. Quan sát thẻ KPI và cơ cấu chi nhánh cập nhật tức thì.
     - Nhấp chọn chuyển đổi chế độ xem: `Theo Ngày` $\leftrightarrow$ `Theo Tháng`.
     - Nhấp chọn các nút nhanh: `Tháng 09/2026`, `30 ngày gần nhất`.
  5. Rê chuột trên biểu đồ cột kép SVG:
     - Quan sát tooltip hiển thị chi tiết số lượng sản phẩm nhập (Cột xanh Emerald) và xuất (Cột tím Indigo) tại từng mốc thời gian.
  6. Cuộn xuống mục **Bảng Kê Chi Tiết Thời Gian**:
     - Thử phân trang (Next / Previous).
     - Nhấp nút **Xuất CSV**: Tải file về máy, mở trong Excel để chứng minh hỗ trợ font Tiếng Việt chuẩn UTF-8 BOM không lỗi font.
* **Kết quả mong đợi:** Dữ liệu tải nhanh dưới 0.5 giây, biểu đồ mượt mà, số liệu khớp chính xác giữa KPI và bảng kê.

---

### KỊCH BẢN 2: PHÂN TÍCH KHÁM PHÁ & DỰ BÁO NHU CẦU MACHINE LEARNING
* **Mục tiêu demo:** Trình diễn kết quả mô hình học máy trên 49 ngày tập Test, chứng minh tính vượt trội của Linear Ridge và kiểm tra phân khúc ngày nhu cầu bằng 0.
* **Các bước thao tác:**
  1. Trên thanh điều hướng bên trái, nhấp chọn menu **Dự báo nhu cầu** (`/demand-forecast`).
  2. Quan sát 4 thẻ chỉ số mô hình ở đầu trang:
     - Mô hình tốt nhất: `Linear Ridge Regression`.
     - MAE Ridge: **13.9641** | MAE Baseline: **14.7424** (Cải thiện: **+5.28%**).
     - RMSE Ridge: **16.9765** | Kích thước mô hình: **1.6 KB**.
  3. Chuyển sang tab **Đánh giá chi tiết (Breakdown)**:
     - Quan sát bảng bóc tách theo từng kho: Đà Nẵng, TP.HCM, Hà Nội.
     - Quan sát bảng bóc tách theo nhóm ngày: Nhóm ngày có nhu cầu xuất (>0) thể hiện ưu thế vượt trội của Machine Learning (giảm >1.05 đơn vị MAE so với Baseline).
  4. Chuyển sang tab **Bảng kết quả dự báo (Table)**:
     - Thử nghiệm bộ lọc theo mã sản phẩm (ví dụ chọn `SP001 - Laptop Dell`).
     - Quan sát bảng dự báo 2,940 dòng hiển thị song song giá trị Thực tế vs Dự báo Ridge vs Dự báo Baseline.
* **Kết quả mong đợi:** Giao diện trực quan, giải thích rõ căn cứ khoa học tại sao chọn Ridge làm mô hình chính thay vì Random Forest (do nhẹ hơn 2,900 lần và không bị hộp đen).

---

### KỊCH BẢN 3: HỆ THỐNG HỖ TRỢ RA QUYẾT ĐỊNH (DSS) & CÂN BẰNG TỒN KHO
* **Mục tiêu demo:** Trình diễn 3 công cụ hỗ trợ ra quyết định thông minh: Phân loại ABC-XYZ, Khai phá giỏ hàng Apriori và Đề xuất điều chuyển liên kho.
* **Các bước thao tác:**
  1. Trong màn hình **Dự báo nhu cầu**, nhấp chọn tab **Phân loại ABC-XYZ**:
     - Quan sát ma trận 9 ô (AX, AY, AZ, BX, BY, BZ, CX, CY, CZ).
     - Thấy rõ 6 mặt hàng Nhóm A đóng góp 80% giá trị doanh thu (Laptop Dell, SSD, Màn hình Samsung...).
     - Xem khuyến nghị bố trí kho tương ứng cho từng mặt hàng.
  2. Chuyển sang tab **Khai phá giỏ hàng (Market Basket)**:
     - Quan sát bảng Top cặp mặt hàng thường xuyên xuất chung (ví dụ: Tai nghe JBL & USB 64GB xuất chung 101 lần).
     - Xem khuyến nghị gom cụm vị trí lấy hàng (picking) để tối ưu thời gian di chuyển của thủ kho.
  3. Chuyển sang tab **Đề xuất điều chuyển kho (DSS Transfer)**:
     - Quan sát 2 khuyến nghị điều chuyển cân bằng tồn kho tự động:
       + *Khuyến nghị 1 (Ưu tiên CAO):* Điều chuyển 15 Laptop Dell từ Đà Nẵng (`DN01` đang dư 40 ngày xuất) vào TP.HCM (`HCM01` chỉ còn 13 ngày xuất, dưới mức an toàn).
       + *Khuyến nghị 2 (Ưu tiên TRUNG BÌNH):* Điều chuyển 25 Chuột Logitech từ Hà Nội (`HN01`) vào TP.HCM (`HCM01`).
     - Nêu rõ nguyên tắc: DSS chỉ đưa ra gợi ý phân tích, không tự ý can thiệp trừ kho tự động.
* **Kết quả mong đợi:** Hội đồng đánh giá thấy rõ mối liên kết logic từ Dự báo nhu cầu $\rightarrow$ Đánh giá mức tồn kho $\rightarrow$ Đề xuất điều phối thiết thực.

---

### KỊCH BẢN 4: GIAO DỊCH ĐIỀU CHUYỂN LIÊN KHO & SAGA MONITORING
* **Mục tiêu demo:** Trình diễn luồng giao dịch phân tán 5 bước và cơ chế khóa giữ hàng Soft Reservation.
* **Các bước thao tác:**
  1. Nhấp chọn menu **Điều chuyển kho** (`/transfer`).
  2. Bấm nút **Tạo phiếu điều chuyển mới**:
     - Kho xuất: `HN01`, Kho nhận: `HCM01`.
     - Chọn sản phẩm: `SP001 - Laptop Dell`, Số lượng: 5 cái.
     - Nhấp **Tạo phiếu**: Hệ thống tự động sinh mã phiếu chuẩn quy cách `DC_HN01_...` và khởi tạo trạng thái `CHO_DUYET`.
  3. Đăng nhập tài khoản Quản lý kho: Duyệt phiếu điều chuyển $\rightarrow$ Trạng thái chuyển sang `DANG_XU_LY`.
  4. Trình bày cơ chế Outbox Worker:
     - Giải thích vai trò của `outbox_event` và `stock_reservation` tại node kho xuất.
     - Khi kho xuất xác nhận, lượng hàng 5 cái bị khóa lại (`RESERVED`), không ai có thể lấy xuất bán mất.
     - Khi xuất hàng lên xe vận chuyển, hàng chuyển vào kho ảo `TRANSIT` tại Central.
* **Kết quả mong đợi:** Chứng minh giải quyết trọn vẹn bài toán giao dịch bất đồng bộ giữa các chi nhánh cách xa nhau.

---

### KỊCH BẢN 5: CHỨNG MINH KIỂM THỬ THỰC TẾ TRÊN TERMINAL (LIVE TEST AUDIT)
* **Mục tiêu demo:** Bằng chứng thuyết phục nhất trước hội đồng về tính xác thực của mã nguồn.
* **Các bước thao tác:**
  1. Mở cửa sổ PowerShell tại thư mục gốc dự án: `d:\Các hệ thống phân tán\WarehouseManagement`.
  2. **Chạy toàn bộ 51 bài kiểm thử tự động của phân hệ Data Mining:**
     ```powershell
     py -m unittest discover -s data_mining/tests -p "test_*.py"
     ```
     - Chỉ ra màn hình terminal chạy qua 51 bài kiểm tra và in dòng kết luận:
       `Ran 51 tests in ~23s ... OK`.
     - Nêu rõ các bài test đã bao phủ: Chống rò rỉ dữ liệu (Data leakage), bảo toàn sản lượng 3 tầng (341,163 sp), kiểm tra bẫy lỗi API ngoại vi và ACID Delta Lakehouse.
  3. **Chạy kiểm thử đơn vị logic Saga & Phân quyền Backend:**
     ```powershell
     cd backend
     node tests/test_unit_source_confirm.js
     ```
     - Terminal in: `TẤT CẢ 5 UNIT TESTS ĐỀU VƯỢT QUA 100%`.
  4. **Chạy kiểm thử dịch vụ Thống kê Nhập - Xuất:**
     ```powershell
     node tests/test_io_statistics.js
     ```
     - Terminal in: `TẤT CẢ KIỂM THỬ THỐNG KÊ NHẬP - XUẤT ĐỀU ĐẠT (100% PASS)`.
* **Kết quả mong đợi:** 100% bài kiểm thử chạy thành công trước mắt ban giám khảo, không có lỗi tiềm ẩn.

---

## 3. Những câu hỏi Giảng viên thường hỏi và Cách trả lời Chuẩn xác

| Câu hỏi phản biện có thể gặp | Hướng trả lời chuẩn xác dựa trên thực tế dự án |
| :--- | :--- |
| **Q1: "Hệ thống có dùng Kafka không?"** | **Trả lời:** "Dạ không. Trong giai đoạn hiện tại, nhóm chủ động triển khai kiến trúc **Transactional Outbox Pattern kết hợp Outbox Relay Worker chuyên dụng chạy trên Node.js/TypeScript**. Worker sử dụng cơ chế `FOR UPDATE SKIP LOCKED` và khóa phiên bản OCC để bảo đảm độ tin cậy và không trùng lặp sự kiện mà không làm phát sinh chi phí vận hành cụm Kafka." |
| **Q2: "Tại sao chọn Linear Ridge Regression thay vì Random Forest hay Deep Learning?"** | **Trả lời:** "Dạ qua thực nghiệm trên 2,940 dòng tập Test, Linear Ridge đạt **MAE nhỏ nhất (13.9641)**, vượt qua Baseline 5.28%. Hơn nữa, kích thước artifact của Ridge chỉ **1.6 KB** (so với 4.8 MB của Random Forest), thời gian suy luận dưới 0.05s, và các hệ số beta hoàn toàn tường minh, giúp doanh nghiệp dễ dàng giải thích căn cứ dự báo cho ban giám đốc." |
| **Q3: "Nhóm xử lý thế nào đối với các ngày không có giao dịch xuất hàng (nhu cầu = 0)?"** | **Trả lời:** "Dạ nhóm áp dụng kỹ thuật **Zero-filling tạo lưới chuỗi thời gian đầy đủ 366 ngày x 3 kho x 20 SP = 21,960 dòng**. Trong đó có 35.05% ngày nhu cầu bằng 0. Nhóm đã kiểm chứng định luật bảo toàn sản lượng xuất: tổng số lượng xuất trước và sau khi điền 0 đều bằng đúng **341,163 đơn vị sản phẩm**." |
| **Q4: "Làm thế nào để bảo đảm không bị rò rỉ dữ liệu (Data Leakage) khi tính lag và rolling?"** | **Trả lời:** "Dạ nhóm thiết lập nguyên tắc: hàm trễ `shift(1)` được thực thi **trước** mọi hàm trung bình trượt `rolling()`. Tại ngày $t$, vector đặc trưng chỉ chứa thông tin đến hết ngày $t-1$. Nhóm đã có bài unit test độc lập: khi cố tình thay đổi sản lượng ngày $t$ lên 999,999 thì toàn bộ vector đặc trưng tại ngày $t$ hoàn toàn bất biến." |
| **Q5: "Nếu xe đang chuyển hàng liên kho mà hệ thống mất kết nối mạng thì xử lý sao?"** | **Trả lời:** "Dạ hệ thống sử dụng **Kho ảo trung gian TRANSIT tại Central Database**. Khi hàng rời kho nguồn, tồn kho nguồn đã được trừ và ghi nhận vào TRANSIT. Dù mất mạng, hàng hóa vẫn được bảo toàn trên hệ thống sổ sách kế toán, và khi kho đích tiếp nhận, nhân viên kiểm đếm xong mới chuyển từ TRANSIT vào tồn kho đích." |
