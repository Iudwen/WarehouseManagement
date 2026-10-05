# WarehouseManagement --- Kế hoạch đồng bộ branch `cuong` theo DB `dong` và flow nghiệp vụ mới

> **Mục đích của file này:** dùng làm context/instruction cho Copilot
> khi tiếp tục sửa branch `cuong`.
>
> **Nguyên tắc quan trọng:** Không viết lại project từ đầu. Không tự ý
> thêm kiến trúc/pattern mới chỉ vì "best practice". Trước tiên phải
> hiểu code hiện tại, đối chiếu với DB/flow mới, rồi sửa tối thiểu để
> đạt đúng nghiệp vụ.

------------------------------------------------------------------------

## 1. Bối cảnh

Project là hệ thống quản lý kho nhiều node/chi nhánh.

Hiện có hai branch có vai trò khác nhau:

-   `dong`: **baseline DB/schema mới** và là nguồn tham chiếu cho data
    model.
-   `cuong`: **branch implementation đang làm**, trong đó đã có phần
    auth/phân quyền và một số thay đổi do Copilot thực hiện.

Không được hiểu là `cuong` phải bị bỏ đi.

### Mục tiêu

Đưa code của `cuong` về đúng với:

1.  DB/schema mới ở `dong`.
2.  Role/permission matrix.
3.  Các flow nghiệp vụ do leader đã thống nhất.
4.  Giữ lại phần code hiện tại nếu nó đúng; chỉ sửa/bỏ phần không còn
    phù hợp.

------------------------------------------------------------------------

# 2. Điều quan trọng nhất: không được tự thiết kế lại khi chưa kiểm tra

Trước khi sửa code, hãy inspect repository và trả lời bằng code-level
evidence:

### Database model

Xác định chính xác:

-   Có những database/node nào?
-   Central DB chứa những bảng nào?
-   Node HN/DN/HCM chứa những bảng nào?
-   Quan hệ:
    -   chi nhánh → kho
    -   kho → user
    -   kho → inventory
-   Một chi nhánh có 1 kho hay nhiều kho?
-   Một user có thể phụ trách 1 hay nhiều kho?
-   `ma_kho`, `branch`, `node` đang đại diện cho khái niệm nào?
-   Inventory source of truth nằm ở đâu?
-   Central là nơi lưu dữ liệu nghiệp vụ hay chủ yếu tổng hợp/điều phối?

**Không được đoán quan hệ 1-1 hay 1-n. Phải đọc schema thật trong branch
`dong`.**

------------------------------------------------------------------------

# 3. Role / Permission matrix

Hệ thống hiện có các role:

-   `ADMIN`
-   `QUẢN LÝ KHO`
-   `NHÂN VIÊN KHO`
-   `ĐIỀU PHỐI`
-   `DATA ANALYST`

## ADMIN

-   Danh mục: Thêm / Sửa / Xóa / Khóa
-   Nhập hàng: Xem
-   Xuất hàng: Xem
-   Tồn kho & kiểm kê: Xem toàn hệ thống
-   Điều chuyển: Xem
-   Phân tích & báo cáo: Xem
-   Tài khoản: Quản lý

## QUẢN LÝ KHO

-   Danh mục: Xem / cập nhật kho phụ trách
-   Nhập hàng: Tạo / Duyệt / Điều chỉnh / Xác nhận
-   Xuất hàng: Tạo / Duyệt / Điều chỉnh / Xác nhận
-   Tồn kho & kiểm kê: Xem / Kiểm kê / Điều chỉnh
-   Điều chuyển: Duyệt / Xác nhận
-   Phân tích & báo cáo: Xem báo cáo
-   Tài khoản: Không

## NHÂN VIÊN KHO

-   Danh mục: Xem
-   Nhập hàng: Tạo / Tiếp nhận / Đếm hàng
-   Xuất hàng: Tạo / Thực hiện xuất
-   Tồn kho & kiểm kê: Xem / Kiểm kê
-   Điều chuyển: Nhận hàng
-   Phân tích & báo cáo: Xem thông tin cần thiết
-   Tài khoản: Không

## ĐIỀU PHỐI

