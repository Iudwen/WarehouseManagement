# BÁO CÁO KIỂM THỬ TOÀN DIỆN PHÂN HỆ DATA MINING
**Dự án:** Distributed Warehouse Management System  
**Thời điểm cập nhật:** 20/10/2026  
**Môi trường kiểm thử:** Python 3.11.5, Windows 11, PowerShell  
**Bộ kiểm thử tự động:** `data_mining/tests/test_data_mining_suite.py`  
**Kết quả chung:** **22/22 bài kiểm thử ĐẠT (100% PASS)**

---

## 1. Tóm tắt kết quả kiểm thử theo nhóm chức năng

| Nhóm kiểm thử | Số test | Trạng thái | Nội dung kiểm chứng thực tế |
| :--- | :---: | :---: | :--- |
| **1. Pipeline & Artifacts** | 3 | **ĐẠT (3/3)** | `run_pipeline.py` chạy qua 7 bước đạt mã thoát 0; đủ 9 artifacts; **[MỚI]** kiểm tra chạy `build_gold()` trực tiếp trên dữ liệu thật (14,264 dòng) và xác minh bảo toàn sản lượng xuất qua 3 tầng (341,163 sp). |
| **2. Chất lượng dữ liệu** | 3 | **ĐẠT (3/3)** | 21,960 dòng, 11 cột, 0 null ở cột bắt buộc, 0 khóa trùng, 0 số âm; Join nguồn ngoài khớp 100% (500 mẫu test ngẫu nhiên). |
| **3. ETL & Nguồn ngoài cơ bản** | 1 | **ĐẠT (1/1)** | Thời tiết đủ 1,098 bản ghi (3 kho x 366 ngày); Lịch đủ 366 ngày (14 ngày nghỉ lễ Việt Nam). |
| **4. Khám phá dữ liệu (EDA)** | 1 | **ĐẠT (1/1)** | Số liệu tổng lượng xuất (341,163) và ngày 0 xuất (7,696) khớp 100% giữa dataset và báo cáo text/đồ thị. |
| **5. Machine Learning & Dự báo** | 2 | **ĐẠT (2/2)** | Không có dự báo âm, Train/Test chia theo thời gian; ML (Ridge MAE=13.9641) vượt trội hơn Baseline (MAE=14.7424). |
| **6. Chống Data Leakage (Logic Level)** | 4 | **ĐẠT (4/4)** | Kiểm tra trực tiếp hàm `build_features`: xác minh lag/rolling chỉ lấy quá khứ, rolling window không chứa target ngày t, bất biến khi target ngày t bị nhiễu, cô lập tuyệt đối giữa các kho. |
| **7. Dữ liệu đầu vào bất thường** | 3 | **ĐẠT (3/3)** | File 0 byte và file thiếu cột bị từ chối bằng `ValueError`; dữ liệu ngày sai, số âm, ký tự chữ được bẫy lỗi và đếm vào `rejected` an toàn (test loại bỏ 4 dòng lỗi, giữ 1 dòng hợp lệ). |
| **8. Xử lý lỗi API ngoại vi (Mock)** | 5 | **ĐẠT (5/5)** | Mô phỏng Timeout, HTTP 500, JSON thiếu `daily`, mảng `time` rỗng; xác minh phân biệt rõ ràng giữa giá trị thiếu (`None` lưu rỗng `""`) và `0.0` thực tế. |

---

## 2. Chi tiết các bài kiểm thử bổ sung cho 3 khoảng trống

### A. Kiểm thử trực tiếp chống Data Leakage (`TestDataLeakageLogic`)
* **Test LEAKAGE 1 — Xác minh `lag_1` và `lag_7`:**
  * Tạo chuỗi dữ liệu kiểm soát tăng dần: Ngày 1 (10), Ngày 2 (20), ..., Ngày 8 (80).
  * Kiểm tra tại ngày 8: `lag_1` = 70.0 (giá trị ngày 7) và `lag_7` = 10.0 (giá trị ngày 1).
  * *Kết quả:* **ĐẠT**.
