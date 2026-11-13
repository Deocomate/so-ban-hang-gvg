// Mua hàng theo kiểu KiotViet: phiếu nhập hàng (PN, lưu tạm hoặc hoàn thành là vào kho), đặt hàng nhập / đặt xưởng (DN, nhận nhiều đợt),
// giảm giá dòng và cả phiếu, hủy phiếu nhập, trả hàng nhập theo phiếu hoặc lập riêng theo nhà cung cấp.
import { ctx, fail, one, all, run, val, insert, uuid, nowIso, num, bool, nz, trimNz, rnd, asDate, today, vnd } from '../lib/context.js';
import { checkTxnDate } from './order-rules.js';
import { requirePerm, checkDate, nextCode, once, setting, bookSettings } from './access.js';
import { postMove, lineUnit, avgCost } from './stock.js';
import { doPayment } from './cash.js';

// Chi phí nhập hàng (phí vận chuyển, bốc xếp, lưu kho…): [{name, amount, payer: 'ncc' | 'khac'}].
// Chia vào từng dòng theo giá trị hàng → cộng vào giá vốn nhập kho. Phần NCC thu hộ cộng vào công nợ phải trả NCC;
// phần trả bên khác ghi bằng phiếu chi riêng (không tính hai lần vào chi phí).
function extraCostsOf(b, list) {
  const items = (Array.isArray(list) ? list : []).map((x) => ({ name: trimNz(x.name), amount: rnd(num(x.amount) ?? 0), payer: x.payer === 'ncc' ? 'ncc' : 'khac' })).filter((x) => x.amount);
  if (!items.length) return [];
  if (!bookSettings(b).po_costs) fail('Sổ chưa bật Quản lý chi phí nhập hàng (Thiết lập → Mua hàng)');
  for (const x of items) { if (!x.name) fail('Ghi tên khoản chi phí nhập hàng'); if (x.amount < 0) fail('Chi phí nhập hàng không được âm'); }
  return items;
}

export function doReceive(poId, date, lines, note, extraCosts) {
  const po = one(`select * from purchase_orders where id = ?`, poId);
  if (!po) fail('Không tìm thấy đơn nhập');
  if (po.status === 'nhap') fail(`Đơn ${po.code} đang là nháp — hãy xác nhận trước khi nhận hàng`);
  if (po.status === 'huy') fail(`Đơn ${po.code} đã hủy`);
  checkDate(po.book_id, date);
  checkTxnDate(po.book_id, 'nhap_hang', date);
  const gc = nextCode(po.book_id, 'NK'); const gid = uuid();
  const extras = extraCostsOf(po.book_id, extraCosts);
  insert('goods_receipts', { id: gid, book_id: po.book_id, code: gc, po_id: po.id, receipt_date: date, note: note ?? null, created_by: ctx.uid, created_at: nowIso(),
    extra_costs: JSON.stringify(extras) });
  // Chia chi phí theo giá trị từng dòng; dòng cuối nhận phần lẻ
  const rows = (lines || []).map((ln) => ({ ln, q: num(ln.qty) ?? 0 })).filter((r) => r.q > 0);
  const pls = rows.map((r) => one(`select * from purchase_order_lines where id = ? and po_id = ?`, r.ln.po_line_id, po.id));
  const vals = rows.map((r, i) => r.q * (num(r.ln.unit_cost) ?? pls[i]?.unit_cost ?? 0));
  const gross = vals.reduce((s, v) => s + v, 0);
  const share = (tot) => { let acc = 0; return vals.map((v, i) => { const x = i === vals.length - 1 ? rnd(tot - acc) : rnd(gross ? tot * v / gross : tot / vals.length); acc += x; return x; }); };
  const allX = share(extras.reduce((s, x) => s + x.amount, 0)); const nccX = share(extras.filter((x) => x.payer === 'ncc').reduce((s, x) => s + x.amount, 0));
  let n = 0; let ri = -1;
  for (const ln of lines || []) {
    const q = num(ln.qty) ?? 0;
    if (q < 0) fail('Số lượng nhận không được âm');
    if (q === 0) continue;
    const pl = one(`select * from purchase_order_lines where id = ? and po_id = ?`, ln.po_line_id, po.id);
    if (!pl) fail(`Dòng hàng không thuộc đơn ${po.code}`);
    if (q > pl.qty - pl.cancelled_qty - pl.received_qty) fail(`Nhận vượt số lượng còn chờ (dòng ${pl.line_no}: còn ${pl.qty - pl.cancelled_qty - pl.received_qty})`);
    const uc = num(ln.unit_cost) ?? pl.unit_cost;
    if (uc < 0) fail('Giá nhập không được âm');
    const lid = uuid(); ri++;
    const ex = allX[ri] ?? 0; const exN = nccX[ri] ?? 0;
    insert('goods_receipt_lines', { id: lid, receipt_id: gid, book_id: po.book_id, po_line_id: pl.id, product_id: pl.product_id, qty: q, unit_cost: uc, value: rnd(q * uc) + exN, extra_cost: ex });
    postMove(po.book_id, pl.product_id, date, q, uc, 'nhap', gid, gc, lid, null, rnd(q * uc) + ex);
    run(`update purchase_order_lines set received_qty = received_qty + ? where id = ?`, q, pl.id);
    n++;
  }
  if (!n) fail('Chưa nhập số lượng nhận');
  return { id: gid, code: gc };
}

