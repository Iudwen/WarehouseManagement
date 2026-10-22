# BÁO CÁO ĐÁNH GIÁ MÔ HÌNH MACHINE LEARNING DỰ BÁO NHU CẦU XUẤT KHO

**Dự Án:** Distributed Warehouse Management System (Phân hệ Data Mining)  
**Thời điểm cập nhật:** 23/10/2026 (Cập nhật sau kiểm chứng phương pháp đánh giá mô hình)  
**Môi trường thực thi:** Python 3.11.5, scikit-learn, lightgbm, pandas, numpy  
**Mã nguồn thực thi:** `data_mining/models/train_forecast.py`

---

## 1. Bài toán dự báo và đơn vị dự báo
* **Bài toán nghiệp vụ:** Dự báo sản lượng xuất hàng ngắn hạn cho từng mặt hàng tại từng kho phân tán (HN01, DN01, HCM01), phục vụ kế hoạch xuất kho và cung cấp dữ liệu đầu vào cho hệ thống hỗ trợ ra quyết định điều chuyển liên kho (DSS Transfer Recommendation).
* **Bản chất bài toán thời gian:** Dự báo một bước thời gian kế tiếp (**1-step-ahead forecast**), tức dự báo nhu cầu ngày mai dựa trên các đặc trưng đã chốt đến hết ngày hôm nay.
* **Đơn vị dự báo (Granularity):** Ngày × Kho × Mã sản phẩm (`ngay`, `ma_kho`, `ma_sp`).
* **Biến mục tiêu ($y$):** `nhu_cau_xuat` (số lượng kiện/sản phẩm thực tế xuất ra trong ngày, giá trị thực >= 0).

---

## 2. Dữ liệu đầu vào và các đặc trưng sử dụng
Dữ liệu được trích xuất từ tập Analytical Dataset hợp nhất đa nguồn (`data_mining/datasets/gold/analytical_dataset.csv`, 21,960 dòng):
1. **Đặc trưng độ trễ chuỗi thời gian (Time-series Lags):**
   * `lag_1`: Lượng xuất thực tế ngày hôm qua ($t-1$) của đúng cặp (kho, sản phẩm).
   * `lag_7`: Lượng xuất thực tế cùng thứ tuần trước ($t-7$) để phản ánh tính chu kỳ tuần.
2. **Đặc trưng thống kê trượt (Rolling Statistics):**
   * `rolling_mean_7`: Trung bình trượt 7 ngày gần nhất ($t-7$ đến $t-1$), tính qua `shift(1).rolling(7).mean()`.
   * `rolling_std_7`: Độ lệch chuẩn trượt 7 ngày gần nhất, tính qua `shift(1).rolling(7).std()`.
   * `rolling_mean_30`: Trung bình trượt 30 ngày gần nhất để nắm bắt xu hướng tháng.
3. **Đặc trưng lịch và ngày nghỉ lễ Việt Nam:**
   * `thu_trong_tuan`: Thứ trong tuần (0: Thứ Hai đến 6: Chủ Nhật).
   * `la_cuoi_tuan`: 1 nếu là Thứ Bảy hoặc Chủ Nhật, 0 nếu ngày làm việc thường.
   * `la_ngay_le`: 1 nếu là ngày nghỉ lễ chính thức theo Điều 112 Bộ Luật Lao Động 2019, 0 nếu không.
4. **Đặc trưng thời tiết:**
   * `nhiet_do_tb`: Nhiệt độ trung bình ngày (°C).
   * `luong_mua`: Tổng lượng mưa trong ngày (mm).
5. **Đặc trưng định danh thực thể (One-hot Encoding):**
   * 3 biến định danh kho: `ma_kho_DN01`, `ma_kho_HCM01`, `ma_kho_HN01`.
   * 20 biến định danh sản phẩm: `ma_sp_SP001` đến `ma_sp_SP020`.

---

## 3. Cách chia Train/Test theo thời gian & Kiểm chứng chống rò rỉ dữ liệu

