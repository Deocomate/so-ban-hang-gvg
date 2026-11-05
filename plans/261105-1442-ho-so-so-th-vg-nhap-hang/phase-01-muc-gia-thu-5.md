---
phase: 1
title: "Mức giá thứ 5"
status: completed
dependsOn: []
---

# Giai đoạn 1: Mức giá thứ 5

## Bối cảnh

Hàng hóa có `price1..price4`, khách hàng có `price_tier` trong khoảng 1 đến 4, Cài đặt chỉ cho 3 hoặc 4 tên mức giá. File Thanh Hải có 5 mức bán. Lần mở rộng 3 lên 4 trước đây (`widenPriceTier`, `addFourthPriceName` trong `server/src/db/index.js`) là mẫu để làm theo.

## Yêu cầu

- Thêm `price5`, cho `price_tier` từ 1 đến 5, Cài đặt nhận 3 đến 5 tên mức giá.
- Mọi chỗ đang lặp cố định 4 mức chuyển sang đọc theo số tên mức giá của sổ.
- Không đổi chỉ số mức giá của khách hàng đã có.

## Tệp sửa

| Tệp | Việc |
|---|---|
| `server/src/db/schema.sql` | Thêm cột `price5`; ràng buộc `price_tier between 1 and 5` |
| `server/src/db/index.js` | `SCHEMA_VERSION = 7`; thêm `price5` vào `ADDED_COLUMNS`; tổng quát `widenPriceTier` để nới tới 5 (nhận cả bảng đang ở 3 hoặc 4) |
| `server/src/db/views.sql` | Thêm `b.price5` vào view hàng hóa (dòng ~130) |
| `server/src/domain/books.js` | Kiểm tra `price_names` dài 3 đến 5; chặn bỏ mức đang có khách dùng (tổng quát cho mức 4 và 5); `VARIANTS.TH.price_names` thêm “Giá công trình lẻ”, đổi “Giá đại lý” thành “Giá đại lý I” |
| `server/src/domain/catalog.js` | `save_product`, sửa nhanh giá (`[1, 2, 3, 4]` thành 1..5) nhận `price5` |
| `server/src/domain/stock.js` | Nhập hàng hóa từ Excel ghi và cập nhật `price5` |
| `server/src/domain/price-books.js` | `BASES` thêm `tier5` |
| `web/src/pages/Settings.jsx` | 5 ô tên mức giá, mức 4 và 5 không bắt buộc |
| `web/src/pages/Products.jsx` | `EMPTY` thêm `price5` (các chỗ khác đã lặp theo `pn`) |
| `web/src/lib/excel.js` | Quy tắc `price5`, `numField(r.price5)`, kiểm tra số âm |

## Các bước

1. Sửa schema và nâng cấp CSDL: thêm cột, nới ràng buộc khách hàng. Nâng cấp tự sao lưu trước (`backupBeforeUpgrade` đã có).
2. Trong lần nâng cấp từ 6 lên 7, với sổ `TH`: nếu `price_names` đúng bằng mặc định cũ thì đổi “Giá đại lý” thành “Giá đại lý I” và thêm “Giá công trình lẻ”. Sổ đã đổi tên tay thì để nguyên.
3. Sửa các tệp máy chủ, rồi giao diện.
4. Rà lại bằng `grep -rn "price4\|\[1, 2, 3, 4\]\|tier4" server/src web/src` để không sót chỗ nào.

## Kiểm thử

- `server/test/upgrade.test.js`: CSDL phiên bản 6 có khách mức 4 nâng lên 7 vẫn giữ nguyên, thêm được khách mức 5, tên mức giá TH đúng giả định.
- `server/test/business.test.js`: bán cho khách mức 5 lấy đúng `price5`.
- Chạy `npm test`.

## Rủi ro và hoàn tác

Nâng cấp dựng lại bảng `customers`; giữ kiểm tra `foreign_key_check` như hàm cũ. Hoàn tác bằng bản sao lưu `gomsu.db.truoc-nang-cap-v6.bak` mà nâng cấp tự tạo.
