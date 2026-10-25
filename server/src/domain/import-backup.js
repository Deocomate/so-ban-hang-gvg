// Nhập bản sao lưu JSON của 1 sổ (định dạng gomsu-backup-v1) vào sổ đang mở.
// Dùng để chuyển dữ liệu từ bản Supabase cũ (Cài đặt → Tải bản sao lưu JSON) hoặc khôi phục giữa các máy chủ mới.
// Chỉ nhập vào sổ CHƯA có chứng từ; danh mục mặc định của sổ trống (2 quỹ, khách lẻ) được thay bằng dữ liệu trong tệp.
import { ctx, fail, one, all, run, json, nowIso, outRows } from '../lib/context.js';
import { requirePerm } from './access.js';
import { expenseGroupOf } from './cash.js';
import { auditTriggers, dropAuditTriggers } from '../db/index.js';

// Thứ tự nhập theo ràng buộc khóa ngoại
const TABLES = ['funds', 'products', 'kit_items', 'customers', 'suppliers', 'opening_debts', 'sales_orders', 'sales_order_lines', 'deliveries',
  'delivery_lines', 'sales_returns', 'sales_return_lines', 'purchase_orders', 'purchase_order_lines', 'goods_receipts', 'goods_receipt_lines',
  'supplier_returns', 'supplier_return_lines', 'stock_adjustments', 'stock_adjustment_lines', 'stock_moves', 'payments', 'payment_allocations',
  'expenses', 'shipments', 'shipment_events', 'bank_txns', 'notifications', 'doc_info', 'doc_counters'];
// Bảng có khóa số tự tăng: bỏ khóa cũ (tránh trùng với sổ khác), giữ thứ tự ghi
const AUTO_ID = new Set(['stock_moves', 'shipment_events', 'notifications']);
// Bảng đã có chứng từ thì không cho nhập đè
const TXN_TABLES = ['sales_orders', 'purchase_orders', 'payments', 'stock_moves', 'expenses', 'opening_debts', 'stock_adjustments', 'shipments'];
// Danh mục mặc định của sổ trống, xóa trước khi nhập
const CLEAR = ['doc_info', 'notifications', 'bank_txns', 'kit_items', 'products', 'customers', 'suppliers', 'funds', 'doc_counters'];

// Thời điểm Postgres ("2026-10-12 08:00:00.123456+00", "…T…+07:00") → ISO UTC giống dữ liệu do máy chủ này ghi
const TS_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$/;
function cell(v) {
  if (typeof v === 'string' && TS_RE.test(v)) {
    const t = new Date(v.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
    if (!isNaN(+t)) return t.toISOString();
  }
  return v;
}

export function import_book(p) {
  const b = p.book_id; const data = p.data;
  requirePerm(b, 'owner');
  if (!data || typeof data !== 'object' || data.format !== 'gomsu-backup-v1') fail('Tệp không phải bản sao lưu JSON của Sổ bán hàng gốm (thiếu "format": "gomsu-backup-v1")');
  const src = Array.isArray(data.books) ? data.books[0] : null;
  if (!src?.id) fail('Bản sao lưu thiếu thông tin sổ');
  for (const t of TXN_TABLES) {
    if (one(`select 1 from ${t} where book_id = ? limit 1`, b)) fail('Sổ đang mở đã có chứng từ — chỉ nhập được vào sổ trống. Hãy dùng sổ mới hoặc máy chủ mới.');
  }
  if (src.id !== b && one(`select 1 from sales_orders where book_id = ? limit 1`, src.id)) fail('Dữ liệu trong tệp đã có trên máy chủ này (đã nhập trước đó).');

  dropAuditTriggers(ctx.db);
  try {
    for (const t of CLEAR) {
      if (t === 'kit_items') run(`delete from kit_items where kit_id in (select id from products where book_id = ?)`, b);
      else if (t === 'bank_txns') run(`delete from bank_txns where book_id = ?`, b);
      else run(`delete from ${t} where book_id = ?`, b);
    }
    const counts = {};
    for (const t of TABLES) {
      const rows = Array.isArray(data[t]) ? [...data[t]] : [];
      if (!rows.length) { counts[t] = 0; continue; }
      const cols = all(`select name from pragma_table_info(?)`, t).map((c) => c.name).filter((c) => !(AUTO_ID.has(t) && c === 'id'));
      if (AUTO_ID.has(t)) rows.sort((x, y) => Number(x.id) - Number(y.id));
      for (const r0 of rows) {
        const r = { ...r0 };
        if (cols.includes('book_id')) r.book_id = b;
        if (t === 'bank_txns') {
          // Khoản chưa xác định sổ: giữ chờ xử lý; nhập sổ thứ hai thì chỉ thêm sổ đó vào danh sách có thể nhận
          const ex = one(`select id, book_id, candidate_books from bank_txns where provider = ? and ext_id = ?`, r.provider, r.ext_id);
          if (ex) {
            if (ex.book_id == null && r0.book_id == null) run(`update bank_txns set candidate_books = ? where id = ?`, [...new Set([...json(ex.candidate_books, []), b])], ex.id);
            continue;
          }
          r.book_id = r0.book_id == null ? null : b; r.candidate_books = [b];
        }
        if (t === 'expenses' && !r.expense_group) r.expense_group = expenseGroupOf(b, r.category);
        const keys = cols.filter((c) => r[c] !== undefined);
        const sql = t === 'doc_counters'
          ? `insert into doc_counters (${keys.join(', ')}) values (${keys.map(() => '?').join(', ')}) on conflict (book_id, kind) do update set last_no = excluded.last_no`
          : `insert into ${t} (${keys.join(', ')}) values (${keys.map(() => '?').join(', ')})`;
        try {
          run(sql, ...keys.map((c) => cell(r[c])));
        } catch (e) {
          fail(`Không nhập được bảng ${t} (dòng ${r.code || r.sku || r.id || ''}): ${e.message}`);
        }
      }
      counts[t] = rows.length;
    }
    // Sổ: tên, mã sổ (dùng trong nội dung chuyển khoản), cài đặt
    run(`update books set name = coalesce(?, name), short_name = coalesce(?, short_name), settings = ? where id = ?`,
      src.name ?? null, src.short_name ?? null, typeof src.settings === 'object' && src.settings ? src.settings : json(src.settings), b);

    // Đối chiếu: tồn từng mã khớp sổ kho
    const mismatch = all(`select p.sku from products p left join (select product_id, sum(qty) q, sum(value) v from stock_moves group by 1) m on m.product_id = p.id
      where p.book_id = ? and p.is_kit = 0 and (abs(coalesce(m.q, 0) - p.on_hand) > 0.0001 or abs(coalesce(m.v, 0) - p.stock_value) > 0.5)`, b).map((x) => x.sku);
    const skippedMembers = outRows(Array.isArray(data.book_members) ? data.book_members : []).filter((m) => m.role !== 'owner').map((m) => m.display_name || m.user_id);
    run(`insert into audit_log (book_id, user_id, at, table_name, op, row_id, old_data, new_data) values (?, ?, ?, 'books', 'IMPORT', ?, null, ?)`,
      b, ctx.uid, nowIso(), b, JSON.stringify({ source_book: src.id, exported_at: data.exported_at ?? null, counts }));
    return { ok: true, counts, stock_mismatch: mismatch, staff_to_readd: skippedMembers, book_name: src.name, short_name: src.short_name };
  } finally {
    auditTriggers(ctx.db);
  }
}
