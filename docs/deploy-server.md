# Deploy lên máy chủ (không dùng Docker)

Bản chạy thật: https://so-ban-hang-thceramics.admirable.site

## Máy chủ

- CentOS 7, SSH cổng và tài khoản trong `.env.ssh` (không đưa lên git).
- Node 22 có sẵn ở `/opt/node22/bin/node`. CSDL dùng `node:sqlite` có sẵn trong Node nên không cần biên dịch thư viện nào trên máy chủ.
- API có một thư viện JavaScript thuần (`nodemailer`, gửi email), đóng gói sẵn trong `server/node_modules` của `app.tgz`.
- Máy chủ còn chạy nhiều site khác. Không chạy `yum update` hay nâng cấp glibc.

| Thành phần | Vị trí |
|---|---|
| Mã nguồn API | `/opt/so-ban-hang-gom/server` |
| Giao diện đã build | `/opt/so-ban-hang-gom/web/dist` |
| CSDL + sao lưu hằng đêm (03:00) | `/var/lib/so-ban-hang-gom/` (`gomsu.db`, `backups/`) |
| Biến môi trường | `/etc/so-ban-hang-gom/app.env` (chép từ `.env.server`, thêm `PORT=3010`, `DATA_DIR`, `WEB_DIR`, `NODE_ENV`, `TZ`) |
| Dịch vụ | systemd `so-ban-hang-gom` (user `sobanhang`, cổng nội bộ 3010) |
| Nginx | `/etc/nginx/conf.d/so-ban-hang-thceramics.admirable.site.conf` |
| Chứng chỉ SSL | `/etc/nginx/ssl/so-ban-hang-thceramics.admirable.site.{crt,key}`, acme.sh tự gia hạn (`/root/.acme.sh`) |

## Cập nhật bản mới

Trên máy Windows, trong thư mục dự án:

```bash
npm --prefix web run build
npm --prefix server ci --omit=dev
tar -czf app.tgz --exclude=web/node_modules --exclude=web/src --exclude=web/public server/src server/scripts server/package.json server/package-lock.json server/node_modules web
```

Đăng nhập SSH bằng mật khẩu trong `.env.ssh` (`IP`, `PORT`, `USER`, `PASSWORD`), không dùng khóa SSH. Máy Windows không có `sshpass`: đặt `SSH_ASKPASS` trỏ tới một script nhỏ in biến chứa mật khẩu, cùng `SSH_ASKPASS_REQUIRE=force` và `-o PreferredAuthentications=password`, để mật khẩu không hiện trên màn hình.

Trước khi giải nén bản mới: dừng dịch vụ và chép `gomsu.db*` vào `/var/lib/so-ban-hang-gom/backups/<tên-đợt>/` (máy chủ cũng tự sao lưu khi nâng cấp cấu trúc CSDL).

Chép `app.tgz` lên máy chủ vào `/tmp/so-ban-hang-app.tgz`, rồi chạy trên máy chủ:

```bash
cd /opt/so-ban-hang-gom && rm -rf server web && tar -xzf /tmp/so-ban-hang-app.tgz && systemctl restart so-ban-hang-gom && rm /tmp/so-ban-hang-app.tgz
```

Kiểm tra: `curl https://so-ban-hang-thceramics.admirable.site/api/health` phải trả `{"ok":true}`.

Đổi biến môi trường: sửa `/etc/so-ban-hang-gom/app.env` rồi `systemctl restart so-ban-hang-gom`.

Nạp bản sao lưu JSON quá lớn để tải qua giao diện (giới hạn 20 MB, vd. bản chuyển từ KiotViet kèm ảnh hàng hóa): chép tệp lên máy chủ, dừng dịch vụ, rồi trong `/opt/so-ban-hang-gom/server` chạy bằng user `sobanhang` với cùng biến môi trường của dịch vụ: `npm run import-book -- TH /tmp/tep.json`. Lệnh tự sao lưu CSDL thành `gomsu.db.truoc-nap-TH-<thời điểm>.bak` rồi mới nạp, và chỉ nạp vào sổ chưa có chứng từ.

