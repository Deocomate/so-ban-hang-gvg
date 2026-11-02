// Bán hàng: đơn bán (bán sẵn / đặt riêng), xác nhận, hủy, giao hàng (trừ kho, ghi doanh thu + giá vốn), trả hàng.
import { ctx, fail, one, all, run, insert, uuid, nowIso, num, bool, nz, trimNz, rnd, asDate, today } from '../lib/context.js';
import { requirePerm, isOwner, checkDate, nextCode, once, bookSettings } from './access.js';
import { postMove, doAdjust } from './stock.js';
import { doPayment } from './cash.js';
import { notifyOrderConfirmed } from './notify.js';
import { saveOrderTrip } from './drivers.js';

export function availabilityWarnings(orderId) {
  return all(`select p.sku, p.name, max(p.on_hand - coalesce(rs.reserved, 0) + x.need, 0) as avail, x.need
    from (select product_id, sum(qty) as need from v_reserve where order_id = ? group by product_id) x
    join products p on p.id = x.product_id left join v_reserve_sum rs on rs.product_id = p.id
    where p.on_hand - coalesce(rs.reserved, 0) < 0`, orderId)
    .map((r) => `${r.sku} – ${r.name}: còn có thể bán ${r.avail}, đơn cần ${r.need}`);
}

export function doDeliver(orderId, date, lines, ship, note, override, depositUsed) {
  const o = one(`select * from sales_orders where id = ?`, orderId);
  if (!o) fail('Không tìm thấy đơn hàng');
  if (o.status === 'nhap') fail(`Đơn ${o.code} đang là nháp — hãy xác nhận đơn trước khi giao`);
  if (o.status === 'huy') fail(`Đơn ${o.code} đã hủy`);
  checkDate(o.book_id, date);
  const allow = !!override && isOwner(o.book_id) && bookSettings(o.book_id).allow_oversell === true;

  // kiểm tra số lượng giao từng dòng
  const req = [];
  for (const ln of lines || []) {
    const q = num(ln.qty) ?? 0;
    if (q < 0) fail('Số lượng giao không được âm');
    if (q === 0) continue;
    const sl = one(`select * from sales_order_lines where id = ? and order_id = ?`, ln.order_line_id, o.id);
    if (!sl) fail(`Dòng hàng không thuộc đơn ${o.code}`);
    if (q > sl.qty - sl.cancelled_qty - sl.delivered_qty) fail(`Giao vượt số lượng còn phải giao (dòng ${sl.line_no}: còn ${sl.qty - sl.cancelled_qty - sl.delivered_qty})`);
    if (one(`select 1 from products where id = ? and is_kit = 1`, sl.product_id) && !one(`select 1 from kit_items where kit_id = ?`, sl.product_id)) {
      fail(`Bộ sản phẩm ở dòng ${sl.line_no} chưa khai báo thành phần`);
    }
    req.push({ sl, q });
  }
  if (!req.length) fail('Chưa nhập số lượng giao');

  // kiểm tra tồn có thể bán (đã trừ hàng giữ cho đơn khác)
  const need = new Map();
  for (const { sl, q } of req) {
    const comps = all(`select k.component_id as pid, k.qty from kit_items k join products p on p.id = k.kit_id and p.is_kit = 1 where k.kit_id = ?`, sl.product_id);
    for (const c of comps.length ? comps : [{ pid: sl.product_id, qty: 1 }]) need.set(c.pid, (need.get(c.pid) || 0) + q * c.qty);
  }
  for (const pid of [...need.keys()].sort()) {
    const pr = one(`select * from products where id = ?`, pid);
    const avail = pr.on_hand - one(`select coalesce(sum(qty), 0) as r from v_reserve where product_id = ? and order_id <> ?`, pid, o.id).r;
    if (need.get(pid) > avail && !allow) {
      fail(`Không đủ hàng để giao: ${pr.sku} – ${pr.name} cần ${need.get(pid)}, chỉ còn ${Math.max(avail, 0)} ${pr.unit} có thể bán (đã trừ hàng giữ cho đơn khác)`);
    }
  }

  const gross = one(`select sum((qty - cancelled_qty) * unit_price * (1 - discount_pct / 100.0)) as g from sales_order_lines where order_id = ?`, o.id).g;
  const factor = (gross ?? 0) > 0 ? Math.max(0, 1 - o.discount / gross) : 1;
  const shipped = one(`select coalesce(sum(shipping_fee), 0) as s from deliveries where order_id = ?`, o.id).s;

  const dep = rnd(num(depositUsed) ?? 0);
  if (dep < 0) fail('Tiền cọc khấu trừ không được âm');
  if (dep > 0) {
    const v = one(`select paid_net, deposit_used from v_sales_orders where id = ?`, o.id);
    if (dep > v.paid_net - v.deposit_used) fail(`Tiền cọc còn lại chỉ ${Math.max(v.paid_net - v.deposit_used, 0)}`);
  }

  const dcode = nextCode(o.book_id, 'GH'); const dlv = uuid();
  insert('deliveries', { id: dlv, book_id: o.book_id, code: dcode, order_id: o.id, delivery_date: date,
    shipping_fee: rnd(ship ?? Math.max(o.shipping_fee - shipped, 0)), note: note ?? null, deposit_used: dep, created_by: ctx.uid, created_at: nowIso() });

  let lastDl = null;
  for (const { sl, q } of req.sort((a, b) => a.sl.line_no - b.sl.line_no)) {
    const unet = rnd(sl.unit_price * (1 - sl.discount_pct / 100) * factor, 4);
    const dlid = uuid();
    insert('delivery_lines', { id: dlid, delivery_id: dlv, book_id: o.book_id, order_line_id: sl.id, product_id: sl.product_id, qty: q,
      unit_price_net: unet, revenue: rnd(q * unet), cogs: 0 });
    let cg = 0;
    if (one(`select 1 from products where id = ? and is_kit = 1`, sl.product_id)) {
      for (const kc of all(`select component_id, qty from kit_items where kit_id = ? order by component_id`, sl.product_id)) {
        cg -= postMove(o.book_id, kc.component_id, date, -(q * kc.qty), null, 'giao', dlv, dcode, dlid, 'Thành phần bộ');
      }
    } else {
      cg = -postMove(o.book_id, sl.product_id, date, -q, null, 'giao', dlv, dcode, dlid, null);
    }
    run(`update delivery_lines set cogs = ? where id = ?`, cg, dlid);
    run(`update sales_order_lines set delivered_qty = delivered_qty + ? where id = ?`, q, sl.id);
    lastDl = dlid;
  }

  // Giao xong toàn bộ đơn: làm tròn để tổng doanh thu đúng bằng tiền hàng của đơn
  if (!one(`select 1 from sales_order_lines where order_id = ? and qty - cancelled_qty - delivered_qty > 0`, o.id)) {
    const total = one(`select coalesce(sum(x.revenue), 0) as t from delivery_lines x join deliveries d on d.id = x.delivery_id where d.order_id = ?`, o.id).t;
    const diff = Math.max(rnd(gross - o.discount), 0) - total;
    if (diff !== 0) run(`update delivery_lines set revenue = revenue + ? where id = ? and revenue + ? >= 0`, diff, lastDl, diff);
  }
  return { id: dlv, code: dcode };
}

