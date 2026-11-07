// Mở CSDL SQLite: tạo bảng, đăng ký hàm tự định nghĩa (dùng trong view), dựng lại view và trigger nhật ký.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from './sqlite.js';
import { ctx, today, vnDate, daysBetween, nowIso } from '../lib/context.js';
import { shipStatusLabel, codStatusLabel, carrierName } from '../lib/labels.js';
import { can } from '../domain/access.js';
import { addAnamtileBook, defaultDocs, VARIANTS } from '../domain/books.js';
import { DEFAULT_ROLES } from '../lib/labels.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_VERSION = 9;

// Bảng ghi nhật ký chỉnh sửa; cột bỏ qua khi so sánh UPDATE (do hệ thống tự cập nhật)
const AUDIT_TABLES = {
  books: '', book_members: '', products: 'on_hand,stock_value,last_cost', customers: '', suppliers: '', funds: '', opening_debts: '',
  sales_orders: '', sales_order_lines: 'delivered_qty,returned_qty', deliveries: '', sales_returns: '', purchase_orders: '',
  purchase_order_lines: 'received_qty,returned_qty', goods_receipts: '', supplier_returns: '', stock_adjustments: '', productions: '', payments: '',
  payment_allocations: '', expenses: '', drivers: '', driver_trips: '', quotes: '', contracts: '', tax_invoices: '', employees: '', paysheets: '', commission_tables: '',
  shipments: 'status,status_at,status_detail,last_sync_at,tracking_registered_at,cod_status,cod_settled_at,cod_payment_ids',
  bank_txns: '', product_units: '', price_books: '',
};
const JSON_TEXT_COLS = new Set(['pay', 'rules', 'settings', 'perms', 'notify', 'cod_payment_ids', 'candidate_books', 'payment_ids', 'raw', 'data', 'payload', 'extra', 'body', 'images', 'prices', 'formula', 'cust_groups', 'user_ids']);

function registerFunctions(db) {
  db.function('today', () => today());
  db.function('now_iso', () => nowIso());
  db.function('current_uid', () => ctx.uid);
  db.function('vn_date', { deterministic: true }, (ts) => vnDate(ts));
  db.function('days', { deterministic: true }, (a, b) => daysBetween(a, b));
  db.function('can_cost', (book) => (can(book, 'xem_gia_von') ? 1 : 0));
  db.function('is_owner', (book) => (can(book, 'owner') ? 1 : 0));
  db.function('ship_status_label', { deterministic: true }, (s) => shipStatusLabel(s));
  db.function('cod_status_label', { deterministic: true }, (s) => codStatusLabel(s));
  db.function('carrier_name', { deterministic: true }, (c) => carrierName(c));
  db.function('vi_lower', { deterministic: true }, (s) => (s == null ? null : String(s).toLowerCase()));
}

// Xóa mọi trigger nhật ký, kể cả của bảng đã bỏ khỏi danh sách theo dõi
export function dropAuditTriggers(db) {
  for (const { name } of db.prepare(`select name from sqlite_master where type = 'trigger' and name like 'audit\\_%' escape '\\'`).all()) db.exec(`drop trigger if exists "${name}"`);
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
  ['products', 'price5', 'real not null default 0'],
  ['products', 'brand', 'text'],
  ['products', 'material', 'text'],
  ['products', 'norm_m2', 'real check (norm_m2 is null or norm_m2 >= 0)'],
  ['products', 'norm_m', 'real check (norm_m is null or norm_m >= 0)'],
  ['customers', 'extra', "text not null default '{}'"],
  ['customers', 'stage', "text not null default 'moi'"],
  ['sales_orders', 'vat_rate', 'real not null default 0 check (vat_rate >= 0 and vat_rate <= 100)'],
  ['deliveries', 'deposit_used', 'real not null default 0 check (deposit_used >= 0)'],
  ['stock_adjustments', 'purpose', 'text'],
  ['expenses', 'invoice_no', 'text'],
  ['products', 'product_type', "text not null default 'hang'"],
  ['products', 'description', 'text'],
  ['products', 'order_note', 'text'],
  ['products', 'max_stock', 'real check (max_stock is null or max_stock >= 0)'],
  ['products', 'location', 'text'],
  ['products', 'width', 'real check (width is null or width >= 0)'],
  ['products', 'length', 'real check (length is null or length >= 0)'],
  ['products', 'dim_unit', "text not null default 'cm'"],
  ['products', 'sell_direct', 'integer not null default 1'],
  ['products', 'images', "text not null default '[]'"],
  ['sales_orders', 'price_book_id', 'text'],
  ['sales_order_lines', 'unit_name', 'text'],
  ['sales_order_lines', 'unit_conv', 'real not null default 1'],
  ['purchase_order_lines', 'unit_name', 'text'],
  ['purchase_order_lines', 'unit_conv', 'real not null default 1'],
  ['purchase_order_lines', 'unit_price', 'real'],
  ['purchase_order_lines', 'discount', 'real not null default 0'],
  ['purchase_orders', 'mode', "text not null default 'dat' check (mode in ('dat','nhap'))"],
  ['purchase_orders', 'discount', 'real not null default 0 check (discount >= 0)'],
  ['purchase_orders', 'invoice_no', 'text'],
  ['goods_receipts', 'cancelled_at', 'text'],
  ['goods_receipts', 'cancel_reason', 'text'],
  ['users', 'phone', 'text'],
  ['users', 'status', "text not null default 'active' check (status in ('invited','active','disabled'))"],
  ['users', 'is_admin', 'integer not null default 0'],
  ['users', 'email_verified_at', 'text'],
  ['users', 'must_change_password', 'integer not null default 0'],
  ['users', 'last_login_at', 'text'],
  ['users', 'updated_at', 'text'],
  ['book_members', 'role_id', 'text references roles(id) on delete set null'],
];

