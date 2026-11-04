# Module Hàng hóa đủ trường như KiotViet

Trạng thái: giai đoạn 1–5 xong (chưa commit). Khảo sát: [báo cáo đối chiếu](../reports/kiotviet-261104-1405-hang-hoa-doi-chieu.md).

## Quyết định đã chốt (04/11/2026)

Người dùng chọn làm cả 4 phần lớn và cho nhập giá vốn, tồn ban đầu ngay ở form (hệ thống tự lập phiếu Tồn đầu kỳ).

- **Loại hàng** (`products.product_type`): `hang` (hàng hóa), `dich_vu` (không quản lý kho, giá vốn lấy từ ô Giá vốn), `combo` (giữ `is_kit = 1`, trừ kho từng thành phần), `san_xuat` (có tồn riêng, định mức thành phần sửa ngay ở form, dùng cho phiếu Sản xuất).
- **Nhiều đơn vị tính** (`product_units`): tên, giá trị quy đổi theo đơn vị cơ bản, giá riêng cho từng mức giá (để trống = giá đơn vị cơ bản × quy đổi), bán trực tiếp. Dòng đơn bán, đơn nhập ghi thêm `unit_name`, `unit_conv`; **số lượng và đơn giá trên máy chủ vẫn tính theo đơn vị cơ bản** nên tồn kho, giao hàng, trả hàng, giá vốn không đổi cách tính. Màn hình và bản in đổi ra đơn vị đã chọn.
- **Biến thể theo thuộc tính**: chỉ khi tạo mới. Thuộc tính là Mẫu, Kích thước, Màu sắc / men, Chất liệu (đúng các cột sẵn có). Nhập nhiều giá trị, sinh danh sách mã con (sửa được mã, giá, giá vốn, tồn), lưu một lần.
- **Bảng giá có tên** (`price_books`, `price_book_items`): giữ "Bảng giá chung" là các mức giá cũ theo khách. Bảng giá thêm có hiệu lực từ–đến, trạng thái, công thức (giá vốn / giá nhập cuối / mức giá / bảng khác ± VND hoặc %), cho phép hoặc không cho phép thêm hàng ngoài bảng (kèm cảnh báo), phạm vi nhóm khách hàng và người tạo giao dịch. Giá đơn vị quy đổi trong bảng giá = giá bảng × quy đổi. Chọn bảng giá ở màn bán hàng và báo giá; máy chủ chặn hàng ngoài bảng khi bảng không cho phép.
- **Trường nhỏ**: mô tả, mẫu ghi chú (tự điền vào ghi chú dòng khi thêm hàng), tồn tối đa, vị trí, kích thước rộng × dài (m / cm), bán trực tiếp (ẩn khỏi tìm hàng ở màn bán), tối đa 5 ảnh.
- **Danh sách**: lọc thêm loại hàng, thương hiệu, vị trí, bán trực tiếp, thời gian tạo; cột Khách đặt, Thời gian tạo, Dự kiến hết hàng (tồn chia bình quân bán 30 ngày), Vị trí, Tồn tối đa. Thao tác Sao chép, Xóa (chỉ khi chưa có giao dịch).

Không làm: chi nhánh, tích điểm, liên kết kênh bán, in tem mã vạch, soạn thảo mô tả có định dạng.

## Giai đoạn

| # | Nội dung | Trạng thái |
|---|---|---|
| 1 | CSDL v6 (cột, bảng mới, view), `save_product` mở rộng, xóa hàng, tạo biến thể, tồn đầu từ form | Xong |
| 2 | Dịch vụ không trừ kho; đơn vị quy đổi ở đơn bán, đơn nhập | Xong |
| 3 | Bảng giá có tên: API, màn Thiết lập giá, chọn bảng giá ở bán hàng và báo giá | Xong |
| 4 | Giao diện form hàng hóa, danh sách, chi tiết, bản in | Xong |
| 5 | Kiểm thử máy chủ (`server/test/products-kiotviet.test.js`, nâng cấp CSDL), kiểm tra trên giao diện | Xong |

## Ghi chú khi làm (04/11/2026)

- Mở CSDL giờ xóa mọi trigger nhật ký `audit_*` rồi tạo lại, kể cả của bảng đã bỏ khỏi danh sách theo dõi (lỗi gặp khi thử: trigger cũ trên `price_book_items` làm hỏng lệnh ghi).
- Sao lưu / khôi phục sổ mang theo `product_units`, `price_books`, `price_book_items`.
- Nhập Excel nhận thêm: Loại hàng (Hàng hóa / Dịch vụ / Hàng sản xuất; chữ khác ở cột này hiểu là chủng loại), Đơn vị quy đổi (`Hộp=100; Pallet=1000`, kèm giá mức 1 `Hộp=100:1500000`), Tồn tối đa, Vị trí, Rộng, Dài, Đơn vị kích thước, Bán trực tiếp (Có/Không), Chất liệu, Định mức m2 / m dài, Mô tả, Mẫu ghi chú. Combo phải tạo trong màn Hàng hóa; không đổi loại hàng qua Excel. File xuất Excel dùng đúng các tên cột này nên xuất ra rồi nhập lại được.
- Chưa làm: chi tiết đơn bán vẫn hiện đơn giá theo đơn vị cơ bản (bản in đã đổi theo đơn vị đã chọn).

## Tiêu chí hoàn thành

- Form tạo/sửa có đủ các trường ở trên, 4 loại hàng; sửa dùng cùng form.
- `npm test` đạt toàn bộ; có kiểm thử cho dịch vụ, đơn vị quy đổi, bảng giá, biến thể, tồn đầu từ form.
- CSDL cũ nâng cấp lên v6 tự sao lưu trước, dữ liệu cũ giữ nguyên.
