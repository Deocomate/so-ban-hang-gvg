# Thay danh mục hàng hóa KiotViet bằng file mẫu nhập mới của khách

Ngày 10/11/2026. Nguồn: `docs/MẪU NHẬP HÀNG HÓA - SỔ BÁN HÀNG TH CERAMICS.xlsx` (767 mã, 21 nhóm hàng). Tiếp nối [đối chiếu KiotViet ngày 09/11](doi-chieu-261109-1548-kiotviet-voi-he-thong.md).

## Kết quả

Bản chuyển đổi giờ lấy danh mục hàng theo file mới: đủ 767 mã, với tên, nhóm hàng, chất liệu, kích thước, màu, định mức, thương hiệu, 5 mức giá, quy cách đóng gói, cân nặng và ảnh. Lịch sử bán, nhập, kiểm kho của các mã KiotViet đã ghép được chuyển sang mã mới. Tồn kho vẫn lấy theo KiotViet, vì cột "Số lượng tồn" trong file đang trống.

Số liệu sau khi đổi danh mục vẫn khớp KiotViet: doanh thu thuần 19.717.594.434 đ, nợ phải thu 7.999.221.199 đ, nợ phải trả NCC 109.189.244.890 đ. Đã thử nạp vào bản sao CSDL: tồn từng mã khớp sổ kho, giao diện hiện đúng ảnh, giá và quy cách.

Chưa nạp lên bản chạy thật.

## Ghép mã: chỉ ghép theo tên

File mới đã đánh lại mã, nên **cùng mã chưa chắc cùng hàng**. Ví dụ `1AD27-DC05` trên KiotViet là "Diềm âm 27 đỏ cờ sen cành mới", còn trong file mới `1AD27-DC05` là "sen bông" (mặt hàng sen bông trên KiotViet mang mã `1AD27-DC08`). Trong số 265 mã trùng nhau giữa hai bên, 229 mã có tên khác.

Vì vậy hệ thống chỉ tự ghép khi tên trùng, kể cả khi chỉ đảo thứ tự từ ("Ngói dương 27 đỏ cờ cổ dài" ↔ "Ngói dương 27 cổ dài đỏ cờ"). Tên chỉ gần giống thì không tự ghép, vì các mặt hàng thường chỉ khác nhau ở cỡ (27/43), sắc men (đậm/nhạt) hay mẫu (mới/chùm).

| | Số mã |
|---|---|
| Mã KiotViet đang bán | 750 |
| Tự ghép được theo tên | 375 |
| Cần khách xác nhận | 375 (52 mã còn tồn, 94 mã từng bán; 78 mã có gợi ý giống tên ≥ 80%) |
| Mã mới chưa có trên KiotViet | 395 |
| Gộp 2 mã KiotViet vào 1 mã mới | 3 (5GTG038, 5GTG036, 1AD27-XD10) |

File để khách duyệt: `du-lieu-kiotviet/nap/DUYET-CHUYEN-MA-HANG-KIOTVIET.xlsx`. Trang chính chỉ có 98 mặt hàng còn tồn hoặc đã từng bán mà tên không trùng: 27 dòng đề xuất "khá chắc", 29 dòng "chưa chắc", 42 dòng không tìm thấy (đề xuất ngừng bán). Mỗi dòng đặt hàng cũ (mã, tên, kích thước, giá, tồn, số lần bán) cạnh hàng mới đề xuất (mã, ảnh, tên, kích thước, giá). Khách chỉ chọn "✔ Đúng" hoặc "✘ Sai"; nếu Sai thì ghi mã đúng, để trống là ngừng bán. 277 mã không tồn, chưa bán và 375 mã đã tự chuyển nằm ở các trang tham khảo, không cần làm gì.

Khi nhận lại file: `python -X utf8 du-lieu-kiotviet/_cong-cu/bang-ghep-ma.py doc du-lieu-kiotviet <file>` ra `nap/ghep-ma-hang-da-duyet.json`, rồi chạy lại chuyển đổi với `--ghep` trỏ tới tệp này. Dòng chưa chọn giữ mã cũ và ngừng kinh doanh.

Mã KiotViet chưa ghép vẫn được giữ trong sổ để không mất lịch sử. Chúng mang mã cũ ở trạng thái ngừng kinh doanh; nếu mã cũ trùng một mã mới thì thêm đuôi `-KV`.

## Ảnh hàng hóa

- 505 mã có ảnh: 501 ảnh dán trong file và 4 ảnh lấy từ link Google.
- 3 mã (5GBT001, 5GBT002, 5GBT003) dùng link Google Drive chưa chia sẻ công khai, link trả về trang đăng nhập nên chưa lấy được ảnh.
- Ảnh được thu nhỏ như khi tải trong ứng dụng: ảnh đầy đủ 480px (trung bình 38 KB) và ảnh đại diện 128px (khoảng 4 KB). Ảnh gốc trong file là 445 MB.

## Thay đổi hệ thống đi kèm

Ảnh lưu ngay trong CSDL, mà danh sách hàng hóa và màn bán hàng trước đây tải cả ảnh đầy đủ của mọi mã: với 505 ảnh, mỗi lần mở sẽ tải khoảng 37 MB. Đã sửa:

- `save_product` nhận `thumb` (ảnh đại diện thu nhỏ). Form hàng hóa tự tạo bản 128px khi lưu; nút "Ngừng kinh doanh / Kinh doanh lại" giữ ảnh đại diện cũ.
- Truy vấn danh sách hàng hóa không trả ảnh đầy đủ, chỉ trả khi xem một mã theo id. Danh sách 767 mã giờ tải 2,9 MB.
- Lệnh `npm run import-book -- TH <tệp.json>`: nạp bản sao lưu ngay trên máy chủ, cho tệp quá lớn để tải qua giao diện (tệp có ảnh nặng 36,1 MB, giới hạn tải lên là 20 MB). Lệnh tự sao lưu CSDL trước, dùng đúng hàm nhập của nút "Nhập bản sao lưu JSON".
- Bản chuyển đổi không mang theo thông báo cũ (trước đó có 1.288 thông báo, nạp lên có thể gửi hàng loạt thông báo đẩy về đơn từ năm 2020).

Test: thêm 2 kiểm thử ảnh đại diện và 5 kiểm thử danh mục mới; toàn bộ 17 bộ test của server đạt.

## Câu hỏi còn mở

1. Khách duyệt 375 mã cần xác nhận trước khi nạp, hay nạp ngay với 375 mã đã ghép? Sau khi nạp, hệ thống chưa có chức năng gộp mã, nên ghép thêm về sau sẽ khó.
2. Giá vốn: với mã có lịch sử nhập, hệ thống dùng giá vốn bình quân thực tế, không dùng "Giá vốn" trong file (ví dụ 1AD27-DC01: 12.300 đ theo lịch sử, file ghi 15.675 đ). Đây là quy tắc sẵn có của chức năng nhập Excel. Có cần áp giá vốn trong file không?
3. Ảnh của 5GBT001–003: nhờ khách chia sẻ link Drive công khai hoặc dán ảnh vào file.
