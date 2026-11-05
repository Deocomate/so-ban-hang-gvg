---
phase: 4
title: "Deploy và nạp dữ liệu lên máy chủ"
status: pending
dependsOn: [3]
---

# Giai đoạn 4: Deploy và nạp dữ liệu lên máy chủ

## Bối cảnh

Máy chủ và cách cập nhật ghi trong [docs/deploy-server.md](../../docs/deploy-server.md). Tài khoản SSH ở `.env.ssh` (không in ra, không đưa lên git). CSDL ở `/var/lib/so-ban-hang-gom/gomsu.db`. Máy chủ còn chạy site khác, không `yum update`.

Nguồn dữ liệu sổ Thanh Hải: 750 mã trên KiotViet `thceramics.kiotviet.vn` làm gốc ([khảo sát](../reports/khao-sat-261105-1448-kiotviet-thanh-hai.md)), bổ sung từ `mau-excel/hang-hoa-thanh-hai-2026.xlsx`. Sổ Vũ Gia chờ nguồn danh mục; chưa có thì chỉ deploy phần mã.

### Dựng file nhập Thanh Hải

1. Lấy danh mục và 4 bảng giá từ KiotViet: chỉ đọc, qua màn Thiết lập giá trên Chrome của chủ sổ (bảng 100 dòng mỗi trang, 8 trang). Lưu thành file trong thư mục tạm, không đưa lên git.
2. Tách tên KiotViet: phần trước “ - ” là tên, phần kích thước “L180 x W190 x D8” vào cột Kích thước, số cuối là kg/viên, chữ trong ngoặc là ĐVT.
3. Ghép mức giá: 1 Giá lẻ = Bảng giá chung, 2 Giá đại lý I = Đại lý MẸ, 3 Giá công trình = Công trình, 4 Giá đại lý II = Đại lý MAI, 5 Giá công trình lẻ để trống. Giá vốn = giá vốn KiotViet.
4. Ghép với file Excel theo tên đã chuẩn hóa: mã ghép được thì Giá lẻ, Giá đại lý I lấy theo Excel, đồng thời lấy định mức, số viên/hộp, đơn vị đóng gói.
5. Ghi ra file theo mẫu sổ TH mới ở giai đoạn 3, kèm sheet “Đối chiếu”: mã ghép được, mã Excel không có trên KiotViet, mã `SP0000xx` cần khách xem lại. Gửi file cho người dùng xem trước khi nạp.
6. Mã Excel không có trên KiotViet: không tự thêm, liệt kê trong sheet đối chiếu để khách quyết.

## Các bước

### Deploy

1. Sao lưu tay trước khi chép bản mới: dừng dịch vụ rồi `cp gomsu.db backups/gomsu.db.truoc-ho-so-so-<ngày>.bak` để có bản nhất quán. Khi khởi động, nâng cấp CSDL còn tự tạo thêm `gomsu.db.truoc-nang-cap-v6.bak`.
2. Build và đóng gói theo `docs/deploy-server.md`, chép lên `/tmp/so-ban-hang-app.tgz`, giải nén, `systemctl restart so-ban-hang-gom`.
3. Kiểm tra `curl https://so-ban-hang-thceramics.admirable.site/api/health`, xem `journalctl -u so-ban-hang-gom -n 100` không có lỗi nâng cấp.
4. Đăng nhập, xem Cài đặt của 2 sổ: TH có 5 tên mức giá, VG có “Giá CH” và tắt đóng gói. Khách hàng cũ giữ đúng mức giá.

### Nạp dữ liệu

1. Sao lưu CSDL lần nữa ngay trước khi nhập.
2. Kiểm tra sổ trên máy chủ đã có hàng hóa chưa (trước đây có thể đã nạp file Thanh Hải). Trùng SKU thì trình nhập chỉ cập nhật tên, giá, không đổi tồn.
3. Xóa dòng ví dụ (hoặc bỏ chọn khi trình nhập cảnh báo).
4. Nhập file TH vào sổ Gốm sứ Thanh Hải, file VG vào sổ Gốm Vũ Gia qua màn Nhập Excel; đọc hết các cảnh báo trước khi xác nhận.
5. Đặt nhóm khách và mức giá mặc định trong sổ TH: Khách lẻ mức 1, Đại lý cấp 1 mức 2, Công trình mức 3, Khách buôn mức 4.
6. Đối chiếu: số mã hàng tạo mới bằng số dòng hợp lệ trong file; tổng tồn đầu kỳ và vài mã ngẫu nhiên (giá 5 mức, định mức, quy cách) khớp file.

## Tài liệu

Cập nhật `docs/deploy-server.md` nếu cách deploy hoặc vị trí sao lưu thay đổi trong lúc làm. Ghi vào `HUONG-DAN.md` cách bật/tắt đóng gói và thêm mức giá thứ 5 nếu tài liệu đó đang mô tả màn Cài đặt.

## Rủi ro và hoàn tác

- Nâng cấp CSDL lỗi khi khởi động: dừng dịch vụ, chép lại bản sao lưu bước 1, giải nén bản cũ, khởi động lại.
- Nhập sai sổ hoặc sai dữ liệu: khôi phục bản sao lưu ngay trước khi nhập; tồn đầu kỳ đã ghi thành phiếu nên không sửa tay từng mã.
