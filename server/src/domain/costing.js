// Phương pháp tính giá vốn của sổ: bình quân gia quyền di động (mặc định) hoặc giá vốn cố định (như KiotViet).
// Đổi phương pháp: xem trước bằng cách chạy thật trong một savepoint rồi hoàn tác, nên số xem trước đúng bằng số sau khi đổi.
import path from 'node:path';
import { ctx, fail, one, all, run, insert, rnd, today, nowIso, asDate, dmy, num } from '../lib/context.js';
import { requirePerm, bookSettings, checkDate, can } from './access.js';
import { calcPl } from './reports.js';

const qty6 = (x) => rnd(x, 6);
export const COST_METHODS = { avg: 'Giá vốn trung bình', fixed: 'Giá vốn cố định' };
export const costMethod = (b) => (bookSettings(b).cost_method === 'fixed' ? 'fixed' : 'avg');

// Giá vốn cố định mặc định: đơn giá lần nhập (hoặc tồn đầu kỳ) đầu tiên, không có thì giá vốn hiện tại
export function defaultFixedCost(p) {
  const m = one(`select qty, coalesce(src_value, value) as v from stock_moves where product_id = ? and qty > 0 and doc_type in ('nhap', 'dau_ky', 'dieu_chinh')
    order by coalesce(anchor_id, id), id limit 1`, p.id);
  if (m && m.qty > 0) return rnd(m.v / m.qty, 2);
  return rnd(p.on_hand > 0 ? p.stock_value / p.on_hand : p.last_cost || 0, 2);
}
export const fixedCostOf = (p) => (p.fixed_cost != null ? p.fixed_cost : defaultFixedCost(p));

// Ghi một dòng "đánh giá lại tồn kho": số lượng không đổi, giá trị tồn đổi theo giá vốn mới. Không tính vào giá vốn hàng bán.
function revalue(b, p, newValue, date, note, anchor = null) {
  const diff = rnd(newValue - p.stock_value);
  if (!diff) return 0;
  insert('stock_moves', { book_id: b, product_id: p.id, move_date: date, qty: 0, value: diff, unit_cost: 0, doc_type: 'danh_gia_lai', doc_id: p.id,
    doc_code: null, line_id: null, balance_qty: p.on_hand, balance_value: rnd(newValue), note, anchor_id: anchor, created_by: ctx.uid, created_at: nowIso() });
  return diff;
}

// Sửa giá vốn cố định của một hàng hóa khi sổ đang dùng giá vốn cố định: tồn kho đánh giá lại theo giá mới từ hôm nay
export function setFixedCost(b, pid, cost) {
  const c = num(cost);
  if (c == null || c < 0) fail('Giá vốn cố định không hợp lệ');
  const p = one(`select * from products where id = ? and book_id = ?`, pid, b);
  if (!p || (p.fixed_cost != null && rnd(p.fixed_cost, 2) === rnd(c, 2))) return;
  if (!can(b, 'xem_gia_von')) fail('Bạn không có quyền xem / sửa giá vốn');
  if (costMethod(b) === 'fixed' && p.on_hand !== 0 && !p.is_kit && p.product_type !== 'dich_vu') {
    checkDate(b, today());
    revalue(b, p, rnd(p.on_hand * c), today(), `Đổi giá vốn cố định ${p.fixed_cost ?? 0} → ${c}`);
    run(`update products set fixed_cost = ?, stock_value = ?, last_cost = ?, updated_at = ? where id = ?`, c, rnd(p.on_hand * c), c, nowIso(), pid);
  } else run(`update products set fixed_cost = ?, updated_at = ? where id = ?`, c, nowIso(), pid);
}

