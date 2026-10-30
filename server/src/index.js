// Khởi động API: mở CSDL SQLite, chạy máy chủ HTTP và lịch tự động.
import { config } from './config.js';
import { openDb } from './db/index.js';
import { demoFlag } from './domain/books.js';
import { ensureAdmin } from './lib/auth.js';
import { createServer } from './http.js';
import { startScheduler } from './services/scheduler.js';

const db = openDb(config.dbPath);
demoFlag.on = config.demoMode;
if (config.admin.email || config.admin.password) {
  try {
    const r = db.transaction(() => ensureAdmin(config.admin.email, config.admin.password))();
    console.log(`Tài khoản quản trị ${r.email}: ${r.action}`);
  } catch (e) { console.error(`Không cài được tài khoản quản trị từ ADMIN_EMAIL / ADMIN_PASSWORD: ${e.message}`); }
}
const server = createServer();
server.listen(config.port, () => {
  console.log(`API sổ bán hàng gốm chạy ở cổng ${config.port} · CSDL ${config.dbPath}${config.demoMode ? ' · CHẾ ĐỘ CHẠY THỬ' : ''}`);
  if (!config.vapid.publicKey) console.log('Chưa cài VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY — thông báo điện thoại tắt');
});
startScheduler();

function shutdown(sig) {
  console.log(`Nhận ${sig}, đang dừng…`);
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => { db.close(); process.exit(0); }, 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
