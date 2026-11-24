// Tạo ngược đơn đặt hàng từ các hóa đơn đã bán ngay (hóa đơn cũ chưa có đơn đặt hàng ở bước trước).
// Các hóa đơn được chọn gộp thành một đơn đặt hàng DH…: phần đã giao của mỗi hóa đơn trở thành một đợt giao của đơn, giữ nguyên mã HD,
// ngày giao, doanh thu, giá vốn, tồn kho và tiền đã thu. Phần chưa giao (hóa đơn chờ giao, phiếu tạm) thành hàng còn phải giao của đơn,
// tiền khách đã trả trước thành tiền cọc của đơn. Nhờ vậy lập được đối chiếu số lượng / công nợ, hợp đồng… theo đơn mà không phải xóa làm lại.
import { fail, one, all, run, inList, nowIso, nz, rnd, vnd, dmy, daysBetween } from '../lib/context.js';
import { requirePerm, once, salesOrderCode } from './access.js';
import { logOrder } from './order-log.js';
import { availabilityWarnings } from './sales.js';

// Hai hóa đơn được coi là cùng một việc khi có chung ít nhất một mặt hàng và ngày bán cách nhau không quá số ngày này
const LINK_DAYS = 45;

function invoiceRows(b, customerId) {
  const rows = all(`select id, code, status, order_date, created_at, vat_rate, order_total, delivered_value, paid_net, receivable, remaining_qty, delivery_count, note
    from v_sales_orders where book_id = ? and customer_id = ? and kind = 'ban_san' and status <> 'huy' order by order_date, created_at`, b, customerId);
  const ids = rows.map((r) => r.id);
  const lines = ids.length ? all(`select l.order_id, l.product_id, p.name, sum(l.qty - l.cancelled_qty) as q
    from sales_order_lines l join products p on p.id = l.product_id where l.order_id in ${inList(ids)} group by l.order_id, l.product_id order by min(l.line_no)`, ...ids) : [];
  return rows.map((r) => {
    const ls = lines.filter((l) => l.order_id === r.id);
    const state = r.status === 'nhap' ? 'Phiếu tạm' : !r.delivery_count ? 'Chờ giao' : r.remaining_qty > 0 ? 'Giao một phần' : null;
    return { ...r, products: ls.map((l) => l.name), product_ids: ls.map((l) => l.product_id), state };
  });
}

// Gom các hóa đơn liên quan thành nhóm: nối hai hóa đơn có chung mặt hàng, cùng thuế suất và gần ngày nhau
function clusterOf(rows) {
  const parent = new Map(rows.map((r) => [r.id, r.id]));
  const find = (x) => (parent.get(x) === x ? x : find(parent.get(x)));
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]; const c = rows[j];
      if (a.vat_rate !== c.vat_rate || Math.abs(daysBetween(a.order_date, c.order_date)) > LINK_DAYS) continue;
      if (a.product_ids.some((p) => c.product_ids.includes(p))) parent.set(find(c.id), find(a.id));
    }
  }
  const groups = new Map();
  for (const r of rows) { const k = find(r.id); groups.set(k, [...(groups.get(k) || []), r.id]); }
  return [...groups.values()].filter((g) => g.length > 1);
}

// Danh sách hóa đơn bán ngay của khách để tích chọn, kèm các nhóm hóa đơn liên quan tự tìm được.
// Có invoice_id: nhóm chứa hóa đơn đó là nhóm được chọn sẵn.
export function invoice_merge_candidates(p) {
  const b = p.book_id;
  requirePerm(b, 'ban_hang');
  let customerId = nz(p.customer_id);
  if (nz(p.invoice_id)) {
    const o = one(`select customer_id from sales_orders where id = ? and book_id = ?`, p.invoice_id, b);
    if (!o) fail('Không tìm thấy hóa đơn');
    customerId = o.customer_id;
  }
  if (!customerId) fail('Chưa chọn khách hàng');
  const rows = invoiceRows(b, customerId);
  const groups = clusterOf(rows);
  const picked = nz(p.invoice_id) ? (groups.find((g) => g.includes(p.invoice_id)) || [p.invoice_id]) : [];
  return { customer_id: customerId, invoices: rows, groups, picked };
}

