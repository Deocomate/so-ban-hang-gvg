# Module Mua hàng theo KiotViet

Trạng thái: xong giai đoạn 1–3, chưa commit. Khảo sát KiotViet `thceramics` ngày 07/11/2026, chỉ xem, không lưu gì.

## KiotViet có gì

Menu Mua hàng: Nhà cung cấp, Hóa đơn đầu vào, **Nhập hàng**, **Trả hàng nhập**, Mua dịch vụ. Màn **Đặt hàng nhập** (`#/OrderSupplier`) có nhưng bị ẩn khỏi menu ở cửa hàng này.

- **Nhập hàng** (danh sách): lọc Trạng thái (Phiếu tạm, Đã nhập hàng, Đã hủy), Thời gian, Người tạo, Số hóa đơn đầu vào, Người nhập. Cột: Mã nhập hàng (PN…), Thời gian, Mã NCC, Nhà cung cấp, Cần trả NCC, Trạng thái; dòng tổng ở đầu. Bấm dòng mở chi tiết ngay dưới: người tạo, người nhập, ngày nhập, NCC; bảng Mã hàng, Tên, Số lượng, Đơn giá, Giảm giá, Giá nhập, Thành tiền; Số lượng mặt hàng, Tổng tiền hàng, Giảm giá, Tổng cộng, Tiền đã trả NCC; nút Hủy, Sao chép, Xuất file, Mở phiếu, Trả hàng nhập, In tem mã.
- **Tạo phiếu nhập** (toàn màn hình): ô tìm hàng (F3), bảng STT, Mã, Tên (ghi chú dòng), ĐVT, Số lượng, Đơn giá, Giảm giá, Thành tiền; thêm hàng từ file Excel. Cột phải: người nhập, ngày giờ, tìm NCC (F4, có nút thêm), Mã phiếu (tự động), Mã đặt hàng nhập, Trạng thái, Số hóa đơn đầu vào, Tổng tiền hàng, Giảm giá, Cần trả NCC, Tiền trả NCC (F8, chọn hình thức), Tính vào công nợ, Ghi chú; nút **Lưu tạm** và **Hoàn thành**.
- **Đặt hàng nhập**: trạng thái Phiếu tạm, Đã xác nhận NCC, Nhập một phần, Hoàn thành, Đã hủy. Cột Ngày nhập dự kiến, Số ngày chờ, Cần trả NCC. Form như phiếu nhập, có Trạng thái, Dự kiến ngày nhập hàng, nút **Đặt hàng nhập**; khi nhập hàng tự điền số lượng theo phiếu đặt.
- **Trả hàng nhập**: phiếu riêng, không bắt buộc theo phiếu nhập. Cột Mã, Thời gian, NCC, Tổng tiền hàng, Giảm giá, NCC cần trả, NCC đã trả, Trạng thái. Form có Giá nhập và **Giá trả lại**, Giảm giá, NCC cần trả, Tiền NCC trả, Tính vào công nợ.

## App đang có

Một màn “Nhập hàng / đặt xưởng” liệt kê đơn nhập (DN), form dạng hộp thoại, nhận hàng nhiều đợt (NK), đặt xưởng theo bước sản xuất, gắn đơn bán, đặt cọc / trả tiền ngay, trả hàng NCC chỉ từ chi tiết đơn nhập và theo đúng giá nhập. Không có giảm giá, số hóa đơn đầu vào, hủy phiếu đã nhập, phiếu nhập thẳng tách khỏi đơn đặt, trả hàng không theo đơn, in phiếu nhập.

## Quyết định

- Đơn nhập có thêm `mode`: `nhap` (phiếu nhập hàng, mã PN, lưu tạm hoặc hoàn thành là vào kho ngay) và `dat` (đặt hàng nhập, mã DN như cũ, gồm cả đặt xưởng). Đơn cũ đã nhận kho ngay lúc lập được coi là phiếu nhập.
- Giảm giá từng dòng (VND / đơn vị) và giảm giá cả phiếu. Giảm giá phiếu chia đều theo giá trị vào giá vốn từng dòng, nên tồn kho, giá vốn và công nợ NCC đều theo số đã giảm (như KiotViet).
- Số hóa đơn đầu vào lưu trên phiếu.
- Hủy phiếu nhập đã nhập kho: xuất lại kho đúng giá trị đã nhập; chặn khi đã trả hàng nhập, đã trả tiền NCC hoặc tồn không đủ.
- Trả hàng nhập: lập từ chi tiết phiếu nhập (theo dòng đã nhận) hoặc lập riêng theo NCC; có giá trả lại, giảm giá, NCC hoàn tiền; hủy được. Phiếu trả lập riêng giảm công nợ NCC trực tiếp.
- Màn tạo / sửa dùng bố cục toàn màn hình như màn bán hàng. Sổ có đóng gói (Thanh Hải) hiện quy cách thùng trên dòng; sổ khác không.
- Không làm: phiếu tạm cho trả hàng nhập, người nhập khác người tạo, in tem mã, nhiều chi nhánh.

## Giai đoạn

| # | Nội dung | Trạng thái |
|---|---|---|
| 1 | CSDL v9: cột mới, dựng lại bảng trả hàng nhập, view; nghiệp vụ giảm giá, hủy phiếu nhập, trả hàng nhập riêng, hủy phiếu trả; kiểm thử | Xong |
| 2 | Giao diện: màn Nhập hàng, Đặt hàng nhập, Trả hàng nhập; màn tạo toàn màn hình; chi tiết, sao chép, xuất file, in, nhập dòng từ Excel | Xong |
| 3 | Build, thử trên trình duyệt, cập nhật HUONG-DAN.md | Xong |

## Ghi chú khi làm (07/11/2026)

- CSDL lên phiên bản 9. Bảng `supplier_returns`, `supplier_return_lines` được dựng lại (cho phép không gắn đơn nhập); `purchase_orders` thêm `mode`, `discount`, `invoice_no`; dòng đơn nhập thêm `unit_price`, `discount`; `goods_receipts` thêm `cancelled_at`, `cancel_reason`.
- Phiếu trả lập riêng giảm công nợ NCC qua `v_suppliers` và báo cáo công nợ (`suppBalances`); phiếu trả theo phiếu nhập vẫn trừ vào đơn nhập như trước.
- Hàm máy chủ mới: `cancel_receipt`, `cancel_supplier_return`. Kiểm thử ở `server/test/purchases-kiotviet.test.js`.
- Giao diện: `web/src/pages/PurchasePos.jsx` (màn tạo toàn màn hình), `web/src/pages/Purchases.jsx` (3 danh sách, chi tiết, in phiếu). Menu Mua hàng có thêm Đặt hàng nhập.
- Đã thử trên trình duyệt với dữ liệu mẫu riêng: tạo phiếu nhập có giảm giá dòng và phiếu, trả hàng theo phiếu, trả hàng lập riêng và hủy, in phiếu trả, sổ Vũ Gia không hiện quy cách thùng.

## Tiêu chí hoàn thành

- `npm test` đạt, có kiểm thử cho giảm giá, hủy phiếu nhập, trả hàng nhập riêng và hủy phiếu trả, nâng cấp CSDL cũ.
- `cd web && npx vite build` chạy được; thử tạo phiếu nhập, đặt hàng nhập, trả hàng nhập trên trình duyệt.
- CSDL cũ nâng lên v9 tự sao lưu trước, số liệu công nợ NCC và tồn kho không đổi.