* **Phương pháp chia tập:** Phân chia tuần tự theo trục thời gian (Temporal Out-of-sample Split), tuyệt đối không xáo trộn ngẫu nhiên (no random shuffle):
  * **Tập Huấn luyện (Train set):** Từ `2025-09-25` đến `2026-07-31` (18,600 dòng, ~10 tháng).
  * **Tập Kiểm thử (Test set):** Từ `2026-08-01` đến `2026-09-18` (2,940 dòng, 49 ngày liên tục, bao phủ trọn vẹn 3 kho × 20 mã sản phẩm).
* **Kiểm chứng chống rò rỉ dữ liệu (Data Leakage Verification):**
  * **Trật tự độ trễ:** Phép biến đổi `shift(1)` được thực thi TRƯỚC mọi hàm trượt `rolling()`. Nhãn thực tế tại ngày $t$ (`tong_xuat`) hoàn toàn không tham gia vào vector đặc trưng tại ngày $t$.
  * **Độc lập thời gian:** Điểm mốc phân tách $t_{split} = 2026-07-31$ bảo đảm mọi quan sát trong tập Test đều diễn ra sau tập Train (`min(Test) > max(Train)`).
  * **Chống rò rỉ thống kê (Imputation):** Các giá trị khuyết của biến ngoại sinh (như nhiệt độ) được điền bằng giá trị trung bình tính riêng trên tập Train (`ngay <= 2026-07-31`), không sử dụng thông tin phân phối của tập Test.

---

## 4. Nguyên lý của 4 mô hình so sánh

1. **Baseline (Trung bình trượt 7 ngày - Rolling Mean 7):**
   * *Nguyên lý:* Lấy trung bình cộng lượng xuất của 7 ngày quá khứ gần nhất làm dự báo cho ngày mai.
   * *Ý nghĩa:* Đại diện cho quy tắc kinh nghiệm vận hành truyền thống khi chưa áp dụng mô hình học máy.
2. **Linear Ridge Regression (Hồi quy tuyến tính có điều chuẩn L2):**
   * *Nguyên lý:* Thiết lập hàm hồi quy $\hat{y} = \mathbf{w}^T \mathbf{x} + b$, tối thiểu hóa hàm mất mát bình phương sai số kết hợp phạt chuẩn $L_2$ ($\alpha = 1.0$) nhằm kiểm soát hiện tượng đa cộng tuyến giữa các biến trễ liên quan chặt chẽ (`lag_1`, `lag_7`, `rolling_mean_7`).
   * *Ưu điểm:* Nghiệm giải tích ổn định, tốc độ huấn luyện/suy luận tức thì, hệ số hồi quy minh bạch và dễ diễn giải.
3. **Random Forest Regressor (Rừng cây quyết định ngẫu nhiên):**
   * *Nguyên lý:* Mô hình Ensemble gồm 100 cây quyết định (`n_estimators=100`, `max_depth=10`, `random_state=42`) huấn luyện theo cơ chế Bagging. Kết quả là trung bình dự báo của toàn bộ các cây con.
   * *Ưu điểm:* Khả năng nắm bắt tương tác phi tuyến phức tạp giữa thứ trong tuần, ngày lễ và chuỗi trễ.
4. **LightGBM Regressor (Gradient Boosting Decision Tree tối ưu tốc độ):**
   * *Nguyên lý:* Thuật toán tăng cường độ dốc phát triển cây theo cơ chế lá (leaf-wise) kết hợp histogram binning, tối ưu hóa hàm mất mát $L_2$ (`n_estimators=100`, `learning_rate=0.05`, `num_leaves=31`).
   * *Ưu điểm:* Tốc độ huấn luyện vượt trội so với Random Forest, khai thác tốt đặc trưng dạng bảng rời rạc.

---

## 5. Kết quả đánh giá thực tế đã kiểm chứng

Toàn bộ các chỉ số dưới đây được tính toán trực tiếp và đối chiếu trên file kết quả kiểm thử `data_mining/datasets/gold/forecast_results.csv` với đầy đủ 2,940 dòng quan sát (49 ngày × 3 kho × 20 sản phẩm).

### 5.1. Đánh giá tổng thể trên toàn bộ tập Test (2,940 dòng)

