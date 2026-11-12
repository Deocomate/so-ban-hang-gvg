// Công nợ khách hàng: sổ công nợ theo thứ tự giao dịch thực tế, và phiếu thu theo đợt cấn cho nhiều đơn.
// Công nợ phát sinh khi giao hàng (mỗi phiếu giao / hóa đơn một dòng), giảm khi khách trả hàng hoặc trả tiền.
// Một phiếu thu là một dòng trong sổ; phần cấn vào từng đơn nằm ở payment_allocations.
import { fail, one, all, insert, uuid, num, nz, trimNz, rnd } from '../lib/context.js';
import { requirePerm, once } from './access.js';
import { doPayment } from './cash.js';

const roundVat = (v, rate) => Math.round((v * rate) / 100);

function customerOf(book, id) {
  const c = one(`select * from v_customers where id = ? and book_id = ?`, id, book);
  if (!c) fail('Không tìm thấy khách hàng');
  return c;
}

// ---------- Sổ công nợ ----------
function ledgerEvents(book, cid) {
  const ev = [];
  for (const d of all(`select id, code, debt_date, amount, note, created_at from opening_debts where book_id = ? and party_type = 'kh' and party_id = ?`, book, cid)) {
    ev.push({ key: 'od:' + d.id, type: 'no_dau_ky', type_label: 'Nợ đầu kỳ', date: d.debt_date, at: d.created_at, code: d.code,
      desc: d.note || (d.amount >= 0 ? 'Nợ trước khi dùng phần mềm' : 'Khách trả trước trước khi dùng phần mềm'), amount: d.amount });
  }
  const dels = all(`select d.id, d.code, d.delivery_date, d.created_at, d.shipping_fee, o.id as order_id, o.code as order_code, o.vat_rate,
      coalesce((select sum(x.revenue) from delivery_lines x where x.delivery_id = d.id), 0) as revenue,
      (select count(*) from deliveries d2 where d2.order_id = d.order_id) as n
    from deliveries d join sales_orders o on o.id = d.order_id where o.book_id = ? and o.customer_id = ? order by d.delivery_date, d.created_at`, book, cid);
  const seq = {};
  for (const d of dels) {
    seq[d.order_id] = (seq[d.order_id] || 0) + 1;
    const same = d.code === d.order_code;
    ev.push({ key: 'dl:' + d.id, type: 'ban_hang', type_label: same ? 'Bán hàng' : 'Giao hàng', date: d.delivery_date, at: d.created_at,
      code: d.code, order_id: d.order_id, order_code: d.order_code,
      desc: same ? 'Hóa đơn bán hàng' : `Giao hàng đơn ${d.order_code}${d.n > 1 ? ` (đợt ${seq[d.order_id]})` : ''}`,
      amount: d.revenue + roundVat(d.revenue, d.vat_rate) + d.shipping_fee });
  }
  for (const r of all(`select r.id, r.code, r.return_date, r.created_at, r.reason, o.id as order_id, o.code as order_code, o.vat_rate,
      coalesce((select sum(x.revenue) from sales_return_lines x where x.return_id = r.id), 0) as revenue
    from sales_returns r join sales_orders o on o.id = r.order_id where o.book_id = ? and o.customer_id = ?`, book, cid)) {
    ev.push({ key: 'rt:' + r.id, type: 'tra_hang', type_label: 'Trả hàng', date: r.return_date, at: r.created_at, code: r.code,
      order_id: r.order_id, order_code: r.order_code, desc: `Khách trả hàng đơn ${r.order_code}${r.reason ? ' · ' + r.reason : ''}`,
      amount: -(r.revenue + roundVat(r.revenue, r.vat_rate)) });
  }
  // Làm tròn VAT theo cả đơn: dồn phần chênh vào dòng cuối của đơn để tổng khớp đúng số đã giao của đơn
  const byOrder = {};
  for (const e of ev) if (e.order_id) (byOrder[e.order_id] ||= []).push(e);
  for (const [oid, list] of Object.entries(byOrder)) {
    const want = one(`select delivered_value from v_sales_orders where id = ?`, oid)?.delivered_value ?? 0;
    const diff = want - list.reduce((s, e) => s + e.amount, 0);
    if (Math.abs(diff) >= 0.5) list[list.length - 1].amount += diff;
  }
  for (const p of all(`select * from v_payments where book_id = ? and party_type = 'kh' and party_id = ? and kind in ('thu_khach', 'hoan_khach') and voided = 0`, book, cid)) {
    const thu = p.kind === 'thu_khach';
    const allocs = JSON.parse(p.allocations || '[]').filter((a) => a.doc_id);
    ev.push({ key: 'pm:' + p.id, type: thu ? 'thu' : 'hoan', type_label: thu ? 'Phiếu thu' : 'Hoàn tiền', date: p.pay_date, at: p.created_at,
      code: p.code, payment_id: p.id,
      desc: [p.note, allocs.length ? (thu ? 'Cấn ' : 'Hoàn theo ') + allocs.map((a) => a.doc_code).join(', ') : null,
        thu && p.unallocated > 0 ? 'trả trước ' + Math.round(p.unallocated).toLocaleString('en-US') : null].filter(Boolean).join(' · '),
      method: p.method, amount: thu ? -p.amount : p.amount });
  }
  // Thứ tự giao dịch thực tế: theo ngày chứng từ, cùng ngày thì theo lúc ghi
  ev.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.at || '') < (b.at || '') ? -1 : (a.at || '') > (b.at || '') ? 1 : 0));
  let bal = 0;
  return ev.map((e) => { bal += e.amount; return { ...e, inc: e.amount > 0 ? e.amount : 0, dec: e.amount < 0 ? -e.amount : 0, balance: bal }; });
}

