Node DB = dữ liệu riêng của kho

Central DB = quản lý điều chuyển + trạng thái saga + tổng hợp

RabbitMQ = vận chuyển message giữa các thành phần

Outbox = ghi 'việc cần gửi' cùng transaction DB

Saga = quản lý trạng thái của một lần điều chuyển xuyên qua nhiều node

TranSit = hàng đã rời kho nhưng chưa đến kho đích

Ledger = lịch sử biến động tồn kho