// Gộp các hóa đơn đã chọn thành một đơn đặt hàng mới
export function make_order_from_invoices(p) {
  const b = p.book_id;
  requirePerm(b, 'ban_hang');
  return once(p, b, 'make_order_from_invoices', () => {
    const ids = [...new Set((Array.isArray(p.invoice_ids) ? p.invoice_ids : []).map(nz).filter(Boolean))];
    if (!ids.length) fail('Chưa chọn hóa đơn nào');
    const inv = all(`select * from sales_orders where book_id = ? and id in ${inList(ids)} order by order_date, created_at`, b, ...ids);
    if (inv.length !== ids.length) fail('Có hóa đơn không thuộc sổ này');
    for (const o of inv) {
      if (o.kind !== 'ban_san') fail(`${o.code} đã là đơn đặt hàng`);
      if (o.status === 'huy') fail(`Hóa đơn ${o.code} đã hủy`);
    }
    const base = inv[0];
    if (inv.some((o) => o.customer_id !== base.customer_id)) fail('Các hóa đơn phải cùng một khách hàng');
    if (inv.some((o) => o.vat_rate !== base.vat_rate)) fail('Các hóa đơn phải cùng thuế suất VAT mới gộp được vào một đơn');
    const others = inv.slice(1);
    const contracts = all(`select order_id, code from contracts where order_id in ${inList(ids)}`, ...ids);
    if (contracts.length > 1) fail(`Các hóa đơn đã có ${contracts.length} hợp đồng riêng (${contracts.map((k) => k.code).join(', ')}) — chỉ gộp được khi có tối đa một hợp đồng`);

    // Hóa đơn chỉ có một đợt giao: ghi rõ tiền đã thu vào đúng hóa đơn đó (như phiếu thu lập thẳng cho hóa đơn của đơn đặt hàng)
    // và chuyển thông tin in riêng của hóa đơn sang đợt giao, để sau khi gộp mỗi HD vẫn giữ số đã thu / còn nợ như trước.
    for (const o of inv) {
      const dels = all(`select id from deliveries where order_id = ?`, o.id);
      if (dels.length !== 1) continue;
      run(`update payment_allocations set delivery_id = ? where doc_type = 'don_ban' and doc_id = ? and delivery_id is null`, dels[0].id, o.id);
      run(`insert or ignore into doc_info (book_id, ref_type, ref_id, data, updated_by, updated_at)
        select book_id, 'delivery', ?, data, updated_by, updated_at from doc_info where ref_type = 'order' and ref_id = ?`, dels[0].id, o.id);
    }

    // Chuyển mọi thứ của các hóa đơn còn lại sang hóa đơn đầu tiên (hóa đơn này trở thành đơn đặt hàng)
    let lineNo = one(`select coalesce(max(line_no), 0) as n from sales_order_lines where order_id = ?`, base.id).n;
    for (const o of others) {
      for (const l of all(`select id from sales_order_lines where order_id = ? order by line_no`, o.id)) {
        run(`update sales_order_lines set order_id = ?, line_no = ? where id = ?`, base.id, ++lineNo, l.id);
      }
      for (const t of ['deliveries', 'sales_returns', 'shipments', 'driver_trips', 'quotes', 'contracts', 'order_doc_files', 'tax_invoices', 'bank_txns', 'order_promos', 'order_events']) {
        run(`update ${t} set order_id = ? where order_id = ?`, base.id, o.id);
      }
      run(`update purchase_orders set sales_order_id = ? where sales_order_id = ?`, base.id, o.id);
      run(`update payment_allocations set doc_id = ? where doc_type = 'don_ban' and doc_id = ?`, base.id, o.id);
      run(`update point_moves set doc_id = ? where doc_type = 'don_ban' and doc_id = ?`, base.id, o.id);
      run(`update vouchers set used_order_id = ? where used_order_id = ?`, base.id, o.id);
      run(`update attachments set ref_id = ? where ref_type = 'order' and ref_id = ?`, base.id, o.id);
      run(`delete from doc_info where ref_type = 'order' and ref_id = ?`, o.id);
      run(`delete from sales_orders where id = ?`, o.id);
    }

    // Đầu đơn: ngày đơn là ngày hóa đơn sớm nhất; giảm giá và phí vận chuyển cộng dồn để tổng tiền đơn đúng bằng tổng các hóa đơn
    const code = salesOrderCode(b, 'dat_hang');
    const notes = [...new Set(inv.map((o) => nz(o.note)).filter(Boolean))].join('\n') || null;
    const dues = inv.map((o) => o.due_date).filter(Boolean).sort();
    // Có hóa đơn đã xác nhận thì đơn là đơn đã xác nhận (hàng của phiếu tạm gộp vào được giữ cho đơn); toàn phiếu tạm thì đơn vẫn là phiếu tạm
    const confirmed = inv.some((o) => o.status === 'xac_nhan');
    run(`update sales_orders set kind = 'dat_hang', code = ?, status = ?, discount = ?, shipping_fee = ?, note = ?, due_date = ?,
        confirmed_at = case when ? = 'xac_nhan' then coalesce(confirmed_at, ?) end where id = ?`,
      code, confirmed ? 'xac_nhan' : 'nhap', rnd(inv.reduce((s, o) => s + o.discount, 0)), rnd(inv.reduce((s, o) => s + o.shipping_fee, 0)), notes, dues[dues.length - 1] || null, confirmed ? 'xac_nhan' : 'nhap', nowIso(), base.id);

    const v = one(`select order_total from v_sales_orders where id = ?`, base.id);
    logOrder(base.id, 'tao', `Tạo đơn đặt hàng ${code} từ ${inv.length} hóa đơn – tổng ${vnd(v.order_total)}`,
      inv.map((o) => `${o.code} · ngày ${dmy(o.order_date)}${o.status === 'nhap' ? ' · phiếu tạm' : ''}`));
    return { id: base.id, code, invoices: inv.map((o) => o.code), warnings: confirmed ? availabilityWarnings(base.id) : [] };
  });
}
