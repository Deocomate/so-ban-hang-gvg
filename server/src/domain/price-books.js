// Bảng giá có tên (ngoài các mức giá chung theo khách): hiệu lực, công thức tính từ giá khác, phạm vi nhóm khách / người tạo giao dịch.
import { ctx, fail, one, all, run, insert, uuid, nowIso, num, bool, nz, trimNz, rnd, asDate } from '../lib/context.js';
import { requirePerm } from './access.js';

const BASES = ['cost', 'last_in', 'tier1', 'tier2', 'tier3', 'tier4', 'tier5'];
const list = (v) => (v == null ? null : (Array.isArray(v) ? v : []).map((x) => trimNz(x)).filter(Boolean));

function getBook(id, b) {
  const pb = one(`select * from price_books where id = ? and book_id = ?`, id, b);
  if (!pb) fail('Không tìm thấy bảng giá');
  return pb;
}

export function save_price_book(p) {
  const b = p.book_id;
  requirePerm(b, 'danh_muc');
  const name = trimNz(p.name);
  if (!name) fail('Thiếu tên bảng giá');
  const from = asDate(p.valid_from); const to = asDate(p.valid_to);
  if (from && to && to < from) fail('Ngày kết thúc hiệu lực phải sau ngày bắt đầu');
  const f = p.formula || {};
  const base = nz(f.base);
  if (base && !BASES.includes(base) && !(base.startsWith('book:') && one(`select 1 from price_books where id = ? and book_id = ?`, base.slice(5), b))) fail('Công thức giá: giá gốc không hợp lệ');
  if (base && base === `book:${p.id}`) fail('Công thức giá không được lấy chính bảng giá này');
  if (f.op && !['+', '-'].includes(f.op)) fail('Công thức giá: phép tính chỉ là cộng hoặc trừ');
  if ((num(f.value) ?? 0) < 0) fail('Công thức giá: giá trị không được âm');
  const round = f.round === 'auto' ? 'auto' : num(f.round) || 0;
  if (round !== 'auto' && !ROUND_STEPS.includes(round)) fail('Công thức giá: bước làm tròn không hợp lệ');
  if (f.round_mode && !['up', 'nearest', 'down'].includes(f.round_mode)) fail('Công thức giá: cách làm tròn không hợp lệ');
  const groups = list(p.cust_groups); const users = list(p.user_ids);
  if (groups && !groups.length) fail('Chọn ít nhất một nhóm khách hàng, hoặc chọn "Tất cả"');
  if (users && !users.length) fail('Chọn ít nhất một người tạo giao dịch, hoặc chọn "Tất cả"');
  const row = { name, valid_from: from, valid_to: to, active: (bool(p.active) ?? true) ? 1 : 0,
    formula: base ? { base, op: f.op || '+', value: num(f.value) ?? 0, pct: !!f.pct, round, round_mode: f.round_mode || 'up' } : {},
    allow_others: (bool(p.allow_others) ?? true) ? 1 : 0, warn_others: (bool(p.warn_others) ?? false) ? 1 : 0, cust_groups: groups, user_ids: users, updated_at: nowIso() };
  if (one(`select 1 from price_books where book_id = ? and lower(name) = lower(?) and id is not ?`, b, name, nz(p.id))) fail(`Đã có bảng giá "${name}"`);
  let id = nz(p.id);
  if (id) {
    getBook(id, b);
    const keys = Object.keys(row);
    run(`update price_books set ${keys.map((k) => `${k} = ?`).join(', ')} where id = ?`, ...keys.map((k) => row[k]), id);
  } else {
    id = uuid();
    insert('price_books', { id, book_id: b, ...row, created_at: nowIso() });
  }
  return { id };
}

export function delete_price_book(p) {
  const b = p.book_id;
  requirePerm(b, 'danh_muc');
  const pb = getBook(p.id, b);
  if (one(`select 1 from price_books where book_id = ? and json_extract(formula, '$.base') = ?`, b, `book:${pb.id}`)) fail('Bảng giá khác đang lấy bảng này làm giá gốc');
  if (one(`select 1 from sales_orders where price_book_id = ? limit 1`, pb.id)) fail(`Bảng giá "${pb.name}" đã dùng trên đơn hàng — hãy chuyển sang "Chưa áp dụng" thay vì xóa`);
  run(`delete from price_books where id = ?`, pb.id);
  return { ok: true };
}

// rows = [{product_id, price}], price trống = bỏ hàng khỏi bảng giá
export function save_price_book_items(p) {
  const b = p.book_id;
  requirePerm(b, 'danh_muc');
  const pb = getBook(p.price_book_id, b);
  let n = 0;
  for (const r of p.rows || []) {
    if (!one(`select 1 from products where id = ? and book_id = ?`, r.product_id, b)) fail('Không tìm thấy hàng hóa trong sổ');
    const v = r.price == null || r.price === '' ? null : num(r.price);
    if (v == null) n += run(`delete from price_book_items where price_book_id = ? and product_id = ?`, pb.id, r.product_id).changes;
    else {
      if (v < 0) fail('Giá bán không được âm');
      run(`insert into price_book_items (price_book_id, product_id, price) values (?, ?, ?)
        on conflict (price_book_id, product_id) do update set price = excluded.price`, pb.id, r.product_id, rnd(v));
      n++;
    }
  }
  run(`update price_books set updated_at = ? where id = ?`, nowIso(), pb.id);
  return { updated: n };
}

