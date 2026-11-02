// Mở ứng dụng bằng một cú bấm (Mo-Ung-Dung.bat gọi tệp này): tự cài thư viện, tự nạp dữ liệu mẫu lần đầu, chạy API + giao diện rồi mở trình duyệt.
// Ứng dụng đang chạy sẵn thì chỉ mở trình duyệt, không chạy trùng. Thêm --no-open để không mở trình duyệt.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Không đọc PORT: khung Preview của Claude tự đặt PORT bằng cổng giao diện
const API_PORT = Number(process.env.API_PORT || 3000);
const WEB_PORT = Number(process.env.WEB_PORT || 5173);
const WEB_URL = `http://localhost:${WEB_PORT}`;
const WAIT_MS = 90000;
const noOpen = process.argv.includes('--no-open');
const dbFile = process.env.DB_PATH || path.join(process.env.DATA_DIR || path.join(root, 'server', 'data'), 'gomsu.db');

function run(command, cwd) {
  if (spawnSync(command, { cwd, shell: true, stdio: 'inherit', env: process.env }).status !== 0) throw new Error(`Lệnh "${command}" bị lỗi. Hãy chụp màn hình này gửi người phụ trách.`);
}

// Thư viện chưa cài, hoặc package-lock.json mới hơn lần cài trước (vừa cập nhật mã)
function needsInstall(dir) {
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

const portBusy = (port) => new Promise((resolve) => {
  const s = net.connect({ port, host: 'localhost' });
  s.setTimeout(1000);
  s.on('connect', () => { s.destroy(); resolve(true); });
  s.on('timeout', () => { s.destroy(); resolve(false); });
  s.on('error', () => resolve(false));
});

function openBrowser() {
  if (noOpen) return;
  const [cmd, ...args] = process.platform === 'win32' ? ['cmd', '/c', 'start', '""', WEB_URL] : [process.platform === 'darwin' ? 'open' : 'xdg-open', WEB_URL];
  spawn(cmd, args, { stdio: 'ignore', detached: true, windowsVerbatimArguments: process.platform === 'win32' }).unref();
}

// Không gọi process.exit: trên Windows thoát ngay sau fetch làm Node báo lỗi libuv
async function main() {
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error(`Cần Node.js 20 trở lên, máy đang có ${process.version}. Hãy cài bản LTS ở https://nodejs.org rồi mở lại.`);

  if ((await apiUp()) && (await webUp())) {
    console.log(`Ứng dụng đang chạy sẵn: ${WEB_URL}`);
    openBrowser();
    return;
  }
  for (const port of [API_PORT, WEB_PORT]) {
    if (await portBusy(port)) throw new Error(`Cổng ${port} đang bị chương trình khác dùng. Hãy tắt chương trình đó hoặc khởi động lại máy rồi mở lại.`);
  }

  for (const dir of ['server', 'web']) {
    if (needsInstall(dir)) {
      console.log(`Đang cài thư viện cho ${dir} (chỉ lâu ở lần đầu)…`);
      run('npm install --no-audit --no-fund', path.join(root, dir));
    }
  }

  if (!existsSync(dbFile)) {
    console.log('Lần chạy đầu: đang nạp dữ liệu mẫu…');
    run('node scripts/seed-sample.js', path.join(root, 'server'));
  }

  let running = true;
  const env = { ...process.env, PORT: String(API_PORT), API_URL: `http://localhost:${API_PORT}` };
  const dev = spawn(process.execPath, [path.join(root, 'scripts', 'dev.js')], { cwd: root, stdio: 'inherit', env });
  dev.on('exit', (code) => { running = false; process.exitCode = code ?? 0; });
  // Ctrl+C đi thẳng tới dev.js; tệp này chờ dev.js dừng xong mới thoát
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => {});

  const deadline = Date.now() + WAIT_MS;
  while (running && Date.now() < deadline) {
    if ((await apiUp()) && (await webUp())) {
      console.log(`\n=== Ứng dụng đã sẵn sàng: ${WEB_URL} ===`);
      console.log('Sửa mã là trình duyệt tự cập nhật. Giữ cửa sổ này mở trong lúc dùng; đóng cửa sổ để tắt ứng dụng.\n');
      openBrowser();
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (running) console.error('Ứng dụng chưa sẵn sàng sau 90 giây. Xem thông báo lỗi phía trên.');
}

main().catch((e) => {
  console.error(`\n${e.message}`);
  process.exitCode = 1;
});
