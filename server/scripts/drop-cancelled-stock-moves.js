// Dọn sổ kho theo cách hủy chứng từ như KiotViet, cho dữ liệu ghi trước khi đổi cách hủy (23/11/2026): trước đây hủy phiếu giao /
// hóa đơn, phiếu nhập, phiếu trả hàng nhập thì ghi thêm dòng "trả về kho" vào ngày hủy. Lệnh bỏ cả dòng gốc lẫn dòng đảo của các
// chứng từ đã hủy rồi tính lại giá vốn từ ngày sớm nhất, nên tồn ở mọi ngày trước đây như chưa từng có chứng từ đó.
// Tồn hiện tại từng mã không đổi (dòng gốc và dòng đảo cộng lại bằng 0). Chạy lại không làm gì thêm.
// Chạy (khi dịch vụ đã dừng): node scripts/drop-cancelled-stock-moves.js [--thu]
import { openDb } from '../src/db/index.js';
import { config } from '../src/config.js';
import { ctx, nowIso } from '../src/lib/context.js';
import { dropDocMoves } from '../src/domain/costing.js';

const dry = process.argv.includes('--thu');
openDb(config.dbPath);
const db = ctx.db;
const all = (q, ...a) => db.prepare(q).all(...a);

if (!dry) {
  const backup = `${config.dbPath}.truoc-don-so-kho-huy-${nowIso().slice(0, 19).replace(/[-:T]/g, '')}.bak`;
  db.prepare('vacuum into ?').run(backup);
  console.log(`Đã sao lưu CSDL: ${backup}`);
}
db.exec('begin');
try {
  for (const b of all(`select id, name from books`)) {
    ctx.uid = all(`select user_id from book_members where book_id = ? and role = 'owner' limit 1`, b.id)[0]?.user_id ?? null;
    const before = Object.fromEntries(all(`select id, on_hand from products where book_id = ?`, b.id).map((p) => [p.id, p.on_hand]));
    const groups = [
      ['giao', all(`select doc_id as id, min(move_date) as d, count(*) as n from stock_moves m where book_id = ? and doc_type = 'giao'
        and not exists (select 1 from deliveries x where x.id = m.doc_id) group by doc_id`, b.id)],
      ['nhap', all(`select m.doc_id as id, min(m.move_date) as d, count(*) as n from stock_moves m join goods_receipts g on g.id = m.doc_id
        where m.book_id = ? and m.doc_type = 'nhap' and g.cancelled_at is not null group by m.doc_id`, b.id)],
      ['tra_ncc', all(`select m.doc_id as id, min(m.move_date) as d, count(*) as n from stock_moves m join supplier_returns r on r.id = m.doc_id
        where m.book_id = ? and m.doc_type = 'tra_ncc' and r.cancelled_at is not null group by m.doc_id`, b.id)],
    ];
    const parts = [];
    for (const [type, rows] of groups) {
      if (!rows.length) continue;
      dropDocMoves(b.id, type, rows.map((r) => r.id), rows.reduce((m, r) => (r.d < m ? r.d : m), rows[0].d));
      parts.push(`${type}: ${rows.length} chứng từ, ${rows.reduce((s, r) => s + r.n, 0)} dòng`);
    }
    const changed = all(`select sku, on_hand, id from products where book_id = ?`, b.id).filter((p) => Math.abs(p.on_hand - (before[p.id] ?? 0)) > 1e-6);
    if (changed.length) throw new Error(`Sổ ${b.name}: tồn hiện tại bị đổi ở ${changed.map((p) => p.sku).join(', ')}`);
    if (parts.length) console.log(`${b.name}: ${parts.join('; ')}`);
  }
  db.exec(dry ? 'rollback' : 'commit');
  console.log(dry ? 'Chạy thử: đã hoàn tác, không ghi gì.' : 'Đã ghi vào CSDL.');
} catch (e) {
  db.exec('rollback');
  console.error('Không dọn được, không ghi gì:', e.message);
  process.exit(1);
}
