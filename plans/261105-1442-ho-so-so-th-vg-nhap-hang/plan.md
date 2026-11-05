---
title: "Hồ sơ sổ theo ngành cho Thanh Hải và Vũ Gia, nhập hàng từ mẫu Excel của khách"
description: "Giữ một dự án; mỗi sổ khai báo số mức giá, có đóng gói hay không và các cột hàng hóa; trình nhập Excel đọc đúng 2 mẫu khách gửi; deploy rồi nạp dữ liệu."
status: in-progress
priority: P2
effort: 2d
branch: main
tags: [backend, frontend, import, deploy]
blockedBy: []
blocks: []
created: 2026-11-05
---

# Hồ sơ sổ Thanh Hải và Vũ Gia, nhập hàng từ mẫu Excel

Theo phương án A trong [báo cáo brainstorm](../reports/brainstorm-261105-1437-hai-so-th-vg-nhap-hang.md): một mã nguồn, một bản deploy, khác biệt giữa các sổ nằm trong cấu hình sổ (`VARIANTS` ở `server/src/domain/books.js`, lưu vào `books.settings`).

## Mục tiêu

- Sổ Thanh Hải (gốm xây dựng) nhập được nguyên file `01. MẪU NHẬP HÀNG HÓA - SỔ BÁN HÀNG TH CERAMICS.xlsx`: đủ 5 mức giá, định mức dạng “27 viên/m2”, đóng gói theo hộp hoặc thùng từng mã.
- Sổ Vũ Gia (đồ thờ) nhập được nguyên file `MẪU NHẬP HÀNG HÓA - SỔ BÁN HÀNG GVG (1).xlsx`: 3 mức Lẻ / Sỉ / CH, không hiện các ô đóng gói, định mức, chất liệu.
- File mẫu tải từ phần mềm của mỗi sổ có đúng các cột khách gửi.
- Bản mới chạy trên máy chủ, dữ liệu cũ còn nguyên, hàng hóa thật nạp được vào từng sổ.

## Ngoài phạm vi

- Đóng gói hai tầng (hộp nằm trong thùng): khách xác nhận không cần.
- Tách tên miền hay CSDL riêng cho Vũ Gia (phương án B).
- Đổi giao diện bán hàng, chứng từ ngoài việc ẩn phần đóng gói ở sổ không dùng.

## Quyết định đã chốt (05/11/2026)

- Danh mục Thanh Hải lấy **KiotViet làm gốc**: 750 mã với mã thật kiểu `1AD27-DC01` ([khảo sát](../reports/khao-sat-261105-1448-kiotviet-thanh-hai.md)). File `mau-excel/hang-hoa-thanh-hai-2026.xlsx` (186 mã) dùng để bổ sung định mức, số viên/hộp, trọng lượng.
- Lệch giá thì **giá Excel được ưu tiên**: mã nào ghép được với Excel thì Giá lẻ và Giá đại lý I lấy theo Excel; các mức còn lại và mã không ghép được thì lấy KiotViet.
- Ghép mức giá với KiotViet và nhóm khách: 1 Giá lẻ = Bảng giá chung (Khách lẻ); 2 Giá đại lý I = Đại lý MẸ (Đại lý cấp 1); 3 Giá công trình = Công trình (Công trình); 4 Giá đại lý II = Đại lý MAI (Khách buôn); 5 Giá công trình lẻ để trống (bảng “Giá công trình” trên KiotViet chưa có giá).
- Sổ Vũ Gia: cửa hàng KiotViet Thanh Hải không có hàng đồ thờ, nên cần địa chỉ KiotViet riêng của Vũ Gia.
- Mỗi mã hàng đóng theo hộp hoặc theo thùng, không có hai tầng. Hệ thống đã có `pack_unit` từng mã nên chỉ cần đọc đúng file.
- Vũ Gia dùng đủ 4 mức: 1 Giá lẻ, 2 Giá sỉ, 3 Giá CTV, 4 Giá CH (mới).
- Thanh Hải giữ thứ tự mức giá cũ để khách hàng đã gán mức giá không bị lệch: 1 Giá lẻ, 2 Giá đại lý I (đổi tên từ “Giá đại lý”), 3 Giá công trình, 4 Giá đại lý II, 5 Giá công trình lẻ (mới). Trình nhập ghép cột theo tên nên thứ tự cột trong file không quan trọng.

## Giai đoạn

| # | Nội dung | Phụ thuộc | Trạng thái |
|---|---|---|---|
| 1 | [Mức giá thứ 5](phase-01-muc-gia-thu-5.md) | | Xong |
| 2 | [Hồ sơ sổ: đóng gói và cột hàng hóa theo sổ](phase-02-ho-so-so.md) | 1 | Xong |
| 3 | [Trình nhập Excel và file mẫu theo sổ](phase-03-nhap-excel-file-mau.md) | 1, 2 | Xong |
| 4 | [Deploy và nạp dữ liệu lên máy chủ](phase-04-deploy-nap-du-lieu.md) | 3, file đủ dữ liệu của khách | Chưa làm |

Giai đoạn 1 đến 3 làm tuần tự vì cùng sửa `books.js`, `db/index.js`, `web/src/lib/excel.js` và `Products.jsx`. Lần nâng cấp CSDL (phiên bản 6 lên 7) gộp các thay đổi của giai đoạn 1 và 2 vào một lần.

## Tiêu chí hoàn thành

- `npm test` đạt toàn bộ, có ca kiểm thử mới cho: nâng cấp CSDL 6 lên 7, nhập đúng 2 file mẫu của khách, giá theo mức 5 khi bán.
- `npm --prefix web run build` không lỗi.
- Trên máy chủ: `/api/health` trả `{"ok":true}`, có bản sao lưu CSDL trước khi deploy, tên mức giá của 2 sổ đúng như giả định, số mã hàng sau khi nạp khớp số dòng trong file của khách.

## Rủi ro

- Đổi tên mức giá của sổ đang chạy: nếu chủ sổ đã tự đổi tên trong Cài đặt thì lần nâng cấp không được ghi đè. Chỉ đổi khi tên đang đúng giá trị mặc định cũ.
- Tên Excel và KiotViet không giống hẳn nhau (KiotViet thêm kích thước, trọng lượng vào tên), nên ghép giá Excel phải bỏ phần đuôi “ - L180 x …” và đơn vị trong ngoặc rồi so tên. Mã không ghép được giữ giá KiotViet và được liệt kê để khách xem.
- Bảng giá KiotViet đã hết hạn từ 13/02/2026, có thể không còn là giá đang bán.
- 26 mã `SP0000xx` trên KiotViet là hàng tạo nhanh, nhiều mã giá vốn bằng 0; vẫn nạp nhưng đánh dấu trong danh sách để khách xem.
- Chưa có nguồn danh mục cho Vũ Gia.
- Dòng ví dụ của khách (`1AD27-DC01`, `TYC001`) sẽ được nhận là hàng thật nếu khách quên xóa; thêm vào danh sách cảnh báo dòng mẫu.

## Câu hỏi còn mở

1. Địa chỉ KiotViet của Vũ Gia là gì (hoặc Vũ Gia lấy danh mục từ đâu)?
