---
phase: 2
title: "Hồ sơ sổ: đóng gói và cột hàng hóa theo sổ"
status: completed
dependsOn: [1]
---

# Giai đoạn 2: Hồ sơ sổ

## Bối cảnh

`VARIANTS` trong `server/src/domain/books.js` đã khai báo tên mức giá, kênh bán, nhóm hàng cho TH, VG, AN và được chép vào `books.settings` khi tạo sổ. Form, danh sách, chi tiết hàng hóa (`web/src/pages/Products.jsx`) luôn hiện đủ các ô đóng gói, trọng lượng, chất liệu, định mức. Vũ Gia bán đồ thờ theo bộ/cái, không dùng các ô này.

## Yêu cầu

- Thêm vào hồ sơ sổ hai khóa:
  - `packaging`: `true` cho TH và AN, `false` cho VG. Tắt thì ẩn quy cách đóng gói, trọng lượng, tổng số hộp/thùng trên màn bán hàng và chứng từ.
  - `product_fields`: danh sách trường hàng hóa sổ dùng (ví dụ VG bỏ `material`, `norm_m2`, `norm_m`, `brand`). Không khai báo thì hiện đủ như hiện nay.
- VG thêm mức 4 “Giá CH”, giữ nguyên 3 mức Lẻ / Sỉ / CTV.
- Chủ sổ bật/tắt được `packaging` trong Cài đặt, để không phải sửa mã khi khách đổi ý.
- Không đặt `if (short_name === 'VG')` trong giao diện: mọi chỗ đọc từ `settings`.

## Tệp sửa

| Tệp | Việc |
|---|---|
| `server/src/domain/books.js` | `VARIANTS` thêm `packaging`, `product_fields`; VG thêm mức 4 “Giá CH”; `update_book_settings` nhận và kiểm tra 2 khóa mới |
| `server/src/db/index.js` | Trong lần nâng cấp 6 lên 7: sổ chưa có `packaging` thì điền theo `VARIANTS[short_name]`; VG đang đúng 3 tên mặc định cũ thì thêm “Giá CH” làm mức 4 |
| `web/src/pages/Products.jsx` | Form, danh sách cột, chi tiết: ẩn trường không có trong `product_fields`, ẩn nhóm đóng gói khi `packaging` tắt |
| `web/src/pages/OrderPos.jsx`, `web/src/pages/Sales.jsx` | Ẩn dòng tổng hộp/thùng khi `packaging` tắt |
| `web/src/lib/docs/model.js` | Không in quy cách đóng gói khi `packaging` tắt (hiện đã bỏ qua khi `units_per_pack` trống; thêm điều kiện theo sổ) |
| `web/src/pages/Settings.jsx` | Ô bật/tắt “Hàng có đóng gói (hộp, thùng)” |

Tạo một hàm nhỏ dùng chung ở `web/src/lib/` (ví dụ `bookProfile(settings)` trả `{ packaging, has(field) }`) thay vì lặp điều kiện ở từng trang.

## Các bước

1. Thêm khóa vào `VARIANTS` và lần nâng cấp CSDL (cùng phiên bản 7 với giai đoạn 1).
2. Viết hàm `bookProfile`, áp vào `Products.jsx`, rồi màn bán hàng và chứng từ.
3. Thêm ô bật/tắt trong Cài đặt.

## Khác với dự kiến khi làm

- Khóa `product_fields` (danh sách trường dùng) đổi thành `hide_fields` (danh sách trường ẩn), để sổ cũ không khai gì vẫn hiện đủ như trước.
- Sổ tắt đóng gói vẫn giữ ô trọng lượng mỗi cái, vì Vũ Gia bán online cần tính kg khi gửi hàng.
- Hàm dùng chung nằm ở `web/src/lib/book-profile.js` (`bookProfile`, `packView`).

## Kiểm thử

- `server/test/upgrade.test.js`: sau nâng cấp, sổ VG có `packaging: false` và 4 mức Lẻ / Sỉ / CTV / CH; sổ TH có `packaging: true`.
- Kiểm tra tay trên `npm run dev`: sổ VG không thấy ô đóng gói, định mức; sổ TH vẫn thấy đủ; in hóa đơn sổ TH vẫn có dòng “x hộp x 40 viên”.

## Rủi ro và hoàn tác

Ẩn trường chỉ ở giao diện, dữ liệu trong CSDL giữ nguyên, nên bật lại là thấy. Hoàn tác bằng bản sao lưu của lần nâng cấp.
