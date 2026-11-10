// Chuyển tệp xuất KiotViet thành bản sao lưu gomsu-backup-v1 để nạp vào sổ Thanh Hải (Cài đặt → Nhập bản sao lưu JSON).
// Chạy: node scripts/kiotviet-to-backup.js --kiotviet <tệp.json> --ra <thư-mục> [--so-cong-no <tệp.json>]
//         [--chi-nhanh-cu <tệp.json> …] [--danh-muc <danh-muc-moi.json> --ghep <ghep-ma-hang.json>]
//   --danh-muc: danh mục hàng mới đọc từ file Excel của khách ({rows, images}); --ghep: {mapping: {mã KiotViet: mã mới}} hoặc {mã: mã}
// Đầu ra: so-th-tu-kiotviet.json (bản sao lưu) và doi-chieu-kiotviet.json (đối chiếu, phần bù chênh lệch, phần không nhập).
import fs from 'node:fs';
import path from 'node:path';
import { today } from '../src/lib/context.js';
import { convertKiotViet } from './kiotviet-convert.js';

const opts = {}; const multi = new Set(['chi-nhanh-cu']);
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
  const k = argv[i].replace(/^--/, ''); const v = argv[i + 1];
  if (multi.has(k)) (opts[k] ||= []).push(v); else opts[k] = v;
}
if (!opts.kiotviet || !opts.ra) {
  console.error('Cách dùng: node scripts/kiotviet-to-backup.js --kiotviet <tệp.json> --ra <thư-mục> [--so-cong-no <tệp>] [--chi-nhanh-cu <tệp> …] [--danh-muc <tệp> --ghep <tệp>]');
  process.exit(1);
}
const read = (f) => (f ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const src = read(opts.kiotviet);
let catalog = null;
if (opts['danh-muc']) {
  const g = read(opts.ghep) || {};
  catalog = { ...read(opts['danh-muc']), mapping: g.mapping || g };
}
const t0 = Date.now();
const { backup, report } = convertKiotViet(src.data || src, {
  today: today(), ledger: read(opts['so-cong-no']), hidden: (opts['chi-nhanh-cu'] || []).map(read), catalog, log: (m) => console.log(m),
});
fs.mkdirSync(opts.ra, { recursive: true });
const out = path.join(opts.ra, 'so-th-tu-kiotviet.json');
fs.writeFileSync(out, JSON.stringify(backup));
fs.writeFileSync(path.join(opts.ra, 'doi-chieu-kiotviet.json'), JSON.stringify(report, null, 1));
console.log(`Xong sau ${Math.round((Date.now() - t0) / 1000)} giây. Bản sao lưu: ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
console.log('Số lượng:', report.counts);
console.log('Tổng:', report.totals);
console.log(`Bù chênh lệch: ${report.adjustments.customers.length} khách, ${report.adjustments.suppliers.length} NCC, ${report.adjustments.stock.length} mã hàng`);
console.log(`Lập riêng: ${report.fallbacks.length} · Không nhập: ${report.skipped.length} · Cảnh báo: ${report.warnings.length}`);
