# Rà soát chức năng lõi theo KiotViet (đợt 1: bán hàng, đặt hàng, thu tiền, công nợ khách)

Ngày 23/11/2026. Đối chiếu bản sao CSDL thật (sao lưu `20261123-153050-cong-no-hd`, sau khi deploy `2b7c41f`) với dữ liệu xuất từ KiotViet (`du-lieu-kiotviet/goc/kiotviet-thceramics-day-du.json` ngày 09/11 và `…-phat-sinh-20261120.json`).

## Đã làm cho giống KiotViet trong hôm nay

| Việc | Commit | Kiểm tra |
|---|---|---|
| Lịch sử bán của khách chỉ hiện hóa đơn HD và phiếu trả, không hiện đơn đặt DH | `388611c` | Bản thử và bản thật |
| Mỗi hóa đơn HD lập từ đơn đặt có số đã thu / còn nợ riêng; phiếu thu trừ thẳng vào hóa đơn HD; danh sách nợ khi thu tiền là mã HD | `2b7c41f` | Bộ kiểm thử mới 15/15, toàn bộ kiểm thử đạt; trên CSDL thật tổng nợ các HD khớp nợ đơn đặt ở mọi đơn (0 đơn lệch) |

## Phát hiện

### 1. Tiền cọc và tiền của hóa đơn sửa lại không chuyển sang hóa đơn mới (lỗi, cần sửa dữ liệu)

KiotViet chuyển tiền giữa chứng từ bằng cặp phiếu âm/dương:
- Cọc đơn đặt sang hóa đơn: ví dụ DH000056 có `TTDH000056 +47.000.000` (17/08), rồi `TTTUHD001212 −47.000.000` và `+47.000.000` (29/08).
- Hóa đơn bị sửa: KiotViet hủy hóa đơn cũ, lập bản `.01`, `.02` và chuyển tiền đã thu sang bản mới.

Khi nạp, sổ mới giữ phiếu thu gốc (`TTDH…`, `TTHD…`) nhưng không gắn vào đơn hoặc hóa đơn nhận tiền. Kết quả:
- 57 phiếu thu khách với tổng 1.122.100.900 đ chưa trừ vào đơn nào. Phần lớn là `TTDH…` và tiền của hóa đơn đã hủy.
- Khoảng 50 khách hiện "trả trước" mà KiotViet không có. Ví dụ một khách: sổ mới trả trước 442.040.000, KiotViet nợ 59.500.000.
- Các hóa đơn lập từ những đơn này hiện còn nợ, trong khi KiotViet đã trừ cọc. Chủ cửa hàng đã thu lại đủ tiền trên sổ mới cho một số đơn. Ví dụ DH000056 có `PT01281` 87.499.000 ngày 22/11, nên khách đó đang hiện trả trước 47.000.000. Cần chủ cửa hàng xác nhận thực tế khách đã trả bao nhiêu.

Hướng sửa, chờ duyệt:
- Gắn lại các phiếu thu chưa trừ vào đúng hóa đơn hoặc đơn theo cặp phiếu chuyển của KiotViet.
- Làm trên bản sao trước, sao lưu CSDL rồi mới ghi.
- Liệt kê từng khách trước và sau để chủ cửa hàng xem.
- Sửa thêm công cụ `add-kiotviet-docs` để các lần nạp sau không lặp lại lỗi này.

### 2. Công nợ cũ trước 2026 đã bị bỏ theo thao tác "Ngắt dữ liệu" (không phải lỗi, cần xác nhận)

Ngày 18/11/2026, tài khoản Chủ cửa hàng đã ngắt dữ liệu từ 01/08/2020 đến 31/12/2025 (`NGAT00001`). Lần ngắt chọn **không giữ** công nợ khách và nhà cung cấp, và bỏ:
- 1.618 đơn bán;
- 972 đơn nhập;
- 1.172 phiếu thu chi.

