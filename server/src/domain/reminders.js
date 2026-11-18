// Nhắc việc theo quy trình bán hàng: những bước hay bị quên vì làm ở phần mềm khác.
// Hiện có: khách là công ty, đơn đã giao (đã có biên bản giao hàng) nhưng chưa ghi nhận hóa đơn VAT đầu ra.
import { all, today, daysBetween, rnd } from '../lib/context.js';
import { requirePerm } from './access.js';
import { scope } from './query.js';

// Chênh lệch nhỏ hơn mức này coi như đã xuất đủ (làm tròn tiền thuế, đơn giá lẻ)
const TOLERANCE = 1000;

// Khách là công ty: chọn loại khách "Công ty" hoặc đã khai mã số thuế ở thẻ Thông tin xuất hóa đơn
export const COMPANY_SQL = `(json_extract(c.extra, '$.customer_type') = 'Công ty' or trim(coalesce(json_extract(c.extra, '$.tax_code'), '')) <> '')`;

// p = {book_id, order_id?, customer_id?} → đơn của khách công ty đã giao mà hóa đơn VAT ghi nhận còn thiếu so với hàng đã giao (trước thuế).
// Đơn đánh dấu "không cần xuất hóa đơn" (doc_info.vat_skip) được bỏ qua.
export function vat_invoice_todo(p) {
  const b = p.book_id;
  requirePerm(b, 'xem_ban_hang');
  const where = [`o.book_id = ?`, `o.status not in ('huy', 'nhap')`, `o.delivery_count > 0`, COMPANY_SQL,
    `coalesce(json_extract(di.data, '$.vat_skip'), '') <> '1'`];
  const args = [b];
  if (p.order_id) { where.push('o.id = ?'); args.push(String(p.order_id)); }
  if (p.customer_id) { where.push('o.customer_id = ?'); args.push(String(p.customer_id)); }
  scope('customers', b, where, args);
  const rows = all(`select o.id, o.code, o.customer_id, o.customer_name, o.order_date, o.last_delivery_date, o.vat_rate,
      o.delivered_value - o.vat_net as need, o.delivered_value, json_extract(c.extra, '$.tax_code') as tax_code, json_extract(c.extra, '$.tax_name') as tax_name,
      coalesce((select sum(t.amount) from tax_invoices t where t.order_id = o.id and t.direction = 'ra' and t.voided = 0), 0) as invoiced,
      (select group_concat(t.inv_no, ', ') from tax_invoices t where t.order_id = o.id and t.direction = 'ra' and t.voided = 0) as inv_nos
    from v_sales_orders o join customers c on c.id = o.customer_id
    left join doc_info di on di.ref_type = 'order' and di.ref_id = o.id
    where ${where.join(' and ')} order by o.last_delivery_date, o.code`, ...args);
  const t = today();
  return rows.filter((r) => r.need > 0 && r.invoiced < r.need - TOLERANCE).map((r) => ({
    ...r, need: rnd(r.need), missing: rnd(r.need - r.invoiced), state: r.invoiced > 0 ? 'thieu' : 'chua', days: daysBetween(t, r.last_delivery_date),
  }));
}
