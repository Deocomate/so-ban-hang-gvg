# Sổ Bán Hàng Gốm — hướng dẫn triển khai và sử dụng

Phần mềm quản lý bán hàng cho **Gốm sứ Thanh Hải** và **Gốm Vũ Gia**. Mỗi thương hiệu là **một sổ riêng**: hàng hóa, khách hàng, quỹ tiền và báo cáo không lẫn vào nhau. Một tài khoản chủ có thể chuyển qua lại giữa hai sổ.

## 1. Trong gói này có gì

| Thư mục / tệp | Nội dung |
|---|---|
| `supabase/migration.sql` | Toàn bộ cơ sở dữ liệu: bảng, quy tắc tính toán, phân quyền, báo cáo. Chạy **một lần** trên Supabase. |
| `db/` | Cùng nội dung trên, tách thành các tệp 01–11 (00 chỉ dùng cho bản chạy thử). |
| `supabase/functions/` | 3 hàm chạy trên máy chủ: nhận tiền về từ SePay, gửi thông báo điện thoại, nhận trạng thái vận đơn tự động (SPX, BEST). |
| `supabase/seed-demo.sql` | Dữ liệu mẫu của bản chạy thử — chỉ dùng cho dự án thử (staging), KHÔNG nạp vào dự án thật. |
| `DEV-README.md` | Tài liệu kỹ thuật cho dev: kiến trúc, chạy ở máy, deploy, kiểm thử. |
| `supabase/schedule.sql` | Lịch tự động: báo cáo cuối ngày 21:00, nhắc công nợ 08:00, gửi thông báo mỗi phút. |
| `web/` | Mã nguồn giao diện (React + Vite). |
| `tests/` | Bộ kiểm thử: nghiệp vụ bán hàng (146 phép) + vận chuyển, tiền về, thông báo, BEST Express (125 phép) + chi phí (38 phép) + chứng từ PDF, trọng lượng (25 phép). |
| `mau-excel/` | File mẫu để nhập hàng hóa, khách hàng, nhà cung cấp lần đầu. |
| `ket-qua-kiem-thu.xlsx` | Kết quả kiểm thử gần nhất: 334 đạt / 0 lỗi. |

## 2. Đưa lên chạy thật (khoảng 30–45 phút, làm một lần)

### Bước 1 — Tạo cơ sở dữ liệu trên Supabase
1. Vào https://supabase.com → đăng ký → **New project**. Chọn vùng **Southeast Asia (Singapore)** cho nhanh. Ghi lại mật khẩu cơ sở dữ liệu.
2. Mở **SQL Editor** → **New query** → dán toàn bộ nội dung `supabase/migration.sql` → **Run**. Thấy "Success" là xong.
3. Vào **Project Settings → API**, chép 2 giá trị: **Project URL** và khóa **anon public**.
4. Vào **Authentication → URL Configuration**, điền **Site URL** là địa chỉ web ở Bước 2 (làm sau khi có địa chỉ).

### Bước 2 — Đưa giao diện lên mạng (miễn phí, Cloudflare Pages)
1. Trên máy tính có cài Node.js 20 trở lên, mở thư mục `web/`:
   ```
   cp .env.example .env        # rồi sửa .env, dán URL và khóa anon ở Bước 1 (+ khóa VAPID công khai, xem mục 7)
   npm install
   npm run build               # hoặc: npx vite build
   ```
   Kết quả nằm trong thư mục `web/dist/`.
2. Vào https://dash.cloudflare.com → **Workers & Pages → Create → Pages → Upload assets** → kéo thả thư mục `dist` → đặt tên (ví dụ `so-gom`) → được địa chỉ dạng `https://so-gom.pages.dev`.
3. Quay lại Supabase Bước 1.4, điền địa chỉ này vào **Site URL**.

> Muốn chạy thử bản chạy-thử (dữ liệu mẫu) trên máy: `npx vite --mode demo`. Bản này không kết nối Supabase.

### Bước 3 — Tạo tài khoản chủ (làm NGAY sau khi đưa lên)
1. Mở địa chỉ web → **Đăng ký** bằng email của anh.
2. **Người đăng ký đầu tiên tự động thành chủ** của cả 2 sổ (Thanh Hải và Vũ Gia, đã cài sẵn thuế 1% GTGT + 17% TNCN, 3 mức giá, kênh bán, các bước sản xuất).
3. Từ người thứ hai trở đi, đăng ký xong sẽ **không thấy sổ nào** cho tới khi chủ thêm email đó trong **Cài đặt → Người dùng & quyền**. Vì vậy người lạ có đăng ký cũng không xem được gì.

