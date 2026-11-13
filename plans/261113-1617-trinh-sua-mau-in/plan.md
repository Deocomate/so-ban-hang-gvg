# Trình sửa mẫu in kiểu KiotViet

Trạng thái: xong (13/11/2026), chưa commit · Báo cáo khảo sát: phân tích trực tiếp trang `thceramics.kiotviet.vn/man/#/Settings?SettingType=print-template` ngày 13/11/2026.

## Kết quả mong muốn
Mẫu in mọi chứng từ (hóa đơn, đơn đặt hàng, biên bản, phiếu xuất kho, phiếu thu/chi, hợp đồng vận chuyển, đề nghị tạm ứng/thanh toán, đối chiếu, báo giá) là **mẫu HTML có biến `{Ten_Bien}`**, sửa trực quan trong một **tab riêng** giống KiotViet: trình soạn bên trái, xem trước khổ giấy thật bên phải, bảng chèn thông tin, gõ `/` để chèn, chế độ mã nguồn, khổ A4/A5/K80/K58, dọc/ngang, In thử, Đặt lại, Lưu mẫu. Mỗi loại có nhiều mẫu, một mẫu mặc định; khi in chọn được mẫu.

## KiotViet làm gì (đã khảo sát)
- Trình soạn TipTap/ProseMirror; mẫu lưu dạng HTML; biến `{Tieu_De_In}`, `{Khach_Hang}`…; dòng bảng chứa biến hàng hóa tự lặp theo từng mặt hàng.
- Biến hiện dạng thẻ có nút ×; bảng "Thông tin" chia nhóm (Gian hàng, Chi nhánh, Khách hàng, Hàng hóa, Hóa đơn, Thanh toán, Giao hàng), có ô tìm, nút Chèn / Sao chép.
- Thanh công cụ: Source, phông, cỡ chữ ±, ảnh, bảng, kẻ ngang; hoàn tác, đậm/nghiêng/gạch dưới, chỉ số trên/dưới, màu chữ, màu nền, căn lề, danh sách, viền bảng, hiện lưới.
- Xem trước: khổ K58/K80/A4/A5, dọc/ngang, thu phóng; nút Chọn mẫu gợi ý, Đặt lại, In thử, Lưu mẫu.

## Thiết kế
- `lib/docs/tokens.js`: danh mục biến theo nhóm + tính giá trị biến từ dữ liệu chứng từ (dùng lại hàm của `model.js`) + dữ liệu mẫu.
- `lib/docs/templates.js`: mẫu mặc định của từng loại (giữ đúng bố cục hiện tại và nội dung ghi chú đã tùy chỉnh), khổ giấy, chọn mẫu, `renderTemplate` (lặp dòng hàng, ẩn dòng có biến trống, thay biến).
- `lib/docs/pdf.js`: HTML → pdfmake (html-to-pdfmake), giữ `pdfBlob(doc)`; in bằng trình duyệt qua iframe.
- `pages/PrintEditor.jsx`: trang sửa mẫu ở tab mới `?mau-in=<loại>&tpl=<id>&book=<sổ>`.
- `Documents.jsx`: xem trước HTML, chọn mẫu, nút In; Cài đặt → Mẫu in kiểu "Quản lý mẫu in".
- Server: `save_print_templates` (chỉ chủ sổ), `update_book_settings` giữ nguyên mẫu khi lưu phần khác của `docs`.

## Tiêu chí nghiệm thu
1. Mở Cài đặt → Mẫu in → chọn loại → Sửa: tab mới mở trình soạn, sửa chữ/bảng/biến, xem trước cập nhật ngay, Lưu mẫu xong tab cũ thấy mẫu mới.
2. Chứng từ in ra (xem trước, In, Tải PDF, gộp nhiều chứng từ) dùng mẫu đã lưu; chưa có mẫu riêng thì dùng mẫu mặc định giống bản trước.
3. Dòng hàng lặp đúng số mặt hàng; dòng chiết khấu/VAT/hàng trả lại tự ẩn khi bằng 0.
4. Kiểm thử server cho lưu/kiểm tra mẫu chạy qua; build web không lỗi.

## Không làm
- Không đổi cách lưu thông tin riêng từng chứng từ (`doc_info`).
- Không làm mẫu in tem/mã vạch.
