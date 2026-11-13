// Chăm sóc khách hàng: tích điểm, khuyến mại, voucher, coupon.
// Giảm giá trên đơn do máy chủ tính (không tin số từ trình duyệt); tổng giảm giá của đơn = giảm tay + các khoản ở order_promos.
import { ctx, fail, one, all, run, insert, uuid, nowIso, num, int, nz, trimNz, asDate, today, rnd, json } from '../lib/context.js';
import { randomBytes } from 'node:crypto';
import { requirePerm, bookSettings, nextCode } from './access.js';

const pointsCfg = (b) => { const s = bookSettings(b); const c = s.points || {}; return s.points_on ? { earn: num(c.earn_amount) || 0, value: num(c.redeem_value) || 0, min: num(c.min_redeem) || 0, redeem: c.redeem !== false } : null; };
const isWalkIn = (cid) => one(`select code from customers where id = ?`, cid)?.code === 'KL';
export const pointsOf = (cid, exceptDoc = null) => one(`select coalesce(sum(points), 0) as p from point_moves where customer_id = ? and (? is null or doc_id is not ?)`, cid, exceptDoc, exceptDoc).p;

// ---------- Tích điểm theo đợt giao, trả hàng, hủy giao ----------
export function earnPoints(b, customerId, revenue, docType, docId, docCode, date) {
  const c = pointsCfg(b);
  if (!c || !c.earn || isWalkIn(customerId)) return 0;
  const pts = Math.floor(Math.max(revenue, 0) / c.earn);
  if (pts) insert('point_moves', { book_id: b, customer_id: customerId, move_date: date, points: pts, kind: 'tich', doc_type: docType, doc_id: docId, doc_code: docCode, created_by: ctx.uid, created_at: nowIso() });
  return pts;
}
export function returnPoints(b, customerId, revenue, docId, docCode, date) {
  const c = pointsCfg(b);
  if (!c || !c.earn || isWalkIn(customerId)) return;
  const pts = Math.floor(Math.max(revenue, 0) / c.earn);
  if (pts) insert('point_moves', { book_id: b, customer_id: customerId, move_date: date, points: -pts, kind: 'tra_hang', doc_type: 'tra_hang', doc_id: docId, doc_code: docCode, created_by: ctx.uid, created_at: nowIso() });
}
export function cancelPoints(docId, date) {
  for (const m of all(`select customer_id, book_id, doc_code, sum(points) as p from point_moves where doc_id = ? group by customer_id`, docId)) {
    if (m.p) insert('point_moves', { book_id: m.book_id, customer_id: m.customer_id, move_date: date, points: -m.p, kind: 'huy', doc_type: 'huy', doc_id: docId, doc_code: m.doc_code, note: 'Hủy chứng từ', created_by: ctx.uid, created_at: nowIso() });
  }
}

export function adjust_points(p) {
  const b = p.book_id; requirePerm(b, 'owner');
  const pts = num(p.points);
  if (!pts) fail('Nhập số điểm cộng (+) hoặc trừ (−)');
  const c = one(`select id from customers where id = ? and book_id = ?`, p.customer_id, b);
  if (!c) fail('Không tìm thấy khách hàng');
  if (pointsOf(c.id) + pts < 0) fail('Điểm của khách không đủ để trừ');
  insert('point_moves', { book_id: b, customer_id: c.id, move_date: today(), points: pts, kind: 'dieu_chinh', note: trimNz(p.note), created_by: ctx.uid, created_at: nowIso() });
  return { points: pointsOf(c.id) };
}
export function point_history(p) {
  const b = p.book_id; requirePerm(b, null);
  return all(`select * from point_moves where book_id = ? and customer_id = ? order by id desc limit 300`, b, p.customer_id);
}

// ---------- Khuyến mại, voucher, coupon: danh mục ----------
const dates = (p) => {
  const s = asDate(p.start_date); const e = asDate(p.end_date);
  if (!s || !e) fail('Chọn ngày bắt đầu và kết thúc'); if (e < s) fail('Ngày kết thúc phải sau ngày bắt đầu');
  return { start_date: s, end_date: e };
};
const discountOf = (p) => {
  const pct = num(p.discount_pct) ?? 0; const amt = num(p.discount_amount) ?? 0;
  if (pct < 0 || pct > 100) fail('Phần trăm giảm phải từ 0 đến 100'); if (amt < 0) fail('Số tiền giảm không được âm');
  if (!pct && !amt) fail('Nhập mức giảm (% hoặc số tiền)'); if (pct && amt) fail('Chỉ chọn giảm theo % hoặc theo số tiền');
  const max = num(p.max_discount); if (max != null && max < 0) fail('Giảm tối đa không được âm');
  return { discount_pct: pct, discount_amount: amt, max_discount: max || null };
};

