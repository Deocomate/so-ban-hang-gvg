// Cấu hình từ biến môi trường (xem .env.example ở thư mục gốc)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Chạy trên máy (npm run dev): đọc thêm tệp .env ở thư mục gốc; biến đã đặt sẵn (Docker, Coolify) không bị ghi đè
const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');
if (fs.existsSync(rootEnv)) process.loadEnvFile?.(rootEnv);

const env = process.env;
const flag = (v, d = false) => (v == null || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));

const dataDir = env.DATA_DIR || path.resolve('data');

// Khóa ký phiên đăng nhập: lấy từ JWT_SECRET, nếu chưa đặt thì tự tạo 1 lần và lưu trong thư mục dữ liệu
function jwtSecret() {
  if (env.JWT_SECRET) return env.JWT_SECRET;
  const f = path.join(dataDir, '.jwt-secret');
  try { return fs.readFileSync(f, 'utf8').trim(); } catch { /* chưa có */ }
  const s = crypto.randomBytes(48).toString('base64url');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
}

const production = env.NODE_ENV === 'production';

export const config = {
  production,
  port: Number(env.PORT || 3000),
  // Địa chỉ trang web, dùng để tạo link trong email (mời, quên mật khẩu, xác thực). Bản chạy thật bắt buộc khai.
  appUrl: String(env.APP_URL || (production ? '' : 'http://localhost:5173')).replace(/\/+$/, ''),
  // Gửi email qua Gmail: SMTP_USER = địa chỉ Gmail, SMTP_PASS = mật khẩu ứng dụng 16 ký tự (không phải mật khẩu Gmail)
  // Mật khẩu ứng dụng Gmail hiện theo nhóm 4 ký tự có dấu cách: bỏ dấu cách. SMTP_FROM chỉ có tên → ghép với địa chỉ SMTP_USER.
  smtp: { host: env.SMTP_HOST || 'smtp.gmail.com', port: Number(env.SMTP_PORT || 465), user: env.SMTP_USER || '', pass: String(env.SMTP_PASS || '').replace(/\s+/g, ''),
    from: env.SMTP_FROM?.includes('@') ? env.SMTP_FROM : env.SMTP_USER ? `"${(env.SMTP_FROM || 'Sổ bán hàng').replace(/"/g, '')}" <${env.SMTP_USER}>` : '' },
  dataDir,
  dbPath: env.DB_PATH || path.join(dataDir, 'gomsu.db'),
  webDir: path.resolve(env.WEB_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist')),
  backupDir: env.BACKUP_DIR || path.join(dataDir, 'backups'),
  backupKeep: Number(env.BACKUP_KEEP_DAYS || 14),
  demoMode: flag(env.DEMO_MODE, false),
  trustProxy: flag(env.TRUST_PROXY, true),
  admin: { email: env.ADMIN_EMAIL || '', password: env.ADMIN_PASSWORD || '' },
  sepayApiKey: env.SEPAY_API_KEY || '',
  trackingSecret: env.TRACKING_WEBHOOK_SECRET || '',
  vapid: { publicKey: env.VAPID_PUBLIC_KEY || '', privateKey: env.VAPID_PRIVATE_KEY || '', subject: env.VAPID_SUBJECT || 'mailto:admin@example.com' },
  get jwtSecret() { return (this._jwt ??= jwtSecret()); },
};