-   Danh mục: Xem
-   Nhập hàng: Xem
-   Xuất hàng: Xem
-   Tồn kho & kiểm kê: Xem tồn các kho
-   Điều chuyển: Tạo / Theo dõi / Điều phối
-   Phân tích & báo cáo: Xem báo cáo điều chuyển
-   Tài khoản: Không

## DATA ANALYST

-   Danh mục: Xem
-   Nhập hàng: Đọc dữ liệu
-   Xuất hàng: Đọc dữ liệu
-   Tồn kho & kiểm kê: Đọc dữ liệu
-   Điều chuyển: Đề xuất
-   Phân tích & báo cáo: Phân tích / Dự báo / Báo cáo
-   Tài khoản: Không

------------------------------------------------------------------------

# 4. Authentication vs Authorization

Không được trộn hai khái niệm:

### Authentication

Trả lời:

> User là ai?

### Authorization

Trả lời:

> User đó được làm gì và được truy cập phạm vi dữ liệu nào?

Authorization phải dựa trên:

-   role
-   phạm vi kho/chi nhánh theo data model thật trong DB
-   nghiệp vụ cụ thể

Ví dụ:

``` text
User
 ↓
Authentication
 ↓
role + scope
 ↓
Authorization
 ↓
Use case
 ↓
Data access
```

Không được dùng một biến `userKho` như một assumption cứng nếu schema
mới cho phép một user/manager phụ trách nhiều kho hoặc một branch có
nhiều kho.

------------------------------------------------------------------------

# 5. Flow ĐIỀU CHUYỂN

Flow nghiệp vụ mới:

``` text
NHÂN VIÊN ĐIỀU PHỐI / DATA ANALYST
        ↓
Tạo yêu cầu điều chuyển
        ↓
YÊU CẦU ĐIỀU CHUYỂN
        ↓
QUẢN LÝ KHO XỬ LÝ YÊU CẦU
        ├── Đồng ý
        │     ↓
        │   YÊU CẦU ĐÃ DUYỆT
        │
        ├── Điều chỉnh
        │     ↓
        │   Sửa yêu cầu
        │     ↓
        │   YÊU CẦU ĐÃ DUYỆT
        │
        └── Từ chối
              ↓
           YÊU CẦU TỪ CHỐI

YÊU CẦU ĐÃ DUYỆT
        ↓
TẠO PHIẾU ĐIỀU CHUYỂN
        ↓
CENTRAL SAGA TRANSACTION
        ↓
KHO XUẤT
        ↓
Xác nhận kho xuất
        ↓
Kiểm tra tồn kho
        ↓
Đủ hàng?
   ├── Không
   │    ↓
   │  Thông báo không đủ tồn
   │    ↓
   │  Quản lý xử lý
   │    ├── Từ chối xuất
   │    └── Điều chỉnh số lượng
   │
   └── Có
        ↓
      Xuất hàng
        ↓
      Cập nhật tồn kho nguồn
        ↓
      STOCK_LEDGER
        ↓
      TRANSIT / trạng thái hàng đang chuyển
        ↓
      KHO NHẬN
        ↓
      Đối chiếu số lượng thực nhận
        ├── Đủ
        │    ↓
        │  Xác nhận nhập
        │
        └── Thiếu
             ↓
           Ghi nhận chênh lệch
             ↓
           Quản lý xử lý
             ├── Chấp nhận thiếu
             │     ↓
             │   Xác nhận nhập
             │
             └── Giao bổ sung
                   ↓
                 NCC/kho nguồn giao thêm
                   ↓
                 Kiểm đếm lại

Sau khi hoàn tất:
        ↓
Cập nhật tồn kho
        ↓
STOCK_LEDGER
        ↓
LỊCH SỬ TỒN KHO
        ↓
Cập nhật trạng thái Saga
        ↓
SYNC DỮ LIỆU
        ↓
CENTRAL
        ↓
TỔNG HỢP TOÀN HỆ THỐNG
```

### Lưu ý

Saga không phải authentication.

Saga giải quyết **business process/distributed transaction của điều
chuyển** sau khi nghiệp vụ đã được phép và phiếu đủ điều kiện xử lý.

Không được tự ý đưa Saga vào các flow không cần distributed processing.

------------------------------------------------------------------------

# 6. Flow XUẤT HÀNG

