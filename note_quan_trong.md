

# Target Architecture: RabbitMQ và Saga điều chuyển

> Phạm vi tài liệu: thiết kế target architecture.
>
> RabbitMQ mới chỉ được thiết kế, chưa implement trong backend hiện tại.
> Không được hiểu các exchange, queue, producer hoặc consumer dưới đây đã tồn tại runtime.

## 1. Nguyên tắc ownership

RabbitMQ chỉ là message transport. RabbitMQ không phải source of truth và không được dùng để lưu trạng thái nghiệp vụ lâu dài.

### Node database là source of truth cho tồn kho

Mỗi node sở hữu dữ liệu nghiệp vụ của kho mình:

- `ton_kho`: tồn hiện tại.
- `stock_ledger`: mọi biến động tồn.
- `stock_reservation`: số lượng đã giữ cho transfer.
- `outbox_event`: sự kiện đã commit cùng transaction tại node.
- `phieu_nhap`, `phieu_xuat` và chi tiết phiếu.

Node nguồn là nơi duy nhất được phép reserve, trừ tồn khi xuất transfer và ghi ledger tương ứng. Node đích là nơi duy nhất được phép cộng tồn khi nhận hàng.

### Central database là source of truth cho Saga

Central sở hữu vòng đời điều chuyển phân tán:

- `dieu_chuyen_central`: yêu cầu điều chuyển.
- `saga_transaction`: trạng thái Saga và global transaction ID.
- `saga_monitoring`: theo dõi tiến trình/lỗi.
- `vwh_transfer`: hàng đang vận chuyển/TRANSIT.
- `transfer_discrepancy`: chênh lệch khi nhận.

`ton_kho_central` và `lich_su_ton_kho_central` chỉ là dữ liệu tổng hợp từ node. Central không được trực tiếp update `ton_kho` của node.

### RabbitMQ không thay thế database

- Message có thể được retry hoặc deliver lại.
- Consumer phải idempotent theo `event_id` hoặc `ma_giao_dich_global`.
- State chỉ được xem là thành công sau khi database owner commit.
- Không ACK message trước khi xử lý DB thành công hoặc đã ghi nhận retry/error có kiểm soát.

## 2. Target topology

```text
Node HN  -- outbox --> RabbitMQ <-- outbox -- Node DN
Node HCM -- outbox --> RabbitMQ
Central  -- outbox --> RabbitMQ

RabbitMQ exchanges:
	wms.domain       : business events
	wms.command      : commands tới đúng node/service
	wms.dlq          : message thất bại sau retry

Central Saga Orchestrator consumes domain events and publishes commands.
```

Target không cho phép node gọi trực tiếp database của node khác. Mọi giao tiếp cross-node đi qua command/event và được định danh bằng `saga_id`, `ma_giao_dich_global`, `ma_phieu_dc`.

## 3. Outbox placement

### Node outbox

Đặt tại từng node, dùng bảng hiện có `outbox_event`.

Transaction nghiệp vụ phải ghi đồng thời:

```text
ton_kho / stock_reservation / stock_ledger
outbox_event
```

Sau khi transaction commit, relay/publisher đọc `outbox_event` trạng thái `PENDING`, publish lên RabbitMQ và cập nhật trạng thái publish. Relay không được tự thay đổi tồn kho.

Các event do node phát ra gồm source confirmation, reservation, shipment, receiving và discrepancy.

### Central outbox

Target cần một outbox thuộc Central cho các command/event do Central tạo ra, ví dụ:

- tạo Saga;
- yêu cầu source confirm;
- yêu cầu reserve stock;
- yêu cầu ship;
- yêu cầu receive;
- yêu cầu compensation.

Schema hiện tại chưa chứng minh đã có Central outbox runtime tương đương `outbox_event` của node. Vì vậy đây là thành phần target cần thiết, chưa được coi là đã implement.

Central transaction phải ghi đồng thời:

```text
saga_transaction / vwh_transfer / transfer_discrepancy
central_outbox_event
```

Nếu chưa tạo bảng Central outbox, không được giả vờ publish message trực tiếp sau `COMMIT` như một cơ chế đảm bảo delivery. Có thể dùng một bảng outbox Central riêng hoặc mở rộng thiết kế hiện tại sau khi chốt schema.

## 4. Message contract chung

Mọi message nên có envelope tối thiểu:

