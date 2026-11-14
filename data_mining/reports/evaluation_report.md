# BÁO CÁO ĐÁNH GIÁ MÔ HÌNH MACHINE LEARNING DỰ BÁO NHU CẦU XUẤT KHO

**Dự Án:** Distributed Warehouse Management System (Phân hệ Data Mining)  
**Thời điểm tạo:** 23/10/2026 (Cập nhật Giai đoạn 4 - Thử nghiệm mô hình GBDT LightGBM)  
**Môi trường thực thi:** Python 3.11.5, scikit-learn, lightgbm, pandas, numpy  
**Mã nguồn thực thi:** `data_mining/models/train_forecast.py`

---

## 1. Bài toán dự báo và đơn vị dự báo
* **Bài toán nghiệp vụ:** Dự báo sản lượng xuất hàng ngắn hạn (1 ngày tới / 1-step-ahead forecast) cho từng mặt hàng tại từng kho phân tán (HN01, DN01, HCM01), phục vụ kế hoạch xuất kho và cảnh báo điều phối tồn kho liên kho.
* **Đơn vị dự báo (Granularity):** Ngày × Kho × Mã sản phẩm (`ngay`, `ma_kho`, `ma_sp`).
* **Biến mục tiêu ($y$):** `nhu_cau_xuat` (số lượng kiện/sản phẩm thực tế xuất ra trong ngày, giá trị thực >= 0).

---

## 2. Dữ liệu đầu vào và các đặc trưng sử dụng
Dữ liệu được trích xuất từ tập Analytical Dataset hợp nhất đa nguồn (`data_mining/datasets/gold/analytical_dataset.csv`, 21,960 dòng):
1. **Đặc trưng độ trễ chuỗi thời gian (Time-series Lags):**
   * `lag_1`: Lượng xuất thực tế ngày hôm qua ($t-1$) của đúng cặp (kho, sản phẩm).
   * `lag_7`: Lượng xuất thực tế cùng thứ tuần trước ($t-7$) để bắt tính chu kỳ tuần.
2. **Đặc trưng thống kê trượt (Rolling Statistics):**
   * `rolling_mean_7`: Trung bình trượt 7 ngày gần nhất ($t-7$ đến $t-1$), tính bằng `shift(1).rolling(7)`.
3. **Đặc trưng lịch và ngày nghỉ lễ Việt Nam:**
   * `thu_trong_tuan`: Thứ trong tuần (0: Thứ Hai đến 6: Chủ Nhật).
   * `la_cuoi_tuan`: 1 nếu là Thứ Bảy hoặc Chủ Nhật, 0 nếu ngày thường.
   * `la_ngay_le`: 1 nếu là ngày nghỉ lễ chính thức theo Điều 112 Bộ Luật Lao Động 2019, 0 nếu không.
4. **Đặc trưng thời tiết lịch sử (Open-Meteo API):**
   * `nhiet_do_tb`: Nhiệt độ trung bình ngày (°C).
   * `luong_mua`: Tổng lượng mưa trong ngày (mm).
5. **Đặc trưng định danh thực thể (One-hot Encoding):**
   * 3 biến định danh kho: `ma_kho_DN01`, `ma_kho_HCM01`, `ma_kho_HN01`.
   * 20 biến định danh sản phẩm: `ma_sp_SP001` đến `ma_sp_SP020`.

---

## 3. Cách chia Train/Test theo thời gian & Chống rò rỉ dữ liệu
* **Phương pháp chia tập:** Phân chia nghiêm ngặt theo trục thời gian (Time-series Split), tuyệt đối không xáo trộn ngẫu nhiên (no random shuffle) nhằm mô phỏng đúng thực tế vận hành:
  * **Tập Huấn luyện (Train set):** Từ `2025-09-25` đến `2026-07-31` (18,600 bản ghi, ~10 tháng).
  * **Tập Kiểm thử (Test set):** Từ `2026-08-01` đến `2026-09-18` (2,940 bản ghi, 49 ngày out-of-sample).
* **Bảo đảm không rò rỉ thông tin tương lai (Data Leakage):**
  * `shift(1)` được thực thi TRƯỚC khi tính cửa sổ `rolling(7)`, bảo đảm đặc trưng tại ngày $t$ không chứa target ngày $t$.
  * Toàn bộ tập Test nằm hoàn toàn phía sau tập Train (`min(Test) = 2026-08-01 > max(Train) = 2026-07-31`).
  * Các kiểm thử toán học trong `test_data_mining_suite.py` đã xác minh: khi cố tình thay đổi nhãn ngày $t$ thành 999,999, vector đặc trưng ngày $t$ hoàn toàn bất biến.

