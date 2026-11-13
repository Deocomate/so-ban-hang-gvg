# Sổ Bán Hàng Gốm — hướng dẫn triển khai và sử dụng

Phần mềm quản lý bán hàng cho **Gốm sứ Thanh Hải**, **Gốm Vũ Gia** và **Anamtile**. Mỗi thương hiệu là **một sổ riêng**: hàng hóa, khách hàng, quỹ tiền và báo cáo không lẫn vào nhau. Một tài khoản chủ có thể chuyển qua lại giữa các sổ.

## 1. Trong gói này có gì

| Thư mục / tệp | Nội dung |
|---|---|
| `server/` | Máy chủ API (Node.js + SQLite): toàn bộ quy tắc tính toán, phân quyền, báo cáo, đăng nhập, nhận tiền về SePay, nhận trạng thái vận đơn, thông báo điện thoại, lịch tự động, sao lưu hằng đêm. |
| `server/src/db/` | Cấu trúc cơ sở dữ liệu (`schema.sql`) và các bảng tổng hợp (`views.sql`). Máy chủ tự tạo khi khởi động lần đầu. |
| `server/test/` | Bộ kiểm thử: nghiệp vụ bán hàng (146 phép), vận chuyển · tiền về · thông báo (126), chi phí (34), chứng từ và trọng lượng (25), dữ liệu mẫu (12), nhập bản sao lưu (14), quy trình báo giá · hợp đồng · hóa đơn (40), HTTP · đăng nhập · webhook (34). |
| `web/` | Giao diện (React + Vite). Khi build Docker, giao diện được dựng sẵn và máy chủ API trả luôn (không cần nginx). |
| `Dockerfile`, `docker-compose.yml` | Đóng gói cả giao diện và API vào **một** container, chạy bằng Docker (Coolify). |
| `.env.example` | Danh sách biến cấu hình (khóa SePay, khóa thông báo…). |
| `mau-excel/` | File mẫu để nhập hàng hóa, khách hàng, nhà cung cấp lần đầu. |

Cơ sở dữ liệu là **một tệp SQLite** (`/data/gomsu.db` trong Docker volume `gomsu-data`), không cần máy chủ cơ sở dữ liệu riêng.

## 2. Đưa lên chạy thật (Coolify, làm một lần)

### Bước 1 — Tạo ứng dụng trên Coolify
1. Đưa thư mục này lên một kho Git (GitHub/GitLab, để chế độ riêng tư).
2. Coolify → **Project → New Resource → Docker Compose**, chọn kho Git vừa tạo. Coolify tự đọc `docker-compose.yml`.
3. Ở dịch vụ **app** (dịch vụ duy nhất), đặt **Domain** kèm cổng 3000, ví dụ `https://so.gomsu.vn:3000` (`:3000` là cổng bên trong container; người dùng vẫn vào bằng https bình thường). Compose dùng `expose`, không chiếm cổng của máy chủ nên không trùng với ứng dụng khác.
4. Mục **Environment Variables**: chép các biến trong `.env.example` và điền giá trị (xem mục 7). Có thể để trống hết lúc đầu; `JWT_SECRET` để trống thì máy chủ tự tạo và lưu trong volume.
5. Bấm **Deploy**. Khi dịch vụ báo "healthy", mở tên miền đã đặt.

