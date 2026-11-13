# Khảo sát module Thiết lập của KiotViet và đối chiếu với Sổ bán hàng gốm

Ngày 13/11/2026. Chỉ xem, không lưu thay đổi nào trên KiotViet (thceramics.kiotviet.vn, tài khoản chủ cửa hàng, qua Chrome đã đăng nhập).

## 1. Cách KiotViet tổ chức phần Thiết lập

**Lối vào trên thanh trên cùng.** Nút bánh răng cạnh chuông mở một menu thả xuống gồm 7 nhóm, mỗi nhóm có tên và dòng mô tả ngắn các mục con:

| Nhóm | Mô tả dưới tên |
|---|---|
| Hàng hóa | Thông tin, Nhập hàng, Nhà cung cấp |
| Đơn hàng | Đặt hàng, Bán hàng, Trả hàng |
| Khách hàng | Tích điểm, Khuyến mại |
| Sổ quỹ | Tài khoản ngân hàng, Ví điện tử |
| Tiện ích | Giao hàng, Thanh toán |
| Cửa hàng | Thông tin, Người dùng, Chi nhánh, Bảo mật |
| Dữ liệu và Lịch sử thao tác | Khóa sổ, Lịch sử thao tác, Xóa dữ liệu |

Cuối menu là nút **Xem tất cả thiết lập**.

**Trang Thiết lập** (`#/Settings?SettingType=<mã>`) có ba cột:

1. **Cột trái**: danh sách mục, chia theo nhóm có tiêu đề (Quản lý, Tiện ích, Cửa hàng, Dữ liệu, Thiết bị), mỗi mục có biểu tượng. Mục đang mở được tô nền.
2. **Cột giữa**: các thẻ (card), mỗi thẻ có tiêu đề nhóm và nhiều dòng thiết lập. Mỗi dòng gồm tên đậm, mô tả xám, và ở bên phải là **công tắc bật/tắt**, hoặc **số lượng kèm mũi tên** (vd. "15 đơn vị tính ›", bấm vào thì mở hộp thoại quản lý), hoặc chữ trạng thái ("Đang tắt", "Chỉnh sửa"). Một số công tắc khi bật thì hiện thêm các ô tick con ngay bên dưới.
3. **Cột phải**: mục lục "Trên trang này" để nhảy tới từng thẻ.

Trên cùng có ô **Tìm kiếm thiết lập**. Công tắc lưu ngay khi bật, không có nút "Lưu" chung. Thiết lập chi tiết (vd. quy tắc sinh mã) mở bằng hộp thoại có nút Hủy / Lưu.

## 2. Chi tiết từng mục (SettingType)

Trạng thái ghi theo cửa hàng TH Ceramics lúc khảo sát.

### Quản lý

**Hàng hóa — `products`**
- *Thông tin hàng hóa*: Mã vạch hàng hóa (tắt) · Tự động gợi ý thông tin hàng hóa (bật) · Đơn vị tính (15) · Thuộc tính (2) · Nhóm hàng (49) · Thương hiệu (32) · Vị trí (3).
- *Giá vốn, tồn kho*: Phương pháp tính giá vốn: Giá vốn cố định (đang chọn) / Giá vốn trung bình.
- *Bảo hành, bảo trì*: Bảo hành, bảo trì, yêu cầu sửa chữa (đang tắt).
- *Sản xuất*: Sản xuất hàng hóa (bật) — nguyên liệu thành phần, thành phẩm.
- *Người dùng*: Phân quyền người dùng theo nhóm hàng (tắt).
- *Khác*: Cho phép thay đổi thời gian giao dịch · Cho phép giao dịch khi hết tồn kho (cả hai trỏ sang mục Đơn hàng).

**Mua hàng — `purchase`**
- *Nhà cung cấp*: Quản lý nhà cung cấp theo chi nhánh (tắt).
- *Nhập hàng, đặt hàng nhập*: Đặt hàng nhập (tắt) · Quản lý chi phí nhập hàng (đang tắt).
- *Mua dịch vụ*: Mua dịch vụ (bật).

**Đơn hàng — `orders`**
- *Quản lý đơn hàng*: Đặt hàng (bật) với 3 ô con: cho phép đặt hàng khi hết tồn (bật), cho phép bán/chuyển hàng đã được đặt trước (bật), cho phép chuyển đơn đặt sang chi nhánh khác (tắt) · Cho phép giao dịch khi hết tồn kho (bật) · Cho phép in báo giá khi bán hàng (bật) · Xác nhận trước khi hoàn thành đơn (tắt) · Tự hoàn thành đơn khi quét QR thành công (tắt) · Giới hạn thời gian trả hàng (tắt) · Không cho phép thay đổi thời gian giao dịch (tắt) · Quản lý thu khác (2 loại thu khác).
- *Hóa đơn điện tử*: Chặn sửa/hủy hóa đơn đã phát hành HĐĐT (bật) · Thiết lập kết ca làm việc (tắt).
- *Mã giao dịch*: Quy tắc tạo mã giao dịch → hộp thoại "Cách tạo mã giao dịch": Tăng dần theo thứ tự tạo (HD000001 → HD000002…).

