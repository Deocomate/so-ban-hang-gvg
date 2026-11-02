# Khảo sát tái cấu trúc hệ thống bán hàng 3 thương hiệu gốm

Ngày 31/10/2026. Nguồn: toàn bộ `tasks/build-so-ban-hang-kiotviet/data` và code hiện tại. Chưa sửa code.

## 1. Kết luận

Nền hiện tại giữ lại được: sổ riêng từng thương hiệu, tồn kho, công nợ, sổ quỹ, phân quyền, giao nhiều đợt, in PDF. Phần cần làm là thêm các phân hệ chứng từ còn thiếu, đổi cấu trúc menu, đổi giao diện theo logo. Dữ liệu ở máy này gần như trống (0 hàng hóa, 0 đơn, 2 khách), nên nếu bản đang chạy thật cũng vậy thì đổi cấu trúc rất ít rủi ro.

Bốn điểm chặn ở mục 5 đã được chốt, xem [kế hoạch](../261031-1139-tai-cau-truc-3-thuong-hieu/plan.md). Những điểm còn lại có phương án mặc định ở mục 6.

## 2. Đối chiếu yêu cầu với hệ thống hiện tại

| Yêu cầu trong dữ liệu | Hiện tại | Việc cần làm |
|---|---|---|
| Thương hiệu Anamtile | Chỉ có 2 sổ TH, VG | Thêm sổ thứ 3 |
| Báo giá: 2 mẫu BG ANAM, BG TH CERAMICS | Không có | Phân hệ mới: nhóm hàng I/II/III, định mức, cột ẩn khi xuất, ảnh, lưu ý sửa được, xuất file |
| Tính khối lượng: số m² × định mức − diềm | Không có | Trường định mức theo m² và m, công thức theo bảng trong mẫu |
| Hợp đồng: tải scan/PDF, đợt giao, các biên bản | Không có | Phân hệ mới, kèm vận chuyển riêng khi hợp đồng không gồm vận chuyển |
| Đề nghị tạm ứng, đề nghị thanh toán | Không có | Chứng từ mới sinh từ hợp đồng |
| Biên bản đối chiếu số lượng, đối chiếu kèm thanh toán | Không có | Chứng từ mới, cộng dồn từ các đợt giao |
| Biên bản giao hàng | Đã có | Bổ sung bên vận chuyển, gắn hóa đơn từng đợt |
| Hợp đồng vận chuyển | Không có | Chứng từ mới từ hóa đơn: lái xe, biển số, số hộp, kg |
| Hóa đơn bán hàng | Đã có | Thêm nợ cũ, tổng hộp và sọt, điều khoản đổi trả |
| Khoản thu khác (VAT, vận chuyển), lái xe, công nợ lái xe | Chỉ có phí vận chuyển | Danh mục thu khác, danh mục lái xe, công nợ lái xe |
| Trang đơn: đã giao, đang giao, còn giao, tiến độ, cọc khấu trừ | Có giao nhiều đợt, chưa có giao diện này | Làm trang chi tiết đơn, cọc khấu trừ theo từng hóa đơn |
| Khách hàng: thông tin xuất hóa đơn, địa chỉ giao, nhóm, ảnh | Chỉ có trường cơ bản | Mở rộng khách hàng |
| Tổng hợp đơn đặt xưởng theo khách, ngày giao, còn SX | Chưa có dạng này | Báo cáo mới, trạng thái "dừng hàng" |
| Menu 8 mục, gồm Thuế HKD | Menu khác, có sổ quỹ riêng | Dựng lại menu |
| Bảng giá, kiểm kho, trả hàng nhập, hóa đơn đầu vào | Có một phần | Bổ sung phần thiếu |
| Dashboard, phễu bán hàng, mục tiêu, điểm hòa vốn | Tổng quan đơn giản | Làm lại, phễu cần dữ liệu trạng thái khách |
| Theme theo logo | Một màu xanh dương | Màu theo từng sổ |

Màu lấy từ logo: TH Ceramics than `#282828` điểm cam gạch (màu menu trên ảnh web), Vũ Gia nâu đất `#904018`, Anamtile xanh than `#102028`. Mã màu là ước lượng từ ảnh, cần file logo gốc của TH và Anamtile.

## 3. Mâu thuẫn giữa các tài liệu

1. **Báo giá.** `flow.html` ghi "không tự động chuyển thành hợp đồng hoặc hóa đơn". Sơ đồ menu lại ghi "Chuyển sang đặt hàng hoặc hóa đơn".
2. **Hợp đồng và Đặt hàng.** Flow có phân hệ Hợp đồng với các đợt giao. Sơ đồ menu không có mục Hợp đồng, chỉ có Đặt hàng, Hóa đơn, Trả hàng. Ảnh đơn Chùa Bảo Phúc cho thấy Đặt hàng cũng có đợt giao và cọc.
3. **Pháp nhân.** Hóa đơn mẫu đứng tên HKD Gốm sứ Mai Hiếu, STK 1106738888. Hợp đồng và báo giá đứng tên Công ty TNHH SX&TM Thanh Hải, STK 1027833793. Mẫu BG ANAM cũng dùng Công ty Thanh Hải. Menu có Thuế HKD, trong khi công ty TNHH không kê khai theo HKD.
4. **Thuế.** Mẫu dùng VAT 8%. Cấu hình hiện tại là 1% GTGT + 17% TNCN, áp dụng cho hộ kinh doanh.
5. **Giao diện.** Ảnh mẫu dùng tông xanh và tên "Minh Long", "TH Ceramics 42". Thư mục theme yêu cầu màu logo. Có 2 mẫu màn bán hàng: bản Minh Long tinh gọn và bản giống màn hiện tại.
6. **Điều khoản đổi trả.** Hóa đơn: 10, 30, 40 ngày. Hợp đồng và bảng giá lẻ: 30, 45, 60 ngày.
7. **Địa chỉ công ty** có 7 cách ghi: 41B Xóm 6, 41 Xóm 6, 42 Xóm 6, 18 Xóm 6, 41B Giang Cao, 18 Phố Gốm (showroom), Số 6 Ngõ 252 Xóm 4 (xưởng).

