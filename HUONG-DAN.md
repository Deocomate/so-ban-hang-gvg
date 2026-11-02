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
> - **Dữ liệu mẫu (bật/tắt):** bật thì dùng kho mẫu `server/data`, tài khoản chủ lấy theo `ADMIN_EMAIL`, `ADMIN_PASSWORD` trong `.env` (sửa `.env` rồi bấm Khởi động lại là cập nhật), có nút giả lập tiền về, vận đơn. Tắt thì dùng kho sổ riêng `server/data-rieng`, trống, người đăng ký đầu tiên thành chủ. Hai kho không lẫn nhau, đổi qua lại không mất dữ liệu.
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

### Bước 2 — Tạo tài khoản chủ (làm NGAY sau khi đưa lên)
1. Mở địa chỉ web → **Tạo tài khoản mới** bằng email của anh.
2. **Người đăng ký đầu tiên tự động thành chủ** của cả 3 sổ (Thanh Hải, Vũ Gia và Anamtile, đã cài sẵn thuế 1% GTGT + 17% TNCN, các mức giá, kênh bán, các bước sản xuất).
3. Từ người thứ hai trở đi, đăng ký xong sẽ **không thấy sổ nào** cho tới khi chủ thêm email đó trong **Cài đặt → Người dùng & quyền**. Vì vậy người lạ có đăng ký cũng không xem được gì. Khi đã đủ tài khoản, có thể đặt `ALLOW_SIGNUP=false` để tắt hẳn việc đăng ký.

### Bước 3 — Thêm nhân viên
1. Nhân viên tự đăng ký bằng email của họ.
2. Chủ vào **Cài đặt → Người dùng & quyền → Thêm người dùng**, nhập email, chọn quyền. Quyền đặt **riêng cho từng sổ**.
3. Bỏ tick **"Xem giá vốn và lợi nhuận"** thì nhân viên không thấy giá vốn, lợi nhuận, giá trị tồn kho ở bất kỳ màn hình nào. Phần ẩn này do máy chủ chặn, không chỉ ẩn trên giao diện.

### Tài khoản quản trị đặt trong `.env` (khuyên dùng, đỡ quên)
- Điền `ADMIN_EMAIL` và `ADMIN_PASSWORD` (ít nhất 6 ký tự) trong tệp `.env` khi chạy trên máy, hoặc trong Environment Variables trên Coolify, rồi khởi động lại.
- Mỗi lần khởi động, máy chủ sẽ:
  - tạo tài khoản này nếu chưa có;
  - cho tài khoản này làm **chủ của mọi sổ**;
  - tạo luôn 3 sổ nếu hệ thống chưa có sổ nào, nên người khác đăng ký trước cũng không chiếm được quyền chủ.
- Muốn đổi mật khẩu thì sửa `ADMIN_PASSWORD` rồi khởi động lại. Các máy đang đăng nhập tài khoản này sẽ phải đăng nhập lại.
- Nếu anh đổi mật khẩu trong **Cài đặt → Tài khoản của tôi**, lần khởi động sau mật khẩu sẽ quay về giá trị trong `.env`. Vì vậy hãy luôn đổi ở `.env`.
- Dòng log khi khởi động cho biết tài khoản đã được tạo, đã đặt lại mật khẩu, hay giữ nguyên.

### Quên mật khẩu
- **Nhân viên:** chủ mở **Cài đặt → Người dùng & quyền → (tên nhân viên) → Đặt mật khẩu mới**, rồi báo lại cho nhân viên.
- **Chủ cửa hàng:** người quản trị máy chủ chạy lệnh (Coolify → dịch vụ app → Terminal, hoặc `docker compose exec app …`):
  ```
  npm run reset-password -- email-cua-anh@gmail.com MatKhauMoi123
  ```
- Ai cũng tự đổi mật khẩu được ở **Cài đặt → Tài khoản của tôi**. Đổi mật khẩu thì các máy khác đang đăng nhập tài khoản đó phải đăng nhập lại.

## 3. Nhập dữ liệu ban đầu (một lần, ngày 01/10/2026)

Làm lần lượt trong **từng sổ** (chọn sổ ở thanh trên cùng trước):

