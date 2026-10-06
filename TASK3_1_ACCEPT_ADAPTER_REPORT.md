# TASK 3.1 - `sp_accept_transfer` Adapter Report

> Phạm vi: nối application boundary với node procedure `sp_accept_transfer()`.
>
> Không sửa database schema, SQL procedure, business workflow, Saga đầy đủ hoặc Kafka.

## Implementation

Đã tạo [nodeTransferProcedureAdapter.ts](backend/src/services/nodeTransferProcedureAdapter.ts).

Adapter nhận đúng command:

```text
saga_id
global_id
ma_phieu_dc
ma_kho
ma_sp
so_luong
```

Flow:

```text
acceptTransferAtNode(command)
    -> poolResolver(command.ma_kho)
    -> node pool owner
    -> BEGIN
    -> SELECT sp_accept_transfer($1, $2, $3, $4, $5, $6)
    -> COMMIT
```

Nếu procedure lỗi:

```text
ROLLBACK
throw error
```

Adapter không trực tiếp thực hiện:

- `INSERT stock_reservation`
- `UPDATE ton_kho`
- `INSERT stock_ledger`
- `INSERT outbox_event`
- `sp_ship_transfer`
- `sp_receive_transfer`
- Kafka/message broker call

Các thay đổi reservation và outbox vẫn thuộc procedure database.

## Tests

Đã tạo [nodeTransferProcedureAdapter.test.ts](backend/src/services/nodeTransferProcedureAdapter.test.ts).

Đã kiểm thử:

- Chọn đúng node pool theo `ma_kho`.
- Truyền đúng 6 parameter theo đúng thứ tự.
- `BEGIN` và `COMMIT` khi procedure thành công.
- `ROLLBACK` và rethrow khi procedure lỗi.
- Fake procedure tạo reservation và `TRANSFER_ACCEPTED` outbox event.
- Không gọi shipment.
- Không gọi Kafka.

Validation:

```text
npm run build  PASS
npm test       PASS - 6 tests
TypeScript diagnostics PASS
```

## Current limitation

Test hiện tại là unit/boundary test với fake node pool và fake procedure behavior. Chưa chạy live database procedure để assert row thật trong `stock_reservation` và `outbox_event`, vì adapter bắt buộc tự `COMMIT` và chưa có integration fixture/cleanup contract an toàn.

Task này cũng chưa nối adapter vào `approveTransfer()` vì flow hiện tại chỉ trả `saga_id`; `ma_giao_dich_global` cần được đọc từ Central Saga trước khi gọi procedure.

Không tự tạo workaround hoặc hard-code `global_id`.

## Status

```text
TASK 3.1 = PARTIAL
```

Lý do:

- Adapter và transaction boundary đã implement.
- Unit tests đã pass.
- Còn thiếu live integration verification với procedure runtime.
- Chưa có application command path cung cấp đầy đủ Saga context từ Central.

## Next recommended task

Thiết kế command path đọc đầy đủ Saga context tại Central, đặc biệt `ma_giao_dich_global`, rồi mới nối adapter vào source-confirmation flow. Không triển khai `sp_ship_transfer`, `sp_receive_transfer` hoặc full Saga trong bước đó.
