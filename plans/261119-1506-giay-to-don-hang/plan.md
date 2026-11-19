# Giấy tờ đơn hàng & soạn hợp đồng theo mẫu

Trạng thái: xong (chờ commit) · Ngày: 2026-11-19

## Mục tiêu
- Theo dõi 4 giấy tờ bắt buộc của một đơn: Hợp đồng, Biên bản giao hàng, Giấy chứng nhận xuất xưởng, Hóa đơn VAT — biết cái nào đã có, đã tải lên, còn thiếu, cho cả bản bên mình và bản đối tác ký gửi lại. Xem trước tệp đã tải lên.
- Theo dõi là tùy chọn: mặc định bật cho khách cần xuất hóa đơn VAT (loại "Công ty" hoặc có MST); khách có thể đặt Luôn / Không theo dõi; từng đơn bật/tắt riêng.
- Soạn hợp đồng theo 3 mẫu khách cung cấp (Kinh tế – công ty, Kinh tế – cá nhân, Nguyên tắc): chọn loại → hiện các trường để điền → xem trước → sửa trực tiếp bằng trình soạn (TipTap) → In / PDF. Hoặc gắn link Google Docs cho hợp đồng phức tạp.

## Quy trình đã tối ưu
1. Đơn của khách cần VAT tự vào danh sách theo dõi; khách lẻ thì không. Bật / tắt theo thứ tự ưu tiên: đơn › khách › nhóm khách › tự động. Nhóm khách hiển thị số đơn còn thiếu giấy tờ.
2. Mỗi giấy tờ có ô "Bên mình" và (nếu cần) "Đối tác ký": Hợp đồng và Biên bản giao hàng cần cả hai; CN xuất xưởng và Hóa đơn VAT chỉ bên mình.
3. Trạng thái ô: Đã tải lên › Đã lập trên phần mềm (hợp đồng đã soạn, đơn đã có đợt giao, đã ghi số hóa đơn VAT) › Có bản giấy (đánh dấu tay) › Thiếu. Giấy tờ không áp dụng cho đơn có thể bấm "Không cần".
4. Từ từng ô có nút lập ngay giấy tờ đó (soạn hợp đồng, in biên bản, in CN xuất xưởng, ghi hóa đơn VAT).

## Thay đổi
- CSDL: bảng `order_doc_files` (tệp / link / đánh dấu bản giấy theo đơn, giấy tờ, bên); cột `kind, fields, body_html, gdoc_url` cho `contracts`.
- Máy chủ: `server/src/domain/order-docs.js` (bảng theo dõi, chi tiết, tải lên, link, bản giấy, xóa, bật/tắt, không cần, lưu nội dung hợp đồng).
- Giao diện: trang "Giấy tờ đơn hàng", mục giấy tờ trong chi tiết đơn, xem trước tệp, trình soạn hợp đồng, chứng từ in mới "Giấy chứng nhận xuất xưởng", lựa chọn theo dõi trong hồ sơ khách.

## Ngoài phạm vi
- Phiếu bảo hành (đã có mẫu nhưng không thuộc 4 giấy tờ bắt buộc).
- Sửa mẫu gốc hợp đồng trong trình sửa mẫu in (mỗi hợp đồng sửa trực tiếp được).

## Nghiệm thu
- Test máy chủ cho trạng thái theo dõi, bật/tắt, tải lên/xóa, lưu hợp đồng.
- Mở giao diện: bảng theo dõi, tải lên + xem trước PDF/ảnh, soạn 3 loại hợp đồng, sửa trực tiếp, xuất PDF.
