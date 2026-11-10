# Phân tích file khách gửi lại (10/11/2026, 19:23)

Nguồn: `C:\Users\minhlong\Downloads\MẪU NHẬP HÀNG HÓA - SỔ BÁN HÀNG TH CERAMICS.xlsx` (442 MB). Đã đọc giá trị đã tính của mọi sheet ra `scratchpad/new-all.json`. Chưa cập nhật gì lên hệ thống.

## Ba sheet

1. **Hàng hóa**: 766 mã, là bản khách sửa sau cùng. So với file trước: 412 mã có sửa (kích thước H→D 170 mã, giá đại lý II 181, số viên/hộp 79, đơn vị đóng gói 87, giá lẻ 46, tên 12…). Bỏ 6LC011 "Lan can bầu 40 vàng" và 9LV005 "Kỳ lân"; thêm 9NGHE000.
2. **Hàng hóa bổ sung**: 551 dòng, 376 ảnh.
   - Dòng 2–59: **khoảng 57 mặt hàng mới thật**: ngói 15 (GBB, ND, XD), Diềm Nhật 27 GAK12/13, 43 nâu đỏ NDO01–08, 80 đỏ cờ DC01–05, lưỡi bò 1ADLB-01..05, gạch hổ phách 5GTG069–075, 1ADCB-01, 3DIEM41/42, 2HAI026/027, 6LC011/012 giọt lệ 57, 3BO068/069, 3BS003. Dòng 61 chỉ có chữ "Giá Bái Đính" (không mã).
   - Dòng 62–71: lặp lại một số mã đã có (2HAI016, 1AD27-NDE01/02/05/11, 1AD15-ND01..04 lần 2).
   - Dòng 267–747: bản sao cũ của danh mục (giá trị quy cách vẫn là bản cũ ở 167 chỗ), riêng có khác: 2HAI013–016, 2HAI020 đổi tên "loại dày"/"mỏng"; nhóm 3DIEM chèn "Miếng khảm gốm" vào 3DIEM34 làm lùi mã; còn 6LC011 "Lan can bầu 40 vàng", 9LV005 "Kỳ lân".
   - Ô công thức (`=H2`, `=F2`, `=N2`) đều có giá trị đã tính; 5GBT001–007 ảnh dạng =IMAGE.
3. **1. Cần anh chị xem**: 98 dòng khách đã chọn ✔/✘; mã sửa trỏ tới mã mới ở sheet bổ sung (vd. 1AD27-GBB15 → 1AD27-GAK13).

## Cách cập nhật đề xuất (chưa làm)

- Danh mục = toàn bộ sheet "Hàng hóa" + các mặt hàng mới ở dòng 2–59 của sheet bổ sung (bỏ dòng lặp, bỏ phần bản sao cũ).
- Phần bản sao cũ có đổi tên 2HAI013–016/020 và chèn "Miếng khảm gốm" ở 3DIEM: cần hỏi khách có lấy không (đụng mã với sheet chính).
- Ghép mã: tự ghép theo tên trên danh mục mới + câu trả lời ✔/✘ của khách (`bang-ghep-ma.py doc`, sửa để đọc sheet có trong file này).
- Công cụ đọc Excel (`doc-danh-muc-excel.py`) phải đọc ảnh của nhiều sheet (drawing theo từng sheet).
- Sau đó: chạy lại chuyển đổi, đối chiếu, thử nạp bản sao; commit; đưa mã mới lên máy chủ; sao lưu CSDL; `npm run import-book -- TH`; kiểm tra bản thật.

## Câu hỏi cho khách

1. Phần dưới sheet bổ sung (từ dòng 62) có phải chỉ là bản sao không? Có lấy các tên mới 2HAI013–016 ("loại dày"), 2HAI020 "Ngói chiếu tráng men", và "Miếng khảm gốm" (3DIEM34, làm lùi mã 3DIEM34–40) không?
2. 6LC011 và 9LV005 (Kỳ lân) bị bỏ khỏi sheet chính là cố ý? 6LC011 giờ dùng cho "Lan can giọt lệ 57 xanh đồng".
3. Dòng "Giá Bái Đính" (dòng 61) là gì?
