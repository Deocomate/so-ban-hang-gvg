// Mua hàng / đặt xưởng: đơn nhập, bước sản xuất, nhận hàng (tăng kho + giá vốn bình quân), trả hàng cho NCC.
import { ctx, fail, one, all, run, insert, uuid, nowIso, num, bool, nz, trimNz, rnd, asDate, today } from '../lib/context.js';
import { requirePerm, checkDate, nextCode, once, setting } from './access.js';
import { postMove } from './stock.js';
import { doPayment } from './cash.js';

export function doReceive(poId, date, lines, note) {
  const po = one(`select * from purchase_orders where id = ?`, poId);
  if (!po) fail('Không tìm thấy đơn nhập');
  if (po.status === 'nhap') fail(`Đơn ${po.code} đang là nháp — hãy xác nhận trước khi nhận hàng`);
  if (po.status === 'huy') fail(`Đơn ${po.code} đã hủy`);
  checkDate(po.book_id, date);
  const gc = nextCode(po.book_id, 'NK'); const gid = uuid();
  insert('goods_receipts', { id: gid, book_id: po.book_id, code: gc, po_id: po.id, receipt_date: date, note: note ?? null, created_by: ctx.uid, created_at: nowIso() });
  let n = 0;
  for (const ln of lines || []) {
    const q = num(ln.qty) ?? 0;
    if (q < 0) fail('Số lượng nhận không được âm');
    if (q === 0) continue;
    const pl = one(`select * from purchase_order_lines where id = ? and po_id = ?`, ln.po_line_id, po.id);
    if (!pl) fail(`Dòng hàng không thuộc đơn ${po.code}`);
    if (q > pl.qty - pl.cancelled_qty - pl.received_qty) fail(`Nhận vượt số lượng còn chờ (dòng ${pl.line_no}: còn ${pl.qty - pl.cancelled_qty - pl.received_qty})`);
    const uc = num(ln.unit_cost) ?? pl.unit_cost;
    if (uc < 0) fail('Giá nhập không được âm');
    const lid = uuid();
    insert('goods_receipt_lines', { id: lid, receipt_id: gid, book_id: po.book_id, po_line_id: pl.id, product_id: pl.product_id, qty: q, unit_cost: uc, value: rnd(q * uc) });
    postMove(po.book_id, pl.product_id, date, q, uc, 'nhap', gid, gc, lid, null, rnd(q * uc));
    run(`update purchase_order_lines set received_qty = received_qty + ? where id = ?`, q, pl.id);
    n++;
  }
  if (!n) fail('Chưa nhập số lượng nhận');
  return { id: gid, code: gc };
}

