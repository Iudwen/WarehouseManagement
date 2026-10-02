# WarehouseManagement - Project Progress

> Cập nhật: 2026-10-02
>
> Phạm vi cập nhật: inspection, thiết kế boundary cho Kafka tương lai và tích hợp outbox tối thiểu.
>
> Kafka chưa được cài đặt hoặc implement.

## Current Status

Dự án hiện đang ở trạng thái **chuẩn bị kiến trúc cho messaging**, chưa hoàn tất các business flow phân tán.

```text
Read-only inspection          DONE
Target architecture document  DONE
Application messaging port    DONE
Node inventory outbox writes  PARTIAL
Kafka transport               NOT STARTED
Full Saga execution           NOT STARTED
Full role matrix              NOT STARTED
TASK 1 runtime schema         DONE_WITH_KNOWN_MISMATCH
TASK 2 local outbox relay     DONE
TASK 3.1 node accept adapter  PARTIAL
TASK 3.2 source confirmation  PARTIAL
TASK 3.3 accepted event handler PARTIAL
TASK 3.4 local consumer boundary PARTIAL
```

## Completed

### 1. Read-only inspection

Đã kiểm tra và ghi nhận:

- Kiến trúc backend Express/TypeScript.
- Ba node PostgreSQL HN, DN, HCM.
- Central PostgreSQL.
- `dbSelector` và database pool mapping.
- Inventory service.
- Transfer service và Central Saga call.
- Node schema cho `outbox_event`, `stock_ledger`, `stock_reservation`.
- Các node Saga procedure `sp_accept_transfer`, `sp_ship_transfer`, `sp_receive_transfer`.
- Central procedure `sp_create_saga`, `sp_create_vwh_transfer` và discrepancy resolution.
- MongoDB event logging.
- Các điểm còn thiếu trong runtime.

Báo cáo chi tiết: [READ_ONLY_INSPECTION_REPORT.md](READ_ONLY_INSPECTION_REPORT.md).

### 2. Target architecture documentation

Đã ghi thiết kế target vào [note_quan_trong.md](note_quan_trong.md), gồm:

- Node/Central ownership.
- Kafka chỉ là transport, không phải source of truth.
- Message contract.
- Producer/consumer target.
- Node outbox và Central outbox target.
- Mapping message với Saga state.
- Retry, idempotency và dead-letter direction.
- Các thành phần cố ý chưa implement.

### 3. Application-level messaging boundary

Đã thêm [messageBoundary.ts](backend/src/messaging/messageBoundary.ts):

- `ApplicationMessage` contract.
- `MessageTransport` interface cho adapter tương lai.
- `appendOutboxEvent()` ghi event qua transaction client hiện tại.
- Không có Kafka dependency.
- Không có exchange, queue, producer hoặc consumer.

### 4. Inventory outbox integration

Đã tích hợp ghi `outbox_event` trong cùng PostgreSQL transaction với các thao tác hiện có:

- Tạo phiếu nhập: `INVENTORY_IMPORT_REQUESTED`.
- Hoàn tất phiếu nhập: `INVENTORY_IMPORT_COMPLETED`.
- Từ chối phiếu nhập: `INVENTORY_IMPORT_REJECTED`.
- Tạo phiếu xuất: `INVENTORY_EXPORT_REQUESTED`.
- Hoàn tất phiếu xuất: `INVENTORY_EXPORT_COMPLETED`.
- Từ chối phiếu xuất: `INVENTORY_EXPORT_REJECTED`.

Business workflow và status hiện tại không bị thay đổi.

### 5. Existing node transaction procedures

Schema node đã có procedure transaction cho Saga transfer:

- `sp_accept_transfer`: khóa tồn, tính tồn khả dụng, tạo `stock_reservation`, ghi `TRANSFER_ACCEPTED` vào `outbox_event`.
- `sp_ship_transfer`: khóa reservation/tồn, trừ `ton_kho`, ghi `stock_ledger`, consume reservation và ghi `TRANSFER_SHIPPED` vào outbox.
- `sp_receive_transfer`: chống receive trùng theo outbox event, cộng tồn node đích, ghi ledger và ghi `TRANSFER_RECEIVED`.

Các procedure này là database capability hiện có, nhưng backend runtime chưa gọi chúng.

### 6. Local outbox relay boundary

Đã thêm [outboxRelay.ts](backend/src/messaging/outboxRelay.ts):

