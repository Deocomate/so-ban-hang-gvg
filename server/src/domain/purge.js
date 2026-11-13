// Xóa dữ liệu cũ của sổ đến hết một ngày, giữ đúng số dư: công nợ từng khách / NCC chuyển thành nợ đầu kỳ, tồn kho từng mã thành
// tồn đầu kỳ, số dư quỹ cộng vào số dư đầu kỳ của quỹ, điểm tích lũy gộp thành một dòng. Chỉ xóa chứng từ đã khép lại hoàn toàn
// trước ngày đó (đơn giao xong / đã hủy, mọi phiếu thu chi liên quan cũng trước ngày đó). Máy chủ sao lưu CSDL trước khi xóa.
import { ctx, fail, one, all, run, insert, uuid, nowIso, asDate, today, rnd, dmy, json } from '../lib/context.js';
import { requirePerm, bookSettings, nextCode } from './access.js';
import { custBalances, suppBalances } from './reports.js';

function pick(b, d) {
  const orders = all(`select o.id from sales_orders o where o.book_id = ? and o.order_date <= ?
      and (o.status = 'huy' or not exists (select 1 from sales_order_lines l where l.order_id = o.id and l.qty - l.cancelled_qty - l.delivered_qty > 0))
      and not exists (select 1 from deliveries x where x.order_id = o.id and x.delivery_date > ?)
      and not exists (select 1 from sales_returns x where x.order_id = o.id and x.return_date > ?)
      and not exists (select 1 from contracts k where k.order_id = o.id)
      and not exists (select 1 from payment_allocations a join payments p on p.id = a.payment_id where a.doc_type = 'don_ban' and a.doc_id = o.id and p.pay_date > ?)`, b, d, d, d, d).map((r) => r.id);
  const pos = all(`select o.id from purchase_orders o where o.book_id = ? and o.order_date <= ?
      and (o.status = 'huy' or not exists (select 1 from purchase_order_lines l where l.po_id = o.id and l.qty - l.cancelled_qty - l.received_qty > 0))
      and not exists (select 1 from goods_receipts x where x.po_id = o.id and x.receipt_date > ?)
      and not exists (select 1 from supplier_returns x where x.po_id = o.id and x.return_date > ?)
      and not exists (select 1 from payment_allocations a join payments p on p.id = a.payment_id where a.doc_type = 'don_mua' and a.doc_id = o.id and p.pay_date > ?)`, b, d, d, d, d).map((r) => r.id);
  const exps = all(`select e.id from v_expenses e where e.book_id = ? and e.exp_date <= ? and coalesce(e.alloc_end, e.exp_date) <= ?
      and (e.voided = 1 or e.unpaid = 0) and not exists (select 1 from paysheet_lines l where l.expense_id = e.id)
      and not exists (select 1 from payment_allocations a join payments p on p.id = a.payment_id where a.doc_type = 'chi_phi' and a.doc_id = e.id and p.pay_date > ?)`, b, d, d, d).map((r) => r.id);
  const gone = new Set([...orders, ...pos, ...exps]);
  // Phiếu thu chi: trước ngày xóa và mọi chứng từ được phân bổ đều bị xóa (hoặc không phân bổ cho chứng từ nào)
  const pays = all(`select p.id, (select json_group_array(a.doc_id) from payment_allocations a where a.payment_id = p.id) as docs from payments p
      where p.book_id = ? and p.pay_date <= ? and not exists (select 1 from expenses e where e.settled_payment_id = p.id and e.exp_date > ?)`, b, d, d)
    .filter((p) => json(p.docs, []).every((x) => gone.has(x))).map((p) => p.id);
  const sret = all(`select r.id from supplier_returns r where r.book_id = ? and r.return_date <= ? and r.po_id is null`, b, d).map((r) => r.id);
  return { orders, pos, exps, pays, sret,
    adjs: all(`select id from stock_adjustments where book_id = ? and adj_date <= ? and id not like 'xoa-du-lieu-%'`, b, d).map((r) => r.id),
    prods: all(`select id from productions where book_id = ? and prod_date <= ?`, b, d).map((r) => r.id),
    moves: one(`select count(*) as n from stock_moves where book_id = ? and move_date <= ?`, b, d).n };
}

