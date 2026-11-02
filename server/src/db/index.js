// Mở CSDL SQLite: tạo bảng, đăng ký hàm tự định nghĩa (dùng trong view), dựng lại view và trigger nhật ký.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { ctx, today, vnDate, daysBetween, nowIso } from '../lib/context.js';
import { shipStatusLabel, codStatusLabel, carrierName } from '../lib/labels.js';
import { can } from '../domain/access.js';
import { addAnamtileBook, defaultDocs } from '../domain/books.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_VERSION = 4;

// Bảng ghi nhật ký chỉnh sửa; cột bỏ qua khi so sánh UPDATE (do hệ thống tự cập nhật)
const AUDIT_TABLES = {
  books: '', book_members: '', products: 'on_hand,stock_value,last_cost', customers: '', suppliers: '', funds: '', opening_debts: '',
  sales_orders: '', sales_order_lines: 'delivered_qty,returned_qty', deliveries: '', sales_returns: '', purchase_orders: '',
  purchase_order_lines: 'received_qty,returned_qty', goods_receipts: '', supplier_returns: '', stock_adjustments: '', payments: '',
  payment_allocations: '', expenses: '', drivers: '', driver_trips: '', quotes: '', contracts: '', tax_invoices: '',
  shipments: 'status,status_at,status_detail,last_sync_at,tracking_registered_at,cod_status,cod_settled_at,cod_payment_ids',
  bank_txns: '',
};
const JSON_TEXT_COLS = new Set(['settings', 'perms', 'notify', 'cod_payment_ids', 'candidate_books', 'payment_ids', 'raw', 'data', 'payload', 'extra', 'body']);

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
  ['products', 'price4', 'real not null default 0'],
  ['products', 'brand', 'text'],
  ['products', 'material', 'text'],
  ['products', 'norm_m2', 'real check (norm_m2 is null or norm_m2 >= 0)'],
  ['products', 'norm_m', 'real check (norm_m is null or norm_m >= 0)'],
  ['customers', 'extra', "text not null default '{}'"],
  ['customers', 'stage', "text not null default 'moi'"],
  ['sales_orders', 'vat_rate', 'real not null default 0 check (vat_rate >= 0 and vat_rate <= 100)'],
  ['deliveries', 'deposit_used', 'real not null default 0 check (deposit_used >= 0)'],
];

// SQLite không sửa được CHECK của bảng đã có nên phải dựng lại bảng khách hàng để nhận mức giá 4
function widenPriceTier(db) {
  const table = db.prepare(`select sql from sqlite_master where type = 'table' and name = 'customers'`).get();
  if (!table.sql.includes('between 1 and 3')) return;
  const indexes = db.prepare(`select sql from sqlite_master where type = 'index' and tbl_name = 'customers' and sql is not null`).all();
  db.pragma('foreign_keys = OFF');
  db.pragma('legacy_alter_table = ON');
  db.transaction(() => {
    db.exec(table.sql.replace('customers', 'customers_new').replace('between 1 and 3', 'between 1 and 4'));
    db.exec(`insert into customers_new select * from customers; drop table customers; alter table customers_new rename to customers;`);
    for (const i of indexes) db.exec(i.sql);
    const broken = db.pragma('foreign_key_check');
    if (broken.length) throw new Error(`Nâng cấp bảng khách hàng làm hỏng ${broken.length} liên kết`);
  })();
  db.pragma('legacy_alter_table = OFF');
  db.pragma('foreign_keys = ON');
}

// Sổ Thanh Hải dùng bảng giá 4 mức; chỉ thêm 1 lần để chủ sổ vẫn bỏ được mức này trong Cài đặt
function addFourthPriceName(db) {
  for (const b of db.prepare(`select id, settings from books where short_name = 'TH'`).all()) {
    const s = JSON.parse(b.settings);
    if (s.price_names?.length === 3) db.prepare(`update books set settings = ? where id = ?`).run(JSON.stringify({ ...s, price_names: [...s.price_names, 'Giá đại lý II'] }), b.id);
  }
}

// Bảng thông tin chứng từ cũ chỉ nhận order/delivery/payment; dựng lại để nhận thêm hợp đồng và báo giá
function widenDocInfo(db) {
  const t = db.prepare(`select sql from sqlite_master where type = 'table' and name = 'doc_info'`).get();
  if (t.sql.includes("'contract'")) return;
  db.transaction(() => {
    db.exec(t.sql.replace('doc_info', 'doc_info_new').replace("('order','delivery','payment')", "('order','delivery','payment','contract','quote')"));
    db.exec(`insert into doc_info_new select * from doc_info; drop table doc_info; alter table doc_info_new rename to doc_info;`);
  })();
}

// Sổ chưa khai đơn vị phát hành thì nhận 2 pháp nhân mặc định; sổ đã tự khai giữ nguyên
function addLegalEntities(db) {
  for (const b of db.prepare(`select id, short_name, settings from books`).all()) {
    const s = JSON.parse(b.settings);
    if (!s.docs?.profiles?.length) db.prepare(`update books set settings = ? where id = ?`).run(JSON.stringify({ ...s, docs: { ...s.docs, ...defaultDocs(b.short_name) } }), b.id);
  }
}

function migrate(db, from) {
  dropAuditTriggers(db);
  for (const [t, c, def] of ADDED_COLUMNS) {
    if (!db.prepare(`select 1 from pragma_table_info(?) where name = ?`).get(t, c)) db.exec(`alter table ${t} add column ${c} ${def}`);
  }
  widenPriceTier(db);
  widenDocInfo(db);
  if (from === 1) addFourthPriceName(db);
  if (from > 0 && from < 3) addLegalEntities(db);
}

// Sao lưu nguyên CSDL trước khi nâng cấp cấu trúc
function backupBeforeUpgrade(db, file, from) {
  const out = `${file}.truoc-nang-cap-v${from}.bak`;
  if (!fs.existsSync(out)) db.prepare('vacuum into ?').run(out);
}

export function openDb(file = ':memory:') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  registerFunctions(db);
  const from = db.pragma('user_version', { simple: true });
  if (file !== ':memory:' && from > 0 && from < SCHEMA_VERSION) backupBeforeUpgrade(db, file, from);
  db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
  migrate(db, from);
  db.exec(fs.readFileSync(path.join(here, 'views.sql'), 'utf8'));
  auditTriggers(db);
  db.pragma(`user_version = ${SCHEMA_VERSION}`);
  ctx.db = db;
  if (from > 0 && from < 3) addAnamtileBook();
  return db;
}
