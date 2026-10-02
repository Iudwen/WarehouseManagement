# TASK 3.3 - `TRANSFER_ACCEPTED` Central Handler Report

> Phạm vi: xử lý event `TRANSFER_ACCEPTED` tại Central.
>
> Không implement Kafka, consumer broker, shipment, receiving, full Saga hoặc schema change.

## Implementation

Đã tạo [centralTransferEventHandler.ts](backend/src/services/centralTransferEventHandler.ts).

Handler nhận `ApplicationMessage` và chỉ chấp nhận:

```text
messageType = TRANSFER_ACCEPTED
```

Flow:

```text
ApplicationMessage
    -> validate event contract
    -> check event_id application store
    -> BEGIN Central transaction
    -> SELECT saga_transaction FOR UPDATE
    -> validate saga/global/transfer/product/source
    -> validate status = RUNNING
    -> validate current_state = WAITING_SOURCE_CONFIRMATION
    -> UPDATE saga_transaction current_state = SOURCE_ACCEPTED
    -> UPDATE saga_monitoring current_state/last_event_*
    -> COMMIT
    -> mark event_id processed
```

Không thực hiện:

- `ton_kho` update;
- `stock_reservation` update;
- `stock_ledger` insert;
- VWH update;
- `sp_ship_transfer()`;
- `sp_receive_transfer()`;
- Kafka/RabbitMQ call;
- Central outbox insert.

## State transition

Runtime/schema state transition:

```text
WAITING_SOURCE_CONFIRMATION
    -> SOURCE_ACCEPTED
```

Các thay đổi Central:

- `saga_transaction.current_state = SOURCE_ACCEPTED`;
- `saga_transaction.updated_at = CURRENT_TIMESTAMP`;
- `saga_monitoring.current_state = SOURCE_ACCEPTED`;
- `saga_monitoring.last_event_type = TRANSFER_ACCEPTED`;
- `saga_monitoring.last_event_at = CURRENT_TIMESTAMP`;
- `saga_monitoring.updated_at = CURRENT_TIMESTAMP`.

Không chuyển Saga sang `COMPLETED` và không cập nhật `dieu_chuyen_central` sang trạng thái hoàn tất.

## Contract validation

Handler kiểm tra:

- `event_id` tồn tại;
- `messageType = TRANSFER_ACCEPTED`;
- `saga_id` tồn tại;
- `globalTransactionId` tồn tại;
- `aggregateId` tồn tại;
- payload có `ma_phieu_dc`, `ma_kho`, `ma_sp`, `so_luong`;
- payload transfer khớp `aggregateId`;
- payload global ID khớp envelope nếu có;
- Saga global ID khớp message;
- transfer ID khớp Saga;
- product khớp Saga;
- source warehouse khớp `saga_transaction.kho_xuat`;
- quantity khớp `so_luong_yeu_cau`.

## Idempotency

Đã tạo `ProcessedEventStore` abstraction và `InMemoryProcessedEventStore`.

Trong cùng process:

- event đã processed theo `event_id` không xử lý lại;
- event đang xử lý được chia sẻ qua in-flight promise;
- Saga state `SOURCE_ACCEPTED` được xem là duplicate semantic result nếu event được retry sau commit.

Giới hạn:

```text
CURRENT GAP:
durable consumer-side deduplication chưa được implement.
```

In-memory store mất dữ liệu khi process restart. Không giả vờ coi đây là exactly-once hoặc durable idempotency.

## Tests

Đã tạo [centralTransferEventHandler.test.ts](backend/src/services/centralTransferEventHandler.test.ts).

Test các trường hợp:

- message đúng và state transition thành công;
- sai event type;
- Saga không tồn tại;
- source warehouse không khớp;
- duplicate event ID;
- Saga state không hợp lệ;
- Central update lỗi và rollback/retry.

Validation:

```text
npm run build       PASS
npm test            PASS - 17 tests
TypeScript errors   NONE
Kafka dependency   NONE
```

## Integration boundary limitation

`MessageTransport` hiện chỉ có `publish()` và `OutboxRelay` chưa có subscription/consumer dispatch. Vì vậy handler hiện là application-level handler nhận `ApplicationMessage`, sẵn sàng để consumer tương lai gọi, nhưng chưa được nối vào Kafka hoặc broker thực tế.

## Status

```text
TASK 3.3 = PARTIAL
```

Lý do:

- Central handler và state transition đã implement.
- Unit tests pass.
- Chưa có durable idempotency storage.
- Chưa có message consumer/subscription runtime nối relay transport vào handler.
- Không chạy live integration mutation trên Central vì chưa có fixture/cleanup contract an toàn.

## Next recommended task

Chốt application consumer boundary cho `MessageTransport`/local transport và durable idempotency strategy trước khi xử lý `TRANSFER_SHIPPED`. Không gọi `sp_ship_transfer()` trong bước tiếp theo nếu chưa chốt retry/idempotency và state transition contract.