// Chạy lại sổ kho của sổ theo đúng thứ tự đã ghi, tính lại giá trị mọi biến động có ngày từ `from` trở đi theo phương pháp `method`,
// rồi cập nhật giá vốn trên phiếu giao, khách trả, điều chỉnh, sản xuất, trả NCC và tồn kho từng mã.
export function recost(b, method, from) {
  run(`delete from stock_moves where book_id = ? and doc_type in ('chenh_lech', 'danh_gia_lai') and move_date >= ?`, b, from);
  const prods = new Map(all(`select * from products where book_id = ?`, b).map((p) => [p.id, p]));
  const F = (pid) => fixedCostOf(prods.get(pid));
  const st = new Map();
  const S = (pid, firstUnit) => { if (!st.has(pid)) st.set(pid, { q: 0, v: 0, last: firstUnit ?? 0, touched: false }); return st.get(pid); };
  const sum = new Map(); const add = (k, x) => sum.set(k, (sum.get(k) || 0) + x); const got = (k) => sum.get(k) || 0;
  const moves = all(`select * from stock_moves where book_id = ? order by coalesce(anchor_id, id), id`, b);
  // Tổng số lượng / giá trị xuất của từng dòng giao (để tính khách trả theo tỷ lệ như lúc ghi)
  const outQty = new Map();
  for (const m of moves) if (m.doc_type === 'giao' && m.qty < 0) outQty.set(`${m.line_id}|${m.product_id}`, (outQty.get(`${m.line_id}|${m.product_id}`) || 0) - m.qty);
  const upd = run.bind(null, `update stock_moves set value = ?, unit_cost = ?, balance_qty = ?, balance_value = ? where id = ?`);
  for (const m of moves) {
    const s = S(m.product_id, m.qty < 0 ? m.unit_cost : 0);
    const key = `${m.line_id}|${m.product_id}`;
    if (m.move_date < from) {
      // Trước ngày áp dụng: giữ nguyên giá trị đã ghi
      s.q = qty6(s.q + m.qty); s.v += m.value;
      if (m.qty) s.last = s.q > 0 ? s.v / s.q : m.qty > 0 ? m.value / m.qty : s.last;
      track(m, m.value);
      continue;
    }
    if (method === 'fixed' && !s.touched) {
      s.touched = true;
      const f = F(m.product_id);
      if (rnd(s.v) !== rnd(s.q * f)) {
        insert('stock_moves', { book_id: b, product_id: m.product_id, move_date: m.move_date, qty: 0, value: rnd(s.q * f - s.v), unit_cost: 0, doc_type: 'danh_gia_lai',
          doc_id: m.product_id, balance_qty: s.q, balance_value: rnd(s.q * f), note: 'Đánh giá lại tồn kho khi đổi sang giá vốn cố định', anchor_id: m.id - 0.5,
          created_by: ctx.uid, created_at: nowIso() });
        s.v = rnd(s.q * f);
      }
    }
    s.touched = true;
    const q = m.qty; const t = m.doc_type;
    let v; let adj = 0;
    if (method === 'fixed') {
      const f = F(m.product_id);
      v = rnd(q * f); s.q = qty6(s.q + q); s.v = rnd(s.q * f); s.last = f;
      upd(v, f, s.q, s.v, m.id);
    } else {
      const avg = s.q > 0 ? s.v / s.q : s.last;
      let inflow = null;
      if (q > 0) {
        if (t === 'nhap') v = m.src_value ?? m.value;
        else if (t === 'dau_ky' || t === 'dieu_chinh') v = m.src_value ?? rnd(q * avg);
        else if (t === 'giao') v = -got(`out|${key}`);
        else if (t === 'tra_ncc') v = -got(`rn|${key}`);
        else if (t === 'san_xuat') v = got(`sx|${m.doc_id}`);
        else if (t === 'tra_hang') v = returnValue(m, key);
        if (v == null) v = m.value;
        inflow = v / q;
        const nq = qty6(s.q + q); let nv = s.v + v;
        if (s.q < 0 && nq > 0) { adj = rnd(nq * inflow) - nv; nv += adj; }
        s.q = nq; s.v = nv;
      } else {
        if (t === 'nhap') v = -got(`in|${key}`);
        else if (t === 'tra_ncc' && m.src_value != null) v = m.src_value;
        else if (s.q > 0 && -q === s.q) v = -s.v;
        else v = -rnd(-q * avg);
        const nq = qty6(s.q + q); let nv = s.v + v;
        if (nq === 0 && nv !== 0) { adj = -nv; nv = 0; }
        s.q = nq; s.v = nv;
      }
      upd(v, Math.abs(v / q), s.q, s.v - adj, m.id);
      if (adj !== 0) {
        insert('stock_moves', { book_id: b, product_id: m.product_id, move_date: m.move_date, qty: 0, value: adj, unit_cost: 0, doc_type: 'chenh_lech', doc_id: m.doc_id,
          doc_code: m.doc_code, balance_qty: s.q, balance_value: s.v, note: 'Chênh lệch làm tròn / âm kho được tính vào giá vốn', anchor_id: m.id,
          created_by: ctx.uid, created_at: nowIso() });
      }
      s.last = s.q > 0 ? s.v / s.q : q > 0 ? inflow : s.last;
    }
    track(m, v);
  }
  // Ghi nhận giá trị từng loại để các dòng hủy / trả sau đó đảo đúng giá trị đã tính lại
  function track(m, v) {
    const key = `${m.line_id}|${m.product_id}`;
    if (m.doc_type === 'nhap' && m.qty > 0) add(`in|${key}`, v);
    if (m.doc_type === 'giao' && m.qty < 0) add(`out|${key}`, v);
    if (m.doc_type === 'tra_ncc' && m.qty < 0) add(`rn|${key}`, v);
    if (m.doc_type === 'san_xuat' && m.qty < 0) add(`sx|${m.doc_id}`, -v);
    if (m.doc_type === 'tra_hang' && m.qty > 0) add(`rt|${m.product_id}|${deliveryLineOf(m.line_id)}`, v);
  }
  // Khách trả: theo tỷ lệ giá trị đã xuất của dòng giao; trả hết phần còn lại thì lấy đúng phần còn lại
  function returnValue(m, key) {
    const dl = deliveryLineOf(m.line_id);
    const outK = `${dl}|${m.product_id}`; const totQ = outQty.get(outK) || 0; const out = -got(`out|${outK}`);
    const done = got(`rt|${m.product_id}|${dl}`);
    const doneQ = one(`select coalesce(sum(sm.qty), 0) as q from stock_moves sm join sales_return_lines l on l.id = sm.line_id
      where sm.doc_type = 'tra_hang' and l.delivery_line_id = ? and sm.product_id = ? and sm.id < ?`, dl, m.product_id, m.id).q;
    if (totQ && Math.abs(doneQ + m.qty - totQ) < 1e-6) return rnd(out - done);
    return totQ ? rnd(out * m.qty / totQ) : m.value;
  }
  // Hàng không có biến động nào từ ngày áp dụng nhưng còn tồn: đánh giá lại theo giá vốn cố định
  for (const [pid, s] of st) {
    if (method === 'fixed' && !s.touched && rnd(s.v) !== rnd(s.q * F(pid))) {
      insert('stock_moves', { book_id: b, product_id: pid, move_date: from > today() ? today() : from, qty: 0, value: rnd(s.q * F(pid) - s.v), unit_cost: 0, doc_type: 'danh_gia_lai',
        doc_id: pid, balance_qty: s.q, balance_value: rnd(s.q * F(pid)), note: 'Đánh giá lại tồn kho khi đổi sang giá vốn cố định', created_by: ctx.uid, created_at: nowIso() });
      s.v = rnd(s.q * F(pid));
    }
  }
  for (const [pid, s] of st) {
    const p = prods.get(pid);
    const f = method === 'fixed' ? F(pid) : null;
    run(`update products set stock_value = ?, last_cost = ?, fixed_cost = coalesce(fixed_cost, ?), updated_at = ? where id = ?`,
      rnd(s.v, 6), method === 'fixed' ? f : s.q > 0 ? s.v / s.q : s.last, method === 'fixed' ? f : p.fixed_cost, nowIso(), pid);
  }
  // Giá vốn trên chứng từ theo sổ kho mới
  const o = [b, from];
  run(`update delivery_lines set cogs = (select coalesce(-sum(m.value), 0) from stock_moves m where m.doc_type = 'giao' and m.qty < 0 and m.line_id = delivery_lines.id)
    where id in (select line_id from stock_moves where book_id = ? and doc_type = 'giao' and qty < 0 and move_date >= ?)`, ...o);
  run(`update sales_return_lines set cogs = (select coalesce(sum(m.value), 0) from stock_moves m where m.doc_type = 'tra_hang' and m.line_id = sales_return_lines.id)
    where id in (select line_id from stock_moves where book_id = ? and doc_type = 'tra_hang' and move_date >= ?)`, ...o);
  run(`update stock_adjustment_lines set value = (select coalesce(sum(m.value), 0) from stock_moves m where m.doc_type in ('dieu_chinh', 'dau_ky') and m.line_id = stock_adjustment_lines.id),
      unit_cost = abs((select coalesce(sum(m.value), 0) from stock_moves m where m.doc_type in ('dieu_chinh', 'dau_ky') and m.line_id = stock_adjustment_lines.id) / qty_delta)
    where id in (select line_id from stock_moves where book_id = ? and doc_type in ('dieu_chinh', 'dau_ky') and move_date >= ?)`, ...o);
  run(`update production_lines set value = (select coalesce(-sum(m.value), 0) from stock_moves m where m.doc_type = 'san_xuat' and m.qty < 0 and m.line_id = production_lines.id)
    where id in (select line_id from stock_moves where book_id = ? and doc_type = 'san_xuat' and qty < 0 and move_date >= ?)`, ...o);
  run(`update productions set value = (select coalesce(sum(m.value), 0) from stock_moves m where m.doc_type = 'san_xuat' and m.qty > 0 and m.doc_id = productions.id)
    where book_id = ? and prod_date >= ?`, ...o);
  run(`update supplier_return_lines set cost_value = (select coalesce(-sum(m.value), 0) from stock_moves m where m.doc_type = 'tra_ncc' and m.qty < 0 and m.line_id = supplier_return_lines.id),
      unit_cost = (select coalesce(-sum(m.value), 0) from stock_moves m where m.doc_type = 'tra_ncc' and m.qty < 0 and m.line_id = supplier_return_lines.id) / qty
    where id in (select line_id from stock_moves where book_id = ? and doc_type = 'tra_ncc' and qty < 0 and move_date >= ?)`, ...o);
}
const dlCache = new Map();
function deliveryLineOf(returnLineId) {
  if (!dlCache.has(returnLineId)) dlCache.set(returnLineId, one(`select delivery_line_id from sales_return_lines where id = ?`, returnLineId)?.delivery_line_id ?? null);
  return dlCache.get(returnLineId);
}

