---
phase: 3
title: "Trình nhập Excel và file mẫu theo sổ"
status: completed
dependsOn: [1, 2]
---

# Giai đoạn 3: Trình nhập Excel và file mẫu theo sổ

## Bối cảnh

Trình nhập (`web/src/lib/excel.js`, `productRules`, `buildProducts`) ghép tiêu đề cột với trường. Thử với 2 file khách gửi, các cột sau không được nhận hoặc nhận sai:

| File | Cột | Vấn đề |
|---|---|---|
| TH | Giá công trình lẻ | Không có trường (cần `price5`) |
| TH | Định mức, giá trị “27 viên/m2” | Quy tắc chỉ nhận tiêu đề “Định mức m2” / “Định mức m dài” và giá trị số |
| TH | Trọng lượng/thùng (kg) khi đơn vị đóng gói là Hộp | Đã vào `pack_weight` (kg mỗi đơn vị đóng gói); chỉ cần ghi rõ trong hướng dẫn |
| VG | Giá CH | Chưa có mức giá này (giai đoạn 2 thêm mức 4 “Giá CH” thì khớp theo tên) |
| TH | `mau-excel/hang-hoa-thanh-hai-2026.xlsx` | Đã có cột “Định mức m2”, “Định mức m dài” dạng số; cần nhập được cùng lúc với mẫu mới |

File mẫu tải từ phần mềm (`productTemplate`) đang dùng chung một bộ cột và 3 dòng ví dụ cho mọi sổ.

## Yêu cầu

- Nhập nguyên 2 file khách gửi vào đúng sổ, không phải gán cột tay.
- Cột “Định mức” chung: đọc giá trị “27 viên/m2”, “27 viên/m²”, “3,5 viên/m dài”, hoặc số trơn (hiểu là theo m²). Chữ “m dài”/“md” vào `norm_m`, còn lại vào `norm_m2`. Ô không đọc được thì báo lỗi dòng như các cột số khác.
- Thêm tên gọi khác cho giá: “Giá công trình lẻ”, “Giá CH”, “Giá cửa hàng”. Tên mức giá của sổ vẫn được ưu tiên trước các tên gọi chung.
- `productTemplate(settings)` sinh cột theo hồ sơ sổ:
  - TH: theo đúng thứ tự file khách gửi (Mã SKU, Tên, Nhóm hàng, Chất liệu, Kích thước (mm), Màu sắc, Định mức, Thương hiệu, ĐVT, Giá vốn, các mức giá, tồn, đóng gói, trọng lượng, Ghi chú), dòng ví dụ là ngói.
  - VG: Mã SKU, Tên, Chủng loại, Mẫu, Kích thước, Màu sắc / men, ĐVT, Giá vốn, Giá lẻ, Giá sỉ, Giá CTV, Giá CH, tồn, Ghi chú; dòng ví dụ là đồ thờ; không có cột đóng gói.
  - Sổ không khai báo `product_fields` (AN) giữ bộ cột hiện nay.
- Thêm dòng ví dụ của khách (`1AD27-DC01`, `TYC001`) và dòng ví dụ mới vào `SAMPLE_ROWS` để cảnh báo khi quên xóa.
- Thay `mau-excel/mau-hang-hoa_ThanhHai.xlsx` và `mau-excel/mau-hang-hoa_VuGia.xlsx` bằng file sinh từ phần mềm sau khi sửa.

## Tệp sửa

| Tệp | Việc |
|---|---|
| `web/src/lib/excel.js` | Quy tắc giá và định mức; hàm tách định mức; `productTemplate(settings)`; `SAMPLE_ROWS`; `importFields` lọc theo `product_fields` |
| `web/src/components/Import.jsx` | `saveTemplate` truyền `settings` vào `productTemplate` thay cho `pn`; tên file tải về kèm tên sổ |
| `server/test/excel.test.js`, `server/test/import.test.js` | Ca kiểm thử mới |
| `mau-excel/mau-hang-hoa_ThanhHai.xlsx`, `mau-excel/mau-hang-hoa_VuGia.xlsx` | Thay bằng file mẫu mới |

## Các bước

1. Viết kiểm thử trước bằng tiêu đề và dòng dữ liệu chép từ 2 file khách gửi (không đưa file của khách vào repo).
2. Sửa quy tắc ghép cột và hàm tách định mức.
3. Sửa `productTemplate`, rồi kiểm tra vòng lặp: tải file mẫu của mỗi sổ, nhập lại, không có cột nào bị bỏ qua.
4. Thử bằng tay trên `npm run dev` với chính 2 file trong `Downloads`.

## Kiểm thử

- File TH: 1 dòng vào sổ TH với `price1..price5` = 20000 / 16500 / 18000 / 20000 / 19000, `norm_m2` = 27, `pack_unit` = “Hộp”, `units_per_pack` = 40, `pack_weight` = 35, `unit_weight` = 0,88.
- File VG: 1 dòng vào sổ VG với Giá lẻ 20000, Giá sỉ 20000, Giá CTV trống, Giá CH 200000 (`price4`), ĐVT “bộ”.
- File `mau-excel/hang-hoa-thanh-hai-2026.xlsx`: 186 dòng hợp lệ vào sổ TH, 72 mã có quy cách hộp, không dòng lỗi.
- Cả hai dòng có cảnh báo “giống dòng ví dụ”.
- `npm test` đạt.

## Khác với dự kiến khi làm

- File mẫu dùng chung một danh sách cột rồi lọc theo hồ sơ sổ, nên file mẫu Thanh Hải có thêm cột “Mẫu” và tiêu đề “Chủng loại” thay cho “Nhóm hàng”; cả hai tên đều được trình nhập nhận.
- Không thêm `1AD27-DC01` vào danh sách dòng ví dụ, vì đây là mã hàng thật trên KiotViet; chỉ thêm `TYC001` của Vũ Gia.

## Rủi ro và hoàn tác

Thêm tên gọi giá có thể khớp nhầm cột ở file cũ của khách khác; tên mức giá của sổ luôn được thử trước nên rủi ro thấp. Thay đổi chỉ ở giao diện và kiểm thử, hoàn tác bằng git.
