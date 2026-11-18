# HƯỚNG DẪN TRIỂN KHAI HỆ THỐNG PHÂN TÁN TRÊN 2 MÁY VẬT LÝ

Tài liệu này hướng dẫn cách phân tách và chạy hệ thống **WarehouseManagement** trên 2 máy tính độc lập trong cùng mạng nội bộ (LAN / Wifi / Hotspot):

1. **MÁY A (Máy Nhánh - Branch Nodes)**: Đóng vai trò các chi nhánh vùng miền (Hà Nội, Đà Nẵng, TP.HCM), đảm nhận lưu trữ phân tán 3 cơ sở dữ liệu kho.
2. **MÁY B (Máy Central - Central HQ & Application Server)**: Đóng vai trò tổng bộ trung tâm, lưu trữ Central DB, Event Store MongoDB, Message Broker Kafka, xử lý ETL, Backend API và Web Dashboard.

---

## I. SƠ ĐỒ KIẾN TRÚC TRIỂN KHAI

```
         MÁY A: CHI NHÁNH KHO                         MÁY B: TỔNG BỘ TRUNG TÂM
       (Ví dụ IP: 192.168.1.25)                       (Ví dụ IP: 192.168.1.15)
+------------------------------------+         +------------------------------------+
| docker-compose.branches.yml        |         | docker-compose.central.yml         |
|                                    |         |                                    |
| - Postgres HN  (Port 5433:5432)    | <=====> | - Postgres Central (Port 5436)     |
| - Postgres DN  (Port 5434:5432)    |  Mạng   | - MongoDB (Port 27018)             |
| - Postgres HCM (Port 5435:5432)    |  LAN/   | - Apache Kafka (Port 9092, 9094)   |
|                                    | Hotspot | - Sync Service (ETL Data Center)   |
|                                    |         | - Outbox Worker (Relay CDC)        |
|                                    |         | - Nginx Reverse Proxy (Port 80)    |
|                                    |         |                                    |
|                                    |         | Backend Node.js API (Port 5000)    |
+------------------------------------+         +------------------------------------+
```

---

## II. BƯỚC 1: KẾT NỐI MẠNG GIỮA 2 MÁY

> [!TIP]
> **Khuyên dùng:** Nên bật **Mobile Hotspot (Phát Wifi)** từ điện thoại hoặc từ Máy B cho cả 2 máy kết nối chung, tránh mạng Wifi công cộng chặn giao tiếp giữa các máy nội bộ (AP Isolation).

1. **Trên MÁY A**, mở PowerShell gõ:
   ```powershell
   ipconfig
   ```
   Xem địa chỉ `IPv4 Address` (Ví dụ: `192.168.1.25`). Đây là **IP_MÁY_A**.

2. **Trên MÁY B**, mở PowerShell kiểm tra ping sang Máy A:
   ```powershell
   ping <IP_MÁY_A>
   # Ví dụ: ping 192.168.1.25
   ```
   Nếu có phản hồi `Reply from...` là 2 máy đã thông mạng.

---

## III. BƯỚC 2: THIẾT LẬP TRÊN MÁY A (MÁY NHÁNH)

1. **Mở cổng Firewall trên Máy A** (cho phép Máy B kết nối vào 3 Database):
   Mở **PowerShell bằng quyền Administrator** trên Máy A và chạy:
   ```powershell
   New-NetFirewallRule -DisplayName "Warehouse Postgres Nodes" -Direction Inbound -LocalPort 5433,5434,5435 -Protocol TCP -Action Allow
   ```

2. **Tạo file cấu hình `.env` cho Máy A:**
   Copy từ file mẫu:
   ```powershell
   Copy-Item .env.branches.example .env
   ```

3. **Khởi động 3 Node kho chi nhánh trên Máy A:**
   ```powershell
   docker compose -f docker-compose.branches.yml up -d
   ```
   Kiểm tra bằng lệnh `docker ps`, thấy 3 container `warehouse_postgres_hn`, `warehouse_postgres_dn`, `warehouse_postgres_hcm` đang `Up` (healthy) là hoàn tất.

---

## IV. BƯỚC 3: THIẾT LẬP TRÊN MÁY B (MÁY CENTRAL)

1. **Tạo file cấu hình `.env` cho Máy B:**
   Copy từ file mẫu:
   ```powershell
   Copy-Item .env.central.example .env
   ```
   Mở file `.env` trên Máy B, thay thế `192.168.1.X` bằng **IP thật của MÁY A**:
   ```env
   POSTGRES_HOST_HN=192.168.1.25
   POSTGRES_PORT_HN=5433

   POSTGRES_HOST_DN=192.168.1.25
   POSTGRES_PORT_DN=5434

   POSTGRES_HOST_HCM=192.168.1.25
   POSTGRES_PORT_HCM=5435
   ```

