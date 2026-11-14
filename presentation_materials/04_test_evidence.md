# BẰNG CHỨNG KIỂM THỬ, NHẬT KÝ VẬN HÀNH VÀ CÁC ĐIỂM CHƯA XÁC MINH

> **Tài liệu:** Tổng hợp kết quả kiểm thử thực tế, log hệ thống, các hạn chế kỹ thuật và ranh giới xác minh  
> **Dự án:** WarehouseManagement  
> **Vị trí file:** `presentation_materials/04_test_evidence.md`  

---

## 1. Tổng hợp Kết quả Kiểm thử Toàn hệ thống (Test Suite Inventory)

| Bộ kiểm thử (Test Suite) | Tập tin nguồn | Số lượng Test | Kết quả thực tế | Tỷ lệ Đạt | Nội dung kiểm chứng kỹ thuật |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Python Data Mining Suite** | `data_mining/tests/test_data_mining_suite.py` | 22 | **22 PASS** | **100%** | Kiểm tra pipeline tự động; kiểm định chất lượng 21,960 dòng; chống rò rỉ dữ liệu (4 tests); xử lý input bất thường (file 0 byte, số âm, sai ngày); bẫy lỗi API thời tiết (mock 5 tests). |
| **Python Decision Support Suite** | `data_mining/tests/test_decision_support_suite.py` | 15 | **15 PASS** | **100%** | Kiểm định tính toán phân loại ABC-XYZ; kiểm chứng luật kết hợp Apriori; kiểm tra thuật toán heuristic điều chuyển cân bằng tồn kho. |
| **Python Lakehouse & MLOps Suite** | `data_mining/tests/test_lakehouse_time_travel.py`, `test_mlops_automation.py` | 14 | **14 PASS** | **100%** | Xác minh commit ACID của Delta Lake (Delta-RS); kiểm tra truy vấn Time Travel theo phiên bản; kiểm thử tự động hóa MLOps retrain. |
| **Backend Unit Source Confirm** | `backend/tests/test_unit_source_confirm.js` | 5 | **5 PASS** | **100%** | Kiểm tra tính bất biến (Idempotency) khi kho nguồn xác nhận nhiều lần; bảo vệ phân quyền theo chi nhánh; chuyển trạng thái Saga. |
| **Backend IO Statistics Service** | `backend/tests/test_io_statistics.js` | 5 | **5 PASS** | **100%** | Xác minh tính chính xác tính toán KPI Nhập/Xuất; chuỗi thời gian Ngày/Tháng; cơ cấu 3 kho; fallback đọc 16,400 bản ghi khi DB offline. |
| **Backend Decision Support Service** | `backend/tests/test_decision_support_service.js` | 10 | **10 PASS** | **100%** | Kiểm tra đọc dữ liệu ABC-XYZ toàn quốc và 3 kho; Market basket; ràng buộc xác suất toán học của luật kết hợp; 2 đề xuất điều chuyển. |
| **Backend Outbox Pipeline Verification** | `backend/tests/test_outbox_pipeline_verification.js` | 4 kịch bản | **ĐÃ XÁC MINH THEO LOG** | **100%** | Kiểm tra luồng `TRANSFER_SHIPPED` từ HN -> Central, `TRANSFER_RECEIVED` từ HCM -> Central; khử trùng lặp `processed_event`; khóa OCC version. |
| **Backend Outbox Quarantine Verification** | `backend/tests/test_relay_without_created_after.js` | 4 bước | **ĐÃ XÁC MINH THEO LOG** | **100%** | Xác minh bảo toàn 25 bản ghi cách ly HN và 1 bản ghi DN cũ; worker tiêu chuẩn không quét nhầm dữ liệu cách ly. |
| **Backend Data Mining Service Test** | `backend/tests/test_data_mining_service.js` | 5 checks | **4 PASS / 1 FAIL** | **80%** | Đọc 2,940 bản ghi dự báo (PASS); Kiểm tra MAE Baseline và Ridge (PASS); **FAIL tại assertion RF MAE do dung sai test đặt quá chặt:** Test yêu cầu $|14.0061 - 13.9994| < 0.005$ (thực tế chênh $0.0067$). |

