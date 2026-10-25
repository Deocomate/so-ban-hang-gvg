// Lịch tự động (giờ Việt Nam): báo cáo cuối ngày 21:00, nhắc công nợ 08:00, sao lưu CSDL 03:00, gửi thông báo đẩy mỗi phút.
// Thông báo có khóa chống trùng theo ngày nên khởi động lại máy chủ không gửi lặp.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { ctx, today } from '../lib/context.js';
import { callService } from '../domain/rpc.js';
import { runScheduled } from '../domain/notify.js';
import { flushPush } from './push.js';

const vnHour = () => new Date(Date.now() + 7 * 3600e3).getUTCHours();
const done = new Map();   // việc → ngày đã chạy

// Sao lưu nóng (không dừng máy chủ) ra thư mục backups, giữ N bản mới nhất
export async function backupNow() {
  fs.mkdirSync(config.backupDir, { recursive: true });
  const file = path.join(config.backupDir, `gomsu-${today()}.db`);
  await ctx.db.backup(file);
  const old = fs.readdirSync(config.backupDir).filter((f) => /^gomsu-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse().slice(config.backupKeep);
  for (const f of old) fs.rmSync(path.join(config.backupDir, f), { force: true });
  return file;
}

const JOBS = [
  { name: 'daily_report', hour: 21, run: () => console.log('báo cáo ngày', callService(runScheduled, { kind: 'daily_report' })) },
  { name: 'debt_reminder', hour: 8, run: () => console.log('nhắc công nợ', callService(runScheduled, { kind: 'debt_reminder' })) },
  { name: 'backup', hour: 3, run: () => backupNow().then((f) => console.log('đã sao lưu', f)) },
];

async function tick() {
  const d = today(); const h = vnHour();
  for (const j of JOBS) {
    if (h !== j.hour || done.get(j.name) === d) continue;
    done.set(j.name, d);
    try { await j.run(); } catch (e) { console.error(`lịch ${j.name} lỗi`, e); }
  }
  try { await flushPush(); } catch (e) { console.error('push', e); }
}

export function startScheduler() {
  const t = setInterval(tick, 60e3);
  t.unref?.();
  tick();
  return t;
}
