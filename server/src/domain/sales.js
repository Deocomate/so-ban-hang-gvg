// Bán hàng: đơn bán (bán sẵn / đặt riêng), xác nhận, hủy, giao hàng (trừ kho, ghi doanh thu + giá vốn), trả hàng.
import { ctx, fail, one, all, run, insert, uuid, nowIso, num, bool, nz, trimNz, rnd, asDate, today, vnd } from '../lib/context.js';
import { requirePerm, isOwner, checkDate, nextCode, salesOrderCode, once, bookSettings } from './access.js';
import { postMove, doAdjust, lineUnit } from './stock.js';
import { dropDocMoves } from './costing.js';
import { checkPriceBook, priceLevel } from './price-books.js';
import { doPayment, moveDocPayments } from './cash.js';
import { notifyOrderConfirmed } from './notify.js';
import { saveOrderTrip } from './drivers.js';
import { logOrder, orderSnapshot, describeChanges, deliveryLinesText } from './order-log.js';
import { applyPromos, revertPromos, earnPoints, returnPoints, cancelPoints } from './loyalty.js';
import { checkTxnDate, checkReturnLimit, checkEinvoiceLock } from './order-rules.js';

export function availabilityWarnings(orderId) {
  return all(`select p.sku, p.name, max(p.on_hand - coalesce(rs.reserved, 0) + x.need, 0) as avail, x.need
    from (select product_id, sum(qty) as need from v_reserve where order_id = ? group by product_id) x
    join products p on p.id = x.product_id left join v_reserve_sum rs on rs.product_id = p.id
    where p.on_hand - coalesce(rs.reserved, 0) < 0`, orderId)
    .map((r) => `${r.sku} – ${r.name}: còn có thể bán ${r.avail}, đơn cần ${r.need}`);
}