**Khách hàng — `customers`**
- *Quản lý khách hàng*: Theo chi nhánh (tắt) · Theo người phụ trách (tắt) · Khách đồng thời là nhà cung cấp (tắt) · Cảnh báo công nợ khách hàng (tắt) · Thiết lập thông tin bắt buộc (bật).
- *Chăm sóc khách hàng*: Tích điểm · Khuyến mại · Voucher · Coupon (đều tắt).

**Sổ quỹ — `cash-flow`**: Quản lý tài khoản thu chi: bảng tài khoản ngân hàng / ví điện tử (Số TK, Ngân hàng, Chủ TK, Phạm vi áp dụng, Ghi chú), nút Thêm tài khoản. Hiện chưa có tài khoản nào.

**Thuế & Kế toán — `taxAndAccounting`**: Thuế VAT (tắt) — phương pháp tính thuế, thuế suất mặc định, loại giao dịch áp dụng · Hồ sơ kê khai.

**Hóa đơn điện tử — `eInvoice`**: kết nối nhà cung cấp HĐĐT, khai báo chữ ký số, Thiết lập phát hành.

**Mẫu in**: mở trang riêng (biểu tượng mở tab mới) để sửa mẫu hóa đơn, phiếu.

### Tiện ích
- **Giao hàng — `delivery`**: Quản lý giao hàng (tắt) — đơn giao, trạng thái, thu hộ, phí vận chuyển với đối tác.
- **Thanh toán**: dịch vụ QR/thanh toán của KiotViet (không mở được trang riêng trong lần khảo sát).
- **Gửi SMS, Zalo — `sms-email`**: gửi tin cho khách qua SMS, Zalo.

### Cửa hàng
- **Thông tin cửa hàng — `retailer-info`**: ảnh đại diện, địa chỉ truy cập, hạn sử dụng, tên, điện thoại, quốc gia, địa chỉ; nút Chỉnh sửa.
- **Quản lý tiền tệ — `currency`**: tiền mặc định, ngoại tệ & tỷ giá, định dạng thập phân (tối đa 2 chữ số), lịch sử đổi tỷ giá.
- **Quản lý người dùng — `user-manager`**: tab Tài khoản người dùng / Quản lý vai trò; bảng Tên hiển thị, Tên đăng nhập, Điện thoại, Vai trò, Trạng thái; nút Tạo tài khoản.
- **Quản lý chi nhánh — `branch-manager`**: bảng chi nhánh, số người dùng, múi giờ, trạng thái; địa chỉ lấy hàng.
- **Bảo mật — `store-security`**: Xác thực khi xuất file (tắt) · Xác thực 2 lớp cho tài khoản nhân viên (tắt).

### Dữ liệu
- **Khóa sổ — `closing-book`**: không cho sửa giao dịch trước ngày khóa sổ (trừ đặt hàng, đặt hàng nhập).
- **Lịch sử thao tác — `audit-trail`**: bảng Nhân viên, Tính năng, Thời gian, Chi tiết; Lọc, Xuất file.
- **Xóa dữ liệu gian hàng — `data-history`**: đặt lịch xóa dữ liệu cũ, xem lịch sử xóa.

### Thiết bị
- **Cân điện tử — `device`**: Sử dụng cân điện tử (tắt).

## 3. Đối chiếu với Sổ bán hàng gốm

Trước đây Cài đặt là một trang 13 tab ngang, vào bằng nút bánh răng (không có menu). Bảng dưới là chỗ mỗi thiết lập của KiotViet nằm trong module mới.

