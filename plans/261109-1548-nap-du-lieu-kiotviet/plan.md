# Nạp toàn bộ dữ liệu KiotViet TH Ceramics vào sổ Thanh Hải

Trạng thái: bước 1 đến 3 xong (09/11/2026); bước 4 chờ đồng ý. Đối chiếu chi tiết: [báo cáo](../reports/doi-chieu-261109-1548-kiotviet-voi-he-thong.md).

## Mục tiêu

Sổ Thanh Hải trên bản chạy thật nhận được toàn bộ lịch sử KiotViet (08/2020 đến 07/11/2026): hàng hóa, giá, khách, NCC, hóa đơn, đặt hàng, trả hàng, nhập hàng, trả hàng nhập, kiểm kho, sổ quỹ. Sau khi nạp, công nợ từng khách, từng NCC và tồn kho từng mã khớp KiotViet; mã chứng từ cũ giữ nguyên để tra cứu.

## Ràng buộc

- Không sửa gì trên KiotViet. Dữ liệu nguồn: `du-lieu-kiotviet/goc/kiotviet-thceramics-day-du.json` (không lên git).
- Mọi chứng từ được dựng lại bằng chính hàm nghiệp vụ của hệ thống (giá vốn, sổ kho, công nợ do hệ thống tự tính), không ghi thẳng vào bảng.
- Nạp vào sổ thật qua chức năng sẵn có "Nhập bản sao lưu JSON" (chỉ cho sổ chưa có chứng từ). Sổ TH trên bản thật hiện chưa có chứng từ.
- Việc nạp lên bản thật chỉ làm khi chủ dự án đồng ý.

## Ngoài phạm vi

- Phân hệ nhân viên, chấm công, lương (KiotViet trống).
- Gộp mã hàng đã xóa với mã mới cùng tên.

## Các bước

1. Bổ sung hệ thống cho phần KiotViet có mà hệ thống chưa có: phí trả hàng; nhập bản sao lưu chỉ cập nhật một số mục cài đặt; trường "Loại khách" (cá nhân / công ty). Quy tắc chặn trả hàng nhập vượt tồn giữ nguyên; công cụ chuyển đổi lập phiếu bù có ghi chú cho trường hợp KiotViet cho phép.
2. Công cụ chuyển đổi `server/scripts/kiotviet-to-backup.js`: dựng sổ tạm trong bộ nhớ, chạy lại toàn bộ chứng từ theo thời gian, xuất tệp `gomsu-backup-v1` kèm bảng đối chiếu.
3. Kiểm thử: test tự động cho phí trả hàng và cho công cụ chuyển đổi (dữ liệu mẫu nhỏ); chạy công cụ trên dữ liệu thật, đối chiếu công nợ, tồn kho, doanh thu.
4. Nạp lên bản thật (chờ đồng ý): sao lưu CSDL, nhập tệp vào sổ TH, kiểm tra lại số liệu.

Bổ sung 10/11/2026: danh mục hàng lấy theo file mẫu nhập mới của khách (767 mã, có ảnh), ghép mã KiotViet theo tên; chờ khách duyệt 375 mã. Chi tiết: [báo cáo ghép mã](../reports/ghep-ma-261110-1457-danh-muc-moi-voi-kiotviet.md). Nạp lên bản thật bằng `npm run import-book` trên máy chủ vì tệp có ảnh vượt giới hạn tải lên.

## Tiêu chí hoàn thành

- Số chứng từ trong sổ bằng số trên KiotViet (trừ phiếu đã hủy không có trong hệ thống, liệt kê rõ).
- Công nợ từng khách và từng NCC khớp KiotViet; phần lệch (nếu có) được ghi thành nợ đầu kỳ có ghi chú.
- Tồn kho từng mã khớp `OnHand` của KiotViet.
- `npm test` của server đạt.