``` text
NHÂN VIÊN KHO
    ↓
Tạo yêu cầu xuất hàng
    ↓
PHIẾU XUẤT CHỜ DUYỆT
    ↓
QUẢN LÝ KHO XỬ LÝ
    ├── Điều chỉnh
    │     ↓
    │   Sửa phiếu
    │
    ├── Đồng ý
    │     ↓
    │   PHIẾU XUẤT = ĐÃ DUYỆT
    │
    └── Từ chối
          ↓
        PHIẾU XUẤT = TỪ CHỐI

PHIẾU XUẤT ĐÃ DUYỆT
    ↓
Kiểm tra tồn kho
    ↓
Đủ số lượng?
    ├── Không đủ
    │    ↓
    │  Thông báo không đủ tồn
    │    ↓
    │  Quản lý xử lý
    │    ├── Từ chối xuất
    │    └── Điều chỉnh số lượng
    │
    └── Đủ
         ↓
       Xác nhận xuất
         ↓
       Nhân viên kho thực hiện xuất
         ↓
       Cập nhật tồn kho
         ↓
       STOCK_LEDGER
         ↓
       LỊCH SỬ TỒN KHO
         ↓
       PHIẾU XUẤT = ĐÃ XUẤT
         ↓
       SYNC DỮ LIỆU
         ↓
       CENTRAL
         ↓
       TỔNG HỢP TOÀN HỆ THỐNG
```

------------------------------------------------------------------------

# 7. Flow NHẬP HÀNG

``` text
NHÂN VIÊN KHO
    ↓
Tạo yêu cầu nhập hàng
    ↓
PHIẾU NHẬP CHỜ DUYỆT
    ↓
QUẢN LÝ KHO XỬ LÝ
    ├── Điều chỉnh
    │     ↓
    │   Sửa phiếu
    │
    ├── Đồng ý
    │     ↓
    │   PHIẾU NHẬP = ĐÃ DUYỆT
    │
    └── Từ chối
          ↓
        PHIẾU NHẬP = TỪ CHỐI

PHIẾU NHẬP ĐÃ DUYỆT
    ↓
Gửi yêu cầu
    ↓
NHÀ CUNG CẤP
    ↓
Giao hàng
    ↓
NHÂN VIÊN KHO TIẾP NHẬN
    ↓
Kiểm đếm
    ↓
Đối chiếu số lượng
    ├── Đủ
    │    ↓
    │  Xác nhận nhập
    │
    └── Thiếu
         ↓
       Ghi nhận chênh lệch
         ↓
       QUẢN LÝ KHO XỬ LÝ
         ├── Chấp nhận thiếu
         │     ↓
         │   Xác nhận nhập
         │
         └── Giao bổ sung
               ↓
             NCC giao thêm
               ↓
             Kiểm đếm lại

Sau khi xác nhận:
    ↓
Cập nhật tồn kho + thực nhận
    ↓
STOCK_LEDGER
    ↓
LỊCH SỬ TỒN KHO
    ↓
PHIẾU NHẬP = ĐÃ NHẬP
    ↓
SYNC DỮ LIỆU
    ↓
CENTRAL
    ↓
TỔNG HỢP TOÀN HỆ THỐNG
```

------------------------------------------------------------------------

# 8. Central DB

Không được mặc định:

> Central DB = nơi chứa toàn bộ inventory của tất cả kho.

Theo hướng thiết kế hiện tại, cần phân biệt:

### Node DB

Là nơi xử lý dữ liệu nghiệp vụ của từng node/kho.

### Central DB

Có vai trò trung tâm cho những phần như:

-   dữ liệu tổng hợp
-   theo dõi node
-   sync log
-   điều phối/transfer
-   trạng thái trung gian cần thiết
-   TRANSIT nếu schema hiện tại thiết kế như vậy

### Nguyên tắc

Phải đọc schema thật của `dong` để xác định bảng nào là source of truth.

Không tự tạo thêm bảng Central chỉ vì thấy "distributed system nên có".

------------------------------------------------------------------------

# 9. TRANSIT

Nếu DB `dong` đã có kho ảo `TRANSIT`, phải hiểu nó như trạng thái/nơi
trung gian của hàng đang được điều chuyển:

``` text
KHO NGUỒN
   ↓
xuất hàng
   ↓
TRANSIT
   ↓
KHO ĐÍCH
```

