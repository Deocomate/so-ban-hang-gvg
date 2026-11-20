# Đồng bộ hóa đơn, đặt hàng KiotViet sang sổ Thanh Hải (20/11/2026)

Trước đó: [nạp bổ sung 12/11](kiem-tra-261112-1038-hoa-don-kiotviet-chua-sang.md).

## Kết quả

Sổ "Gốm sứ Thanh Hải" trên bản chạy thật đã có các hóa đơn và đặt hàng KiotViet lập hoặc sửa từ 12/11/2026 11:00 đến 20/11/2026 09:41. Nạp lúc 20/11/2026 10:28. Công nợ của 10 khách có phát sinh khớp KiotViet. Riêng KH000659 lệch đúng bằng các phiếu thu đã lập trên sổ mới. KH000670 được giữ nguyên vì có xung đột (xem mục cuối).

| Loại | Đã nạp |
|---|---|
| Hóa đơn còn hiệu lực | HD001233.03, HD001237.02, HD001243, HD001244, HD001245.03, HD001247, HD001248.01, HD001249.01, HD001250.01, HD001251, HD001252, HD001253 |
| Hóa đơn từ đặt hàng | HD001244 giao trên DH000069, HD001251 giao trên DH000064. Tiền cọc của đơn được trừ vào hóa đơn, nên còn nợ đúng như KiotViet. |
| Hóa đơn KiotViet đã sửa/hủy | Đã nạp trước đó, nay hủy theo: HD001233.01, HD001237.01. Lập và hủy trong kỳ, ghi ở trạng thái hủy để tra lịch sử: HD001233.02, HD001245, HD001245.01, HD001245.02, HD001246, HD001248, HD001249, HD001250 |
| Đặt hàng mới (phiếu tạm) | DH000070 (KH000661), DH000071 (KH000676), DH000069 (đã thành HD001244) |
| Khách mới | KH000671 đến KH000678 |
| Hàng mới | SP000029, SP000030, SP000031 (ngói/diềm 27 xanh đồng khoan lỗ), SP000032 đến SP000035 (lọ hoa). Giữ mã KiotViet vì danh mục mới chưa có mặt hàng trùng tên. SP000028 vẫn ghép vào 1AD80-DC04 như lần trước. |
| Phiếu thu | TTDH000064-1, TTDH000069, TTDH000070, TTDH000071, TTHD001245, TTHD001247, TTHD001249, TTHD001251, TTHD001252, TTHD001253 |
| Điều chỉnh công nợ | CB000147 (KH000661, −19.950.000) |

HD001253 không chọn khách trên KiotViet nên ghi cho Khách lẻ.

Sao lưu ngay trước khi ghi: `/var/lib/so-ban-hang-gom/gomsu.db.truoc-bo-sung-TH-20261120032815471.bak`. Hoàn tác: dừng dịch vụ, chép tệp này đè `gomsu.db` (xóa `gomsu.db-wal`, `gomsu.db-shm`), bật lại dịch vụ.

## Hệ thống mới đã được dùng song song

Bản chạy thật có thao tác của tài khoản admin@gomvugia.vn chiều 12/11 (16:25 đến 17:28). Không có đơn bán nào lập trên sổ mới. Các thao tác đó gồm:

- 8 phiếu thu PT01246 đến PT01253. Trong đó PT01246 chỉ 1.000 đồng (KH000518), có vẻ là thử.
- Giao hàng cả ba phiếu DH000068, DH000068.01, DH000068.01.01 của KH000670 (năm phiếu giao GH01253 đến GH01257).
- Chi phí PC00031 đến PC00044.

Lần nạp này không sửa hay xóa thao tác nào trong số đó, với hai cách xử lý sau:
- KH000659: KiotViet sửa HD001237.01 (12.712.000) thành HD001237.02 (10.120.000). Hai phiếu PT01247 và PT01248 (cộng 12.712.000) đã thu trên sổ mới cho HD001237.01 được chuyển sang HD001237.02, giống cách KiotViet chuyển tiền khi sửa hóa đơn. Phần dư 2.592.000 là tiền khách trả trước. KiotViet không có hai phiếu thu này nên vẫn ghi khách nợ 10.120.000.
- Các phiếu thu PT01249 đến PT01252 trừ vào hóa đơn KiotViet cũ (HD001234.01, HD001210.01.01, HD001242, HD001241). Trên KiotViet các hóa đơn này vẫn ghi chưa thu. Hai bên lệch nhau từ 12/11, nhưng lần nạp này không động đến.

## Công cụ

`server/scripts/kiotviet-add-docs.js` được mở rộng. Ngoài các loại cũ, công cụ giờ nhận thêm:
- hàng mới;
- hóa đơn lập từ đặt hàng: giao trên đơn đặt, sửa dòng hàng theo bản cuối nếu đơn còn là phiếu tạm, trừ tiền cọc;
- hóa đơn và đặt hàng đã hủy trên KiotViet;
- phiếu thu mã "TT…" không còn trong sổ công nợ KiotViet: hủy theo;
- khách lẻ.

Khi đối chiếu công nợ, công cụ trừ các phiếu thu lập trên sổ mới. Đặt hàng KiotViet đã hủy nhưng trên sổ mới đã giao thì công cụ không hủy, mà báo xung đột và để nguyên khách đó.

Kiểm tra trước khi ghi:
- chạy thử trên bản chép CSDL thật;
- ghi thật trên bản chép, chạy lại lần hai: thêm 0, bỏ qua 72;
- toàn bộ `npm test` của server đạt;
- chạy thử trên máy chủ (dịch vụ đã dừng), rồi mới ghi.

Tệp dữ liệu: `du-lieu-kiotviet/goc/kiotviet-thceramics-phat-sinh-20261120.json` (gitignore, có thông tin khách). Tệp này gồm toàn bộ sổ công nợ của 12 khách có thay đổi.

## Lần sau

Lấy phần phát sinh từ mốc 20/11/2026 09:45, gồm:
- hóa đơn, đặt hàng, sổ quỹ (gồm cả bản đã sửa, dựa vào `ModifiedDate`);
- khách mới, hàng mới;
- sổ công nợ của mọi khách có `ModifiedDate` sau mốc.

## Câu hỏi còn mở

1. KH000670 (A Thắng): KiotViet đã hủy DH000068 và DH000068.01, chỉ còn DH000068.01.01 (12.048.000, phiếu tạm, cọc 2.000.000), và khách đang trả trước 2.000.000. Trên sổ mới, cả ba phiếu đều đã giao, có thêm PT01253 2.000.000 "đặt cọc đơn DH000068.01", và KiotViet đã xóa hai phiếu cọc TTDH000068 (5.000.000), TTDH000068.01 (2.000.000). Thao tác giao trên sổ mới là thật hay chỉ là thử? Nếu là thử thì nên hủy GH01253 đến GH01257 và hai đơn DH000068, DH000068.01, rồi xử lý hai phiếu cọc.
2. PT01246 đến PT01252 là tiền thật đã thu, hay là thử? Nếu thật thì nên ghi các phiếu đó trên KiotViet để hai bên khớp; nếu là thử thì nên hủy trên sổ mới.
3. Khách còn lập chứng từ trên KiotViet đến ngày nào? Dùng song song mà nhập ở cả hai nơi sẽ còn lệch. Nên chốt một ngày ngừng KiotViet.
4. SP000029 đến SP000035 có nên cấp mã theo danh mục mới không? Hiện đang giữ mã KiotViet.