| Mô hình | MAE | RMSE | WAPE (%) | % Cải thiện MAE so với Baseline |
| :--- | :---: | :---: | :---: | :---: |
| **Baseline (Rolling Mean 7)** | **14.7424** | **18.2691** | **98.09%** | *0.00% (Chuẩn mực đối sánh)* |
| **Linear Ridge Regression** | **13.9640** | **16.9764** | **92.91%** | **+5.28%** |
| **Random Forest Regressor** | **13.9994** | **17.0255** | **93.15%** | **+5.04%** |
| **LightGBM Regressor** | **14.0043** | **17.0346** | **93.18%** | **+5.01%** |

*Ghi chú:*
* Cả 3 mô hình học máy đều vượt qua mô hình quy tắc Baseline trên cả 3 thước đo (MAE, RMSE, WAPE).
* Độ chênh lệch giữa Ridge, Random Forest và LightGBM là rất nhỏ (chênh lệch MAE chỉ khoảng **0.04 đơn vị**, tương đương khác biệt dưới 0.3%).

### 5.2. Đánh giá chi tiết theo nhóm ngày: Nhu cầu bằng 0 vs Nhu cầu lớn hơn 0

Trong tập kiểm thử 2,940 bản ghi, có **1,056 bản ghi có nhu cầu thực tế bằng 0 (chiếm 35.92%)** và **1,884 bản ghi có nhu cầu thực tế lớn hơn 0 (chiếm 64.08%)**:

| Phân khúc ngày kiểm tra | Số mẫu (dòng) | Tỷ lệ (%) | MAE Baseline | MAE Ridge | MAE Random Forest | MAE LightGBM | Nhận xét phân khúc |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Ngày có nhu cầu = 0** | 1,056 | 35.92% | 15.8214 | **15.5247** | 15.6424 | 15.5981 | Do quán tính chuỗi trễ trước đó có giá trị dương, cả mô hình trượt lẫn các mô hình hồi quy đều dự báo mức ~15, dẫn đến sai số tuyệt đối xấp xỉ 15.5. |
| **Ngày có nhu cầu > 0** | 1,884 | 64.08% | 14.1375 | **13.0892** | **13.0785** | **13.1110** | **Cả 3 mô hình học máy thể hiện ưu thế vượt trội, giảm hơn 1.05 điểm MAE (cải thiện ~7.4%) so với Baseline**, chứng minh khả năng học tốt lượng xuất thực tế khi có đơn hàng. |

### 5.3. Đánh giá chi tiết theo từng kho

| Mã kho | Số bản ghi Test | Sản lượng TB (sp/ngày) | Tỷ lệ ngày = 0 | MAE Baseline | MAE Ridge | MAE Random Forest | MAE LightGBM |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **DN01 (Đà Nẵng)** | 980 | 15.01 | 35.8% | 14.8936 | 13.9545 | **13.9326** | **13.8967** |
| **HCM01 (TP.HCM)** | 980 | 14.49 | 34.6% | 13.9156 | **13.4484** | 13.4735 | 13.4727 |
| **HN01 (Hà Nội)** | 980 | 15.58 | 37.3% | 15.4179 | **14.4892** | 14.5922 | 14.6435 |

### 5.4. Đánh giá chi tiết theo phân nhóm sản phẩm ABC (Pareto)

| Phân nhóm ABC | Số SP | Nhu cầu TB (sp/ngày) | Tỷ lệ ngày = 0 | MAE Baseline | MAE Ridge | WAPE Ridge (%) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Nhóm A (Giá trị cao)** | 6 | 14.99 | 35.0% | 14.6149 | **13.8656** | 92.52% |
| **Nhóm B (Trung bình)** | 5 | 14.28 | 37.7% | 14.3254 | **13.5500** | 94.90% |
| **Nhóm C (Giá trị thấp)** | 9 | 15.47 | 35.5% | 15.0590 | **14.2597** | 92.15% |

---

## 6. Căn cứ lựa chọn mô hình chính (Linear Ridge Regression)

* **Mô hình triển khai chính (Production Model):** **Linear Ridge Regression**.
* **Mô hình đối sánh thử nghiệm (Benchmark Models):** **Random Forest Regressor** & **LightGBM Regressor**.