2. **Khởi động các hạ tầng Central trên Máy B:**
   ```powershell
   docker compose -f docker-compose.central.yml up -d
   ```

3. **Khởi động Backend API trên Máy B:**
   ```powershell
   cd backend
   npm install      # (nếu lần đầu tải code về)
   npm run dev
   ```

---

## V. BƯỚC 4: KIỂM TRA & KỊCH BẢN DEMO THỰC TẾ

### 1. Kiểm tra kết nối mạng qua lệnh
Từ **Máy B**, chạy PowerShell để kiểm tra cổng database của Máy A:
```powershell
Test-NetConnection -ComputerName 192.168.1.25 -Port 5433
```
Kết quả hiển thị `TcpTestSucceeded : True` là kết nối thành công 100%.

### 2. Xem trực quan trên Web Dashboard
1. Trên Máy B, mở trình duyệt vào: `http://localhost/monitoring` (đăng nhập tài khoản `admin` / mật khẩu `123456`).
2. Quan sát 4 Node: `CENTRAL`, `HN`, `DN`, `HCM` đều sáng màu xanh **`ONLINE`**.
3. Độ trễ (latency) của HN, DN, HCM đo qua mạng LAN thật (khoảng vài ms), chứng minh rõ ràng đây là các máy chủ vật lý riêng biệt.

### 3. Demo mô phỏng sự cố (Fault Injection)
1. **Trên Máy A (Máy Nhánh):** Bạn chủ động tắt một kho, ví dụ kho Hà Nội:
   ```powershell
   docker stop warehouse_postgres_hn
   ```
2. **Trên Máy B (Máy Central):**
   - Màn hình Giám Sát tự động phát hiện (hoặc bấm nút "Làm mới"):
   - Node Hà Nội (HN) lập tức chuyển sang viền đỏ và báo **`OFFLINE` / `UNREACHABLE`**.
   - Trạng thái chung hệ thống chuyển sang **`DEGRADED`**.
   - Các kho Đà Nẵng, TP.HCM và Central vẫn giao dịch bình thường (Tính cô lập sự cố - Fault Isolation).
3. **Phục hồi (Self-Healing):**
   - Trên Máy A, bật lại: `docker start warehouse_postgres_hn`.
   - Trên Máy B, node HN tự động chuyển xanh trở lại **`ONLINE`** mà không cần khởi động lại toàn bộ hệ thống!

---

## VI. QUY TRÌNH ROLLBACK AN TOÀN VỀ MÔ HÌNH 1 MÁY

> [!CAUTION]
> Tuyệt đối không chỉ đổi cấu hình về `localhost` rồi bật lại Compose gốc nếu trong quá trình vận hành đã phát sinh giao dịch mới trên Máy 2 (nhập/xuất kho, điều chuyển, xếp ô kệ). Dữ liệu mới trên Máy 2 sẽ bị bỏ rơi và gây lệch pha nghiêm trọng với Central. Bắt buộc thực hiện quy trình đối soát và phục hồi tuần tự qua 7 bước sau:

### Bước 1: Dừng Backend API để ngăn giao dịch mới (Freeze Writes)
- Trên Máy 1, nhấn `Ctrl + C` tại terminal đang chạy Backend API (`npm run dev`).
- Thao tác này ngay lập tức ngắt toàn bộ luồng tiếp nhận request từ người dùng/client, đóng các transaction ghi mới vào cơ sở dữ liệu trên cả 2 máy.

### Bước 2: Chờ Outbox Worker xử lý & Xác minh trạng thái Outbox
- Để Outbox Worker tiếp tục chạy trong khoảng 10–30 giây để xử lý hết các bản tin dở dang.
- **Xác minh schema thực tế của bảng `outbox_event` trên các node (HN, DN, HCM):**
  - Khóa chính: `event_id UUID DEFAULT gen_random_uuid()`.
  - Cột định danh & phân loại: `saga_id UUID`, `ma_giao_dich_global UUID`, `event_type VARCHAR(50)`, `aggregate_id VARCHAR(50)`, `payload JSONB`.
  - Ràng buộc trạng thái (`chk_outbox_status`):
    `CHECK (status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED'))`
  - Cột kiểm soát đồng thời & retry: `version INT DEFAULT 1`, `retry_count INT`, `max_retry_count INT`, `next_retry_at TIMESTAMP`.
  - Cột mốc thời gian: `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`, `last_retry_at TIMESTAMP`, `processed_at TIMESTAMP`.
  - Cột ghi nhận lỗi: `error_message TEXT`.
