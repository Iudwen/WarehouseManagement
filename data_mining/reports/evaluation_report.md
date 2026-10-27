# BÁO CÁO ĐÁNH GIÁ MÔ HÌNH MACHINE LEARNING DỰ BÁO NHU CẦU XUẤT KHO

**Dự Án:** Distributed Warehouse Management System (Phân hệ Data Mining)  
**Thời điểm tạo:** 2026-10-27 (Walk-forward calibration và time holdout)
**Môi trường thực thi:** Python 3.11.5, scikit-learn, lightgbm, pandas, numpy  
**Mã nguồn thực thi:** `data_mining/models/train_forecast.py`
**Nguồn dữ liệu gần nhất:** PostgreSQL central.xuat_hang_central; snapshot 2026-10-27T14:39:21.011605+07:00; 21,722 source transactions; 0 sales transactions; 0 future transactions ignored; 12,494 daily warehouse-product groups; 2025-10-28 to 2026-10-27.
**Cảnh báo nguồn:** Snapshot này được tạo bằng seed/simulator sau khi reset các bảng giao dịch và tồn kho. Đây là dữ liệu tổng hợp phục vụ demo, không phải lịch sử giao dịch thực; các metric trong báo cáo chỉ mô tả bộ seed này và không xác nhận độ chính xác trên nhu cầu vận hành thật.

---

## 1. Bài toán dự báo và đơn vị dự báo
* **Bài toán nghiệp vụ:** Dự báo sản lượng xuất hàng ngắn hạn (1 ngày tới / 1-step-ahead forecast) cho từng mặt hàng tại từng kho phân tán (HN01, DN01, HCM01), phục vụ kế hoạch xuất kho và cảnh báo điều phối tồn kho liên kho.
* **Đơn vị dự báo (Granularity):** Ngày × Kho × Mã sản phẩm (`ngay`, `ma_kho`, `ma_sp`).
* **Biến mục tiêu ($y$):** `nhu_cau_xuat` (số lượng kiện/sản phẩm thực tế xuất ra trong ngày, giá trị thực >= 0).

---

## 2. Dữ liệu đầu vào và các đặc trưng sử dụng
Dữ liệu mô hình lấy từ Analytical Dataset (`data_mining/datasets/gold/analytical_dataset.csv`, 21,900 dòng). Nhu cầu gốc được đồng bộ từ PostgreSQL Central; các đặc trưng lịch/API được ghép trước khi huấn luyện.
1. **Đặc trưng độ trễ chuỗi thời gian (Time-series Lags):**
   * `lag_1`: Lượng xuất thực tế ngày hôm qua ($t-1$) của đúng cặp (kho, sản phẩm).
   * `lag_7`: Lượng xuất thực tế cùng thứ tuần trước ($t-7$) để bắt tính chu kỳ tuần.
2. **Đặc trưng thống kê trượt (Rolling Statistics):**
   * `rolling_mean_7`: Trung bình trượt 7 ngày gần nhất ($t-7$ đến $t-1$), tính bằng `shift(1).rolling(7)`.
   * Hiệu chỉnh dự báo Gradient Boosting bằng một hệ số chung được chọn chỉ từ dự báo out-of-fold walk-forward: `1.11`.
3. **Đặc trưng lịch và ngày nghỉ lễ Việt Nam:**
   * `thu_trong_tuan`: Thứ trong tuần (0: Thứ Hai đến 6: Chủ Nhật).
   * `la_cuoi_tuan`: 1 nếu là Thứ Bảy hoặc Chủ Nhật, 0 nếu ngày thường.
   * `la_ngay_le`: 1 nếu là ngày nghỉ lễ chính thức theo Điều 112 Bộ Luật Lao Động 2019, 0 nếu không.
4. **Đặc trưng định danh thực thể (One-hot Encoding):**
   * 3 biến định danh kho: `ma_kho_DN01`, `ma_kho_HCM01`, `ma_kho_HN01`.
   * 20 biến định danh sản phẩm: `ma_sp_SP001` đến `ma_sp_SP020`.
   * Không dùng thời tiết quan trắc của ngày dự báo vì thông tin đó chưa có tại thời điểm dự báo.

---