export function save_promotion(p) {
  const b = p.book_id; requirePerm(b, 'owner');
  if (!trimNz(p.name)) fail('Nhập tên chương trình');
  const kind = p.kind === 'product' ? 'product' : 'order';
  const pids = (Array.isArray(p.product_ids) ? p.product_ids : []).filter(Boolean); const cats = (Array.isArray(p.categories) ? p.categories : []).filter(Boolean);
  if (kind === 'product' && !pids.length && !cats.length) fail('Chọn hàng hóa hoặc nhóm hàng được giảm');
  const f = { name: trimNz(p.name), kind, min_amount: num(p.min_amount) ?? 0, ...discountOf(p), product_ids: JSON.stringify(pids), categories: JSON.stringify(cats),
    ...dates(p), active: p.active === false ? 0 : 1, note: trimNz(p.note) };
  if (nz(p.id)) {
    const k = Object.keys(f);
    if (!run(`update promotions set ${k.map((x) => `${x} = ?`).join(', ')} where id = ? and book_id = ?`, ...k.map((x) => f[x]), p.id, b).changes) fail('Không tìm thấy chương trình');
    return { id: p.id };
  }
  const id = uuid();
  insert('promotions', { id, book_id: b, code: nextCode(b, 'KM'), ...f, created_at: nowIso() });
  return { id };
}

export function save_coupon(p) {
  const b = p.book_id; requirePerm(b, 'owner');
  const code = String(p.code ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) fail('Mã coupon gồm 3–30 chữ hoặc số, không dấu, không khoảng trắng');
  if (one(`select 1 from coupons where book_id = ? and upper(code) = ? and id is not ?`, b, code, nz(p.id))) fail(`Mã ${code} đã có`);
  const lim = int(p.usage_limit); if (lim != null && lim < 1) fail('Số lần dùng tối đa phải từ 1');
  const f = { code, name: trimNz(p.name), ...discountOf(p), min_amount: num(p.min_amount) ?? 0, usage_limit: lim, ...dates(p), active: p.active === false ? 0 : 1 };
  if (nz(p.id)) {
    const k = Object.keys(f);
    if (!run(`update coupons set ${k.map((x) => `${x} = ?`).join(', ')} where id = ? and book_id = ?`, ...k.map((x) => f[x]), p.id, b).changes) fail('Không tìm thấy coupon');
    return { id: p.id };
  }
  const id = uuid(); insert('coupons', { id, book_id: b, ...f, created_at: nowIso() });
  return { id };
}

// Phát hành voucher: một lần tạo nhiều mã cùng mệnh giá
export function issue_vouchers(p) {
  const b = p.book_id; requirePerm(b, 'owner');
  const n = int(p.count) ?? 1; if (n < 1 || n > 500) fail('Mỗi lần phát hành từ 1 đến 500 voucher');
  const value = num(p.value); if (!(value > 0)) fail('Nhập mệnh giá voucher');
  const exp = asDate(p.expiry_date); if (exp && exp < today()) fail('Hạn dùng đã qua');
  const cust = nz(p.customer_id); if (cust && !one(`select 1 from customers where id = ? and book_id = ?`, cust, b)) fail('Không tìm thấy khách hàng');
  const prefix = String(p.prefix ?? 'VC').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'VC';
  const batch = nextCode(b, 'PHV'); const codes = [];
  for (let i = 0; i < n; i++) {
    let code;
    do { code = prefix + Array.from(randomBytes(6), (x) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x % 32]).join(''); }
    while (one(`select 1 from vouchers where book_id = ? and upper(code) = ?`, b, code));
    insert('vouchers', { id: uuid(), book_id: b, code, batch, value, min_amount: num(p.min_amount) ?? 0, customer_id: cust, issue_date: today(), expiry_date: exp, note: trimNz(p.note), created_at: nowIso() });
    codes.push(code);
  }
  return { batch, codes };
}
export function cancel_voucher(p) {
  const v = one(`select * from vouchers where id = ?`, p.id); if (!v) fail('Không tìm thấy voucher');
  requirePerm(v.book_id, 'owner'); if (v.status === 'da_dung') fail(`Voucher ${v.code} đã dùng ở đơn hàng, không hủy được`);
  run(`update vouchers set status = 'huy' where id = ?`, v.id); return { ok: true };
}

