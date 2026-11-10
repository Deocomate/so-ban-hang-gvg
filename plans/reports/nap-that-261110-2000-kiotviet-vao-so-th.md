# Nạp dữ liệu KiotViet vào sổ Thanh Hải trên bản chạy thật

Ngày 10/11/2026, 20:12. Trước đó: [phân tích file khách gửi lại](phan-tich-261110-1931-file-khach-tra-loi.md), [ghép mã](ghep-ma-261110-1457-danh-muc-moi-voi-kiotviet.md), [đối chiếu KiotViet](doi-chieu-261109-1548-kiotviet-voi-he-thong.md).

## Kết quả

Sổ "Gốm sứ Thanh Hải" trên https://so-ban-hang-thceramics.admirable.site đã có toàn bộ lịch sử KiotViet (08/2020 đến 07/11/2026) với danh mục hàng mới của khách. Kiểm tra trên bản chép của CSDL thật:

| | Bản thật | KiotViet |
|---|---|---|
| Hàng đang bán (danh mục mới) | 818, 506 mã có ảnh | |
| Nợ phải thu khách | 7.999.221.199 | 7.999.221.199 |
| Nợ phải trả NCC | 109.189.244.890 | 109.189.244.890 |
| Doanh thu thuần (trước khi nạp, trên bản chuyển đổi) | 19.717.594.434 | 19.717.594.434 |
| Tồn kho từng mã | khớp sổ kho | khớp tồn KiotViet (trừ 4 mã bù có ghi chú) |

Tên sổ, hồ sơ pháp nhân và các cài đặt khác của sổ được giữ nguyên; chỉ thêm nhóm khách. Không mang thông báo cũ.

## Theo trả lời của khách (10/11/2026)

- Danh mục: sheet "Hàng hóa" (766 mã, bản sửa sau cùng) cùng 52 mã mới từ sheet "Hàng hóa bổ sung".
- Lấy theo sheet bổ sung: "Miếng khảm gốm" ở 3DIEM34 (nhóm 3DIEM34–40 lùi mã); đổi tên 2HAI013–015 ("loại dày") và 2HAI020 "Ngói chiếu tráng men". "Mảnh lam gốm màu sẫm" bị chiếm mã 3DIEM40 nên cấp mã 3DIEM43.
- Không thêm lại 6LC011 "Lan can bầu 40 vàng" và 9LV005 "Kỳ lân". Mã 6LC011 giờ là "Lan can giọt lệ 57 xanh đồng".
- Bảng giá "Giá Bái Đính": 9 mặt hàng đúng giá trong tin nhắn, chỉ áp dụng nhóm khách "Bái Đính" (khách KH000087); bán cho khách này thì màn bán hàng tự chọn bảng giá, hàng khác vẫn giá thường.
- Ghép mã: 462/750 mã KiotViet chuyển sang mã mới (theo tên trùng và 98 câu trả lời ✔/✘). Hai câu "Sai" để trống mã nhưng khách đã thêm đúng hàng trùng tên ở sheet bổ sung (1AD27-GBB12 → 1AD27-GAK12, 1AD15-GBB02 → 1AD15-GBB02) được ghép vào hàng đó. 288 mã còn lại giữ mã cũ, ngừng kinh doanh.

## Triển khai

- Mã nguồn: commit `0aee87a` (phí trả hàng, loại khách), `f006ec7` (ảnh đại diện thu nhỏ), `6d80cf7` (chuyển dữ liệu KiotViet, `npm run import-book`).
- Sao lưu trước khi làm: `/var/lib/so-ban-hang-gom/backups/truoc-nap-kiotviet-<thời điểm>/` (trước khi cập nhật mã) và `/var/lib/so-ban-hang-gom/gomsu.db.truoc-nap-TH-20261110131256.bak` (ngay trước khi nạp).
- Hoàn tác: dừng dịch vụ, chép tệp `.bak` đè `gomsu.db` (xóa `gomsu.db-wal`, `gomsu.db-shm`), bật lại dịch vụ.

## Còn mở

1. Ảnh 5GBT001–003 (link Google Drive chưa chia sẻ công khai).
2. Giá vốn trong file chỉ áp cho mã chưa có lịch sử nhập; mã có lịch sử dùng giá vốn bình quân thực tế.
3. Mã 5GTG021 (ghép từ 5GH022), SP000014, SP000015, 1AD43-XD02 có phiếu bù tồn nhỏ khi chuyển.