## 3. Cách chia Train/Test theo thời gian & Chống rò rỉ dữ liệu
* **Phương pháp chia tập:** Phân chia nghiêm ngặt theo trục thời gian (Time-series Split), tuyệt đối không xáo trộn ngẫu nhiên (no random shuffle) nhằm mô phỏng đúng thực tế vận hành:
  * **Tập Huấn luyện (Train set):** Từ `2025-11-04` đến `2026-08-16` (17,160 bản ghi).
  * **Tập Kiểm thử (Test set):** Từ `2026-08-17` đến `2026-10-27` (4,320 bản ghi, 72 ngày out-of-sample; chiếm 20% số ngày).
  * **Walk-forward validation trước test:** MAE Ridge trung bình 12.9872; Gradient Boosting sau hiệu chỉnh 13.2986; hệ số hiệu chỉnh được chọn bằng WAPE trên các dự báo out-of-fold.
* **Bảo đảm không rò rỉ thông tin tương lai (Data Leakage):**
  * `shift(1)` được thực thi TRƯỚC khi tính cửa sổ `rolling(7)`, bảo đảm đặc trưng tại ngày $t$ không chứa target ngày $t$.
  * Toàn bộ tập Test nằm sau tập Train (`min(Test) = 2026-08-17 > max(Train) = 2026-08-16`).
  * Các kiểm thử toán học trong `test_data_mining_suite.py` đã xác minh: khi cố tình thay đổi nhãn ngày $t$ thành 999,999, vector đặc trưng ngày $t$ hoàn toàn bất biến.

---

## 4. Nguyên lý của các mô hình so sánh

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
5. **Gradient Boosting Regressor (absolute error):**
   * *Nguyên lý:* Tối ưu trực tiếp sai số tuyệt đối (MAE), dùng 100 cây nông (`max_depth=2`, `min_samples_leaf=20`) để giảm quá khớp trên chuỗi nhu cầu nhiễu.

---

## 5. Bảng MAE/RMSE từ lần chạy thực tế mới nhất

### 5.1. Đánh giá tổng thể trên toàn bộ tập Test (4,320 dòng)

| Mô hình | MAE | RMSE | WAPE (%) | Accuracy quy đổi (100 − WAPE) |
| :--- | :---: | :---: | :---: | :---: |
| **Baseline (Rolling Mean 7)** | **13.8485** | **24.8472** | 67.61% | 32.39% |
| **Linear Ridge Regression** | **13.1538** | **23.0511** | 64.22% | 35.78% |
| **Random Forest Regressor** | **13.2276** | **23.0962** | 64.58% | 35.42% |
| **LightGBM Regressor** | **13.3828** | **23.1393** | 65.34% | 34.66% |
| **Gradient Boosting (absolute_error)** | **13.2003** | **24.2824** | 64.44% | 35.56% |
| **Mô hình chính (Ridge Regression)** | **13.1538** | **23.0511** | **64.22%** | **35.78%** |

Accuracy quy đổi của mô hình chính là **35.78%**; mục tiêu trên 90% chưa đạt. Đây là `100 − WAPE`, không phải tỷ lệ phân loại đúng.

### 5.2. Đánh giá chi tiết theo từng kho

| Mã kho | MAE Baseline | MAE Ridge | MAE Random Forest | MAE LightGBM | MAE Gradient Boosting |
| :--- | :---: | :---: | :---: | :---: | :---: |
| DN01 | 13.9991 | 13.1306 | 13.1707 | 13.2913 | 13.2403 |
| HCM01 | 13.9717 | 13.3296 | 13.4724 | 13.6266 | 13.4545 |
| HN01 | 13.5749 | 13.0014 | 13.0402 | 13.2313 | 12.9060 |

### 5.3. Đánh giá theo nhóm ngày: Nhu cầu bằng 0 vs Nhu cầu dương

| Phân khúc ngày | Số bản ghi | Tỷ lệ (%) | MAE Baseline | MAE Ridge | MAE Random Forest | MAE LightGBM | MAE Gradient Boosting |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Nhu cầu = 0 | 1,895 | 43.87% | 8.8075 | 8.8886 | 8.9479 | 9.4248 | 6.7793 |
| Nhu cầu > 0 | 2,425 | 56.13% | 17.7879 | 16.4869 | 16.5722 | 16.4762 | 18.2179 |

---