export function loyalty_lists(p) {
  const b = p.book_id; requirePerm(b, null);
  return {
    promotions: all(`select p.*, (select count(*) from order_promos x join sales_orders o on o.id = x.order_id where x.ref_id = p.id and o.status <> 'huy') as used
      from promotions p where p.book_id = ? order by p.end_date desc`, b).map((x) => ({ ...x, product_ids: json(x.product_ids, []), categories: json(x.categories, []) })),
    coupons: all(`select c.*, (select count(*) from order_promos x join sales_orders o on o.id = x.order_id where x.ref_id = c.id and o.status <> 'huy') as used
      from coupons c where c.book_id = ? order by c.end_date desc`, b),
    vouchers: all(`select v.*, c.name as customer_name, o.code as used_order_code from vouchers v left join customers c on c.id = v.customer_id
      left join sales_orders o on o.id = v.used_order_id where v.book_id = ? order by v.created_at desc limit 1000`, b),
  };
}

// ---------- Áp dụng trên đơn ----------
function goodsOf(orderId) {
  return all(`select l.*, pr.category from sales_order_lines l join products pr on pr.id = l.product_id where l.order_id = ?`, orderId)
    .map((l) => ({ ...l, amount: (l.qty - l.cancelled_qty) * l.unit_price * (1 - l.discount_pct / 100) }));
}
const cap = (x, max) => (max ? Math.min(x, max) : x);

// Tính các khoản giảm cho đơn (không ghi gì): dùng cả khi xem trước trên màn bán hàng
export function quotePromos(b, { customerId, date, lines, promos, orderId = null }) {
  const out = []; let left = lines.reduce((s, l) => s + l.amount, 0); const goods = left;
  const s = bookSettings(b);
  for (const x of promos || []) {
    let amount = 0; let row;
    if (x.kind === 'promo') {
      if (!s.promo_on) fail('Sổ chưa bật Khuyến mại');
      const pr = one(`select * from promotions where id = ? and book_id = ?`, x.id, b);
      if (!pr || !pr.active || date < pr.start_date || date > pr.end_date) fail(`Chương trình khuyến mại ${pr?.name ?? ''} không áp dụng cho ngày ${date}`);
      if (goods < pr.min_amount) fail(`“${pr.name}” áp dụng cho đơn từ ${pr.min_amount.toLocaleString('vi-VN')} đ`);
      let base = goods;
      if (pr.kind === 'product') {
        const ids = json(pr.product_ids, []); const cats = json(pr.categories, []);
        base = lines.filter((l) => ids.includes(l.product_id) || (l.category && cats.includes(l.category))).reduce((t, l) => t + l.amount, 0);
        if (!base) fail(`Đơn không có hàng thuộc “${pr.name}”`);
      }
      amount = cap(pr.discount_pct ? base * pr.discount_pct / 100 : pr.discount_amount, pr.max_discount);
      row = { kind: 'promo', ref_id: pr.id, code: pr.code, label: pr.name };
    } else if (x.kind === 'voucher') {
      if (!s.voucher_on) fail('Sổ chưa bật Voucher');
      const v = one(`select * from vouchers where book_id = ? and upper(code) = upper(?)`, b, String(x.code ?? '').trim());
      if (!v) fail(`Không có voucher ${x.code ?? ''}`);
      if (v.status === 'huy') fail(`Voucher ${v.code} đã hủy`);
      if (v.status === 'da_dung' && v.used_order_id !== orderId) fail(`Voucher ${v.code} đã dùng`);
      if (v.expiry_date && date > v.expiry_date) fail(`Voucher ${v.code} hết hạn ngày ${v.expiry_date}`);
      if (v.customer_id && v.customer_id !== customerId) fail(`Voucher ${v.code} chỉ dùng cho khách được tặng`);
      if (goods < v.min_amount) fail(`Voucher ${v.code} dùng cho đơn từ ${v.min_amount.toLocaleString('vi-VN')} đ`);
      amount = v.value; row = { kind: 'voucher', ref_id: v.id, code: v.code, label: `Voucher ${v.code}` };
    } else if (x.kind === 'coupon') {
      if (!s.coupon_on) fail('Sổ chưa bật Coupon');
      const c = one(`select * from coupons where book_id = ? and upper(code) = upper(?)`, b, String(x.code ?? '').trim());
      if (!c || !c.active || date < c.start_date || date > c.end_date) fail(`Mã giảm giá ${x.code ?? ''} không dùng được`);
      if (goods < c.min_amount) fail(`Mã ${c.code} dùng cho đơn từ ${c.min_amount.toLocaleString('vi-VN')} đ`);
      const used = one(`select count(*) as n from order_promos x join sales_orders o on o.id = x.order_id where x.ref_id = ? and o.status <> 'huy' and o.id is not ?`, c.id, orderId).n;
      if (c.usage_limit && used >= c.usage_limit) fail(`Mã ${c.code} đã hết lượt dùng`);
      amount = cap(c.discount_pct ? goods * c.discount_pct / 100 : c.discount_amount, c.max_discount);
      row = { kind: 'coupon', ref_id: c.id, code: c.code, label: c.name || `Mã ${c.code}` };
    } else if (x.kind === 'points') {
      const c = pointsCfg(b);
      if (!c || !c.redeem || !c.value) fail('Sổ chưa bật đổi điểm thanh toán');
      const pts = Math.floor(num(x.points) ?? 0);
      if (pts <= 0) continue;
      if (c.min && pts < c.min) fail(`Đổi tối thiểu ${c.min} điểm`);
      const have = pointsOf(customerId, orderId);
      if (pts > have) fail(`Khách chỉ có ${have} điểm`);
      amount = pts * c.value; row = { kind: 'points', ref_id: null, code: null, label: `Đổi ${pts} điểm`, points: pts };
    } else fail('Loại giảm giá không hợp lệ');
    if (out.some((o) => o.kind === row.kind && o.ref_id === row.ref_id && row.kind !== 'points')) continue;
    amount = rnd(Math.min(amount, left));
    left -= amount;
    out.push({ ...row, amount });
  }
  return { goods: rnd(goods), items: out, total: rnd(out.reduce((t, x) => t + x.amount, 0)) };
}