- Đọc một event `PENDING` theo thứ tự `created_at`, `event_id`.
- Claim bằng `FOR UPDATE SKIP LOCKED` trong PostgreSQL transaction.
- Chuyển row thành `ApplicationMessage` và gọi `MessageTransport`.
- Chỉ chuyển sang `PROCESSED` sau khi transport thành công.
- Ghi `processed_at` khi thành công.
- Khi transport lỗi, tăng `retry_count`, ghi `error_message` và giữ `PENDING` để retry.
- Crash trước khi commit sẽ rollback transaction claim, event vẫn có thể retry.

Đã thêm [inMemoryTransport.ts](backend/src/messaging/inMemoryTransport.ts) làm fake/local transport, không kết nối network.

Đã thêm [outboxRelay.test.ts](backend/src/messaging/outboxRelay.test.ts) với các case success, failure/retry, concurrent relay và event đã processed.

### 7. TASK 3.1 - Node accept procedure adapter

Đã thêm [nodeTransferProcedureAdapter.ts](backend/src/services/nodeTransferProcedureAdapter.ts):

- Nhận đủ `saga_id`, `global_id`, `ma_phieu_dc`, `ma_kho`, `ma_sp`, `so_luong`.
- Chọn node owner bằng `getDbPool(ma_kho)`.
- Quản lý `BEGIN`/`COMMIT`/`ROLLBACK` tại node caller.
- Chỉ gọi `sp_accept_transfer()`.
- Không tự ghi reservation, inventory, ledger hoặc outbox.
- Không gọi Kafka, shipment hoặc receiving.

Đã thêm [nodeTransferProcedureAdapter.test.ts](backend/src/services/nodeTransferProcedureAdapter.test.ts) để kiểm tra pool routing, sáu parameter, commit/rollback và không chạy shipment.

Trạng thái `TASK 3.1 = PARTIAL`: unit boundary tests pass, nhưng chưa có live integration fixture để assert row thật trong `stock_reservation` và `outbox_event`. Adapter chưa nối vào `approveTransfer()` vì flow hiện tại chưa cung cấp `ma_giao_dich_global`.

### 8. TASK 3.2 - Source confirmation command path

Đã thêm command path:

```text
POST /transfer/:maPhieu/source-confirm
    -> load saga_transaction từ Central
    -> kiểm tra global_id, state và source warehouse ownership
    -> AcceptTransferCommand
    -> acceptTransferAtNode()
    -> node sp_accept_transfer()
```

Files liên quan:

- [transferService.ts](backend/src/services/transferService.ts)
- [transferController.ts](backend/src/controllers/transferController.ts)
- [transferRoutes.ts](backend/src/routes/transferRoutes.ts)
- [transferService.test.ts](backend/src/services/transferService.test.ts)

Trạng thái `TASK 3.2 = PARTIAL`:

- Application command path và unit tests đã pass.
- Chưa có live database integration fixture an toàn.
- Chưa có Central event handler cho `TRANSFER_ACCEPTED`.
- `sp_accept_transfer()` chưa có duplicate protection rõ ràng; không tự thêm deduplication trong task này.
- Chưa gọi shipment/receiving.

### 9. TASK 3.4 - Local consumer/dispatcher boundary

Đã mở rộng [messageBoundary.ts](backend/src/messaging/messageBoundary.ts):

- `MessageTransport.publish()` giữ nguyên.
- Thêm `MessageTransport.subscribe(messageType, handler)`.
- Thêm `MessageHandler` contract.

[inMemoryTransport.ts](backend/src/messaging/inMemoryTransport.ts) hiện dispatch message theo `messageType` và propagate handler error. Transport không truy cập database và không chứa business logic.

Đã đăng ký:

```text
TRANSFER_ACCEPTED
    -> CentralTransferEventHandler
```

Đã thêm [localMessageDispatcher.test.ts](backend/src/messaging/localMessageDispatcher.test.ts) cho success, unknown type, handler failure, duplicate semantics và multiple message types.

Trạng thái `TASK 3.4 = PARTIAL`:

- Local boundary và tests đã pass.
- Chưa có durable consumer deduplication.
- Chưa có production broker.
- Chưa có runtime composition root nối relay/transport/handler tự động.

## Validation

Đã chạy:

```text
backend: npm run build       PASS
backend: npm test            PASS (23 tests)
TypeScript diagnostics        PASS
```

Các file đã sửa không có diagnostic:

- [messageBoundary.ts](backend/src/messaging/messageBoundary.ts)
- [inventoryService.ts](backend/src/services/inventoryService.ts)