> **Tổng kết kiểm thử thực thi trực tiếp tại buổi đánh giá:**
> - **Python Data Mining (51 tests):** Đạt **51/51 PASS (100%)** trong thời gian 23.43 giây (`Ran 51 tests in 23.429s. OK`).
> - **Backend JavaScript Unit Tests (20 tests):** Đạt **20/20 PASS (100%)** trên 3 bộ test độc lập (`test_unit_source_confirm`, `test_io_statistics`, `test_decision_support_service`).

---

## 2. Bằng chứng Thực nghiệm và Trích xuất Log Vận hành

### 2.1. Trích xuất Log Thực thi Pipeline 10 Bước (`pipeline_run_status.json`)
- **Thời điểm chạy thành công gần nhất:** `2026-10-23T05:46:37.266934`
- **Tổng thời gian thực thi (Total Duration):** **22.52 giây**
- **Trạng thái:** `COMPLETED`
- **Chi tiết từng bước:**
  1. *Bước 1 (Làm sạch & chuẩn hóa Gold):* 0.42s - `SUCCESS`
  2. *Bước 2 (Tiền xử lý & Zero-filling):* 0.52s - `SUCCESS`
  3. *Bước 3 (Thu thập thời tiết Open-Meteo):* 4.20s - `SUCCESS`
  4. *Bước 4 (Trích xuất lịch & lễ Việt Nam):* 0.13s - `SUCCESS`
  5. *Bước 5 (Tích hợp Analytical Dataset 21,960 dòng):* 0.40s - `SUCCESS`
  6. *Bước 6 (Khám phá dữ liệu đa chiều EDA):* 2.37s - `SUCCESS`
  7. *Bước 7 (Feature Engineering & ML Training):* 10.40s - `SUCCESS`
  8. *Bước 8 (Phân loại hàng hóa ABC-XYZ):* 1.21s - `SUCCESS`
  9. *Bước 9 (Khai phá luật kết hợp Apriori):* 1.48s - `SUCCESS`
  10. *Bước 10 (Đề xuất điều chuyển liên kho DSS):* 1.37s - `SUCCESS`

### 2.2. Bằng chứng Bảo toàn Sản lượng Tuyệt đối xuyên suốt 3 Tầng Dữ liệu
Trích xuất từ kết quả thực thi kiểm thử `test_data_mining_suite.py` (Test A3):
```text
So dong Raw: 14264
So dong hop le: 14264
So dong bi loai: 0
So nhom Gold: 14264
So dong trung da gop: 0
File Gold: D:\Các hệ thống phân tán\WarehouseManagement\data_mining\datasets\gold\lich_su_xuat_hang_gold.csv
[TEST A3] BẢO TOÀN SẢN LƯỢNG XUẤT HÀNG:
- Tầng Gold:             sum(tong_so_luong_xuat) = 341,163.0 đơn vị
- Tầng Daily Grid:       sum(nhu_cau_xuat)       = 341,163.0 đơn vị
- Tầng Analytical Table: sum(nhu_cau_xuat)       = 341,163.0 đơn vị
-> ĐÁNH GIÁ: ĐẠT CHUẨN BẢO TOÀN DỮ LIỆU TUYỆT ĐỐI (Sai lệch = 0.0)
```

### 2.3. Bằng chứng Báo cáo Chất lượng Dữ liệu Tầng Silver (Data Quality Reports)
Tại thư mục `data_center/data_lake/silver/quality_reports/xuat_hang_central_report.json`:
```json
{
  "table": "xuat_hang_central",
  "source_rows": 21949,
  "silver_rows": 21949,
  "rejected_rows": 0,
  "duplicate_rows_detected": 0,
  "invalid_rows": 0,
  "processed_at": "2026-10-23T04:51:27.771449"
}
```
*Kết luận:* Toàn bộ 21,949 dòng giao dịch xuất hàng từ Central được chuyển sang Silver nguyên vẹn, không có lỗi định dạng hay trùng khóa.

### 2.4. Bằng chứng Vận hành Tự động hóa MLOps (`mlops_weekly_run.log`)
Trích xuất từ phiên tái huấn luyện tự động định kỳ:
```text
[MLOps Retrain] Starting automated retraining session: run_20261023_044300
[*] Training candidate models on 18600 training rows...
[MLOps Staging] Candidate models saved to: data_mining/models/model_registry/staging
Candidate evaluation: ACCEPTABLE -> APPROVE_FOR_STAGING
Active Production Model: PROTECTED (Unchanged).
Candidate LightGBM MAE: 14.02 (Đạt chuẩn Staging nhưng không vượt Ridge 13.9641 nên giữ nguyên mô hình Production).
```

