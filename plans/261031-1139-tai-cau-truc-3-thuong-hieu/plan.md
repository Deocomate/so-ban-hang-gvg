# Tái cấu trúc hệ thống bán hàng 3 thương hiệu

Trạng thái: đã xong cả 6 giai đoạn, chờ khách dùng thử. Khảo sát chi tiết: [báo cáo](../reports/khao-sat-261031-1139-tai-cau-truc-3-thuong-hieu.md).

## Quyết định đã chốt (31/10/2026)

- Hợp đồng và Đặt hàng là hai loại trên menu, dùng chung lõi đợt giao, cọc, tồn kho.
- Báo giá có nút bấm tay để sao chép sang đơn mới; sau đó hai bên độc lập.
- Khai báo 2 pháp nhân (Công ty Thanh Hải, HKD Mai Hiếu). Mỗi sổ có mặc định, từng chứng từ đổi được. Thuế HKD chỉ áp dụng phần của Mai Hiếu.
- Chưa có dữ liệu thật cần giữ, được đổi cấu trúc rồi nạp lại hàng hóa từ bảng giá.

## Giai đoạn

| # | Nội dung | Trạng thái |
|---|---|---|
| 1 | Sổ Anamtile, pháp nhân, theme theo logo, menu theo sơ đồ | Xong |
| 2 | Hàng hóa có định mức, bảng giá, khách hàng mở rộng, danh mục lái xe | Xong |
| 3 | Báo giá theo 2 mẫu, xuất file, nút chuyển sang đơn | Xong |
| 4 | Hợp đồng, đợt giao, biên bản, đề nghị tạm ứng và thanh toán, vận chuyển riêng | Xong |
| 5 | Hóa đơn, thu khác, VAT, cọc khấu trừ, hợp đồng vận chuyển, công nợ lái xe | Xong |
| 6 | Báo cáo đặt xưởng, Dashboard, Thuế HKD | Xong |

Giai đoạn 2 đến 6 làm tuần tự vì phần sau dùng dữ liệu của phần trước. Mục Báo giá, Hợp đồng và Thuế HKD chỉ xuất hiện trên menu khi trang đã làm xong.

## Tiêu chí hoàn thành chung

- Chứng từ in ra khớp mẫu trong `tasks/build-so-ban-hang-kiotviet/data`.
- `npm test` đạt toàn bộ.
- Hợp đồng 1009 nhập lại trên hệ thống cho đúng các số trong Bảng đối chiếu, sau khi khách xác nhận lệch 86/96 viên.
- Ba phân hệ không tự sinh chứng từ sang nhau; chỉ có nút bấm tay ở Báo giá.

## Rủi ro

- Mã màu lấy từ ảnh, cần logo gốc của TH và Anamtile.
- Thuế ước tính ở trang Thuế HKD dùng thuế suất trong Cài đặt, cần kế toán xác nhận.
- Tệp đính kèm chưa nằm trong bản sao lưu JSON.
- Câu mô tả giao diện trong `task.md` bị cắt, có thể đổi ưu tiên giao diện.
