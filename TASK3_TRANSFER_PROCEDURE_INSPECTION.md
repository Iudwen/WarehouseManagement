# TASK 3 - Transfer Procedure Inspection Report

> Phạm vi: chỉ inspect.
>
> Không sửa source code, database schema, Saga procedure, Kafka hoặc consumer.

## 1. Transfer service hiện tại

File chính: [transferService.ts](backend/src/services/transferService.ts#L1-L127).

| Function | Hiện trạng |
|---|---|
| `validateTransfer()` | Validate mã phiếu, kho nguồn/đích, sản phẩm, số lượng và scope user |
| `processTransfer()` | Ghi request vào Central `dieu_chuyen_central` |
| `approveTransfer()` | Gọi Central `sp_create_saga()` |
| `acceptTransfer()` | Không tồn tại |
| `shipTransfer()` | Không tồn tại |
| `receiveTransfer()` | Không tồn tại |

### Function gọi Central

`processTransfer()`:

```text
pools.CENTRAL.connect()
    -> INSERT dieu_chuyen_central
```

`approveTransfer()`:

```text
pools.CENTRAL.connect()
    -> SELECT dieu_chuyen_central FOR UPDATE
    -> SELECT sp_create_saga($1)
```

### Function gọi node database

Hiện không có backend function nào gọi:

```text
sp_accept_transfer
sp_ship_transfer
sp_receive_transfer
```

## 2. Mapping business action hiện tại

### Source confirmation

```text
BUSINESS ACTION
Source warehouse xác nhận có thể điều chuyển
    -> BACKEND FUNCTION: không có
    -> DATABASE PROCEDURE: không có backend call
    -> DATABASE EFFECT: không có runtime effect
```

Database capability tương ứng là `sp_accept_transfer()`, nhưng backend chưa gọi.

### Reservation

```text
BUSINESS ACTION
Reserve hàng tại node nguồn
    -> BACKEND FUNCTION: không có
    -> DATABASE PROCEDURE: sp_accept_transfer()
    -> DATABASE EFFECT:
       stock_reservation INSERT
       outbox_event INSERT: TRANSFER_ACCEPTED
```

`sp_accept_transfer()` lock/read `ton_kho` và kiểm tra tồn khả dụng. Procedure không trừ tồn và không ghi `stock_ledger`.

### Shipment

```text
BUSINESS ACTION
Xuất hàng khỏi node nguồn
    -> BACKEND FUNCTION: không có
    -> DATABASE PROCEDURE: sp_ship_transfer()
    -> DATABASE EFFECT:
       ton_kho giảm
       stock_ledger ghi DIEU_CHUYEN_RA
       stock_reservation = CONSUMED
       outbox_event = TRANSFER_SHIPPED
```

`sp_ship_transfer()` lấy số lượng từ `stock_reservation`, không nhận số lượng trực tiếp.

### Receiving

```text
BUSINESS ACTION
Node đích nhận và kiểm đếm hàng
    -> BACKEND FUNCTION: không có
    -> DATABASE PROCEDURE: sp_receive_transfer()
    -> DATABASE EFFECT:
       ton_kho node đích tăng theo thực nhận
       stock_ledger ghi DIEU_CHUYEN_VAO
       outbox_event = TRANSFER_RECEIVED
```

Central sau đó xử lý `sp_process_transfer_received()` để cập nhật VWH, Saga và discrepancy.

## 3. Procedure signatures và dữ liệu backend

### `sp_accept_transfer`

```sql
sp_accept_transfer(
    p_saga_id UUID,
    p_global_id UUID,
    p_ma_phieu_dc VARCHAR(20),
    p_ma_kho VARCHAR(10),
    p_ma_sp VARCHAR(20),
    p_so_luong INT
)
RETURNS VOID
```

Backend hiện có:

- `saga_id`: có sau `sp_create_saga()`.
- `ma_giao_dich_global`: chưa lấy từ Central sau khi tạo Saga.
- `ma_phieu_dc`: có.
- `ma_kho`: có từ `kho_xuat`.
- `ma_sp`: có trong request.
- `so_luong`: có trong request.

Thiếu trực tiếp `ma_giao_dich_global`; cần đọc từ `saga_transaction` tại Central.

### `sp_ship_transfer`

```sql
sp_ship_transfer(
    p_saga_id UUID,
    p_global_id UUID,
    p_ma_phieu_dc VARCHAR(20),
    p_ma_kho VARCHAR(10),
    p_ma_sp VARCHAR(20)
)
RETURNS VOID
```

Backend cần lấy:

- `saga_id` từ kết quả tạo Saga;
- `ma_giao_dich_global` từ Central Saga;
- `ma_phieu_dc` từ request/route;
- `kho_xuat` và `ma_sp` từ Central Saga.

Không được truyền số lượng vào procedure này vì số lượng được lấy từ reservation.

### `sp_receive_transfer`

```sql
sp_receive_transfer(
    p_saga_id UUID,
    p_global_id UUID,
    p_ma_phieu_dc VARCHAR(20),
    p_ma_kho VARCHAR(10),
    p_ma_sp VARCHAR(20),
    p_so_luong_thuc_nhan INT
)
RETURNS VOID
```

Backend hiện thiếu `so_luong_thuc_nhan` và chưa có receive endpoint, controller, service hoặc command payload cho số lượng thực nhận.

Không được dùng `so_luong_yeu_cau` thay cho `so_luong_thuc_nhan`.

## 4. Transaction boundary

Ba procedure node là PostgreSQL functions, không tự `BEGIN`/`COMMIT`. Caller phải quản lý transaction:

```text
BEGIN tại node
    -> SELECT sp_accept_transfer(...)
       hoặc sp_ship_transfer(...)
       hoặc sp_receive_transfer(...)
    -> COMMIT tại node
```

Nếu function lỗi, caller phải rollback.

| Procedure | `stock_reservation` | `ton_kho` | `stock_ledger` | `outbox_event` |
|---|---:|---:|---:|---:|
| `sp_accept_transfer` | INSERT | Lock/read | Không | `TRANSFER_ACCEPTED` |
| `sp_ship_transfer` | `CONSUMED` | Giảm | `DIEU_CHUYEN_RA` | `TRANSFER_SHIPPED` |
| `sp_receive_transfer` | Không | Tăng node đích | `DIEU_CHUYEN_VAO` | `TRANSFER_RECEIVED` |

Backend hiện chưa duplicate các thao tác transfer này vì chưa gọi procedure nào. Các thao tác nhập/xuất thông thường trong [inventoryService.ts](backend/src/services/inventoryService.ts) là flow khác.

## 5. Reuse OutboxRelay

[OutboxRelay](backend/src/messaging/outboxRelay.ts#L49-L124) có thể relay các event do node procedure ghi:

```text
sp_accept_transfer -> TRANSFER_ACCEPTED
sp_ship_transfer   -> TRANSFER_SHIPPED
sp_receive_transfer -> TRANSFER_RECEIVED
```

Flow hiện có:

```text
node procedure
    -> outbox_event PENDING
    -> OutboxRelay
    -> MessageTransport
```

Nhưng hiện chưa có consumer/handler xử lý các event này. `InMemoryMessageTransport` chỉ dùng cho test; chưa có Kafka adapter.

OutboxRelay chỉ chuyển message, không gọi procedure node và không chạy Saga.

## 6. TRANSIT/VWH

Hàng đang chuyển được quản lý bởi bảng `vwh_transfer`, không phải trực tiếp bởi row `kho = TRANSIT`.

### `sp_create_vwh_transfer()`

Được gọi sau `TRANSFER_SHIPPED`, procedure này:

- tạo `vwh_transfer`;
- đặt trạng thái `IN_TRANSIT`;
- cập nhật số lượng đã xuất trong Saga;
- không cộng tồn node đích.

### `sp_process_transfer_received()`

Procedure này:

- lock Saga và VWH;
- cập nhật số lượng đã nhận;
- tạo `transfer_discrepancy` nếu thiếu;
- cập nhật Saga, monitoring và `dieu_chuyen_central`.

Runtime Central hiện vẫn thiếu row `TRANSIT`. Không được tự INSERT row hoặc sửa schema trong Task 3.

## 7. Current flow thực tế

```text
POST /transfer
    -> transferController.handleTransfer()
    -> transferService.processTransfer()
    -> Central INSERT dieu_chuyen_central
    -> PENDING

POST /transfer/:maPhieu/approve
    -> transferController.handleApproveTransfer()
    -> transferService.approveTransfer()
    -> Central SELECT sp_create_saga()
    -> Saga WAITING_SOURCE_CONFIRMATION
    -> dieu_chuyen_central = DANG_XU_LY
    -> DỪNG
```

## 8. Target flow của Task 3

```text
Central/Saga
    -> Node command/application path
    -> sp_accept_transfer
    -> stock_reservation + TRANSFER_ACCEPTED outbox
    -> Central event handling
    -> Node source command
    -> sp_ship_transfer
    -> ton_kho giảm
       stock_ledger DIEU_CHUYEN_RA
       reservation CONSUMED
       TRANSFER_SHIPPED outbox
    -> Central sp_create_vwh_transfer
    -> vwh_transfer = IN_TRANSIT
    -> Destination node command
    -> sp_receive_transfer
    -> ton_kho node đích tăng theo thực nhận
       stock_ledger DIEU_CHUYEN_VAO
       TRANSFER_RECEIVED outbox
    -> Central sp_process_transfer_received
    -> COMPLETED hoặc RECEIVED_WITH_DISCREPANCY
```

| Bước | Trạng thái source hiện tại |
|---|---|
| Central/Saga | Đã hỗ trợ |
| Node command path | Chưa có |
| `sp_accept_transfer` | DB có, backend chưa gọi |
| Reservation | DB có, runtime path chưa có |
| `sp_ship_transfer` | DB có, backend chưa gọi |
| Shipment ledger/outbox | DB có, runtime path chưa có |
| `sp_create_vwh_transfer` | DB có, event path chưa có |
| `sp_receive_transfer` | DB có, backend chưa gọi |
| `sp_process_transfer_received` | DB có, event path chưa có |
| Kafka | Chưa implement |

## 9. Files/functions cần sửa sau khi được duyệt

### Có khả năng cần sửa

- [transferService.ts](backend/src/services/transferService.ts): lấy Saga context đầy đủ và dispatch command intent.
- [messageBoundary.ts](backend/src/messaging/messageBoundary.ts): chỉ mở rộng payload type nếu cần; không tạo abstraction thứ hai.
- [outboxRelay.ts](backend/src/messaging/outboxRelay.ts): hiện tại đủ làm relay; chỉ thay đổi nếu cần routing/filter event.

### Có thể cần tạo

- Node transfer procedure adapter.
- Central transfer event handler.
- Node command application handler.
- Central event handler cho `TRANSFER_ACCEPTED`, `TRANSFER_SHIPPED`, `TRANSFER_RECEIVED`.

Chưa tạo các file trên trong lượt inspect này.

### Không nên sửa

- SQL procedure Saga.
- `stock_ledger`, `stock_reservation`, `ton_kho`, `vwh_transfer`, `transfer_discrepancy` schema.
- Auth/role system.
- Kafka package/configuration.
- Row `TRANSIT` runtime.
- `inventoryService` nhập/xuất thông thường.

## 10. Thứ tự implementation đề xuất

1. Tạo adapter gọi `sp_accept_transfer` tại đúng node owner.
2. Test transaction commit/rollback và outbox event.
3. Tạo command path cho source confirmation.
4. Xác định Central transition sau `TRANSFER_ACCEPTED`.
5. Tạo adapter gọi `sp_ship_transfer`.
6. Nối `TRANSFER_SHIPPED` với `sp_create_vwh_transfer`.
7. Tạo destination receive command với `so_luong_thuc_nhan`.
8. Tạo adapter gọi `sp_receive_transfer`.
9. Nối `TRANSFER_RECEIVED` với `sp_process_transfer_received`.
10. Test duplicate/retry từng bước.

## 11. Rủi ro

- `approveTransfer()` chỉ trả `saga_id`, chưa trả `ma_giao_dich_global`.
- Chưa có Central procedure riêng để xử lý `TRANSFER_ACCEPTED`; cần xác định state transition boundary trước khi code.
- Gọi `sp_ship_transfer` trước reservation sẽ fail.
- Gọi `sp_process_transfer_received` trước VWH sẽ fail.
- Không có durable consumer deduplication.
- Row `TRANSIT` thiếu vẫn là known mismatch; không được tự sửa để làm Task 3 chạy.
- Route approve transfer chưa truyền đầy đủ actor/scope vào service.
- Local `MessageTransport` chỉ là in-memory; chưa có production transport.

## 12. Đề xuất bước nhỏ nhất tiếp theo

Tạo một node procedure adapter cho `sp_accept_transfer` בלבד:

```text
input:
  saga_id
  global_id
  ma_phieu_dc
  ma_kho
  ma_sp
  so_luong

    -> getDbPool(ma_kho)
    -> BEGIN
    -> SELECT sp_accept_transfer(...)
    -> COMMIT/ROLLBACK
```

Test cần chứng minh:

- đúng node pool;
- đúng 6 parameter;
- rollback khi procedure lỗi;
- không update Central;
- procedure tự ghi `stock_reservation` và `outbox_event`;
- không gọi Kafka;
- không chạy full Saga.
