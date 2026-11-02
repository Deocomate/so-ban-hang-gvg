// Bảng điều khiển cho người không biết code (Mo-Ung-Dung.bat mở tệp này): một cửa sổ có nút bật/tắt ứng dụng, chế độ dữ liệu mẫu, sao lưu.
// Chỉ nhận kết nối từ chính máy này. Đóng cửa sổ thì tắt luôn ứng dụng để không còn tiến trình chạy ngầm. Thêm --no-window để không tự mở cửa sổ.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { root, WEB_URL, loadSettings, saveSettings, dataDirOf, dbFileOf, appEnv, sampleAccount, needsInstall, appUp, busyPort, openUrl } from './app-control.js';

const PORT = Number(process.env.PANEL_PORT || 4321);
const PANEL_URL = `http://127.0.0.1:${PORT}`;
const HOSTS = [`127.0.0.1:${PORT}`, `localhost:${PORT}`];
const START_WAIT_MS = 90000;
const CLOSE_GRACE_MS = 10000; // tải lại cửa sổ làm mất kết nối một nhịp, chưa phải đóng
const FIRST_OPEN_WAIT_MS = 120000;
const MAX_LOG = 500;
const BROWSERS = [
  path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
];

const settings = loadSettings();
const clients = new Set();
const logs = [];
let dev = null; // tiến trình ứng dụng do bảng điều khiển bật
let up = false;
let busy = '';
let note = '';

const snapshot = () => ({ status: busy ? 'busy' : dev ? (up ? 'on' : 'loading') : up ? 'external' : 'off', busy, note, url: WEB_URL, settings, account: sampleAccount() });
const send = (event, data) => { for (const c of clients) c.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
const pushState = () => send('state', snapshot());

function log(text) {
  // eslint-disable-next-line no-control-regex
  const lines = String(text).replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/).filter((l) => l.trim());
  logs.push(...lines);
  logs.splice(0, Math.max(0, logs.length - MAX_LOG));
  if (lines.length) send('log', lines);
}