### Bước 4 — Thêm nhân viên
1. Nhân viên tự đăng ký bằng email của họ.
2. Chủ vào **Cài đặt → Người dùng & quyền → Thêm người dùng**, nhập email, chọn quyền. Quyền đặt **riêng cho từng sổ**.
3. Bỏ tick **"Xem giá vốn và lợi nhuận"** thì nhân viên không thấy giá vốn, lợi nhuận, giá trị tồn kho ở bất kỳ màn hình nào. Phần ẩn này do cơ sở dữ liệu chặn, không chỉ ẩn trên giao diện.

### Chi phí
- Supabase gói Free: đủ dùng thử. **Lưu ý:** gói Free tạm dừng dự án nếu 7 ngày không ai dùng, và **không có sao lưu tự động**.
- Khi dùng thật nên lên **gói Pro (khoảng 25 USD/tháng)** để được sao lưu hằng ngày. Giá có thể thay đổi, xem tại supabase.com/pricing.
- Cloudflare Pages: miễn phí.

## 3. Nhập dữ liệu ban đầu (một lần, ngày 01/10/2026)

Làm lần lượt trong **từng sổ** (chọn sổ ở thanh trên cùng trước):

1. **Cài đặt → Thông tin sổ**: kiểm tra tên sổ, thuế, tên 3 mức giá, địa chỉ và điện thoại in trên phiếu.
2. **Cài đặt → Quỹ tiền**: nhập số dư đầu kỳ của Tiền mặt và Tài khoản ngân hàng (thêm quỹ nếu cần, ví dụ "Ví TikTok").
3. **Sản phẩm → Nhập từ Excel**: dùng `mau-excel/mau-hang-hoa_ThanhHai.xlsx` (hoặc `_VuGia`). Các cột gồm: tên hàng hóa, chủng loại, mẫu, kích thước, màu sắc, ĐVT, giá vốn, 3 giá bán, số lượng tồn.
   - Mỗi dòng là một biến thể và có một mã SKU riêng. Để trống SKU thì hệ thống tự cấp mã.
   - Số lượng × giá vốn được ghi thành **phiếu Tồn đầu kỳ**. Phiếu này không tính vào doanh thu hay công nợ.
   - Trước khi ghi có **bước xem trước**: dòng lỗi (thiếu tên, giá không phải số, SKU trùng) bị đánh dấu đỏ và bỏ qua.
   - Sau khi ghi có **bảng đối chiếu** giữa "Theo file" và "Đã ghi vào sổ" (số mã, tổng số lượng, tổng giá trị), mỗi dòng ghi Khớp hoặc Lệch.
   - Nhập lại cùng file thì không nhân đôi: SKU đã có chỉ được cập nhật thông tin và giá, không cộng thêm tồn.
   - File gốc của anh không bị sửa.
4. **Khách hàng → Nhập từ Excel** (`mau-khach-hang.xlsx`): gồm mức giá áp dụng, số ngày được nợ, **nợ đầu kỳ** và hạn trả.
5. **Nhà cung cấp → Nhập từ Excel** (`mau-nha-cung-cap.xlsx`): gồm nợ đầu kỳ với xưởng.
6. Xem lại **Tổng quan**: giá trị tồn kho, khách còn nợ, nợ nhà cung cấp và tồn quỹ phải khớp với sổ cũ.

## 4. Quy tắc tính (đã kiểm thử)

| Nghiệp vụ | Ảnh hưởng |
|---|---|
| Đơn **nháp** | Không giữ hàng, không tính doanh thu |
| Đơn **đã xác nhận** | Giữ hàng (giảm "có thể bán"), chưa tính doanh thu |
| **Giao hàng** | Trừ kho, ghi doanh thu và giá vốn (bình quân gia quyền tại lúc giao, lưu cố định), phát sinh công nợ |
| **Tiền cọc** | Không phải doanh thu; hiện là "khách trả trước" |
| **Đơn mua / đặt xưởng** | Không tăng kho. Chỉ **phiếu nhận hàng** mới tăng kho và giá vốn bình quân |
| Bước sản xuất | Chờ sản xuất → Đang sản xuất → Đang trong lò → Đã sản xuất, chưa giao hàng → Đang giao về. "Đã nhận một phần / đủ" do phần mềm tự cập nhật |
| **Khách trả hàng** | Đảo doanh thu và giá vốn theo đúng giá lúc giao. Hàng lỗi không nhập lại thì ghi vào hao hụt |
| **Vỡ, lỗi, thất thoát** | Phiếu điều chỉnh kho có lý do; giá trị tính vào chi phí vận hành |
| **TikTok** | Phí sàn ghi vào phiếu thu → tự tạo chi phí "Phí sàn TMĐT"; quỹ nhận số tiền thực về |
| Xóa / sửa | Không xóa lịch sử. Phiếu sai thì **hủy** (vẫn lưu, có lý do) rồi lập lại. Mọi thay đổi ghi vào Nhật ký |
| Bấm lưu 2 lần | Không ghi trùng (mỗi lần bấm có một mã yêu cầu) |
| Bán vượt tồn | Bị chặn (có thể mở trong Cài đặt) |
| Khóa sổ | Đặt "Khóa sổ đến ngày" sau khi chốt tháng; không ai ghi được chứng từ vào kỳ đã khóa |

