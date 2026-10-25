# Sổ Bán Hàng Gốm — hướng dẫn triển khai và sử dụng

Phần mềm quản lý bán hàng cho **Gốm sứ Thanh Hải** và **Gốm Vũ Gia**. Mỗi thương hiệu là **một sổ riêng**: hàng hóa, khách hàng, quỹ tiền và báo cáo không lẫn vào nhau. Một tài khoản chủ có thể chuyển qua lại giữa hai sổ.

## 1. Trong gói này có gì

| Thư mục / tệp | Nội dung |
|---|---|
| `server/` | Máy chủ API (Node.js + SQLite): toàn bộ quy tắc tính toán, phân quyền, báo cáo, đăng nhập, nhận tiền về SePay, nhận trạng thái vận đơn, thông báo điện thoại, lịch tự động, sao lưu hằng đêm. |
| `server/src/db/` | Cấu trúc cơ sở dữ liệu (`schema.sql`) và các bảng tổng hợp (`views.sql`). Máy chủ tự tạo khi khởi động lần đầu. |
| `server/test/` | Bộ kiểm thử: nghiệp vụ bán hàng (146 phép), vận chuyển · tiền về · thông báo (126), chi phí (34), chứng từ (19), dữ liệu mẫu (12), HTTP · đăng nhập · webhook (24). |
| `web/` | Giao diện (React + Vite), phục vụ bằng nginx; nginx chuyển các yêu cầu `/api` sang máy chủ API. |
| `docker-compose.yml` | Chạy cả hai phần trên một máy chủ bằng Docker (Coolify). |
| `.env.example` | Danh sách biến cấu hình (khóa SePay, khóa thông báo…). |
| `mau-excel/` | File mẫu để nhập hàng hóa, khách hàng, nhà cung cấp lần đầu. |

Cơ sở dữ liệu là **một tệp SQLite** (`/data/gomsu.db` trong Docker volume `gomsu-data`), không cần máy chủ cơ sở dữ liệu riêng.

## 2. Đưa lên chạy thật (Coolify, làm một lần)

### Bước 1 — Tạo ứng dụng trên Coolify
1. Đưa thư mục này lên một kho Git (GitHub/GitLab, để chế độ riêng tư).
2. Coolify → **Project → New Resource → Docker Compose**, chọn kho Git vừa tạo. Coolify tự đọc `docker-compose.yml`.
3. Ở dịch vụ **web**, đặt **Domain** (ví dụ `https://so.gomsu.vn`), cổng **80**. Dịch vụ **api** không cần tên miền: nó chỉ mở cổng 3000 trong mạng nội bộ Docker (dùng `expose`, không chiếm cổng của máy chủ nên không trùng với ứng dụng khác).
4. Mục **Environment Variables**: chép các biến trong `.env.example` và điền giá trị (xem mục 7). Có thể để trống hết lúc đầu; `JWT_SECRET` để trống thì máy chủ tự tạo và lưu trong volume.
5. Bấm **Deploy**. Khi cả hai dịch vụ "healthy", mở tên miền đã đặt.

> Không dùng Coolify: `cp .env.example .env`, sửa `.env`, rồi `docker compose up -d --build`, và cho reverse proxy (nginx, Caddy, Traefik…) trỏ vào dịch vụ `web` cổng 80.
>
> Chạy trên máy tính (cần Node.js 20+): `cd server && npm install && npm start` (cổng 3000), cửa sổ khác `cd web && npm install && npm run dev`, mở http://localhost:5173.
>
> **Bản chạy thử có dữ liệu mẫu**: triển khai một bản riêng với `DEMO_MODE=true`, rồi chạy một lần `docker compose exec api npm run seed:demo` (chỉ chạy trên cơ sở dữ liệu trống). Đăng nhập `chu.cuahang@demo.vn` / `demo1234`.

### Bước 2 — Tạo tài khoản chủ (làm NGAY sau khi đưa lên)
1. Mở địa chỉ web → **Tạo tài khoản mới** bằng email của anh.
2. **Người đăng ký đầu tiên tự động thành chủ** của cả 2 sổ (Thanh Hải và Vũ Gia, đã cài sẵn thuế 1% GTGT + 17% TNCN, 3 mức giá, kênh bán, các bước sản xuất).
3. Từ người thứ hai trở đi, đăng ký xong sẽ **không thấy sổ nào** cho tới khi chủ thêm email đó trong **Cài đặt → Người dùng & quyền**. Vì vậy người lạ có đăng ký cũng không xem được gì. Khi đã đủ tài khoản, có thể đặt `ALLOW_SIGNUP=false` để tắt hẳn việc đăng ký.

### Bước 3 — Thêm nhân viên
1. Nhân viên tự đăng ký bằng email của họ.
2. Chủ vào **Cài đặt → Người dùng & quyền → Thêm người dùng**, nhập email, chọn quyền. Quyền đặt **riêng cho từng sổ**.
3. Bỏ tick **"Xem giá vốn và lợi nhuận"** thì nhân viên không thấy giá vốn, lợi nhuận, giá trị tồn kho ở bất kỳ màn hình nào. Phần ẩn này do máy chủ chặn, không chỉ ẩn trên giao diện.

