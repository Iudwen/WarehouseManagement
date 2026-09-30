# Warehouse Management - Project Roadmap

Muc tieu cuoi:

- Mot codebase backend dung chung cho HN, DN va HCM.
- Ba node database co the chay tren ba thiet bi rieng.
- STAFF chi ghi nhan phieu, khong tu thay doi ton kho.
- MANAGER/ADMIN duyet thi ton kho moi thay doi.
- CENTRAL luu du lieu tong hop, Saga metadata va monitoring.
- Data Mining chi duoc chuan bi ve schema/data contract, khong nam trong pham vi trien khai hien tai.

## Trang thai tong quan

| Giai doan | Noi dung | Trang thai |
|---|---|---|
| 1 | Chot pham vi va baseline | DA CO BAN |
| 2 | Chuan hoa schema va ownership node | DA PASS |
| 3 | Routing HN/DN/HCM | DA PASS |
| 4 | Workflow nhap/xuat approval | DA PASS |
| 5 | Approval Center tren frontend | DA PASS LUONG CHINH 3 NODE |
| 6 | Dieu chuyen va Saga | REQUEST/APPROVAL DA PASS, CHUA HOAN THIEN |
| 7 | CENTRAL va Data Mining readiness | DA PASS PHAN ETL, CON CONTRACT CHECK |
| 8 | Test nhieu node tren mot may | DA PASS CO BAN |
| 9 | Deploy nhieu thiet bi va hardening | CHUA LAM |

---

## Giai doan 1 - Chot pham vi va baseline

### Muc tieu

Giu mot codebase dung chung. Chua tach backend thanh ba codebase va chua lam kho con HN-CG/HN-HM.

### Da hoan thanh

- Backend TypeScript dung chung.
- PostgreSQL HN, DN, HCM va CENTRAL.
- MongoDB event log.
- Frontend React.
- Playwright E2E co ban.
- Security test va node readiness test.

### Kiem tra da pass

- `npm run build` backend.
- `npm run lint` frontend.
- `npm run build` frontend.
- `npm run test:e2e`.
- `backend/test_security.ps1`.
- `backend/test_nodes.ps1`.
- `backend/test_approval_workflow.ps1`.

---

## Giai doan 2 - Chuan hoa schema va ownership node

### Muc tieu

Xac dinh ro kho nao thuoc node nao.

### Viec can lam

- Sua CENTRAL mapping:
  - `HN01 -> NODE_HN`
  - `DN01 -> NODE_DN`
  - `HCM01 -> NODE_HCM`
- Khong xoa volume database hien tai.
- Tao migration rieng cho database dang chay.
- Apply `loai_kho`, workflow columns va transaction support cho ca ba node.
- Kiem tra schema HN/DN/HCM giong nhau.
- Xoa markdown fence neu con trong SQL file.

### Da hoan thanh trong dot hien tai

- CENTRAL ownership da dung: `HN01 -> NODE_HN`, `DN01 -> NODE_DN`, `HCM01 -> NODE_HCM`.
- Da them migration `08_fix_node_ownership.sql`.
- Da them migration `10_align_runtime_schema.sql` cho ba node.
- Da apply migration vao cac volume dang chay ma khong xoa du lieu.
- ETL chi dong bo kho thuoc node hien tai, khong ghi de ownership boi node khac.
- ETL da chay thanh cong ca NODE_HN, NODE_DN va NODE_HCM.
- Ba node da co `stock_reservation`, `outbox_event`, `stock_ledger` va cac routine transaction/Saga.
- Schema core, workflow va transaction support da duoc kiem tra dong nhat tren HN/DN/HCM.

### Dieu kien hoan thanh

```text
CENTRAL ownership dung.
Ba node co schema giong nhau.
Migration chay khong mat du lieu.
Schema check pass tren HN, DN, HCM.
```

---

## Giai doan 3 - Routing HN/DN/HCM

### Muc tieu

Backend chon database bang mapping chinh xac, khong doan chuoi va khong fallback sai.

### Viec can lam

- Thay `startsWith/includes` bang exact mapping.
- Ma kho khong hop le phai tra `400`.
- Khong cho request roi vao CENTRAL khi ma kho sai.
- CENTRAL la database rieng, khong phai fallback cho warehouse node.
- Them test mapping HN01, DN01, HCM01 va ma sai.

