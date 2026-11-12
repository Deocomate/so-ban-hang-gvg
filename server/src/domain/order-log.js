// Lịch sử đơn bán: mỗi thao tác ghi một dòng bằng lời (ai, lúc nào, làm gì) để người bán xem lại, tránh nhầm lẫn.
import { ctx, one, all, insert, nowIso, vnd } from '../lib/context.js';

export function logOrder(orderId, action, summary, detail = []) {
  const o = one(`select book_id from sales_orders where id = ?`, orderId);
  if (!o) return;
  insert('order_events', { book_id: o.book_id, order_id: orderId, at: nowIso(), user_id: ctx.uid ?? null, action, summary,
    detail: detail.length ? JSON.stringify(detail) : null });
}

const qtyText = (v) => String(Math.round(Number(v || 0) * 1000) / 1000).replace('.', ',');
const dateText = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : 'trống');

// Ảnh chụp đơn trước / sau khi sửa: đầu đơn + các dòng hàng (kèm mã, tên hàng) + tổng đơn
export function orderSnapshot(orderId) {
  const o = one(`select o.*, c.name as customer_name from sales_orders o left join customers c on c.id = o.customer_id where o.id = ?`, orderId);
  const lines = all(`select l.*, p.sku, p.name, p.unit from sales_order_lines l join products p on p.id = l.product_id where l.order_id = ? order by l.line_no`, orderId);
  const total = one(`select order_total from v_sales_orders where id = ?`, orderId)?.order_total ?? 0;
  return { o, lines, total };
}

const HEAD = [
  ['customer_name', 'Khách hàng'], ['order_date', 'Ngày đơn', dateText], ['due_date', 'Hẹn giao', dateText], ['channel', 'Kênh bán'], ['staff', 'Phụ trách'],
  ['discount', 'Giảm giá cả đơn', vnd], ['shipping_fee', 'Phí vận chuyển', vnd], ['vat_rate', 'VAT', (v) => `${qtyText(v)}%`], ['note', 'Ghi chú'],
];
const lineLabel = (l) => `${l.sku} · ${l.name}`;
const effQty = (l) => l.qty - (l.cancelled_qty || 0);

// So sánh hai ảnh chụp → danh sách thay đổi bằng lời
export function describeChanges(a, b) {
  const out = [];
  for (const [k, label, fmt = (v) => (v == null || v === '' ? 'trống' : String(v))] of HEAD) {
    const x = a.o[k] ?? null; const y = b.o[k] ?? null;
    if ((x ?? '') !== (y ?? '')) out.push(`${label}: ${fmt(x)} → ${fmt(y)}`);
  }
  if (a.o.kind !== b.o.kind) out.push(`Loại đơn: ${a.o.kind === 'dat_hang' ? 'đặt hàng' : 'bán ngay'} → ${b.o.kind === 'dat_hang' ? 'đặt hàng' : 'bán ngay'}`);
  if (a.o.status !== b.o.status && b.o.status === 'xac_nhan') out.push('Xác nhận đơn');
  const before = new Map(a.lines.map((l) => [l.id, l]));
  for (const l of b.lines) {
    const p = before.get(l.id); before.delete(l.id);
    if (!p) { out.push(`Thêm ${lineLabel(l)}: ${qtyText(l.qty)} ${l.unit} × ${vnd(l.unit_price)}${l.discount_pct ? `, CK ${qtyText(l.discount_pct)}%` : ''}`); continue; }
    const ch = [];
    if (p.product_id !== l.product_id) ch.push(`đổi hàng ${lineLabel(p)} → ${lineLabel(l)}`);
    if (effQty(p) !== effQty(l)) ch.push(`số lượng ${qtyText(effQty(p))} → ${qtyText(effQty(l))} ${l.unit}`);
    if (p.unit_price !== l.unit_price) ch.push(`đơn giá ${vnd(p.unit_price)} → ${vnd(l.unit_price)}`);
    if ((p.discount_pct || 0) !== (l.discount_pct || 0)) ch.push(`chiết khấu ${qtyText(p.discount_pct)}% → ${qtyText(l.discount_pct)}%`);
    if ((p.unit_name || '') !== (l.unit_name || '')) ch.push(`đơn vị ${p.unit_name || p.unit} → ${l.unit_name || l.unit}`);
    if ((p.note || '') !== (l.note || '')) ch.push(`ghi chú dòng "${p.note || ''}" → "${l.note || ''}"`);
    if (ch.length) out.push(`${lineLabel(l)}: ${ch.join('; ')}`);
  }
  for (const p of before.values()) out.push(`Bỏ ${lineLabel(p)} (${qtyText(effQty(p))} ${p.unit})`);
  if (Math.round(a.total) !== Math.round(b.total)) out.push(`Tổng đơn: ${vnd(a.total)} → ${vnd(b.total)}`);
  return out;
}

// Dòng hàng của một phiếu giao: "SKU × 10 viên"
export function deliveryLinesText(deliveryId) {
  return all(`select p.sku, p.name, p.unit, x.qty from delivery_lines x join products p on p.id = x.product_id where x.delivery_id = ? order by p.sku`, deliveryId)
    .map((r) => `${r.sku} · ${r.name}: ${qtyText(r.qty)} ${r.unit}`);
}
