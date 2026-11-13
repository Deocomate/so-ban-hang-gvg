// Bảo hành, bảo trì, sửa chữa: tra cứu hạn bảo hành theo hàng đã giao, phiếu tiếp nhận sửa chữa và hẹn trả khách.
import { ctx, fail, one, all, run, insert, uuid, nowIso, num, nz, trimNz, asDate, today } from '../lib/context.js';
import { requirePerm, nextCode, once, bookSettings, checkDate } from './access.js';

export const CLAIM_STATUS = { tiep_nhan: 'Tiếp nhận', dang_sua: 'Đang sửa', da_sua: 'Đã sửa xong', da_tra: 'Đã trả khách', huy: 'Đã hủy' };
const NEXT = { tiep_nhan: ['dang_sua', 'da_sua', 'huy'], dang_sua: ['da_sua', 'huy'], da_sua: ['da_tra', 'dang_sua'], da_tra: [], huy: [] };

const requireOn = (b) => { if (!bookSettings(b).warranty) fail('Sổ chưa bật Bảo hành, bảo trì (Thiết lập → Hàng hóa)'); };
const addMonthsExact = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCMonth(t.getUTCMonth() + n); return t.toISOString().slice(0, 10); };

// Hàng đã giao còn / hết hạn bảo hành của một khách, hoặc tìm theo tên, điện thoại, mã đơn
export function warranty_lookup(p) {
  const b = p.book_id; requirePerm(b, 'xem_ban_hang'); requireOn(b);
  const q = `%${String(p.q ?? '').trim().toLowerCase()}%`;
  const rows = all(`select x.id as delivery_line_id, d.delivery_date, d.code as delivery_code, o.code as order_code, o.id as order_id,
      c.id as customer_id, c.name as customer_name, c.phone, pr.id as product_id, pr.sku, pr.name as product_name, x.qty,
      pr.warranty_months, pr.maintenance_months
    from delivery_lines x join deliveries d on d.id = x.delivery_id join sales_orders o on o.id = d.order_id
    join customers c on c.id = o.customer_id join products pr on pr.id = x.product_id
    where d.book_id = ? and (coalesce(pr.warranty_months, 0) > 0 or coalesce(pr.maintenance_months, 0) > 0)
      and (? is null or c.id = ?)
      and (? = '%%' or vi_lower(c.name) like ? or vi_lower(coalesce(c.phone, '')) like ? or vi_lower(o.code) like ? or vi_lower(pr.sku) like ?)
    order by d.delivery_date desc limit 300`, b, nz(p.customer_id), nz(p.customer_id), q, q, q, q, q);
  const t = today();
  return rows.map((r) => {
    const end = r.warranty_months ? addMonthsExact(r.delivery_date, r.warranty_months) : null;
    let next = null;
    if (r.maintenance_months) { next = addMonthsExact(r.delivery_date, r.maintenance_months); while (next < t) next = addMonthsExact(next, r.maintenance_months); }
    return { ...r, warranty_end: end, in_warranty: !!end && end >= t, next_maintenance: next };
  });
}

export function save_warranty_claim(p) {
  const b = p.book_id; requirePerm(b, 'ban_hang'); requireOn(b);
  return once(p, b, 'save_warranty_claim', () => {
    const rd = asDate(p.received_date) || today();
    checkDate(b, rd);
    if (!trimNz(p.issue)) fail('Ghi tình trạng / yêu cầu sửa chữa');
    const fee = num(p.fee) ?? 0; if (fee < 0) fail('Phí sửa chữa không được âm');
    const pd = asDate(p.promise_date);
    if (pd && pd < rd) fail('Ngày hẹn trả không được trước ngày tiếp nhận');
    const cust = nz(p.customer_id) ? one(`select id from customers where id = ? and book_id = ?`, p.customer_id, b) : null;
    if (!cust) fail('Chọn khách hàng');
    let product = nz(p.product_id); let inW = 0;
    const dl = nz(p.delivery_line_id) ? one(`select x.*, d.delivery_date, o.customer_id from delivery_lines x join deliveries d on d.id = x.delivery_id
      join sales_orders o on o.id = d.order_id where x.id = ? and d.book_id = ?`, p.delivery_line_id, b) : null;
    if (nz(p.delivery_line_id) && !dl) fail('Không tìm thấy hàng đã giao');
    if (dl) {
      if (dl.customer_id !== cust.id) fail('Hàng đã giao không thuộc khách này');
      product = dl.product_id;
      const pr = one(`select warranty_months from products where id = ?`, product);
      inW = pr.warranty_months && addMonthsExact(dl.delivery_date, pr.warranty_months) >= rd ? 1 : 0;
    } else if (product && !one(`select 1 from products where id = ? and book_id = ?`, product, b)) fail('Không tìm thấy hàng hóa');
    const f = { customer_id: cust.id, product_id: product, delivery_line_id: dl?.id ?? null, issue: trimNz(p.issue), received_date: rd, promise_date: pd,
      in_warranty: inW, fee: inW ? 0 : fee, note: trimNz(p.note) };
    if (nz(p.id)) {
      const c = one(`select * from warranty_claims where id = ? and book_id = ?`, p.id, b);
      if (!c) fail('Không tìm thấy phiếu');
      if (['da_tra', 'huy'].includes(c.status)) fail(`Phiếu ${c.code} đã ${CLAIM_STATUS[c.status].toLowerCase()}, không sửa được`);
      const k = Object.keys(f);
      run(`update warranty_claims set ${k.map((x) => `${x} = ?`).join(', ')} where id = ?`, ...k.map((x) => f[x]), c.id);
      return { id: c.id, code: c.code };
    }
    const id = uuid(); const code = nextCode(b, 'SC');
    insert('warranty_claims', { id, book_id: b, code, ...f, status: 'tiep_nhan', created_by: ctx.uid, created_at: nowIso() });
    return { id, code, in_warranty: !!inW };
  });
}

export function set_warranty_status(p) {
  const c = one(`select * from warranty_claims where id = ?`, p.id);
  if (!c) fail('Không tìm thấy phiếu');
  requirePerm(c.book_id, 'ban_hang');
  if (!CLAIM_STATUS[p.status]) fail('Trạng thái không hợp lệ');
  if (!NEXT[c.status].includes(p.status)) fail(`Không chuyển được từ “${CLAIM_STATUS[c.status]}” sang “${CLAIM_STATUS[p.status]}”`);
  run(`update warranty_claims set status = ?, done_at = case when ? in ('da_tra', 'huy') then ? else done_at end, note = coalesce(?, note) where id = ?`,
    p.status, p.status, nowIso(), trimNz(p.note), c.id);
  return { ok: true };
}

export function warranty_claims(p) {
  const b = p.book_id; requirePerm(b, 'xem_ban_hang');
  return all(`select w.*, c.name as customer_name, c.phone, pr.sku, pr.name as product_name,
      (w.promise_date is not null and w.promise_date < ? and w.status not in ('da_tra', 'huy')) as is_late
    from warranty_claims w left join customers c on c.id = w.customer_id left join products pr on pr.id = w.product_id
    where w.book_id = ? and (? is null or w.status = ?) order by w.received_date desc, w.created_at desc limit 500`, today(), b, nz(p.status), nz(p.status));
}

