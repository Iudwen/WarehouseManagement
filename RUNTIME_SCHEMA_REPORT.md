# Runtime Schema Report

> Ngày kiểm tra: 2026-10-02
>
> Phạm vi: Task 1 - verify runtime schema.
>
> Phương pháp: chỉ đọc metadata PostgreSQL qua host ports `5433-5436`, không INSERT/UPDATE/DELETE, không chạy migration và không sửa schema.

## Runtime availability

| Runtime | Endpoint | Kết quả |
|---|---:|---|
| NODE_HN | `127.0.0.1:5433` | Kết nối được, container healthy, database `warehouse_hn`, PostgreSQL 18.6 |
| NODE_DN | `127.0.0.1:5434` | Kết nối được, database `warehouse_dn`, PostgreSQL 18.6 |
| NODE_HCM | `127.0.0.1:5435` | Kết nối được, database `warehouse_hcm`, PostgreSQL 18.6 |
| CENTRAL | `127.0.0.1:5436` | Kết nối được, database `warehouse_central`, PostgreSQL 18.6 |

## Verification table

Status chỉ dùng: `VERIFIED`, `MISSING`, `MISMATCH`, `UNKNOWN`.

| Component | Repository SQL | Runtime DB | Status | Evidence |
|---|---|---|---|---|
| `outbox_event` - NODE_DN | [node_dn/08_create_transaction_support.sql](nodes/node_dn/08_create_transaction_support.sql) | Bảng tồn tại | VERIFIED | Query `information_schema.tables` trả về bảng; có `event_id`, `saga_id`, `ma_giao_dich_global`, `event_type`, `aggregate_id`, `payload`, `status`, `retry_count`, `created_at`, `processed_at`, `error_message` |
| `outbox_event` - NODE_HCM | [node_hcm/08_create_transaction_support.sql](nodes/node_hcm/08_create_transaction_support.sql) | Bảng tồn tại | VERIFIED | Runtime có cùng các column chính và default `status = PENDING`, `retry_count = 0` |
| `outbox_event` - NODE_HN | [node_hn/08_create_transaction_support.sql](nodes/node_hn/08_create_transaction_support.sql) | Bảng tồn tại | VERIFIED | Runtime có đủ columns, `PENDING/PROCESSING/PROCESSED/FAILED`, PK `event_id` và retry fields |
| `outbox_event.event_id` | SQL định nghĩa UUID default `gen_random_uuid()` | Primary key và unique index tồn tại trên DN/HCM | VERIFIED | `outbox_event_pkey`, `PRIMARY KEY (event_id)` |
| `outbox_event` status | SQL constraint cho `PENDING`, `PROCESSING`, `PROCESSED`, `FAILED` | Constraint tương ứng trên DN/HCM | VERIFIED | `chk_outbox_status` được runtime xác nhận |
| `outbox_event` retry fields | SQL có `retry_count`, `processed_at`, `error_message` | Các column tồn tại trên DN/HCM | VERIFIED | Runtime metadata khớp repository SQL |
| `outbox_event.occurred_at` | Không có trong repository SQL | Không có trong DN/HCM | VERIFIED | Schema dùng `created_at`; application message phải map timestamp riêng nếu cần |
| `stock_ledger` - NODE_DN | [node_dn/08_create_transaction_support.sql](nodes/node_dn/08_create_transaction_support.sql) | Bảng tồn tại | VERIFIED | Có PK `id`, quantity/change fields, transaction type check và FK tới kho/sản phẩm |
| `stock_ledger` - NODE_HCM | [node_hcm/08_create_transaction_support.sql](nodes/node_hcm/08_create_transaction_support.sql) | Bảng tồn tại | VERIFIED | Runtime columns/constraints/indexes khớp capability cần cho procedures |
| `stock_ledger` - NODE_HN | [node_hn/08_create_transaction_support.sql](nodes/node_hn/08_create_transaction_support.sql) | Bảng tồn tại | VERIFIED | Runtime có columns, PK, transaction type check và FK chính |
| `stock_reservation` - NODE_DN | [node_dn/08_create_transaction_support.sql](nodes/node_dn/08_create_transaction_support.sql) | Bảng tồn tại | VERIFIED | PK `reservation_id`, status/quantity checks, FK kho/sản phẩm và indexes theo Saga/global/transfer/status |
| `stock_reservation` - NODE_HCM | [node_hcm/08_create_transaction_support.sql](nodes/node_hcm/08_create_transaction_support.sql) | Bảng tồn tại | VERIFIED | Runtime capability khớp repository SQL |
| `stock_reservation` - NODE_HN | [node_hn/08_create_transaction_support.sql](nodes/node_hn/08_create_transaction_support.sql) | Bảng tồn tại | VERIFIED | Runtime có PK, status/quantity checks, FK và indexes chính |
| `gen_random_uuid()` - NODE_DN | Được dùng trong default của `outbox_event` | Function gọi thành công | VERIFIED | `SELECT gen_random_uuid()` thành công |
| `gen_random_uuid()` - NODE_HCM | Được dùng trong default của `outbox_event` | Function gọi thành công | VERIFIED | `SELECT gen_random_uuid()` thành công |
| `gen_random_uuid()` - NODE_HN | Được dùng trong default của `outbox_event` | Function gọi thành công | VERIFIED | `SELECT gen_random_uuid()` thành công |
| `pgcrypto` extension - NODE_DN/HCM | Node SQL không có `CREATE EXTENSION` riêng | Không có trong `pg_extension` | MISMATCH | Function vẫn hoạt động trên PostgreSQL 18.6; cần ghi nhận đây là runtime behavior, chưa tự sửa extension |
| `pgcrypto` extension - CENTRAL | [06_create_saga_monitoring.sql](data_center/central_database/06_create_saga_monitoring.sql) có `CREATE EXTENSION` | Extension tồn tại | VERIFIED | `pg_extension` có `pgcrypto` |
| `sp_accept_transfer` - NODE_DN | [node_dn/08_create_transaction_support.sql](nodes/node_dn/08_create_transaction_support.sql) | Function tồn tại, 1 overload | VERIFIED | Signature runtime: `(uuid, uuid, varchar, varchar, varchar, integer)` |
| `sp_ship_transfer` - NODE_DN | [node_dn/08_create_transaction_support.sql](nodes/node_dn/08_create_transaction_support.sql) | Function tồn tại, 1 overload | VERIFIED | Signature runtime khớp SQL |
| `sp_receive_transfer` - NODE_DN | [node_dn/08_create_transaction_support.sql](nodes/node_dn/08_create_transaction_support.sql) | Function tồn tại, 1 overload | VERIFIED | Signature runtime khớp SQL |
| `sp_accept_transfer` - NODE_HCM | [node_hcm/08_create_transaction_support.sql](nodes/node_hcm/08_create_transaction_support.sql) | Function tồn tại, 1 overload | VERIFIED | Signature runtime khớp SQL |
| `sp_ship_transfer` - NODE_HCM | [node_hcm/08_create_transaction_support.sql](nodes/node_hcm/08_create_transaction_support.sql) | Function tồn tại, 1 overload | VERIFIED | Signature runtime khớp SQL |
| `sp_receive_transfer` - NODE_HCM | [node_hcm/08_create_transaction_support.sql](nodes/node_hcm/08_create_transaction_support.sql) | Function tồn tại, 1 overload | VERIFIED | Signature runtime khớp SQL |
| `sp_accept_transfer` - NODE_HN | [node_hn/08_create_transaction_support.sql](nodes/node_hn/08_create_transaction_support.sql) | Function tồn tại, 1 overload | VERIFIED | Signature runtime khớp SQL |
| `sp_ship_transfer` - NODE_HN | [node_hn/08_create_transaction_support.sql](nodes/node_hn/08_create_transaction_support.sql) | Function tồn tại, 1 overload | VERIFIED | Signature runtime khớp SQL |
| `sp_receive_transfer` - NODE_HN | [node_hn/08_create_transaction_support.sql](nodes/node_hn/08_create_transaction_support.sql) | Function tồn tại, 1 overload | VERIFIED | Signature runtime khớp SQL |
| Central transfer tables | [02_create_tables.sql](data_center/central_database/02_create_tables.sql), [06_create_saga_monitoring.sql](data_center/central_database/06_create_saga_monitoring.sql) | `dieu_chuyen_central`, `saga_transaction`, `vwh_transfer`, `transfer_discrepancy` tồn tại | VERIFIED | Runtime có PK/unique/check/FK/index metadata tương ứng |
| `sp_create_saga` - CENTRAL | [07_saga_procedures.sql](data_center/central_database/07_saga_procedures.sql) | Function tồn tại, 1 overload | VERIFIED | Signature `(varchar)` returns UUID |
| `sp_create_vwh_transfer` - CENTRAL | [07_saga_procedures.sql](data_center/central_database/07_saga_procedures.sql) | Function tồn tại, 1 overload | VERIFIED | Signature `(uuid, uuid, varchar, integer)` returns BIGINT |
| `sp_resolve_transfer_discrepancy` - CENTRAL | [07_saga_procedures.sql](data_center/central_database/07_saga_procedures.sql) | Function tồn tại, 1 overload | VERIFIED | Signature `(bigint, varchar, varchar, text)` |
| `saga_monitoring` - CENTRAL | [06_create_saga_monitoring.sql](data_center/central_database/06_create_saga_monitoring.sql) | Bảng tồn tại | VERIFIED | `to_regclass('public.saga_monitoring')` trả về bảng |
| TRANSIT warehouse record - CENTRAL | [02_create_tables.sql](data_center/central_database/02_create_tables.sql) insert/update `ma_kho = 'TRANSIT'` | Không có row `TRANSIT` | MISMATCH | Query runtime `SELECT ... FROM kho WHERE ma_kho = 'TRANSIT'` trả về 0 rows |