> Không dùng Coolify: `cp .env.example .env`, sửa `.env`, rồi `docker compose up -d --build`, và cho reverse proxy (nginx, Caddy, Traefik…) trỏ vào dịch vụ `app` cổng 3000.
>
> **Chạy trên máy Windows, không cần biết code:** bấm đúp tệp `Mo-Ung-Dung.bat` ở thư mục gốc. Một cửa sổ **Bảng điều khiển** hiện ra (mở bằng Edge hoặc Chrome có sẵn trên máy), mọi thao tác đều bấm nút trong đó:
> - **Bật / Tắt / Khởi động lại ứng dụng**, nút **Mở trang bán hàng** (http://localhost:5173). Lần đầu mất khoảng 1 phút: tự cài Node.js nếu máy chưa có, tự cài thư viện, nạp dữ liệu mẫu.
> - **Dữ liệu mẫu (bật/tắt):** bật thì dùng kho mẫu `server/data`, tài khoản chủ lấy theo `ADMIN_EMAIL`, `ADMIN_PASSWORD` trong `.env` (sửa `.env` rồi bấm Khởi động lại là cập nhật), có nút giả lập tiền về, vận đơn. Tắt thì dùng kho sổ riêng `server/data-rieng`, trống; Tổng quản trị lấy theo `ADMIN_EMAIL`, `ADMIN_PASSWORD` trong `.env`. Hai kho không lẫn nhau, đổi qua lại không mất dữ liệu.
> - **Nạp lại dữ liệu mẫu:** làm lại từ đầu. Dữ liệu cũ được cất vào `server/data/truoc-nap-lai`.
> - **Sao lưu ngay**, **Mở thư mục sao lưu**, **Nhật ký** (có nút sao chép để gửi người phụ trách).
> - **Tùy chọn:** tự bật ứng dụng khi mở bảng điều khiển, tự mở trang bán hàng sau khi bật xong.
> - Sửa mã là trình duyệt tự cập nhật: sửa giao diện thì đổi ngay, sửa `server/src` thì máy chủ tự khởi động lại rồi trang tự tải lại.
> - Đóng bảng điều khiển thì ứng dụng tắt theo, không chạy ngầm. Bấm đúp tệp lần nữa khi đang mở thì chỉ mở thêm cửa sổ.
> - Muốn có nút ngoài màn hình: chuột phải tệp → **Send to → Desktop (create shortcut)**.
> - Nếu ứng dụng đã chạy bằng cách khác (`npm run dev`, khung Preview), bảng điều khiển chỉ mở trang được; muốn tắt thì tắt ở nơi đã chạy.
> - Mở thư mục này bằng Claude Code rồi sửa thì xem luôn ở khung Preview (cấu hình `app` trong `.claude/launch.json`, chạy `scripts/start.js`, dùng cùng chế độ dữ liệu với bảng điều khiển).
>
> Chạy bằng lệnh (cần Node.js 20+): ở thư mục gốc chạy `npm run setup` (một lần, cài thư viện cho `server/` và `web/`), sau đó mỗi lần chỉ cần `npm run dev`, nó chạy cùng lúc API (cổng 3000) và giao diện, rồi mở http://localhost:5173. Bấm Ctrl+C để dừng cả hai. Dữ liệu trên máy nằm ở `server/data/gomsu.db`.
>
> **Dữ liệu mẫu theo giấy tờ thật (chỉ trên máy)**: khi các sổ chưa có hàng hóa, chạy `npm run seed:sample` ở thư mục gốc. Lệnh tự sao lưu `server/data/gomsu.db` rồi nạp bảng giá, khách hàng, nhà cung cấp, hợp đồng 1009, hóa đơn, bảng đặt xưởng, báo giá vào cả 3 sổ. Tài khoản chủ theo `ADMIN_EMAIL`, `ADMIN_PASSWORD` trong `.env` (chưa điền thì dùng `chu.cuahang@demo.vn` / `demo1234`); nhân viên `lan.nhanvien@demo.vn` dùng chung mật khẩu đó. Giá vốn, tồn đầu kỳ, số dư quỹ, chi phí, số hóa đơn và cước xe là số giả định vì giấy tờ không có.
>
> **Bản chạy thử có dữ liệu mẫu**: triển khai một bản riêng với `DEMO_MODE=true`, rồi chạy một lần `docker compose exec app npm run seed:demo` (chỉ chạy trên cơ sở dữ liệu trống). Đăng nhập `chu.cuahang@demo.vn` / `demo1234`.

### Bước 2 — Tổng quản trị đầu tiên (làm NGAY sau khi đưa lên)
1. Khai `ADMIN_EMAIL`, `ADMIN_PASSWORD` (ít nhất 8 ký tự, có chữ và số), `APP_URL` (địa chỉ trang web) và Gmail gửi thư `SMTP_USER`, `SMTP_PASS` (xem `.env.example`), rồi khởi động máy chủ.
2. Máy chủ tạo tài khoản **Tổng quản trị** và 3 sổ (Thanh Hải, Vũ Gia, Anamtile). Việc này chỉ xảy ra khi hệ thống **chưa có Tổng quản trị nào**.
3. Đăng nhập lần đầu, phần mềm **bắt đổi mật khẩu**. Sau đó mật khẩu chỉ chủ tài khoản biết: sửa `.env` hay khởi động lại cũng không đặt lại được. Nên xóa `ADMIN_PASSWORD` khỏi tệp môi trường sau bước này.
4. Bấm tên tài khoản ở góc phải trên → **Tài khoản của tôi**, bấm **Gửi link xác thực email** để xác nhận email quản trị.

Không còn tự đăng ký tài khoản: mọi người dùng đều do Tổng quản trị mời.

### Bước 3 — Mời nhân viên, cấp quyền
1. Tổng quản trị vào **Cài đặt → Người dùng & quyền → Mời người dùng**, nhập email, chọn quyền ở từng sổ:
   - **Không truy cập**: không thấy sổ đó.
   - **Nhân viên (theo quyền)**: chọn một **vai trò mẫu** (Nhân viên bán hàng, Thủ kho, Kế toán, Nhân sự, Chỉ xem), rồi tick thêm / bỏ từng ô nếu người này cần khác vai trò.
   - **Quản lý sổ**: toàn quyền nghiệp vụ trong sổ đó (cài đặt sổ, lương…), nhưng không quản lý người dùng.
   - Ô **Tổng quản trị**: quản lý người dùng, vai trò, nhật ký bảo mật, toàn quyền cả 3 sổ.
2. Nhân viên nhận thư mời, bấm link (hạn 7 ngày) để tự đặt mật khẩu. Bấm link xong là email đã được xác thực. Không ai khác biết mật khẩu của nhân viên.
3. Quyền **xem** tách khỏi quyền **sửa**: ví dụ "Xem đơn bán" mà không có "Tạo / sửa đơn bán" thì chỉ xem. Có quyền sửa thì tự có quyền xem cùng nhóm.
4. Bỏ tick **"Xem giá vốn, lợi nhuận"** thì nhân viên không thấy giá vốn, lợi nhuận, giá trị tồn kho ở bất kỳ màn hình nào. Mọi quyền đều do máy chủ chặn, không chỉ ẩn trên giao diện.
5. **Cài đặt → Vai trò**: sửa quyền của một vai trò thì mọi người đang dùng vai trò đó đổi theo ngay; thêm vai trò mới khi có khâu mới.
6. Trong hộp thoại của từng người: gửi lại lời mời, gửi email đặt lại mật khẩu, đăng xuất người đó khỏi mọi thiết bị, **khóa tài khoản** (người nghỉ việc: khóa là mất quyền ngay, lịch sử chứng từ vẫn giữ tên họ).

### Tài khoản của mỗi người (bấm tên ở góc phải trên → Tài khoản của tôi)
- Sửa tên, số điện thoại; đổi mật khẩu; đổi email đăng nhập (link xác nhận gửi tới email mới, email cũ nhận thư báo).
- **Đăng xuất mọi thiết bị khác** khi quên đăng xuất ở máy khác hoặc nghi lộ mật khẩu.
- Mỗi lần đổi / đặt lại mật khẩu, đổi email, chủ tài khoản đều nhận thư báo.

### Quên mật khẩu
- Ở trang đăng nhập bấm **Quên mật khẩu?**, nhập email → nhận link đặt mật khẩu mới (hạn 60 phút, dùng 1 lần).
- Tổng quản trị cũng gửi được email đặt lại mật khẩu cho nhân viên trong **Người dùng & quyền**.
- Khẩn cấp (máy chủ chưa gửi được thư): người quản trị máy chủ chạy `npm run reset-password -- email@gmail.com MatKhauTam123`. Lần đăng nhập tới phải đổi mật khẩu, việc này được ghi vào **Nhật ký bảo mật** và báo qua email cho chủ tài khoản.

### Nhật ký bảo mật (Cài đặt → Nhật ký bảo mật, chỉ Tổng quản trị)
Ghi mọi lần đăng nhập (kể cả sai), đổi / đặt lại mật khẩu, đổi email, cấp quyền, khóa tài khoản, kèm thời điểm và IP.

### Dev kiểm thử mà không thấy dữ liệu thật
- Dev **không có tài khoản** trên bản chạy thật. Dev test toàn bộ trên máy mình bằng dữ liệu mẫu (`npm run seed:sample` hoặc bật Dữ liệu mẫu ở Bảng điều khiển): có sẵn tài khoản quản trị mẫu, `lan.nhanvien@demo.vn` và một tài khoản cho mỗi vai trò mẫu (`nhan-vien-ban-hang.mau@demo.vn`, `thu-kho.mau@demo.vn`, `ke-toan.mau@demo.vn`, `nhan-su.mau@demo.vn`, `chi-xem.mau@demo.vn`), cùng mật khẩu với quản trị mẫu.
- Máy dev chưa khai SMTP thì thư (link mời, quên mật khẩu) in ra cửa sổ nhật ký của máy chủ để test. Bản chạy thật không bao giờ in link ra log.
- Mật khẩu quản trị thật chỉ chủ doanh nghiệp biết (xem Bước 2). Dev giữ `.env` cũng không đăng nhập được.
- Giới hạn cần biết: ai có quyền **root trên máy chủ** vẫn đọc được tệp CSDL và bản sao lưu. Phần mềm không chặn được điều đó, chỉ làm cho mọi can thiệp qua ứng dụng đều để lại dấu vết. Muốn kín hoàn toàn thì sau khi bàn giao, chủ doanh nghiệp giữ mật khẩu root / SSH và chỉ cấp cho dev khi cần cập nhật bản mới.

## 3. Nhập dữ liệu ban đầu (một lần, ngày 01/10/2026)

Làm lần lượt trong **từng sổ** (chọn sổ ở thanh trên cùng trước):

1. **Cài đặt → Thông tin sổ**: kiểm tra tên sổ, thuế, tên các mức giá (3 mức bắt buộc, mức 4 và 5 có thể để trống), hàng có đóng gói hay không, địa chỉ và điện thoại in trên phiếu.
2. **Cài đặt → Quỹ tiền**: nhập số dư đầu kỳ của Tiền mặt và Tài khoản ngân hàng (thêm quỹ nếu cần, ví dụ "Ví TikTok").
3. **Sản phẩm → Nhập từ Excel**: dùng file có sẵn của cửa hàng, hoặc nút **Tải file mẫu** (giống `mau-excel/mau-hang-hoa_ThanhHai.xlsx` và `_VuGia`). File mẫu mỗi sổ chỉ có các cột sổ đó dùng: sổ Thanh Hải có chất liệu, định mức, 5 mức giá và các cột đóng gói; sổ Vũ Gia có 4 mức giá Lẻ / Sỉ / CTV / CH và không có cột đóng gói, định mức.
   - Cột **Định mức** ghi kiểu "27 viên/m2" (theo m²) hoặc "5 viên/m dài" (theo mét dài).
   - Mỗi dòng là một biến thể và có một mã SKU riêng. Để trống SKU thì hệ thống tự cấp mã.
   - Số lượng × giá vốn được ghi thành **phiếu Tồn đầu kỳ**. Phiếu này không tính vào doanh thu hay công nợ.
   - Sau khi ghi có **bảng đối chiếu** giữa "Theo file" và "Đã ghi vào sổ" (số mã, tổng số lượng, tổng giá trị), mỗi dòng ghi Khớp hoặc Lệch.
   - File gốc không bị sửa.
4. **Khách hàng → Nhập từ Excel** (`mau-khach-hang.xlsx`): gồm mức giá áp dụng, số ngày được nợ, **nợ đầu kỳ** và hạn trả.
5. **Nhà cung cấp → Nhập từ Excel** (`mau-nha-cung-cap.xlsx`): gồm nợ đầu kỳ với xưởng.
6. Xem lại **Tổng quan**: giá trị tồn kho, khách còn nợ, nợ nhà cung cấp và tồn quỹ phải khớp với sổ cũ.

### Quy trình nhập từ file Excel

Hàng hóa, khách hàng và nhà cung cấp đều nhập theo 3 bước. Đọc được `.xlsx`, `.xls`, `.csv`.

1. **Chọn file.** File nhiều sheet thì phần mềm tự chọn sheet khớp nhiều cột nhất, và tự tìm dòng tiêu đề. Có thể đổi lại cả hai.
2. **Chọn cột.** Mặc định chọn tất cả các cột nhận ra được.
   - Bỏ tick cột nào thì cột đó không được nhập, dữ liệu trong sổ giữ nguyên.
   - Cột chưa nhận ra thì chọn ở ô **Nhập vào**. Mỗi trường chỉ nhận từ một cột.
   - Cảnh báo ở đầu bước: cột trống, cột có ô sai định dạng, cột có dữ liệu nhưng không có chỗ nhập, cột đang ẩn trong Excel, thiếu cột mã.
   - Bị chặn không cho đi tiếp nếu không nhận ra cột nào, hoặc không có cả cột Tên lẫn cột Mã.
3. **Kiểm tra & nhập.** Mỗi dòng có một trạng thái: Mới, Cập nhật (nêu rõ từng giá trị đổi), Không đổi, Nghi trùng, Lỗi. Dòng lỗi bị bỏ qua, các dòng khác vẫn nhập được.

Quy tắc khi nhập:

- **Không dùng cột nào** (ví dụ Mẫu, Màu sắc / men): để trống cả cột, xóa cột, hoặc bỏ tick đều được.
- **Ô trống:** hàng mới để trống, hàng đã có giữ nguyên giá trị cũ. Ô trống không bao giờ xóa dữ liệu trong sổ.
- **Cập nhật một phần:** file chỉ cần cột mã và cột muốn đổi, ví dụ SKU + Giá lẻ để sửa giá hàng loạt.
- **Mã đã có:** chỉ cập nhật thông tin và giá. Tồn kho, giá vốn và nợ đầu kỳ không đổi theo file.
- **Không có mã:** dòng giống hệt dữ liệu trong sổ được đánh dấu Nghi trùng và mặc định bỏ qua. Hàng so theo tên, mẫu, cỡ, màu, ĐVT; khách và nhà cung cấp so theo tên, điện thoại.
- **Nhập lại cùng file** không nhân đôi: mọi dòng báo Không đổi.

File tải về từ nút **Xuất Excel** ở trang Hàng hóa, Khách hàng, Nhà cung cấp nhập lại được ngay: sửa giá hoặc thông tin trong Excel rồi nhập lại. Các cột chỉ để xem như Còn phải thu, Quá hạn sẽ được báo là không nhập.

### Mức giá 4, 5, đóng gói và bán khi chưa có tồn

- **Mức giá 4 và 5:** bật bằng cách đặt tên ở **Cài đặt → Mức giá bán** (muốn dùng mức 5 thì phải có tên mức 4). Sổ Thanh Hải có sẵn 5 mức: Giá lẻ, Giá đại lý I, Giá công trình, Giá đại lý II, Giá công trình lẻ. Sổ Vũ Gia có 4 mức: Giá lẻ, Giá sỉ, Giá CTV, Giá CH. Khi đó sản phẩm, khách hàng, đơn hàng và file Excel đều có thêm các mức này. Muốn bỏ một mức thì xóa tên của nó, sau khi đã đổi mức giá của các khách đang dùng.
- **Hàng có đóng gói (hộp, thùng):** tick trong **Cài đặt → Hàng hóa**. Sổ Thanh Hải bật sẵn, mỗi mã tự chọn đóng theo hộp hoặc theo thùng. Sổ Vũ Gia tắt sẵn: form hàng hóa, màn bán hàng và chứng từ không hiện quy cách, số hộp; trọng lượng mỗi cái vẫn dùng để tính tổng kg khi gửi hàng.
- **Bán khi tồn kho không đủ:** mặc định được bán, kể cả khi tồn thành số âm (ví dụ hàng chưa nhập kho nhưng đã giao cho khách). Chủ cửa hàng và nhân viên có quyền bán hàng đều giao được, không cần tick thêm. Muốn chặn thì bỏ tick **Cho phép bán khi tồn kho không đủ** trong Cài đặt của từng sổ.
- **Khi bán vượt tồn:** tồn kho bị âm và hiện "âm kho" cho đến khi nhập hàng về. Phần chênh lệch được tính vào giá vốn lúc nhập, nên lãi của các đơn đó có thể chưa chính xác.

### Khi cập nhật phần mềm

Nếu bản mới đổi cấu trúc dữ liệu, máy chủ tự sao lưu rồi nâng cấp khi khởi động. Bản sao nằm cạnh file dữ liệu, tên kết thúc bằng `.truoc-nang-cap-v1.bak`.

## 4. Quy tắc tính (đã kiểm thử)

| Nghiệp vụ | Ảnh hưởng |
|---|---|
| Đơn **nháp** | Không giữ hàng, không tính doanh thu |
| Đơn **đã xác nhận** | Giữ hàng (giảm "có thể bán"), chưa tính doanh thu |
| **Giao hàng** | Trừ kho, ghi doanh thu và giá vốn (theo phương pháp đang chọn, lưu cố định), phát sinh công nợ |
| **Tiền cọc** | Không phải doanh thu; hiện là "khách trả trước" |
| **Đặt hàng nhập / đặt xưởng** | Không tăng kho. Chỉ khi **nhận hàng** (hoặc bấm Hoàn thành ở phiếu nhập hàng) mới tăng kho và giá vốn bình quân |
| **Giảm giá khi nhập** | Giảm giá từng dòng và giảm giá cả phiếu đều trừ vào giá nhập, nên giá vốn và nợ nhà cung cấp tính theo số đã giảm |
| **Hủy phiếu nhập** | Xuất lại kho đúng giá trị đã nhập. Phải hủy phiếu chi và phiếu trả hàng nhập của phiếu đó trước |
| **Trả hàng nhập** | Xuất kho (theo giá đã nhập, hoặc giá vốn bình quân nếu lập riêng) và giảm nợ nhà cung cấp theo **giá trả lại** |
| Bước sản xuất | Chờ sản xuất → Đang sản xuất → Đang trong lò → Đã sản xuất, chưa giao hàng → Đang giao về. "Đã nhận một phần / đủ" do phần mềm tự cập nhật |
| **Khách trả hàng** | Đảo doanh thu và giá vốn theo đúng giá lúc giao. Hàng lỗi không nhập lại thì ghi vào hao hụt |
| **Vỡ, lỗi, thất thoát** | Phiếu điều chỉnh kho có lý do; giá trị tính vào chi phí vận hành |
| **TikTok** | Phí sàn ghi vào phiếu thu → tự tạo chi phí "Phí sàn TMĐT"; quỹ nhận số tiền thực về |
| Xóa / sửa | Không xóa lịch sử. Phiếu sai thì **hủy** (vẫn lưu, có lý do) rồi lập lại. Mọi thay đổi ghi vào Nhật ký |
| Bấm lưu 2 lần | Không ghi trùng (mỗi lần bấm có một mã yêu cầu) |
| Bán vượt tồn | Bị chặn (có thể mở trong Thiết lập) |
| Khóa sổ | Đặt "Khóa sổ đến ngày" sau khi chốt tháng; không ai ghi được chứng từ vào kỳ đã khóa |

Thuế GTGT 1% và thuế TNCN 17% trong phần mềm là **số ước tính để quản trị**, không thay tờ khai. Quy định thuế hộ kinh doanh có thể thay đổi, anh nên đối chiếu với kế toán.

## 5. Sao lưu và khôi phục

- **Tự động:** mỗi đêm lúc 03:00 máy chủ sao lưu nguyên cơ sở dữ liệu vào `/data/backups/gomsu-YYYY-MM-DD.db` (trong volume `gomsu-data`), giữ 14 bản gần nhất (đổi bằng `BACKUP_KEEP_DAYS`). Bản sao lưu nằm cùng máy chủ, nên bật thêm sao lưu volume của Coolify hoặc định kỳ chép thư mục `backups` ra nơi khác.
- **Tự tải:** **Cài đặt → Nhập / sao lưu dữ liệu → Tải bản sao lưu** (Excel để xem, JSON để lưu trữ). Nên tải mỗi tháng, mỗi sổ một bản, cất trên Google Drive hoặc USB.
- **Khôi phục về một ngày cũ:** dừng dịch vụ app, chép tệp `backups/gomsu-<ngày>.db` đè lên `/data/gomsu.db` (xóa kèm `gomsu.db-wal`, `gomsu.db-shm` nếu có), rồi bật lại. Việc này ghi đè toàn bộ dữ liệu hiện tại, nên giữ lại một bản tệp hiện tại trước khi làm.

### Chuyển dữ liệu từ bản cũ (Supabase) sang máy chủ mới
1. Trên **bản cũ**, đăng nhập tài khoản chủ, chọn sổ **Thanh Hải** → **Cài đặt → Nhập / sao lưu dữ liệu → Tải bản sao lưu JSON**. Làm tương tự với sổ **Vũ Gia**. Được 2 tệp `sao-luu_TH_….json` và `sao-luu_VG_….json`.
2. Trên **máy chủ mới**, tạo tài khoản chủ (mục 2, Bước 2). Hai sổ trống được tạo sẵn.
3. Chọn sổ **Gốm sứ Thanh Hải** → **Cài đặt → Nhập / sao lưu dữ liệu → Nhập bản sao lưu JSON** → chọn tệp của Thanh Hải → xem tóm tắt → bấm **Nhập** (bấm 2 lần để xác nhận). Chuyển sang sổ **Gốm Vũ Gia** và nhập tệp của Vũ Gia.
4. Kiểm tra bảng kết quả: số dòng từng loại dữ liệu và dòng "Tồn kho từng mã khớp sổ kho". Đối chiếu Tổng quan với bản cũ.
5. Thêm lại nhân viên trong **Người dùng & quyền** (tài khoản đăng nhập không chuyển theo tệp, nhân viên đăng ký lại bằng email của họ). Thông báo điện thoại cũng phải bật lại trên từng máy.

- Chỉ nhập được vào sổ **chưa có chứng từ**. Danh mục mặc định của sổ trống (2 quỹ, khách lẻ) được thay bằng dữ liệu trong tệp. Mã chứng từ tiếp tục đánh số nối tiếp bản cũ.
- Máy chủ tự sao lưu cơ sở dữ liệu ngay trước mỗi lần nhập (`/data/backups/gomsu-<ngày>-truoc-nhap-….db`).
- Chức năng này cũng dùng để khôi phục một sổ sang máy chủ khác bằng tệp JSON tải từ máy chủ mới.

## 6. Kiểm thử nghiệp vụ

Trong thư mục `server/`: `npm install` rồi `npm test`. Bộ kiểm thử dựng một cơ sở dữ liệu trống trong bộ nhớ và chạy đủ 9 tình huống yêu cầu:
- bán thu đủ, bán nợ, đặt cọc, giao từng phần, nhận từng phần, trả hàng, hủy đơn, hàng vỡ, nhập cùng SKU giá mới;
- thêm: bán theo bộ, chống ghi trùng, phân quyền, sổ Vũ Gia với TikTok và phí sàn, đối chiếu các số tổng, vận chuyển, tiền về, thông báo, chi phí, chứng từ, đăng nhập và webhook qua HTTP.

Kết quả gần nhất: 375 đạt / 0 lỗi.

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
| Phiếu thu / phiếu chi | Thu chi → mở phiếu → **Xuất phiếu PDF**; tự mở khi giao hàng có tick "Thu luôn" hoặc thu tiền nhanh trên danh sách | Hộ kinh doanh |

- **Sau khi giao hàng:** khung **Xuất chứng từ giao hàng** bên trái cho chọn Hợp đồng vận chuyển, Hóa đơn bán hàng, Biên bản giao hàng (và Phiếu thu nếu vừa thu tiền). Chọn 1 hoặc nhiều rồi bấm **Tải … chứng từ**: mặc định gộp vào một tệp PDF, mỗi chứng từ một trang mới; bỏ tick "Gộp vào một tệp PDF" để tải từng tệp. Lựa chọn được nhớ cho lần sau.
- **Giao nhanh / thu nhanh trên danh sách** mở chứng từ ở tab mới của trình duyệt. Trình duyệt chặn cửa sổ bật lên thì chứng từ mở ngay trong trang đang xem.

### Sửa đơn đã giao, đã thu và lịch sử đơn

- Nút **Sửa** luôn có ở chi tiết đơn (trừ đơn đã hủy), kể cả khi đã giao đủ, đã thu đủ. Sửa giá, chiết khấu, giảm giá, phí vận chuyển thì tiền hàng đã giao tự tính lại; khách còn nợ hay trả dư hiện ngay theo số mới.
- Dòng hàng đã giao không bỏ được, không đổi sang hàng khác và không giảm dưới số đã giao. Đơn đã có phiếu thu thì không đổi được khách. Đơn đã có hàng khách trả lại thì không đổi được tiền hàng đã giao.
- **Giao nhầm:** ở mục "Các đợt giao hàng", bấm **Hủy đợt giao**, ghi lý do. Hàng nhập lại kho đúng giá vốn đã xuất, doanh thu đợt đó bỏ đi, đơn quay lại chờ giao, tiền đã thu thành tiền khách trả trước. Sau đó sửa đơn như đơn chưa giao.
- **Thu nhầm:** mở phiếu thu và hủy phiếu (quyền chủ sổ).
- Mục **Lịch sử đơn hàng** cuối chi tiết đơn ghi mọi thao tác: ai làm, lúc nào, tạo đơn, sửa gì từ bao nhiêu thành bao nhiêu, giao, hủy đợt giao, thu / hoàn tiền, hủy phiếu, trả hàng, hủy đơn. Ai xem được đơn bán đều xem được lịch sử. Đơn lập trước bản này chỉ có lịch sử từ lúc cập nhật.

- **Cài đặt một lần:** vào **Cài đặt → Mẫu in** (chỉ quản lý sổ).
  - Thẻ **Đơn vị phát hành & phông chữ**: tên, địa chỉ, điện thoại, email, website, dòng số tài khoản, người đại diện, logo. Có thể khai nhiều đơn vị (ví dụ Hộ kinh doanh gốm sứ Mai Hiếu và Công ty TNHH SX&TM Thanh Hải).
  - Thẻ **Quản lý mẫu in**: cột trái là các loại chứng từ, ở giữa là các mẫu của loại đó kèm bản xem trước. Chọn đơn vị phát hành cho từng loại; **Tạo mẫu in**, **Nhân bản**, **Đặt làm mặc định**, **Xóa** (xóa hết thì quay về mẫu gốc của hệ thống).
  - Mỗi sổ (Thanh Hải, Vũ Gia, Anamtile) có mẫu riêng. Sổ mới có sẵn 2 đơn vị đứng tên là Công ty Thanh Hải và HKD Mai Hiếu; khi xuất chứng từ, đổi đơn vị ở mục **Đơn vị đứng tên**.
- **Sửa mẫu in (giống KiotViet):** bấm **Sửa** — trình sửa mở ở tab mới.
  - Bên trái sửa trực tiếp như soạn văn bản: phông, cỡ chữ, đậm / nghiêng / gạch, màu chữ, màu nền, căn lề, danh sách, giãn dòng và khoảng cách đoạn, chèn ảnh, kẻ ngang, ngắt trang. Bảng: chèn bảng, thêm / xóa dòng cột, gộp / tách ô, bật tắt viền, màu nền ô, kéo mép cột để đổi độ rộng.
  - Thông tin tự điền (tên khách, ngày, thành tiền…) hiện dạng thẻ màu. Gõ `/` rồi gõ vài chữ để chèn nhanh, hoặc bấm **chèn thông tin** để chọn theo nhóm, có ô tìm kiếm. Thẻ xanh lá là thông tin hàng hóa: đặt trong một dòng bảng thì dòng đó tự lặp cho từng mặt hàng. Dòng có thông tin trống (chiết khấu bằng 0, VAT 0%, không trả hàng…) tự ẩn khi in.
  - Bên phải là bản xem trước đúng khổ giấy: chọn khổ A4, A5, K80, K58, khổ dọc / ngang, lề giấy, dấu phân cách hàng nghìn, thu phóng; xem bằng dữ liệu mẫu hoặc chọn một đơn / phiếu thật.
  - **Chọn mẫu gợi ý** để lấy lại mẫu gốc, mẫu giấy cuộn K80 (hóa đơn, phiếu thu) hoặc chép từ mẫu khác. **Source** để sửa thẳng mã HTML. **In thử** in ngay mẫu đang soạn. **Đặt lại** bỏ thay đổi chưa lưu. **Lưu mẫu** (Ctrl+S) xong thì các tab khác đang mở dùng mẫu mới ngay.
- **Quy cách đóng gói:** trong sản phẩm, điền "Số viên / hộp" (ví dụ 140) và đơn vị đóng gói (hộp, thùng, kiện…). Khi đó chứng từ tự in dòng "4 hộp x 140 viên + 40 viên" và tự tính tổng số hộp (hộp lẻ tính 1 hộp). File Excel nhập hàng có thêm 2 cột "Số viên/hộp" và "Đơn vị đóng gói".
- **Sửa trước khi tải:** bên trái bản xem trước có các ô sửa được, như ngày trên chứng từ, SĐT và địa chỉ nhận hàng, tổng số hộp, nợ cũ, lái xe, người nhận và tình trạng hàng. Bấm **In** (in thẳng ra máy in) hoặc **Tải PDF** thì phần mềm tự lưu các ô này để lần sau mở lại vẫn còn. Loại chứng từ có nhiều mẫu thì chọn ở ô **Mẫu in**; quản lý sổ có thêm đường dẫn **Sửa mẫu in này**.
- **Số tiền trên hóa đơn:**
  - Nợ cũ = công nợ hiện tại của khách trừ phần của chính đơn này. Ô này sửa được.
  - Tổng thanh toán = tiền hàng + nợ cũ + tiền vận chuyển.
  - Còn thanh toán = Tổng thanh toán − đã thanh toán (gồm cả tiền cọc).
  - Số tiền bằng chữ in theo dạng "Mười ba triệu tám trăm nghìn đồng chẵn".
- **Biên bản và phiếu xuất kho** lập theo từng lần giao. Nếu chưa giao, chọn "Cả đơn" để in trước, giao cho lái xe mang theo.
- **Phiếu thu, phiếu chi và phiếu xuất kho** có dòng "Mẫu số … Thông tư 88/2021/TT-BTC" ở góc phải. Muốn bỏ dòng này thì sửa mẫu in và xóa ô đó. Nếu đơn vị phát hành là công ty, nên sửa dòng này theo chế độ kế toán công ty đang áp dụng (hỏi kế toán).
- **Phông chữ:**
  - Tất cả chứng từ dùng chung một phông, mặc định Arial (Arimo). Muốn đổi sang Times New Roman (Tinos) thì vào **Cài đặt → Mẫu in → Đơn vị phát hành & phông chữ**; từng đoạn chữ trong mẫu cũng chọn phông riêng được. Bản xem trước dùng đúng phông sẽ in.
  - Phông được nhúng sẵn trong PDF, nên mở trên điện thoại, máy tính hay gửi Zalo đều đúng dấu tiếng Việt, và chữ chọn hoặc sao chép được.
  - Hai phông này dùng giấy phép Apache 2.0, miễn phí.
- **Đây không phải hóa đơn điện tử.** "Hóa đơn bán hàng" ở đây là chứng từ nội bộ để giao cho khách, không thay hóa đơn điện tử có mã của cơ quan thuế. Hộ kinh doanh có doanh thu trên 1 tỷ đồng/năm thuộc diện phải dùng hóa đơn điện tử theo quy định hiện hành, nên hỏi lại cán bộ thuế hoặc kế toán để áp dụng cho đúng.

## 10. Màn hình tạo đơn bán (kiểu quầy)

Bấm **Tạo đơn bán** thì màn hình tạo đơn mở toàn màn hình. Không cần bấm "Thêm dòng":

- **Thêm hàng:** gõ tên hoặc mã vào ô tìm kiếm trên cùng (phím **F3**), rồi bấm vào sản phẩm hoặc nhấn Enter. Hàng vào đơn ngay. Chọn lại cùng sản phẩm thì số lượng cộng thêm 1. Máy quét mã vạch dùng được nếu mã vạch trùng mã SKU.
- **Mỗi dòng hàng** có nút −/+ và ô số lượng, đơn giá (tự lấy theo mức giá của khách), chiết khấu %. Nếu sản phẩm có quy cách thì hiện luôn số hộp và trọng lượng, ví dụ "4 thùng x 140 viên + 40 viên · 120 kg" (xem mục 11).
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

- **Khai trong sản phẩm** (Hàng hóa → mở sản phẩm → Sửa):
  - "Quy cách: số viên / thùng" và đơn vị đóng gói (hộp, thùng, kiện…);
  - "Trọng lượng 1 thùng (kg)" (ví dụ 28) và/hoặc "Trọng lượng 1 viên (kg)" (ví dụ 0,2). Chỉ cần một trong hai ô; có cả hai thì phần mềm dùng kg/viên.
- **Khi tạo đơn**, gõ số lượng là ngay dưới tên sản phẩm tự hiện cách chia thùng và trọng lượng của dòng đó. Cột bên phải hiện **Tổng trọng lượng** và tổng số thùng của cả đơn (thùng lẻ tính 1 thùng).
- Sản phẩm chưa khai quy cách có nút "+ Khai số viên/thùng" ngay trên dòng hàng. Nếu có mặt hàng chưa khai trọng lượng, phần mềm ghi rõ "thiếu N mặt hàng chưa khai" để không hiểu nhầm là tổng đã đủ.
- Tổng trọng lượng cũng hiện trong chi tiết đơn, trên **biên bản bàn giao** và **phiếu xuất kho**, tiện báo xe và đối chiếu khi bốc hàng.
- **File Excel nhập hàng** có thêm 2 cột "Trọng lượng/thùng (kg)" và "Trọng lượng/viên (kg)" (tiêu đề "Trọng lượng/hộp" cũng được nhận). Ghi kiểu "140 viên/ thùng", "28kg/ thùng", "0,20" cũng đọc được; cột "Quy cách" ghi "140 viên/ thùng" thì phần mềm hiểu là 140 viên mỗi thùng.
- **Máy chủ đang chạy bản cũ:** chỉ cần cập nhật và khởi động lại. Máy chủ tự thêm 2 cột trọng lượng vào cơ sở dữ liệu; dữ liệu cũ giữ nguyên, ô trọng lượng để trống.

## 12. Bố cục màn hình

- **Thanh trên cùng:** tên sổ, nút chuyển sổ Thanh Hải / Vũ Gia / Anamtile, chuông thông báo, nút Cài đặt và menu tài khoản (đăng xuất).
- **Thanh menu (màu theo logo từng sổ):** Tổng quan · Hàng hóa (danh sách, bảng giá, tồn kho & kiểm kho) · Mua hàng (nhà cung cấp, hóa đơn đầu vào, nhập hàng, đặt hàng nhập, trả hàng nhập, mua dịch vụ) · Báo giá · Hợp đồng · Đơn hàng (đặt hàng, hóa đơn, trả hàng, vận chuyển, lái xe & công nợ) · Khách hàng · Sổ quỹ · Báo cáo · Thuế HKD. Bên phải có **Tạo nhanh** và nút **Bán hàng**.
- **Các trang danh sách** chia hai phần: cột lọc bên trái (trạng thái, nhóm hàng, kênh bán, thời gian…, có số đếm từng mục) và bên phải là ô tìm kiếm, nút Xuất Excel / Thêm mới và bảng. Dòng cuối bảng cộng tổng các cột tiền. Bấm vào một dòng để mở chi tiết.
- **Chi tiết khách hàng:** bấm vào một khách trong danh sách để mở hộp chi tiết của khách đó; đóng hộp là về lại danh sách.
  - Tab **Sổ công nợ** ghi lần lượt từng hóa đơn, đợt giao, phiếu trả hàng, phiếu thu và hoàn tiền, kèm dư nợ sau mỗi lần. Bấm vào phiếu thu để xem phiếu đó trả cho những đơn nào. Chọn khoảng thời gian để có dư nợ đầu kỳ và cuối kỳ khi đối chiếu với khách.
  - Tab **Chi tiết đơn** cho biết từng đơn đã giao tới đâu, đã thu bao nhiêu và còn nợ bao nhiêu. Bấm **Còn nợ** để chỉ xem các đơn chưa thu đủ.
  - **Ghi phiếu thu:** mỗi lần khách chuyển tiền chỉ cần ghi một phiếu. Phần mềm tự trả hết đơn cũ nhất rồi mới sang đơn tiếp theo; nếu khách muốn trả cho đơn cụ thể thì chọn **Tự chọn đơn**. Tiền thừa được ghi là khách trả trước và trừ dần vào các đơn sau.
- **Trên điện thoại:** menu nằm ở thanh dưới cùng (Tổng quan, Đơn hàng, Tạo, Thu chi, Thêm). Bộ lọc thành các nút trượt ngang; bấm "Bộ lọc khác" để hiện thêm bộ lọc.

## 13. Quy trình báo giá, hợp đồng, hóa đơn

Ba phân hệ hoạt động độc lập; chứng từ con chỉ sinh trong từng phân hệ. Riêng báo giá có nút **Chuyển sang đơn** do nhân viên tự bấm để sao chép khách và dòng hàng, sau đó hai bên không còn phụ thuộc nhau.

**Báo giá.** Chọn mẫu ngói / gốm xây dựng hoặc mẫu tranh mosaic. Mẫu ngói có nhóm hàng I, II, III; số lượng tự tính bằng khối lượng × định mức − số viên diềm (định mức khai ở từng hàng hóa); cột định mức có thể ẩn khi xuất. Lưu ý cuối báo giá sửa được từng lần; nội dung mặc định sửa ở **Cài đặt → Mẫu in → Đơn vị phát hành & phông chữ**. Báo giá không giữ hàng, không ghi công nợ. Dòng tự nhập không gắn hàng hóa sẽ bị bỏ qua khi chuyển sang đơn.

**Hợp đồng.** Mỗi hợp đồng gắn với một đơn đặt hàng và dùng chung đợt giao, tiền cọc, tồn kho của đơn. Tạo ở mục **Hợp đồng** hoặc nút **Lập hợp đồng** trong đơn đặt hàng. Thứ tự giấy tờ: đề nghị tạm ứng → các đợt giao (mỗi đợt có hóa đơn, biên bản giao hàng, hợp đồng vận chuyển) → đối chiếu số lượng → đối chiếu kèm thanh toán → bấm **Hoàn tất đối chiếu** → đề nghị thanh toán. Số thanh toán tính theo số lượng thực giao. Bản scan hợp đồng tải lên trong trang hợp đồng, tối đa 15 MB mỗi tệp, được lưu cùng cơ sở dữ liệu nên có trong bản sao lưu hằng đêm. Riêng tệp đính kèm không nằm trong tệp sao lưu JSON tải về.

**Hóa đơn.** Nút **Thu khác** trên màn bán hàng thêm VAT và tiền vận chuyển. Thuế suất VAT đặt theo từng đơn, mặc định ở **Cài đặt**. Doanh thu báo cáo không gồm VAT của đơn; công nợ khách có gồm VAT. Khi tạo đợt giao có thể nhập số **cọc khấu trừ** cho hóa đơn đợt đó.

**Lái xe.** Khách trả cùng hóa đơn hoặc cửa hàng chịu phí thì phát sinh một khoản chi phí chưa trả cho lái xe. Khách trả trực tiếp cho lái xe thì không phát sinh công nợ. Trả tiền ở **Đơn hàng → Lái xe & công nợ**, phiếu chi được ghi vào sổ quỹ như mọi chi phí khác.

**Pháp nhân.** Mỗi sổ khai 2 đơn vị đứng tên (Công ty Thanh Hải, HKD Mai Hiếu) ở **Cài đặt → Mẫu in**. Khi xuất chứng từ, đổi ở mục **Đơn vị đứng tên**.

**Thuế HKD.** Hóa đơn đầu vào và đầu ra nằm chung một kho chứng từ. Trang này đối soát doanh thu trên sổ với hóa đơn đầu ra theo tháng và xuất sổ ra Excel. Số thuế là ước tính để theo dõi, không thay tờ khai.

**Nạp hàng hóa.** Tệp `mau-excel/hang-hoa-thanh-hai-2026.xlsx` được dựng sẵn từ các bảng giá 2026 của Thanh Hải. Xem trang **Ghi chú** trong tệp trước khi nhập.

**Mục tiêu và phễu bán hàng.** Mục tiêu doanh thu tháng đặt ở **Cài đặt**. Phễu lấy khách mới, đã tư vấn (nhân viên chọn trong hồ sơ khách), đã báo giá, đã cọc, đã chốt từ chứng từ trong kỳ.

## 14. Mua hàng: nhập hàng, đặt hàng nhập, trả hàng nhập

Menu **Mua hàng** có ba màn giống KiotViet. Màn tạo phiếu mở toàn màn hình như màn bán hàng: gõ mã hoặc tên hàng vào ô tìm kiếm (**F3**), chọn nhà cung cấp (**F4**, nút + để thêm mới). Muốn thêm nhiều dòng một lúc, bấm **Từ file Excel** và chọn file có cột Mã hàng, Số lượng, Đơn giá, Giảm giá (tải file mẫu ngay trên màn hình). Mã không có trong danh mục được báo lại, không tự thêm.

- **Nhập hàng** (mã PN): dùng khi hàng đã về. Mỗi dòng có Đơn giá và Giảm giá (số tiền trên một đơn vị); cột phải có Số hóa đơn đầu vào, Giảm giá cả phiếu, Cần trả nhà cung cấp, Tiền trả NCC và Tính vào công nợ.
  - **Lưu tạm**: lưu phiếu tạm, chưa vào kho. Mở lại bằng nút **Mở phiếu** trong chi tiết.
  - **Hoàn thành**: nhập kho ngay, tính lại giá vốn và ghi nợ nhà cung cấp.
  - Danh sách hiện cả các đợt nhận hàng (mã NK) của đơn đặt hàng nhập, lọc theo trạng thái Phiếu tạm / Đã nhập hàng / Đã hủy và theo thời gian.
- **Đặt hàng nhập** (mã DN): đặt nhà cung cấp hoặc đặt xưởng sản xuất (nút gạt **Mua hàng / Đặt xưởng**), có Dự kiến ngày nhập, gắn đơn bán và đặt cọc. Trạng thái: Phiếu tạm, Đã xác nhận NCC, Nhập một phần, Hoàn thành, Đã hủy; cột **Số ngày chờ** đếm từ ngày đặt. Hàng về thì bấm **Nhận hàng** trong chi tiết đơn, số lượng tự điền theo phần còn chờ và nhận được nhiều đợt. Đợt nhận nhầm hủy được ở bảng các đợt nhận.
- **Trả hàng nhập** (mã TN): lập từ nút **Trả hàng nhập** trong chi tiết phiếu nhập (chỉ trả các dòng đã nhận) hoặc lập riêng ở màn Trả hàng nhập (chọn nhà cung cấp và hàng bất kỳ còn tồn). Mỗi dòng có **Giá trả lại**, mặc định bằng giá nhập. Cột phải có Giảm giá, Nhà cung cấp cần trả, Tiền NCC trả lại; phần chưa trả lại tiền được trừ vào nợ nhà cung cấp.
- **Chi tiết phiếu** có In, Xuất file, **Sao chép** (mở phiếu mới cùng hàng và giá), Trả tiền NCC, Trả hàng nhập và **Hủy** (bắt buộc ghi lý do).
- **Sổ Thanh Hải** hiện quy cách thùng trên từng dòng nhập; sổ Vũ Gia và Anamtile thì không.
- **Máy chủ đang chạy bản cũ:** khi cập nhật, máy chủ tự sao lưu rồi nâng cấp cơ sở dữ liệu. Đơn cũ đã nhập kho ngay lúc lập được chuyển thành phiếu nhập hàng; phiếu trả hàng NCC cũ giữ nguyên số liệu, giá trả lại bằng giá nhập.

## 15. Thiết lập (bánh răng trên thanh trên cùng)

Bấm bánh răng cạnh chuông để mở nhanh một nhóm thiết lập, hoặc **Xem tất cả thiết lập**. Trang Thiết lập chia như KiotViet: cột trái là danh mục (Quản lý · Tiện ích · Cửa hàng · Dữ liệu), giữa là các dòng thiết lập, phải là mục lục. Ô **Tìm kiếm thiết lập** gõ không dấu cũng được. Công tắc lưu ngay khi bật/tắt.

- **Phương pháp tính giá vốn** (Hàng hóa): giá vốn trung bình hoặc giá vốn cố định (mặc định là giá nhập đầu tiên, sửa được ở từng hàng hóa). Khi đổi, chọn *tính lại từ một ngày* hoặc *chỉ chứng từ mới*, bấm **Xem trước thay đổi** để thấy chênh lệch giá vốn, lãi gộp, lợi nhuận từng tháng và từng mã, tích xác nhận rồi mới đổi. Máy chủ tự sao lưu CSDL trước khi đổi (thư mục `backups`, tên có `truoc-doi-gia-von`). Không tính lại được trước ngày khóa sổ.
- **Mã vạch, gợi ý thông tin hàng hóa, bảo hành – bảo trì, phân quyền theo nhóm hàng** (Hàng hóa). Bảo hành bật thì có trang *Đơn hàng → Bảo hành, sửa chữa* để tra hạn bảo hành và lập phiếu sửa chữa; in tem mã vạch ở chi tiết hàng hóa.
- **Chi phí nhập hàng** (Mua hàng): khi nhận hàng thêm phí vận chuyển, bốc xếp…; chia vào giá vốn theo giá trị từng dòng. Phần "NCC thu hộ" cộng vào nợ NCC; phần "Trả bên khác" hãy ghi phiếu chi.
- **Đơn hàng**: xác nhận trước khi hoàn thành đơn, giới hạn số ngày được trả hàng, không cho đổi ngày giao dịch (chọn loại giao dịch), kết ca làm việc (*Sổ quỹ → Kết ca*), chặn sửa/hủy đơn đã có hóa đơn điện tử.
- **Khách hàng**: người phụ trách (có thể cho nhân viên chỉ xem khách của mình), khách đồng thời là NCC, thông tin bắt buộc, tích điểm và đổi điểm, khuyến mại, voucher, coupon (*Khách hàng → Khuyến mại & voucher*). Giảm giá trên đơn do máy chủ tính lại khi lưu.
- **Thuế & Kế toán → Hóa đơn điện tử**: khai thông tin người bán, mẫu số, ký hiệu. Chưa nối thẳng nhà cung cấp HĐĐT: phát hành trên trang nhà cung cấp rồi ghi số hóa đơn ở *Thuế & Kế toán → Hóa đơn đầu ra*.
- **Cửa hàng → Quản lý tiền tệ**: ngoại tệ và tỷ giá (phiếu thu chi nhập bằng ngoại tệ tự quy đổi), số chữ số thập phân của giá.
- **Bảo mật**: xác thực khi xuất file (nhập lại mật khẩu trước khi tải Excel), xác thực 2 lớp cho nhân viên (ứng dụng Google/Microsoft Authenticator; Tổng quản trị đặt lại được khi nhân viên mất điện thoại).
- **Dữ liệu → Xóa dữ liệu gian hàng**: xóa chứng từ đã khép lại đến hết một ngày đã khóa sổ; công nợ, tồn kho, số dư quỹ, điểm được giữ nguyên dưới dạng số dư đầu kỳ. Xóa ngay hoặc đặt lịch 23 giờ; máy chủ sao lưu trước khi xóa.