Thuế GTGT 1% và thuế TNCN 17% trong phần mềm là **số ước tính để quản trị**, không thay tờ khai. Quy định thuế hộ kinh doanh có thể thay đổi, anh nên đối chiếu với kế toán.

## 5. Sao lưu và khôi phục

- **Cài đặt → Nhập / sao lưu dữ liệu → Tải bản sao lưu** (Excel để xem, JSON để khôi phục). Nên tải mỗi tháng, mỗi sổ một bản, cất trên Google Drive hoặc USB.
- Supabase gói Pro tự sao lưu hằng ngày. Để khôi phục về một ngày cũ: **Database → Backups → Restore**. Lưu ý: khôi phục sẽ ghi đè toàn bộ dữ liệu hiện tại, nên tải bản JSON mới nhất trước khi khôi phục.

## 6. Kiểm thử nghiệp vụ

Chạy `npm install` ở thư mục gốc rồi chạy `node tests/business.test.mjs`. Bộ kiểm thử dựng một cơ sở dữ liệu trống và chạy đủ 9 tình huống yêu cầu:
- bán thu đủ, bán nợ, đặt cọc, giao từng phần, nhận từng phần, trả hàng, hủy đơn, hàng vỡ, nhập cùng SKU giá mới;
- thêm: bán theo bộ, chống ghi trùng, phân quyền, sổ Vũ Gia với TikTok và phí sàn, đối chiếu các số tổng.

Kết quả chi tiết nằm trong `ket-qua-kiem-thu.xlsx`.

Một điểm **chưa kiểm thử được** trong môi trường này: hai người cùng bấm lưu vào đúng một lúc trên cùng một mặt hàng. Phần mềm đã khóa từng dòng dữ liệu khi ghi để tránh lỗi này, nhưng nên thử trên Supabase thật trong tuần đầu.

## 7. Vận chuyển (Shopee Express, BEST Express), tiền về tài khoản, thông báo điện thoại

### 7.1 Đã có ngay (không cần đăng ký thêm)
- **Mã QR chuyển khoản theo đơn** (chuẩn VietQR): hiện trong màn hình đơn hàng và in trên phiếu. Khách quét bằng app ngân hàng nào cũng tự điền số tiền còn phải trả và nội dung **mã sổ + mã đơn** (ví dụ `THDH00012`, `VGDH00007`). Hai sổ dùng chung một tài khoản Vietcombank, phần mềm phân biệt nhờ mã sổ. Khai báo tài khoản: **Cài đặt → Tài khoản nhận tiền**, làm cho từng sổ.
- **Vận đơn SPX**:
  - Khi giao hàng, tick **Gửi qua Shopee Express** rồi dán mã vận đơn (SPXVN…) và tiền thu hộ (COD). Hoặc mở đơn rồi bấm **Tạo vận đơn SPX**.
  - Trang **Vận chuyển SPX** có các trạng thái giống app SPX: Chờ lấy hàng → Đã lấy hàng → Đang trung chuyển → Đang giao → Giao thành công / Giao thất bại → Đang hoàn → Đã hoàn.
  - Cập nhật trạng thái theo một trong hai cách:
    - **bằng tay**: mở vận đơn rồi chọn trạng thái;
    - **hàng loạt**: tải danh sách đơn từ trang quản lý SPX ra Excel, rồi bấm **Cập nhật từ file SPX**.
- **Hàng hoàn**: khi SPX hoàn hàng, mở vận đơn rồi bấm **Nhận hàng hoàn → nhập lại kho**. Phần mềm lập phiếu khách trả, đưa hàng về kho và đảo doanh thu, công nợ. Hàng vỡ thì bỏ chọn "Nhập lại để bán".
- **Đối soát COD**:
  - Khi giao thành công, tiền COD chuyển sang trạng thái "SPX đang giữ".
  - Khi SPX chuyển tiền gộp về tài khoản, bấm **Đối soát COD** và chọn các vận đơn có trong bảng đối soát của SPX.
  - Mỗi vận đơn được lập một phiếu thu gạch nợ đúng đơn. Phần SPX trừ (cước, phí thu hộ) ghi vào chi phí "Vận chuyển".
