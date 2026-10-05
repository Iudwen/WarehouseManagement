# TASK 3.2 - Source Confirmation Command Path Report

> Phạm vi: nối command path source confirmation với `sp_accept_transfer()`.
>
> Không triển khai shipment, receiving, full Saga, Kafka hoặc schema change.

## Implemented path

```text
POST /transfer/:maPhieu/source-confirm
    -> transferController.handleSourceConfirmation()
    -> transferService.confirmSourceTransfer()
    -> load Saga context from Central
    -> validate Saga state and source ownership
    -> construct AcceptTransferCommand
    -> nodeTransferProcedureAdapter.acceptTransferAtNode()
    -> getDbPool(ma_kho)
    -> BEGIN
    -> SELECT sp_accept_transfer(...)
    -> COMMIT
```

Nếu procedure lỗi:

```text
ROLLBACK
throw error
```

## Saga context loaded from Central

`confirmSourceTransfer()` đọc từ `saga_transaction`:

- `saga_id`
- `ma_giao_dich_global`
- `ma_phieu_dc`
- `kho_xuat`
- `ma_sp`
- `so_luong_yeu_cau`
- `current_state`
- `status`

Validation:

- Saga phải tồn tại.
- `ma_giao_dich_global` không được thiếu.
- `status` phải là `RUNNING`.
- `current_state` phải là `WAITING_SOURCE_CONFIRMATION`.
- User không phải ADMIN phải thuộc `kho_xuat`.

Không tự tạo hoặc hard-code `global_id`.

## Files changed

- [transferService.ts](backend/src/services/transferService.ts)
  - thêm Saga context loader;
  - thêm `confirmSourceTransfer()`;
  - gọi node accept adapter.
- [transferController.ts](backend/src/controllers/transferController.ts)
  - thêm `handleSourceConfirmation()`.
- [transferRoutes.ts](backend/src/routes/transferRoutes.ts)
  - thêm `POST /:maPhieu/source-confirm`;
  - reuse `verifyToken`, `dbSelector`, `branchGuard`, `verifyRole(['ADMIN', 'MANAGER'])`.
- [transferService.test.ts](backend/src/services/transferService.test.ts)
  - test command construction, missing Saga, wrong source ownership và missing global ID.
- [package.json](backend/package.json)
  - thêm test source-confirmation vào `npm test`.
- [PROJECT_PROGRESS.md](PROJECT_PROGRESS.md)

## Tests and validation

```text
npm run build       PASS
npm test            PASS - 10 tests
TypeScript errors   NONE
Kafka dependency   NONE
```

Các test source confirmation chứng minh:

- Saga context được load.
- `ma_giao_dich_global` được truyền nguyên vẹn.
- `ma_kho` nguồn được dùng để tạo command.
- Adapter được gọi đúng command.
- Saga context thiếu thì fail.
- Source warehouse không thuộc user thì fail.
- Thiếu `global_id` thì fail, không tạo workaround.

## Known gaps

Task 3.2 chưa được coi là full runtime integration vì:

1. Test dùng injected loader/adapter, chưa chạy live database procedure với fixture/cleanup an toàn.
2. Central chưa có event handler cập nhật Saga sau `TRANSFER_ACCEPTED`.
3. Node procedure ghi outbox, nhưng chưa có consumer xử lý event `TRANSFER_ACCEPTED`.
4. `sp_accept_transfer()` hiện không có duplicate protection rõ ràng; retry source-confirmation có thể tạo thêm reservation/outbox. Không tự thêm deduplication trong Task 3.2.
5. `sp_ship_transfer()` và `sp_receive_transfer()` chưa được gọi.

## Status

```text
TASK 3.2 = PARTIAL
```

Command path đã nối đầy đủ ở application layer và tests pass. Full runtime confirmation còn phụ thuộc Central event handling, consumer path và live integration fixture.

## Next recommended task

Thiết kế Central handling cho `TRANSFER_ACCEPTED` và cơ chế chuyển Saga sang bước tiếp theo, nhưng chưa gọi `sp_ship_transfer()` trong bước hiện tại nếu chưa có quyết định riêng cho state transition/idempotency.