Vì vậy 267 khách KiotViet còn nợ (ví dụ một khách 967.868.000) giờ hiện 0 trên sổ mới. Tổng nợ khách trên KiotViet là 8.833.968.139 đ, trên sổ mới là 471.402.000 đ. Bản ngắt vẫn tải về xem được.

Nếu muốn giữ nợ cũ, có thể nạp lại thành "nợ đầu kỳ" từng khách theo số KiotViet.

### 3. Hai phiếu giao mang mã GH thay vì HD

`GH01253` và `GH01254` thuộc đơn DH000068.01.01, lập ngày 12/11, trước khi đổi sang đánh mã HD cho hóa đơn lập từ đơn đặt. Có thể đổi mã sang HD nếu chủ cửa hàng muốn.

### 4. Sao lưu trước deploy làm đầy ổ đĩa (đã sửa quy trình)

Lệnh `cp gomsu.db*` chép luôn 14 tệp `gomsu.db.truoc-….bak` nằm cạnh CSDL, nên mỗi bản sao lưu nặng khoảng 350 MB thay vì khoảng 40 MB. Đây là lý do ổ 25 GB đầy sáng nay. `docs/deploy-server.md` đã ghi chỉ chép `gomsu.db`, `-wal` và `-shm`.

## Phạm vi còn lại của đợt rà soát

Mỗi phân hệ sẽ được so quy tắc nghiệp vụ và số liệu thật với KiotViet:

| Phân hệ | Nội dung đối chiếu |
|---|---|
| Hóa đơn bán ngay | Hủy rồi lập `.01`, thu tiền, trả hàng, công nợ từng hóa đơn |
| Trả hàng khách | Phiếu trả gắn hóa đơn, hoàn tiền, phí trả |
| Nhập hàng và trả hàng nhập | Mã PN/TN, công nợ NCC theo phiếu nhập |
| Sổ quỹ | Phiếu thu chi, mã chứng từ, số dư quỹ |
| Tồn kho và giá vốn | Tồn từng mã, giá vốn bình quân |
| Báo cáo cuối ngày, doanh thu | Doanh thu thuần theo ngày |

## Câu hỏi cho chủ cửa hàng

1. Có sửa dữ liệu theo mục 1 không: gắn lại phiếu cọc và phiếu của hóa đơn sửa lại theo KiotViet?
2. Với các đơn đã thu lại đủ trên sổ mới (như DH000056), khách thực trả bao nhiêu? Phiếu thu mới là tiền thật hay ghi bù cho đủ?
3. Có muốn giữ công nợ cũ trước 2026 thành nợ đầu kỳ không (mục 2)?

## Đợt 2 (23/11, 15:40): gắn lại tiền theo KiotViet, phát hiện phiếu thu lập thêm ngày 22/11

### Đã tìm ra nguyên nhân
- **Lúc nạp:** phiếu thu nào không chỉ ra chứng từ thì được trừ vào đơn cũ nhất của khách, thường là đơn năm 2025. KiotViet thì ghi rõ phiếu nào trả hóa đơn nào.
- **Ngắt dữ liệu ngày 18/11:** xóa các đơn trước 2026, nên những phiếu đó bị bỏ trống. Các hóa đơn năm 2026 vì thế hiện còn nợ, dù trên KiotViet khách đã trả.
- **Kiểm chứng:** với 641/655 khách, phần dữ liệu từ KiotViet trên sổ mới khớp đúng số nợ KiotViet sau khi trừ phần nợ cũ bị bỏ lúc ngắt. Chứng từ KiotViet trên sổ mới vẫn đủ và đúng; chỉ cách gắn tiền vào hóa đơn bị lệch.

