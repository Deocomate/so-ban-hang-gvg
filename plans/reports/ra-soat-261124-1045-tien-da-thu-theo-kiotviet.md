# Sổ TH: tiền đã thu của hóa đơn và đơn đặt đã khớp KiotViet (24/11/2026)

**Kết quả:** đã sửa trên sổ thật lúc 10:43 ngày 24/11. 195 trên 208 hóa đơn năm 2026 khớp KiotViet về trạng thái, giá trị và số đã thu. 13 hóa đơn còn khác đều có lý do ở mục "Còn khác KiotViet". Công nợ của 45 khách được sửa và đều khớp KiotViet, trừ A Thắng (KH000670) theo xác nhận của chủ cửa hàng.

- **Sao lưu trước khi sửa:** `/var/lib/so-ban-hang-gom/backups/20261124-104320-truoc-sua-theo-kiotviet-2411/`. Kết quả chạy nằm trong `ket-qua-sua.txt` ở cùng thư mục.
- **Danh sách từng phiếu và từng khách:** `du-lieu-kiotviet/ket-qua-sua-theo-kiotviet-261124.txt`. Tệp này không đưa lên git vì có tên khách.
- **Dữ liệu KiotViet dùng để đối chiếu:** đọc ngày 24/11, lưu ở `du-lieu-kiotviet/goc/kiotviet-2026-20261124.json`. Gồm 208 hóa đơn, 44 đơn đặt, phiếu thu chi năm 2026 và sổ công nợ của 99 khách.

## Nguyên nhân

Chủ cửa hàng báo hóa đơn của A Thắng (đơn DH000068.01.01) hiện thêm phiếu PT01369 1.048.000, trong khi khách mới trả 2.000.000 tiền cọc.

- Ngày 12/11, 20/11 và 22–23/11, chủ cửa hàng lập phiếu thu ghi bù để xóa nợ hiển thị sai.
- Lần sửa ngày 23/11 chỉ gỡ phần ghi bù làm khách thành "trả trước". Phần ghi bù vừa đúng bằng số nợ thì vẫn giữ. Vì vậy 45 hóa đơn năm 2026 hiện đã thu nhiều hơn KiotViet.
- Sổ mới còn giữ phiếu cọc của hai đơn đặt KiotViet đã hủy (TTDH000068 5.000.000 và TTDH000068.01 2.000.000). KiotViet đã xóa hai phiếu này.

## Đã sửa

1. **Gỡ phiếu ghi bù trả cho hóa đơn năm 2026.**
   - Hủy cả phiếu hoặc giảm số tiền; lý do ghi trên từng phiếu, lịch sử đơn ghi phần đã gỡ.
   - Quỹ giảm 505.346.300 đ.
2. **Giữ phần ghi bù trả nợ cũ trước 2026:** nợ đầu kỳ DK… của khách đã xóa hoặc khách lẻ KiotViet, và hóa đơn năm 2025 còn trên sổ. Với khách còn hóa đơn 2025, phần giữ lại chỉ tới mức công nợ bằng nợ KiotViet hiện tại (KH000499, KH000550).
3. **Hủy hai phiếu cọc** của đơn đặt KiotViet đã hủy (TTDH000068, TTDH000068.01).
4. **Gắn lại phiếu KiotViet vào đúng hóa đơn KiotViet ghi:**
   - TTHD001217.04 vào HD001217.04: chuyển từ phiếu điều chỉnh nợ CB sang.
   - TTHD001197 vào HD001197.
   - Cọc TTDH000040 vào HD001142.01.
5. **KH000657:** hủy hai hóa đơn chủ cửa hàng lập lại ngày 22/11 và trả về mã cũ DH01854, DH01855. KiotViet đã có hai hóa đơn tương ứng là HD001229.01 và HD001229.01.01. Khách còn nợ 254.102.000 như KiotViet.
6. **Ba hóa đơn KiotViet lập sáng 23/11, mã HD theo KiotViet:**
   - HD001254: hóa đơn của DH000068.01.01, trước mang mã HD001256, trừ cọc 2.000.000.
   - HD001255: giao đơn DH000067 (KH000668), 15.860.000, trừ cọc 5.000.000.
   - HD001256: khách mới KH000679, 24.000.000 (47 gạch 5GTG034 × 500.000, vận chuyển 500.000), chưa thu.
   - Bộ đếm HD ở 1256.

## Còn khác KiotViet (có lý do)

| Hóa đơn | Lý do |
|---|---|
| HD001254 (KH000670) | Theo chủ cửa hàng, khách mới trả 2.000.000, nên sổ ghi còn nợ 10.048.000. KiotViet ghi đã thu đủ vì có phiếu TTHD001254 10.048.000 lập lúc 10:59 ngày 23/11. Phiếu này có thể cũng là ghi bù trên KiotViet. |
| HD001250.01, HD001249.01, HD001247, HD001239, HD001238, HD001235.01, HD001226, HD001216 | Chủ cửa hàng giữ hủy (quyết 23/11, nhắc lại 24/11). Tiền khách đã trả cho các chứng từ này vẫn nằm trên sổ thành tiền trả trước. |
| HD001188.01 | KiotViet ghi thu 8.000.000 trên hóa đơn 7.000.000. Sổ tính 7.000.000 cho hóa đơn, phần thừa là tiền trả trước. |
| HD001166, HD001162.01.02, HD001158 | Có hàng khách trả (TH000030, TH000031, TH000032). Sổ trừ hàng trả vào giá trị hóa đơn, KiotViet giữ giá trị gốc. |

## Câu hỏi còn mở

1. Phiếu TTHD001254 10.048.000 trên KiotViet có phải tiền thật không? Nếu là tiền thật thì A Thắng đã trả đủ và cần lập lại phiếu trên sổ mới.