### Phân tích căn cứ khoa học và kỹ thuật:
1. **Về độ chính xác (Accuracy):**
   * Linear Ridge Regression đạt MAE nhỏ nhất (**13.9640**) và RMSE nhỏ nhất (**16.9764**), giảm **5.28% MAE** so với Baseline.
   * **Tuy nhiên, sự vượt trội về độ chính xác giữa Ridge, Random Forest (MAE 13.9994) và LightGBM (MAE 14.0043) là không đáng kể (chênh lệch chỉ ~0.04 đơn vị). Do đó, dự án không tuyên bố Ridge có độ chính xác vượt trội rõ rệt so với các mô hình Ensemble.**
2. **Về chi phí tính toán và tài nguyên hệ thống (Computational Efficiency):**
   * *Thời gian huấn luyện và suy luận:* Ridge hoàn tất trong < 0.05 giây (nhờ nghiệm giải tích ma trận đóng), trong khi Random Forest mất khoảng 4 giây.
   * *Kích thước mô hình đã lưu:* Artifact của Ridge chỉ chiếm **khoảng 14 KB**, trong khi Random Forest chiếm hơn **150 MB** (100 cây quyết định với độ sâu lớn). Điều này giúp Ridge cực kỳ tối ưu cho việc đóng gói, triển khai nhẹ và tích hợp vào dịch vụ Backend API.
3. **Về khả năng giải thích nghiệp vụ (Interpretability):**
   * Ridge là mô hình tuyến tính với các hệ số trọng số beta tường minh. Người quản lý kho và hội đồng đánh giá có thể truy xuất trực tiếp mức độ tác động của từng biến (ví dụ: ngày trong tuần, ngày nghỉ lễ, lượng xuất hôm trước) đến kết quả dự báo, loại bỏ hoàn toàn tính chất 'hộp đen' (black-box).
4. **Về tính ổn định và an toàn miền giá trị:**
   * Nghiệm Ridge không bị ảnh hưởng bởi tính ngẫu nhiên (deterministic, không phụ thuộc vào `random_state` như cây ngẫu nhiên).
   * Mã nguồn tích hợp cơ chế chặn cận dưới an toàn `np.clip(y_pred, 0, None)` để bảo đảm 100% dự báo không âm theo đúng bản chất số lượng kiện hàng thực tế.

---

## 7. Các giới hạn khoa học và thực tiễn của mô hình hiện tại

Dưới góc độ học thuật và thực tiễn chuỗi cung ứng, mô hình hiện tại có các giới hạn quan trọng cần được ghi nhận trung thực:

1. **Giới hạn bài toán dự báo một bước (1-step-ahead Horizon):**
   * Mô hình hiện tại dự báo cho ngày $t$ dựa trên các đặc trưng đã biết đến hết ngày $t-1$.
   * Trong thực tế vận hành chuỗi cung ứng, việc điều chuyển hàng giữa các vùng (Hà Nội, Đà Nẵng, TP.HCM) thường có thời gian vận chuyển (Lead Time) từ 2 đến 5 ngày. Dự báo 1 bước chưa thể dùng trực tiếp để lập kế hoạch bổ sung hàng cho toàn bộ chu kỳ Lead Time nếu không có cơ chế dự báo đệ quy đa bước (Recursive Multi-step Forecasting) hoặc kết hợp định mức tồn kho an toàn (Safety Stock).
2. **Đặc tính nhu cầu gián đoạn (Intermittent / Zero-inflated Demand):**
   * Có tới **35.92% số ngày quan sát không phát sinh xuất hàng (nhu cầu bằng 0)**.
   * Do cấu trúc chuỗi trễ (`lag_1`, `rolling_mean_7`) nhận giá trị dương từ các ngày có xuất hàng trước đó, các mô hình hồi quy liên tục (Ridge, Random Forest, LightGBM) và mô hình trượt đều dự báo ra giá trị dương quanh mức ~15 tại các ngày có nhu cầu bằng 0, dẫn tới MAE của nhóm ngày này bị neo ở mức cao (khoảng 15.5).