Chứng từ khách lập thêm trên KiotViet sau khi đã nạp (khách dùng song song): lấy phần phát sinh từ KiotViet thành một tệp JSON (mẫu `du-lieu-kiotviet/goc/kiotviet-thceramics-phat-sinh-20261112.json`), chép lên máy chủ cùng tệp ghép mã `du-lieu-kiotviet/nap/ghep-ma-hang.json`, dừng dịch vụ, rồi chạy như trên: `npm run add-kiotviet-docs -- TH /tmp/phat-sinh.json /tmp/ghep-ma-hang.json --thu` để chạy thử, bỏ `--thu` để ghi. Lệnh tự sao lưu thành `gomsu.db.truoc-bo-sung-TH-<thời điểm>.bak`. Chứng từ có mã đã có trong sổ thì bỏ qua, nên chạy lại không ghi trùng. Lệnh nhận khách mới, phiếu điều chỉnh công nợ khách (CB…), hóa đơn bán thẳng, đặt hàng phiếu tạm và phiếu thu khách. Gặp loại khác thì lệnh dừng mà không ghi gì; nếu công nợ khách không khớp `expectedDebts` trong tệp thì cũng không ghi.

`app.env` cần có `APP_URL=https://so-ban-hang-thceramics.admirable.site`, `SMTP_USER`, `SMTP_PASS` (Gmail + mật khẩu ứng dụng) để gửi thư mời, quên mật khẩu, xác thực email. `ALLOW_SIGNUP` không còn tác dụng.

## Tài khoản quản trị và dev

- `ADMIN_EMAIL` / `ADMIN_PASSWORD` chỉ tạo Tổng quản trị khi hệ thống chưa có ai là Tổng quản trị. Mật khẩu quản trị đổi trong ứng dụng; sửa `app.env` không đặt lại được.
- Lần khởi động đầu sau khi nâng cấp lên bản có phân quyền: nếu mật khẩu quản trị đang dùng vẫn trùng `ADMIN_PASSWORD`, máy chủ bắt đổi ở lần đăng nhập tới. Chủ doanh nghiệp tự đăng nhập và đổi, sau đó xóa `ADMIN_PASSWORD` khỏi `app.env`.
- `npm run reset-password -- <email> <mật-khẩu-tạm>` (trong `/opt/so-ban-hang-gom/server`, chạy bằng user `sobanhang`) là lối khẩn cấp: bắt đổi mật khẩu, ghi Nhật ký bảo mật, gửi thư báo cho chủ tài khoản.
- Dev không có tài khoản trên bản này. Kiểm thử trên máy bằng dữ liệu mẫu (`HUONG-DAN.md`, mục "Dev kiểm thử").

## Xem log

```bash
journalctl -u so-ban-hang-gom -n 100 --no-pager
```

## App xem dữ liệu KiotViet (riêng, không đưa lên GitHub)

https://kiotviet-data.admirable.site: trang xem dữ liệu xuất từ KiotViet TH Ceramics để khách xem và ghi chú phần cần sửa. Mã nguồn và dữ liệu chỉ nằm ở `du-lieu-kiotviet/` trên máy (đã gitignore) và trên máy chủ.

| Thành phần | Vị trí |
|---|---|
| Mã chạy + trang xem | `/opt/kiotviet-data/app/server.mjs`, `/opt/kiotviet-data/xem/` |
| Ghi chú của khách | `/var/lib/kiotviet-data/notes.json` |
| Mật khẩu xem + khóa phiên | `/etc/kiotviet-data/app.env` (bản gốc ở `du-lieu-kiotviet/app/app.env`) |
| Dịch vụ | systemd `kiotviet-data` (user `kiotvietdata`, cổng nội bộ 3030) |
| Nginx, SSL | `/etc/nginx/conf.d/kiotviet-data.admirable.site.conf`, `/etc/nginx/ssl/kiotviet-data.admirable.site.{crt,key}` (acme.sh) |

Cập nhật trang xem: chạy `node du-lieu-kiotviet/_cong-cu/tach-du-lieu.mjs`, đóng gói `app/server.mjs app/deploy xem/index.html xem/du-lieu.js` trong `du-lieu-kiotviet/`, chép lên rồi giải nén vào `/opt/kiotviet-data` và `systemctl restart kiotviet-data`. Không ghi đè `/var/lib/kiotviet-data`. Đổi mật khẩu: sửa `ACCESS_PASSWORD` trong `app.env` rồi khởi động lại dịch vụ.