* **Test LEAKAGE 2 — Xác minh Rolling Window không chứa target ngày $t$:**
  * Tại ngày 8 (target = 80):
    * Trung bình nếu **không rò rỉ**: $\text{mean}(10, 20, 30, 40, 50, 60, 70) = 280 / 7 = \mathbf{40.0}$.
    * Trung bình nếu **bị rò rỉ**: $\text{mean}(20, 30, 40, 50, 60, 70, 80) = 350 / 7 = \mathbf{50.0}$.
  * Kiểm tra thực tế: `rolling_mean_7` đúng bằng **40.0** (không bị leak 50.0).
  * *Kết quả:* **ĐẠT**.
* **Test LEAKAGE 3 — Kiểm tra tính bất biến (Perturbation Invariance):**
  * Thay đổi đột biến lượng xuất tại ngày 8 từ 80 thành 999,999.
  * Toàn bộ đặc trưng `lag_1`, `lag_7`, `rolling_mean_7` tại ngày 8 **hoàn toàn không đổi** (vẫn là 70, 10, 40.0).
  * *Kết quả:* **ĐẠT**.
* **Test LEAKAGE 4 — Cô lập dữ liệu giữa các thực thể (Cross-Entity Isolation):**
  * Ghép dữ liệu của kho `HN01` và `DN01` (DN01 có lượng xuất gấp 100 lần).
  * Đặc trưng của `HN01` không bị lây nhiễm hay ảnh hưởng bởi dữ liệu của `DN01`.
  * *Kết quả:* **ĐẠT**.

### B. Kiểm thử xử lý dữ liệu đầu vào bất thường (`TestAbnormalInputHandling`)
* **Test INPUT 1 — File CSV rỗng (0 bytes):**
  * Tạo file tạm 0 bytes. `build_gold(raw_file=tmp)` phát hiện và ném `ValueError("Cac cot CSV khong dung...")`.
  * *Kết quả:* **ĐẠT**.
* **Test INPUT 2 — File CSV thiếu cột bắt buộc:**
  * Tạo file CSV chỉ có `ngay,ma_kho`. `build_gold` từ chối xử lý và ném `ValueError`.
  * *Kết quả:* **ĐẠT**.
* **Test INPUT 3 — Dữ liệu chứa ngày sai, số âm, ký tự chữ:**
  * Tạo file test gồm 5 dòng: 1 dòng hợp lệ, 1 ngày sai (`2025-99-99`), 1 số lượng âm (`-5`), 1 chữ thay số (`abc`), 1 thiếu mã kho.
  * `build_gold` xử lý trơn tru: `stats["valid"] == 1`, `stats["rejected"] == 4`. File đầu ra chỉ ghi nhận duy nhất 1 dòng hợp lệ, 4 dòng lỗi bị loại bỏ và ghi nhận số lượng loại trừ.
  * *Kết quả:* **ĐẠT**.

### C. Kiểm thử lỗi API ngoại vi bằng Mock (`TestWeatherApiMockErrors`)
* **Test API 1 — Xử lý Timeout:**
  * Dùng `unittest.mock` giả lập `requests.exceptions.Timeout`.
  * `fetch_weather_for_location` tự động thử lại đúng số lần cấu hình và ném `RuntimeError` rõ ràng, không làm chết ngầm tiến trình.
  * *Kết quả:* **ĐẠT**.
* **Test API 2 — Xử lý lỗi HTTP 500 Server Error:**
  * Mock `response.raise_for_status()` ném `HTTPError("500 Server Error")`.
  * Hàm bẫy lỗi và ném `RuntimeError` sau khi hết lượt retry.
  * *Kết quả:* **ĐẠT**.
