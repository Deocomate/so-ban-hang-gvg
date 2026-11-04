# Đối chiếu module Hàng hóa với KiotViet (thceramics, chỉ xem, 04/11/2026)

Không lưu gì trên KiotViet: mọi form mở ra đều bấm "Bỏ qua".

## KiotViet có gì

**Tạo mới** có 4 loại: Hàng hóa, Dịch vụ, Combo - đóng gói, Hàng sản xuất. Sửa dùng cùng form với tạo mới.

Form Hàng hóa, tab Thông tin:
- Mã hàng (để trống thì tự cấp), Tên hàng (bắt buộc), Nhóm hàng (bắt buộc, có "Tạo mới"), Thương hiệu (danh mục, có "Tạo mới"), tối đa 5 ảnh (mỗi ảnh ≤ 2 MB).
- Giá vốn, Giá bán (link "Thiết lập giá").
- Tồn kho: Tồn kho ban đầu, Định mức tồn thấp nhất, Định mức tồn cao nhất.
- Vị trí (danh mục, có "Tạo mới"), Trọng lượng (g/kg), Kích thước Rộng × Dài (m/cm).
- Đơn vị tính: đơn vị cơ bản + giá bán + "Bán trực tiếp"; thêm nhiều đơn vị quy đổi (tên, giá trị quy đổi theo đơn vị cơ bản, giá bán riêng, bán trực tiếp).
- Thuộc tính (vd. màu, kích thước; nhập nhiều giá trị) để sinh các biến thể.
- Ô "Bán trực tiếp" ở chân form (hiện hàng trên màn bán hàng hay không).

Tab Mô tả: Mô tả (soạn thảo định dạng), Mẫu ghi chú (hóa đơn, đặt hàng).

- Dịch vụ: như Hàng hóa nhưng không có Tồn kho và Vị trí/kích thước.
- Combo - đóng gói: bảng Hàng thành phần (mã, tên, số lượng, giá vốn, tổng giá vốn, giá bán, tổng giá bán), Giá bán, Vị trí, trọng lượng, đơn vị tính, thuộc tính. Không có tồn kho riêng.
- Hàng sản xuất: Hàng thành phần như combo, nhưng có Tồn kho và định mức tồn riêng.

Chi tiết một mặt hàng (bấm vào dòng): tab Thông tin, Mô tả và ghi chú, Thẻ kho, Tồn kho, Liên kết kênh bán; nhãn loại hàng, bán trực tiếp. Nút: Xóa, Sao chép, Chỉnh sửa, In tem mã, thêm: Nhập hàng, Chuyển thành hàng sản xuất, Ngừng kinh doanh.

Danh sách: lọc theo Nhóm hàng, Tồn kho, Dự kiến hết hàng, Thời gian tạo, Thuộc tính, Thương hiệu, Vị trí, Loại hàng, Bán trực tiếp, Liên kết kênh bán, Trạng thái. Cột chọn được: Hình ảnh, Mã hàng, Tên hàng, Nhóm hàng, Loại hàng, Kích thước, Liên kết kênh bán, Giá bán, Giá vốn, Thương hiệu, Tồn kho, Vị trí, Khách đặt, Thời gian tạo, Dự kiến hết hàng, Định mức tồn ít nhất, Định mức tồn nhiều nhất, Trạng thái.

Thiết lập giá: nhiều bảng giá có tên; hiệu lực từ ngày đến ngày, trạng thái áp dụng; công thức giá mới = bảng giá khác ± VND/%; khi lên đơn cho phép hoặc không cho phép thêm hàng ngoài bảng giá; phạm vi áp dụng theo chi nhánh, nhóm khách hàng, người tạo giao dịch. Màn danh sách hiện giá vốn, giá nhập cuối và giá từng bảng.

Kiểm kho: phiếu kiểm (mã tự động, phiếu tạm hoặc hoàn thành), tab Tất cả / Khớp / Lệch / Chưa kiểm, cột tồn kho, thực tế, SL lệch, giá trị lệch, nhập từ Excel. Sản xuất, Xuất hủy, Xuất dùng nội bộ đã đối chiếu trong [báo cáo trước](kiotviet-261104-1124-trang-tham-khao.md).

## App đã có

Mã SKU tự cấp, tên, chủng loại (gõ tự do), thương hiệu (gõ tự do), mẫu, kích thước, màu men, chất liệu, định mức m² và mét dài, ĐVT, một đơn vị đóng gói có quy đổi (chỉ để in, không bán theo hộp), trọng lượng thùng và viên, cảnh báo tồn thấp, 4 mức giá theo mức giá của khách, bộ sản phẩm, đang bán / ngừng bán, ghi chú, 1 ảnh. Định mức sản xuất lưu ở phiếu Sản xuất. Giá vốn và tồn ban đầu cố ý không nhập ở form (phải qua phiếu Tồn đầu kỳ hoặc nhận hàng).

## Còn thiếu so với KiotViet

Xem phần quyết định và việc đã làm trong [kế hoạch](../261104-1405-hang-hoa-kiotviet/plan.md).
