// Mở CSDL SQLite: tạo bảng, đăng ký hàm tự định nghĩa (dùng trong view), dựng lại view và trigger nhật ký.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { ctx, today, vnDate, daysBetween, nowIso } from '../lib/context.js';
import { shipStatusLabel, codStatusLabel, carrierName } from '../lib/labels.js';
import { can } from '../domain/access.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_VERSION = 1;

// Bảng ghi nhật ký chỉnh sửa; cột bỏ qua khi so sánh UPDATE (do hệ thống tự cập nhật)
const AUDIT_TABLES = {
  books: '', book_members: '', products: 'on_hand,stock_value,last_cost', customers: '', suppliers: '', funds: '', opening_debts: '',
  sales_orders: '', sales_order_lines: 'delivered_qty,returned_qty', deliveries: '', sales_returns: '', purchase_orders: '',
  purchase_order_lines: 'received_qty,returned_qty', goods_receipts: '', supplier_returns: '', stock_adjustments: '', payments: '',
  payment_allocations: '', expenses: '',
  shipments: 'status,status_at,status_detail,last_sync_at,tracking_registered_at,cod_status,cod_settled_at,cod_payment_ids',
  bank_txns: '',
};
const JSON_TEXT_COLS = new Set(['settings', 'perms', 'notify', 'cod_payment_ids', 'candidate_books', 'payment_ids', 'raw', 'data', 'payload']);

function registerFunctions(db) {
  db.function('today', () => today());
  db.function('now_iso', () => nowIso());
  db.function('current_uid', () => ctx.uid);
  db.function('vn_date', { deterministic: true }, (ts) => vnDate(ts));
  db.function('days', { deterministic: true }, (a, b) => daysBetween(a, b));
  db.function('can_cost', (book) => (can(book, 'xem_gia_von') ? 1 : 0));
  db.function('ship_status_label', { deterministic: true }, (s) => shipStatusLabel(s));
  db.function('cod_status_label', { deterministic: true }, (s) => codStatusLabel(s));
  db.function('carrier_name', { deterministic: true }, (c) => carrierName(c));
  db.function('vi_lower', { deterministic: true }, (s) => (s == null ? null : String(s).toLowerCase()));
}

export function dropAuditTriggers(db) {
  for (const t of Object.keys(AUDIT_TABLES)) db.exec(`drop trigger if exists audit_${t}_ins; drop trigger if exists audit_${t}_upd; drop trigger if exists audit_${t}_del;`);
}

export function auditTriggers(db) {
  for (const [t, ignore] of Object.entries(AUDIT_TABLES)) {
    const cols = db.prepare(`select name from pragma_table_info(?)`).all(t).map((r) => r.name);
    const has = (c) => cols.includes(c);
    const obj = (r) => `json_object(${cols.map((c) => `'${c}', ${JSON_TEXT_COLS.has(c) ? `json(${r}.${c})` : `${r}.${c}`}`).join(', ')})`;
    const bookExpr = (r) => (t === 'books' ? `${r}.id` : `${r}.book_id`);
    const rowId = (r) => (has('id') ? `${r}.id` : 'null');
    const skip = new Set([...ignore.split(',').filter(Boolean), 'updated_at']);
    const cmp = cols.filter((c) => !skip.has(c)).map((c) => `old.${c} is not new.${c}`).join(' or ');
    const ins = (op, b, rid, o, n) => `insert into audit_log (book_id, user_id, at, table_name, op, row_id, old_data, new_data)
      values (${b}, current_uid(), now_iso(), '${t}', '${op}', ${rid}, ${o}, ${n});`;
    db.exec(`
      drop trigger if exists audit_${t}_ins; drop trigger if exists audit_${t}_upd; drop trigger if exists audit_${t}_del;
      create trigger audit_${t}_ins after insert on ${t} begin ${ins('INSERT', bookExpr('new'), rowId('new'), 'null', obj('new'))} end;
      create trigger audit_${t}_upd after update on ${t} when ${cmp} begin
        ${ins('UPDATE', `coalesce(${bookExpr('new')}, ${bookExpr('old')})`, rowId('new'), obj('old'), obj('new'))} end;
      create trigger audit_${t}_del after delete on ${t} begin ${ins('DELETE', bookExpr('old'), rowId('old'), obj('old'), 'null')} end;`);
  }
}

// CSDL tạo từ bản cũ: thêm các cột mới (dữ liệu cũ giữ nguyên, cột mới để trống)
const ADDED_COLUMNS = [
  ['products', 'pack_weight', 'real check (pack_weight is null or pack_weight >= 0)'],
  ['products', 'unit_weight', 'real check (unit_weight is null or unit_weight >= 0)'],
];
function migrate(db) {
  for (const [t, c, def] of ADDED_COLUMNS) {
    if (!db.prepare(`select 1 from pragma_table_info(?) where name = ?`).get(t, c)) db.exec(`alter table ${t} add column ${c} ${def}`);
  }
}

export function openDb(file = ':memory:') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  registerFunctions(db);
  db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
  migrate(db);
  db.exec(fs.readFileSync(path.join(here, 'views.sql'), 'utf8'));
  auditTriggers(db);
  db.pragma(`user_version = ${SCHEMA_VERSION}`);
  ctx.db = db;
  return db;
}