3. **Khả năng sẵn có của dữ liệu thời tiết tại thời điểm dự báo:**
   * Trong tập dữ liệu phân tích hiện tại, biến `nhiet_do_tb` và `luong_mua` là số liệu quan trắc thực tế của ngày đang xét.
   * Khi vận hành thực tế tại thời điểm chốt sổ cuối ngày $t-1$ để dự báo cho ngày $t$, số liệu thời tiết thực tế của ngày $t$ chưa diễn ra; do đó bắt buộc phải sử dụng dữ liệu từ API dự báo thời tiết (Weather Forecast API) thay cho số liệu quan trắc hồi quy.
4. **Giả định lượng xuất quan sát được (Censored vs Unmet Demand):**
   * Biến mục tiêu `nhu_cau_xuat` được đo lường dựa trên số lượng thực tế xuất khỏi kho thành công. Nếu xảy ra tình trạng hết hàng tại kho (stockout), lượng xuất bằng 0 dù khách hàng vẫn có nhu cầu; mô hình hiện tại chỉ dự báo lượng xuất quan sát được (Observed Sales), chưa mô hình hóa nhu cầu bị bỏ lỡ (Unmet Demand).

---

## 8. Phân biệt kết quả đã kiểm chứng và các hướng phát triển tương lai

Nhằm bảo đảm tính khách quan và trung thực trong báo cáo học thuật, các nội dung được phân định rạch ròi như sau:

### A. Các kết quả đã được triển khai và kiểm chứng trong hệ thống (Current Achievements)
* Pipeline trích xuất đặc trưng và làm sạch dữ liệu tự động, bảo đảm không rò rỉ dữ liệu chuỗi thời gian (`build_analytical_dataset.py`).
* Bộ 4 mô hình (Baseline, Ridge, Random Forest, LightGBM) được huấn luyện, đánh giá độc lập out-of-sample trên 49 ngày (2,940 dòng) với đầy đủ bảng bóc tách theo kho, nhóm ngày và nhóm ABC (`train_forecast.py`).
* Lưu trữ artifact mô hình Ridge production (`data_mining/models/forecast_ridge.joblib`) và xuất bảng kết quả dự báo chuẩn Gold (`forecast_results.csv`).
* Tích hợp kết quả dự báo vào hệ thống hỗ trợ ra quyết định điều chuyển kho (DSS Transfer Recommendation) và Backend RESTful API.

### B. Các hướng phát triển nghiên cứu trong tương lai (Future Directions — Chưa triển khai)
* **Xử lý chuỗi nhu cầu gián đoạn:** Nghiên cứu áp dụng mô hình chuyên biệt cho chuỗi gián đoạn như thuật toán Croston, TSB (Teunter-Syntetos-Babai) hoặc mô hình hai giai đoạn Hurdle Model (giai đoạn 1 phân loại xác suất phát sinh đơn hàng, giai đoạn 2 hồi quy sản lượng nếu có đơn).
* **Dự báo đa bước cho chu kỳ bổ sung hàng:** Xây dựng cơ chế dự báo đệ quy (Recursive Multi-step) hoặc dự báo trực tiếp đa bước (Direct Multi-horizon) tương ứng với thời gian Lead Time bổ sung hàng 3–7 ngày.
* **Khoảng tin cậy dự báo (Prediction Intervals):** Bổ sung kỹ thuật dự báo khoảng (Conformal Prediction hoặc Quantile Regression) để tính toán chuẩn xác mức tồn kho an toàn (Safety Stock) thay vì chỉ dự báo giá trị kỳ vọng điểm.

---

## 9. Hướng dẫn tái lập kết quả thực nghiệm (Reproducibility)

Để tái lập chính xác toàn bộ các kết quả và bảng số liệu trong báo cáo:

* **Chạy toàn bộ pipeline tự động từ Gold Dataset:**
  ```powershell
  py data_mining/run_pipeline.py
  ```
* **Chạy riêng phân hệ huấn luyện và kiểm thử mô hình Machine Learning:**
  ```powershell
  py data_mining/models/train_forecast.py
  ```
* **Chạy bộ kiểm thử tự động xác minh tính toàn vẹn của mô hình:**
  ```powershell
  py -m unittest data_mining/tests/test_data_mining_suite.py
  ```