const LABELS = { orders: 'Đơn bán (kèm phiếu giao, trả hàng)', pos: 'Đơn nhập (kèm phiếu nhập, trả hàng nhập)', exps: 'Chi phí', pays: 'Phiếu thu, chi',
  sret: 'Phiếu trả hàng nhập lập riêng', adjs: 'Phiếu điều chỉnh, xuất hủy, xuất dùng nội bộ', prods: 'Phiếu sản xuất', moves: 'Dòng sổ kho' };
const checkCutoff = (b, d) => {
  if (!d) fail('Chọn ngày'); if (d >= today()) fail('Chỉ xóa được dữ liệu trước hôm nay');
  const lk = bookSettings(b).lock_date; if (!lk || d > lk) fail(`Hãy khóa sổ đến ngày ${dmy(d)} trước khi xóa dữ liệu đến ngày đó (Thiết lập → Khóa sổ)`);
};

export function purge_preview(p) {
  const b = p.book_id; requirePerm(b, 'owner');
  const d = asDate(p.cutoff); checkCutoff(b, d);
  const x = pick(b, d);
  return { cutoff: d, items: Object.entries(LABELS).map(([k, label]) => ({ key: k, label, count: Array.isArray(x[k]) ? x[k].length : x[k] })) };
}

export function schedule_purge(p) {
  const b = p.book_id; requirePerm(b, 'owner');
  const d = asDate(p.cutoff); checkCutoff(b, d);
  if (p.confirm !== true) fail('Cần xác nhận trước khi xóa dữ liệu');
  if (one(`select 1 from purge_jobs where book_id = ? and status = 'cho'`, b)) fail('Sổ đang có một lịch xóa chờ chạy — hãy hủy lịch đó trước');
  const id = uuid();
  insert('purge_jobs', { id, book_id: b, cutoff: d, run_at: p.when === 'now' ? nowIso() : `${today()}T16:00:00.000Z`, status: 'cho', created_by: ctx.uid, created_at: nowIso() });
  if (p.when === 'now') return runPurge(id);
  return { id, scheduled: true };
}
export function cancel_purge(p) {
  const j = one(`select * from purge_jobs where id = ?`, p.id); if (!j) fail('Không tìm thấy lịch xóa');
  requirePerm(j.book_id, 'owner'); if (j.status !== 'cho') fail('Lịch này đã chạy');
  run(`update purge_jobs set status = 'huy' where id = ?`, j.id); return { ok: true };
}
export function purge_jobs(p) { requirePerm(p.book_id, 'owner'); return all(`select * from purge_jobs where book_id = ? order by created_at desc limit 50`, p.book_id).map((j) => ({ ...j, result: json(j.result, null) })); }

const fundBal = (b) => new Map(all(`select id, balance from v_funds where book_id = ?`, b).map((f) => [f.id, f.balance]));
const balMap = (rows) => new Map(rows.map((r) => [r.party_id, r.balance]));

