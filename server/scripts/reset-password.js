// Lệnh khẩn cấp: đặt lại mật khẩu 1 tài khoản khi không dùng được "Quên mật khẩu" qua email (vd. chưa cấu hình gửi thư).
// Mọi phiên cũ bị đăng xuất, lần đăng nhập tới phải đổi mật khẩu, việc đặt lại được ghi vào Nhật ký bảo mật và báo qua email cho chủ tài khoản.
// Chạy: npm run reset-password -- <email> <mật-khẩu-mới>   (trong Docker: docker compose exec api npm run reset-password -- a@b.vn matkhaumoi)
import { openDb } from '../src/db/index.js';
import { config } from '../src/config.js';
import { setPasswordByEmail } from '../src/lib/auth.js';
import { flushMail } from '../src/lib/mail.js';

const [email, password] = process.argv.slice(2);
if (!email || !password) { console.error('Cách dùng: npm run reset-password -- <email> <mật-khẩu-mới>'); process.exit(1); }
const db = openDb(config.dbPath);
try {
  db.transaction(() => setPasswordByEmail(email, password))();
  await flushMail();
  console.log(`Đã đặt mật khẩu mới cho ${email} — lần đăng nhập tới phải đổi mật khẩu`);
} catch (e) { console.error(e.message); process.exit(1); }