// Áp dụng phương pháp mới. mode 'from': tính lại mọi chứng từ từ ngày `from`; mode 'new': giữ nguyên chứng từ cũ, chỉ chứng từ mới theo cách mới.
function applyChange(b, p) {
  const method = p.method === 'fixed' ? 'fixed' : p.method === 'avg' ? 'avg' : fail('Chọn phương pháp tính giá vốn');
  const mode = p.mode === 'new' ? 'new' : 'from';
  const cur = costMethod(b);
  const from = mode === 'new' ? today() : asDate(p.from);
  if (mode === 'from') {
    if (!from) fail('Chọn ngày bắt đầu áp dụng');
    if (from > today()) fail('Ngày áp dụng không được ở tương lai');
    const lk = bookSettings(b).lock_date;
    if (lk && from <= lk) fail(`Sổ đã khóa đến ngày ${dmy(lk)} — chỉ áp dụng được từ ngày sau ngày khóa sổ`);
  } else {
    if (method === cur) fail(`Sổ đang dùng ${COST_METHODS[cur].toLowerCase()}`);
    checkDate(b, today());
  }
  // Giá vốn cố định người dùng sửa trong hộp thoại; hàng chưa có thì lấy mặc định
  for (const [pid, c] of Object.entries(p.fixed_costs || {})) {
    const x = num(c);
    if (x == null || x < 0) fail('Giá vốn cố định không được âm');
    run(`update products set fixed_cost = ? where id = ? and book_id = ?`, x, pid, b);
  }
  if (method === 'fixed') {
    for (const pr of all(`select * from products where book_id = ? and fixed_cost is null`, b)) run(`update products set fixed_cost = ? where id = ?`, defaultFixedCost(pr), pr.id);
  }
  if (mode === 'from') recost(b, method, from);
  else if (method === 'fixed') {
    for (const pr of all(`select * from products where book_id = ? and is_kit = 0 and product_type <> 'dich_vu' and on_hand <> 0`, b)) {
      const nv = rnd(pr.on_hand * pr.fixed_cost);
      revalue(b, pr, nv, today(), 'Đánh giá lại tồn kho khi đổi sang giá vốn cố định');
      run(`update products set stock_value = ?, last_cost = ? where id = ?`, nv, pr.fixed_cost, pr.id);
    }
  }
  const s = bookSettings(b);
  run(`update books set settings = ? where id = ?`, JSON.stringify({ ...s, cost_method: method,
    cost_history: [...(s.cost_history || []), { at: nowIso(), by: ctx.uid, from: cur, to: method, mode, since: from }].slice(-20) }), b);
  return { method, mode, from };
}