## 4. Sai lệch số liệu trong mẫu, cần khách xác nhận

Những lỗi này không chặn việc làm, nhưng hệ thống sẽ cho ra số khác với giấy tờ cũ.

- **Lệch 10 viên ở đợt 2:** Biên bản bàn giao 26/09 và bảng đặt xưởng ghi Diềm âm 96 viên, Bảng đối chiếu ghi 86. Chênh 336.000đ trước VAT. Số 86 khớp tổng hợp đồng 576 viên, số 96 khớp 6 hộp × 16.
- **Giấy tạm ứng:** ghi tổng hợp đồng 275.454.000đ, trong khi hợp đồng là 513.922.968đ. Dòng "30% trước VAT" không khớp 80.000.000đ theo cả hai con số, nên tiền tạm ứng phải nhập tay, % chỉ là nhãn.
- **Hợp đồng 1009:** ghi "đơn giá đã bao gồm 8% VAT" nhưng bảng vẫn cộng thêm VAT 8%.
- **Bảng đặt xưởng:** Lý Phương Hoa đặt 22.600 ngói âm, hợp đồng 17.280. Thư viện Lê Đức Anh có số ở 2 cột không tiêu đề nhưng "Còn SX" không trừ.
- **Tổng hộp:** hóa đơn ghi 135 hộp + 8 sọt, không ra được từ quy tắc cộng cố định. Hợp đồng vận chuyển ghi 44 hộp trong khi các dòng cộng được 43.
- **Bảng giá đại lý:** kích thước và cân nặng trùng nhau giữa cỡ 27, 43, 80 nên có thể sao chép nhầm. Giá dòng 5 và 9 để trống. Bảng gạch hoa có STT trùng (48, 56) và thiếu kích thước vài dòng.
- **Giá cặp và giá viên:** bảng lẻ chỉ có giá cặp, hợp đồng có giá viên (16.800 + 13.400 = 30.200).

## 5. Câu hỏi chặn cấu trúc (đã chốt 31/10/2026)

1. Hợp đồng và Đặt hàng là một hay hai phân hệ?
2. Báo giá có nút chuyển sang đơn không?
3. Pháp nhân gắn với thương hiệu thế nào, HKD Mai Hiếu có trên hệ thống không?
4. Bản đang chạy thật đã có dữ liệu cần giữ chưa?

Ngoài ra câu trong `task.md` bị cắt: "Phần mẫu giao diện là những mong muốn của khách hàng rằng…". Cần câu đầy đủ.

## 6. Phương án mặc định nếu không có ý kiến khác

- 3 sổ riêng, nhưng dùng chung tài khoản và có màn tổng hợp cho chủ.
- Màu theo logo từng sổ, bố cục theo ảnh mẫu. Màn bán hàng theo bản Minh Long, giữ dòng quy đổi hộp và trọng lượng của bản hiện tại.
- Hóa đơn bán hàng là chứng từ nội bộ, chưa nối hóa đơn điện tử.
- Điều khoản, thuế suất, tài khoản ngân hàng là mẫu sửa được theo từng loại chứng từ.
- Tiền tạm ứng nhập tay. Số thanh toán theo hợp đồng lấy theo số thực giao.
- Tổng hộp tự tính nhưng sửa được, như đang làm ở biên bản giao hàng.
- Phễu bán hàng dựng từ trạng thái khách do nhân viên cập nhật, không tự suy ra.
- Thuế HKD làm ở giai đoạn cuối, chỉ cho pháp nhân là hộ kinh doanh.

## 7. Thứ tự làm đề xuất

1. Nền: sổ Anamtile, pháp nhân, theme, menu mới.
2. Danh mục: hàng hóa có định mức, bảng giá, khách hàng mở rộng, lái xe.
3. Báo giá.
4. Hợp đồng và chuỗi chứng từ.
5. Hóa đơn, thu khác, hợp đồng vận chuyển, công nợ lái xe.
6. Báo cáo đặt xưởng, Dashboard, Thuế HKD.

## 8. Lưu ý về mã nguồn

Nhánh `main` đang có nhiều thay đổi chưa commit: sửa ở server và web, thêm `server/test/upgrade.test.js`, xóa thư mục `so-ban-hang-new-version`. Tôi chưa động tới, nhưng nên commit trước khi bắt đầu để tách bạch phần tái cấu trúc.
