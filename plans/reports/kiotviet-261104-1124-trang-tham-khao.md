# Khảo sát KiotViet (tài khoản thceramics, chỉ xem, 04/11/2026)

- **Nhóm khách hàng** (`#/CustomerGroups`): cột Tên nhóm, Điều kiện, Số lượng khách hàng, Giảm giá. Tạo nhóm 2 bước: chọn mẫu điều kiện (chi tiêu cao, sinh nhật tháng này, tự tạo) rồi nhập Tên nhóm, Giảm giá (VND hoặc %), điều kiện (số lần mua, tổng bán, tổng bán trừ trả hàng, công nợ hiện tại, điểm, tuổi, tháng sinh, giới tính, khu vực, loại khách) kèm điều kiện thời gian, cơ chế cập nhật (tự thêm / không thêm khách mới thỏa; tự xóa / không xóa khách hết thỏa), ghi chú.
- **Xuất hủy** (`#/DamageItems`): Mã xuất hủy, Tổng giá trị hủy, Thời gian, Ghi chú, Trạng thái. Lọc: trạng thái, loại xuất, thời gian, người tạo, người xuất hủy.
- **Xuất dùng nội bộ** (`#/InternalUse`): Mã, Loại xuất, Tổng giá trị, Thời gian, Ghi chú, Trạng thái. Loại xuất: văn phòng phẩm/dụng cụ làm việc; vật tư tiêu hao/công cụ dụng cụ; sự kiện/hội nghị nội bộ; bồi thường/đền bù; mẫu trưng bày/demo; quà tặng khách hàng/đối tác; khác.
- **Sản xuất** (`#/Manufacturing`): Mã sản xuất, Thời gian, Mã hàng, Tên hàng, Số lượng, Trạng thái. Form: mặt hàng sản xuất, số lượng, ngày, ghi chú, kho đầu vào/đầu ra, "tự động trừ thành phần thứ cấp". Thành phần lấy theo định mức của mặt hàng.
- **Mua dịch vụ** (`#/ServicePurchase`): Mã phiếu, Thời gian, Loại chi, Người nhận, Cần thanh toán, Đã thanh toán, Còn phải trả. Form: số hóa đơn đầu vào, loại chi, thời gian, đối tượng nhận (nhà cung cấp), cần thanh toán, ghi chú, thanh toán ngay (số tiền, người chi). Lọc: loại chi, trạng thái, người tạo, đối tượng, công nợ đối tác.

Không làm theo: chi nhánh, nhiều kho, điểm thưởng, tuổi/giới tính (app chưa có dữ liệu này).
