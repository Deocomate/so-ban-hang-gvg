// Cấu hình từ biến môi trường (xem .env.example ở thư mục gốc)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

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

export const config = {
  port: Number(env.PORT || 3000),
  dataDir,
  dbPath: env.DB_PATH || path.join(dataDir, 'gomsu.db'),
  webDir: path.resolve(env.WEB_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist')),
  backupDir: env.BACKUP_DIR || path.join(dataDir, 'backups'),
  backupKeep: Number(env.BACKUP_KEEP_DAYS || 14),
  allowSignup: flag(env.ALLOW_SIGNUP, true),
  demoMode: flag(env.DEMO_MODE, false),
  trustProxy: flag(env.TRUST_PROXY, true),
  sepayApiKey: env.SEPAY_API_KEY || '',
  trackingSecret: env.TRACKING_WEBHOOK_SECRET || '',
  vapid: { publicKey: env.VAPID_PUBLIC_KEY || '', privateKey: env.VAPID_PRIVATE_KEY || '', subject: env.VAPID_SUBJECT || 'mailto:admin@example.com' },
  get jwtSecret() { return (this._jwt ??= jwtSecret()); },
};