Chưa chạy được integration test vì các test PowerShell được liệt kê trước đó hiện không còn trong working tree tại thời điểm kiểm tra.

### Runtime schema verification

Đã kiểm tra read-only runtime PostgreSQL:

- NODE_DN: kết nối được, các bảng/procedure chính đã verified.
- NODE_HCM: kết nối được, các bảng/procedure chính đã verified.
- CENTRAL: kết nối được, các bảng/procedure Saga/VWH/discrepancy đã verified.
- NODE_HN: kết nối được, container healthy, các bảng/procedure chính đã verified.

Chi tiết: [RUNTIME_SCHEMA_REPORT.md](RUNTIME_SCHEMA_REPORT.md).

Phát hiện mismatch:

- Central repository SQL định nghĩa record `TRANSIT`, nhưng runtime Central hiện không có row `TRANSIT`.
- HN/DN/HCM không có `pgcrypto` trong `pg_extension`, dù `gen_random_uuid()` vẫn hoạt động trên PostgreSQL 18.6.

Không có database/schema nào bị sửa.

## Current Architecture Reality

### Node database

Node vẫn là source of truth cho inventory của warehouse tương ứng:

- `ton_kho`
- `stock_ledger`
- `stock_reservation`
- `outbox_event`
- Phiếu nhập/xuất và chi tiết phiếu

### Central database

Central vẫn sở hữu:

- `dieu_chuyen_central`
- Saga metadata/state
- TRANSIT/VWH metadata
- Dữ liệu tổng hợp

Central chưa được thay đổi để trực tiếp update inventory của node.

### Current messaging state

Hiện tại:

```text
Business transaction
    -> node PostgreSQL
    -> outbox_event
    -> COMMIT
    -> local OutboxRelay
    -> MessageTransport
    -> InMemoryMessageTransport.subscribe()
    -> CentralTransferEventHandler
```

Local relay và local consumer boundary đã có; Kafka broker/adapter chưa có và vẫn nằm ngoài phạm vi.

## Partial / Known Gaps

### 1. Kafka transport chưa có

Local relay đã đọc các row `PENDING` và chuyển qua `MessageTransport`. Chưa có Kafka adapter hoặc broker transport.

Task 2 local relay chưa được implement; Task 1 đã đủ evidence runtime để bắt đầu relay boundary.

### 2. Kafka chưa implement

Chưa có:

- Kafka package/configuration.
- Topic/partition configuration.
- Kafka producer adapter.
- Kafka consumer adapter.
- Retry queue.
- Dead-letter queue.

### 3. Central outbox chưa có

Schema hiện tại có node `outbox_event`, nhưng chưa có Central outbox tương đương được xác nhận trong runtime. Chưa tự ý tạo bảng mới.

### 4. Ledger runtime chưa hoàn chỉnh

Schema `stock_ledger` và transfer procedures đã tồn tại. Tuy nhiên:

- `inventoryService` vẫn chưa ghi ledger cho nhập/xuất trực tiếp.
- `transferService` chưa gọi `sp_ship_transfer` hoặc `sp_receive_transfer`.
- Vì vậy transfer ledger mới chỉ có trong SQL procedure path, chưa được kích hoạt bởi backend runtime.

### 5. Reservation runtime chưa hoàn chỉnh

Schema và `sp_accept_transfer` đã có logic reservation tại node nguồn. Adapter Task 3.1 và source-confirmation command path đã có, nhưng chưa có Central event consumer/state transition sau `TRANSFER_ACCEPTED`.

### 6. Transfer/Saga chưa hoàn tất

Backend runtime hiện tại chủ yếu chạy:

```text
Tạo transfer request
    -> Central PENDING
    -> gọi sp_create_saga
```

Database đã có các bước tiếp theo, nhưng chưa được nối vào backend messaging/runtime.

Các bước chưa hoàn tất:

- Source confirmation.
- Stock reservation.
- Source shipment.
- TRANSIT lifecycle.
- Destination receiving.
- Discrepancy handling.
- Shortage acceptance.
- Supplemental delivery.
- Compensation.
- Destination inventory update.
- Final ledger entries.

### 7. Authorization chưa đạt role matrix cuối

Code hiện đang dùng `ADMIN`, `MANAGER`, `STAFF`. Các role nghiệp vụ sau chưa được triển khai riêng:

- `QUẢN LÝ KHO`
- `NHÂN VIÊN KHO`
- `ĐIỀU PHỐI`
- `DATA ANALYST`