Không được coi hàng là:

``` text
HN -10
HCM +10
```

ngay lập tức nếu business flow yêu cầu kiểm nhận tại kho đích.

TRANSIT phải được map rõ với trạng thái của transfer/Saga.

------------------------------------------------------------------------

# 10. STOCK_LEDGER và lịch sử tồn kho

Mọi nghiệp vụ làm thay đổi tồn kho phải có audit/history phù hợp.

Tối thiểu cần phân biệt:

-   tồn kho hiện tại
-   lịch sử thay đổi tồn
-   ledger giao dịch

Ví dụ:

``` text
Tồn kho hiện tại:
100 → 80

Ledger:
EXPORT -20
```

Không được chỉ update số tồn mà mất dấu vết nghiệp vụ.

------------------------------------------------------------------------

# 11. State machine phải được thống nhất

Không để mỗi service tự đặt status.

Cần audit các status hiện tại và thống nhất cho từng nghiệp vụ.

Ví dụ điều chuyển có thể có các nhóm state:

``` text
YÊU CẦU:
PENDING
APPROVED
REJECTED
ADJUSTED

TRANSFER:
CREATED
SOURCE_CONFIRMED
CHECKING_STOCK
IN_TRANSIT
RECEIVING
DISCREPANCY
COMPLETED
FAILED / CANCELLED
```

**Đây chỉ là ví dụ để audit, không được tự động áp dụng toàn bộ.**

Phải đối chiếu với schema/code/flow thật trước khi thêm status.

------------------------------------------------------------------------

# 12. Những việc KHÔNG ĐƯỢC làm

## Không được

-   Xóa branch `cuong` và viết lại từ đầu.
-   Bỏ toàn bộ code Copilot chỉ vì nó phức tạp.
-   Thêm Saga/DDD/Clean Architecture/Microservice chỉ vì "best
    practice".
-   Tự đổi DB schema mà chưa đối chiếu với `dong`.
-   Tự suy đoán quan hệ branch/warehouse/user.
-   Gộp tất cả DB thành Central.
-   Đưa authorization vào database query một cách tùy tiện nếu chưa xác
    định data scope.
-   Chỉ kiểm tra role mà bỏ qua phạm vi kho/chi nhánh.
-   Sửa hàng loạt file trước khi hiểu dependency.
-   Dùng "fix all remaining issues" như một instruction mở.

------------------------------------------------------------------------

# 13. Cách Copilot phải làm việc

## Bước 1 --- READ ONLY / ANALYSIS

Trước tiên inspect:

-   schema DB của `dong`
-   schema DB/node
-   auth middleware
-   user model
-   role definitions
-   controllers
-   services
-   routes
-   inventory code
-   import/export code
-   transfer code
-   Saga code hiện tại
-   sync code

Sau đó báo cáo:

``` text
CURRENT ARCHITECTURE
CURRENT AUTH
CURRENT DATA MODEL
CURRENT TRANSFER FLOW
CURRENT SAGA FLOW
MISMATCHES
DUPLICATE LOGIC
MISSING LOGIC
```

**Chưa sửa code ở bước này.**

------------------------------------------------------------------------

## Bước 2 --- COMPARE

Tạo bảng:

  Requirement        Code hiện tại   DB `dong`   Status           Action
  ------------------ --------------- ----------- ---------------- --------
  User scope         ...             ...         Match/Mismatch   ...
  Role permissions   ...             ...         ...              ...
  Nhập hàng          ...             ...         ...              ...
  Xuất hàng          ...             ...         ...              ...
  Điều chuyển        ...             ...         ...              ...
  Central            ...             ...         ...              ...
  Saga               ...             ...         ...              ...
  Ledger             ...             ...         ...              ...
  Sync               ...             ...         ...              ...

------------------------------------------------------------------------

## Bước 3 --- IMPLEMENT TỪNG NHÓM

Ưu tiên:

1.  Data model compatibility
2.  Authentication
3.  Authorization + data scope
4.  Nhập hàng
5.  Xuất hàng
6.  Điều chuyển request/approval
7.  Transfer/Saga/TRANSIT
8.  Inventory ledger/history
9.  Sync/Central
10. Reporting

Mỗi nhóm:

``` text
Understand
→ Plan
→ Implement
→ Test
→ Verify
```