- **Chuông thông báo** trong phần mềm, có 5 loại tin:
  - đơn mới;
  - vận chuyển (đã lấy hàng, đang giao, giao thành công / thất bại, hoàn hàng);
  - tiền về;
  - báo cáo cuối ngày;
  - nhắc công nợ.

  Nhân viên chỉ nhận loại tin hợp với quyền của mình: không có quyền thu chi thì không thấy tin tiền về, không có quyền xem giá vốn thì không nhận báo cáo ngày.

### 7.2 Tiền về tự động qua SePay
1. Đăng ký tại https://sepay.vn, thêm tài khoản **Vietcombank hộ kinh doanh**. Từ 06/2026, SePay hỗ trợ tài khoản doanh nghiệp/hộ kinh doanh của Vietcombank qua VCB OneQR; cần liên hệ SePay để kích hoạt. Gói miễn phí được 50 giao dịch/tháng, gói trả phí từ khoảng 70.000–120.000đ/tháng; xem giá mới nhất tại sepay.vn/bang-gia.html.
2. Đưa 3 hàm lên Supabase (cần cài Supabase CLI, chạy trên máy tính, trong thư mục gốc của gói):
   ```
   npx supabase login
   npx supabase link --project-ref <MA-DU-AN>
   npx supabase functions deploy sepay-webhook --no-verify-jwt
   npx supabase functions deploy send-push --no-verify-jwt
   npx supabase functions deploy tracking-webhook --no-verify-jwt
   ```
3. Đặt các khóa bí mật (Supabase → Edge Functions → Secrets, hoặc `npx supabase secrets set TEN=giatri`):
   - `SEPAY_API_KEY` = một chuỗi bí mật anh tự đặt, sau đó nhập đúng chuỗi này trên SePay;
   - `CRON_SECRET` = một chuỗi bí mật khác, dùng cho lịch gửi thông báo;
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` = tạo bằng lệnh `npx web-push generate-vapid-keys`;
   - `VAPID_SUBJECT` = `mailto:` + email của anh;
   - `TRACKING_WEBHOOK_SECRET` = chuỗi bí mật, chỉ cần khi nối theo dõi vận đơn tự động.
4. Trên SePay: **WebHooks → Thêm**, URL `https://<MA-DU-AN>.supabase.co/functions/v1/sepay-webhook`, kiểu chứng thực **API Key**, dán đúng `SEPAY_API_KEY`. Chọn sự kiện **tiền vào**.
5. Chuyển thử 2.000đ với nội dung là mã một đơn đang nợ, ví dụ `THDH00001`. Trong vài giây, mục **Tiền về TK** phải hiện giao dịch và đơn được gạch nợ.

Cách phần mềm xử lý từng khoản tiền về:
- **Nội dung có mã sổ + mã đơn**: tự lập phiếu thu, gạch nợ đúng đơn. Phần trả dư tính là khách trả trước. Tiền cọc của đơn chưa giao **không** tính vào doanh thu.
- **Không có mã đơn**: vào mục "Chờ xử lý" và gửi thông báo. Anh chọn một trong bốn cách:
  - ghi vào một đơn;
  - ghi vào công nợ của khách (trừ các khoản nợ cũ nhất trước);
  - đối soát COD SPX;
  - bỏ qua, có ghi lý do.
- **SePay gửi lại cùng giao dịch**: không ghi lần hai.
- **Ghi nhầm**: hủy phiếu thu đó, giao dịch quay lại "Chờ xử lý" để ghi lại.

### 7.3 Thông báo lên điện thoại
1. Thêm `VITE_VAPID_PUBLIC_KEY=<khóa công khai VAPID>` vào tệp `web/.env`, build lại (`npm run build`) và đưa lên Cloudflare như Bước 2.
2. Chạy `supabase/schedule.sql` trong SQL Editor, sau khi đã bật pg_cron và pg_net và sửa 2 chỗ `<...>` trong tệp. Lịch gồm:
   - báo cáo ngày lúc 21:00;
   - nhắc nợ lúc 08:00;
   - gửi thông báo mỗi phút.
3. Trên điện thoại:
   - **Android**: mở phần mềm bằng Chrome → **Cài đặt → Thông báo điện thoại → Bật thông báo trên máy này** → Cho phép.
   - **iPhone** (iOS 16.4 trở lên): mở bằng Safari → nút Chia sẻ → **Thêm vào MH chính** → mở phần mềm từ biểu tượng mới → Cài đặt → bật thông báo.