* **Test API 3 & 4 — Xử lý JSON thiếu trường hoặc rỗng:**
  * Mock JSON thiếu trường `"daily"` hoặc `daily.time = []`.
  * Hàm phát hiện thiếu dữ liệu ngay lập tức và ném lỗi, **tuyệt đối không âm thầm trả về mảng rỗng `[]`**.
  * *Kết quả:* **ĐẠT**.
* **Test API 5 — Phân biệt giá trị thiếu (`None`) với `0.0` thực tế:**
  * Mock API trả về nhiệt độ `None` và lượng mưa `0.0`.
  * Bản ghi xuất ra: `nhiet_do_tb == ""` (lưu chuỗi rỗng để phân biệt mất dữ liệu) và `luong_mua == "0.0"` (giữ nguyên giá trị thực tế không mưa).
  * *Kết quả:* **ĐẠT**.

### D. Kiểm thử chạy lại trên dữ liệu thật & Bảo toàn sản lượng (`Test A3`)
* **Test A3 — Kiểm tra chạy trực tiếp `build_gold()` và Định luật bảo toàn sản lượng:**
  * Kích hoạt trực tiếp `build_gold()` trên dữ liệu thật sau các chỉnh sửa tham số:
    * Đọc: `14,264` dòng; Hợp lệ: `14,264` dòng; Loại: `0` dòng; Nhóm: `14,264`.
  * Kiểm tra tính bảo toàn sản lượng xuất xuyên suốt 3 tầng dữ liệu:
    * Tầng Gold: $\sum \text{tong\_so\_luong\_xuat} = \mathbf{341,163.0}$
    * Tầng Daily Grid: $\sum \text{nhu\_cau\_xuat} = \mathbf{341,163.0}$
    * Tầng Analytical Dataset: $\sum \text{nhu\_cau\_xuat} = \mathbf{341,163.0}$
  * *Đánh giá:* **ĐẠT** (Chứng minh không có bất kỳ đơn vị hàng hóa nào bị mất mát hay nhân đôi trong quá trình làm sạch, zero-filling và tích hợp đa nguồn).

---

## 3. Các thay đổi tối thiểu trong code sản phẩm để khắc phục lỗi