export function save_sales_order(p) {
  const b = p.book_id;
  requirePerm(b, 'ban_hang');
  return once(p, b, 'save_sales_order', () => {
    const d = asDate(p.order_date) || today();
    checkDate(b, d);
    const cust = one(`select * from customers where id = ? and book_id = ?`, p.customer_id, b);
    if (!cust) fail('Chưa chọn khách hàng');
    const kind = nz(p.kind) || 'ban_san';
    if (!['ban_san', 'dat_hang'].includes(kind)) fail('Loại đơn không hợp lệ');
    if ((num(p.discount) ?? 0) < 0 || (num(p.shipping_fee) ?? 0) < 0) fail('Giảm giá / phí vận chuyển không được âm');
    const vat = num(p.vat_rate) ?? 0;
    if (vat < 0 || vat > 100) fail('Thuế suất VAT không hợp lệ');
    if (!(p.lines || []).length) fail('Đơn hàng chưa có sản phẩm');
    const deliverNow = bool(p.deliver_now) ?? false;
    const st = deliverNow || p.status === 'xac_nhan' ? 'xac_nhan' : 'nhap';
    const head = { customer_id: cust.id, channel: p.channel ?? null, order_date: d, due_date: asDate(p.due_date), staff: p.staff ?? null,
      discount: rnd(num(p.discount) ?? 0), shipping_fee: rnd(num(p.shipping_fee) ?? 0), note: p.note ?? null, vat_rate: vat };
    let o; let wasConfirmed = false;
    if (!nz(p.id)) {
      const id = uuid();
      insert('sales_orders', { id, book_id: b, code: nextCode(b, 'DH'), kind, status: st, ...head, created_by: ctx.uid, created_at: nowIso(),
        confirmed_at: st === 'xac_nhan' ? nowIso() : null });
      o = one(`select * from sales_orders where id = ?`, id);
    } else {
      o = one(`select * from sales_orders where id = ? and book_id = ?`, p.id, b);
      if (!o) fail('Không tìm thấy đơn hàng');
      if (o.status === 'huy') fail('Đơn đã hủy, không thể sửa');
      if (one(`select 1 from deliveries where order_id = ?`, o.id)) fail(`Đơn ${o.code} đã giao hàng — không sửa được. Hãy dùng "Hủy phần chưa giao" hoặc "Trả hàng".`);
      checkDate(b, o.order_date);
      wasConfirmed = o.status === 'xac_nhan';
      const keys = Object.keys(head);
      run(`update sales_orders set ${keys.map((k) => `${k} = ?`).join(', ')}, kind = ?,
          status = case when ? = 'xac_nhan' then 'xac_nhan' else status end,
          confirmed_at = case when ? = 'xac_nhan' and confirmed_at is null then ? else confirmed_at end where id = ?`,
        ...keys.map((k) => head[k]), nz(p.kind) || o.kind, st, st, nowIso(), o.id);
      o = one(`select * from sales_orders where id = ?`, o.id);
    }

    const keep = [];
    let i = 0;
    for (const ln of p.lines) {
      i++;
      const pr = one(`select * from products where id = ? and book_id = ?`, ln.product_id, b);
      if (!pr) fail(`Dòng ${i}: chưa chọn sản phẩm`);
      const q = num(ln.qty) ?? 0;
      if (q <= 0) fail(`Dòng ${i} (${pr.sku}): số lượng phải lớn hơn 0`);
      const price = num(ln.unit_price) ?? pr[`price${cust.price_tier}`];
      if (price < 0) fail(`Dòng ${i}: đơn giá không được âm`);
      const disc = num(ln.discount_pct) ?? 0;
      if (disc < 0 || disc > 100) fail(`Dòng ${i}: chiết khấu phải từ 0 đến 100%`);
      const polid = nz(ln.po_line_id);
      if (polid && pr.is_kit) fail(`Dòng ${i}: bộ sản phẩm không gắn trực tiếp với đơn đặt xưởng`);
      let lid = nz(ln.id);
      if (lid && one(`select 1 from sales_order_lines where id = ? and order_id = ?`, lid, o.id)) {
        run(`update sales_order_lines set line_no = ?, product_id = ?, qty = ?, unit_price = ?, discount_pct = ?, cancelled_qty = 0, po_line_id = ?, note = ? where id = ?`,
          i, pr.id, q, price, disc, polid, ln.note ?? null, lid);
      } else {
        lid = uuid();
        insert('sales_order_lines', { id: lid, order_id: o.id, book_id: b, line_no: i, product_id: pr.id, qty: q, unit_price: price, discount_pct: disc,
          po_line_id: polid, note: ln.note ?? null });
      }
      keep.push(lid);
    }
    const ks = JSON.stringify(keep);
    run(`update purchase_order_lines set sales_order_line_id = null where sales_order_line_id in
      (select id from sales_order_lines where order_id = ? and id not in (select value from json_each(?)))`, o.id, ks);
    run(`delete from sales_order_lines where order_id = ? and id not in (select value from json_each(?))`, o.id, ks);

    if (p.transport !== undefined) saveOrderTrip(b, o, d, p.transport);
    if (nz(p.quote_id)) {
      if (!run(`update quotes set order_id = ?, status = 'chot', updated_at = ? where id = ? and book_id = ?`, o.id, nowIso(), p.quote_id, b).changes) fail('Không tìm thấy báo giá');
    }

    let dep = null, dlv = null;
    const depAmt = num(p.deposit?.amount) ?? 0;
    if (depAmt > 0) {
      requirePerm(b, 'thu_chi');
      dep = doPayment(b, { kind: 'thu_khach', date: d, fund_id: p.deposit.fund_id, party_id: cust.id, amount: depAmt, fee: p.deposit.fee,
        method: p.deposit.method, note: (deliverNow ? 'Thu tiền đơn ' : 'Đặt cọc đơn ') + o.code,
        allocations: [{ doc_type: 'don_ban', doc_id: o.id, amount: depAmt }] });
    }
    if (deliverNow) {
      const rem = all(`select id as order_line_id, qty - cancelled_qty - delivered_qty as qty from sales_order_lines where order_id = ?`, o.id);
      dlv = doDeliver(o.id, asDate(p.deliver_date) || d, rem, null, null, bool(p.override) ?? false);
    }
    if (o.status === 'xac_nhan' && !wasConfirmed) notifyOrderConfirmed(o.id);
    return { id: o.id, code: o.code, payment_code: dep?.code ?? null, delivery_code: dlv?.code ?? null,
      warnings: st === 'xac_nhan' && !deliverNow ? availabilityWarnings(o.id) : [] };
  });
}

