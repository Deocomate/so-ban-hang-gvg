# Đối chiếu dữ liệu KiotViet với Sổ bán hàng, và nạp toàn bộ vào sổ Thanh Hải

Ngày 09/11/2026. Kế hoạch: [plan.md](../261109-1548-nap-du-lieu-kiotviet/plan.md).

## Kết quả

Hệ thống đã nhận được toàn bộ dữ liệu KiotViet TH Ceramics. Công cụ chuyển đổi dựng lại 4.965 chứng từ bằng chính hàm nghiệp vụ của sổ, trong 30 giây, ra tệp `du-lieu-kiotviet/nap/so-th-tu-kiotviet.json` (15,5 MB). Tệp nạp được qua chức năng sẵn có Cài đặt → "Nhập bản sao lưu JSON". Đã thử nạp vào sổ trống: tồn kho từng mã khớp sổ kho, giữ nguyên tên sổ và cài đặt riêng.

| Chỉ tiêu | Sổ bán hàng | KiotViet |
|---|---|---|
| Doanh thu thuần (08/2020 đến 07/11/2026) | 19.717.594.434 | 19.717.594.434 |
| Nợ phải thu khách | 7.999.221.199 | 7.999.221.199 |
| Nợ phải trả NCC | 109.189.244.890 | 109.189.244.890 |
| Công nợ từng khách khớp | 646 / 646 | |
| Công nợ từng NCC khớp | 32 / 32 | |
| Tồn kho từng mã đang bán khớp không cần bù | 746 / 750 | |

Chưa nạp lên bản chạy thật: việc này chờ đồng ý.

## Dữ liệu đã lấy thêm từ KiotViet

Lần xuất đầu (danh sách) còn thiếu ba phần, chỉ lộ ra khi đối chiếu công nợ:

- **Sổ công nợ từng khách và NCC** (`customers/{id}/debt`, `suppliers/{id}/debt`): có 165 phiếu điều chỉnh công nợ khách và 2 phiếu của NCC (mã CB…), không nằm trong sổ quỹ.
- **60 hóa đơn và 1 phiếu trả** của một chi nhánh cũ đã xóa (mã 18942, tháng 02 đến 07/2021, tổng 1,62 tỷ). KiotViet không còn liệt kê nhưng vẫn tính vào nợ khách. Không mở được đầu phiếu, nên hóa đơn được dựng lại từ dòng sổ công nợ (ngày, khách, giá trị) cộng chi tiết dòng hàng.
- **18 phiếu nhập** của chi nhánh cũ đó (PN000022 đến PN000083), có đủ đầu phiếu.

Các tệp nằm trong `du-lieu-kiotviet/goc/`. Trang xem https://kiotviet-data.admirable.site đã cập nhật thêm các phần này, có màn "Điều chỉnh công nợ" riêng.

## Khoảng trống giữa KiotViet và hệ thống, và cách xử lý

| KiotViet có | Hệ thống trước đây | Đã làm |
|---|---|---|
| Phí trả hàng (8 phiếu, 8,4 triệu) | Không có | Thêm ô "Phí trả hàng" khi trả hàng; phí trừ vào số ghi giảm cho khách, tính vào doanh thu |
| Phiếu điều chỉnh công nợ (mã CB) | Có "nợ đầu kỳ" có ngày, ghi chú | Mỗi phiếu CB thành một khoản nợ có ngày, giữ mã CB, ghi chú "Điều chỉnh công nợ trên KiotViet" |
| VAT ghi theo từng hóa đơn (8%, 4,5%, 10%) | VAT theo đơn | Lấy đúng tỷ lệ trên từng hóa đơn |
| Tiền vận chuyển là "thu khác" | Phí vận chuyển của đơn / đợt giao | Ghi vào phí vận chuyển |
| Giảm giá dòng theo số tiền, kể cả giảm âm (bán cao hơn giá niêm yết, 38 dòng) | Chiết khấu dòng 0 đến 100% | Quy ra %; dòng giảm âm ghi giá thực bán, giá niêm yết để trong ghi chú dòng |
| Hóa đơn sinh từ đặt hàng | Đợt giao của đơn đặt | Ghi thành đợt giao, giữ mã HĐ; 2 hóa đơn có hàng ngoài đặt hàng thành hóa đơn riêng (HD001107, HD001127.02) |
| Bảng giá theo nhóm khách | 5 mức giá + nhóm khách | Giá chung, Đại lý MẸ, Công trình, Đại lý MAI, Giá công trình thành mức 1 đến 5 (theo chốt 05/11). "Giá công trình" trống nên mức 5 lấy giá chung |
| Nhóm khách (4 nhóm, 7 khách) | Nhóm khách + mức giá | Giữ nhóm; mức giá theo nhóm: Đại lý cấp 1 → 2, Công trình → 3, Khách buôn → 4 |
| Loại khách cá nhân / công ty, mã số thuế, giới tính, khu vực | Có MST, giới tính, khu vực; chưa có loại khách | Thêm trường "Loại khách" vào form khách hàng |
| Thuộc tính KT, KG; thương hiệu | Có kích thước, cân nặng, thương hiệu | KT → kích thước, KG → cân nặng một đơn vị, thương hiệu → thương hiệu |
| Mã chứng từ HD, DH, PN, TH, THN, KK, TT, PC, CB | Tự cấp mã riêng | Giữ nguyên mã KiotViet; bộ đếm DH, PN đặt sau mã cũ để mã mới không trùng |
| Hàng, khách, NCC đã xóa còn trong lịch sử | Không có | Tạo lại ở trạng thái ngừng kinh doanh / ngừng hoạt động, giữ mã cũ (1.645 mã hàng) |
| Trả hàng nhập khi tồn bằng 0 | Chặn (quy tắc đã chốt, có test) | Giữ quy tắc; riêng THN000001 lập phiếu kiểm kho bù có ghi chú ngay trước phiếu trả |
| Nhập bản sao lưu ghi đè toàn bộ cài đặt sổ | | Tệp chuyển từ KiotViet chỉ thêm danh sách nhóm khách, giữ tên sổ, pháp nhân, tài khoản ngân hàng… |