1. **Cài đặt → Thông tin sổ**: kiểm tra tên sổ, thuế, tên các mức giá (3 mức bắt buộc, mức 4 có thể để trống), địa chỉ và điện thoại in trên phiếu.
2. **Cài đặt → Quỹ tiền**: nhập số dư đầu kỳ của Tiền mặt và Tài khoản ngân hàng (thêm quỹ nếu cần, ví dụ "Ví TikTok").
3. **Sản phẩm → Nhập từ Excel**: dùng file có sẵn của cửa hàng, hoặc `mau-excel/mau-hang-hoa_ThanhHai.xlsx` (hoặc `_VuGia`). Các cột gồm: tên hàng hóa, chủng loại, thương hiệu, mẫu, kích thước, màu sắc, ĐVT, giá vốn, các mức giá bán, số lượng tồn.
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

### Mức giá 4 và bán khi chưa có tồn

- **Mức giá 4:** bật bằng cách đặt tên ở **Cài đặt → Mức giá bán**. Sổ Thanh Hải có sẵn mức "Giá đại lý II". Khi đó sản phẩm, khách hàng, đơn hàng và file Excel đều có thêm mức này. Muốn bỏ thì xóa tên mức 4, sau khi đã đổi mức giá của các khách đang dùng nó.
- **Bán khi chưa có tồn:** mặc định bị chặn. Tick **Cho phép giao vượt số tồn kho** trong Cài đặt của từng sổ. Sau đó tài khoản chủ cửa hàng giao ngay được ở màn tạo đơn; ở màn giao hàng thì tick thêm ô cho phép. Tài khoản nhân viên vẫn bị chặn.
- **Khi bán vượt tồn:** tồn kho bị âm và hiện "âm kho" cho đến khi nhập hàng về. Phần chênh lệch được tính vào giá vốn lúc nhập, nên lãi của các đơn đó có thể chưa chính xác.

### Khi cập nhật phần mềm

Nếu bản mới đổi cấu trúc dữ liệu, máy chủ tự sao lưu rồi nâng cấp khi khởi động. Bản sao nằm cạnh file dữ liệu, tên kết thúc bằng `.truoc-nang-cap-v1.bak`.

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
| Phiếu thu / phiếu chi | Thu chi → mở phiếu → **Xuất phiếu PDF** | Hộ kinh doanh |

- **Cài đặt một lần:** vào **Cài đặt → Mẫu chứng từ**.
  - Khai báo đơn vị phát hành: tên, địa chỉ, điện thoại, email, website, dòng số tài khoản, người đại diện, logo. Có thể khai nhiều đơn vị (ví dụ Hộ kinh doanh gốm sứ Mai Hiếu và Công ty TNHH SX&TM Thanh Hải).
  - Với từng loại chứng từ, chọn đơn vị phát hành và dấu phân cách hàng nghìn (24,000,000 hay 24.000.000).
  - Sửa được nội dung ghi chú / chính sách đổi trả ở cuối hóa đơn, dòng cuối đơn đặt hàng và đoạn cam kết cuối biên bản. Bọc chữ trong `**hai dấu sao**` để in đậm.
  - Mỗi sổ (Thanh Hải, Vũ Gia, Anamtile) có mẫu riêng. Sổ mới có sẵn 2 đơn vị đứng tên là Công ty Thanh Hải và HKD Mai Hiếu; khi xuất chứng từ, đổi đơn vị ở mục **Đơn vị đứng tên**.
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
  - Tất cả chứng từ dùng chung một phông, mặc định Arial (Arimo). Muốn đổi sang Times New Roman (Tinos) thì vào **Cài đặt → Mẫu chứng từ → Phông chữ**. Bản xem trước dùng đúng phông sẽ in.
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
- **Thanh menu (màu theo logo từng sổ):** Tổng quan · Hàng hóa (danh sách, bảng giá, tồn kho & kiểm kho) · Mua hàng (nhà cung cấp, nhập hàng / đặt xưởng, hóa đơn đầu vào, trả hàng nhập) · Báo giá · Hợp đồng · Đơn hàng (đặt hàng, hóa đơn, trả hàng, vận chuyển, lái xe & công nợ) · Khách hàng · Sổ quỹ · Báo cáo · Thuế HKD. Bên phải có **Tạo nhanh** và nút **Bán hàng**.
- **Các trang danh sách** chia hai phần: cột lọc bên trái (trạng thái, nhóm hàng, kênh bán, thời gian…, có số đếm từng mục) và bên phải là ô tìm kiếm, nút Xuất Excel / Thêm mới và bảng. Dòng cuối bảng cộng tổng các cột tiền. Bấm vào một dòng để mở chi tiết.
- **Trên điện thoại:** menu nằm ở thanh dưới cùng (Tổng quan, Đơn hàng, Tạo, Thu chi, Thêm). Bộ lọc thành các nút trượt ngang; bấm "Bộ lọc khác" để hiện thêm bộ lọc.