### Da hoan thanh trong dot hien tai

- `HN01` chi vao pool HN.
- `DN01` chi vao pool DN.
- `HCM01` chi vao pool HCM.
- Ma kho khong hop le tra `400`, khong fallback ve CENTRAL.
- Dashboard va alerts da loc exact theo `ma_kho`.

### Dieu kien hoan thanh

```text
HN01 chi vao HN.
DN01 chi vao DN.
HCM01 chi vao HCM.
Ma kho sai bi tu choi.
```

---

## Giai doan 4 - Workflow nhap/xuat approval

### Muc tieu

STAFF tao phieu. MANAGER/ADMIN duyet. Chi phieu duoc duyet moi thay doi ton kho.

### Workflow nhap

```text
STAFF tao phieu
-> PENDING_APPROVAL
-> ton kho chua doi
-> MANAGER/ADMIN approve
-> COMPLETED
-> ton kho tang
```

### Workflow xuat

```text
STAFF tao phieu
-> PENDING_APPROVAL
-> ton kho chua doi
-> MANAGER/ADMIN approve
-> kiem tra lai ton
-> COMPLETED
-> ton kho giam
```

### Da hoan thanh

- Database workflow columns.
- Workflow history.
- Endpoint approve/reject.
- Version locking.
- Approval test tren HN, DN, HCM.
- STAFF khong duoc approve.

### Dieu kien hoan thanh

```text
Create khong doi ton.
Approve nhap tang ton.
Approve xuat giam ton.
Reject khong doi ton.
Approve hai lan bi chan.
```

---

## Giai doan 5 - Approval Center frontend

### Muc tieu

MANAGER/ADMIN co man hinh xem va xu ly phieu cho duyet.

### Da co

- Route `/approvals`.
- Menu chi hien cho MANAGER/ADMIN.
- Danh sach phieu cho duyet.
- Duyet.
- Tu choi.
- Nhap ly do tu choi.

### Da hoan thanh trong dot hien tai

- ADMIN da duyet duoc phieu HN01 tren giao dien.
- Frontend gui dung `ma_kho` khi approve/reject.
- Playwright E2E da pass route guard, login/dashboard/logout va Approval Center.
- ADMIN da duyet duoc phieu DN01 va HCM01 tren giao dien.

### Viec can lam

- Sua approve/reject de luon gui dung `ma_kho` cua phieu.
- Test MANAGER chi thay phieu trong pham vi duoc cap.
- Test loading/error/empty state.
- Test MANAGER chi thay phieu trong pham vi duoc cap.
- Test loading/error/empty state.

---

## Giai doan 6 - Dieu chuyen va Saga

### Muc tieu

Dieu chuyen an toan giua cac node, khong bi lech du lieu khi mot node gap loi.

### Trang thai muc tieu

```text
DRAFT
PENDING_APPROVAL
APPROVED
IN_TRANSIT
RECEIVED
COMPLETED
REJECTED
CANCELLED
```

### Viec can lam

- Khong de transfer API update hai node truc tiep theo happy path duy nhat.
- Tao yeu cau tai CENTRAL.
- Reserve tai node nguon.
- Ship tai node nguon.
- Receive tai node dich.
- Hoan tat Saga tai CENTRAL.
- Co compensation khi node dich/nguon mat ket noi.
- Them idempotency cho request retry.

### Da test

- HN -> DN.
- DN -> HCM.
- HCM -> HN.
- STAFF bi chan.

### Da hoan thanh trong dot hien tai

- Transfer khong con commit truc tiep hai node trong API.
- Tao request tai CENTRAL voi trang thai `PENDING` tra ve `202`.
- ADMIN/MANAGER approve tao Saga bang `sp_create_saga()`.
- Da test HN -> DN -> HCM -> HN.
- CENTRAL da ghi `dieu_chuyen_central` va `saga_transaction` voi dung source/destination node.
- Frontend hien thi dung trang thai dang cho duyet.

### Chua pass day du

- Node dich mat ket noi.
- Node nguon mat ket noi.
- Retry cung mot request.
- Compensation.
- Saga timeout.

