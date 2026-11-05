# Brainstorm: nhập hàng cho 2 sổ Thanh Hải (gốm xây dựng) và Vũ Gia (đồ thờ)

Ngày 05/11/2026. Nguồn: 2 file khách gửi (`01. MẪU NHẬP HÀNG HÓA - SỔ BÁN HÀNG TH CERAMICS.xlsx`, `MẪU NHẬP HÀNG HÓA - SỔ BÁN HÀNG GVG (1).xlsx`), mã nguồn hiện tại.

## Kết luận

Giữ **một dự án, một bản deploy**. Hệ thống đã là đa sổ (TH, VG, AN dùng chung CSDL, mỗi sổ có `settings` riêng qua `VARIANTS` trong `server/src/domain/books.js`). Khác biệt giữa 2 sổ nằm ở cấu hình (tên/số mức giá, cột hàng hóa, có đóng gói hay không, file mẫu), không phải nghiệp vụ lõi. Tách dự án sẽ phải sửa lỗi và deploy hai lần cho cùng một lõi bán hàng, kho, công nợ.

Việc cần làm là nâng `VARIANTS` thành "hồ sơ sổ" đầy đủ hơn để mỗi sổ chỉ hiện và nhập những gì nó dùng.

## Hiện trạng 2 file của khách

Cả hai file chỉ có **1 dòng ví dụ**, nên đây là mẫu cột khách muốn dùng, chưa phải dữ liệu hàng hóa thật.

| | TH Ceramics | Gốm Vũ Gia |
|---|---|---|
| Mặt hàng | Ngói, gạch (bán theo viên, đóng hộp/thùng) | Đồ thờ (bán theo bộ/cái) |
| Cột mô tả | Nhóm hàng, Chất liệu, Kích thước (mm), Màu sắc, Định mức (“27 viên/m2”), Thương hiệu | Chủng loại, Mẫu, Kích thước, Màu sắc / men |
| Mức giá | Giá vốn + 5 mức: Đại lý I, Công trình, Công trình lẻ, Đại lý II, Lẻ | Giá vốn + 3 mức: Lẻ, Sỉ, CH |
| Đóng gói | Số viên/hộp, Đơn vị đóng gói, kg/thùng, kg/viên | Có cột nhưng để trống |

## Chỗ hệ thống chưa khớp

1. **TH có 5 mức giá, hệ thống chỉ có 4** (`price1..price4`). Cột “Giá công trình lẻ” hiện không khớp quy tắc nào trong `productRules` nên sẽ bị bỏ qua khi nhập.
2. **VG dùng “Giá CH”**, sổ VG đang đặt mức 3 là “Giá CTV”, nên cột này cũng không tự nhận.
3. **“Định mức” dạng chữ** (“27 viên/m2”): quy tắc chỉ nhận tiêu đề “Định mức m2” / “Định mức m dài” và giá trị số.
4. **Đóng gói**: TH ghi “Hộp” nhưng tiêu đề là “Trọng lượng/thùng”; 40 viên × 0,88 kg ≈ 35 kg nên cột đó thực chất là kg/hộp. Hệ thống đã có `pack_unit` riêng từng mã hàng, nên “hộp” hay “thùng” theo từng sản phẩm đã làm được. Nếu khách muốn nghĩa hai tầng (hộp nằm trong thùng) thì hiện chưa có.
5. **VG không chia đóng gói**, nhưng form, file mẫu và chứng từ vẫn hiện các ô quy cách, trọng lượng, định mức.

## Các phương án

| Phương án | Ưu | Nhược |
|---|---|---|
| A. Một dự án, hồ sơ sổ theo ngành (đề xuất) | Sửa một lần cho cả hai sổ; chủ dùng chung một tài khoản; đã có sẵn nền đa sổ | Phải giữ kỷ luật: khác biệt đặt ở cấu hình, không rẽ nhánh `if TH` rải rác |
| B. Một mã nguồn, hai bản deploy (2 tên miền, 2 CSDL) | Dữ liệu và tên miền tách hẳn, thương hiệu riêng cho Vũ Gia | Deploy, sao lưu, SSL gấp đôi; vẫn cần làm A trước |
| C. Tách 2 dự án | Mỗi bên tự do thay đổi | Trùng lặp toàn bộ lõi; lỗi sửa bên này phải chép sang bên kia; tốn công nhất |

Chỉ nên chuyển sang B khi khách cần tách hẳn người dùng/dữ liệu (ví dụ nhân viên Vũ Gia không được biết có sổ Thanh Hải) hoặc muốn tên miền riêng. C không có lý do kỹ thuật nào ở thời điểm này.

## Hướng làm theo phương án A

1. **Hồ sơ sổ**: thêm vào `VARIANTS` các khóa như `price_names` (tối đa 5), `packaging: true|false`, danh sách trường hàng hóa hiển thị/nhập. Form hàng hóa, trình nhập Excel, file mẫu và chứng từ đọc từ đây. Sổ đang chạy cần cập nhật `settings` một lần (sao lưu CSDL trước).
2. **Mức giá thứ 5 cho TH**: thêm cột `price5` (đi theo cùng đường với `price4`, khoảng 7 tệp) là cách gọn nhất. Cách khác là dùng Bảng giá có tên cho “Công trình lẻ” (đã có sẵn tính năng nhập bảng giá từ Excel), không cần đổi CSDL nhưng khách phải nhập 2 lần và chọn bảng giá theo nhóm khách.
3. **Trình nhập Excel**: nhận “Giá công trình lẻ”, “Giá CH”, “Định mức” dạng “27 viên/m2” (tách ra `norm_m2`/`norm_m`), coi “Trọng lượng/thùng” là kg mỗi đơn vị đóng gói.
4. **File mẫu theo sổ**: thay `mau-excel/mau-hang-hoa_ThanhHai.xlsx` và `mau-hang-hoa_VuGia.xlsx` bằng đúng cột khách gửi. File mẫu VG bỏ các cột đóng gói, định mức, chất liệu.
5. **Nạp dữ liệu lên máy chủ**: khi khách gửi file đủ dòng, sao lưu `/var/lib/so-ban-hang-gom/gomsu.db`, deploy bản mới theo `docs/deploy-server.md`, rồi nhập qua màn hình Nhập Excel của từng sổ và đối chiếu số mã hàng, tồn đầu kỳ.

## Câu hỏi cần khách trả lời

1. Hai file chỉ có 1 dòng ví dụ. Khách sẽ gửi file đủ hàng hóa sau, hay muốn mình dựng danh mục từ nguồn khác (ví dụ `mau-excel/hang-hoa-thanh-hai-2026.xlsx`, 186 dòng)?
2. “Thanh Hải chia thùng với hộp” nghĩa là mỗi mã hàng đóng hoặc hộp hoặc thùng, hay một thùng chứa nhiều hộp (cần cả số hộp/thùng)?
3. VG: “Giá CH” thay hẳn “Giá CTV”, hay cần cả bốn mức Lẻ / Sỉ / CTV / CH?
4. TH: thứ tự mức giá nào là mặc định cho khách lẻ, và mức nào gán cho nhóm khách nào?
5. Có cần tách Vũ Gia ra tên miền riêng (phương án B) không?
