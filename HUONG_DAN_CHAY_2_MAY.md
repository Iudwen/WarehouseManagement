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
