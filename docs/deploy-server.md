# Deploy lên máy chủ (không dùng Docker)

Bản chạy thật: https://so-ban-hang-thceramics.admirable.site

## Máy chủ

- CentOS 7, SSH cổng và tài khoản trong `.env.ssh` (không đưa lên git).
- Node 22 có sẵn ở `/opt/node22/bin/node`. CSDL dùng `node:sqlite` có sẵn trong Node nên không cần biên dịch thư viện nào trên máy chủ.
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
tar -czf app.tgz --exclude=web/node_modules --exclude=web/src --exclude=web/public server/src server/scripts server/package.json server/package-lock.json web
```

Chép `app.tgz` lên máy chủ vào `/tmp/so-ban-hang-app.tgz`, rồi chạy trên máy chủ:

```bash
cd /opt/so-ban-hang-gom && rm -rf server web && tar -xzf /tmp/so-ban-hang-app.tgz && systemctl restart so-ban-hang-gom && rm /tmp/so-ban-hang-app.tgz
```

Kiểm tra: `curl https://so-ban-hang-thceramics.admirable.site/api/health` phải trả `{"ok":true}`.

Đổi biến môi trường (ví dụ `ALLOW_SIGNUP=false`, đổi mật khẩu quản trị): sửa `/etc/so-ban-hang-gom/app.env` rồi `systemctl restart so-ban-hang-gom`.

## Xem log

```bash
journalctl -u so-ban-hang-gom -n 100 --no-pager
```