- **Truy vấn thống kê TOÀN BỘ trạng thái Outbox (không chỉ đếm PENDING đến hạn retry):**
  ```sql
  SELECT 
      COUNT(*) AS total_events,
      COUNT(*) FILTER (WHERE status = 'PENDING') AS total_pending,
      COUNT(*) FILTER (WHERE status = 'PROCESSING') AS total_processing,
      COUNT(*) FILTER (WHERE status = 'PROCESSED') AS total_processed,
      COUNT(*) FILTER (WHERE status = 'FAILED') AS total_failed
  FROM outbox_event;
  ```
- **Điều kiện định lượng bắt buộc để ĐƯỢC PHÉP bắt đầu dump/restore:**
  1. `total_processing = 0`: **BẮT BUỘC = 0**. Tuyệt đối không còn bất kỳ tiến trình nào đang giữ lease/lock dở dang.
  2. `total_pending = 0`: Toàn bộ sự kiện phát sinh từ phiên chạy 2 máy đã được xử lý xong. Không còn bất kỳ sự kiện nghiệp vụ nào ở trạng thái `PENDING` (kể cả những sự kiện có `next_retry_at` trong tương lai do backoff).
  3. `total_failed`: Không phát sinh thêm lỗi mới so với mốc bắt đầu phiên; nếu có bản ghi `FAILED`, phải kiểm tra chi tiết cột `error_message` để xác nhận đã xử lý bù hoặc ghi nhận trước khi ngắt hệ thống.
  4. Sau khi 3 tiêu chí trên thỏa mãn $\rightarrow$ Thực hiện ngay Bước 3 (dừng worker) để khóa tĩnh cơ sở dữ liệu.

### Bước 3: Dừng Outbox Worker và Sync Service trước khi backup/restore
- Trên Máy 1, tạm dừng cả 2 worker nền để đưa database về trạng thái tĩnh (quiescent state):
  ```powershell
  docker compose -f docker-compose.machine1.yml stop outbox_worker sync_service
  ```
- Thao tác này đóng toàn bộ kết nối ngầm đọc/ghi tới PostgreSQL DN, HCM và Central, loại bỏ hoàn toàn nguy cơ tranh chấp lock trong lúc dump và restore.

### Bước 4: Dump dữ liệu DN/HCM từ Máy 2
- Trên Máy 2, thực thi lệnh trích xuất bản dump nhị phân (`-F c`) chứa đầy đủ schema, dữ liệu, sequence và index:
  ```powershell
  docker exec -t warehouse_postgres_dn pg_dump -U admin -d warehouse_dn -F c -f /tmp/dn_rollback.dump
  docker cp warehouse_postgres_dn:/tmp/dn_rollback.dump ./dn_rollback.dump

  docker exec -t warehouse_postgres_hcm pg_dump -U admin -d warehouse_hcm -F c -f /tmp/hcm_rollback.dump
  docker cp warehouse_postgres_hcm:/tmp/hcm_rollback.dump ./hcm_rollback.dump
  ```
- Sao chép 2 file `dn_rollback.dump` và `hcm_rollback.dump` từ Máy 2 sang thư mục dự án trên Máy 1 (qua LAN sharing hoặc USB).

### Bước 5: Restore vào PostgreSQL DN/HCM trên Máy 1
- Trên Máy 1, khởi chạy tạm thời 2 container `warehouse_postgres_dn` và `warehouse_postgres_hcm` nếu chưa chạy:
  ```powershell
  docker compose up -d postgres_dn postgres_hcm
  ```
- Nạp bản dump nhị phân đè sạch dữ liệu (`--clean`) vào 2 database tương ứng trên Máy 1:
  ```powershell
  docker cp ./dn_rollback.dump warehouse_postgres_dn:/tmp/dn_rollback.dump
  docker exec -i warehouse_postgres_dn pg_restore -U admin -d warehouse_dn --clean /tmp/dn_rollback.dump

  docker cp ./hcm_rollback.dump warehouse_postgres_hcm:/tmp/hcm_rollback.dump
  docker exec -i warehouse_postgres_hcm pg_restore -U admin -d warehouse_hcm --clean /tmp/hcm_rollback.dump
  ```