export function runPurge(jobId) {
  const j = one(`select * from purge_jobs where id = ?`, jobId);
  if (!j || j.status !== 'cho') return { skipped: true };
  const b = j.book_id; const d = j.cutoff;
  const x = pick(b, d);
  const c0 = balMap(custBalances(b, d)); const s0 = balMap(suppBalances(b, d)); const f0 = fundBal(b);
  const stock = all(`select product_id, sum(qty) as q, sum(value) as v from stock_moves where book_id = ? and move_date <= ? group by product_id`, b, d);
  const pts = all(`select customer_id, sum(points) as p from point_moves where book_id = ? and move_date <= ? group by customer_id`, b, d);
  const inList = (ids) => `(select value from json_each('${JSON.stringify(ids).replace(/'/g, "''")}'))`;
  const O = inList(x.orders); const P = inList(x.pos); const E = inList(x.exps); const Y = inList(x.pays);
  // Chứng từ bán
  run(`update quotes set order_id = null where order_id in ${O}`);
  run(`update tax_invoices set order_id = null where order_id in ${O}`);
  run(`update bank_txns set order_id = null where order_id in ${O}`);
  run(`update driver_trips set order_id = null, delivery_id = null where order_id in ${O} or delivery_id in (select id from deliveries where order_id in ${O})`);
  run(`delete from shipments where order_id in ${O}`);
  run(`update purchase_order_lines set sales_order_line_id = null where sales_order_line_id in (select id from sales_order_lines where order_id in ${O})`);
  run(`delete from doc_info where ref_id in ${O} or ref_id in (select id from deliveries where order_id in ${O})`);
  run(`delete from order_events where order_id in ${O}`);
  run(`delete from sales_returns where order_id in ${O}`);
  run(`delete from deliveries where order_id in ${O}`);
  run(`delete from sales_orders where id in ${O}`);
  // Chứng từ mua
  run(`update sales_order_lines set po_line_id = null where po_line_id in (select id from purchase_order_lines where po_id in ${P})`);
  run(`delete from supplier_returns where po_id in ${P} or id in ${inList(x.sret)}`);
  run(`delete from goods_receipts where po_id in ${P}`);
  run(`delete from purchase_orders where id in ${P}`);
  // Chi phí, thu chi
  run(`update driver_trips set expense_id = null where expense_id in ${E}`);
  run(`update expenses set settled_payment_id = null where settled_payment_id in ${Y}`);
  run(`delete from expenses where id in ${E}`);
  run(`delete from payments where id in ${Y}`);
  // Kho
  run(`delete from stock_adjustments where id in ${inList(x.adjs)}`);
  run(`delete from productions where id in ${inList(x.prods)}`);
  run(`delete from stock_moves where book_id = ? and move_date <= ?`, b, d);
  const code = nextCode(b, 'DK'); const adjId = `xoa-du-lieu-${j.id}`;
  for (const s of stock) {
    if (!s.q && !s.v) continue;
    insert('stock_moves', { book_id: b, product_id: s.product_id, move_date: d, qty: s.q, value: s.v, unit_cost: s.q ? Math.abs(s.v / s.q) : 0, doc_type: 'dau_ky', doc_id: adjId,
      doc_code: code, balance_qty: s.q, balance_value: s.v, src_value: s.v, note: `Tồn đến ${dmy(d)} (dữ liệu cũ đã xóa)`, created_by: ctx.uid, created_at: nowIso() });
  }
  // Điểm
  run(`delete from point_moves where book_id = ? and move_date <= ?`, b, d);
  for (const r of pts) if (r.p) insert('point_moves', { book_id: b, customer_id: r.customer_id, move_date: d, points: r.p, kind: 'dieu_chinh', note: `Điểm đến ${dmy(d)} (dữ liệu cũ đã xóa)`, created_by: ctx.uid, created_at: nowIso() });
  // Công nợ: phần chênh sau khi xóa thành nợ đầu kỳ tại ngày xóa
  const debt = (type, before, after) => {
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      const diff = rnd((before.get(id) ?? 0) - (after.get(id) ?? 0));
      if (diff) insert('opening_debts', { id: uuid(), book_id: b, code: nextCode(b, 'NDK'), party_type: type, party_id: id, amount: diff, debt_date: d, due_date: d,
        note: `Số dư đến ${dmy(d)} (dữ liệu cũ đã xóa)`, created_by: ctx.uid, created_at: nowIso() });
    }
  };
  debt('kh', c0, balMap(custBalances(b, d)));
  debt('ncc', s0, balMap(suppBalances(b, d)));
  for (const [id, bal] of fundBal(b)) { const diff = rnd((f0.get(id) ?? 0) - bal); if (diff) run(`update funds set opening_balance = opening_balance + ? where id = ?`, diff, id); }
  const result = Object.fromEntries(Object.keys(LABELS).map((k) => [k, Array.isArray(x[k]) ? x[k].length : x[k]]));
  run(`update purge_jobs set status = 'xong', done_at = ?, result = ? where id = ?`, nowIso(), JSON.stringify(result), j.id);
  return { id: j.id, result };
}

// Lịch tự động: chạy các lịch xóa đã đến giờ
export function runDuePurges() {
  for (const j of all(`select id from purge_jobs where status = 'cho' and run_at <= ?`, nowIso())) {
    try { ctx.db.transaction(() => runPurge(j.id))(); }
    catch (e) { run(`update purge_jobs set status = 'loi', result = ? where id = ?`, JSON.stringify({ error: e.message }), j.id); }
  }
}