### Phiếu thu lập trên sổ mới ngày 22–23/11
Ngày 22/11, trong khoảng 13:00–16:00, tài khoản "Chủ cửa hàng" ghi 110 phiếu thu (PT01276–PT01385), tổng 2.924.827.440 đ, tất cả vào quỹ **Tiền mặt**.
- Phần lớn mỗi phiếu thu đúng bằng toàn bộ giá trị một hóa đơn còn hiện nợ, kể cả hóa đơn đã có tiền cọc hoặc đã được trả trên KiotViet. Ví dụ PT01281 87.499.000 cho HD001212, trong khi KiotViet đã trừ cọc 47.000.000.
- Sau đợt này, 47 khách hiện "trả trước" tổng 2.065.467.050 đ.
- Nếu đây là phiếu ghi bù cho hết nợ chứ không phải tiền thật, thì quỹ tiền mặt trên sổ mới đang cao hơn thực tế tới khoảng 2 tỷ.


Danh sách từng khách không đưa lên git vì có tên khách hàng; danh sách nằm ở thư mục tạm của phiên làm việc.

### Công cụ sửa (đã chạy thử trên bản sao, chưa ghi vào bản thật)
- **Gắn lại phiếu thu KiotViet theo đúng liên kết của KiotViet:** 873 liên kết, gồm phiếu ghi trên hóa đơn, tiền cọc chuyển từ đơn đặt sang hóa đơn, và tiền cọc còn nằm trên đơn đặt.
- **Phiếu lập trên sổ mới** giữ chứng từ cũ và xếp sau phần KiotViet; phần không còn chỗ trở thành tiền trả trước.
- **Kết quả chạy thử:** công nợ của mọi khách không đổi, không đơn nào thu quá giá trị.
- **Chưa gắn được** vì chứng từ đã bị hủy trên sổ mới: HD001239 (DH000061), HD001238 (DH000065), HD001216 (DH000054), HD001226, HD001235.01, HD001249.01, HD001247. KiotViet ghi các chứng từ này là hoàn thành, còn sổ mới đã hủy ngày 22/11.

### Cần chủ cửa hàng quyết định
1. 110 phiếu thu ngày 22–23/11 là tiền khách thực trả hôm đó, hay ghi bù để xóa nợ trên màn hình?
2. Các đơn KiotViet hoàn thành mà sổ mới đã hủy ngày 22/11 (DH000061, DH000065, DH000054…) có cần khôi phục không?

## Đợt 3 (23/11, 15:57): đã sửa trên sổ thật

Chủ cửa hàng xác nhận các phiếu thu ngày 22–23/11 là ghi bù để xóa nợ hiển thị sai, không phải tiền mới.

- **Sao lưu trước khi sửa:** `/var/lib/so-ban-hang-gom/backups/20261123-155645-truoc-gan-lai-tien-kiotviet/`. Kết quả chạy nằm trong `ket-qua-sua.txt` ở cùng thư mục.
- **Gắn lại tiền theo KiotViet:** phiếu thu KiotViet được gắn lại vào đúng hóa đơn hoặc đơn đặt theo 873 liên kết của KiotViet. Phần tiền cọc chuyển sang hóa đơn được ghi là tiền cọc đã trừ.
- **Gỡ phần trùng:** với mỗi khách, chỉ gỡ phần phiếu ghi bù làm khách thành "trả trước" ảo. Phần gỡ không vượt quá tổng phiếu ghi bù của khách, nên không khách nào thành nợ thêm.
  - Kết quả: gỡ 1.743.979.350 đ trên 78 phiếu. 64 phiếu hủy hẳn, 14 phiếu giảm số tiền, và lý do được ghi vào từng phiếu.
  - Quỹ Tiền mặt giảm đúng 1.743.979.350 đ.
- **Kết quả:**
  - 43 khách được sửa công nợ.
  - Số hóa đơn có tiền đã thu khớp KiotViet tăng từ 44 lên 93, trên 146 hóa đơn so được.
  - Không đơn nào thu quá giá trị.
  - Công nợ các khách khác không đổi.