Không sửa tất cả một lần.

------------------------------------------------------------------------

# 14. Acceptance criteria quan trọng

## Authorization

Ví dụ:

``` text
User thuộc phạm vi HN
→ không được xem/sửa inventory ngoài phạm vi được cấp.

ADMIN
→ được xem toàn hệ thống theo permission.

QUẢN LÝ KHO
→ chỉ xử lý nghiệp vụ thuộc phạm vi kho phụ trách.

ĐIỀU PHỐI
→ có quyền tạo/theo dõi điều chuyển theo role matrix.

DATA ANALYST
→ đọc dữ liệu/phân tích theo permission.
```

Phạm vi cụ thể phải lấy từ DB model thật, không hard-code assumption.

------------------------------------------------------------------------

## Transfer

Phải đảm bảo:

``` text
Không đủ tồn
→ không được xuất vượt tồn.

Xuất thành công
→ ledger được ghi.

Hàng đang chuyển
→ phản ánh đúng trạng thái TRANSIT nếu flow yêu cầu.

Kho nhận nhận đủ
→ hoàn tất transfer.

Kho nhận nhận thiếu
→ ghi nhận discrepancy.

Chấp nhận thiếu
→ hoàn tất theo số thực nhận.

Giao bổ sung
→ quay lại bước kiểm đếm phù hợp.

Retry
→ không được nhân đôi việc trừ/cộng tồn.
```

------------------------------------------------------------------------

# 15. Tiêu chí quan trọng nhất khi sửa code

Sau mỗi thay đổi lớn, phải trả lời được:

### Tôi đang sửa vấn đề gì?

### Requirement nào yêu cầu thay đổi này?

### DB nào là source of truth?

### User nào được phép gọi operation này?

### Operation này thay đổi dữ liệu nào?

### Nếu request chạy lại thì sao?

### Nếu bước giữa bị lỗi thì state cuối cùng là gì?

Nếu không trả lời được các câu trên thì **chưa nên code tiếp**.

------------------------------------------------------------------------

# 16. Mục tiêu cuối cùng

Không phải tạo ra một architecture "xịn" nhất.

Mục tiêu là:

``` text
Business Flow
      ↓
Role / Permission
      ↓
Use Case
      ↓
Service
      ↓
Repository / DB Node
      ↓
State / Ledger / Sync
```

và người maintain project có thể giải thích:

> "User này được làm gì, trên dữ liệu nào, request chạy qua đâu, thay
> đổi DB nào, và nếu lỗi giữa chừng thì hệ thống xử lý thế nào?"

------------------------------------------------------------------------

# 17. Quy tắc cuối cùng cho Copilot

**Đừng tự suy luận requirement mới.**

Nếu code hiện tại và flow/DB mới mâu thuẫn:

1.  Nêu mâu thuẫn.
2.  Chỉ ra file/code/schema liên quan.
3.  Đề xuất phương án.
4.  Chờ quyết định nếu mâu thuẫn liên quan đến business rule hoặc data
    model.
5.  Sau khi rõ mới sửa.

Không được tự ý "fix" bằng cách thêm abstraction lớn.

------------------------------------------------------------------------

## Definition of Done

Branch `cuong` được coi là hoàn thành khi:

-   [ ] Auth hoạt động đúng.
-   [ ] Authorization đúng role.
-   [ ] Data scope đúng warehouse/branch model thực tế.
-   [ ] Không user nào truy cập vượt scope.
-   [ ] Nhập hàng chạy đúng flow.
-   [ ] Xuất hàng chạy đúng flow.
-   [ ] Điều chuyển chạy đúng flow.
-   [ ] Approval/rejection/adjustment đúng.
-   [ ] Inventory update đúng.
-   [ ] STOCK_LEDGER/history đúng.
-   [ ] TRANSIT đúng nếu required.
-   [ ] Saga state đúng.
-   [ ] Retry không tạo duplicate inventory movement.
-   [ ] Discrepancy handling đúng.
-   [ ] Sync/Central đúng trách nhiệm.
-   [ ] Không còn logic cũ mâu thuẫn với DB `dong`.
-   [ ] Không có abstraction được thêm chỉ vì "best practice".
-   [ ] Có test cho các case quyền và failure quan trọng.
