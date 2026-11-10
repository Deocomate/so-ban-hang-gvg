// Nạp tệp sao lưu JSON (gomsu-backup-v1) vào một sổ ngay trên máy chủ, dùng cho tệp quá lớn để tải lên qua giao diện
// (vd. bản chuyển từ KiotViet kèm ảnh hàng hóa). Chạy đúng hàm import_book như nút "Nhập bản sao lưu JSON":
// chỉ nạp vào sổ chưa có chứng từ, dưới quyền chủ sổ. Tự sao lưu CSDL trước khi ghi.
// Chạy (khi dịch vụ đã dừng): npm run import-book -- <mã sổ, vd. TH> <tệp.json>
import fs from 'node:fs';
import { openDb } from '../src/db/index.js';
import { config } from '../src/config.js';
import { ctx, nowIso } from '../src/lib/context.js';
import { callRpc } from '../src/domain/rpc.js';

const [short, file] = process.argv.slice(2);
if (!short || !file) { console.error('Cách dùng: npm run import-book -- <mã sổ, vd. TH> <tệp.json>'); process.exit(1); }
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
openDb(config.dbPath);
const book = ctx.db.prepare(`select b.id, b.name, m.user_id from books b join book_members m on m.book_id = b.id and m.role = 'owner'
  where b.short_name = ? and b.is_demo = 0 order by b.created_at limit 1`).get(short);
if (!book) { console.error(`Không tìm thấy sổ "${short}"`); process.exit(1); }
const backup = `${config.dbPath}.truoc-nap-${short}-${nowIso().slice(0, 19).replace(/[-:T]/g, '')}.bak`;
ctx.db.prepare('vacuum into ?').run(backup);
console.log(`Đã sao lưu CSDL: ${backup}`);
try {
  const r = callRpc(book.user_id, 'import_book', { book_id: book.id, data });
  console.log(`Đã nạp vào sổ "${book.name}":`, Object.entries(r.counts).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(' · '));
  console.log(r.stock_mismatch.length ? `Tồn kho chưa khớp sổ kho: ${r.stock_mismatch.join(', ')}` : 'Tồn kho từng mã khớp sổ kho.');
} catch (e) { console.error('Không nạp được:', e.message); process.exit(1); }