## 6. Mô hình được lựa chọn và căn cứ quyết định
* **Mô hình khuyến nghị triển khai chính (Primary):** **Ridge Regression**, dự báo nhân hệ số hiệu chỉnh `1.11` được chọn từ walk-forward validation.
* **Mô hình đối sánh:** Ridge Regression, Random Forest và LightGBM.
* **Các căn cứ khoa học & thực tiễn:**
  1. **Walk-forward validation:** MAE trung bình của mô hình chính sau hiệu chỉnh là 12.9872; Ridge là 12.9872.
  2. **Kiểm thử cuối:** MAE mô hình chính 13.1538, baseline 13.8485, cải thiện 5.02% so với baseline.
  3. **Đánh đổi chỉ số:** RMSE mô hình chính là 23.0511, Ridge là 23.0511; mô hình được chọn để tối ưu MAE, không phải mọi loại sai số.
  4. Mô hình và dự báo đã được chặn cận dưới 0; tập kiểm thử không dùng thời tiết quan trắc của chính ngày cần dự báo.
  5. Model Registry đã được huấn luyện lại trên toàn bộ 21,480 quan sát có đặc trưng (đến 2026-10-27); holdout metrics ở trên vẫn chỉ tính từ mô hình huấn luyện trên phần Train.

---

## 7. Hạn chế của dữ liệu và mô hình cần lưu ý
1. **Bài toán 1 bước thời gian (1-step-ahead):** Mô hình dự báo ngày mai dựa trên số liệu thực tế đã chốt hôm nay. Nếu muốn dự báo 7 ngày hay 30 ngày liên tiếp mà không có số liệu thực tế xen kẽ, cần triển khai cơ chế Recursive Forecasting.
2. **Nhu cầu ngắt quãng (Intermittent Demand):** 43.87% các dòng trong tập test có nhu cầu xuất bằng 0. Gradient Boosting có MAE nhóm này 6.7793, và MAE nhóm có nhu cầu dương 18.2179; cần theo dõi cả hai phân khúc.
3. **Ảnh hưởng của thời tiết:** Mô hình không dùng thời tiết quan trắc cùng ngày vì không khả dụng tại thời điểm dự báo. Nếu muốn dùng, cần ghép dự báo thời tiết có dấu thời gian phát hành để tránh nhìn trước tương lai.
4. **Giả định lượng xuất quan sát được (Observed vs Unmet Demand):** Dữ liệu xuất kho phản ánh số lượng đã xuất thành công. Nếu kho bị đứt hàng (stockout), lượng xuất bằng 0 nhưng nhu cầu khách vẫn có; mô hình hiện tại dự báo lượng xuất thực tế quan sát được, không phải nhu cầu tiềm năng.
5. **Thiếu dữ liệu đơn hàng khách hàng:** Snapshot DB hiện có 0 dòng trong `ban_hang_central`; do đó chưa thể huấn luyện/đánh giá nhu cầu khách chưa được đáp ứng từ bảng này. Muốn dự báo nhu cầu thực thay vì lượng đã xuất, cần ghi nhận đơn đặt hàng, số lượng yêu cầu, giao thiếu/hủy và trạng thái hết hàng.

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

---

## Weekly forecast alternative

A separate **one-week-ahead** warehouse-product forecast was evaluated on 9 untouched weekly origins. The selected Extra Trees Regressor (weekly) achieved WAPE **23.53%** (100 − WAPE: **76.47%**), versus **24.38%** for the rolling 8-week baseline. This is a different target horizon from the daily score above and must not be presented as an improvement to the daily model. The latest source date is 2026-10-27; refresh real operational data before using it live. Details: `data_mining/weekly_evaluation_report.md`.


## 15-day and 30-day cumulative forecasts

Direct horizon-specific Ridge Regression models predict the total demand per warehouse-product pair for the next 15 or 30 calendar days. Holdout target windows do not overlap.

| Horizon | Model | MAE | RMSE | MAPE* | MAPE n | WAPE | Origins |
|---:|---|---:|---:|---:|---:|---:|---:|
| 15 days | Ridge Regression | 51.66 | 88.53 | 58.41% | 297/3 excluded | 16.68% | 5 |
| 15 days | 30-day rolling mean baseline | 59.53 | 106.77 | 41.73% | 297/3 excluded | 19.22% | 5 |
| 30 days | Ridge Regression | 75.63 | 121.08 | 40.49% | 180/0 excluded | 12.18% | 3 |
| 30 days | 30-day rolling mean baseline | 97.84 | 163.67 | 32.47% | 180/0 excluded | 15.76% | 3 |

`100 - WAPE` is an aggregate relative-error score, not classification accuracy, and these metrics are not comparable to the daily one-step forecast above. MAPE excludes rows with zero actual demand because percentage error is undefined for zero actuals. MAE and RMSE are measured in units per warehouse-product pair for the full horizon. The 30-day score is preliminary because it has only 3 independent holdout origins. The current source date is 2026-10-27 (0 days old); refresh actual data before using these forecasts operationally. Details: `data_mining/horizon_evaluation_report.md`.