export function customer_ledger(p) {
  const b = p.book_id;
  requirePerm(b, 'xem_thu_chi');
  const c = customerOf(b, p.customer_id);
  const rows = ledgerEvents(b, c.id);
  const from = nz(p.from); const to = nz(p.to);
  const before = from ? rows.filter((r) => r.date < from) : [];
  const inRange = rows.filter((r) => (!from || r.date >= from) && (!to || r.date <= to));
  const opening = before.length ? before[before.length - 1].balance : 0;
  const closing = inRange.length ? inRange[inRange.length - 1].balance : opening;
  // Tổng phải thu = hàng đã giao (trừ trả hàng) + nợ cũ + tiền đã hoàn; Tổng đã thu = tiền khách trả + trả trước cũ
  const phaiThu = rows.filter((r) => ['ban_hang', 'tra_hang', 'hoan'].includes(r.type) || (r.type === 'no_dau_ky' && r.amount > 0)).reduce((s, r) => s + r.amount, 0);
  const daThu = rows.filter((r) => r.type === 'thu' || (r.type === 'no_dau_ky' && r.amount < 0)).reduce((s, r) => s - r.amount, 0);
  return {
    customer: { id: c.id, code: c.code, name: c.name, phone: c.phone, address: c.address, credit_days: c.credit_days },
    total_billed: phaiThu, total_paid: daThu, balance: c.balance, receivable: c.receivable, prepaid: c.prepaid,
    usable_prepaid: usablePrepaid(b, c.id), opening, closing, rows: inRange,
    ledger_end: rows.length ? rows[rows.length - 1].balance : 0,
  };
}

// ---------- Phiếu thu theo đợt ----------
// Tiền khách đã trả nhưng chưa cấn vào đơn nào (trừ phần đã hoàn lại mà không gắn đơn)
function prepaidPools(book, cid) {
  return all(`select p.id, p.code, p.pay_date, p.kind, p.amount - coalesce((select sum(a.amount) from payment_allocations a where a.payment_id = p.id), 0) as free
    from payments p where p.book_id = ? and p.party_type = 'kh' and p.party_id = ? and p.voided = 0 and p.kind in ('thu_khach', 'hoan_khach')
    order by p.pay_date, p.created_at, p.code`, book, cid).filter((x) => x.free > 0.5);
}
function usablePrepaid(book, cid) {
  const pools = prepaidPools(book, cid);
  const s = pools.reduce((t, x) => t + (x.kind === 'thu_khach' ? x.free : -x.free), 0);
  return Math.max(Math.round(s), 0);
}

function openDebts(book, cid) {
  return all(`select doc_type, doc_id, code, doc_date, debt_date, due_date, total, due_now, paid_net, remaining_due from v_open_docs
    where book_id = ? and party_type = 'kh' and party_id = ? and status <> 'huy' and doc_type in ('don_ban', 'no_dau_ky') and remaining_due > 0.5
    order by debt_date, doc_date, code`, book, cid).map((d) => ({ ...d, left: Math.round(d.remaining_due) }));
}