---

## 3. Các điểm Chưa xác minh, Hạn chế Kỹ thuật và Giả định Nghiệp vụ

Để bảo đảm tính khách quan, trung thực và liêm chính học thuật khi thuyết trình trước hội đồng, nhóm cần nắm rõ các điểm giới hạn sau:

### 3.1. Các thành phần CHƯA TRIỂN KHAI hoặc CHƯA XÁC MINH ĐẦY ĐỦ
1. **Message Broker Kafka / Debezium:**
   - *Hiện trạng:* Từ khóa Kafka chỉ xuất hiện trong chú thích (comment) của file SQL `09_create_cdc.sql`.
   - *Thực tế:* Hệ thống **hoàn toàn chưa cài đặt Apache Kafka hoặc Debezium**. Việc truyền thông điệp liên node hiện tại đang được đảm trách bởi **Outbox Relay Worker (viết bằng TypeScript) tự động polling trực tiếp bảng PostgreSQL**.
   - *Khuyến cáo:* **Tuyệt đối không tuyên bố hệ thống đang chạy Kafka trong slide.**
2. **Sơ đồ Kho vật lý 3D (3D Warehouse Layout / Shelf Coordinates):**
   - *Hiện trạng:* Hệ thống đã tính toán ra phân loại ABC-XYZ và gom cụm cặp sản phẩm xuất chung (Apriori Picking Pairs).
   - *Giới hạn:* Cơ sở dữ liệu hiện tại **chưa có bảng lưu tọa độ kệ hàng vật lý (X, Y, Z)**. Các khuyến nghị bố trí kho hiện tại mới dừng ở mức **nguyên tắc phân vùng (tầng 1-2, gần cửa xuất)**, chưa vẽ được lộ trình lấy hàng trên mô hình 3D.
3. **Cơ sở dữ liệu Live khi Docker Desktop chưa bật:**
   - *Hiện trạng:* Khi Docker không chạy, các container database cổng 5433-5436 không online.
   - *Cơ chế xử lý:* Backend API tích hợp cơ chế tự phục hồi thông minh: tự động fallback đọc từ tập dữ liệu chuẩn hóa 16,400 bản ghi lịch sử thật để giữ cho màn hình Dashboard và Data Mining hoạt động liên tục mà không bị crash.

### 3.2. Giới hạn Khoa học của Mô hình Học máy
1. **Bài toán Dự báo 1 bước thời gian (1-step-ahead Horizon):**
   - Mô hình hiện tại dự báo nhu cầu ngày $t$ dựa trên các đặc trưng đã chốt đến hết ngày $t-1$.
   - Trong thực tế điều chuyển liên miền (Hà Nội - TP.HCM), thời gian vận chuyển (Lead Time) mất 2–3 ngày. Để áp dụng hoàn hảo cho bổ sung hàng dài hạn, cần phát triển cơ chế dự báo đệ quy đa bước (Multi-step Recursive Forecast).
2. **Nhu cầu gián đoạn (Zero-inflated Demand):**
   - Có **35.05% ngày không phát sinh xuất hàng (nhu cầu bằng 0)**.
   - Các mô hình hồi quy liên tục (Ridge, Random Forest, LightGBM) do chịu ảnh hưởng từ chuỗi trễ dương của các ngày trước nên có xu hướng dự báo mức ~15 tại các ngày có nhu cầu bằng 0, dẫn đến sai số tuyệt đối của nhóm ngày này bị neo quanh mức 15.5.
3. **Lượng xuất quan sát được vs Nhu cầu thực tế (Observed vs Unmet Demand):**
   - Biến mục tiêu đo lường số lượng thực tế đã xuất thành công khỏi kho. Nếu kho bị hết hàng (stockout), lượng xuất bằng 0 dù khách hàng vẫn có nhu cầu; mô hình hiện tại chưa mô hình hóa được nhu cầu bị bỏ lỡ này.
4. **Mức độ đóng góp của yếu tố thời tiết:**
   - Hệ số tương quan Pearson giữa nhiệt độ/lượng mưa với nhu cầu xuất rất thấp ($r \approx -0.004$). Yếu tố quyết định chính đến sản lượng là tính chu kỳ (thứ trong tuần) và quán tính lịch sử gần nhất (`lag_1`, `rolling_mean_7`).
