# WarehouseManagement - Read-only Inspection Report

> Ngày kiểm tra: 2026-10-01
>
> Phạm vi: chỉ đọc và đối chiếu code/schema hiện tại.
>
> Trạng thái: chưa sửa source code, database schema hoặc cấu hình.

## 1. CURRENT ARCHITECTURE

### Thành phần hiện tại

- Frontend: React/Vite.
- Backend: Express + TypeScript.
- Node PostgreSQL:
  - `warehouse_hn`
  - `warehouse_dn`
  - `warehouse_hcm`
- Central PostgreSQL: `warehouse_central`.
- MongoDB: event log cho inventory và transfer.
- ETL: Python đồng bộ dữ liệu từ node lên Central.
- Saga: procedure và metadata nằm tại Central.

Backend đăng ký các route chính trong [app.ts](backend/src/app.ts#L1-L55):

- `/auth`
- `/inventory`
- `/transfer`
- `/dashboard`
- `/master-data`
- `/alerts`
- `/audit`

### Routing database

`dbSelector` chọn node PostgreSQL theo `ma_kho` trong [dbSelector.ts](backend/src/middlewares/dbSelector.ts#L1-L44):

- `HN01` -> node HN
- `DN01` -> node DN
- `HCM01` -> node HCM
- User không phải ADMIN bị ép dùng DB của `req.user.ma_kho`.
- ADMIN được chọn kho qua query/body/header.

Central được sử dụng riêng trong [transferService.ts](backend/src/services/transferService.ts#L1-L127) để tạo phiếu điều chuyển và Saga.

### Phân tách trách nhiệm DB

Node chịu trách nhiệm cho dữ liệu nghiệp vụ của kho:

- `ton_kho`
- `phieu_nhap`, `ct_phieu_nhap`
- `phieu_xuat`, `ct_phieu_xuat`
- `lich_su_ton_kho`
- `stock_ledger`
- `stock_reservation`
- `outbox_event`

Central chịu trách nhiệm cho:

- dữ liệu tổng hợp;
- `ton_kho_central`;
- node status và sync log;
- `dieu_chuyen_central`;
- Saga metadata;
- TRANSIT/VWH;
- recommendation và báo cáo.

Thiết kế này được mô tả trong [02_create_tables.sql](data_center/central_database/02_create_tables.sql#L1-L220) và [06_create_saga_monitoring.sql](data_center/central_database/06_create_saga_monitoring.sql#L1-L220).

### Nhận xét

Kiến trúc DB đã có nền tảng phù hợp với kế hoạch refactor. Vấn đề chính là runtime backend chưa sử dụng đầy đủ các thành phần đã có trong schema.

---

## 2. CURRENT DATA MODEL

### Node data model

Các node có schema gần như giống nhau:

- `kho`
- `san_pham`
- `nhom_san_pham`
- `nguoi_dung`
- `ton_kho`
- `phieu_nhap`
- `ct_phieu_nhap`
- `phieu_xuat`
- `ct_phieu_xuat`
- `lich_su_ton_kho`
- `stock_ledger`
- `stock_reservation`
- `outbox_event`

`stock_ledger` hỗ trợ các loại:

- `NHAP`
- `XUAT`
- `DIEU_CHUYEN_VAO`
- `DIEU_CHUYEN_RA`
- `DIEU_CHINH`

Schema được khai báo trong [08_create_transaction_support.sql](nodes/node_hn/08_create_transaction_support.sql#L250-L520); node DN/HCM có cấu trúc tương ứng.

### Central data model

Central có:

- `kho`
- `san_pham`
- `ton_kho_central`
- `lich_su_ton_kho_central`
- `nhap_hang_central`
- `ban_hang_central`
- `dieu_chuyen_central`
- `node_status`
- `sync_log`
- `transfer_recommendation`
- `saga_transaction`
- `saga_monitoring`
- `vwh_transfer`
- `transfer_discrepancy`

`ton_kho_central` là dữ liệu tổng hợp từ node, có `source_node`; không được xem là source of truth cho cập nhật tồn nghiệp vụ.

### Warehouse/node mapping

ETL đang map cố định:

- `HN01` -> `NODE_HN`
- `DN01` -> `NODE_DN`
- `HCM01` -> `NODE_HCM`

Bằng chứng: [sync_service.py](data_center/etl/sync_service.py#L221-L270).

Seed data cũng chỉ định mỗi node một warehouse:

- HN -> `HN01`
- DN -> `DN01`
- HCM -> `HCM01`

Bằng chứng: [seed_data.py](scripts/seed_data.py#L1-L220).

### Inventory source of truth

Hiện có hai lớp:

- Node `ton_kho`: tồn nghiệp vụ thực tế.
- Central `ton_kho_central`: tồn tổng hợp từ node.

Tuy nhiên runtime backend hiện:

- trực tiếp update `ton_kho`;
- trực tiếp update `lich_su_ton_kho`;
- không ghi `stock_ledger`;
- không tạo `outbox_event`;
- không gọi `sp_xu_ly_phieu_nhap` hoặc `sp_xu_ly_phieu_xuat`.

### Cardinality chưa xác định hoàn toàn

Code hiện đang giả định:

```text
một user -> một ma_kho
một node -> một warehouse
```

`UserPayload` chỉ có `ma_kho: string | null` trong [backend/src/types/index.ts](backend/src/types/index.ts#L1-L36).

Chưa có đủ bằng chứng từ schema user để kết luận DB thực sự giới hạn một user chỉ thuộc một kho. Đây là điểm phải xác minh trước khi thiết kế lại authorization.

---

## 3. CURRENT AUTHENTICATION

### Login

`POST /auth/login` thực hiện:

1. Nhận `email` hoặc `username`.
2. Nhận password.
3. Chọn node DB theo `ma_kho`, mặc định `HN01`.
4. Query bảng `nguoi_dung`.
5. Kiểm tra `trang_thai = ACTIVE`.
6. Kiểm tra user có thuộc node đăng nhập.
7. So sánh password bằng BCrypt hoặc plaintext fallback.
8. Phát hành JWT thời hạn một ngày.

Logic nằm trong [authController.ts](backend/src/controllers/authController.ts#L1-L82).

### JWT payload

JWT chứa:

```text
ma_nguoi_dung
email
ho_ten
vai_tro
ma_kho
```

Frontend lưu token và user trong localStorage tại [AuthContext.tsx](frontend/src/contexts/AuthContext.tsx#L1-L81).

### Token verification

`verifyToken` kiểm tra Bearer token, verify chữ ký/thời hạn JWT và đưa payload vào `req.user`. Logic nằm trong [auth.ts](backend/src/middlewares/auth.ts#L1-L29).

### Vấn đề authentication

- JWT secret có fallback hard-code: `warehouse_super_secret_key_2026`.
- Login ADMIN mặc định query node HN01 nếu không truyền `ma_kho`.
- Có plaintext password fallback.
- JWT chỉ có một `ma_kho`, không có danh sách warehouse/branch scope.
- Không thấy cơ chế revoke hoặc version token.

---

## 4. CURRENT AUTHORIZATION

### Role đang được code hỗ trợ

TypeScript chỉ định:

```text
ADMIN
MANAGER
STAFF
```

Bằng chứng: [backend/src/types/index.ts](backend/src/types/index.ts#L1-L16).

Các role trong kế hoạch nhưng chưa được code hỗ trợ riêng:

```text
QUẢN LÝ KHO
NHÂN VIÊN KHO
ĐIỀU PHỐI
DATA ANALYST
```

Hiện chúng đang bị giản lược thành `MANAGER` và `STAFF` hoặc chưa tồn tại.

### Branch/data scope

`branchGuard`:

- ADMIN được truy cập mọi kho.
- MANAGER/STAFF được so sánh với `req.user.ma_kho`.
- Guard đọc một mã kho từ query `ma_kho`, body `ma_kho` hoặc body `kho_xuat`.

Logic nằm trong [auth.ts](backend/src/middlewares/auth.ts#L30-L81).

`dbSelector` ép MANAGER/STAFF dùng DB của `req.user.ma_kho` trong [dbSelector.ts](backend/src/middlewares/dbSelector.ts#L1-L44).

### Inventory authorization

Trong [inventoryRoutes.ts](backend/src/routes/inventoryRoutes.ts#L1-L32):

- Tạo phiếu nhập/xuất: `ADMIN`, `MANAGER`, `STAFF`.
- Xem pending: `ADMIN`, `MANAGER`.
- Approve/reject: `ADMIN`, `MANAGER`.

Đã có phần cơ bản của roadmap hiện tại: STAFF tạo phiếu, MANAGER/ADMIN duyệt.

Chưa có quyền riêng cho:

- tiếp nhận hàng;
- kiểm đếm;
- điều chỉnh phiếu;
- xác nhận nhập;
- xác nhận xuất;
- xử lý discrepancy.

### Transfer authorization

Trong [transferRoutes.ts](backend/src/routes/transferRoutes.ts#L1-L26):

- Tạo transfer: chỉ `ADMIN`, `MANAGER`.
- Approve transfer: chỉ `ADMIN`, `MANAGER`.
- STAFF không được tạo transfer.
- `ĐIỀU PHỐI` và `DATA ANALYST` chưa tồn tại trong role system.

### Rủi ro scope ở approve transfer

Endpoint approve transfer không truyền `kho_xuat` vào `branchGuard`:

```text
POST /transfer/:maPhieu/approve
```

`approveTransfer` chỉ nhận `maPhieuDc`, không nhận actor hoặc scope trong [transferService.ts](backend/src/services/transferService.ts#L87-L127).

Vì vậy manager ở một kho có thể thử approve transfer của kho khác nếu biết mã phiếu. Đây là rủi ro authorization cần xử lý trước khi coi flow transfer là an toàn.

---

## 5. CURRENT BUSINESS FLOWS

### 5.1 Nhập hàng

#### Tạo phiếu

1. User gọi `POST /inventory/import`.
2. Middleware verify JWT, chọn node DB, kiểm tra branch và role.
3. Backend tạo `phieu_nhap`.
4. Backend tạo `ct_phieu_nhap`.
5. Trạng thái ban đầu là `PENDING_APPROVAL`.
6. Ghi `phieu_workflow_history`.
7. Chưa thay đổi tồn kho.

Logic: [inventoryService.ts](backend/src/services/inventoryService.ts#L35-L83).

#### Approve nhập

1. Manager/Admin gọi approve.
2. Khóa phiếu bằng `FOR UPDATE`.
3. Đọc chi tiết phiếu.
4. Update trực tiếp `ton_kho`.
5. Update trực tiếp `lich_su_ton_kho`.
6. Đổi trạng thái `PENDING_APPROVAL -> COMPLETED`.
7. Ghi workflow history.
8. Ghi MongoDB event.

Logic: [inventoryService.ts](backend/src/services/inventoryService.ts#L112-L177).

#### Chưa có

- Trạng thái `RECEIVING`.
- Tiếp nhận từ nhà cung cấp.
- Kiểm đếm thực nhận.
- Ghi nhận thiếu hàng.
- Giao bổ sung.
- Ghi `stock_ledger`.
- Ghi `outbox_event`.
- Gọi procedure node.
- Retry/idempotency nghiệp vụ đầy đủ.

### 5.2 Xuất hàng

#### Tạo phiếu

1. User gọi `POST /inventory/export`.
2. Backend tạo `phieu_xuat` và `ct_phieu_xuat`.
3. Trạng thái `PENDING_APPROVAL`.
4. Chưa trừ tồn.

Logic: [inventoryService.ts](backend/src/services/inventoryService.ts#L85-L110).

#### Approve xuất

1. Khóa phiếu bằng `FOR UPDATE`.
2. Đọc tồn từ `ton_kho`.
3. Không đủ tồn thì rollback.
4. Đủ tồn thì trừ trực tiếp `ton_kho`.
5. Cộng `xuat` vào `lich_su_ton_kho`.
6. Đổi trạng thái thành `COMPLETED`.
7. Ghi workflow history và MongoDB event.

Logic: [inventoryService.ts](backend/src/services/inventoryService.ts#L179-L247).

#### Đã có

- PostgreSQL transaction.
- Row locking cho tồn kho.
- Chặn approve lại phiếu đã xử lý.
- Kiểm tra không xuất vượt tồn.
- Version locking ở update phiếu.

#### Chưa có

- `stock_ledger`.
- `outbox_event`.
- Trạng thái xác nhận xuất riêng.
- Bước nhân viên thực hiện xuất.
- Idempotency key cho inventory movement.
- Gọi procedure `sp_xu_ly_phieu_xuat`.

### 5.3 Điều chuyển

#### Tạo yêu cầu

`POST /transfer`:

1. Chỉ ADMIN/MANAGER được gọi.
2. Chỉ hỗ trợ một sản phẩm vì `items.length === 1`.
3. Chỉ chấp nhận `HN01`, `DN01`, `HCM01`.
4. Kiểm tra kho nguồn khác kho đích.
5. User thường phải có `ma_kho = kho_xuat`.
6. Insert vào Central `dieu_chuyen_central`.
7. Trạng thái `PENDING`.

Logic: [transferService.ts](backend/src/services/transferService.ts#L1-L86).

#### Approve điều chuyển

`POST /transfer/:maPhieu/approve`:

1. Lock record trong `dieu_chuyen_central`.
2. Chỉ cho trạng thái `PENDING`.
3. Gọi `sp_create_saga($1)`.
4. Procedure tạo Saga tại Central.
5. Backend trả trạng thái `DANG_XU_LY`.

Logic: [transferService.ts](backend/src/services/transferService.ts#L87-L127).

#### Saga/schema đã có

Schema có nền tảng cho:

```text
WAITING_SOURCE_CONFIRMATION
RESERVED
SHIPPED
IN_TRANSIT
RECEIVING
DISCREPANCY
COMPENSATING
COMPLETED/CLOSED
```

Node có:

- `stock_reservation`
- `stock_ledger`
- `outbox_event`

Central có:

- `saga_transaction`
- `saga_monitoring`
- `vwh_transfer`
- `transfer_discrepancy`

`sp_create_saga` bắt đầu từ trạng thái chờ source confirmation trong [07_saga_procedures.sql](data_center/central_database/07_saga_procedures.sql#L1-L220).

#### Runtime còn thiếu

- Source warehouse confirmation.
- Reserve stock.
- Source export confirmation.
- Update TRANSIT.
- Destination receiving.
- Quantity reconciliation.
- Discrepancy handling.
- Accept shortage.
- Supplementary delivery.
- Saga retry.
- Compensation.
- Destination inventory update.
- Final ledger entries.

Runtime hiện mới chạy đến:

```text
Tạo request -> PENDING -> tạo Saga
```

---

## 6. MISMATCH / UNCERTAINTIES

### Mismatch

1. **Role matrix chưa khớp**

   Plan yêu cầu ADMIN, QUẢN LÝ KHO, NHÂN VIÊN KHO, ĐIỀU PHỐI, DATA ANALYST. Code chỉ có ADMIN, MANAGER, STAFF.

2. **Nhập/xuất hoàn tất quá sớm**

   Plan yêu cầu tạo -> duyệt -> tiếp nhận/thực hiện -> kiểm đếm -> xác nhận -> hoàn tất. Code đang là tạo -> pending -> approve -> completed.

3. **Backend bypass transaction procedures**

   Schema đã có procedure nhập/xuất có locking và ledger, nhưng service tự update bảng trực tiếp.

4. **Thiếu ledger runtime**

   Runtime chỉ cập nhật `ton_kho`, `lich_su_ton_kho` và Mongo event; chưa ghi `stock_ledger`.

5. **Transfer authorization chưa đúng flow**

   Plan dành quyền tạo/theo dõi/điều phối cho ĐIỀU PHỐI và đề xuất cho DATA ANALYST; code chỉ cho ADMIN/MANAGER.

6. **Approve transfer không kiểm tra đầy đủ scope**

   `approveTransfer` không nhận actor/scope và route approve không cung cấp `kho_xuat` cho branch guard.

7. **Status chưa thống nhất**

   Đang đồng thời có `PENDING_APPROVAL`, `COMPLETED`, `REJECTED`, `PENDING`, `DANG_XU_LY` cùng các Saga state như `IN_TRANSIT`, `COMPENSATING`, `CLOSED`.

8. **Transfer chỉ hỗ trợ một item**

   Chưa xác định đây là business rule hay giới hạn tạm thời của implementation.

9. **Warehouse mapping hard-code**

   `nodeByWarehouse` trong service hard-code ba kho dù Central đã có bảng `kho` và `node_name`.

10. **Mongo event log không phải ledger**

    `inventory_events` và `transfer_events` chỉ là log. `transfer_events` còn ghi `status: COMPLETED` khi được gọi, nên không thể làm state machine chính.

### Uncertainties cần xác minh

1. Schema thật của `nguoi_dung`: một user có thể phụ trách nhiều warehouse hay không?
2. Mã role thực tế trong DB cho các role nghiệp vụ mới là gì?
3. Các procedure node đã được apply thật vào database đang chạy chưa?
4. ETL có đồng bộ `stock_ledger`, `outbox_event` và Saga event hay chỉ các bảng tổng hợp?
5. TRANSIT là record thật trong `vwh_transfer` hay chỉ là metadata/state?
6. Một transfer có bắt buộc chỉ một sản phẩm không?
7. Nhập/xuất có phải giữ nguyên workflow của roadmap hiện tại hay chuyển sang flow đầy đủ trong refactor plan?
8. Các test hiện tại có đang phụ thuộc vào `PENDING_APPROVAL -> COMPLETED` không?

## Kết luận

DB đã có nền tảng tương đối sát mục tiêu:

```text
Node inventory
Central aggregation
Stock ledger schema
Outbox schema
Reservation schema
Saga metadata
TRANSIT metadata
```

Runtime mới hoàn thiện một phần:

```text
Nhập/xuất: tạo phiếu + duyệt trực tiếp
Điều chuyển: tạo request + tạo Saga
```

Các phần thiếu lớn nhất:

```text
Role matrix
Data scope
Ledger runtime
Outbox runtime
Transfer Saga execution
TRANSIT
Receiving/discrepancy
State machine
Idempotent retry
```

Chưa nên sửa các service ngay trước khi xác minh ba điểm kiểm soát:

1. schema và cardinality thật của `nguoi_dung`;
2. trạng thái thực tế của database runtime;
3. contract đầy đủ của các Saga procedure.
