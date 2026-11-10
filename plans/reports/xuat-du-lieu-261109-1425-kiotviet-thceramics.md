# Xuất toàn bộ dữ liệu KiotViet TH Ceramics (thceramics.kiotviet.vn)

Ngày 09/11/2026. Chỉ đọc, không sửa gì trên KiotViet. Dữ liệu lấy qua API nội bộ của trang quản lý KiotViet, dùng phiên đăng nhập sẵn có trong Chrome.

## Kết quả

Toàn bộ dữ liệu nằm trong thư mục `du-lieu-kiotviet/` (đã thêm vào `.gitignore` vì có tên, điện thoại, địa chỉ khách hàng).

| Dữ liệu | Số bản ghi | KiotViet báo | Dòng chi tiết |
|---|---|---|---|
| Hàng hóa | 750 | 750 | |
| Bảng giá (chung, Công trình, Đại lý MAI, Đại lý MẸ, Giá công trình) | 750 / 727 / 727 / 727 / 0 giá | | |
| Khách hàng | 646 | 646 | |
| Nhà cung cấp | 32 | 32 | |
| Hóa đơn (1.190 hoàn thành, 499 đã hủy) | 1.689 | 1.689 | 4.788 |
| Đặt hàng | 102 | 102 | 400 |
| Trả hàng | 31 | 31 | 83 |
| Nhập hàng (971 đã nhập, 55 đã hủy) | 1.026 | 1.026 | 2.519 |
| Trả hàng nhập | 2 | 2 | 2 |
| Kiểm kho | 599 | 599 | 2.768 |
| Sổ quỹ (thu, chi, cả phiếu hủy) | 1.272 | 1.272 | |

Ngoài ra: 1 chi nhánh, 4 người dùng, 49 nhóm hàng, 32 thương hiệu, 4 nhóm khách, 14 nhóm thu chi, 2 kênh bán, 2 loại thu khác. Xuất hủy, xuất dùng nội bộ, sản xuất đều trống trên KiotViet. Hàng hóa không có ảnh hay mô tả. Dữ liệu chạy từ 01/08/2020 đến 07/11/2026.

## Đối chiếu

- Số bản ghi lấy về khớp đúng tổng KiotViet báo ở mọi loại; không phiếu nào thiếu dòng chi tiết.
- Tổng dòng hàng khớp từng đồng với tổng tiền hàng của cả 1.689 hóa đơn, 102 đặt hàng và 1.026 phiếu nhập; số lượng nhập cũng khớp.
- Lưu ý KiotViet: `SubTotal` của hóa đơn đã gồm thu khác. Tiền hàng = SubTotal − thu khác; khách cần trả = SubTotal − giảm giá.
- Nợ khách hiện tại 7.999.221.199 đ (khớp khảo sát trước, khoảng 7,98 tỷ). Nợ phải trả NCC 109.189.244.890 đ.
- “Còn nợ” cộng theo từng hóa đơn (8,99 tỷ) khác nợ khách hiện tại vì tiền khách trả nợ sau đó được ghi ở sổ quỹ, không gắn lại vào hóa đơn. Khi nạp vào hệ thống mới, lấy nợ đầu kỳ từ cột “Nợ cần thu hiện tại” của khách hàng.

## Cấu trúc thư mục

- `goc/kiotviet-thceramics-day-du.json`: bản gốc đầy đủ, giữ nguyên mọi trường KiotViet trả về (30,8 MB).
- `json/00-tong-quan.json` … `json/08-so-quy/`: tách theo nhóm cửa hàng, hàng hóa, bảng giá, đối tác, bán hàng, mua hàng, kho, sổ quỹ; vẫn đủ trường gốc.
- `csv/`: bảng phẳng tiêu đề tiếng Việt, mở bằng Excel; mỗi loại chứng từ có file phiếu, file chi tiết dòng hàng và file thanh toán; `03-bang-gia/gia-hang-hoa-theo-bang.csv` gom giá mọi bảng giá vào một bảng.
- `xem/index.html`: trang xem dữ liệu, mở trực tiếp bằng trình duyệt. Có tổng quan (doanh thu theo tháng, top hàng hóa và khách hàng, bảng kiểm tra độ đầy đủ), danh sách từng loại có tìm kiếm không dấu, lọc ngày, lọc trạng thái, sắp xếp, tải CSV, và khung chi tiết liên kết qua lại giữa phiếu, khách, nhà cung cấp, hàng hóa.
- `_cong-cu/tach-du-lieu.mjs`: chạy lại `node du-lieu-kiotviet/_cong-cu/tach-du-lieu.mjs` để dựng lại `json/`, `csv/`, `xem/du-lieu.js` từ file gốc.

## Câu hỏi còn mở

1. Bảng nhân viên chấm công trên KiotViet trống; nếu cần lịch sử lương, chấm công thì phải xem lại phân hệ đó.
