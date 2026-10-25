// Đặt lại mật khẩu 1 tài khoản (khi quên mật khẩu, kể cả chủ cửa hàng). Mọi phiên đăng nhập cũ của tài khoản đó bị đăng xuất.
// Chạy: npm run reset-password -- <email> <mật-khẩu-mới>   (trong Docker: docker compose exec api npm run reset-password -- a@b.vn matkhaumoi)
import { openDb } from '../src/db/index.js';
import { config } from '../src/config.js';
import { setPasswordByEmail } from '../src/lib/auth.js';

const [email, password] = process.argv.slice(2);
if (!email || !password) { console.error('Cách dùng: npm run reset-password -- <email> <mật-khẩu-mới>'); process.exit(1); }
const db = openDb(config.dbPath);
try {
  db.transaction(() => setPasswordByEmail(email, password))();
  console.log(`Đã đặt mật khẩu mới cho ${email}`);
} catch (e) { console.error(e.message); process.exit(1); }