export function save_purchase_order(p) {
  const b = p.book_id;
  requirePerm(b, 'nhap_hang');
  return once(p, b, 'save_purchase_order', () => {
    const d = asDate(p.order_date) || today();
    checkDate(b, d);
    if (!one(`select 1 from suppliers where id = ? and book_id = ?`, p.supplier_id, b)) fail('Chưa chọn nhà cung cấp / xưởng');
    const kind = nz(p.kind) || 'mua_san';
    if (!['mua_san', 'dat_sx'].includes(kind)) fail('Loại đơn nhập không hợp lệ');
    const soid = nz(p.sales_order_id);
    if (soid && !one(`select 1 from sales_orders where id = ? and book_id = ? and status <> 'huy'`, soid, b)) fail('Đơn bán liên kết không hợp lệ');
    if (!(p.lines || []).length) fail('Đơn nhập chưa có sản phẩm');
    const steps = setting(b, 'prod_steps') || [];
    const receiveNow = bool(p.receive_now) ?? false;
    const st = receiveNow || p.status === 'xac_nhan' ? 'xac_nhan' : 'nhap';
    let po;
    if (!nz(p.id)) {
      const id = uuid();
      insert('purchase_orders', { id, book_id: b, code: nextCode(b, 'DN'), kind, status: st, supplier_id: p.supplier_id, order_date: d,
        expected_date: asDate(p.expected_date), prod_step: kind === 'dat_sx' ? (nz(p.prod_step) || steps[0] || null) : null,
        prod_step_at: kind === 'dat_sx' ? nowIso() : null, sales_order_id: soid, note: p.note ?? null, created_by: ctx.uid, created_at: nowIso(),
        confirmed_at: st === 'xac_nhan' ? nowIso() : null });
      po = one(`select * from purchase_orders where id = ?`, id);
    } else {
      po = one(`select * from purchase_orders where id = ? and book_id = ?`, p.id, b);
      if (!po) fail('Không tìm thấy đơn nhập');
      if (po.status === 'huy') fail('Đơn đã hủy');
      if (one(`select 1 from goods_receipts where po_id = ?`, po.id)) fail(`Đơn ${po.code} đã nhận hàng — không sửa được. Hãy dùng "Hủy phần chưa nhận".`);
      run(`update purchase_orders set supplier_id = ?, order_date = ?, expected_date = ?, sales_order_id = ?, note = ?,
          status = case when ? = 'xac_nhan' then 'xac_nhan' else status end,
          confirmed_at = case when ? = 'xac_nhan' and confirmed_at is null then ? else confirmed_at end where id = ?`,
        p.supplier_id, d, asDate(p.expected_date), soid, p.note ?? null, st, st, nowIso(), po.id);
      po = one(`select * from purchase_orders where id = ?`, po.id);
    }
    const keep = []; let i = 0;
    for (const ln of p.lines) {
      i++;
      const pr = one(`select * from products where id = ? and book_id = ?`, ln.product_id, b);
      if (!pr) fail(`Dòng ${i}: chưa chọn sản phẩm`);
      if (pr.is_kit) fail(`Dòng ${i}: "${pr.name}" là bộ — hãy nhập từng thành phần`);
      const q = num(ln.qty) ?? 0; const uc = num(ln.unit_cost);
      if (q <= 0) fail(`Dòng ${i}: số lượng phải lớn hơn 0`);
      if ((uc ?? -1) < 0) fail(`Dòng ${i} (${pr.sku}): chưa nhập giá nhập`);
      const sol = nz(ln.sales_order_line_id);
      if (sol && !one(`select 1 from sales_order_lines l join sales_orders o on o.id = l.order_id
          where l.id = ? and l.product_id = ? and o.book_id = ? and o.status <> 'huy'`, sol, pr.id, b)) {
        fail(`Dòng ${i}: dòng đơn bán liên kết không khớp sản phẩm`);
      }
      let lid = nz(ln.id);
      if (lid && one(`select 1 from purchase_order_lines where id = ? and po_id = ?`, lid, po.id)) {
        run(`update purchase_order_lines set line_no = ?, product_id = ?, qty = ?, unit_cost = ?, cancelled_qty = 0, sales_order_line_id = ?, note = ? where id = ?`,
          i, pr.id, q, uc, sol, ln.note ?? null, lid);
      } else {
        lid = uuid();
        insert('purchase_order_lines', { id: lid, po_id: po.id, book_id: b, line_no: i, product_id: pr.id, qty: q, unit_cost: uc, sales_order_line_id: sol, note: ln.note ?? null });
      }
      keep.push(lid);
      if (sol) run(`update sales_order_lines set po_line_id = ? where id = ?`, lid, sol);
    }
    const ks = JSON.stringify(keep);
    run(`update sales_order_lines set po_line_id = null where po_line_id in
      (select id from purchase_order_lines where po_id = ? and id not in (select value from json_each(?)))`, po.id, ks);
    run(`delete from purchase_order_lines where po_id = ? and id not in (select value from json_each(?))`, po.id, ks);

    let dep = null, rcv = null;
    const depAmt = num(p.deposit?.amount) ?? 0;
    if (depAmt > 0) {
      requirePerm(b, 'thu_chi');
      dep = doPayment(b, { kind: 'tra_ncc', date: d, fund_id: p.deposit.fund_id, party_id: po.supplier_id, amount: depAmt, method: p.deposit.method,
        note: (receiveNow ? 'Trả tiền đơn ' : 'Đặt cọc đơn ') + po.code, allocations: [{ doc_type: 'don_mua', doc_id: po.id, amount: depAmt }] });
    }
    if (receiveNow) {
      const rem = all(`select id as po_line_id, qty - cancelled_qty - received_qty as qty from purchase_order_lines where po_id = ?`, po.id);
      rcv = doReceive(po.id, asDate(p.receive_date) || d, rem, null);
    }
    return { id: po.id, code: po.code, payment_code: dep?.code ?? null, receipt_code: rcv?.code ?? null };
  });
}

const getPo = (id) => { const po = one(`select * from purchase_orders where id = ?`, id); if (!po) fail('Không tìm thấy đơn nhập'); return po; };

export function confirm_purchase_order(p) {
  const po = getPo(p.id);
  requirePerm(po.book_id, 'nhap_hang');
  if (po.status === 'huy') fail('Đơn đã hủy');
  run(`update purchase_orders set status = 'xac_nhan', confirmed_at = coalesce(confirmed_at, ?) where id = ?`, nowIso(), po.id);
  return { ok: true };
}

