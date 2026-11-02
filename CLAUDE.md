# CLAUDE.md

## Người dùng

Người dùng trên máy này **không biết code**. Luôn trả lời bằng tiếng Việt dễ hiểu, tránh thuật ngữ kỹ thuật.

## Khi làm xong một việc

1. **Tự mở demo cho người dùng xem.** Không bắt người dùng tự chạy lệnh hay tự kiểm tra.
   - Mở ứng dụng bằng preview `app` trong `.claude/launch.json` (lệnh `node scripts/start.js --no-open`, giao diện ở http://localhost:5173).
   - Đi tới đúng màn hình vừa thay đổi, kiểm tra không có lỗi, rồi gửi ảnh chụp màn hình.
2. **Tự commit và push lên GitHub** (`origin` = https://github.com/Deocomate/so-ban-hang-gvg), không cần hỏi lại.
   - Push lên branch đang làm việc (hiện tại là `vtmai`). Không push thẳng lên `main` và không force-push trừ khi người dùng yêu cầu.
   - Viết commit message rõ ràng. Nếu push lỗi (chưa đăng nhập, thiếu quyền), giải thích cách xử lý bằng lời dễ hiểu.

## Chạy trên máy

- Cài thư viện: `npm run setup`
- Chạy API (cổng 3000) + giao diện Vite (cổng 5173): `npm run dev`
- Cấu hình dev nằm trong `.env` ở thư mục gốc (không đưa lên git, xem `.env.example`).