### Còn mở
1. Đã xử lý ngày 23/11, 16:03: chủ cửa hàng xác nhận các phiếu thu ngày 12/11 và 20/11 cũng là ghi bù. Đã gỡ thêm 193.340.500 đ trên 8 phiếu: 5 phiếu hủy hẳn, 3 phiếu giảm số tiền. Sao lưu trước khi sửa: `backups/20261123-160325-truoc-go-ghi-bu-12-20-11/`. Không còn khách nào hiện trả trước ảo; khách còn trả trước thì khớp số trả trước trên KiotViet.
2. **Khách KiotViet còn nợ nhưng sổ mới về 0.** Một số khách KiotViet ghi còn nợ (năm 2026), nhưng sau khi sửa sổ mới về 0, vì phiếu ghi bù được giữ đúng bằng phần nợ đó. Nếu thực tế khách chưa trả phần này, cần hủy tiếp phần ghi bù tương ứng.
3. **53 hóa đơn còn khác số đã thu trên KiotViet.** Phần lớn là hóa đơn KiotViet ghi chưa thu (theo bản xuất 09/11) mà sổ mới đã thu bằng phiếu ghi bù.
4. Đã quyết (23/11): chủ cửa hàng giữ nguyên các đơn đã hủy ngày 22/11, gồm DH000061, DH000065, DH000054, HD001226, HD001235.01, HD001249.01, HD001247; không khôi phục.
5. Đã sửa `add-kiotviet-docs` (commit `71b7e9a`): tiền gắn theo chứng từ KiotViet ghi, tiền cọc chuyển theo cặp TTTU, phiếu trả nợ chung để riêng. Chạy thử lại lần nạp 20/11 trên bản sao trước lần nạp đó: mọi hóa đơn và công nợ khớp KiotViet. Bản trên máy chủ được cập nhật ở lần deploy tới.

## Đợt 4 (23/11, 16:20): rà các phân hệ còn lại

So bản sao sổ thật sau khi sửa với dữ liệu xuất KiotViet (09/11, 12/11, 20/11), tính từ 01/01/2026, tức sau mốc ngắt dữ liệu.

| Phân hệ | Kết quả |
|---|---|
| Trả hàng khách 2026 | 3/3 phiếu khớp mã và giá trị |
| Nhập hàng 2026 | 72/72 phiếu khớp mã, trạng thái, giá trị đã nhận; không có trả hàng nhập năm 2026 |
| Công nợ nhà cung cấp | 32/32 khớp KiotViet sau khi trừ nợ cũ đã ngắt. Riêng NCC099 có thêm phiếu nhập PN01048 160.000 đ lập trên sổ mới ngày 20/11 |
| Sổ quỹ 2026 | 97/97 phiếu thu chi KiotViet có trên sổ, đúng số tiền, không phiếu nào bị hủy |
| Hóa đơn 2026 | 205 hóa đơn. Lệch chỉ ở các hóa đơn chủ cửa hàng đã hủy trên sổ mới và hai đơn lập trên sổ mới (DH01854, DH01855) |
| Doanh thu từng tháng 2026 | Tháng 2–5, 7, 8 khớp tuyệt đối. Tháng 6 chênh 497.200 đ là phí trả hàng của TH000030. Tháng 9–11 chênh đúng bằng các đơn chủ cửa hàng hủy hoặc tự lập trên sổ mới |
| Tồn kho | Không thấy sai ở tồn hiện tại. Tồn tính lùi về ngày 09/11 lệch ở 21 mã, đều giải thích được (xem dưới) |

### Khác cách làm với KiotViet (chưa sửa, cần quyết)