// SQLite không sửa được CHECK của bảng đã có nên phải dựng lại bảng khách hàng để nhận đủ 5 mức giá
function widenPriceTier(db) {
  const table = db.prepare(`select sql from sqlite_master where type = 'table' and name = 'customers'`).get();
  const old = ['between 1 and 3', 'between 1 and 4'].find((x) => table.sql.includes(x));
  if (!old) return;
  const indexes = db.prepare(`select sql from sqlite_master where type = 'index' and tbl_name = 'customers' and sql is not null`).all();
  db.pragma('foreign_keys = OFF');
  db.pragma('legacy_alter_table = ON');
  db.transaction(() => {
    db.exec(table.sql.replace('customers', 'customers_new').replace(old, 'between 1 and 5'));
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

// Sổ đang chạy nhận hồ sơ ngành hàng mới: thêm mức giá (Thanh Hải: đại lý I + công trình lẻ, Vũ Gia: giá CH) và thiết lập đóng gói.
// Chỉ đổi tên mức giá khi sổ còn đúng tên mặc định cũ, để không ghi đè tên chủ sổ đã tự đặt.
const OLD_PRICE_NAMES = { TH: ['Giá lẻ', 'Giá đại lý', 'Giá công trình', 'Giá đại lý II'], VG: ['Giá lẻ', 'Giá sỉ', 'Giá CTV'] };
function applyBookProfiles(db) {
  for (const b of db.prepare(`select id, short_name, settings from books`).all()) {
    const v = VARIANTS[b.short_name]; if (!v) continue;
    const s = JSON.parse(b.settings); const next = { ...s };
    if (OLD_PRICE_NAMES[b.short_name] && JSON.stringify(s.price_names) === JSON.stringify(OLD_PRICE_NAMES[b.short_name])) next.price_names = v.price_names;
    if (!('packaging' in s)) next.packaging = v.packaging;
    if (!('hide_fields' in s)) next.hide_fields = v.hide_fields;
    db.prepare(`update books set settings = ? where id = ?`).run(JSON.stringify(next), b.id);
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

// Phiếu kho cũ chưa nhận lý do "xuất dùng nội bộ"; dựng lại bảng (dòng phiếu trỏ tới bảng này nên tắt kiểm tra khóa ngoại khi đổi tên)
function widenAdjReason(db) {
  const t = db.prepare(`select sql from sqlite_master where type = 'table' and name = 'stock_adjustments'`).get();
  if (t.sql.includes("'noi_bo'")) return;
  db.pragma('foreign_keys = OFF');
  db.pragma('legacy_alter_table = ON');
  db.transaction(() => {
    db.exec(t.sql.replace('stock_adjustments', 'stock_adjustments_new').replace("'hang_tra_loi','khac'", "'hang_tra_loi','noi_bo','khac'"));
    db.exec(`insert into stock_adjustments_new select * from stock_adjustments; drop table stock_adjustments; alter table stock_adjustments_new rename to stock_adjustments;`);
    const broken = db.pragma('foreign_key_check');
    if (broken.length) throw new Error(`Nâng cấp bảng phiếu kho làm hỏng ${broken.length} liên kết`);
  })();
  db.pragma('legacy_alter_table = OFF');
  db.pragma('foreign_keys = ON');
}

// Trả hàng nhập cũ bắt buộc theo đơn nhập; dựng lại 2 bảng để lập được phiếu trả riêng theo nhà cung cấp,
// có giá trả lại, giảm giá, hủy phiếu. Số liệu cũ: giá trả lại = giá nhập, giá trị kho = giá trị trả.
function relaxSupplierReturns(db) {
  const t = db.prepare(`select sql from sqlite_master where type = 'table' and name = 'supplier_returns'`).get();
  if (t.sql.includes('supplier_id')) return;
  db.pragma('foreign_keys = OFF');
  db.pragma('legacy_alter_table = ON');
  db.transaction(() => {
    db.exec(`
      create table supplier_returns_new (
        id text primary key, book_id text not null references books(id) on delete cascade, code text not null,
        po_id text references purchase_orders(id), supplier_id text not null references suppliers(id),
        return_date text not null, reason text, note text, discount real not null default 0, refund_payment_id text,
        created_by text, created_at text not null, cancelled_at text, cancel_reason text);
      insert into supplier_returns_new (id, book_id, code, po_id, supplier_id, return_date, reason, note, created_by, created_at)
        select r.id, r.book_id, r.code, r.po_id, po.supplier_id, r.return_date, r.reason, r.note, r.created_by, r.created_at
        from supplier_returns r join purchase_orders po on po.id = r.po_id;
      create table supplier_return_lines_new (
        id text primary key, return_id text not null references supplier_returns(id) on delete cascade, book_id text not null,
        receipt_line_id text references goods_receipt_lines(id), product_id text not null references products(id),
        qty real not null check (qty > 0), unit_cost real not null, unit_price real not null, value real not null, cost_value real not null);
      insert into supplier_return_lines_new (id, return_id, book_id, receipt_line_id, product_id, qty, unit_cost, unit_price, value, cost_value)
        select id, return_id, book_id, receipt_line_id, product_id, qty, unit_cost, unit_cost, value, value from supplier_return_lines;
      drop table supplier_return_lines; drop table supplier_returns;
      alter table supplier_returns_new rename to supplier_returns;
      alter table supplier_return_lines_new rename to supplier_return_lines;`);
    const broken = db.pragma('foreign_key_check');
    if (broken.length) throw new Error(`Nâng cấp bảng trả hàng nhập làm hỏng ${broken.length} liên kết`);
  })();
  db.pragma('legacy_alter_table = OFF');
  db.pragma('foreign_keys = ON');
}

// Đơn nhập đã nhận kho ngay lúc lập là phiếu nhập hàng; giá trước giảm giá của dòng cũ = giá nhập
function splitPurchaseModes(db) {
  db.exec(`update purchase_order_lines set unit_price = unit_cost where unit_price is null;
    update purchase_orders set mode = 'nhap' where kind = 'mua_san' and exists (select 1 from goods_receipts g
      where g.po_id = purchase_orders.id and abs(julianday(g.created_at) - julianday(purchase_orders.created_at)) < 0.0001);`);
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
  widenAdjReason(db);
  relaxSupplierReturns(db);
  if (from > 0 && from < 9) splitPurchaseModes(db);
  if (from === 1) addFourthPriceName(db);
  if (from > 0 && from < 3) addLegalEntities(db);
  if (from > 0 && from < 6) setProductTypes(db);
  if (from > 0 && from < 7) applyBookProfiles(db);
  if (from > 0 && from < 8) upgradeAccounts(db);
  if (from < 8) seedRoles(db);
}

// Tài khoản có trước khi có phân quyền mới: coi như đã xác thực email; chủ sổ thành Tổng quản trị;
// nhân viên giữ nguyên những gì đang thấy (trước đây mọi thành viên xem được đơn bán, đơn nhập; xem thu chi / chi phí đi kèm quyền ghi).
function upgradeAccounts(db) {
  db.exec(`update users set email_verified_at = coalesce(email_verified_at, created_at);
    update users set is_admin = 1 where id in (select user_id from book_members where role = 'owner');`);
  const on = (v) => v === true || v === 'true';
  for (const m of db.prepare(`select book_id, user_id, perms from book_members where role = 'staff'`).all()) {
    const p = JSON.parse(m.perms || '{}');
    const next = { ...p, xem_ban_hang: true, xem_nhap_hang: true, xem_thu_chi: on(p.thu_chi), xem_chi_phi: on(p.chi_phi) };
    db.prepare(`update book_members set perms = ? where book_id = ? and user_id = ?`).run(JSON.stringify(next), m.book_id, m.user_id);
  }
}

function seedRoles(db) {
  const ins = db.prepare(`insert or ignore into roles (id, name, description, perms, created_at) values (?, ?, ?, ?, ?)`);
  for (const r of DEFAULT_ROLES) ins.run(crypto.randomUUID(), r.name, r.description, JSON.stringify(Object.fromEntries(r.perms.map((k) => [k, true]))), nowIso());
}

// Loại hàng mới: bộ cũ thành combo, hàng đã có định mức sản xuất thành hàng sản xuất; ảnh cũ thành ảnh đầu tiên
function setProductTypes(db) {
  db.exec(`update products set product_type = 'combo' where is_kit = 1;
    update products set product_type = 'san_xuat' where is_kit = 0 and id in (select product_id from bom_items);
    update products set images = json_array(image_url) where image_url is not null and image_url <> '' and images = '[]';`);
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