// Nhập giá từ Excel theo mã hàng: rows = [{sku, price}]. Mã không có trong sổ thì bỏ qua và báo lại.
export function import_price_book_items(p) {
  const b = p.book_id;
  requirePerm(b, 'danh_muc');
  const pb = getBook(p.price_book_id, b);
  let n = 0; const missing = [];
  for (const r of p.rows || []) {
    const sku = trimNz(r.sku);
    if (!sku) continue;
    const v = num(r.price);
    if (v == null || v < 0) fail(`${sku}: giá không hợp lệ`);
    const pr = one(`select id from products where book_id = ? and lower(sku) = lower(?)`, b, sku);
    if (!pr) { missing.push(sku); continue; }
    run(`insert into price_book_items (price_book_id, product_id, price) values (?, ?, ?)
      on conflict (price_book_id, product_id) do update set price = excluded.price`, pb.id, pr.id, rnd(v));
    n++;
  }
  if (!n && !missing.length) fail('File không có dòng giá nào');
  run(`update price_books set updated_at = ? where id = ?`, nowIso(), pb.id);
  return { updated: n, missing };
}

// Tính giá theo công thức của bảng cho các hàng đã chọn (hoặc mọi hàng đang kinh doanh) rồi ghi vào bảng
// Làm tròn giá theo bước: 'auto' chọn bước theo mức giá (dưới 100 nghìn → 1.000, dưới 1 triệu → 5.000, dưới 10 triệu → 10.000, từ 10 triệu → 100.000)
export const ROUND_STEPS = [0, 100, 500, 1000, 5000, 10000, 50000, 100000];
export function roundPrice(v, round, mode = 'up') {
  const step = round === 'auto' ? (v < 1e5 ? 1000 : v < 1e6 ? 5000 : v < 1e7 ? 10000 : 100000) : Number(round) || 0;
  if (!step) return v;
  const f = mode === 'down' ? Math.floor : mode === 'nearest' ? Math.round : Math.ceil;
  return f(v / step) * step;
}

export function apply_price_formula(p) {
  const b = p.book_id;
  requirePerm(b, 'danh_muc');
  const pb = getBook(p.price_book_id, b);
  const f = JSON.parse(pb.formula || '{}');
  if (!f.base) fail('Bảng giá chưa có công thức giá');
  const ids = Array.isArray(p.product_ids) && p.product_ids.length ? p.product_ids : all(`select id from products where book_id = ? and active = 1`, b).map((r) => r.id);
  let n = 0; let skipped = 0;
  for (const pid of ids) {
    const pr = one(`select * from products where id = ? and book_id = ?`, pid, b);
    if (!pr) fail('Không tìm thấy hàng hóa trong sổ');
    let base;
    if (f.base === 'cost') base = pr.on_hand > 0 ? pr.stock_value / pr.on_hand : pr.last_cost;
    else if (f.base === 'last_in') base = one(`select g.unit_cost from goods_receipt_lines g join goods_receipts r on r.id = g.receipt_id
      where g.product_id = ? and r.cancelled_at is null order by r.receipt_date desc, r.created_at desc limit 1`, pid)?.unit_cost ?? null;
    else if (f.base.startsWith('tier')) base = pr[`price${f.base.slice(4)}`];
    else base = one(`select price from price_book_items where price_book_id = ? and product_id = ?`, f.base.slice(5), pid)?.price ?? null;
    if (base == null) { skipped++; continue; }
    const delta = f.pct ? base * (num(f.value) ?? 0) / 100 : num(f.value) ?? 0;
    const price = roundPrice(Math.max(0, rnd(f.op === '-' ? base - delta : base + delta)), f.round, f.round_mode);
    run(`insert into price_book_items (price_book_id, product_id, price) values (?, ?, ?)
      on conflict (price_book_id, product_id) do update set price = excluded.price`, pb.id, pid, price);
    n++;
  }
  run(`update price_books set updated_at = ? where id = ?`, nowIso(), pb.id);
  return { updated: n, skipped };
}

// Kiểm tra bảng giá chọn trên đơn: đang hiệu lực, đúng nhóm khách và người tạo; bảng không cho thêm hàng ngoài thì chặn
export function checkPriceBook(b, id, cust, date, productIds) {
  if (!id) return null;
  const pb = getBook(id, b);
  if (!pb.active) fail(`Bảng giá "${pb.name}" đang ở trạng thái chưa áp dụng`);
  if ((pb.valid_from && date < pb.valid_from) || (pb.valid_to && date > pb.valid_to)) fail(`Bảng giá "${pb.name}" không có hiệu lực vào ngày ${date}`);
  const groups = pb.cust_groups ? JSON.parse(pb.cust_groups) : null;
  if (groups && !groups.includes(cust.kind)) fail(`Bảng giá "${pb.name}" không áp dụng cho nhóm khách của ${cust.name}`);
  const users = pb.user_ids ? JSON.parse(pb.user_ids) : null;
  if (users && !users.includes(ctx.uid)) fail(`Bạn không được dùng bảng giá "${pb.name}"`);
  if (!pb.allow_others) {
    const out = [...new Set(productIds)].filter((pid) => !one(`select 1 from price_book_items where price_book_id = ? and product_id = ?`, pb.id, pid));
    if (out.length) {
      const names = out.map((pid) => one(`select sku from products where id = ?`, pid)?.sku).filter(Boolean);
      fail(`Bảng giá "${pb.name}" chỉ cho bán hàng có trong bảng: ${names.join(', ')} không có trong bảng giá`);
    }
  }
  return pb.id;
}
