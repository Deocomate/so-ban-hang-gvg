# Làm đủ các thiết lập KiotViet còn thiếu

Trạng thái: xong, chưa commit · Khảo sát gốc: [khao-sat-261113-0933-thiet-lap-kiotviet.md](../reports/khao-sat-261113-0933-thiet-lap-kiotviet.md)

## Mục tiêu

Mọi dòng "Chưa hỗ trợ" trong trang Thiết lập thành chức năng thật, chạy được và có kiểm thử phía máy chủ.

Quyết định của chủ cửa hàng (13/11/2026):
- Hóa đơn điện tử: làm khung trước (thông tin người bán, đánh dấu đã phát hành, chặn sửa/hủy), nối API khi có nhà cung cấp.
- Bỏ hẳn: Gửi SMS/Zalo, chi nhánh (quản lý chi nhánh, KH/NCC theo chi nhánh, chuyển đơn sang chi nhánh), cân điện tử.
- Đổi cách tính giá vốn: người dùng tự chọn áp dụng từ một ngày (tính lại chứng từ từ ngày đó) hoặc chỉ cho chứng từ mới; luôn có cảnh báo và xem trước trước khi đổi.

## Giai đoạn

| # | Nội dung | Trạng thái |
|---|---|---|
| 1 | Phương pháp tính giá vốn: bình quân / cố định, xem trước, sao lưu, tính lại | xong |
| 2 | Hàng hóa: mã vạch, gợi ý thông tin hàng hóa, bảo hành – sửa chữa, phân quyền theo nhóm hàng | xong |
| 3 | Mua hàng: chi phí nhập hàng phân bổ vào giá nhập | xong |
| 4 | Đơn hàng: xác nhận trước khi hoàn thành, giới hạn thời gian trả hàng, khóa đổi ngày giao dịch, kết ca | xong |
| 5 | Khách hàng: người phụ trách, khách kiêm NCC, thông tin bắt buộc, tích điểm, khuyến mại, voucher, coupon | xong |
| 6 | Cửa hàng, bảo mật, dữ liệu: tiền tệ, xác thực khi xuất file, xác thực 2 lớp, xóa dữ liệu cũ | xong |
| 7 | Hóa đơn điện tử (khung) và chặn sửa/hủy hóa đơn đã phát hành | xong |
| 8 | Gỡ các mục đã bỏ khỏi trang Thiết lập, cập nhật HUONG-DAN | xong |

## Giai đoạn 1 — giá vốn

- `products.fixed_cost`: giá vốn cố định (mặc định là đơn giá lần nhập đầu tiên, sửa được ở phiếu hàng hóa).
- `stock_moves.src_value`: giá trị gốc của dòng nhập có giá (nhập hàng, tồn đầu kỳ, điều chỉnh có đơn giá, trả NCC theo giá nhập) để đổi qua lại không mất dữ liệu.
- Cố định: mọi biến động kho tính theo số lượng × giá vốn cố định; tồn kho = số lượng × giá vốn cố định; công nợ NCC vẫn theo giá nhập thật.
- Bình quân: như hiện nay (bình quân gia quyền di động).
- Tính lại: chạy lại sổ kho theo thứ tự ghi, cập nhật giá vốn trên phiếu giao, khách trả, điều chỉnh, sản xuất, trả NCC.
- Xem trước chạy cùng thuật toán trong một savepoint rồi hoàn tác, nên số xem trước đúng bằng số sau khi đổi.
- Sao lưu toàn bộ CSDL trước khi đổi.

Nghiệm thu: đổi bình quân → cố định → bình quân từ đầu sổ cho kết quả giá vốn trùng bản gốc; không đổi được trước ngày khóa sổ; kiểm thử máy chủ đạt.