function run(command, cwd) {
  return new Promise((resolve, reject) => {
    log(`> ${command}`);
    const p = spawn(command, { cwd, shell: true, env: appEnv(settings), windowsHide: true });
    p.stdout.on('data', log);
    p.stderr.on('data', log);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Lệnh "${command}" bị lỗi, xem Nhật ký.`))));
  });
}

async function startApp() {
  if (dev) return;
  if (await appUp()) { up = true; throw new Error('Ứng dụng đang chạy từ một cửa sổ khác. Hãy tắt ở đó trước.'); }
  const port = await busyPort();
  if (port) throw new Error(`Cổng ${port} đang bị chương trình khác dùng. Hãy tắt chương trình đó hoặc khởi động lại máy.`);
  for (const dir of ['server', 'web']) {
    if (needsInstall(dir)) {
      busy = `Đang cài thư viện cho ${dir === 'web' ? 'giao diện' : 'máy chủ'}, lần đầu mất khoảng 1 phút…`; pushState();
      await run('npm install --no-audit --no-fund', path.join(root, dir));
    }
  }
  if (settings.sample && !existsSync(dbFileOf(settings))) {
    busy = 'Đang nạp dữ liệu mẫu…'; pushState();
    await run('node scripts/seed-sample.js', path.join(root, 'server'));
  }
  busy = 'Đang bật ứng dụng…'; pushState();
  const child = spawn(process.execPath, [path.join(root, 'scripts', 'dev.js')], { cwd: root, env: appEnv(settings), windowsHide: true });
  dev = child;
  child.stdout.on('data', log);
  child.stderr.on('data', log);
  child.on('exit', () => {
    if (dev === child) dev = null;
    pushState();
  });
  const deadline = Date.now() + START_WAIT_MS;
  while (Date.now() < deadline) {
    if (!dev) throw new Error('Ứng dụng dừng ngay khi bật, xem Nhật ký.');
    if (await appUp()) {
      up = true;
      if (settings.openBrowser) openUrl(WEB_URL);
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Ứng dụng chưa sẵn sàng sau 90 giây, xem Nhật ký.');
}

async function stopApp() {
  if (!dev) return;
  // Trên Windows ứng dụng chạy qua npm và cmd nên phải dừng cả cây tiến trình
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(dev.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else dev.kill('SIGTERM');
  dev = null;
  for (let i = 0; i < 20 && (await busyPort()); i++) await new Promise((r) => setTimeout(r, 250));
  up = false;
  log('Đã tắt ứng dụng');
}

const stamp = () => new Date().toLocaleString('sv').replace(/[ :]/g, '-'); // giờ trên máy, dạng 2026-11-02-10-30-05

const ACTIONS = {
  start: ['Đang bật ứng dụng…', startApp],
  stop: ['Đang tắt ứng dụng…', stopApp],
  restart: ['Đang khởi động lại…', async () => { await stopApp(); await startApp(); }],
  open: ['', async () => openUrl(WEB_URL)],
  // Đổi chế độ dữ liệu: ứng dụng đang bật thì tự bật lại với kho dữ liệu kia
  sample: ['Đang đổi chế độ dữ liệu…', async ({ value }) => {
    const wasOn = !!dev;
    await stopApp();
    settings.sample = !!value;
    saveSettings(settings);
    if (wasOn) await startApp();
  }],
  option: ['', async ({ key, value }) => {
    if (!['openBrowser', 'autoStart'].includes(key)) throw new Error('Tùy chọn không hợp lệ');
    settings[key] = !!value;
    saveSettings(settings);
  }],
  // Dữ liệu cũ được chuyển sang thư mục riêng, không xóa
  reseed: ['Đang nạp lại dữ liệu mẫu…', async () => {
    if (!settings.sample) throw new Error('Hãy bật chế độ dữ liệu mẫu trước.');
    if (!dev && up) throw new Error('Ứng dụng đang chạy từ một cửa sổ khác. Hãy tắt ở đó trước.');
    await stopApp();
    const keep = path.join(dataDirOf(settings), 'truoc-nap-lai', stamp());
    mkdirSync(keep, { recursive: true });
    for (const suffix of ['', '-wal', '-shm']) {
      const f = dbFileOf(settings) + suffix;
      if (existsSync(f)) renameSync(f, path.join(keep, path.basename(f)));
    }
    log(`Dữ liệu cũ đã chuyển sang ${keep}`);
    await startApp();
  }],
  backup: ['Đang sao lưu…', async () => {
    if (!existsSync(dbFileOf(settings))) throw new Error('Chưa có dữ liệu để sao lưu, hãy bật ứng dụng trước.');
    const Database = createRequire(path.join(root, 'server', 'package.json'))('better-sqlite3');
    const dir = path.join(dataDirOf(settings), 'backups');
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `gomsu-thu-cong-${stamp()}.db`);
    const db = new Database(dbFileOf(settings), { readonly: true });
    try { await db.backup(file); } finally { db.close(); }
    log(`Đã sao lưu: ${file}`);
    return `Đã sao lưu: ${path.basename(file)}`;
  }],
  backups: ['', async () => {
    const dir = path.join(dataDirOf(settings), 'backups');
    mkdirSync(dir, { recursive: true });
    spawn('explorer', [dir], { stdio: 'ignore', detached: true }).unref();
  }],
};

async function act(name, body) {
  const [label, fn] = ACTIONS[name];
  if (busy) return;
  note = '';
  busy = label;
  pushState();
  try {
    note = (await fn(body)) || '';
  } catch (e) {
    note = e.message;
    log(e.message);
  }
  busy = '';
  up = await appUp();
  pushState();
}

function handle(req, res) {
  if (!HOSTS.includes(req.headers.host)) { res.writeHead(403).end(); return; }
  const url = req.url.split('?')[0];
  if (req.method === 'GET' && url === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(readFileSync(path.join(root, 'scripts', 'control-panel.html')));
    return;
  }
  if (req.method === 'GET' && url === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
    clients.add(res);
    res.write(`event: log\ndata: ${JSON.stringify(logs)}\n\n`);
    res.write(`event: state\ndata: ${JSON.stringify(snapshot())}\n\n`);
    req.on('close', () => clients.delete(res));
    return;
  }
  // Tiêu đề riêng chặn trang web lạ gửi lệnh tới cổng này
  const name = url.startsWith('/action/') ? url.slice(8) : '';
  if (req.method === 'POST' && Object.hasOwn(ACTIONS, name) && req.headers['x-panel'] === '1') {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch { /* bỏ qua thân lỗi */ }
      act(name, body);
      res.writeHead(202).end();
    });
    return;
  }
  res.writeHead(404).end();
}

function openWindow() {
  if (process.argv.includes('--no-window')) return;
  const browser = BROWSERS.find((f) => existsSync(f));
  if (!browser) { openUrl(PANEL_URL); return; }
  spawn(browser, [`--app=${PANEL_URL}`, '--window-size=600,860'], { stdio: 'ignore', detached: true }).unref();
}

async function quit() {
  await stopApp();
  process.exitCode = 0;
  server.close();
  clearInterval(watch);
  for (const c of clients) c.end();
}

const server = http.createServer(handle);
let seen = false;
let idleSince = Date.now();
let watch;

// Đã có bảng điều khiển đang mở: chỉ mở thêm cửa sổ
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') openWindow();
  else throw e;
});

server.listen(PORT, '127.0.0.1', async () => {
  openWindow();
  log('Đã mở bảng điều khiển');
  watch = setInterval(async () => {
    // Đang bật, tắt, nạp dữ liệu thì làm cho xong rồi mới được thoát, kể cả khi cửa sổ đã đóng
    if (busy) return;
    if (clients.size) { seen = true; idleSince = Date.now(); }
    else if (Date.now() - idleSince > (seen ? CLOSE_GRACE_MS : FIRST_OPEN_WAIT_MS)) { quit(); return; }
    const now = await appUp();
    if (now !== up) { up = now; pushState(); }
  }, 2000);
  up = await appUp();
  if (settings.autoStart && !up) act('start', {});
  else pushState();
});