4. Thông báo được gửi tới **thiết bị đã đăng nhập và bấm bật**, không gửi theo số điện thoại. Mỗi máy bật riêng, và một người có thể bật trên nhiều máy.

### 7.4 Theo dõi vận đơn SPX tự động (làm sau)
Hiện tại trạng thái vận đơn được cập nhật bằng tay hoặc từ file Excel của SPX. Có 2 cách để tự động hoàn toàn:
- **Kết nối chính thức SPX**: SPX cho phần mềm bán hàng kết nối bằng Secret Key lấy tại trang quản trị SPX (Quản lý tài khoản → Hồ sơ shop), nhưng không công bố tài liệu kỹ thuật. Hãy xin nhân viên phụ trách tài khoản SPX tài liệu API hoặc webhook trạng thái đơn. Khi có tài liệu, chỉ cần chuyển dữ liệu SPX gửi sang dạng `{tracking_no, status, detail, at}` rồi gửi vào hàm `tracking-webhook`, vì phần ghi sổ, lịch sử và thông báo đã sẵn sàng.
- **Dịch vụ tra vận đơn trả phí** có hỗ trợ SPX Việt Nam, ví dụ TrackingMore: đặt webhook của dịch vụ về `https://<MA-DU-AN>.supabase.co/functions/v1/tracking-webhook?secret=<TRACKING_WEBHOOK_SECRET>`. Hàm này đã đọc được định dạng của TrackingMore, nhưng cần thử với tài khoản thật trước khi dựa vào.

### 7.4b Kết nối BEST Express
- **Dùng được ngay:** khi giao hàng, tick **Gửi qua đơn vị vận chuyển**, chọn **BEST Express**, rồi dán mã vận đơn và tiền COD. Hoặc mở đơn rồi bấm **Tạo vận đơn**. Trang **Vận chuyển** lọc được theo hãng. Đối soát COD làm **riêng từng hãng**, vì phần mềm không cho trộn SPX với BEST trong một lần đối soát. Khoản tiền về có chữ "BEST EXPRESS" được gợi ý là tiền COD của BEST.
- **Tự động nhận trạng thái từ BEST:** BEST không công bố tài liệu công khai, nhưng có gửi trạng thái vận đơn về phần mềm của shop qua webhook (đây là cách các phần mềm bán hàng như Getfly đang kết nối). Các bước:
  1. Đặt khóa `TRACKING_WEBHOOK_SECRET` trên Supabase (mục 7.2.3). Đã đặt cho SPX rồi thì dùng chung.
  2. Vào **Cài đặt → Đơn vị vận chuyển → BEST Express**, chép địa chỉ `https://<MA-DU-AN>.supabase.co/functions/v1/tracking-webhook?carrier=BEST&secret=<khóa>` và gửi cho nhân viên phụ trách tài khoản BEST, đề nghị bật **webhook cập nhật trạng thái vận đơn**.
  3. Xin BEST **danh sách mã trạng thái**. Hiện phần mềm mới biết chắc mã **666 = Giao hàng thành công**; các trạng thái khác được hiểu theo chữ mô tả (Đang giao, Giao không thành công, Hoàn hàng…).
  4. Gửi thử một đơn. Mục **Nhật ký BEST gửi về** (ở cùng trang Cài đặt) hiện từng lần BEST gửi sang. Dòng **"Chưa đọc được"** nghĩa là cần bổ sung cách đọc: gửi lại dòng đó (hoặc danh sách mã của BEST) để chỉnh. Dữ liệu chưa đọc được vẫn được lưu nguyên văn và không gây lỗi.
- **Trong lúc chờ BEST:** cập nhật trạng thái bằng tay ở từng vận đơn, hoặc tải danh sách đơn từ trang quản lý BEST ra Excel rồi dùng **Vận chuyển → Cập nhật từ file Excel**. Phần này đọc được cột "Mã vận đơn / Bill code" và "Trạng thái".
- **Đã thử:** hàm nhận BEST đã chạy trên đúng cơ sở dữ liệu với các kiểu dữ liệu thường gặp (một đơn, danh sách nhiều đơn, dạng form, mã 666). Kết quả: cập nhật đúng trạng thái, BEST gửi lại cùng dữ liệu không bị ghi trùng, mã lạ được lưu vào nhật ký, sai khóa bị chặn. **Chưa thử với BEST thật**, vì chưa có mẫu dữ liệu thật của BEST.