---

## Giai doan 7 - CENTRAL va Data Mining readiness

### Muc tieu

Chuan bi du lieu cho bao cao/Data Mining tuong lai, khong trien khai Data Mining service trong pham vi hien tai.

### Central can luu

- `ton_kho_central`
- `lich_su_ton_kho_central`
- `ban_hang_central`
- `nhap_hang_central`
- `dieu_chuyen_central`
- `demand_forecast`
- `transfer_recommendation`

### Quy tac du lieu

- Chi `COMPLETED` duoc dung cho thong ke.
- `DRAFT`, `PENDING_APPROVAL`, `REJECTED`, `CANCELLED` khong dung cho forecast.
- Dieu chuyen khong duoc tinh la doanh thu.
- Moi record central can co `source_node` va timestamp.

### Viec can lam

- Sua ETL de loc status moi.
- Kiem tra phiếu approval da duyet co duoc dong bo.
- Kiem tra central mapping ownership.
- Khong tao Data Mining service rieng luc nay.

### Da hoan thanh trong dot hien tai

- ETL da loc phieu nhap theo `COMPLETED`.
- Da them unique constraint cho `nhap_hang_central` de upsert idempotent.
- One-shot sync da pass 3 node, moi node khong con loi ETL.
- Regression readiness va approval workflow da pass lai sau migration schema.

---

## Giai doan 8 - Test nhieu node tren mot may

### Muc tieu

Mo phong distributed topology truoc khi dua database len nhieu thiet bi.

### Da pass

- Login HN/DN/HCM.
- Dashboard HN/DN/HCM.
- Master data HN/DN/HCM.
- Import/export HN/DN/HCM.
- Approval HN/DN/HCM.
- Transfer HN -> DN -> HCM -> HN.
- Security test.
- Frontend E2E co ban.

### Viec can bo sung

- Test concurrency.
- Test duplicate request.
- Test node database offline.
- Test CENTRAL offline.
- Test retry va recovery.
- Test ADMIN approve DN/HCM tu Approval Center.

---

## Giai doan 9 - Deploy nhieu thiet bi va hardening

### Muc tieu

Chay he thong tren nhieu may that, van dung chung mot codebase.

### Topology toi thieu

```text
May HN       -> PostgreSQL HN
May DN       -> PostgreSQL DN
May HCM      -> PostgreSQL HCM
May CENTRAL  -> Backend + PostgreSQL CENTRAL + MongoDB
```

### Viec can lam

- Doi `localhost` sang IP/DNS noi bo.
- Cau hinh firewall.
- Cau hinh PostgreSQL listen address va `pg_hba.conf`.
- Them timeout database.
- Them retry co gioi han.
- Them health check `/health` va `/ready`.
- Tach secret khoi source code.
- Hash password bang bcrypt.
- Bo fallback plaintext password.
- Backup tung node.
- Test mat ket noi tung node.

### Dieu kien hoan thanh

```text
Backend ket noi duoc ca ba database qua network.
Tat mot node khong lam sap toan he thong.
Node len lai co the ket noi lai.
Security test va E2E pass.
```

---

## Lenh kiem tra chuan

### Backend

```powershell
Set-Location "D:\Các hệ thống phân tán\WarehouseManagement\backend"
npm run build
```

### Frontend

```powershell
Set-Location "D:\Các hệ thống phân tán\WarehouseManagement\frontend"
npm run lint
npm run build
npm run test:e2e
```

### Backend logic tests

```powershell
Set-Location "D:\Các hệ thống phân tán\WarehouseManagement"
.\backend\test_security.ps1
.\backend\test_nodes.ps1
.\backend\test_approval_workflow.ps1
.\backend\test_transfers.ps1
```

## Quy tac theo doi

- Chi danh dau `DA PASS` khi co lenh test va ket qua thanh cong.
- Khong xoa volume database de lam test pass.
- Moi migration database phai co backup truoc.
- Moi thay doi workflow phai cap nhat test approval.
- Moi thay doi node routing phai test lai HN, DN va HCM.
- Chua chuyen sang nhieu may neu Giai doan 6 va 8 chua pass day du.