```json
{
	"event_id": "uuid",
	"message_type": "TRANSFER_SOURCE_CONFIRMED",
	"occurred_at": "timestamp",
	"saga_id": "uuid",
	"ma_giao_dich_global": "uuid",
	"ma_phieu_dc": "DC0001",
	"source_node": "NODE_HN",
	"correlation_id": "uuid",
	"causation_id": "uuid",
	"schema_version": 1,
	"payload": {}
}
```

Quy tắc:

- `event_id` duy nhất cho mỗi event.
- `correlation_id` giữ toàn bộ message trong cùng một business flow.
- `causation_id` trỏ tới message đã gây ra event hiện tại.
- Payload không chứa dữ liệu tồn kho tổng hợp thay cho DB owner.
- Consumer phải lưu dấu đã xử lý trước hoặc trong cùng transaction với thay đổi nghiệp vụ.

## 5. Message, producer và consumer

| Message | Producer | Consumer | DB owner sau khi xử lý |
|---|---|---|---|
| `TRANSFER_REQUEST_CREATED` | Transfer API/Central | Central Saga Orchestrator | Central: `dieu_chuyen_central` |
| `TRANSFER_APPROVED` | Central Approval service | Central Saga Orchestrator | Central: `saga_transaction` |
| `SOURCE_CONFIRMATION_REQUESTED` | Central Saga Orchestrator | Source Node command consumer | Central: Saga command state; node chưa đổi tồn |
| `SOURCE_CONFIRMED` | Source Node | Central Saga Orchestrator | Source node: audit/workflow; Central: Saga state |
| `STOCK_RESERVE_REQUESTED` | Central Saga Orchestrator | Source Node reservation consumer | Source node: `stock_reservation` |
| `STOCK_RESERVED` | Source Node | Central Saga Orchestrator | Source node: reservation; Central: Saga state |
| `STOCK_RESERVATION_FAILED` | Source Node | Central Saga Orchestrator | Source node: failure audit; Central: Saga failure state |
| `SHIPMENT_REQUESTED` | Central Saga Orchestrator | Source Node shipment consumer | Source node: command pending |
| `TRANSFER_SHIPPED` | Source Node | Central Saga Orchestrator / destination Node | Source node: `ton_kho`, `stock_ledger`, reservation; Central: `vwh_transfer` |
| `TRANSIT_CREATED` | Central Saga Orchestrator | Monitoring/reporting consumers | Central: `vwh_transfer` |
| `RECEIVE_REQUESTED` | Central Saga Orchestrator | Destination Node receiving consumer | Destination node: receiving workflow |
| `TRANSFER_RECEIVED` | Destination Node | Central Saga Orchestrator | Destination node: `ton_kho`, `stock_ledger`; Central: received quantity |
| `TRANSFER_DISCREPANCY_RECORDED` | Destination Node | Central discrepancy handler | Central: `transfer_discrepancy` |
| `SHORTAGE_ACCEPTED` | Central/Manager approval service | Central Saga Orchestrator | Central: discrepancy resolution |
| `SUPPLEMENTAL_DELIVERY_REQUESTED` | Central Saga Orchestrator | Source Node / supplier integration | Central: Saga remains incomplete |
| `SUPPLEMENTAL_DELIVERY_RECEIVED` | Destination Node | Central Saga Orchestrator | Destination node: ledger and inventory |
| `TRANSFER_COMPLETED` | Central Saga Orchestrator | Reporting/ETL consumers | Central: Saga terminal state |
| `TRANSFER_REJECTED` | Manager approval service | Central Saga Orchestrator | Central: request/Saga rejected |
| `TRANSFER_COMPENSATION_REQUESTED` | Central Saga Orchestrator | Owning Node compensation consumer | Owning node: reservation/ledger compensation |
| `TRANSFER_COMPENSATED` | Owning Node | Central Saga Orchestrator | Central: compensation state |

Các message trên là target contract. Chúng chưa đồng nghĩa với route, table hoặc class đã có trong code hiện tại.

## 6. Saga state mapping

