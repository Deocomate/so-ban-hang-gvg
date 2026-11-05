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

Chép `app.tgz` lên máy chủ vào `/tmp/so-ban-hang-app.tgz`, rồi chạy trên máy chủ:

```bash
cd /opt/so-ban-hang-gom && rm -rf server web && tar -xzf /tmp/so-ban-hang-app.tgz && systemctl restart so-ban-hang-gom && rm /tmp/so-ban-hang-app.tgz
```

Kiểm tra: `curl https://so-ban-hang-thceramics.admirable.site/api/health` phải trả `{"ok":true}`.

Đổi biến môi trường: sửa `/etc/so-ban-hang-gom/app.env` rồi `systemctl restart so-ban-hang-gom`.

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