## 13. Quy trình báo giá, hợp đồng, hóa đơn

Ba phân hệ hoạt động độc lập; chứng từ con chỉ sinh trong từng phân hệ. Riêng báo giá có nút **Chuyển sang đơn** do nhân viên tự bấm để sao chép khách và dòng hàng, sau đó hai bên không còn phụ thuộc nhau.

**Báo giá.** Chọn mẫu ngói / gốm xây dựng hoặc mẫu tranh mosaic. Mẫu ngói có nhóm hàng I, II, III; số lượng tự tính bằng khối lượng × định mức − số viên diềm (định mức khai ở từng hàng hóa); cột định mức có thể ẩn khi xuất. Lưu ý cuối báo giá sửa được từng lần; nội dung mặc định sửa ở **Cài đặt → Mẫu chứng từ**. Báo giá không giữ hàng, không ghi công nợ. Dòng tự nhập không gắn hàng hóa sẽ bị bỏ qua khi chuyển sang đơn.

**Hợp đồng.** Mỗi hợp đồng gắn với một đơn đặt hàng và dùng chung đợt giao, tiền cọc, tồn kho của đơn. Tạo ở mục **Hợp đồng** hoặc nút **Lập hợp đồng** trong đơn đặt hàng. Thứ tự giấy tờ: đề nghị tạm ứng → các đợt giao (mỗi đợt có hóa đơn, biên bản giao hàng, hợp đồng vận chuyển) → đối chiếu số lượng → đối chiếu kèm thanh toán → bấm **Hoàn tất đối chiếu** → đề nghị thanh toán. Số thanh toán tính theo số lượng thực giao. Bản scan hợp đồng tải lên trong trang hợp đồng, tối đa 15 MB mỗi tệp, được lưu cùng cơ sở dữ liệu nên có trong bản sao lưu hằng đêm. Riêng tệp đính kèm không nằm trong tệp sao lưu JSON tải về.

**Hóa đơn.** Nút **Thu khác** trên màn bán hàng thêm VAT và tiền vận chuyển. Thuế suất VAT đặt theo từng đơn, mặc định ở **Cài đặt**. Doanh thu báo cáo không gồm VAT của đơn; công nợ khách có gồm VAT. Khi tạo đợt giao có thể nhập số **cọc khấu trừ** cho hóa đơn đợt đó.

**Lái xe.** Khách trả cùng hóa đơn hoặc cửa hàng chịu phí thì phát sinh một khoản chi phí chưa trả cho lái xe. Khách trả trực tiếp cho lái xe thì không phát sinh công nợ. Trả tiền ở **Đơn hàng → Lái xe & công nợ**, phiếu chi được ghi vào sổ quỹ như mọi chi phí khác.

**Pháp nhân.** Mỗi sổ khai 2 đơn vị đứng tên (Công ty Thanh Hải, HKD Mai Hiếu) ở **Cài đặt → Mẫu chứng từ**. Khi xuất chứng từ, đổi ở mục **Đơn vị đứng tên**.

**Thuế HKD.** Hóa đơn đầu vào và đầu ra nằm chung một kho chứng từ. Trang này đối soát doanh thu trên sổ với hóa đơn đầu ra theo tháng và xuất sổ ra Excel. Số thuế là ước tính để theo dõi, không thay tờ khai.

**Nạp hàng hóa.** Tệp `mau-excel/hang-hoa-thanh-hai-2026.xlsx` được dựng sẵn từ các bảng giá 2026 của Thanh Hải. Xem trang **Ghi chú** trong tệp trước khi nhập.

**Mục tiêu và phễu bán hàng.** Mục tiêu doanh thu tháng đặt ở **Cài đặt**. Phễu lấy khách mới, đã tư vấn (nhân viên chọn trong hồ sơ khách), đã báo giá, đã cọc, đã chốt từ chứng từ trong kỳ.