// Kế hoạch cấn: mode 'auto' dùng tiền trả trước cũ rồi tiền nhận lần này, đơn cũ nhất trước; 'manual' theo số nhân viên nhập
export function planReceipt(book, cid, amount0, mode = 'auto', manual = []) {
  const c = customerOf(book, cid);
  const amount = rnd(num(amount0)) ?? 0;
  if (amount < 0) fail('Số tiền không được âm');
  const docs = openDebts(book, cid);
  const prepaidUse = [];
  if (mode === 'auto') {
    let cap = usablePrepaid(book, cid);
    for (const pool of prepaidPools(book, cid).filter((x) => x.kind === 'thu_khach')) {
      let free = Math.min(Math.round(pool.free), cap);
      for (const d of docs) {
        if (free <= 0) break;
        const a = Math.min(free, d.left);
        if (a > 0) { prepaidUse.push({ payment_id: pool.id, payment_code: pool.code, doc_type: d.doc_type, doc_id: d.doc_id, code: d.code, amount: a }); d.left -= a; free -= a; cap -= a; }
      }
      if (cap <= 0) break;
    }
  }
  const allocations = []; let error = null;
  for (const d of docs) d.before = d.left;
  if (mode === 'auto') {
    let left = amount;
    for (const d of docs) {
      if (left <= 0) break;
      const a = Math.min(left, d.left);
      if (a > 0) { allocations.push({ doc_type: d.doc_type, doc_id: d.doc_id, amount: a }); d.left -= a; left -= a; }
    }
  } else if (mode === 'manual') {
    const seen = new Set();
    for (const m of Array.isArray(manual) ? manual : []) {
      const a = rnd(num(m.amount)) ?? 0;
      if (a <= 0) continue;
      if (seen.has(m.doc_id)) fail('Một đơn chỉ nhập một dòng cấn');
      seen.add(m.doc_id);
      const d = docs.find((x) => x.doc_id === m.doc_id);
      if (!d) fail('Đơn được chọn không thuộc khách này hoặc không còn nợ');
      if (a > d.left) fail(`Số cấn cho ${d.code} (${a.toLocaleString('en-US')}) vượt số còn nợ (${d.left.toLocaleString('en-US')})`);
      allocations.push({ doc_type: d.doc_type, doc_id: d.doc_id, amount: a }); d.left -= a;
    }
  } else fail('Cách cấn đơn không hợp lệ');
  const allocated = allocations.reduce((s, a) => s + a.amount, 0);
  if (allocated > amount) error = `Tổng tiền cấn (${allocated.toLocaleString('en-US')}) vượt số tiền nhận (${amount.toLocaleString('en-US')})`;
  const stillOwed = docs.reduce((s, d) => s + d.left, 0);
  if (!error && mode === 'manual' && amount - allocated > 0 && stillOwed > 0) {
    error = `Còn ${(amount - allocated).toLocaleString('en-US')} chưa cấn trong khi khách vẫn còn nợ — chọn thêm đơn hoặc dùng Cấn đơn cũ trước`;
  }
  const balanceAfter = c.balance - amount;
  return {
    customer_id: c.id, amount, mode, balance_before: c.balance, debt_before: c.receivable, prepaid_before: c.prepaid,
    prepaid_use: prepaidUse,
    docs: docs.map((d) => ({ doc_type: d.doc_type, doc_id: d.doc_id, code: d.code, doc_date: d.doc_date, debt_date: d.debt_date, due_date: d.due_date,
      total: d.due_now, before: d.before, amount: allocations.find((a) => a.doc_id === d.doc_id)?.amount || 0, after: d.left })),
    allocations, allocated, excess: Math.max(amount - allocated, 0),
    balance_after: balanceAfter, debt_after: Math.max(balanceAfter, 0), prepaid_after: Math.max(-balanceAfter, 0), error,
  };
}

export function preview_receipt(p) {
  requirePerm(p.book_id, 'thu_chi');
  return planReceipt(p.book_id, p.customer_id, p.amount, p.mode, p.allocations);
}

const sameAlloc = (a, b) => JSON.stringify((a || []).map((x) => [x.doc_id, Math.round(x.amount)]).sort())
  === JSON.stringify((b || []).map((x) => [x.doc_id, Math.round(Number(x.amount))]).sort());

function applyPrepaid(book, uses) {
  for (const u of uses) insert('payment_allocations', { id: uuid(), payment_id: u.payment_id, book_id: book, doc_type: u.doc_type, doc_id: u.doc_id, amount: u.amount });
}

// Ghi 1 phiếu thu cho khách + các dòng cấn đơn, trong cùng một giao dịch; tính lại kế hoạch lúc lưu
export function record_receipt(p) {
  const b = p.book_id;
  requirePerm(b, 'thu_chi');
  return once(p, b, 'record_receipt', () => {
    const plan = planReceipt(b, p.customer_id, p.amount, p.mode, p.allocations);
    if (!(plan.amount > 0)) fail('Số tiền nhận phải lớn hơn 0');
    if (plan.error) fail(plan.error);
    if (p.expect && !sameAlloc(plan.allocations, p.expect)) fail('Công nợ của khách vừa thay đổi — hãy xem lại bảng cấn đơn rồi lưu lại');
    applyPrepaid(b, plan.prepaid_use);
    const r = doPayment(b, { kind: 'thu_khach', date: p.date, fund_id: p.fund_id, party_id: p.customer_id, amount: plan.amount,
      method: nz(p.method), ref_no: p.ref_no, note: trimNz(p.note), allocations: plan.allocations });
    return { ...r, allocations: plan.allocations, prepaid_used: plan.prepaid_use.reduce((s, u) => s + u.amount, 0), excess: plan.excess, debt_after: plan.debt_after, prepaid_after: plan.prepaid_after };
  });
}

// Dùng tiền khách trả trước (chưa cấn) để cấn các đơn còn nợ, cũ trước
export function apply_prepaid(p) {
  const b = p.book_id;
  requirePerm(b, 'thu_chi');
  return once(p, b, 'apply_prepaid', () => {
    const plan = planReceipt(b, p.customer_id, 0, 'auto');
    if (!plan.prepaid_use.length) fail('Không có tiền trả trước nào để cấn, hoặc khách không còn đơn nợ');
    applyPrepaid(b, plan.prepaid_use);
    return { used: plan.prepaid_use.reduce((s, u) => s + u.amount, 0), docs: plan.prepaid_use.map((u) => u.code) };
  });
}
