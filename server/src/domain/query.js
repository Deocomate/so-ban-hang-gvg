// Đọc dữ liệu chung: p = {view, book_id, filters:[[cột, phép, giá trị]...], order:'cột desc', limit}
import { fail, all, outRows } from '../lib/context.js';
import { requirePerm } from './access.js';

// view → quyền cần có ('' = chỉ cần là thành viên sổ)
const VIEWS = {
  products: '', price_books: '', price_book_items: '', customers: '', suppliers: '', sales_orders: 'xem_ban_hang', sales_order_lines: 'xem_ban_hang', deliveries: 'xem_ban_hang', delivery_lines: 'xem_ban_hang', sales_returns: 'xem_ban_hang',
  stock_moves: '', adjustments: '', productions: '', bom_items: '', employees: '', shifts: '', work_schedules: '', timesheets: 'cham_cong', commission_tables: 'owner', paysheets: 'owner', paysheet_lines: 'owner', opening_debts: '', doc_payments: '', purchase_orders: 'xem_nhap_hang', purchase_order_lines: 'xem_nhap_hang', receipts: 'xem_nhap_hang',
  supplier_returns: 'xem_nhap_hang', funds: '', drivers: '', driver_trips: 'xem_ban_hang', quotes: 'xem_ban_hang', contracts: 'xem_ban_hang', attachments: '', tax_invoices: 'xem_bao_cao', payments: 'xem_thu_chi', open_docs: '', expenses: 'xem_chi_phi', members: 'owner', audit: 'owner', shipments: 'xem_ban_hang', bank_txns: 'xem_thu_chi',
};
const BOOL_COLS = new Set(['is_kit', 'active', 'is_low', 'voided', 'restock', 'is_late', 'is_final', 'has_problem', 'assigned', 'order_cancelled', 'sell_direct', 'in_effect']);
const IDENT = /^[a-z_][a-z0-9_]*$/;

// Giá trị lọc: 'true'/'false' cho cột đúng/sai → 1/0; chuỗi số chuẩn → số (so được cả với cột tính toán)
function value(col, v) {
  if (v == null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  const s = String(v);
  if (BOOL_COLS.has(col) && (s === 'true' || s === 'false')) return s === 'true' ? 1 : 0;
  if (/^-?\d+(\.\d+)?$/.test(s) && String(Number(s)) === s) return Number(s);
  return s;
}

export function q(p) {
  const v = p.view;
  if (!Object.hasOwn(VIEWS, v)) fail(`Không có bảng dữ liệu "${v ?? ''}"`);
  requirePerm(p.book_id, VIEWS[v] || null);
  const where = ['book_id = ?']; const args = [p.book_id];
  for (const f of p.filters || []) {
    const [col, op0, raw] = f; const op = op0 || 'eq';
    if (!IDENT.test(String(col))) fail('Cột không hợp lệ');
    const c = `"${col}"`;
    switch (op) {
      case 'eq': where.push(`${c} = ?`); args.push(value(col, raw)); break;
      case 'neq': where.push(`${c} is not ?`); args.push(value(col, raw)); break;
      case 'gte': where.push(`${c} >= ?`); args.push(value(col, raw)); break;
      case 'lte': where.push(`${c} <= ?`); args.push(value(col, raw)); break;
      case 'gt': where.push(`${c} > ?`); args.push(value(col, raw)); break;
      case 'lt': where.push(`${c} < ?`); args.push(value(col, raw)); break;
      case 'in': {
        const arr = Array.isArray(raw) ? raw : [];
        where.push(arr.length ? `${c} in (${arr.map(() => '?').join(', ')})` : '0');
        args.push(...arr.map((x) => value(col, x)));
        break;
      }
      case 'is_null': where.push(`${c} is null`); break;
      case 'not_null': where.push(`${c} is not null`); break;
      case 'ilike': where.push(`vi_lower(${c}) like ?`); args.push('%' + String(raw ?? '').toLowerCase() + '%'); break;
      default: fail('Phép lọc không hợp lệ');
    }
  }
  let order = '';
  if (p.order && String(p.order).trim()) {
    const [col, dir] = String(p.order).trim().split(/\s+/);
    if (!IDENT.test(col)) fail('Cột sắp xếp không hợp lệ');
    order = ` order by "${col}" ${String(dir || '').toLowerCase() === 'desc' ? 'desc' : 'asc'} nulls last`;
  }
  const lim = Math.min(Number.isFinite(Number(p.limit)) && p.limit != null ? Math.trunc(Number(p.limit)) : 2000, 10000);
  return outRows(all(`select * from v_${v} where ${where.join(' and ')}${order} limit ${lim}`, ...args));
}