### 7.5 Những phần CHƯA thử được trong môi trường làm phần mềm
- **Gửi thông báo tới máy chủ push thật** của Google/Apple: môi trường làm phần mềm không ra được mạng ngoài. Phần mã hóa thông báo và chữ ký VAPID đã được kiểm chứng bằng thư viện giải mã độc lập. Hàm nhận SePay đã chạy thử với dữ liệu mẫu SePay trên đúng cơ sở dữ liệu: tự gạch nợ đúng, không ghi trùng, sai khóa bị chặn.
- **Webhook SePay thật**: cần thử bằng một giao dịch nhỏ như bước 7.2.5.
- **Định dạng file Excel do SPX xuất**: phần mềm tự dò cột "Mã vận đơn" và "Trạng thái". Nếu file thật có tên cột khác, gửi file để chỉnh.

## 8. Chi phí theo nhóm

**Ghi chi phí:** vào **Chi phí → Ghi chi phí**, chọn **nhóm**, chọn **khoản mục**, nhập số tiền. Nếu khoản cần ghi chưa có trong danh sách, chọn "+ Khoản khác" rồi tự gõ tên.

| Nhóm | Khoản mục có sẵn |
|---|---|
| Mặt bằng | Thuê nhà / cửa hàng · Thuê kho · Phí dịch vụ, an ninh, vệ sinh |
| Điện, nước, internet | Tiền điện · Tiền nước · Internet, điện thoại · Gas, rác thải |
| Công cụ dụng cụ | Kệ, tủ, bàn trưng bày · Thiết bị (máy in, camera, đèn, điện thoại livestream) · Dụng cụ đóng gói, bán hàng · Sửa chữa, bảo trì |
| Marketing | Quảng cáo Facebook · Quảng cáo TikTok · Quảng cáo khác · KOC / KOL, affiliate · Chụp ảnh, quay video, đạo cụ · In ấn, biển bảng · Quà tặng, khuyến mãi, hàng mẫu |
| Chi phí bán hàng | Phí vận chuyển (ship, COD) · Bao bì, đóng gói · Phí sàn TMĐT · Phí ngân hàng, thanh toán · Hoa hồng bán hàng, CTV · Hàng tặng kèm |
| Nhân sự | Lương · Thưởng · Bảo hiểm, phụ cấp · Ăn uống, liên hoan |
| Quản lý & khác | Phần mềm, ứng dụng · Thuế môn bài, lệ phí · Văn phòng phẩm · Tiếp khách · Chi phí khác |

- **Sửa danh mục:** vào **Cài đặt → Danh sách chọn → Danh mục chi phí** để thêm, bớt hoặc đổi tên nhóm và khoản mục. Mỗi sổ có danh mục riêng.
- **Phân bổ dần:** dùng cho khoản trả một lần nhưng dùng nhiều tháng, như kệ, camera, máy in, hoặc tiền nhà trả trước 3–6 tháng. Chọn "Chia đều N tháng". Tiền ra khỏi quỹ một lần, còn lãi lỗ mỗi tháng chỉ tính một phần, nên tháng mua đồ không bị lỗ ảo. Ví dụ: camera 12.000.000 đ chia 12 tháng thì mỗi tháng tính 1.000.000 đ.
- **Tự ghi, không cần nhập lại:** phí sàn TikTok (ghi khi thu tiền có phí sàn) và cước, phí COD bị trừ khi đối soát SPX hoặc BEST. Cả hai tự vào nhóm "Chi phí bán hàng".
- **Không ghi ở đây:**
  - tiền nhập hàng, vì đã nằm trong giá vốn;
  - thuế GTGT 1% và thuế TNCN 17%, vì phần mềm tự ước tính trong lãi lỗ.
- **Báo cáo:** vào **Báo cáo → Chi phí**, có hai cách xem:
  - "Theo nhóm & khoản mục": cho biết tiền đi vào đâu;
  - "So sánh theo tháng": nhóm × tháng, ví dụ để xem chi phí Marketing tăng hay giảm qua các tháng.

  Cả hai đều xuất được ra Excel, và tổng luôn khớp với dòng "Chi phí" trong lãi lỗ.
- **Đã cài Supabase từ trước:** chỉ cần chạy thêm tệp `db/09_expenses.sql` trong SQL Editor. Dữ liệu cũ được giữ nguyên; các chi phí đã ghi được tự xếp vào nhóm mới (ví dụ "Thuê mặt bằng" vào nhóm Mặt bằng, "Quảng cáo - Marketing" vào nhóm Marketing).

## 9. Xuất chứng từ PDF cho khách

Có 5 loại chứng từ, xuất ra PDF khổ A4, dựng theo đúng mẫu cửa hàng đang dùng:

| Chứng từ | Mở từ đâu | Đơn vị phát hành mặc định |
|---|---|---|
| Hóa đơn bán hàng | Chi tiết đơn → **Xuất PDF** | Hộ kinh doanh |
| Đơn đặt hàng | Chi tiết đơn → **Xuất PDF** → thẻ "Đơn đặt hàng" | Hộ kinh doanh |
| Biên bản bàn giao hàng hóa | Chi tiết đơn → bấm vào một lần giao (hoặc tự mở ngay sau khi bấm Giao hàng) | Công ty (có logo) |
| Phiếu xuất kho | Như biên bản, thẻ "Phiếu xuất kho" | Hộ kinh doanh |
| Phiếu thu / phiếu chi | Thu chi → mở phiếu → **Xuất phiếu PDF** | Hộ kinh doanh |

- **Cài đặt một lần:** vào **Cài đặt → Mẫu chứng từ**.
  - Khai báo đơn vị phát hành: tên, địa chỉ, điện thoại, email, website, dòng số tài khoản, người đại diện, logo. Có thể khai nhiều đơn vị (ví dụ Hộ kinh doanh gốm sứ Mai Hiếu và Công ty TNHH SX&TM Thanh Hải).
  - Với từng loại chứng từ, chọn đơn vị phát hành và dấu phân cách hàng nghìn (24,000,000 hay 24.000.000).
  - Sửa được nội dung ghi chú / chính sách đổi trả ở cuối hóa đơn, dòng cuối đơn đặt hàng và đoạn cam kết cuối biên bản. Bọc chữ trong `**hai dấu sao**` để in đậm.
  - Mỗi sổ (Thanh Hải, Vũ Gia) có mẫu riêng.
- **Quy cách đóng gói:** trong sản phẩm, điền "Số viên / hộp" (ví dụ 140) và đơn vị đóng gói (hộp, thùng, kiện…). Khi đó chứng từ tự in dòng "4 hộp x 140 viên + 40 viên" và tự tính tổng số hộp (hộp lẻ tính 1 hộp). File Excel nhập hàng có thêm 2 cột "Số viên/hộp" và "Đơn vị đóng gói".
- **Sửa trước khi tải:** bên trái bản xem trước có các ô sửa được, như ngày trên chứng từ, SĐT và địa chỉ nhận hàng, tổng số hộp, nợ cũ, lái xe, người nhận và tình trạng hàng. Bấm **Tải PDF** thì phần mềm tự lưu các ô này để lần sau mở lại vẫn còn.
- **Số tiền trên hóa đơn:**
  - Nợ cũ = công nợ hiện tại của khách trừ phần của chính đơn này. Ô này sửa được.
  - Tổng thanh toán = tiền hàng + nợ cũ + tiền vận chuyển.
  - Còn thanh toán = Tổng thanh toán − đã thanh toán (gồm cả tiền cọc).
  - Số tiền bằng chữ in theo dạng "Mười ba triệu tám trăm nghìn đồng chẵn".
- **Biên bản và phiếu xuất kho** lập theo từng lần giao. Nếu chưa giao, chọn "Cả đơn" để in trước, giao cho lái xe mang theo.
- **Phiếu thu, phiếu chi và phiếu xuất kho** có dòng "Mẫu số … Thông tư 88/2021/TT-BTC" ở góc phải. Dòng này tắt được trong cài đặt. Nếu đơn vị phát hành là công ty, nên sửa dòng này theo chế độ kế toán công ty đang áp dụng (hỏi kế toán).
- **Phông chữ:** tất cả chứng từ dùng chung một phông, mặc định Arial (Arimo). Muốn đổi sang Times New Roman (Tinos) thì vào Cài đặt → Mẫu chứng từ → Phông chữ. Phông được nhúng sẵn trong PDF, nên mở trên điện thoại, máy tính hay gửi Zalo đều đúng dấu tiếng Việt, và chữ chọn/sao chép được. Hai phông này dùng giấy phép Apache 2.0, miễn phí.
- **Đã cài Supabase từ trước:** chạy thêm tệp `db/10_documents.sql` trong SQL Editor. Dữ liệu cũ giữ nguyên, sản phẩm cũ có thêm ô quy cách (để trống).
- **Đây không phải hóa đơn điện tử.** "Hóa đơn bán hàng" ở đây là chứng từ nội bộ để giao cho khách, không thay hóa đơn điện tử có mã của cơ quan thuế. Hộ kinh doanh có doanh thu trên 1 tỷ đồng/năm thuộc diện phải dùng hóa đơn điện tử theo quy định hiện hành, nên hỏi lại cán bộ thuế hoặc kế toán để áp dụng cho đúng.