// Giá dòng gửi lên theo đơn vị cơ bản: unit_price (đơn giá), discount (giảm giá mỗi đơn vị). Giảm giá cả phiếu chia theo giá trị
// vào giá nhập từng dòng (unit_cost), nên tồn kho, giá vốn và công nợ NCC đều theo số đã giảm. Ứng dụng cũ chỉ gửi unit_cost.
function priceLines(lines, discount) {
  const rows = lines.map((ln, i) => {
    const q = num(ln.qty) ?? 0;
    const up = num(ln.unit_price) ?? num(ln.unit_cost);
    const dc = num(ln.discount) ?? 0;
    if ((up ?? -1) < 0) fail(`Dòng ${i + 1}: chưa nhập giá nhập`);
    if (dc < 0) fail(`Dòng ${i + 1}: giảm giá không được âm`);
    if (dc > up) fail(`Dòng ${i + 1}: giảm giá lớn hơn đơn giá`);
    return { q, up, dc, net: up - dc };
  });
  const gross = rows.reduce((s, r) => s + r.q * r.net, 0);
  const d = num(discount) ?? 0;
  if (d < 0) fail('Giảm giá không được âm');
  if (d > rnd(gross)) fail('Giảm giá lớn hơn tổng tiền hàng');
  const k = gross > 0 ? (gross - d) / gross : 1;
  return { rows: rows.map((r) => ({ ...r, cost: r.net * k })), discount: d };
}