export function cancel_purchase_order(p) {
  const po = getPo(p.id);
  requirePerm(po.book_id, 'nhap_hang');
  if (one(`select 1 from goods_receipts where po_id = ?`, po.id)) fail(`Đơn ${po.code} đã nhận hàng. Dùng "Hủy phần chưa nhận" hoặc "Trả hàng cho NCC".`);
  if (!trimNz(p.reason)) fail('Hãy ghi lý do hủy');
  run(`update purchase_orders set status = 'huy', cancel_reason = ?, cancelled_at = ? where id = ?`, p.reason, nowIso(), po.id);
  run(`update sales_order_lines set po_line_id = null where po_line_id in (select id from purchase_order_lines where po_id = ?)`, po.id);
  return { ok: true };
}

export function cancel_po_remaining(p) {
  const po = getPo(p.id);
  requirePerm(po.book_id, 'nhap_hang');
  const n = run(`update purchase_order_lines set cancelled_qty = qty - received_qty where po_id = ? and qty - cancelled_qty - received_qty > 0`, po.id).changes;
  if (!n) fail('Không còn phần nào chưa nhận');
  run(`update purchase_orders set note = ? where id = ?`, [po.note, 'Hủy phần chưa nhận: ' + (p.reason ?? '')].filter((x) => x != null).join('\n'), po.id);
  return { ok: true };
}

export function set_prod_step(p) {
  const po = getPo(p.id);
  requirePerm(po.book_id, 'nhap_hang');
  if (!(setting(po.book_id, 'prod_steps') || []).includes(p.step)) fail(`Trạng thái sản xuất "${p.step ?? ''}" không có trong danh sách`);
  run(`update purchase_orders set prod_step = ?, prod_step_at = ? where id = ?`, p.step, nowIso(), po.id);
  return { ok: true };
}

export function receive(p) {
  const po = getPo(p.po_id);
  requirePerm(po.book_id, 'nhap_hang');
  return once(p, po.book_id, 'receive', () => doReceive(po.id, asDate(p.date) || today(), p.lines || [], p.note ?? null));
}

export function supplier_return(p) {
  const po = getPo(p.po_id);
  requirePerm(po.book_id, 'nhap_hang');
  return once(p, po.book_id, 'supplier_return', () => {
    const d = asDate(p.date) || today();
    checkDate(po.book_id, d);
    const rc = nextCode(po.book_id, 'TN'); const rid = uuid();
    insert('supplier_returns', { id: rid, book_id: po.book_id, code: rc, po_id: po.id, return_date: d, reason: p.reason ?? null, note: p.note ?? null,
      created_by: ctx.uid, created_at: nowIso() });
    let n = 0;
    for (const ln of p.lines || []) {
      const q = num(ln.qty) ?? 0;
      if (q <= 0) continue;
      const gl = one(`select x.* from goods_receipt_lines x join goods_receipts g on g.id = x.receipt_id where x.id = ? and g.po_id = ?`, ln.receipt_line_id, po.id);
      if (!gl) fail(`Dòng nhận hàng không thuộc đơn ${po.code}`);
      if (q > gl.qty - gl.returned_qty) fail(`Số lượng trả vượt số đã nhận (còn ${gl.qty - gl.returned_qty})`);
      const pr = one(`select * from products where id = ?`, gl.product_id);
      if (q > pr.on_hand) fail(`Tồn kho của ${pr.sku} chỉ còn ${pr.on_hand} — không đủ để trả nhà cung cấp`);
      const v = rnd(q * gl.unit_cost); const lid = uuid();
      insert('supplier_return_lines', { id: lid, return_id: rid, book_id: po.book_id, receipt_line_id: gl.id, product_id: gl.product_id, qty: q, unit_cost: gl.unit_cost, value: v });
      postMove(po.book_id, gl.product_id, d, -q, null, 'tra_ncc', rid, rc, lid, p.reason ?? null, v);
      run(`update goods_receipt_lines set returned_qty = returned_qty + ? where id = ?`, q, gl.id);
      run(`update purchase_order_lines set returned_qty = returned_qty + ? where id = ?`, q, gl.po_line_id);
      n++;
    }
    if (!n) fail('Chưa nhập số lượng trả');
    let pay = null;
    const refund = num(p.refund?.amount) ?? 0;
    if (refund > 0) {
      requirePerm(po.book_id, 'thu_chi');
      pay = doPayment(po.book_id, { kind: 'ncc_hoan', date: d, fund_id: p.refund.fund_id, party_id: po.supplier_id, amount: refund,
        note: 'NCC hoàn tiền trả hàng ' + rc, allocations: [{ doc_type: 'don_mua', doc_id: po.id, amount: refund }] });
    }
    return { id: rid, code: rc, refund_code: pay?.code ?? null };
  });
}