### Quên mật khẩu
- **Nhân viên:** chủ mở **Cài đặt → Người dùng & quyền → (tên nhân viên) → Đặt mật khẩu mới**, rồi báo lại cho nhân viên.
- **Chủ cửa hàng:** người quản trị máy chủ chạy lệnh (Coolify → dịch vụ api → Terminal, hoặc `docker compose exec api …`):
  ```
  npm run reset-password -- email-cua-anh@gmail.com MatKhauMoi123
  ```
- Ai cũng tự đổi mật khẩu được ở **Cài đặt → Tài khoản của tôi**. Đổi mật khẩu thì các máy khác đang đăng nhập tài khoản đó phải đăng nhập lại.

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

- **Tự động:** mỗi đêm lúc 03:00 máy chủ sao lưu nguyên cơ sở dữ liệu vào `/data/backups/gomsu-YYYY-MM-DD.db` (trong volume `gomsu-data`), giữ 14 bản gần nhất (đổi bằng `BACKUP_KEEP_DAYS`). Bản sao lưu nằm cùng máy chủ, nên bật thêm sao lưu volume của Coolify hoặc định kỳ chép thư mục `backups` ra nơi khác.
- **Tự tải:** **Cài đặt → Nhập / sao lưu dữ liệu → Tải bản sao lưu** (Excel để xem, JSON để lưu trữ). Nên tải mỗi tháng, mỗi sổ một bản, cất trên Google Drive hoặc USB.
- **Khôi phục về một ngày cũ:** dừng dịch vụ api, chép tệp `backups/gomsu-<ngày>.db` đè lên `/data/gomsu.db` (xóa kèm `gomsu.db-wal`, `gomsu.db-shm` nếu có), rồi bật lại. Việc này ghi đè toàn bộ dữ liệu hiện tại, nên giữ lại một bản tệp hiện tại trước khi làm.

## 6. Kiểm thử nghiệp vụ

Trong thư mục `server/`: `npm install` rồi `npm test`. Bộ kiểm thử dựng một cơ sở dữ liệu trống trong bộ nhớ và chạy đủ 9 tình huống yêu cầu:
- bán thu đủ, bán nợ, đặt cọc, giao từng phần, nhận từng phần, trả hàng, hủy đơn, hàng vỡ, nhập cùng SKU giá mới;
- thêm: bán theo bộ, chống ghi trùng, phân quyền, sổ Vũ Gia với TikTok và phí sàn, đối chiếu các số tổng, vận chuyển, tiền về, thông báo, chi phí, chứng từ, đăng nhập và webhook qua HTTP.

Kết quả gần nhất: 361 đạt / 0 lỗi.

Hai người bấm lưu đúng cùng lúc trên cùng một mặt hàng không thể làm lệch số: máy chủ xử lý từng thao tác ghi một, trọn vẹn trong một giao dịch.

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
2. Đặt các biến môi trường của ứng dụng trên Coolify (rồi Deploy lại):
   - `SEPAY_API_KEY` = một chuỗi bí mật anh tự đặt, sau đó nhập đúng chuỗi này trên SePay;
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` = tạo bằng lệnh `npx web-push generate-vapid-keys`;
   - `VAPID_SUBJECT` = `mailto:` + email của anh;
   - `TRACKING_WEBHOOK_SECRET` = chuỗi bí mật, chỉ cần khi nối theo dõi vận đơn tự động.
3. Trên SePay: **WebHooks → Thêm**, URL `https://<tên-miền>/api/hooks/sepay`, kiểu chứng thực **API Key**, dán đúng `SEPAY_API_KEY`. Chọn sự kiện **tiền vào**.
4. Lịch tự động không cần cài: máy chủ tự chạy báo cáo ngày 21:00, nhắc nợ 08:00 và gửi thông báo mỗi phút.
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
1. Đặt `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` như mục 7.2 bước 2. Giao diện tự lấy khóa công khai từ máy chủ, không cần build lại.
2. Lịch tự động chạy sẵn trong máy chủ (giờ Việt Nam):
   - báo cáo ngày lúc 21:00;
   - nhắc nợ lúc 08:00;
   - gửi thông báo mỗi phút (và ngay sau mỗi thao tác tạo thông báo).
3. Trên điện thoại:
   - **Android**: mở phần mềm bằng Chrome → **Cài đặt → Thông báo điện thoại → Bật thông báo trên máy này** → Cho phép.
   - **iPhone** (iOS 16.4 trở lên): mở bằng Safari → nút Chia sẻ → **Thêm vào MH chính** → mở phần mềm từ biểu tượng mới → Cài đặt → bật thông báo.
4. Thông báo được gửi tới **thiết bị đã đăng nhập và bấm bật**, không gửi theo số điện thoại. Mỗi máy bật riêng, và một người có thể bật trên nhiều máy.