export function confirm_sales_order(p) {
  const o = one(`select * from sales_orders where id = ?`, p.id);
  if (!o) fail('Không tìm thấy đơn hàng');
  requirePerm(o.book_id, 'ban_hang');
  if (o.status === 'xac_nhan') return { ok: true, warnings: availabilityWarnings(o.id) };
  if (o.status !== 'nhap') fail('Đơn đã hủy');
  run(`update sales_orders set status = 'xac_nhan', confirmed_at = ? where id = ?`, nowIso(), o.id);
  notifyOrderConfirmed(o.id);
  return { ok: true, warnings: availabilityWarnings(o.id) };
}

export function cancel_sales_order(p) {
  const o = one(`select * from sales_orders where id = ?`, p.id);
  if (!o) fail('Không tìm thấy đơn hàng');
  requirePerm(o.book_id, 'ban_hang');
  if (o.status === 'huy') return { ok: true };
  if (one(`select 1 from deliveries where order_id = ?`, o.id)) {
    fail(`Đơn ${o.code} đã giao hàng nên không hủy được. Phần đã giao: dùng "Trả hàng". Phần chưa giao: dùng "Hủy phần chưa giao".`);
  }
  if (!trimNz(p.reason)) fail('Hãy ghi lý do hủy đơn');
  run(`update sales_orders set status = 'huy', cancel_reason = ?, cancelled_at = ? where id = ?`, p.reason, nowIso(), o.id);
  run(`update sales_order_lines set po_line_id = null where order_id = ?`, o.id);
  run(`update purchase_order_lines set sales_order_line_id = null where sales_order_line_id in (select id from sales_order_lines where order_id = ?)`, o.id);
  const paid = one(`select paid_net from v_doc_paid where doc_id = ?`, o.id);
  return { ok: true, paid: paid?.paid_net ?? 0 };
}