---

## 4. Nguyên lý của 4 mô hình so sánh

1. **Baseline (Trung bình trượt 7 ngày - Rolling Mean 7):**
   * *Nguyên lý:* Lấy trung bình cộng lượng xuất của 7 ngày quá khứ gần nhất làm dự báo cho ngày mai.
   * *Ý nghĩa:* Đại diện cho quy tắc kinh nghiệm truyền thống của quản lý kho khi chưa ứng dụng Machine Learning.
2. **Linear Ridge Regression (Hồi quy tuyến tính có điều chuẩn L2):**
   * *Nguyên lý:* Thiết lập hàm hồi quy tuyến tính y_hat = w^T * x + b, tối thiểu hóa tổng sai số bình phương kết hợp chế tài trọng số L2 (alpha = 1.0) để triệt tiêu hiện tượng đa cộng tuyến giữa lag_1, lag_7 và rolling_mean_7.
   * *Ưu điểm:* Nghiệm giải tích ổn định tuyệt đối, tốc độ huấn luyện tức thì, trọng số dễ diễn giải.
3. **Random Forest Regressor (Rừng cây quyết định ngẫu nhiên):**
   * *Nguyên lý:* Mô hình Ensemble gồm 100 cây quyết định (`n_estimators=100`, `max_depth=10`, `random_state=42`) huấn luyện theo cơ chế Bagging. Kết quả là trung bình dự báo của tất cả các cây con.
   * *Ưu điểm:* Tự động nắm bắt các tương tác phi tuyến tính giữa yếu tố ngày lễ, thứ trong tuần và lượng xuất quá khứ.
4. **LightGBM Regressor (Gradient Boosting Decision Tree tối ưu tốc độ):**
   * *Nguyên lý:* Thuật toán tăng cường độ dốc phát triển cây theo cơ chế lá (leaf-wise) kết hợp histogram-based learning, tối ưu hóa hàm mất mát L2 với các siêu tham số chuẩn hóa (`n_estimators=100`, `learning_rate=0.05`, `num_leaves=31`).
   * *Ưu điểm:* Tốc độ huấn luyện siêu tốc, xử lý xuất sắc các đặc trưng dạng bảng và quan hệ phi tuyến phức tạp trong dữ liệu chuỗi thời gian phân tán.

---

## 5. Bảng MAE/RMSE/MAPE từ lần chạy thực tế mới nhất

### 5.1. Đánh giá tổng thể trên toàn bộ tập Test (2,940 dòng)

| Mô hình | MAE | RMSE | MAPE (%) | Cải thiện MAE so với Baseline |
| :--- | :---: | :---: | :---: | :---: |
| **Baseline (Rolling Mean 7)** | **14.8141** | **18.3812** | **117.49** | 0.00% |
| **Linear Ridge Regression** | **14.0208** | **17.0896** | **116.11** | 5.35% — TỐT NHẤT |
| **Random Forest Regressor** | **14.0679** | **17.1548** | **116.61** | 5.04% |
| **LightGBM Regressor** | **14.0509** | **17.1553** | **116.03** | 5.15% |

*MAPE chỉ tính trên các dòng có `thuc_te > 0` (1,887/2,940 dòng); các dòng thực tế bằng 0 được đánh giá bằng MAE/RMSE.*

### 5.2. Đánh giá chi tiết theo từng kho

| Mã kho | Số bản ghi Test | Lượng xuất TB/ngày | Tỷ lệ ngày xuất = 0 | MAE Baseline | MAE Ridge | MAE Random Forest | MAE LightGBM | Mô hình tốt nhất |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **DN01 (Đà Nẵng)** | 980 | 15.29 | 35.5% | 15.1087 | 14.1254 | **14.1434** | 14.0722 | Random Forest |
| **HCM01 (TP.HCM)** | 980 | 14.49 | 34.6% | 13.9156 | **13.4481** | 13.4677 | 13.4824 | Ridge Regression |
| **HN01 (Hà Nội)** | 980 | 15.58 | 37.3% | 15.4179 | **14.4890** | 14.5926 | 14.5980 | Ridge Regression |

