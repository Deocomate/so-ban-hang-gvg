# Chuyển Supabase/Postgres → Node + SQLite, đóng gói Docker Compose (Coolify)

Status: done (chưa build image Docker vì Docker Desktop tắt) · Created: 2026-10-25

## Outcome
- `server/`: API Node (better-sqlite3) thay toàn bộ 115 hàm PL/pgSQL, đăng nhập tự quản (JWT), webhook SePay + vận đơn, web push, lịch 21:00 / 08:00, sao lưu SQLite hằng ngày.
- `web/`: React giữ nguyên giao diện, gọi `/api/rpc/:fn`; bỏ Supabase + PGlite trong trình duyệt.
- `docker-compose.yml`: 2 dịch vụ `api` + `web` (nginx proxy `/api`), dùng `expose` (không `ports`), volume `/data` cho SQLite.

## Constraints / non-goals
- Giữ nguyên hợp đồng RPC (tên hàm, tham số `p`, dạng JSON trả về) để không phải sửa các trang.
- Không chuyển dữ liệu từ Supabase cũ (câu hỏi mở).
- Bỏ `tracking_queue` / `tracking_registered` (không có nơi gọi).

## Acceptance
- Bộ kiểm thử cũ (business, ship_bank, expenses, documents, seed) chuyển sang `server/test` và đạt hết (trừ phần "nâng cấp Postgres" không còn áp dụng).
- `docker compose build` chạy được; `web` phục vụ SPA và proxy API.

## Phases
1. Schema + views SQLite, hàm nền (quyền, mã chứng từ, sổ kho, nhật ký).
2. Nghiệp vụ: danh mục, kho, thu chi, chi phí, bán, mua, báo cáo, q(), xuất dữ liệu.
3. Vận chuyển, tiền về, thông báo, chứng từ, webhook, push, lịch.
4. HTTP server + auth; frontend chuyển backend; Docker.
5. Port kiểm thử, chạy, sửa; cập nhật HUONG-DAN.md.

Backup mã gốc: `../so-ban-hang-gom-goc-261025.tar.gz`.