// Hủy phần chưa giao (từng dòng hoặc toàn bộ)
export function cancel_remaining(p) {
  const o = one(`select * from sales_orders where id = ?`, p.id);
  if (!o) fail('Không tìm thấy đơn hàng');
  requirePerm(o.book_id, 'ban_hang');
  if (o.status !== 'xac_nhan') fail('Chỉ áp dụng cho đơn đã xác nhận');
  let n = 0;
  if (!(p.lines || []).length) {
    n = run(`update sales_order_lines set cancelled_qty = qty - delivered_qty where order_id = ? and qty - cancelled_qty - delivered_qty > 0`, o.id).changes;
  } else {
    for (const ln of p.lines) {
      const q = num(ln.qty) ?? 0;
      if (q <= 0) continue;
      const sl = one(`select * from sales_order_lines where id = ? and order_id = ?`, ln.order_line_id, o.id);
      if (!sl) fail('Dòng không thuộc đơn');
      if (q > sl.qty - sl.cancelled_qty - sl.delivered_qty) fail(`Số lượng hủy vượt phần chưa giao (dòng ${sl.line_no})`);
      run(`update sales_order_lines set cancelled_qty = cancelled_qty + ? where id = ?`, q, sl.id);
      n++;
    }
  }
  if (!n) fail('Không còn phần nào chưa giao để hủy');
  run(`update sales_orders set note = ? where id = ?`, [o.note, 'Hủy phần chưa giao: ' + (p.reason ?? '')].filter((x) => x != null).join('\n'), o.id);
  return { ok: true, lines: n };
}

export function deliver(p) {
  const o = one(`select * from sales_orders where id = ?`, p.order_id);
  if (!o) fail('Không tìm thấy đơn hàng');
  requirePerm(o.book_id, 'ban_hang');
  return once(p, o.book_id, 'deliver', () => doDeliver(o.id, asDate(p.date) || today(), p.lines || [], num(p.shipping_fee), p.note ?? null, bool(p.override) ?? false, p.deposit_used));
}

