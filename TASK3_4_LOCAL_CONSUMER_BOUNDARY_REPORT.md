# TASK 3.4 - Local Consumer / Dispatcher Boundary Report

> Phạm vi: local in-process transport và application handler dispatch.
>
> Không Kafka, RabbitMQ, broker thật, schema migration, shipment, receiving hoặc full Saga.

## Interface

[MESSAGE boundary](backend/src/messaging/messageBoundary.ts) now exposes:

```ts
publish(message: ApplicationMessage): Promise<void>
subscribe(messageType: string, handler: MessageHandler): () => void
```

`MessageHandler` nhận `ApplicationMessage` và có thể throw lỗi.

## Local transport

[InMemoryMessageTransport](backend/src/messaging/inMemoryTransport.ts):

```text
publish(message)
    -> lưu message local
    -> tìm handlers theo message.messageType
    -> await từng handler
    -> propagate handler error
```

Transport chỉ làm routing. Nó không:

- đọc database;
- chạy procedure;
- cập nhật Saga;
- cập nhật inventory;
- xử lý idempotency business.

## Handler registration

Central handler được đăng ký qua:

```text
TRANSFER_ACCEPTED
    -> registerCentralTransferEventHandler()
    -> CentralTransferEventHandler.handle()
```

Business validation/state transition vẫn nằm trong [centralTransferEventHandler.ts](backend/src/services/centralTransferEventHandler.ts):

- validate message contract;
- load/lock Saga;
- kiểm tra event thuộc đúng Saga/source;
- chuyển `WAITING_SOURCE_CONFIRMATION -> SOURCE_ACCEPTED`;
- cập nhật monitoring timestamp/event type;
- xử lý `event_id` qua `ProcessedEventStore`.

## Error and retry semantics

Nếu handler throw:

```text
InMemoryMessageTransport.publish()
    -> rejects
OutboxRelay
    -> catches transport error
    -> retry_count + 1
    -> error_message
    -> status remains PENDING
```

Transport không đánh dấu event processed. Không có retry queue hoặc DLQ.

## Idempotency

- Event identity: `event_id`.
- Handler idempotency: `ProcessedEventStore` hiện tại là in-memory.
- Duplicate trong cùng process: handler trả duplicate semantics.
- Durable deduplication sau process restart: chưa có.
- Không tuyên bố exactly-once.

## Tests

Đã thêm [localMessageDispatcher.test.ts](backend/src/messaging/localMessageDispatcher.test.ts) với:

- `TRANSFER_ACCEPTED` dispatch đúng handler;
- unknown message type không gọi Central handler;
- handler throw được propagate;
- handler success resolve publish;
- duplicate event theo handler idempotency semantics;
- nhiều message type dispatch đúng handler tương ứng.

Validation:

```text
npm run build  PASS
npm test       PASS - 23 tests
TypeScript diagnostics PASS
```

## Files changed

- [messageBoundary.ts](backend/src/messaging/messageBoundary.ts)
- [inMemoryTransport.ts](backend/src/messaging/inMemoryTransport.ts)
- [centralTransferEventHandler.ts](backend/src/services/centralTransferEventHandler.ts)
- [localMessageDispatcher.test.ts](backend/src/messaging/localMessageDispatcher.test.ts)
- [package.json](backend/package.json)
- [PROJECT_PROGRESS.md](PROJECT_PROGRESS.md)

## Status

```text
TASK 3.4 = PARTIAL
```

Local consumer/dispatcher boundary đã hoàn chỉnh và test pass. Status vẫn `PARTIAL` vì:

- `InMemoryMessageTransport` chưa phải production broker;
- chưa có durable consumer-side deduplication;
- chưa có runtime process wiring tạo transport/relay/handler cùng nhau;
- Kafka vẫn chưa được implement.

## Next recommended task

Chốt durable idempotency strategy và composition root cho local runtime trước khi triển khai shipment hoặc Kafka adapter. Không gọi `sp_ship_transfer()` trong task này.