## Verified

- NODE_DN kết nối được và có đầy đủ outbox, ledger, reservation, indexes/constraints chính.
- NODE_HCM kết nối được và có đầy đủ outbox, ledger, reservation, indexes/constraints chính.
- NODE_HN kết nối được và có đầy đủ outbox, ledger, reservation, indexes/constraints chính.
- NODE_HN có đủ `sp_accept_transfer`, `sp_ship_transfer`, `sp_receive_transfer` với đúng một overload.
- NODE_DN và NODE_HCM có đủ `sp_accept_transfer`, `sp_ship_transfer`, `sp_receive_transfer` với đúng một overload.
- `gen_random_uuid()` hoạt động trên cả ba node.
- Central kết nối được và có các bảng transfer/Saga/VWH/discrepancy.
- Central có `saga_monitoring`.
- Central có `sp_create_saga`, `sp_create_vwh_transfer` và `sp_resolve_transfer_discrepancy`.
- Central có `pgcrypto`.
- `event_id` của outbox là primary key/unique trên DN và HCM.
- Outbox có trạng thái và retry fields cần thiết cho relay tối thiểu.

## Not verified

- Việc các SQL scripts trên repository có hoàn toàn giống volume runtime ngoài các metadata đã truy vấn.
- Consumer-side durable deduplication: chưa có application inbox/deduplication được kiểm tra hoặc implement.

## Mismatches cần xử lý

1. Central repository SQL có logic tạo record `TRANSIT`, nhưng runtime Central không có row `TRANSIT`.
2. Node DN/HCM/HN không report `pgcrypto` trong `pg_extension`, dù `gen_random_uuid()` hoạt động trên PostgreSQL 18.6. Đây là mismatch extension metadata, chưa kết luận cần migration.

## Task 2 decision

Task 1 đã đủ runtime evidence để chuẩn bị Task 2.

Task 1 = `DONE_WITH_KNOWN_MISMATCH`.

Task 2 local outbox relay = `READY`.

Known mismatch Central `TRANSIT` vẫn phải được giữ nguyên trong backlog; không được tự INSERT row hoặc sửa schema trong Task 2. Mismatch này không ngăn việc kiểm thử local outbox relay, nhưng vẫn ngăn coi full transfer flow là hoàn chỉnh.

Không có schema/database nào bị sửa trong quá trình kiểm tra.