// Trả hàng: nhận hàng về (theo giá vốn lúc giao), giảm doanh thu, giảm công nợ, hoàn tiền nếu có
export function sales_return(p) {
  const o = one(`select * from sales_orders where id = ?`, p.order_id);
  if (!o) fail('Không tìm thấy đơn hàng');
  requirePerm(o.book_id, 'ban_hang');
  return once(p, o.book_id, 'sales_return', () => {
    const d = asDate(p.date) || today();
    checkDate(o.book_id, d);
    const rc = nextCode(o.book_id, 'TL'); const rid = uuid();
    insert('sales_returns', { id: rid, book_id: o.book_id, code: rc, order_id: o.id, return_date: d, reason: p.reason ?? null, note: p.note ?? null,
      created_by: ctx.uid, created_at: nowIso() });
    const loss = []; let n = 0;
    for (const ln of p.lines || []) {
      const q = num(ln.qty) ?? 0;
      if (q <= 0) continue;
      const restock = bool(ln.restock) ?? true;
      const dl = one(`select x.* from delivery_lines x join deliveries dd on dd.id = x.delivery_id where x.id = ? and dd.order_id = ?`, ln.delivery_line_id, o.id);
      if (!dl) fail(`Dòng giao hàng không thuộc đơn ${o.code}`);
      if (q > dl.qty - dl.returned_qty) fail(`Số lượng trả vượt số đã giao chưa trả (còn ${dl.qty - dl.returned_qty})`);
      const full = q === dl.qty - dl.returned_qty;
      const prevRev = one(`select coalesce(sum(revenue), 0) as s from sales_return_lines where delivery_line_id = ?`, dl.id).s;
      const rev = full ? dl.revenue - prevRev : rnd(dl.revenue * q / dl.qty);
      const rlid = uuid();
      insert('sales_return_lines', { id: rlid, return_id: rid, book_id: o.book_id, delivery_line_id: dl.id, product_id: dl.product_id, qty: q,
        revenue: rev, cogs: 0, restock: restock ? 1 : 0 });
      let cg = 0;
      for (const m of all(`select product_id, sum(qty) as qty, sum(value) as value from stock_moves
          where doc_type = 'giao' and line_id = ? and qty < 0 group by product_id order by product_id`, dl.id)) {
        const cq = -m.qty * q / dl.qty;
        let cv;
        if (full) {
          const prev = one(`select coalesce(sum(sm.value), 0) as s from stock_moves sm join sales_return_lines srl on srl.id = sm.line_id
            where sm.doc_type = 'tra_hang' and srl.delivery_line_id = ? and sm.product_id = ? and srl.id <> ?`, dl.id, m.product_id, rlid).s;
          cv = -m.value - prev;
        } else cv = rnd(-m.value * q / dl.qty);
        const v = postMove(o.book_id, m.product_id, d, cq, null, 'tra_hang', rid, rc, rlid, p.reason ?? null, cv);
        cg += v;
        if (!restock) loss.push({ product_id: m.product_id, qty_delta: -cq, value: v });
      }
      run(`update sales_return_lines set cogs = ? where id = ?`, cg, rlid);
      run(`update delivery_lines set returned_qty = returned_qty + ? where id = ?`, q, dl.id);
      run(`update sales_order_lines set returned_qty = returned_qty + ? where id = ?`, q, dl.order_line_id);
      n++;
    }
    if (!n) fail('Chưa nhập số lượng trả');
    const adj = loss.length ? doAdjust(o.book_id, d, 'hang_tra_loi', 'Hàng khách trả bị lỗi, không nhập lại kho – phiếu ' + rc, loss, false) : null;
    let pay = null;
    const refund = num(p.refund?.amount) ?? 0;
    if (refund > 0) {
      requirePerm(o.book_id, 'thu_chi');
      pay = doPayment(o.book_id, { kind: 'hoan_khach', date: d, fund_id: p.refund.fund_id, party_id: o.customer_id, amount: refund, method: p.refund.method,
        note: 'Hoàn tiền trả hàng ' + rc, allocations: [{ doc_type: 'don_ban', doc_id: o.id, amount: refund }] });
    }
    return { id: rid, code: rc, refund_code: pay?.code ?? null, loss_code: adj?.code ?? null,
      revenue: one(`select sum(revenue) as s from sales_return_lines where return_id = ?`, rid).s };
  });
}
