# Hóa đơn KiotViet chưa sang sổ Thanh Hải: kiểm tra và nạp bổ sung

Ngày 12/11/2026.

## Kết quả

Sổ "Gốm sứ Thanh Hải" trên bản chạy thật đã có đủ chứng từ KiotViet tính đến 12/11/2026 11:00. Phần khách báo thiếu là chứng từ lập trên KiotViet sau lần xuất ngày 09/11, vì lần nạp ngày 10/11 dùng bản xuất đó. Lịch sử trước 09/11 vốn đã sang đủ.

Khách vẫn đang dùng KiotViet song song: sáng 12/11 còn lập thêm chứng từ trong lúc kiểm tra. Mỗi lần khách lập thêm, cần nạp bổ sung lại (xem "Lần sau").

## Đối chiếu trước khi nạp

- KiotViet, so từng hóa đơn với bản xuất 09/11 (mã, trạng thái, tổng tiền, đã trả, giảm giá): 1.689 hóa đơn cũ không đổi. Đặt hàng cũ không đổi. Không có trả hàng, nhập hàng, kiểm kho hay nhà cung cấp mới.
- Dò sổ công nợ từng khách (647) và từng NCC (32) để tìm phiếu điều chỉnh công nợ không có trong danh sách chứng từ: có 2 phiếu mới.
- CSDL thật trước khi nạp: đủ 1.689 mã hóa đơn, 102 đặt hàng, 29 phiếu trả còn hiệu lực và 1.272 phiếu quỹ của bản xuất. Từ sau lần nạp chưa có chứng từ nào được lập trên sổ mới.

## Đã nạp vào bản thật (12/11/2026 11:12)

| Mã | Ngày | Nội dung |
|---|---|---|
| CB000145 | 10/11 | Điều chỉnh công nợ KH000662 Anh Hùng −11.450.000 |
| HD001234.01 | 10/11 | Hóa đơn KH000662, 7.750.000, chưa trả |
| KH000670 | 12/11 | Khách mới A Thắng |
| DH000068, DH000068.01, DH000068.01.01 | 12/11 | Ba phiếu đặt hàng tạm của KH000670: 11.632.000, 11.632.000, 12.048.000 |
| TTDH000068, TTDH000068.01, TTDH000068.01.01 | 12/11 | Thu cọc KH000670: 5.000.000, 2.000.000, 2.000.000 |
| CB000146 | 12/11 | Điều chỉnh công nợ KH000659 −82.700.000 |
| HD001237.01 | 12/11 | Hóa đơn KH000659, 12.712.000 (gồm 1.800.000 tiền vận chuyển), chưa trả |

Công nợ sau khi nạp khớp KiotViet: KH000662 nợ 7.750.000, KH000659 nợ 12.712.000, KH000670 trả trước 9.000.000.

Cách ghi giữ đúng như lần nạp trước:
- Hàng ghép sang mã mới theo `du-lieu-kiotviet/nap/ghep-ma-hang.json`. Mã SP000028 "Diềm âm 80 đỏ cờ sen cành" tạo trên KiotViet ngày 12/11 được ghép vào 1AD80-DC04, vì trùng tên.
- Tiền cọc của phiếu đặt tạm ghi là khách trả trước, chưa gắn vào đơn, giống DH000064, DH000066 và DH000067.
- Ba phiếu DH000068 đều đang là phiếu tạm trên KiotViet nên đều được nạp.

Sao lưu ngay trước khi ghi: `/var/lib/so-ban-hang-gom/gomsu.db.truoc-bo-sung-TH-20261112041248955.bak`. Hoàn tác: dừng dịch vụ, chép tệp này đè `gomsu.db` (xóa `gomsu.db-wal`, `gomsu.db-shm`), bật lại dịch vụ. Dịch vụ đã chạy lại, `/api/health` trả `{"ok":true}`.

## Công cụ

`server/scripts/kiotviet-add-docs.js` (`npm run add-kiotviet-docs`):
- Dựng chứng từ bằng hàm nghiệp vụ của sổ, giữ mã và giờ tạo KiotViet, chạy trong một giao dịch.
- Mã đã có thì bỏ qua: lần chạy lại trên bản thật báo "đã thêm 0, bỏ qua 11".
- Gặp loại chứng từ chưa hỗ trợ, hoặc công nợ lệch `expectedDebts`, thì dừng mà không ghi gì.
- Đã thử trước trên CSDL dựng lại từ đúng tệp đã nạp ngày 10/11. Toàn bộ `npm test` của server đạt.

Tệp phát sinh: `du-lieu-kiotviet/goc/kiotviet-thceramics-phat-sinh-20261112.json` (gitignore, có thông tin khách). Cách chạy ghi ở `docs/deploy-server.md`.

## Lần sau

Lấy lại phần phát sinh trên KiotViet từ mốc 12/11/2026 11:00. Cần lấy: hóa đơn, đặt hàng, sổ quỹ, khách mới, hàng mới, và sổ công nợ từng khách để bắt phiếu CB. Sau đó chạy lại công cụ.

## Câu hỏi còn mở

1. Khách còn lập chứng từ trên KiotViet đến ngày nào? Nên chốt một ngày ngừng, rồi nạp bổ sung lần cuối.
2. Ba phiếu DH000068 của A Thắng là ba đơn thật hay một đơn bị sửa hai lần? Nếu là một đơn thì nên hủy hai phiếu thừa trên cả hai hệ thống.
3. Các cặp "phiếu điều chỉnh CB trừ nợ cũ rồi lập hóa đơn .01" (HD001234 sang HD001234.01, HD001237 sang HD001237.01) là cách nhân viên sửa hóa đơn trên KiotViet. Trên sổ mới, việc sửa nên làm bằng trả hàng hoặc hủy phiếu cho rõ.