### Bước 6: Đối soát định lượng tính toàn vẹn dữ liệu
> [!IMPORTANT]
> Lệnh `pg_restore` trả về mã 0 chỉ chứng minh quá trình nạp file thành công về mặt kỹ thuật (Cấp độ 1). **TUYỆT ĐỐI KHÔNG ĐƯỢC THỰC HIỆN BƯỚC 7 NẾU CHƯA ĐỐI SOÁT TƯƠNG ĐƯƠNG VỀ NGHIỆP VỤ ĐẠT 100% (CẤP ĐỘ 2)!**

#### Cấp độ 1: Kiểm tra khôi phục cấu trúc vật lý đầy đủ
Kiểm tra số lượng bản ghi tổng thể giữa Máy 2 và Máy 1:
```sql
SELECT 
    (SELECT COUNT(*) FROM ton_kho) AS rows_ton_kho,
    (SELECT COUNT(*) FROM phan_bo_o_ke) AS rows_phan_bo,
    (SELECT COUNT(*) FROM phieu_nhap) AS rows_phieu_nhap,
    (SELECT COUNT(*) FROM ct_phieu_nhap) AS rows_ct_nhap,
    (SELECT COUNT(*) FROM phieu_xuat) AS rows_phieu_xuat,
    (SELECT COUNT(*) FROM ct_phieu_xuat) AS rows_ct_xuat,
    (SELECT COUNT(*) FROM phieu_dieu_chuyen) AS rows_phieu_dc,
    (SELECT COUNT(*) FROM ct_dieu_chuyen) AS rows_ct_dc,
    (SELECT COUNT(*) FROM outbox_event) AS rows_outbox;
```

#### Cấp độ 2: Xác minh tương đương về nghiệp vụ (Business Equivalence)
Không dùng riêng `COUNT`, `SUM` hay `MAX(created_at)`. Thực hiện đối chiếu chi tiết và tính Checksum Hash toàn bảng giữa Máy 2 và Máy 1:

1. **Đối soát Tồn kho (`ton_kho`):**
   - Schema xác minh: `ma_kho VARCHAR(10)`, `ma_sp VARCHAR(20)`, `so_luong INT`, `cap_nhat_luc TIMESTAMP`.
   - Checksum bảng tồn kho:
     ```sql
     SELECT COALESCE(md5(string_agg(ma_kho || '-' || ma_sp || ':' || COALESCE(so_luong::text, '0'), ',' ORDER BY ma_kho, ma_sp)), 'EMPTY_TABLE') AS ton_kho_checksum,
            COALESCE(SUM(so_luong), 0) AS total_qty
     FROM ton_kho;
     ```

2. **Đối soát Phân bổ Ô kệ (`phan_bo_o_ke`):**
   - Schema xác minh: `id BIGSERIAL`, `ma_kho VARCHAR(10)`, `ma_vi_tri VARCHAR(20)`, `ma_sp VARCHAR(20)`, `so_luong INT`, `cap_nhat_luc TIMESTAMP`.
   - Checksum bảng phân bổ ô kệ:
     ```sql
     SELECT COALESCE(md5(string_agg(ma_kho || '-' || ma_vi_tri || '-' || ma_sp || ':' || COALESCE(so_luong::text, '0'), ',' ORDER BY ma_kho, ma_vi_tri, ma_sp)), 'EMPTY_TABLE') AS slotting_checksum,
            COALESCE(SUM(so_luong), 0) AS total_bin_qty
     FROM phan_bo_o_ke;
     ```