// Ảnh chụp số liệu để so sánh trước / sau
function snapshot(b, from) {
  const d2 = today(); const months = [];
  for (let d = from.slice(0, 8) + '01'; d <= d2; ) {
    const [y, mo] = d.split('-').map(Number);
    const end = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
    const pl = calcPl(b, d < from ? from : d, end > d2 ? d2 : end);
    months.push({ month: d.slice(0, 7), revenue_net: pl.revenue_net, cogs: pl.cogs, gross_profit: pl.gross_profit, profit: pl.profit });
    d = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10);
  }
  const products = all(`select p.id, p.sku, p.name, p.unit, p.on_hand, p.stock_value, p.last_cost, p.fixed_cost,
      coalesce((select -sum(m.value) from stock_moves m where m.product_id = p.id and m.move_date >= ? and m.doc_type in ('giao', 'tra_hang', 'chenh_lech')), 0) as cogs
    from products p where p.book_id = ? and p.is_kit = 0 and p.product_type <> 'dich_vu'`, from, b);
  const inv = products.reduce((t, x) => t + x.stock_value, 0);
  return { months, products, inventory_value: rnd(inv) };
}

function compare(b, p) {
  const from = p.mode === 'new' ? today() : asDate(p.from);
  const before = snapshot(b, from || today());
  ctx.db.exec('savepoint cost_preview');
  let after, applied;
  try {
    applied = applyChange(b, p);
    after = snapshot(b, applied.from);
  } finally {
    ctx.db.exec('rollback to cost_preview'); ctx.db.exec('release cost_preview');
    dlCache.clear();
  }
  const bm = new Map(before.products.map((x) => [x.id, x]));
  const products = after.products.map((a) => {
    const x = bm.get(a.id);
    const unit = (r) => (r.on_hand > 0 ? r.stock_value / r.on_hand : r.last_cost);
    return { id: a.id, sku: a.sku, name: a.name, unit: a.unit, on_hand: a.on_hand, fixed_cost: a.fixed_cost, default_fixed: x.fixed_cost ?? null,
      cost_before: rnd(unit(x), 2), cost_after: rnd(unit(a), 2), value_before: rnd(x.stock_value), value_after: rnd(a.stock_value), cogs_before: rnd(x.cogs), cogs_after: rnd(a.cogs) };
  }).sort((x, y) => Math.abs(y.cogs_after - y.cogs_before) + Math.abs(y.value_after - y.value_before) - Math.abs(x.cogs_after - x.cogs_before) - Math.abs(x.value_after - x.value_before));
  const tot = (arr, k) => rnd(arr.reduce((t, r) => t + r[k], 0));
  const months = after.months.map((a, i) => ({ month: a.month, before: before.months[i], after: a }));
  return {
    method: applied.method, mode: applied.mode, from: applied.from, current: costMethod(b),
    totals: { cogs_before: tot(before.months, 'cogs'), cogs_after: tot(after.months, 'cogs'), gross_before: tot(before.months, 'gross_profit'), gross_after: tot(after.months, 'gross_profit'),
      profit_before: tot(before.months, 'profit'), profit_after: tot(after.months, 'profit'), inventory_before: before.inventory_value, inventory_after: after.inventory_value,
      changed_products: products.filter((r) => r.cost_before !== r.cost_after || r.cogs_before !== r.cogs_after).length },
    months, products: products.slice(0, 300),
  };
}

export function cost_method_info(p) {
  const b = p.book_id; requirePerm(b, 'owner');
  const s = bookSettings(b);
  return { method: costMethod(b), history: s.cost_history || [], lock_date: s.lock_date || null,
    first_date: one(`select min(move_date) as d from stock_moves where book_id = ?`, b).d || today() };
}

export function cost_method_preview(p) {
  const b = p.book_id; requirePerm(b, 'owner');
  return compare(b, p);
}

// Đổi thật (máy chủ đã sao lưu CSDL trước khi gọi hàm này)
export function change_cost_method(p) {
  const b = p.book_id; requirePerm(b, 'owner');
  if (p.confirm !== true) fail('Cần xác nhận trước khi đổi phương pháp tính giá vốn');
  const r = applyChange(b, p);
  dlCache.clear();
  return { ...r, label: COST_METHODS[r.method], backup: p.backup_file ? path.basename(p.backup_file) : null };
}