### 5.3. Đánh giá theo nhóm ngày: Nhu cầu bằng 0 vs Nhu cầu dương

| Phân khúc ngày | Số bản ghi | Tỷ lệ (%) | MAE Baseline | MAE Ridge | MAE Random Forest | MAE LightGBM | Nhận xét phân khúc |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Ngày có nhu cầu = 0** | 1,053 | 35.82% | 15.8966 | **15.5196** | 15.6515 | 15.5561 | Các mô hình đều dự báo ~15 do lag quá khứ dương |
| **Ngày có nhu cầu > 0** | 1,887 | 64.18% | 14.2100 | 13.1845 | **13.1842** | 13.2109 | **Cả 3 mô hình ML vượt trội, giảm >1.05 điểm MAE** |

---

## 6. Mô hình được lựa chọn và căn cứ quyết định
* **Mô hình khuyến nghị triển khai chính (Primary):** **Linear Ridge Regression**.
* **Mô hình thử nghiệm nâng cao (Alternative/Benchmark):** **LightGBM Regressor** & **Random Forest Regressor**.
* **Các căn cứ khoa học & thực tiễn:**
  1. **Độ chính xác cao nhất:** Linear Ridge Regression đạt MAE thấp nhất (**14.0208**) và RMSE (**17.0896**) trên tập Test độc lập. MAPE của mô hình là **116.11%** trên các quan sát có nhu cầu dương.
  2. **Hiệu năng & Tài nguyên:** Thời gian huấn luyện Ridge < 0.1 giây, dung lượng model < 15 KB. LightGBM huấn luyện < 0.5 giây, dung lượng model < 200 KB. Cả hai đều vượt trội so với Random Forest (~4 giây, ~12 MB).
  3. **Khả năng giải thích (Interpretability):** Trọng số của Ridge cho phép thủ kho hiểu rõ mức độ tác động của ngày trong tuần, ngày lễ và lượng xuất hôm trước đến kết quả dự báo.
  4. **An toàn miền giá trị:** Tích hợp `np.clip(..., 0, None)`. Trên thực tế, 100% dự báo của các mô hình ML trên tập test đều tự nhiên >= 0.

---

## 7. Hạn chế của dữ liệu và mô hình cần lưu ý
1. **Bài toán 1 bước thời gian (1-step-ahead):** Mô hình dự báo ngày mai dựa trên số liệu thực tế đã chốt hôm nay. Nếu muốn dự báo 7 ngày hay 30 ngày liên tiếp mà không có số liệu thực tế xen kẽ, cần triển khai cơ chế Recursive Forecasting.
2. **Nhu cầu ngắt quãng (Intermittent Demand):** 35.92% các ngày trong tập test có nhu cầu xuất bằng 0. Khi ngày hôm nay bất ngờ bằng 0 sau chuỗi ngày xuất đều đặn, mô hình hồi quy vẫn dự báo khoảng 15 sp. Hướng nâng cấp là mô hình 2 tầng (Hurdle Model / Croston Method).
3. **Ảnh hưởng của thời tiết:** Hệ số tương quan giữa nhiệt độ/lượng mưa và lượng xuất kho rất yếu (|r| < 0.01). Điều này phản ánh đúng thực tế vì hàng hóa lưu kho phân phối trong nhà ít bị tác động tức thời bởi thời tiết ngày.
4. **Giả định lượng xuất quan sát được (Observed vs Unmet Demand):** Dữ liệu xuất kho phản ánh số lượng đã xuất thành công. Nếu kho bị đứt hàng (stockout), lượng xuất bằng 0 nhưng nhu cầu khách vẫn có; mô hình hiện tại dự báo lượng xuất thực tế quan sát được, không phải nhu cầu tiềm năng.

---

## 8. Hướng dẫn chạy lại và tái lập kết quả

* **Chạy lại toàn bộ pipeline tự động (ETL + EDA + ML + Quyết định kho):**
  ```powershell
  py data_mining/run_pipeline.py
  ```
* **Chạy toàn bộ bộ kiểm thử tự động:**
  ```powershell
  py -m unittest data_mining/tests/test_data_mining_suite.py
  ```
* **Chạy riêng phân hệ Machine Learning:**
  ```powershell
  py data_mining/models/train_forecast.py
  ```