### 7.4 Theo dõi vận đơn SPX tự động (làm sau)
Hiện tại trạng thái vận đơn được cập nhật bằng tay hoặc từ file Excel của SPX. Có 2 cách để tự động hoàn toàn:
- **Kết nối chính thức SPX**: SPX cho phần mềm bán hàng kết nối bằng Secret Key lấy tại trang quản trị SPX (Quản lý tài khoản → Hồ sơ shop), nhưng không công bố tài liệu kỹ thuật. Hãy xin nhân viên phụ trách tài khoản SPX tài liệu API hoặc webhook trạng thái đơn. Khi có tài liệu, chỉ cần chuyển dữ liệu SPX gửi sang dạng `{tracking_no, status, detail, at}` rồi gửi vào `https://<tên-miền>/api/hooks/tracking?carrier=SPX&secret=<TRACKING_WEBHOOK_SECRET>`, vì phần ghi sổ, lịch sử và thông báo đã sẵn sàng.
- **Dịch vụ tra vận đơn trả phí** có hỗ trợ SPX Việt Nam, ví dụ TrackingMore: đặt webhook của dịch vụ về `https://<tên-miền>/api/hooks/tracking?secret=<TRACKING_WEBHOOK_SECRET>`. Địa chỉ này đã đọc được định dạng của TrackingMore, nhưng cần thử với tài khoản thật trước khi dựa vào.

### 7.4b Kết nối BEST Express
- **Dùng được ngay:** khi giao hàng, tick **Gửi qua đơn vị vận chuyển**, chọn **BEST Express**, rồi dán mã vận đơn và tiền COD. Hoặc mở đơn rồi bấm **Tạo vận đơn**. Trang **Vận chuyển** lọc được theo hãng. Đối soát COD làm **riêng từng hãng**, vì phần mềm không cho trộn SPX với BEST trong một lần đối soát. Khoản tiền về có chữ "BEST EXPRESS" được gợi ý là tiền COD của BEST.
- **Tự động nhận trạng thái từ BEST:** BEST không công bố tài liệu công khai, nhưng có gửi trạng thái vận đơn về phần mềm của shop qua webhook (đây là cách các phần mềm bán hàng như Getfly đang kết nối). Các bước:
  1. Đặt biến `TRACKING_WEBHOOK_SECRET` trên Coolify (mục 7.2 bước 2). Đã đặt cho SPX rồi thì dùng chung.
  2. Vào **Cài đặt → Đơn vị vận chuyển → BEST Express**, chép địa chỉ `https://<tên-miền>/api/hooks/tracking?carrier=BEST&secret=<khóa>` và gửi cho nhân viên phụ trách tài khoản BEST, đề nghị bật **webhook cập nhật trạng thái vận đơn**.
  3. Xin BEST **danh sách mã trạng thái**. Hiện phần mềm mới biết chắc mã **666 = Giao hàng thành công**; các trạng thái khác được hiểu theo chữ mô tả (Đang giao, Giao không thành công, Hoàn hàng…).
  4. Gửi thử một đơn. Mục **Nhật ký BEST gửi về** (ở cùng trang Cài đặt) hiện từng lần BEST gửi sang. Dòng **"Chưa đọc được"** nghĩa là cần bổ sung cách đọc: gửi lại dòng đó (hoặc danh sách mã của BEST) để chỉnh. Dữ liệu chưa đọc được vẫn được lưu nguyên văn và không gây lỗi.
- **Trong lúc chờ BEST:** cập nhật trạng thái bằng tay ở từng vận đơn, hoặc tải danh sách đơn từ trang quản lý BEST ra Excel rồi dùng **Vận chuyển → Cập nhật từ file Excel**. Phần này đọc được cột "Mã vận đơn / Bill code" và "Trạng thái".
- **Đã thử:** hàm nhận BEST đã chạy trên đúng cơ sở dữ liệu với các kiểu dữ liệu thường gặp (một đơn, danh sách nhiều đơn, dạng form, mã 666). Kết quả: cập nhật đúng trạng thái, BEST gửi lại cùng dữ liệu không bị ghi trùng, mã lạ được lưu vào nhật ký, sai khóa bị chặn. **Chưa thử với BEST thật**, vì chưa có mẫu dữ liệu thật của BEST.

### 7.5 Những phần CHƯA thử được
- **Gửi thông báo tới máy chủ push thật** của Google/Apple và **webhook SePay thật**: cần thử sau khi đưa lên, bằng một giao dịch nhỏ như bước 7.2.5. Webhook SePay và vận đơn đã chạy thử qua HTTP với dữ liệu mẫu: tự gạch nợ đúng, không ghi trùng, sai khóa bị chặn.
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
- **Phông chữ:**
  - Hóa đơn và đơn đặt hàng dùng Arimo, tương đương Arial.
  - Biên bản và các phiếu dùng Tinos, tương đương Times New Roman.
  - Phông được nhúng sẵn trong PDF, nên mở trên điện thoại, máy tính hay gửi Zalo đều đúng dấu tiếng Việt, và chữ chọn hoặc sao chép được.
  - Hai phông này dùng giấy phép Apache 2.0, miễn phí.
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