| Mục KiotViet | Trong phần mềm | Trạng thái |
|---|---|---|
| Đơn vị tính, Nhóm hàng, Vị trí | Danh sách `units`, `categories`, `locations` của sổ | Có, sửa trong hộp thoại |
| Thuộc tính | Bật/tắt trường hàng hóa (Thương hiệu, Chất liệu, Định mức m², Định mức m) qua `hide_fields`; quy cách đóng gói qua `packaging` | Có |
| Thương hiệu | Lấy từ hàng hóa, không có danh sách riêng | Chỉ xem số lượng |
| Phương pháp tính giá vốn | Luôn dùng bình quân gia quyền di động | Chỉ xem, không đổi được |
| Sản xuất | Trang Sản xuất có sẵn; bước sản xuất đơn đặt xưởng `prod_steps` | Có |
| Cho phép giao dịch khi hết tồn | `allow_oversell` | Có |
| Đặt hàng nhập, Mua dịch vụ | Trang có sẵn, luôn bật | Có (không tắt được) |
| Mức giá bán (bảng giá) | `price_names` | Có |
| Kênh bán | `channels` | Có |
| Quản lý thu khác | VAT mặc định `default_vat` + tiền vận chuyển trên đơn | Có một phần |
| Cảnh báo công nợ | Nhắc trước hạn `due_warn_days` | Có |
| Nhóm khách hàng | Trang Nhóm khách hàng | Có |
| Mã giao dịch | Mã tăng dần theo tiền tố (DH, GH, PT…) | Chỉ xem |
| Sổ quỹ — tài khoản thu chi | Quỹ tiền + Tài khoản nhận chuyển khoản (QR) + danh mục chi phí | Có |
| Thuế VAT | Thuế GTGT, TNCN ước tính, VAT mặc định | Có |
| Mẫu in | Mẫu chứng từ | Có |
| Giao hàng | Đơn vị vận chuyển, webhook trạng thái | Có |
| Thanh toán | QR VietQR + nhận tiền tự động SePay | Có |
| Gửi SMS, Zalo | Thay bằng thông báo đẩy về điện thoại | Khác cách làm |
| Thông tin cửa hàng | Tên sổ, điện thoại, địa chỉ, lời nhắn cuối phiếu, mục tiêu doanh thu | Có |
| Người dùng, vai trò | Người dùng & quyền, Vai trò (Tổng quản trị) | Có |
| Bảo mật | Nhật ký bảo mật, tài khoản của tôi | Có một phần |
| Khóa sổ | `lock_date` | Có |
| Lịch sử thao tác | Nhật ký thay đổi | Có |
| Nhập / sao lưu dữ liệu | Excel, JSON | Có (KiotViet không có) |
| Mã vạch, gợi ý hàng hóa, bảo hành, phân quyền theo nhóm hàng, người phụ trách, khách kiêm NCC, thông tin bắt buộc, tích điểm, khuyến mại, voucher, coupon, giới hạn trả hàng, khóa thời gian giao dịch, kết ca, chi phí nhập hàng, tiền tệ, xác thực khi xuất file / 2 lớp, xóa dữ liệu, phương pháp giá vốn | Đã làm ngày 13/11/2026 (kế hoạch `plans/261113-0954-thiet-lap-day-du-kiotviet`) | Có |
| Hóa đơn điện tử | Khung thiết lập + chặn sửa/hủy đơn đã phát hành; chưa nối API nhà cung cấp | Có một phần |
| Gửi SMS/Zalo, chi nhánh (và KH/NCC theo chi nhánh), cân điện tử | Chủ cửa hàng chọn bỏ | Không làm |

## 4. Thiết kế đã làm

- **Thanh trên cùng**: nút bánh răng thành menu thả xuống giống KiotViet: các nhóm có biểu tượng, tên và dòng mô tả; cuối menu là **Xem tất cả thiết lập**. Menu chỉ hiện nhóm mà người dùng có quyền.
- **Trang Thiết lập** ba cột như KiotViet: cột trái là danh mục theo nhóm (Quản lý · Tiện ích · Cửa hàng · Dữ liệu); cột giữa là thẻ, mỗi dòng có tên, mô tả, và bên phải là công tắc, số lượng kèm › hoặc nút; cột phải là mục lục "Trên trang này". Ô tìm kiếm lọc theo tên và mô tả của mọi thiết lập, bấm kết quả thì nhảy đúng mục và tô sáng dòng đó.
- **Công tắc lưu ngay** và báo "Đã lưu" như KiotViet. Danh sách (đơn vị tính, nhóm hàng…) mở hộp thoại riêng có Hủy / Lưu.
- **Địa chỉ**: `#cai-dat/<mục>` (vd. `#cai-dat/hang-hoa`), nên nút quay lại và liên kết từ trang khác mở đúng mục. Địa chỉ cũ (`me`, `users`, `notify`…) vẫn đưa tới đúng mục mới.
- **Điện thoại**: cột trái thành thanh cuộn ngang ở đầu trang, mục lục bị ẩn.
- Nhân viên không phải quản lý sổ chỉ thấy Thông báo và Tài khoản của tôi, như trước.

## Câu hỏi còn mở

- Hóa đơn điện tử: khi có tài khoản API của nhà cung cấp (Viettel, MISA, VNPT…) thì nối phát hành thẳng từ đơn.