1. Đã sửa (23/11, commit `4857a72`, deploy 16:22). Hủy phiếu giao (hóa đơn), phiếu nhập hoặc phiếu trả hàng nhập giờ bỏ hẳn các dòng sổ kho của chứng từ, rồi tính lại giá vốn từ ngày chứng từ, như KiotViet. Lệnh `scripts/drop-cancelled-stock-moves.js` đã dọn 13 chứng từ hủy trước đó (124 dòng sổ kho), tồn hiện tại không đổi. Sao lưu trước khi dọn: `backups/20261123-162211-truoc-don-so-kho-huy/`. Sau khi dọn, tồn ngày 09/11 chỉ còn lệch KiotViet ở các mã của hóa đơn chủ cửa hàng giữ hủy, các phiếu lập lùi ngày trên sổ mới và các mã được ghép.
2. Đã sửa (23/11, commit `7a3f8e7`, deploy 16:26). Hàng khách trả trừ doanh thu theo đủ giá trị hàng trả, phí trả hàng ghi riêng là thu nhập khác và cộng vào lợi nhuận, như KiotViet. Doanh thu tháng 6 giờ khớp KiotViet (392.644.000 đ). Công nợ khách không đổi.

### Đã quyết
- Giữ hủy (chủ cửa hàng xác nhận 23/11): **HD001250.01**, 302.095.440 đ, khách KH000677: công cụ nạp nạp ngày 20/11, rồi tài khoản Chủ cửa hàng hủy lúc 17:13 cùng ngày. KiotViet ghi hoàn thành, và khách đó trên KiotViet còn nợ đúng 302.095.440 đ.

## Đợt 5 (23/11, 16:32): mã DH / GH còn lẫn trong lịch sử bán

- **Nguyên nhân:**
  - Ba hóa đơn bán ngay lập trên sổ mới trước khi đổi cách đánh mã vẫn mang mã DH: DH01854, DH01855 (sổ TH) và DH00001 (sổ VG).
  - Phiếu giao của hóa đơn bán ngay vẫn được sinh mã GH riêng. Vì vậy sổ "Nợ cần thu" hiện GH thay vì HD.
- **Sửa code (commit `b8f6514`):** hóa đơn bán ngay chỉ có một mã HD như KiotViet. Phiếu giao mang luôn mã hóa đơn; nếu giao thêm đợt sau thì thêm hậu tố -2, -3.
- **Sửa dữ liệu (sao lưu `backups/20261123-163245-truoc-doi-ma-hd/`):**
  - Sổ TH: DH01854 → HD001254, DH01855 → HD001255; phiếu giao GH01253 và GH01254 của DH000068.01.01 → HD001256 và HD001257.
  - Sổ VG: DH00001 → HD000001.
  - Mã trên thẻ kho đổi theo. Lịch sử đơn có ghi mã cũ để tra lại.

## Đợt 6 (23/11, 16:43): đơn DH000068.01.01 bị tách làm hai hóa đơn

- **Nguyên nhân:** ngày 12/11, đơn được bấm giao hai lần trên sổ mới: 16:49 giao 11.166.000 đ, 17:04 giao nốt 882.000 đ. Mỗi lần giao sinh một hóa đơn HD (HD001256, HD001257). Bên KiotViet đơn chỉ xử lý một lần. Đây là đơn duy nhất của sổ có nhiều hóa đơn.
- **Đã gộp** thành một hóa đơn HD001256, tổng 12.048.000 đ. Dòng hàng, sổ kho, tiền đã thu, phí vận chuyển và tiền cọc chuyển theo; tổng tiền, tiền đã thu và tồn kho không đổi. Bộ đếm HD trả về 1256. Sao lưu: `backups/20261123-164355-truoc-gop-hoa-don-dh000068/`.
- **Lưu ý cách dùng:** muốn thêm hàng quên vào hóa đơn đã lập từ đơn đặt thì sửa hóa đơn đó, đừng bấm giao thêm lần nữa. Giao thêm sẽ sinh hóa đơn thứ hai, KiotViet cũng làm vậy khi xử lý đơn nhiều lần.
- **Không còn rủi ro trùng mã với KiotViet:** chủ cửa hàng xác nhận ngày 23/11 đã thôi dùng KiotViet, chỉ dùng sổ mới. Công cụ nạp KiotViet không cần chạy thêm.