// Bỏ các khoản giảm đã ghi của đơn (khi sửa / hủy đơn)
export function revertPromos(orderId) {
  run(`update vouchers set status = 'moi', used_order_id = null, used_at = null where used_order_id = ?`, orderId);
  run(`delete from point_moves where doc_id = ? and kind = 'doi'`, orderId);
  run(`delete from order_promos where order_id = ?`, orderId);
}

// Ghi các khoản giảm và cập nhật tổng giảm giá của đơn = giảm tay + khuyến mại
export function applyPromos(b, o, manual, promos) {
  revertPromos(o.id);
  const q = quotePromos(b, { customerId: o.customer_id, date: o.order_date, lines: goodsOf(o.id), promos, orderId: o.id });
  for (const x of q.items) {
    insert('order_promos', { order_id: o.id, book_id: b, kind: x.kind, ref_id: x.ref_id, code: x.code, label: x.label, points: x.points ?? null, amount: x.amount });
    if (x.kind === 'voucher') run(`update vouchers set status = 'da_dung', used_order_id = ?, used_at = ? where id = ?`, o.id, nowIso(), x.ref_id);
    if (x.kind === 'points') insert('point_moves', { book_id: b, customer_id: o.customer_id, move_date: o.order_date, points: -x.points, kind: 'doi', doc_type: 'don_ban', doc_id: o.id, doc_code: o.code, created_by: ctx.uid, created_at: nowIso() });
  }
  run(`update sales_orders set discount = ? where id = ?`, rnd(manual + q.total), o.id);
  return q;
}

// Xem trước giảm giá trên màn bán hàng (chưa lưu đơn)
export function preview_promos(p) {
  const b = p.book_id; requirePerm(b, 'ban_hang');
  const lines = (p.lines || []).map((l) => {
    const pr = one(`select id, category from products where id = ? and book_id = ?`, l.product_id, b);
    return { product_id: l.product_id, category: pr?.category, amount: (num(l.qty) ?? 0) * (num(l.unit_price) ?? 0) * (1 - (num(l.discount_pct) ?? 0) / 100) };
  });
  return { ...quotePromos(b, { customerId: p.customer_id, date: asDate(p.date) || today(), lines, promos: p.promos, orderId: nz(p.order_id) }),
    points: p.customer_id ? pointsOf(p.customer_id, nz(p.order_id)) : 0 };
}

// Chương trình khuyến mại đang áp dụng được cho đơn (gợi ý trên màn bán hàng)
export function active_promotions(p) {
  const b = p.book_id; requirePerm(b, null);
  if (!bookSettings(b).promo_on) return [];
  const d = asDate(p.date) || today();
  return all(`select * from promotions where book_id = ? and active = 1 and start_date <= ? and end_date >= ? order by name`, b, d, d)
    .map((x) => ({ ...x, product_ids: json(x.product_ids, []), categories: json(x.categories, []) }));
}
export const order_promos = (p) => { const o = one(`select book_id from sales_orders where id = ?`, p.order_id); if (!o) fail('Không tìm thấy đơn'); requirePerm(o.book_id, 'xem_ban_hang'); return all(`select * from order_promos where order_id = ? order by id`, p.order_id); };