Data scope hiện vẫn dựa trên một `ma_kho` trong user payload; cardinality user/warehouse cần được xác minh từ schema trước khi mở rộng.

### 8. State machine chưa thống nhất

Hiện còn nhiều nhóm status giữa backend và Saga schema:

```text
PENDING_APPROVAL
PENDING
DANG_XU_LY
COMPLETED
REJECTED
IN_TRANSIT
RECEIVING
DISCREPANCY
```

Chưa có state transition handler dùng chung.

### 9. Relay delivery semantics

Relay hiện đảm bảo at-least-once delivery boundary:

- Không đánh dấu `PROCESSED` trước transport success.
- Concurrent relay dùng row lock để không claim cùng event đồng thời.
- Nếu process crash sau khi transport đã nhận nhưng trước DB commit, event có thể được publish lại. Consumer/transport tương lai phải dùng `event_id` để xử lý duplicate.
- Durable consumer-side deduplication chưa được implement.

## Files Changed For This Progress

- [messageBoundary.ts](backend/src/messaging/messageBoundary.ts)
- [inventoryService.ts](backend/src/services/inventoryService.ts)
- [note_quan_trong.md](note_quan_trong.md)
- [READ_ONLY_INSPECTION_REPORT.md](READ_ONLY_INSPECTION_REPORT.md)
- [PROJECT_PROGRESS.md](PROJECT_PROGRESS.md)
- [RUNTIME_SCHEMA_REPORT.md](RUNTIME_SCHEMA_REPORT.md)
- [outboxRelay.ts](backend/src/messaging/outboxRelay.ts)
- [inMemoryTransport.ts](backend/src/messaging/inMemoryTransport.ts)
- [outboxRelay.test.ts](backend/src/messaging/outboxRelay.test.ts)
- [package.json](backend/package.json)
- [nodeTransferProcedureAdapter.ts](backend/src/services/nodeTransferProcedureAdapter.ts)
- [nodeTransferProcedureAdapter.test.ts](backend/src/services/nodeTransferProcedureAdapter.test.ts)
- [TASK3_1_ACCEPT_ADAPTER_REPORT.md](TASK3_1_ACCEPT_ADAPTER_REPORT.md)
- [transferService.ts](backend/src/services/transferService.ts)
- [transferController.ts](backend/src/controllers/transferController.ts)
- [transferRoutes.ts](backend/src/routes/transferRoutes.ts)
- [transferService.test.ts](backend/src/services/transferService.test.ts)
- [TASK3_2_SOURCE_CONFIRMATION_REPORT.md](TASK3_2_SOURCE_CONFIRMATION_REPORT.md)
- [centralTransferEventHandler.ts](backend/src/services/centralTransferEventHandler.ts)
- [centralTransferEventHandler.test.ts](backend/src/services/centralTransferEventHandler.test.ts)
- [TASK3_3_TRANSFER_ACCEPTED_HANDLER_REPORT.md](TASK3_3_TRANSFER_ACCEPTED_HANDLER_REPORT.md)
- [localMessageDispatcher.test.ts](backend/src/messaging/localMessageDispatcher.test.ts)
- [TASK3_4_LOCAL_CONSUMER_BOUNDARY_REPORT.md](TASK3_4_LOCAL_CONSUMER_BOUNDARY_REPORT.md)

## Intentionally Not Changed

- Không cài Kafka.
- Không thêm dependency Kafka.
- Không tạo topic/consumer/producer.
- Không tạo Kafka adapter; `InMemoryMessageTransport` chỉ phục vụ local test.
- Không đổi database schema.
- Không tạo Central outbox table khi chưa có kết luận schema bắt buộc.
- Không chuyển dự án thành microservices.
- Không chuyển ownership inventory về Central.
- Không tự động triển khai full Saga.
- Không thay đổi workflow nhập/xuất hiện tại ngoài việc ghi outbox event cùng transaction.
- Không tạo Kafka transport trong phạm vi Task 2.

## Next Recommended Tasks

### Task 1 - Verify runtime schema

Xác minh trên ba node đang chạy:

- `outbox_event` tồn tại và constraint đúng.
- `gen_random_uuid()` hoạt động.
- `stock_ledger` tồn tại.
- `stock_reservation` tồn tại.
- Các procedure transaction đã được apply.

Trạng thái thực tế: `DONE_WITH_KNOWN_MISMATCH`.