export function save_purchase_order(p) {
  const b = p.book_id;
  requirePerm(b, 'nhap_hang');
  return once(p, b, 'save_purchase_order', () => {
    const d = asDate(p.order_date) || today();
    checkDate(b, d);
    if (!one(`select 1 from suppliers where id = ? and book_id = ?`, p.supplier_id, b)) fail('Chưa chọn nhà cung cấp / xưởng');
    const receiveNow = bool(p.receive_now) ?? false;
    const old = nz(p.id) ? one(`select * from purchase_orders where id = ? and book_id = ?`, p.id, b) : null;
    if (nz(p.id) && !old) fail('Không tìm thấy đơn nhập');
    const mode = old ? old.mode : (['dat', 'nhap'].includes(p.mode) ? p.mode : receiveNow ? 'nhap' : 'dat');
    const kind = mode === 'nhap' ? 'mua_san' : (nz(p.kind) || old?.kind || 'mua_san');
    if (!['mua_san', 'dat_sx'].includes(kind)) fail('Loại đơn nhập không hợp lệ');
    if (receiveNow && kind === 'dat_sx') fail('Đơn đặt xưởng nhận hàng khi xưởng giao, không nhập kho ngay được');
    const soid = nz(p.sales_order_id);
    if (soid && !one(`select 1 from sales_orders where id = ? and book_id = ? and status <> 'huy'`, soid, b)) fail('Đơn bán liên kết không hợp lệ');
    if (!(p.lines || []).length) fail(mode === 'nhap' ? 'Phiếu nhập chưa có hàng hóa' : 'Đơn nhập chưa có sản phẩm');
    const priced = priceLines(p.lines, p.discount);
    const steps = setting(b, 'prod_steps') || [];
    const st = receiveNow || p.status === 'xac_nhan' ? 'xac_nhan' : 'nhap';
    const invoiceNo = trimNz(p.invoice_no);
    let po;
    if (!old) {
      const id = uuid();
      insert('purchase_orders', { id, book_id: b, code: nextCode(b, mode === 'nhap' ? 'PN' : 'DN'), kind, mode, status: st, supplier_id: p.supplier_id, order_date: d,
        expected_date: asDate(p.expected_date), prod_step: kind === 'dat_sx' ? (nz(p.prod_step) || steps[0] || null) : null,
        prod_step_at: kind === 'dat_sx' ? nowIso() : null, sales_order_id: soid, discount: priced.discount, invoice_no: invoiceNo,
        note: p.note ?? null, created_by: ctx.uid, created_at: nowIso(), confirmed_at: st === 'xac_nhan' ? nowIso() : null });
      po = one(`select * from purchase_orders where id = ?`, id);
    } else {
      po = old;
      if (po.status === 'huy') fail('Đơn đã hủy');
      if (one(`select 1 from goods_receipts where po_id = ? and cancelled_at is null`, po.id)) fail(`Đơn ${po.code} đã nhận hàng — không sửa được. Hãy dùng "Hủy phần chưa nhận".`);
      run(`update purchase_orders set supplier_id = ?, order_date = ?, expected_date = ?, sales_order_id = ?, note = ?, discount = ?, invoice_no = ?,
          status = case when ? = 'xac_nhan' then 'xac_nhan' else status end,
          confirmed_at = case when ? = 'xac_nhan' and confirmed_at is null then ? else confirmed_at end where id = ?`,
        p.supplier_id, d, asDate(p.expected_date), soid, p.note ?? null, priced.discount, invoiceNo, st, st, nowIso(), po.id);
      po = one(`select * from purchase_orders where id = ?`, po.id);
    }
    const keep = []; let i = 0;
    for (const ln of p.lines) {
      const pc = priced.rows[i]; i++;
      const pr = one(`select * from products where id = ? and book_id = ?`, ln.product_id, b);
      if (!pr) fail(`Dòng ${i}: chưa chọn sản phẩm`);
      if (pr.is_kit) fail(`Dòng ${i}: "${pr.name}" là bộ — hãy nhập từng thành phần`);
      if (pr.product_type === 'dich_vu') fail(`Dòng ${i}: "${pr.name}" là dịch vụ — hãy dùng phiếu Mua dịch vụ`);
      const un = lineUnit(pr, ln.unit_name);
      if (pc.q <= 0) fail(`Dòng ${i}: số lượng phải lớn hơn 0`);
      const sol = nz(ln.sales_order_line_id);
      if (sol && !one(`select 1 from sales_order_lines l join sales_orders o on o.id = l.order_id
          where l.id = ? and l.product_id = ? and o.book_id = ? and o.status <> 'huy'`, sol, pr.id, b)) {
        fail(`Dòng ${i}: dòng đơn bán liên kết không khớp sản phẩm`);
      }
      const cols = { line_no: i, product_id: pr.id, qty: pc.q, unit_cost: pc.cost, unit_price: pc.up, discount: pc.dc, sales_order_line_id: sol, note: trimNz(ln.note), ...un };
      let lid = nz(ln.id);
      if (lid && one(`select 1 from purchase_order_lines where id = ? and po_id = ?`, lid, po.id)) {
        run(`update purchase_order_lines set line_no = ?, product_id = ?, qty = ?, unit_cost = ?, unit_price = ?, discount = ?, cancelled_qty = 0,
            sales_order_line_id = ?, note = ?, unit_name = ?, unit_conv = ? where id = ?`,
          cols.line_no, cols.product_id, cols.qty, cols.unit_cost, cols.unit_price, cols.discount, cols.sales_order_line_id, cols.note, cols.unit_name, cols.unit_conv, lid);
      } else {
        lid = uuid();
        insert('purchase_order_lines', { id: lid, po_id: po.id, book_id: b, ...cols });
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
        note: (receiveNow ? 'Trả tiền ' : 'Đặt cọc ') + (mode === 'nhap' ? 'phiếu nhập ' : 'đơn ') + po.code, allocations: [{ doc_type: 'don_mua', doc_id: po.id, amount: depAmt }] });
    }
    if (receiveNow) {
      const rem = all(`select id as po_line_id, qty - cancelled_qty - received_qty as qty from purchase_order_lines where po_id = ?`, po.id);
      rcv = doReceive(po.id, asDate(p.receive_date) || d, rem, null, p.extra_costs);
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

// Hủy một phiếu nhận hàng đã vào kho: xuất lại đúng giá trị đã nhập, số đã nhận của đơn giảm theo
function doCancelReceipt(g, reason) {
  checkDate(g.book_id, today());
  if (one(`select 1 from supplier_return_lines l join supplier_returns r on r.id = l.return_id join goods_receipt_lines x on x.id = l.receipt_line_id
      where x.receipt_id = ? and r.cancelled_at is null`, g.id)) fail(`Phiếu ${g.code} đã có phiếu trả hàng nhập — hãy hủy phiếu trả trước`);
  for (const l of all(`select * from goods_receipt_lines where receipt_id = ?`, g.id)) {
    const pr = one(`select sku, on_hand from products where id = ?`, l.product_id);
    if (pr.on_hand < l.qty) fail(`Tồn kho của ${pr.sku} chỉ còn ${pr.on_hand}, không đủ để hủy phiếu nhập ${g.code} (đã nhập ${l.qty})`);
    postMove(g.book_id, l.product_id, today(), -l.qty, null, 'nhap', g.id, g.code, l.id, 'Hủy phiếu nhập ' + g.code, rnd(l.qty * l.unit_cost) + l.extra_cost);
    run(`update purchase_order_lines set received_qty = received_qty - ? where id = ?`, l.qty, l.po_line_id);
  }
  run(`update goods_receipts set cancelled_at = ?, cancel_reason = ? where id = ?`, nowIso(), reason, g.id);
}

export function cancel_purchase_order(p) {
  const po = getPo(p.id);
  requirePerm(po.book_id, 'nhap_hang');
  if (po.status === 'huy') fail('Đơn đã hủy');
  if (!trimNz(p.reason)) fail('Hãy ghi lý do hủy');
  const recs = all(`select * from goods_receipts where po_id = ? and cancelled_at is null order by created_at desc`, po.id);
  if (recs.length) {
    if (po.mode !== 'nhap') fail(`Đơn ${po.code} đã nhận hàng. Dùng "Hủy phần chưa nhận", hủy từng phiếu nhập hoặc "Trả hàng nhập".`);
    const paid = val(`select paid_net from v_purchase_orders where id = ?`, po.id) || 0;
    if (paid !== 0) fail(`Phiếu ${po.code} đã ghi trả NCC ${vnd(paid)} — hãy hủy phiếu chi trước`);
    for (const g of recs) doCancelReceipt(g, p.reason);
  }
  run(`update purchase_orders set status = 'huy', cancel_reason = ?, cancelled_at = ? where id = ?`, p.reason, nowIso(), po.id);
  run(`update sales_order_lines set po_line_id = null where po_line_id in (select id from purchase_order_lines where po_id = ?)`, po.id);
  return { ok: true };
}

// Hủy một phiếu nhập: phiếu nhập thẳng thì hủy cả phiếu, phiếu nhận theo đơn đặt thì đơn quay lại chờ hàng
export function cancel_receipt(p) {
  const g = one(`select * from goods_receipts where id = ?`, p.id);
  if (!g) fail('Không tìm thấy phiếu nhập');
  const po = getPo(g.po_id);
  if (po.mode === 'nhap') return cancel_purchase_order({ id: po.id, reason: p.reason });
  requirePerm(g.book_id, 'nhap_hang');
  if (g.cancelled_at) fail(`Phiếu ${g.code} đã hủy`);
  if (!trimNz(p.reason)) fail('Hãy ghi lý do hủy');
  doCancelReceipt(g, p.reason);
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
  return once(p, po.book_id, 'receive', () => doReceive(po.id, asDate(p.date) || today(), p.lines || [], p.note ?? null, p.extra_costs));
}

// Trả hàng nhập: theo phiếu nhập (po_id, mỗi dòng chọn receipt_line_id, xuất kho đúng giá đã nhập)
// hoặc lập riêng theo nhà cung cấp (supplier_id, mỗi dòng chọn product_id, xuất kho theo giá vốn bình quân).
// Giá trả lại (unit_price) là số NCC phải trả lại, mặc định bằng giá nhập; giảm giá cả phiếu trừ vào số đó.
export function supplier_return(p) {
  const po = nz(p.po_id) ? getPo(p.po_id) : null;
  const b = po ? po.book_id : p.book_id;
  requirePerm(b, 'nhap_hang');
  const supplierId = po ? po.supplier_id : p.supplier_id;
  if (!one(`select 1 from suppliers where id = ? and book_id = ?`, supplierId, b)) fail('Chưa chọn nhà cung cấp');
  return once(p, b, 'supplier_return', () => {
    const d = asDate(p.date) || today();
    checkDate(b, d);
    checkTxnDate(b, 'tra_ncc', d);
    const used = {}; const items = [];
    for (const ln of p.lines || []) {
      const q = num(ln.qty) ?? 0;
      if (q < 0) fail('Số lượng trả không được âm');
      if (q === 0) continue;
      let gl = null, pr, cost;
      if (nz(ln.receipt_line_id)) {
        if (!po) fail('Dòng theo phiếu nhập phải lập từ phiếu nhập đó');
        gl = one(`select x.* from goods_receipt_lines x join goods_receipts g on g.id = x.receipt_id where x.id = ? and g.po_id = ? and g.cancelled_at is null`, ln.receipt_line_id, po.id);
        if (!gl) fail(`Dòng nhận hàng không thuộc đơn ${po.code}`);
        if (q > gl.qty - gl.returned_qty) fail(`Số lượng trả vượt số đã nhận (còn ${gl.qty - gl.returned_qty})`);
        pr = one(`select * from products where id = ?`, gl.product_id);
        cost = gl.unit_cost;
      } else {
        if (po) fail(`Chọn hàng trả từ các dòng đã nhận của ${po.code}`);
        pr = one(`select * from products where id = ? and book_id = ?`, ln.product_id, b);
        if (!pr) fail('Chưa chọn hàng trả');
        if (pr.is_kit || pr.product_type === 'dich_vu') fail(`"${pr.name}" không quản lý tồn kho, không trả hàng nhập được`);
        cost = avgCost(pr);
      }
      used[pr.id] = (used[pr.id] || 0) + q;
      if (used[pr.id] > pr.on_hand) fail(`Tồn kho của ${pr.sku} chỉ còn ${pr.on_hand} — không đủ để trả nhà cung cấp`);
      const price = num(ln.unit_price) ?? cost;
      if (price < 0) fail(`${pr.sku}: giá trả lại không được âm`);
      items.push({ gl, pr, q, price, cost });
    }
    if (!items.length) fail('Chưa nhập số lượng trả');
    const gross = items.reduce((s, x) => s + x.q * x.price, 0);
    const disc = num(p.discount) ?? 0;
    if (disc < 0) fail('Giảm giá không được âm');
    if (disc > rnd(gross)) fail('Giảm giá lớn hơn tổng tiền hàng trả');
    const target = rnd(gross - disc); const k = gross > 0 ? (gross - disc) / gross : 0;
    let acc = 0;
    items.forEach((x, i) => { x.value = i === items.length - 1 ? target - acc : rnd(x.q * x.price * k); acc += x.value; });

    const rc = nextCode(b, 'TN'); const rid = uuid();
    insert('supplier_returns', { id: rid, book_id: b, code: rc, po_id: po?.id ?? null, supplier_id: supplierId, return_date: d, reason: trimNz(p.reason), note: trimNz(p.note),
      discount: disc, created_by: ctx.uid, created_at: nowIso() });
    for (const x of items) {
      const lid = uuid();
      const v = -postMove(b, x.pr.id, d, -x.q, null, 'tra_ncc', rid, rc, lid, trimNz(p.reason), x.gl ? rnd(x.q * x.cost) : null);
      insert('supplier_return_lines', { id: lid, return_id: rid, book_id: b, receipt_line_id: x.gl?.id ?? null, product_id: x.pr.id, qty: x.q,
        unit_cost: v / x.q, unit_price: x.price, value: x.value, cost_value: v });
      if (x.gl) {
        run(`update goods_receipt_lines set returned_qty = returned_qty + ? where id = ?`, x.q, x.gl.id);
        run(`update purchase_order_lines set returned_qty = returned_qty + ? where id = ?`, x.q, x.gl.po_line_id);
      }
    }
    let pay = null;
    const refund = num(p.refund?.amount) ?? 0;
    if (refund > 0) {
      requirePerm(b, 'thu_chi');
      pay = doPayment(b, { kind: 'ncc_hoan', date: d, fund_id: p.refund.fund_id, party_id: supplierId, amount: refund, method: p.refund.method,
        note: 'NCC hoàn tiền trả hàng ' + rc, allocations: po ? [{ doc_type: 'don_mua', doc_id: po.id, amount: refund }] : [] });
      run(`update supplier_returns set refund_payment_id = ? where id = ?`, pay.id, rid);
    }
    return { id: rid, code: rc, refund_code: pay?.code ?? null };
  });
}

// Hủy phiếu trả hàng nhập: nhập lại kho đúng giá trị đã xuất, công nợ NCC trở lại như trước
export function cancel_supplier_return(p) {
  const r = one(`select * from supplier_returns where id = ?`, p.id);
  if (!r) fail('Không tìm thấy phiếu trả hàng nhập');
  requirePerm(r.book_id, 'nhap_hang');
  if (r.cancelled_at) fail(`Phiếu ${r.code} đã hủy`);
  if (!trimNz(p.reason)) fail('Hãy ghi lý do hủy');
  const pay = r.refund_payment_id ? one(`select code, voided from payments where id = ?`, r.refund_payment_id) : null;
  if (pay && !pay.voided) fail(`Hãy hủy phiếu thu ${pay.code} (NCC hoàn tiền) trước`);
  checkDate(r.book_id, today());
  for (const l of all(`select * from supplier_return_lines where return_id = ?`, r.id)) {
    postMove(r.book_id, l.product_id, today(), l.qty, null, 'tra_ncc', r.id, r.code, l.id, 'Hủy phiếu trả ' + r.code, l.cost_value);
    if (l.receipt_line_id) {
      const gl = one(`select po_line_id from goods_receipt_lines where id = ?`, l.receipt_line_id);
      run(`update goods_receipt_lines set returned_qty = returned_qty - ? where id = ?`, l.qty, l.receipt_line_id);
      run(`update purchase_order_lines set returned_qty = returned_qty - ? where id = ?`, l.qty, gl.po_line_id);
    }
  }
  run(`update supplier_returns set cancelled_at = ?, cancel_reason = ? where id = ?`, nowIso(), p.reason, r.id);
  return { ok: true };
}
