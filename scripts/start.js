// Chạy ứng dụng bằng lệnh (khung Preview của Claude dùng tệp này): tự cài thư viện, tự nạp dữ liệu mẫu lần đầu, chạy API + giao diện rồi mở trình duyệt.
// Ứng dụng đang chạy sẵn thì chỉ mở trình duyệt, không chạy trùng. Thêm --no-open để không mở trình duyệt. Chế độ dữ liệu theo cài đặt của bảng điều khiển.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { root, WEB_URL, loadSettings, dbFileOf, appEnv, needsInstall, appUp, busyPort, openUrl } from './app-control.js';

const WAIT_MS = 90000;
const noOpen = process.argv.includes('--no-open');
const settings = loadSettings();
const env = appEnv(settings);
const openBrowser = () => { if (!noOpen) openUrl(WEB_URL); };

function run(command, cwd) {
  if (spawnSync(command, { cwd, shell: true, stdio: 'inherit', env }).status !== 0) throw new Error(`Lệnh "${command}" bị lỗi. Hãy chụp màn hình này gửi người phụ trách.`);
}

// Không gọi process.exit: trên Windows thoát ngay sau fetch làm Node báo lỗi libuv
async function main() {
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error(`Cần Node.js 20 trở lên, máy đang có ${process.version}. Hãy cài bản LTS ở https://nodejs.org rồi mở lại.`);

  if (await appUp()) {
    console.log(`Ứng dụng đang chạy sẵn: ${WEB_URL}`);
    openBrowser();
    return;
  }
  const port = await busyPort();
  if (port) throw new Error(`Cổng ${port} đang bị chương trình khác dùng. Hãy tắt chương trình đó hoặc khởi động lại máy rồi mở lại.`);

  for (const dir of ['server', 'web']) {
    if (needsInstall(dir)) {
      console.log(`Đang cài thư viện cho ${dir} (chỉ lâu ở lần đầu)…`);
      run('npm install --no-audit --no-fund', path.join(root, dir));
    }
  }

  if (settings.sample && !existsSync(dbFileOf(settings))) {
    console.log('Lần chạy đầu: đang nạp dữ liệu mẫu…');
    run('node scripts/seed-sample.js', path.join(root, 'server'));
  }

  let running = true;
  const dev = spawn(process.execPath, [path.join(root, 'scripts', 'dev.js')], { cwd: root, stdio: 'inherit', env });
  dev.on('exit', (code) => { running = false; process.exitCode = code ?? 0; });
  // Ctrl+C đi thẳng tới dev.js; tệp này chờ dev.js dừng xong mới thoát
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => {});

  const deadline = Date.now() + WAIT_MS;
  while (running && Date.now() < deadline) {
    if (await appUp()) {
      console.log(`\n=== Ứng dụng đã sẵn sàng: ${WEB_URL} ===\n`);
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