3. **Đối soát Chứng từ Giao dịch (`phieu_*` và `ct_*`):**
   - Schema xác minh:
     - `phieu_nhap`: `ma_phieu_nhap`, `ma_kho`, `ma_ncc`, `ngay_nhap`, `trang_thai`.
     - `ct_phieu_nhap`: `ma_phieu_nhap`, `ma_sp`, `so_luong`, `don_gia`.
     - `phieu_xuat`: `ma_phieu_xuat`, `ma_kho`, `ma_kh`, `ngay_xuat`, `trang_thai`.
     - `ct_phieu_xuat`: `ma_phieu_xuat`, `ma_sp`, `so_luong`, `don_gia`.
     - `phieu_dieu_chuyen`: `ma_phieu_dc`, `kho_xuat`, `kho_nhap`, `ngay_dieu_chuyen`, `trang_thai`.
     - `ct_dieu_chuyen`: `ma_phieu_dc`, `ma_sp`, `so_luong`.
   - Checksum chi tiết chứng từ (bảo vệ chống NULL bằng COALESCE):
     ```sql
     SELECT COALESCE(md5(string_agg(ma_phieu_nhap || ':' || COALESCE(trang_thai, ''), ',' ORDER BY ma_phieu_nhap)), 'EMPTY_TABLE') AS chk_nhap FROM phieu_nhap;
     SELECT COALESCE(md5(string_agg(ma_phieu_nhap || '-' || ma_sp || ':' || COALESCE(so_luong::text, '0') || '@' || COALESCE(don_gia::text, '0'), ',' ORDER BY ma_phieu_nhap, ma_sp)), 'EMPTY_TABLE') AS chk_ct_nhap FROM ct_phieu_nhap;
     SELECT COALESCE(md5(string_agg(ma_phieu_xuat || ':' || COALESCE(trang_thai, ''), ',' ORDER BY ma_phieu_xuat)), 'EMPTY_TABLE') AS chk_xuat FROM phieu_xuat;
     SELECT COALESCE(md5(string_agg(ma_phieu_xuat || '-' || ma_sp || ':' || COALESCE(so_luong::text, '0') || '@' || COALESCE(don_gia::text, '0'), ',' ORDER BY ma_phieu_xuat, ma_sp)), 'EMPTY_TABLE') AS chk_ct_xuat FROM ct_phieu_xuat;
     SELECT COALESCE(md5(string_agg(ma_phieu_dc || ':' || COALESCE(trang_thai, '') || '|' || COALESCE(kho_xuat, '') || '->' || COALESCE(kho_nhap, ''), ',' ORDER BY ma_phieu_dc)), 'EMPTY_TABLE') AS chk_dc FROM phieu_dieu_chuyen;
     SELECT COALESCE(md5(string_agg(ma_phieu_dc || '-' || ma_sp || ':' || COALESCE(so_luong::text, '0'), ',' ORDER BY ma_phieu_dc, ma_sp)), 'EMPTY_TABLE') AS chk_ct_dc FROM ct_dieu_chuyen;
     ```

4. **Đối soát Chi tiết Outbox Event (`outbox_event`):**
   - Checksum đối chiếu toàn bộ `event_id`, trạng thái (`status`), phiên bản (`version`) và hash nội dung sự kiện (`payload`):
     ```sql
     SELECT COALESCE(md5(string_agg(event_id::text || '|' || event_type || '|' || aggregate_id || '|' || status || '|v' || version::text || '|' || md5(COALESCE(payload::text, '{}')), ',' ORDER BY event_id)), 'EMPTY_TABLE') AS outbox_checksum
     FROM outbox_event;
     ```
   - Đối chiếu danh sách sự kiện mới nhất:
     ```sql
     SELECT event_id, event_type, aggregate_id, status, version, md5(payload::text) AS payload_hash, created_at
     FROM outbox_event
     ORDER BY created_at DESC
     LIMIT 10;
     ```

- **Điều kiện ĐẠT để chuyển sang Bước 7:**
  - Cả 2 database `warehouse_dn` và `warehouse_hcm` trên Máy 1 có tất cả các giá trị Checksum MD5 trên trùng khớp 100% với dữ liệu gốc trên Máy 2.
  - Không có bất kỳ sự kiện nào kẹt ở trạng thái `PROCESSING`.
  - **Nếu có bất kỳ sai lệch nào, TUYỆT ĐỐI KHÔNG CHUYỂN VỀ COMPOSE GỐC.** Phải rà soát lại file dump/restore và dữ liệu trên Máy 2.

### Bước 7: Chuyển cấu hình về localhost và khởi chạy lại Compose gốc
- Khi đối soát đã ĐẠT hoàn toàn:
  1. Dừng cụm Máy 2:
     ```powershell
     docker compose -f docker-compose.machine2.yml down
     ```
  2. Dừng cụm Máy 1:
     ```powershell
     docker compose -f docker-compose.machine1.yml down
     ```
  3. Cập nhật file `.env` trên Máy 1 đưa DN và HCM về localhost:
     ```env
     POSTGRES_HOST_DN=localhost
     POSTGRES_HOST_HCM=localhost
     ```
  4. Khởi chạy toàn bộ hệ thống bằng Docker Compose gốc:
     ```powershell
     docker compose up -d
     ```
  5. Khởi động lại Backend API trên Máy 1:
     ```powershell
     cd backend
     npm run dev
     ```
  6. Mở trình duyệt truy cập `http://localhost/` (hoặc cổng Nginx/Vite), đăng nhập và kiểm tra thông tin toàn bộ 4 kho trên Dashboard. Hệ thống chính thức quay trở lại hoạt động trơn tru trên 1 máy duy nhất.
