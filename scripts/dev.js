// Chạy cùng lúc API (cổng 3000, tự khởi động lại khi sửa mã) và giao diện Vite (cổng 5173). Ctrl+C dừng cả hai.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apps = [
  { name: 'api', dir: 'server', color: 36 },
  { name: 'web', dir: 'web', color: 35 },
];

for (const a of apps) {
  if (!existsSync(path.join(root, a.dir, 'node_modules'))) {
    console.error(`Thiếu thư viện trong ${a.dir}/ — chạy "npm run setup" trước.`);
    process.exit(1);
  }
}

const children = apps.map((a) => {
  const tag = `\x1b[${a.color}m[${a.name}]\x1b[0m `;
  const child = spawn('npm run dev', { cwd: path.join(root, a.dir), shell: true, env: process.env });
  const pipe = (src, dst) => {
    let buf = '';
    src.on('data', (d) => {
      buf += d;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines) dst.write(tag + l + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${tag}đã dừng (mã ${code})`);
    stopAll();
  });
  return child;
});

let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    if (c.exitCode !== null) continue;
    // Trên Windows, npm chạy qua cmd nên phải dừng cả cây tiến trình
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
    else c.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
