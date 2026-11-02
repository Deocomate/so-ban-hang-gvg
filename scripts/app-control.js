// Phần dùng chung của start.js và bảng điều khiển: cổng, cài đặt trên máy, biến môi trường theo chế độ dữ liệu, kiểm tra ứng dụng đang chạy.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Không đọc PORT: khung Preview của Claude tự đặt PORT bằng cổng giao diện
export const API_PORT = Number(process.env.API_PORT || 3000);
export const WEB_PORT = Number(process.env.WEB_PORT || 5173);
export const WEB_URL = `http://localhost:${WEB_PORT}`;

const SETTINGS_FILE = path.join(root, '.bang-dieu-khien.json');
const DEFAULTS = { sample: true, openBrowser: true, autoStart: true };

export function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')) }; } catch { return { ...DEFAULTS }; }
}
export const saveSettings = (s) => writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));

// Dữ liệu mẫu và sổ riêng là 2 thư mục tách biệt: bật tắt chế độ không làm mất dữ liệu bên nào
export const dataDirOf = (s) => path.join(root, 'server', s.sample ? 'data' : 'data-rieng');
export const dbFileOf = (s) => path.join(dataDirOf(s), 'gomsu.db');

// Tài khoản chủ của dữ liệu mẫu: lấy ADMIN_EMAIL / ADMIN_PASSWORD trong .env (đọc lại mỗi lần gọi); .env chưa điền đủ thì dùng tài khoản mẫu
export function sampleAccount() {
  let file = {};
  try { file = parseEnv(readFileSync(path.join(root, '.env'), 'utf8')); } catch { /* chưa có .env */ }
  const email = process.env.ADMIN_EMAIL || file.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD || file.ADMIN_PASSWORD;
  return email && password ? { email, password, fromEnv: true } : { email: 'chu.cuahang@demo.vn', password: process.env.DEMO_PASSWORD || 'demo1234', fromEnv: false };
}

export function appEnv(s) {
  const env = { ...process.env, PORT: String(API_PORT), API_URL: `http://localhost:${API_PORT}`, DATA_DIR: dataDirOf(s), DEMO_MODE: s.sample ? 'true' : 'false', VITE_SAMPLE_LOGIN: '' };
  if (!s.sample) return env;
  const a = sampleAccount();
  return { ...env, ADMIN_EMAIL: a.email, ADMIN_PASSWORD: a.password, VITE_SAMPLE_LOGIN: a.email };
}

// Thư viện chưa cài, hoặc package-lock.json mới hơn lần cài trước (vừa cập nhật mã)
export function needsInstall(dir) {
  const stamp = path.join(root, dir, 'node_modules', '.package-lock.json');
  return !existsSync(stamp) || statSync(path.join(root, dir, 'package-lock.json')).mtimeMs > statSync(stamp).mtimeMs;
}

const responds = async (url, text) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return r.ok && (await r.text()).includes(text);
  } catch { return false; }
};
const apiUp = () => responds(`http://localhost:${API_PORT}/api/health`, '"ok"');
const webUp = () => responds(WEB_URL, 'Sổ Bán Hàng');
export const appUp = async () => (await apiUp()) && (await webUp());

const portBusy = (port) => new Promise((resolve) => {
  const s = net.connect({ port, host: 'localhost' });
  s.setTimeout(1000);
  s.on('connect', () => { s.destroy(); resolve(true); });
  s.on('timeout', () => { s.destroy(); resolve(false); });
  s.on('error', () => resolve(false));
});

export async function busyPort() {
  for (const port of [API_PORT, WEB_PORT]) if (await portBusy(port)) return port;
  return null;
}

export function openUrl(url) {
  const [cmd, ...args] = process.platform === 'win32' ? ['cmd', '/c', 'start', '""', url] : [process.platform === 'darwin' ? 'open' : 'xdg-open', url];
  spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true, windowsVerbatimArguments: process.platform === 'win32' }).unref();
}