## 10. Màn hình tạo đơn bán (kiểu quầy)

Bấm **Tạo đơn bán** thì màn hình tạo đơn mở toàn màn hình. Không cần bấm "Thêm dòng":

- **Thêm hàng:** gõ tên hoặc mã vào ô tìm kiếm trên cùng (phím **F3**), rồi bấm vào sản phẩm hoặc nhấn Enter. Hàng vào đơn ngay. Chọn lại cùng sản phẩm thì số lượng cộng thêm 1. Máy quét mã vạch dùng được nếu mã vạch trùng mã SKU.
- **Mỗi dòng hàng** có nút −/+ và ô số lượng, đơn giá (tự lấy theo mức giá của khách), chiết khấu %. Nếu sản phẩm có quy cách thì hiện luôn số hộp, ví dụ "4 hộp x 140 viên + 40 viên".
- **Ghi chú cho từng dòng:** ô ngay dưới tên sản phẩm, để ghi đặc điểm hàng (màu men, chọn viên đều màu, yêu cầu đóng gói…). Ghi chú được lưu theo đơn và in nghiêng dưới tên hàng trên hóa đơn, đơn đặt hàng, biên bản bàn giao và phiếu xuất kho.
- **Cột bên phải:**
  - người bán (phần mềm nhớ cho lần sau) và ngày;
  - khách hàng (phím **F4**; nút + để thêm khách mới);
  - kênh bán và ngày hẹn giao;
  - giảm giá, phí vận chuyển, **Khách cần trả**;
  - số tiền khách thanh toán (nút "Đủ") và hình thức trả. Màn hình tự hiện tiền thừa trả khách hoặc số tiền ghi nợ.
- **Nút cuối màn hình:**
  - **THANH TOÁN:** bán và giao ngay (xuất kho, ghi doanh thu, thu tiền).
  - **IN:** làm giống THANH TOÁN, rồi mở luôn hóa đơn PDF.
  - Với đơn **Đặt riêng** (nút gạt trên cùng), nút chính là **XÁC NHẬN ĐƠN** và nút IN mở đơn đặt hàng PDF.
  - "Lưu nháp" và "Chỉ xác nhận, giao sau" nằm ngay phía trên hai nút.
- **Đóng màn hình** bằng nút ✕ góc phải. Nếu đơn đang có hàng, phải bấm hai lần để tránh mất đơn do bấm nhầm.

## 11. Tự chia thùng và tính tổng trọng lượng

- **Khai một lần cho mỗi sản phẩm** (Sản phẩm → sửa, hoặc cột trong file Excel nhập hàng):
  - "Quy cách: số viên / thùng" (ví dụ 140) và đơn vị đóng gói (thùng, hộp, kiện…);
  - "Trọng lượng 1 thùng (kg)" (ví dụ 28) và/hoặc "Trọng lượng 1 viên (kg)" (ví dụ 0,2). Chỉ cần một trong hai ô; có cả hai thì phần mềm dùng kg/viên.
- **Khi tạo đơn**, gõ số lượng là ngay dưới tên sản phẩm (phía trên ô ghi chú) tự hiện cách chia thùng và trọng lượng của dòng đó, ví dụ: Ngói âm 80, 600 viên → "4 thùng x 140 viên + 40 viên · 120 kg". Cột bên phải hiện **Tổng trọng lượng** và tổng số thùng của cả đơn (thùng lẻ tính 1 thùng).
- Sản phẩm chưa khai quy cách sẽ có nút "+ Khai số viên/thùng" ngay trên dòng hàng để khai luôn mà không phải rời màn hình tạo đơn. Nếu có mặt hàng chưa khai trọng lượng, phần mềm ghi rõ "thiếu N mặt hàng chưa khai" để không hiểu nhầm là tổng đã đủ.
- Tổng trọng lượng cũng hiện trong chi tiết đơn, trên **biên bản bàn giao** (dòng Tổng cộng) và **phiếu xuất kho**, tiện báo xe và đối chiếu khi bốc hàng.
- **File Excel nhập hàng** có thêm 2 cột "Trọng lượng/thùng (kg)" và "Trọng lượng/viên (kg)". Ghi kiểu như bảng quy cách đang dùng ("140 viên/ thùng", "28kg/ thùng", "0,20") cũng đọc được; nếu cột "Quy cách" ghi "140 viên/ thùng" thì phần mềm tự hiểu là 140 viên mỗi thùng.
- **Đã cài Supabase từ trước:** chạy thêm tệp `db/11_weight.sql` trong SQL Editor (sau tệp 10 nếu chưa chạy). Dữ liệu cũ giữ nguyên, ô trọng lượng để trống.