export function doDeliver(orderId, date, lines, ship, note, override, depositUsed, redo = false) {
  const o = one(`select * from sales_orders where id = ?`, orderId);
  if (!o) fail('Không tìm thấy đơn hàng');
  if (o.status === 'nhap') fail(`Đơn ${o.code} đang là nháp — hãy xác nhận đơn trước khi giao`);
  if (o.status === 'huy') fail(`Đơn ${o.code} đã hủy`);
  checkDate(o.book_id, date);
  checkTxnDate(o.book_id, 'ban_hang', date, redo ? date : null);   // giao lại sau khi tự hủy để sửa: giữ ngày giao cũ
  // Sổ cho bán vượt tồn thì ai có quyền giao hàng cũng giao được, tồn có thể âm; override giữ lại để bản giao diện cũ gửi lên không lỗi
  const allow = bookSettings(o.book_id).allow_oversell === true;

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
    if (one(`select 1 from products where id = ? and product_type = 'dich_vu'`, sl.product_id)) continue;
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

  // Như KiotViet: xử lý đơn đặt hàng tạo hóa đơn mã HD… (chung dãy với hóa đơn bán ngay); hóa đơn bán ngay chỉ có một mã HD,
  // phiếu giao của nó mang luôn mã hóa đơn (giao thêm đợt sau thì thêm hậu tố -2, -3…), không sinh mã phiếu giao riêng
  const nDel = one(`select count(*) as n from deliveries where order_id = ?`, o.id).n;
  const dcode = o.kind === 'dat_hang' ? salesOrderCode(o.book_id, 'ban_san') : nDel ? `${o.code}-${nDel + 1}` : o.code; const dlv = uuid();
  insert('deliveries', { id: dlv, book_id: o.book_id, code: dcode, order_id: o.id, delivery_date: date,
    shipping_fee: rnd(ship ?? Math.max(o.shipping_fee - shipped, 0)), note: note ?? null, deposit_used: dep, created_by: ctx.uid, created_at: nowIso() });

  let lastDl = null;
  for (const { sl, q } of req.sort((a, b) => a.sl.line_no - b.sl.line_no)) {
    const unet = rnd(sl.unit_price * (1 - sl.discount_pct / 100) * factor, 4);
    const dlid = uuid();
    insert('delivery_lines', { id: dlid, delivery_id: dlv, book_id: o.book_id, order_line_id: sl.id, product_id: sl.product_id, qty: q,
      unit_price_net: unet, revenue: rnd(q * unet), cogs: 0 });
    let cg = 0;
    const sp = one(`select is_kit, product_type, last_cost from products where id = ?`, sl.product_id);
    if (sp.product_type === 'dich_vu') {
      cg = rnd(q * sp.last_cost);                                  // dịch vụ: không trừ kho, giá vốn theo giá vốn khai ở danh mục
    } else if (sp.is_kit) {
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
  const dd = one(`select shipping_fee from deliveries where id = ?`, dlv);
  logOrder(o.id, 'giao', `Giao hàng – phiếu ${dcode}, ngày ${date.split('-').reverse().join('/')}`, [
    ...deliveryLinesText(dlv), dd.shipping_fee ? `Phí vận chuyển: ${vnd(dd.shipping_fee)}` : null, dep ? `Khấu trừ tiền cọc: ${vnd(dep)}` : null, note ? `Ghi chú: ${note}` : null].filter(Boolean));
  earnPoints(o.book_id, o.customer_id, one(`select coalesce(sum(revenue), 0) as r from delivery_lines where delivery_id = ?`, dlv).r, 'giao', dlv, dcode, date);
  return { id: dlv, code: dcode };
}

// Đơn đã giao được sửa: tính lại giá, doanh thu từng dòng đã giao theo giá / chiết khấu / giảm giá mới (cùng công thức lúc giao).
// Đơn đã giao đủ thì phí vận chuyển các đợt giao cũng được chỉnh cho khớp phí trên đơn.
// Đơn đã có phiếu trả hàng thì không đổi được doanh thu phần đã giao (phiếu trả tính theo doanh thu cũ).
function repriceDelivered(orderId) {
  const o = one(`select * from sales_orders where id = ?`, orderId);
  const gross = one(`select sum((qty - cancelled_qty) * unit_price * (1 - discount_pct / 100.0)) as g from sales_order_lines where order_id = ?`, o.id).g ?? 0;
  const factor = gross > 0 ? Math.max(0, 1 - o.discount / gross) : 1;
  const sls = Object.fromEntries(all(`select * from sales_order_lines where order_id = ?`, o.id).map((l) => [l.id, l]));
  const dls = all(`select x.*, d.delivery_date from delivery_lines x join deliveries d on d.id = x.delivery_id where d.order_id = ? order by d.created_at, x.rowid`, o.id);
  const next = dls.map((x) => { const sl = sls[x.order_line_id]; const unet = rnd(sl.unit_price * (1 - sl.discount_pct / 100) * factor, 4); return { x, unet, rev: rnd(x.qty * unet) }; });
  const done = !one(`select 1 from sales_order_lines where order_id = ? and qty - cancelled_qty - delivered_qty > 0`, o.id);
  if (done && next.length) {
    const diff = Math.max(rnd(gross - o.discount), 0) - next.reduce((s, n) => s + n.rev, 0);
    const last = next[next.length - 1];
    if (diff !== 0 && last.rev + diff >= 0) last.rev = rnd(last.rev + diff);
  }
  const changed = next.filter((n) => n.unet !== n.x.unit_price_net || n.rev !== n.x.revenue);
  if (changed.length && dls.some((x) => x.returned_qty > 0)) fail(`Đơn ${o.code} đã có phiếu trả hàng nên không đổi được giá, chiết khấu, giảm giá hay số lượng làm thay đổi tiền hàng đã giao`);
  for (const n of changed) {
    checkDate(o.book_id, n.x.delivery_date);
    run(`update delivery_lines set unit_price_net = ?, revenue = ? where id = ?`, n.unet, n.rev, n.x.id);
  }
  if (done) {
    let diff = rnd(o.shipping_fee - one(`select coalesce(sum(shipping_fee), 0) as s from deliveries where order_id = ?`, o.id).s);
    for (const d of all(`select * from deliveries where order_id = ? order by created_at desc`, o.id)) {
      if (diff === 0) break;
      const nf = Math.max(0, rnd(d.shipping_fee + diff));
      if (nf === d.shipping_fee) continue;
      checkDate(o.book_id, d.delivery_date);
      run(`update deliveries set shipping_fee = ? where id = ?`, nf, d.id);
      diff = rnd(diff - (nf - d.shipping_fee));
    }
  }
}

export function save_sales_order(p) {
  const b = p.book_id;
  requirePerm(b, 'ban_hang');
  return once(p, b, 'save_sales_order', () => {
    const d = asDate(p.order_date) || today();
    checkDate(b, d);
    if (!nz(p.id)) checkTxnDate(b, 'ban_hang', d);
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
      discount: rnd(num(p.discount) ?? 0), shipping_fee: rnd(num(p.shipping_fee) ?? 0), note: p.note ?? null, vat_rate: vat,
      price_book_id: checkPriceBook(b, nz(p.price_book_id), cust, d, (p.lines || []).map((l) => l.product_id)), price_level: priceLevel(b, p.price_level),
      ...payTermOf(p, nz(p.id) ? one(`select pay_term, pay_ratio from sales_orders where id = ? and book_id = ?`, p.id, b) : null) };
    let o; let wasConfirmed = false; let delivered = false; let before = null; let redo = null; const notices = [];
    if (!nz(p.id)) {
      const id = uuid();
      insert('sales_orders', { id, book_id: b, code: salesOrderCode(b, kind), kind, status: st, ...head, created_by: ctx.uid, created_at: nowIso(),
        confirmed_at: st === 'xac_nhan' ? nowIso() : null });
      o = one(`select * from sales_orders where id = ?`, id);
    } else {
      o = one(`select * from sales_orders where id = ? and book_id = ?`, p.id, b);
      if (!o) fail('Không tìm thấy đơn hàng');
      if (o.status === 'huy') fail('Đơn đã hủy, không thể sửa');
      checkDate(b, o.order_date);
      checkTxnDate(b, 'ban_hang', d, o.order_date);
      checkEinvoiceLock(o);
      // Đổi khách: tự chuyển phiếu thu / hoàn tiền và điểm của đơn sang khách mới, không bắt người dùng hủy phiếu trước
      if (cust.id !== o.customer_id) notices.push(...moveOrderCustomer(o, cust.id));
      // Đơn đã giao sửa giá, thêm hàng, ghi chú… thì giữ nguyên phiếu giao, chỉ tính lại doanh thu.
      // Bỏ dòng đã giao, đổi sang hàng khác hay giảm dưới số đã giao thì (như KiotViet) tự hủy các phiếu giao cũ rồi giao lại theo đơn mới.
      delivered = !!one(`select 1 from deliveries where order_id = ?`, o.id);
      if (delivered) {
        const sent = new Map((p.lines || []).filter((l) => nz(l.id)).map((l) => [l.id, l]));
        const conflicts = [];
        for (const sl of all(`select l.*, x.sku from sales_order_lines l join products x on x.id = l.product_id where l.order_id = ? and l.delivered_qty > 0`, o.id)) {
          const ln = sent.get(sl.id);
          if (!ln) { conflicts.push(`bỏ ${sl.sku}`); continue; }
          if (ln.product_id !== sl.product_id) { conflicts.push(`đổi ${sl.sku} sang hàng khác`); continue; }
          const conv = lineUnit(one(`select * from products where id = ?`, sl.product_id), ln.unit_name).unit_conv;
          if ((num(ln.qty) ?? 0) * conv < sl.delivered_qty - 1e-9) conflicts.push(`giảm ${sl.sku} dưới số đã giao (${sl.delivered_qty})`);
        }
        if (conflicts.length) {
          if (one(`select 1 from sales_returns where order_id = ?`, o.id)) fail(`Đơn ${o.code} đã có phiếu trả hàng nên không ${conflicts.join(', ')} được. Hãy dùng "Trả hàng" cho phần khách trả lại.`);
          const dels = all(`select * from deliveries where order_id = ? order by created_at`, o.id);
          redo = { full: (nz(p.kind) || o.kind) === 'ban_san' && !one(`select 1 from sales_order_lines where order_id = ? and qty - cancelled_qty - delivered_qty > 0`, o.id),
            old: new Map(all(`select id, delivered_qty from sales_order_lines where order_id = ?`, o.id).map((r) => [r.id, r.delivered_qty])),
            date: dels[dels.length - 1].delivery_date, ship: rnd(dels.reduce((t, x) => t + x.shipping_fee, 0)), dep: rnd(dels.reduce((t, x) => t + x.deposit_used, 0)),
            codes: dels.map((x) => x.code), shipments: [], trips: [] };
          for (const x of dels) {
            const u = undoDelivery(x, `Tự hủy để sửa đơn (${conflicts.join(', ')})`);
            redo.shipments.push(...u.shipments); redo.trips.push(...u.trips);
          }
          delivered = false;
        }
      }
      before = orderSnapshot(o.id);
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
      const un = lineUnit(pr, ln.unit_name);
      const price = num(ln.unit_price) ?? pr[`price${cust.price_tier}`];
      if (price < 0) fail(`Dòng ${i}: đơn giá không được âm`);
      const disc = num(ln.discount_pct) ?? 0;
      if (disc < 0 || disc > 100) fail(`Dòng ${i}: chiết khấu phải từ 0 đến 100%`);
      const polid = nz(ln.po_line_id);
      const cp = ln.custom_price ? 1 : 0;
      if (polid && pr.is_kit) fail(`Dòng ${i}: bộ sản phẩm không gắn trực tiếp với đơn đặt xưởng`);
      let lid = nz(ln.id);
      if (lid && one(`select 1 from sales_order_lines where id = ? and order_id = ?`, lid, o.id)) {
        run(`update sales_order_lines set line_no = ?, product_id = ?, qty = ?, unit_price = ?, discount_pct = ?, cancelled_qty = 0, po_line_id = ?, note = ?, unit_name = ?, unit_conv = ?, custom_price = ? where id = ?`,
          i, pr.id, q, price, disc, polid, ln.note ?? null, un.unit_name, un.unit_conv, cp, lid);
      } else {
        lid = uuid();
        insert('sales_order_lines', { id: lid, order_id: o.id, book_id: b, line_no: i, product_id: pr.id, qty: q, unit_price: price, discount_pct: disc,
          po_line_id: polid, note: ln.note ?? null, ...un, custom_price: cp });
      }
      keep.push(lid);
    }
    const ks = JSON.stringify(keep);
    run(`update purchase_order_lines set sales_order_line_id = null where sales_order_line_id in
      (select id from sales_order_lines where order_id = ? and id not in (select value from json_each(?)))`, o.id, ks);
    run(`delete from sales_order_lines where order_id = ? and id not in (select value from json_each(?))`, o.id, ks);

    // Khuyến mại, voucher, coupon, đổi điểm: máy chủ tự tính, tổng giảm của đơn = giảm tay + các khoản này
    if (p.promos !== undefined) { applyPromos(b, o, rnd(num(p.discount) ?? 0), Array.isArray(p.promos) ? p.promos : []); o = one(`select * from sales_orders where id = ?`, o.id); }
    if (redo) {
      const req = all(`select id, qty - cancelled_qty - delivered_qty as rem from sales_order_lines where order_id = ? order by line_no`, o.id)
        .map((l) => ({ order_line_id: l.id, qty: redo.full ? l.rem : Math.min(l.rem, redo.old.get(l.id) || 0) })).filter((l) => l.qty > 0);
      if (req.length) {
        if (o.status === 'nhap') { run(`update sales_orders set status = 'xac_nhan', confirmed_at = coalesce(confirmed_at, ?) where id = ?`, nowIso(), o.id); o = one(`select * from sales_orders where id = ?`, o.id); }
        const v = one(`select paid_net, deposit_used from v_sales_orders where id = ?`, o.id);
        const g = doDeliver(o.id, redo.date, req, redo.full ? null : redo.ship, null, false, Math.min(redo.dep, Math.max(rnd(v.paid_net - v.deposit_used), 0)), true);
        if (redo.shipments.length) run(`update shipments set delivery_id = ? where id in (select value from json_each(?))`, g.id, JSON.stringify(redo.shipments));
        if (redo.trips.length) run(`update driver_trips set delivery_id = ? where id in (select value from json_each(?))`, g.id, JSON.stringify(redo.trips));
        notices.push(`Đã tự hủy phiếu giao ${redo.codes.join(', ')} và giao lại theo đơn mới (phiếu ${g.code})`);
        delivered = true;
      } else notices.push(`Đã tự hủy phiếu giao ${redo.codes.join(', ')} — hàng đã nhập lại kho`);
    }
    if (delivered) repriceDelivered(o.id);
    if (before) {
      const ch = describeChanges(before, orderSnapshot(o.id));
      if (ch.length) logOrder(o.id, 'sua', `Sửa đơn${delivered ? ' (đơn đã giao)' : ''}`, ch);
    } else {
      const snap = orderSnapshot(o.id);
      logOrder(o.id, 'tao', `Tạo ${kind === 'dat_hang' ? 'đơn đặt hàng' : 'hóa đơn'} ${o.code}${st === 'xac_nhan' ? ' (đã xác nhận)' : ' (phiếu tạm)'} – tổng ${vnd(snap.total)}`,
        snap.lines.map((l) => `${l.sku} · ${l.name}: ${l.qty} ${l.unit} × ${vnd(l.unit_price)}`));
    }
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
      if (rem.some((r) => r.qty > 0)) dlv = doDeliver(o.id, asDate(p.deliver_date) || d, rem, null, null, bool(p.override) ?? false);
    }
    if (o.status === 'xac_nhan' && !wasConfirmed) notifyOrderConfirmed(o.id);
    if (notices.length) logOrder(o.id, 'sua', 'Tự động xử lý khi sửa đơn', notices);
    return { id: o.id, code: o.code, payment_code: dep?.code ?? null, delivery_code: dlv?.code ?? null, notices,
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
  logOrder(o.id, 'xac_nhan', 'Xác nhận đơn');
  notifyOrderConfirmed(o.id);
  return { ok: true, warnings: availabilityWarnings(o.id) };
}

// Nút "Lưu" trong chi tiết hóa đơn: sửa nhanh ghi chú, người bán, kênh bán mà không mở màn hình sửa đơn
export function update_order_info(p) {
  const o = one(`select * from sales_orders where id = ?`, p.id);
  if (!o) fail('Không tìm thấy đơn hàng');
  requirePerm(o.book_id, 'ban_hang');
  if (o.status === 'huy') fail('Đơn đã hủy, không thể sửa');
  const next = { note: trimNz(p.note), staff: trimNz(p.staff), channel: trimNz(p.channel), ...payTermOf(p, o) };
  const label = { note: 'Ghi chú', staff: 'Người bán', channel: 'Kênh bán', order_date: o.kind === 'dat_hang' ? 'Ngày đặt' : 'Ngày bán', pay_term: 'Hình thức thanh toán', pay_ratio: 'Tỷ lệ trả mỗi đợt (%)' };
  if (p.order_date !== undefined) next.order_date = asDate(p.order_date) || fail('Ngày không hợp lệ');
  const ch = Object.keys(next).filter((k) => (o[k] ?? null) !== next[k]);
  if (!ch.length) return { ok: true, changed: 0 };
  const moved = [];
  if (ch.includes('order_date')) {
    checkDateChange(o.book_id, o.order_date, next.order_date);
    // Hóa đơn bán ngay: các đợt giao cùng ngày bán cũ (giao ngay lúc bán) đổi ngày theo; đợt giao ngày khác giữ nguyên
    if (o.kind === 'ban_san') {
      for (const d of all(`select * from deliveries where order_id = ? and delivery_date = ?`, o.id, o.order_date)) { moveDeliveryDate(d, next.order_date); moved.push(d.code); }
    }
  }
  run(`update sales_orders set ${ch.map((k) => `${k} = ?`).join(', ')} where id = ?`, ...ch.map((k) => next[k]), o.id);
  const fmt = (k, x) => (k === 'order_date' ? x.split('-').reverse().join('/') : k === 'pay_term' ? (x === 'don_lon' ? 'Đơn hàng lớn' : 'Mặc định') : x);
  logOrder(o.id, 'sua', 'Sửa thông tin hóa đơn', [...ch.map((k) => `${label[k]}: ${o[k] ? fmt(k, o[k]) : '—'} → ${next[k] ? fmt(k, next[k]) : '—'}`),
    ...(moved.length ? [`Đổi ngày giao ${moved.join(', ')} theo ngày bán`] : [])]);
  return { ok: true, changed: ch.length };
}

// Đổi ngày chứng từ đã ghi: không vào kỳ đã khóa (cả ngày cũ lẫn ngày mới), không sang ngày tương lai, tôn trọng thiết lập khóa thời gian giao dịch
function checkDateChange(b, oldDate, date) {
  if (date > today()) fail('Ngày không được ở tương lai');
  checkDate(b, oldDate); checkDate(b, date);
  checkTxnDate(b, 'ban_hang', date, oldDate);
}

// Đổi ngày một đợt giao (hóa đơn HD): sổ kho, điểm tích lũy theo ngày mới. Sổ kho tính giá vốn theo thứ tự ghi nên giá vốn không đổi.
function moveDeliveryDate(d, date) {
  const ret = one(`select min(r.return_date) as d from sales_returns r join sales_return_lines rl on rl.return_id = r.id
    join delivery_lines x on x.id = rl.delivery_line_id where x.delivery_id = ?`, d.id)?.d;
  if (ret && date > ret) fail(`Phiếu giao ${d.code} đã có hàng trả ngày ${ret.split('-').reverse().join('/')} — ngày giao không được sau ngày trả`);
  run(`update deliveries set delivery_date = ? where id = ?`, date, d.id);
  run(`update stock_moves set move_date = ? where doc_id = ? and doc_type = 'giao'`, date, d.id);
  run(`update point_moves set move_date = ? where doc_id = ?`, date, d.id);
}

// Sửa ngày của một hóa đơn HD (đợt giao). Hóa đơn bán ngay có một đợt giao mang chính mã hóa đơn thì ngày bán đổi theo.
export function set_delivery_date(p) {
  const d = one(`select * from deliveries where id = ?`, p.id);
  if (!d) fail('Không tìm thấy hóa đơn / phiếu giao');
  const o = one(`select * from sales_orders where id = ?`, d.order_id);
  requirePerm(o.book_id, 'ban_hang');
  if (o.status === 'huy') fail('Đơn đã hủy, không thể sửa');
  const date = asDate(p.date) || fail('Ngày không hợp lệ');
  if (date === d.delivery_date) return { ok: true, changed: 0 };
  checkDateChange(o.book_id, d.delivery_date, date);
  moveDeliveryDate(d, date);
  const solo = o.kind === 'ban_san' && d.code === o.code && one(`select count(*) as n from deliveries where order_id = ?`, o.id).n === 1;
  if (solo) run(`update sales_orders set order_date = ? where id = ?`, date, o.id);
  logOrder(o.id, 'sua', `Sửa ngày hóa đơn ${d.code}`, [`${d.delivery_date.split('-').reverse().join('/')} → ${date.split('-').reverse().join('/')}`]);
  return { ok: true, changed: 1 };
}

// Hình thức thanh toán gửi lên (không gửi thì giữ như cũ / mặc định): 'mac_dinh' trừ cọc thẳng, 'don_lon' mỗi đợt trả pay_ratio %
function payTermOf(p, o = null) {
  const term = p.pay_term === undefined ? (o?.pay_term ?? 'mac_dinh') : p.pay_term;
  if (!['mac_dinh', 'don_lon'].includes(term)) fail('Hình thức thanh toán không hợp lệ');
  const ratio = p.pay_ratio === undefined || p.pay_ratio === null || p.pay_ratio === '' ? (o?.pay_ratio ?? 70) : num(p.pay_ratio);
  if (!(ratio > 0 && ratio <= 100)) fail('Tỷ lệ thanh toán mỗi đợt phải từ 1 đến 100%');
  return { pay_term: term, pay_ratio: ratio };
}

export function cancel_sales_order(p) {
  const o = one(`select * from sales_orders where id = ?`, p.id);
  if (!o) fail('Không tìm thấy đơn hàng');
  requirePerm(o.book_id, 'ban_hang');
  if (o.status === 'huy') return { ok: true };
  checkEinvoiceLock(o);
  // Như KiotViet: hủy hóa đơn đã giao thì tự hủy các phiếu giao (hàng nhập lại kho, bỏ doanh thu) rồi hủy đơn.
  // Đơn đã có phiếu trả hàng thì phải giữ lịch sử trả nên không hủy được.
  const dels = all(`select * from deliveries where order_id = ? order by created_at desc`, o.id);
  if (dels.length && one(`select 1 from sales_returns where order_id = ?`, o.id)) {
    fail(`Đơn ${o.code} đã có phiếu trả hàng nên không hủy được. Phần khách còn giữ: dùng "Trả hàng".`);
  }
  for (const d of dels) undoDelivery(d, trimNz(p.reason) ? `Hủy đơn: ${p.reason}` : 'Hủy đơn');
  run(`update sales_orders set status = 'huy', cancel_reason = ?, cancelled_at = ? where id = ?`, trimNz(p.reason), nowIso(), o.id);
  revertPromos(o.id);
  logOrder(o.id, 'huy', 'Hủy đơn', trimNz(p.reason) ? [`Lý do: ${p.reason}`] : []);
  run(`update sales_order_lines set po_line_id = null where order_id = ?`, o.id);
  run(`update purchase_order_lines set sales_order_line_id = null where sales_order_line_id in (select id from sales_order_lines where order_id = ?)`, o.id);
  const paid = one(`select paid_net from v_doc_paid where doc_id = ?`, o.id);
  return { ok: true, paid: paid?.paid_net ?? 0, deliveries: dels.map((d) => d.code) };
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
  logOrder(o.id, 'huy_con_lai', 'Hủy phần chưa giao', p.reason ? [`Lý do: ${p.reason}`] : []);
  run(`update sales_orders set note = ? where id = ?`, [o.note, (trimNz(p.reason) ? 'Hủy phần chưa giao: ' + p.reason : 'Hủy phần chưa giao')].filter((x) => x != null).join('\n'), o.id);
  return { ok: true, lines: n };
}

export function deliver(p) {
  const o = one(`select * from sales_orders where id = ?`, p.order_id);
  if (!o) fail('Không tìm thấy đơn hàng');
  requirePerm(o.book_id, 'ban_hang');
  // Tiền cọc ghi riêng ở đơn, chỉ trừ vào tổng công nợ khách: lập hóa đơn không khấu trừ cọc (bỏ qua deposit_used gửi lên)
  return once(p, o.book_id, 'deliver', () => doDeliver(o.id, asDate(p.date) || today(), p.lines || [], num(p.shipping_fee), p.note ?? null, bool(p.override) ?? false, 0));
}

// Hủy một đợt giao (giao nhầm): hàng nhập lại kho đúng giá vốn đã xuất, số đã giao của đơn giảm theo, doanh thu đợt đó bỏ đi.
// Đợt giao đã có hàng khách trả thì không hủy được. Vận đơn, chuyến lái xe gắn với đợt này được giữ lại cho đơn.
export function cancel_delivery(p) {
  const d = one(`select * from deliveries where id = ?`, p.id);
  if (!d) fail('Không tìm thấy phiếu giao');
  requirePerm(d.book_id, 'ban_hang');
  return once(p, d.book_id, 'cancel_delivery', () => {
    checkEinvoiceLock(one(`select * from sales_orders where id = ?`, d.order_id));
    undoDelivery(d, p.reason);
    return { ok: true, code: d.code };
  });
}

// Hủy hẳn một phiếu giao: hàng nhập lại kho đúng giá vốn đã xuất, số đã giao của đơn giảm, điểm tích của đợt bị trừ.
// Vận đơn / chuyến lái xe được tách ra (trả về để gắn lại nếu giao lại ngay).
function undoDelivery(d, reason) {
  checkDate(d.book_id, d.delivery_date);
  if (one(`select 1 from delivery_lines where delivery_id = ? and returned_qty > 0`, d.id)) fail(`Phiếu giao ${d.code} đã có hàng khách trả lại — không hủy được`);
  const text = deliveryLinesText(d.id);
  for (const x of all(`select * from delivery_lines where delivery_id = ?`, d.id)) {
    run(`update sales_order_lines set delivered_qty = delivered_qty - ? where id = ?`, x.qty, x.order_line_id);
  }
  // Như KiotViet: hóa đơn / phiếu giao đã hủy không còn trên thẻ kho, hàng coi như chưa từng xuất (kể cả tồn ở các ngày trước)
  dropDocMoves(d.book_id, 'giao', [d.id], d.delivery_date);
  const shipments = all(`select id from shipments where delivery_id = ?`, d.id).map((r) => r.id);
  const trips = all(`select id from driver_trips where delivery_id = ?`, d.id).map((r) => r.id);
  run(`update shipments set delivery_id = null where delivery_id = ?`, d.id);
  run(`update driver_trips set delivery_id = null where delivery_id = ?`, d.id);
  run(`delete from doc_info where ref_type = 'delivery' and ref_id = ?`, d.id);
  cancelPoints(d.id, today());
  run(`update payment_allocations set delivery_id = null where delivery_id = ?`, d.id); // tiền đã thu quay về đơn đặt
  run(`delete from deliveries where id = ?`, d.id);
  logOrder(d.order_id, 'huy_giao', `Hủy phiếu giao ${d.code} (giao ngày ${d.delivery_date.split('-').reverse().join('/')})`,
    [...(trimNz(reason) ? [`Lý do: ${reason}`] : []), ...text, 'Hàng đã nhập lại kho, doanh thu đợt này đã bỏ']);
  return { shipments, trips };
}

// Đổi khách của đơn: các phiếu thu / hoàn tiền gắn với đơn chuyển sang khách mới (phiếu còn gắn đơn khác thì tách riêng
// phần của đơn này thành phiếu mới), điểm tích / đổi điểm của đơn cũng chuyển theo. Trả về các dòng mô tả để báo người dùng.
function moveOrderCustomer(o, newCid) {
  const notes = moveDocPayments(o.book_id, 'don_ban', o.id, o.code, newCid, 'khách');
  const docs = [o.id, ...all(`select id from deliveries where order_id = ?`, o.id).map((r) => r.id),
    ...all(`select id from sales_returns where order_id = ?`, o.id).map((r) => r.id)];
  const pts = run(`update point_moves set customer_id = ? where doc_id in (select value from json_each(?))`, newCid, JSON.stringify(docs)).changes;
  if (pts) notes.push('Điểm tích lũy của đơn chuyển sang khách mới');
  return notes;
}

// Trả hàng: nhận hàng về (theo giá vốn lúc giao), giảm doanh thu, giảm công nợ, hoàn tiền nếu có
export function sales_return(p) {
  const o = one(`select * from sales_orders where id = ?`, p.order_id);
  if (!o) fail('Không tìm thấy đơn hàng');
  requirePerm(o.book_id, 'ban_hang');
  return once(p, o.book_id, 'sales_return', () => {
    const d = asDate(p.date) || today();
    checkDate(o.book_id, d);
    checkTxnDate(o.book_id, 'tra_hang', d);
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
      const prevRev = one(`select coalesce(sum(revenue + fee), 0) as s from sales_return_lines where delivery_line_id = ?`, dl.id).s;
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
      if (one(`select 1 from products where id = ? and product_type = 'dich_vu'`, dl.product_id)) cg = full ? dl.cogs - one(`select coalesce(sum(cogs), 0) as s from sales_return_lines where delivery_line_id = ? and id <> ?`, dl.id, rlid).s : rnd(dl.cogs * q / dl.qty);
      run(`update sales_return_lines set cogs = ? where id = ?`, cg, rlid);
      run(`update delivery_lines set returned_qty = returned_qty + ? where id = ?`, q, dl.id);
      run(`update sales_order_lines set returned_qty = returned_qty + ? where id = ?`, q, dl.order_line_id);
      n++;
    }
    if (!n) fail('Chưa nhập số lượng trả');
    checkReturnLimit(o.book_id, rid, d);
    // Phí trả hàng: cửa hàng giữ lại, khách được ghi giảm ít hơn. Trừ vào doanh thu giảm của từng dòng theo tỷ lệ,
    // nên doanh thu thuần, công nợ và báo cáo tự đúng mà không cần tính riêng khoản phí.
    const fee = rnd(num(p.fee) ?? 0);
    if (fee < 0) fail('Phí trả hàng không được âm');
    if (fee > 0) {
      const rl = all(`select id, revenue from sales_return_lines where return_id = ? order by rowid`, rid);
      const tot = rl.reduce((s, x) => s + x.revenue, 0);
      if (fee > tot) fail(`Phí trả hàng (${fee}) lớn hơn giá trị hàng trả (${tot})`);
      let acc = 0;
      rl.forEach((x, i) => {
        const cut = i === rl.length - 1 ? fee - acc : rnd(fee * x.revenue / tot);
        acc += cut;
        run(`update sales_return_lines set revenue = revenue - ?, fee = ? where id = ?`, cut, cut, x.id);
      });
      run(`update sales_returns set fee = ? where id = ?`, fee, rid);
    }
    returnPoints(o.book_id, o.customer_id, one(`select coalesce(sum(revenue), 0) as r from sales_return_lines where return_id = ?`, rid).r, rid, rc, d);
    const adj = loss.length ? doAdjust(o.book_id, d, 'hang_tra_loi', 'Hàng khách trả bị lỗi, không nhập lại kho – phiếu ' + rc, loss, false) : null;
    let pay = null;
    const refund = num(p.refund?.amount) ?? 0;
    if (refund > 0) {
      requirePerm(o.book_id, 'thu_chi');
      pay = doPayment(o.book_id, { kind: 'hoan_khach', date: d, fund_id: p.refund.fund_id, party_id: o.customer_id, amount: refund, method: p.refund.method,
        note: 'Hoàn tiền trả hàng ' + rc, allocations: [{ doc_type: 'don_ban', doc_id: o.id, amount: refund }] });
    }
    logOrder(o.id, 'tra_hang', `Khách trả hàng – phiếu ${rc}`, [
      ...all(`select p.sku, p.name, p.unit, l.qty, l.restock from sales_return_lines l join products p on p.id = l.product_id where l.return_id = ?`, rid)
        .map((r) => `${r.sku} · ${r.name}: ${r.qty} ${r.unit}${r.restock ? '' : ' (hàng lỗi, không nhập kho)'}`),
      fee > 0 ? `Phí trả hàng: ${vnd(fee)}` : null, p.reason ? `Lý do: ${p.reason}` : null].filter(Boolean));
    return { id: rid, code: rc, refund_code: pay?.code ?? null, loss_code: adj?.code ?? null,
      revenue: one(`select sum(revenue) as s from sales_return_lines where return_id = ?`, rid).s };
  });
}