## Phần bù chênh lệch (ghi rõ trong sổ)

- **Khách / NCC đã xóa và Khách lẻ**: KiotViet không theo dõi nợ, sổ đưa số dư về 0 bằng khoản điều chỉnh có ghi chú. Gồm 9 khách (lớn nhất KH000006{DEL} 290 triệu) và 5 NCC (lớn nhất NCC000001{DEL} 58 triệu).
- **Tồn kho**: 4 mã đang bán lệch nhỏ (SP000014 +1, SP000015 +1, 5GH022 −1, 1AD43-XD02 +37), cùng 246 mã đã xóa đưa về 0, gộp trong một phiếu kiểm kho ghi chú "Chênh lệch tồn kho khi chuyển từ KiotViet".
- **Không nhập**: 2 phiếu trả hàng đã hủy trên KiotViet (TH000014, TH000022).

Chi tiết từng khoản ở `du-lieu-kiotviet/nap/doi-chieu-kiotviet.json`.

## Thay đổi trong mã nguồn

- `server/src/db/schema.sql`, `server/src/db/index.js`: cột `fee` ở `sales_returns` và `sales_return_lines` (thêm tự động khi máy chủ khởi động).
- `server/src/domain/sales.js`: trả hàng nhận phí; lần trả sau trên cùng dòng vẫn tính đúng.
- `server/src/domain/import-backup.js`: tệp có `settings_patch` chỉ cập nhật các mục cài đặt đó.
- `web/src/pages/Sales.jsx`, `web/src/pages/CustomerFields.jsx`: ô "Phí trả hàng", trường "Loại khách".
- `server/scripts/kiotviet-convert.js`, `server/scripts/kiotviet-to-backup.js`: công cụ chuyển đổi.
- `server/test/kiotviet-import.test.js`: 24 kiểm thử (phí trả hàng; chuyển đổi trên dữ liệu mẫu tự dựng; nạp vào sổ trống). Toàn bộ `npm test` của server đạt.

## Nạp lên bản chạy thật (chờ đồng ý)

1. Sao lưu `gomsu.db` trên máy chủ (dừng dịch vụ, chép vào `backups/`).
2. Cập nhật mã nguồn mới lên máy chủ (cần cột `fee` trước khi nạp).
3. Chủ sổ đăng nhập, chọn sổ Thanh Hải, Cài đặt → Nhập bản sao lưu JSON → chọn `so-th-tu-kiotviet.json`. Sổ TH hiện chưa có chứng từ (1 hàng hóa, 1 khách) nên nạp được; hàng hóa và khách mặc định đó sẽ được thay.
4. Kiểm tra: tổng quan, công nợ, tồn kho so với bảng trên.

## Câu hỏi còn mở

1. Mức giá 5 "Giá công trình lẻ": bảng "Giá công trình" trên KiotViet trống nên đang lấy giá chung. Có cần nhập giá riêng không?
2. Ngày 05/11 khách nói giá KiotViet là giá cũ và sẽ gửi file giá mới. Khi có file, nạp đè giá bằng chức năng nhập Excel hàng hóa sẵn có.