Xem [RUNTIME_SCHEMA_REPORT.md](RUNTIME_SCHEMA_REPORT.md) để biết evidence và mismatch. Cả ba node đã verified; Central vẫn thiếu row runtime `TRANSIT` dù repository SQL có định nghĩa.

### Task 2 - Add a local outbox relay boundary

Thiết kế relay không phụ thuộc Kafka cụ thể:

```text
outbox_event PENDING
    -> message transport interface
```

Ở task này chỉ nên kiểm thử bằng adapter nội bộ hoặc fake transport; chưa thêm Kafka.

Trạng thái: `DONE`.

Đã pass 4 test local relay. Relay vẫn transport-agnostic và chưa có Kafka implementation.

### Task 3 - Connect existing node transaction procedures

#### Task 3.1 - `sp_accept_transfer` adapter

Trạng thái: `PARTIAL`.

Adapter đã được implement và unit tests pass. Chưa nối vào transfer flow hiện tại vì `approveTransfer()` chưa cung cấp `ma_giao_dich_global`; chưa chạy live procedure integration test.

Chi tiết: [TASK3_1_ACCEPT_ADAPTER_REPORT.md](TASK3_1_ACCEPT_ADAPTER_REPORT.md).

#### Task 3.2 - Source confirmation command path

Trạng thái: `PARTIAL`.

Command path đã nối từ endpoint source confirmation tới Saga context Central và `sp_accept_transfer()`; tests pass. Chưa có live integration fixture, Central event handler sau `TRANSFER_ACCEPTED` hoặc durable deduplication.

Chi tiết: [TASK3_2_SOURCE_CONFIRMATION_REPORT.md](TASK3_2_SOURCE_CONFIRMATION_REPORT.md).

#### Task 3.3 - Central `TRANSFER_ACCEPTED` handler

Đã thêm [centralTransferEventHandler.ts](backend/src/services/centralTransferEventHandler.ts):

- Nhận `ApplicationMessage` với `messageType = TRANSFER_ACCEPTED`.
- Validate `event_id`, `saga_id`, `global_id`, transfer, source warehouse, product và quantity.
- Lock `saga_transaction` tại Central.
- Chuyển state `WAITING_SOURCE_CONFIRMATION -> SOURCE_ACCEPTED`.
- Cập nhật `saga_monitoring.last_event_type` và timestamp.
- Không cập nhật inventory, reservation, ledger, VWH hoặc Central outbox.

Đã thêm [centralTransferEventHandler.test.ts](backend/src/services/centralTransferEventHandler.test.ts) với 7 case validation/idempotency/rollback.

Trạng thái `TASK 3.3 = PARTIAL`:

- Handler và unit tests đã pass.
- Idempotency hiện chỉ bền trong process qua `InMemoryProcessedEventStore` abstraction.
- Chưa có runtime consumer/subscription nối transport vào handler.
- Chưa chạy live Central mutation test vì chưa có fixture/cleanup an toàn.

#### Task 3.4 - Local consumer/dispatcher boundary

Trạng thái: `PARTIAL`.

Đã mở rộng `MessageTransport` với `subscribe(messageType, handler)` và dispatch local bằng `InMemoryMessageTransport`. `TRANSFER_ACCEPTED` có registration tới Central handler; handler error được propagate để OutboxRelay giữ retry semantics. Đã pass 23 tests tổng cộng.

Known limitations:

- Chưa có durable consumer deduplication.
- Chưa có production broker.
- Chưa có runtime composition root tự động nối relay, transport và handler.

Chi tiết: [TASK3_4_LOCAL_CONSUMER_BOUNDARY_REPORT.md](TASK3_4_LOCAL_CONSUMER_BOUNDARY_REPORT.md).

Nối application command path vào các procedure đã có:

- `sp_accept_transfer`;
- `sp_ship_transfer`;
- `sp_receive_transfer`.

Giữ đúng transaction boundary cho:

- stock ledger;
- stock reservation;
- idempotency;
- outbox event;
- locking.

### Task 4 - Implement transfer Saga incrementally

Theo thứ tự:

```text
source confirmation
-> reservation
-> shipment
-> TRANSIT
-> receiving
-> discrepancy
-> completion/compensation
```

Mỗi bước phải có test retry và duplicate message trước khi chuyển bước tiếp theo.

Kafka adapter chỉ được thêm sau khi local transport boundary và outbox relay đã được kiểm thử.

### Task 5 - Reconcile role and data scope

Chỉ triển khai sau khi đã xác minh schema user/warehouse thật và thống nhất mã role với business matrix.