1. **[data_mining/build_gold.py](file:///d:/Các%20hệ%20thống%20phân%20tán/WarehouseManagement/data_mining/build_gold.py):**
   * *Điều chỉnh:* Bổ sung tham số tùy chọn `def build_gold(raw_file=None, gold_file=None)` và trả về từ điển thống kê `{"total", "valid", "rejected", "groups"}`.
   * *Lý do:* Cho phép hàm vừa chạy mặc định trong pipeline chính, vừa có thể nhận các file tạm độc lập trong unit test mà không phải đụng vào file raw thật.
2. **[data_center/etl/extract/extract_weather_api.py](file:///d:/Các%20hệ%20thống%20phân%20tán/WarehouseManagement/data_center/etl/extract/extract_weather_api.py):**
   * *Sửa lỗi (Bugfix):* Thêm đoạn kiểm tra `if not isinstance(daily, dict) or not daily.get("time"): raise ValueError(...)` và bổ sung tham số `retry_delay`.
   * *Lý do:* Trước đây nếu API trả về JSON thiếu trường `daily`, hàm sẽ âm thầm trả về mảng rỗng `[]` mà không báo lỗi. Đoạn code mới đảm bảo lỗi thiếu trường được phát hiện và kích hoạt cơ chế retry/fail-fast minh bạch.

---

## 4. Bảng thống kê dữ liệu sau lần chạy kiểm thử cuối cùng

| Tên tập dữ liệu | Đường dẫn | Số dòng thực tế | Trùng khóa | Giá trị Null | Giá trị bất thường |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Raw Lịch sử xuất** | `data_mining/datasets/raw/lich_su_xuat_hang.csv` | 14,264 | 0 | 0 | 0 |
| **Gold Lịch sử xuất** | `data_mining/datasets/gold/lich_su_xuat_hang_gold.csv` | 14,264 | 0 | 0 | 0 |
| **Daily Grid** | `data_mining/datasets/gold/nhu_cau_xuat_hang_daily.csv` | 21,960 | 0 | 0 | 0 |
| **Thời tiết lịch sử** | `data_mining/datasets/external/thoi_tiet_daily.csv` | 1,098 | 0 | 0 | 0 |
| **Lịch lễ Việt Nam** | `data_mining/datasets/external/lich_daily.csv` | 366 | 0 | 0 | 0 |
| **Analytical Dataset** | `data_mining/datasets/gold/analytical_dataset.csv` | 21,960 | 0 | 0 | 0 |
| **Kết quả dự báo Test** | `data_mining/datasets/gold/forecast_results.csv` | 2,940 | 0 | 0 | 0 (Dự báo $\ge 0$) |

---

## 5. Kết quả đánh giá mô hình Machine Learning

* **Tập Train:** 18,600 dòng (Từ `2025-09-25` đến `2026-07-31`).
* **Tập Test:** 2,940 dòng (Từ `2026-08-01` đến `2026-09-18`).
* **Model Registry:** Đã lưu trữ mô hình tại `data_mining/models/model_registry/` (`ridge_model.joblib`, `rf_model.joblib`).
* **Chi tiết toàn diện:** Xem [evaluation_report.md](file:///d:/Các%20hệ%20thống%20phân%20tán/WarehouseManagement/data_mining/evaluation_report.md).

### 5.1. Bảng so sánh tổng thể trên tập Test (2,940 dòng)

| Phương pháp | MAE (Sai số tuyệt đối TB) | RMSE (Căn bậc hai sai số bình phương TB) | Đánh giá thực nghiệm |
| :--- | :---: | :---: | :--- |
| **Baseline (Trung bình trượt 7 ngày)** | **14.7424** | **18.2691** | Chuẩn mốc nghiệp vụ |
| **Linear Ridge Regression** | **13.9641** | **16.9765** | **Tốt nhất** (Giảm 5.28% MAE so với Baseline) |
| **Random Forest Regressor** | **13.9994** | **17.0254** | Giảm 5.04% MAE so với Baseline |

### 5.2. Đánh giá phân khúc theo Kho và Tính chất ngày xuất

* **Theo kho:**
  * **DN01:** Baseline MAE = 14.8936 | Ridge MAE = 13.9545 | RF MAE = **13.9326** (RF tốt nhất tại Đà Nẵng).
  * **HCM01:** Baseline MAE = 13.9156 | Ridge MAE = **13.4484** | RF MAE = 13.4735 (Ridge tốt nhất tại TP.HCM).
  * **HN01:** Baseline MAE = 15.4179 | Ridge MAE = **14.4892** | RF MAE = 14.5922 (Ridge tốt nhất tại Hà Nội).
* **Theo ngày nhu cầu = 0 vs > 0:**
  * **Ngày nhu cầu = 0 (1,056 dòng - 35.92% test):** Baseline MAE = 15.8214 | Ridge MAE = **15.5247** | RF MAE = 15.6424 (Các mô hình đều dự báo ~15.5 sp do chuỗi trễ quá khứ dương).
  * **Ngày nhu cầu > 0 (1,884 dòng - 64.08% test):** Baseline MAE = 14.1375 | Ridge MAE = **13.0892** | RF MAE = **13.0785** (Mô hình ML vượt trội rõ rệt, giảm > 1.05 đơn vị MAE).

---

## 6. Đánh giá tính đúng đắn của phương pháp & Hạn chế cần báo cáo giảng viên

### 6.1. Đánh giá 4 nội dung trọng tâm trước buổi kiểm tra

| Nội dung kiểm tra | Đánh giá | Bằng chứng kiểm chứng |
| :--- | :---: | :--- |
| **1. Điền số 0 cho ngày không phát sinh giao dịch** | **PASS** *(Có giả định)* | `prepare_demand.py` (dòng 44-57): Lưới đầy đủ 366 ngày $\times$ 3 kho $\times$ 20 sản phẩm = 21,960 dòng. Điền 0 cho 7,696 dòng không có giao dịch (35.05%). Bảo toàn sản lượng 341,163 sp. |
| **2. Chia Train/Test theo thời gian & Lag features** | **PASS** *(Chuẩn 1-step)* | `train_forecast.py` (dòng 42-74): `split_date = "2026-08-01"`. Lag/Rolling dùng `shift(1)` trước `rolling()`, hoàn toàn không rò rỉ target ngày $t$. Dữ liệu đầu vào sẵn sàng vào cuối ngày $t-1$. |
| **3. Lịch lễ Việt Nam & Cách xác định ngày nghỉ** | **PASS** *(Có căn cứ luật)* | `extract_calendar_api.py` (dòng 30-48): Căn cứ Điều 112 & Điều 111 Bộ Luật Lao Động 2019 (Luật 45/2019/QH14). Có 14 ngày lễ, có nghỉ bù Giỗ tổ Hùng Vương (27/04/2026). |
| **4. Tái tạo Pipeline End-to-End thực tế** | **PASS** | `run_pipeline.py` chạy qua 7 bước đạt mã thoát 0 trong 16.84s. Sinh đủ 9 artifacts, tái tạo chuẩn xác MAE Baseline (14.7424), Ridge (13.9641), RF (13.9994). 22/22 unit tests PASS. |

---

### 6.2. Các giả định nghiệp vụ còn tồn tại

1. **Giả định kho hoạt động liên tục (Always-open Warehouse):** Cả 3 kho HN01, DN01, HCM01 đều ghi nhận có giao dịch trong cả 366 ngày. Ngày không có giao dịch của một mặt hàng được xem là ngày mở cửa nhưng lượng bán của mặt hàng đó bằng 0.
2. **Giả định nhu cầu quan sát được tương đương nhu cầu thực tế (Observed vs Unmet Demand):** Dữ liệu xuất kho phản ánh số lượng đã xuất thành công. Nếu kho hết hàng tồn (stockout), nhu cầu khách hàng vẫn có thể $> 0$ nhưng không được ghi nhận. Việc điền 0 phản ánh lượng xuất thực tế, không phải nhu cầu tiềm năng chưa đáp ứng (Lost Sales).
3. **Giả định danh mục sản phẩm ổn định:** 20 mã sản phẩm được giả định lưu hành xuyên suốt cả năm tại cả 3 kho, không có sản phẩm bị khai tử giữa chừng.

---

### 6.3. Hạn chế của mô hình và nội dung cần trình bày với giảng viên

1. **Bản chất bài toán dự báo:** Mô hình thực hiện dự báo **1 bước thời gian (1-step-ahead / Day+1 forecast)** đánh giá trượt trên 49 ngày tập Test (`2026-08-01` đến `2026-09-18`). Để dự báo xa nhiều tuần liên tiếp (multi-step forecast) mà không có số liệu thực tế xen kẽ, cần nâng cấp sang cơ chế Recursive hoặc Direct Multi-step.
2. **Hiện tượng làm phẳng nhu cầu ngắt quãng (Intermittent Demand Smoothing):** 35.05% bản ghi có giá trị 0. Đối với các mặt hàng có nhu cầu đột biến theo lô lớn (lumpy demand), mô hình hồi quy tuyến tính và Random Forest có xu hướng kéo giá trị dự báo về mức trung bình thấp, dẫn đến dự báo dưới đỉnh (underpredicting peaks). Hướng phát triển trong thực tế là mô hình 2 giai đoạn (Hurdle Model hoặc Croston Method).
3. **Mức độ đóng góp của thời tiết:** EDA và hệ số tương quan thực nghiệm cho thấy thời tiết có tương quan rất yếu với nhu cầu xuất ($r \approx -0.004$). Các yếu tố quyết định độ chính xác chủ yếu là tính chu kỳ (ngày trong tuần) và lượng xuất quá khứ gần nhất (`lag_1`, `rolling_mean_7`).