| Saga state | Trigger message | Hành động chính | Message tiếp theo |
|---|---|---|---|
| `PENDING_APPROVAL` | `TRANSFER_REQUEST_CREATED` | Lưu request, chờ quản lý xử lý | `TRANSFER_APPROVED` hoặc `TRANSFER_REJECTED` |
| `APPROVED` | `TRANSFER_APPROVED` | Tạo Saga, xác định source/destination node | `SOURCE_CONFIRMATION_REQUESTED` |
| `WAITING_SOURCE_CONFIRMATION` | `SOURCE_CONFIRMATION_REQUESTED` | Chờ node nguồn xác nhận khả năng xử lý | `SOURCE_CONFIRMED` hoặc failure |
| `RESERVING` | `SOURCE_CONFIRMED` / `STOCK_RESERVE_REQUESTED` | Giữ tồn tại node nguồn | `STOCK_RESERVED` hoặc `STOCK_RESERVATION_FAILED` |
| `RESERVED` | `STOCK_RESERVED` | Đã giữ hàng, chưa giao | `SHIPMENT_REQUESTED` |
| `SHIPPING` | `SHIPMENT_REQUESTED` | Node nguồn thực hiện xuất hàng | `TRANSFER_SHIPPED` hoặc failure |
| `IN_TRANSIT` | `TRANSFER_SHIPPED` / `TRANSIT_CREATED` | Hàng nằm ở TRANSIT, chưa cộng tồn đích | `RECEIVE_REQUESTED` |
| `RECEIVING` | `RECEIVE_REQUESTED` | Node đích kiểm đếm hàng thực nhận | `TRANSFER_RECEIVED` hoặc `TRANSFER_DISCREPANCY_RECORDED` |
| `DISCREPANCY` | `TRANSFER_DISCREPANCY_RECORDED` | Chờ quản lý xử lý thiếu/thừa | `SHORTAGE_ACCEPTED` hoặc `SUPPLEMENTAL_DELIVERY_REQUESTED` |
| `SUPPLEMENTAL_DELIVERY` | `SUPPLEMENTAL_DELIVERY_REQUESTED` | Chờ giao bù | `SUPPLEMENTAL_DELIVERY_RECEIVED` |
| `COMPLETED` | `TRANSFER_RECEIVED`, `SHORTAGE_ACCEPTED` hoặc giao bù đủ | Đóng Saga, hoàn tất tổng hợp | Không có |
| `COMPENSATION_REQUIRED` | `TRANSFER_COMPENSATION_REQUESTED` | Chạy hành động bù trừ | `TRANSFER_COMPENSATED` |
| `FAILED` | Node/consumer failure không thể tiếp tục | Ghi lỗi, retry hoặc compensation | Retry, compensation hoặc `CANCELLED` |
| `CANCELLED` | `TRANSFER_REJECTED` hoặc hủy hợp lệ | Giải phóng reservation nếu có | Không có |

Tên state trên cần được đối chiếu với enum/constraint thực tế trong SQL trước khi implement. Không tự ý đổi hàng loạt status hiện có chỉ dựa vào bảng này.

## 7. Nhóm queue/consumer target

### Central commands

- `central.source-confirmation.commands`
- `central.reserve-stock.commands`
- `central.shipment.commands`
- `central.receive.commands`
- `central.compensation.commands`

Consumer chính: node tương ứng với `source_node` hoặc `destination_node`.

### Node domain events

- `node.transfer.events`
- `node.inventory.events`
- `node.outbox.retry`

Consumer chính: Central Saga Orchestrator và Central projection/sync services.

### Central domain events

- `central.transfer.events`
- `central.saga.events`
- `central.outbox.retry`

Consumer chính: monitoring, reporting, ETL và các integration service cần thiết.

Mỗi node nên có queue riêng hoặc routing key chứa node name để tránh node DN nhận command của node HN.

## 8. Failure, retry và idempotency

- Publish lỗi: giữ row outbox ở trạng thái chưa publish, tăng retry count và thử lại.
- Consumer lỗi tạm thời: `nack/requeue` hoặc đưa vào retry queue có delay.
- Consumer lỗi lâu dài: đưa vào dead-letter queue, ghi `error_message` và Saga monitoring.
- Duplicate message: kiểm tra `event_id`, `ma_giao_dich_global` và business operation key trước khi thay đổi tồn.
- Timeout: Central Saga Orchestrator chuyển state sang retryable failure, không tự kết luận đã xuất/nhận nếu node chưa phát event thành công.
- Node mất kết nối: Central giữ Saga ở state chờ/retry; không cập nhật tồn node trực tiếp.

## 9. Những gì chưa được implement

Hiện tại chưa được coi là đã implement:

- RabbitMQ connection/exchange/queue.
- Message envelope và versioning.
- Central outbox relay.
- Node outbox relay tới RabbitMQ.
- Command consumers tại node.
- Central Saga Orchestrator consume event.
- State transition handler dùng chung.
- Inbox/deduplication table cho consumer.
- Retry queue và dead-letter queue.
- Full source-shipment-receiving-discrepancy flow.

Đây là thiết kế mục tiêu để làm cơ sở lập kế hoạch implementation, không phải mô tả trạng thái runtime hiện tại.
