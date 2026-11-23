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
