# TASK 3.5: SOURCE SHIPMENT COMMAND PATH REPORT

## 1. Tong quan Implementation
Hoan thanh thiet ke va tich hop luong xuat hang tai kho nguon (Source Shipment Command Path) ket noi tu Application / HTTP API Layer xuong Stored Procedure `sp_ship_transfer()` tai Node Database so huu kho xuat.

Cac thanh phan da trien khai:
- **Adapter Layer** (`backend/src/services/nodeTransferProcedureAdapter.ts`): Thiem interface `ShipTransferCommand` va ham `shipTransferAtNode()` voi transaction boundary nguyen tu (`BEGIN` -> `SELECT sp_ship_transfer(...)` -> `COMMIT` / `ROLLBACK`).
- **Service Layer** (`backend/src/services/transferService.ts`): Thiem ham `shipSourceTransfer()` kiem tra nghiem ngat Saga State (`SOURCE_ACCEPTED`), Saga Status (`RUNNING`), su ton tai cua `global_id` va quyen han kho nguon (`kho_xuat`).
- **Controller Layer** (`backend/src/controllers/transferController.ts`): Thiem `handleSourceShipment()` xu ly HTTP request/response (tra ve HTTP 202 Accepted khi thanh cong).
- **Route Layer** (`backend/src/routes/transferRoutes.ts`): Dang ky route `POST /:maPhieu/source-ship` voi pipeline bao mat 4 lop (`verifyToken` -> `dbSelector` -> `branchGuard` -> `verifyRole(['ADMIN', 'MANAGER'])`).
- **Unit Tests**: Tich hop test cases xuat hang vao `nodeTransferProcedureAdapter.test.ts` va `transferService.test.ts`.
## 2. Command Flow
Plaintext
POST /transfer/:maPhieu/source-ship
  ↓ (Auth / DB Selector / Branch Guard / Role Check)
transferController.handleSourceShipment()
  ↓
transferService.shipSourceTransfer()
  ↓ (Load Saga Context tu Central DB)
  ↓ (Validate: State === 'SOURCE_ACCEPTED', Status === 'RUNNING', user ownership)
nodeTransferProcedureAdapter.shipTransferAtNode()
  ↓ (Select Node Pool qua ma_kho / kho_xuat)
  BEGIN
    SELECT sp_ship_transfer($1::uuid, $2::uuid, $3::varchar, $4::varchar, $5::varchar, $6::int)
  COMMIT / ROLLBACK
  ↓
Node DB ghi event TRANSFER_SHIPPED vao outbox_event (PENDING)
## 3. Files Changed
backend/src/services/nodeTransferProcedureAdapter.ts

backend/src/services/nodeTransferProcedureAdapter.test.ts

backend/src/services/transferService.ts

backend/src/services/transferService.test.ts

backend/src/controllers/transferController.ts

backend/src/routes/transferRoutes.ts
## 4. Procedure Parameters & State Validation
Procedure Parameters: sp_ship_transfer nhan du 6 tham so chuan kieu ep du lieu:

saga_id (UUID)

global_id (UUID)

ma_phieu_dc (VARCHAR)

ma_kho (VARCHAR)

ma_sp (VARCHAR)

so_luong (INT)

State Validation:

Saga current_state bat buoc phai la SOURCE_ACCEPTED.

Saga status bat buoc phai la RUNNING.

Yeu cau global_id khong duoc NULL.

User thuc hien phai co ma_kho trung voi kho_xuat (ngoai tru quyen ADMIN).
## 5. Transaction Boundary
Adapter dam bao quan ly giao dich nguyen tu tai Node DB:

TypeScript
const pool = poolResolver(command.ma_kho);
const client = await pool.connect();

try {
  await client.query('BEGIN');
  await client.query(
    `SELECT sp_ship_transfer($1::uuid, $2::uuid, $3::varchar, $4::varchar, $5::varchar, $6::int)`,
    [
      command.saga_id,
      command.global_id,
      command.ma_phieu_dc,
      command.ma_kho,
      command.ma_sp,
      command.so_luong,
    ],
  );
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  client.release();
}
## 6. Idempotency Status & Known Gaps
Idempotency Status
Stored procedure sp_ship_transfer() o muc Database kiem tra trang thai phieu. Neu thuc hien xuat hang lai khi phieu da o trang thai da xuat, procedure se throw Exception ngat giao dich, ngua tru viec tru ton kho 2 lan.

Known Gaps
IDEMPOTENCY GAP: He thong chua co bang luu Idempotency Key o Application/API layer cho command shipment. Neu Client gap Network Timeout sau khi DB da COMMIT va thuc hien Retry, Request retry se nhan HTTP 400 (Loi DB do phieu da xuat) thay vi ket qua thanh cong Idempotent.

TRANSIT ROW GAP: Da ghi nhan tu Task 1 (Central runtime van thieu row TRANSIT trong Saga view; tuand thu quy tac khong tu sua DB Schema o task nay).

## 7. Test Results
Chay truc tiep qua node:test runner:

npx tsx --test src/services/nodeTransferProcedureAdapter.test.ts -> 4/4 PASS

npx tsx --test src/services/transferService.test.ts -> 11/11 PASS

## 8. Status
DONE