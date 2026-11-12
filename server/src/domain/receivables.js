// Công nợ khách hàng: sổ công nợ theo thứ tự giao dịch thực tế, và phiếu thu theo đợt trừ nợ cho nhiều đơn.
// Công nợ phát sinh khi giao hàng (mỗi phiếu giao / hóa đơn một dòng), giảm khi khách trả hàng hoặc trả tiền.
// Một phiếu thu là một dòng trong sổ; phần trừ vào từng đơn nằm ở payment_allocations.
import { fail, one, all, insert, uuid, num, nz, trimNz, rnd } from '../lib/context.js';
import { requirePerm, once } from './access.js';
import { doPayment } from './cash.js';

const roundVat = (v, rate) => Math.round((v * rate) / 100);
const vnd = (v) => Math.round(v).toLocaleString('en-US');

function customerOf(book, id) {
  const c = one(`select * from v_customers where id = ? and book_id = ?`, id, book);
  if (!c) fail('Không tìm thấy khách hàng');
  return c;
}

// ---------- Sổ công nợ ----------
// Mỗi dòng nằm ở một trong hai cột: "Phát sinh nợ" (bán, giao hàng, trả hàng, nợ cũ) hoặc "Đã thu" (phiếu thu, hoàn tiền)
function ledgerEvents(book, cid) {
  const ev = [];
  for (const d of all(`select id, code, debt_date, amount, note, created_at from opening_debts where book_id = ? and party_type = 'kh' and party_id = ?`, book, cid)) {
    const owe = d.amount >= 0;
    ev.push({ key: 'od:' + d.id, type: 'no_cu', title: owe ? 'Nợ cũ' : 'Trả trước từ sổ cũ', date: d.debt_date, at: d.created_at, code: d.code,
      note: d.note || (owe ? 'Nợ chuyển từ sổ cũ' : 'Tiền khách trả trước chuyển từ sổ cũ'), col: owe ? 'no' : 'thu', amount: d.amount });
  }
  const dels = all(`select d.id, d.code, d.delivery_date, d.created_at, d.shipping_fee, o.id as order_id, o.code as order_code, o.vat_rate,
      coalesce((select sum(x.revenue) from delivery_lines x where x.delivery_id = d.id), 0) as revenue,
      (select count(*) from deliveries d2 where d2.order_id = d.order_id) as n
    from deliveries d join sales_orders o on o.id = d.order_id where o.book_id = ? and o.customer_id = ? order by d.delivery_date, d.created_at`, book, cid);
  const seq = {};
  for (const d of dels) {
    seq[d.order_id] = (seq[d.order_id] || 0) + 1;
    // Đơn và hóa đơn cùng mã (kiểu KiotViet): chỉ một dòng, không cần chú thích
    const same = d.code === d.order_code;
    ev.push({ key: 'dl:' + d.id, type: 'ban_hang', title: same ? '' : d.n > 1 ? `Giao đợt ${seq[d.order_id]} của đơn ${d.order_code}` : `Giao hàng đơn ${d.order_code}`,
      date: d.delivery_date, at: d.created_at, code: d.code, order_id: d.order_id, col: 'no',
      amount: d.revenue + roundVat(d.revenue, d.vat_rate) + d.shipping_fee });
  }
  for (const r of all(`select r.id, r.code, r.return_date, r.created_at, r.reason, o.id as order_id, o.code as order_code, o.vat_rate,
      coalesce((select sum(x.revenue) from sales_return_lines x where x.return_id = r.id), 0) as revenue
    from sales_returns r join sales_orders o on o.id = r.order_id where o.book_id = ? and o.customer_id = ?`, book, cid)) {
    ev.push({ key: 'rt:' + r.id, type: 'tra_hang', title: `Khách trả hàng đơn ${r.order_code}`, note: r.reason || null, date: r.return_date, at: r.created_at,
      code: r.code, order_id: r.order_id, col: 'no', amount: -(r.revenue + roundVat(r.revenue, r.vat_rate)) });
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
    ev.push({ key: 'pm:' + p.id, type: thu ? 'thu' : 'hoan', title: thu ? 'Thu tiền' : 'Hoàn tiền cho khách', date: p.pay_date, at: p.created_at,
      code: p.code, payment_id: p.id, note: p.note || null, method: p.method || p.fund_name, ref_no: p.ref_no || null,
      allocs: JSON.parse(p.allocations || '[]').filter((a) => a.doc_id).map((a) => ({ doc_id: a.doc_id, doc_type: a.doc_type, code: a.doc_code, amount: a.amount })),
      prepaid: thu && p.unallocated > 0.5 ? p.unallocated : 0, col: 'thu', amount: thu ? -p.amount : p.amount });
  }
  // Thứ tự giao dịch thực tế: theo ngày chứng từ, cùng ngày thì theo lúc ghi
  ev.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.at || '') < (b.at || '') ? -1 : (a.at || '') > (b.at || '') ? 1 : 0));
  let bal = 0;
  return ev.map((e) => { bal += e.amount; return { ...e, debt: e.col === 'no' ? e.amount : 0, paid: e.col === 'thu' ? -e.amount : 0, balance: bal }; });
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
  return {
    customer: { id: c.id, code: c.code, name: c.name, phone: c.phone, address: c.address, credit_days: c.credit_days },
    total_billed: rows.reduce((s, r) => s + r.debt, 0), total_paid: rows.reduce((s, r) => s + r.paid, 0),
    balance: c.balance, receivable: c.receivable, prepaid: c.prepaid,
    usable_prepaid: usablePrepaid(b, c.id), opening, closing, rows: inRange,
    ledger_end: rows.length ? rows[rows.length - 1].balance : 0,
  };
}

// ---------- Phiếu thu theo đợt ----------
// Tiền khách đã trả nhưng chưa trừ vào đơn nào (bớt phần đã hoàn lại không theo đơn)
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

// Cách trừ nợ: 'auto' dùng tiền trả trước còn dư rồi tới tiền nhận lần này, đơn cũ nhất trước; 'manual' theo số nhân viên nhập
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
      if (seen.has(m.doc_id)) fail('Mỗi đơn chỉ nhập số tiền một lần');
      seen.add(m.doc_id);
      const d = docs.find((x) => x.doc_id === m.doc_id);
      if (!d) fail('Đơn đã chọn không phải của khách này hoặc đã hết nợ');
      if (a > d.left) fail(`Đơn ${d.code} chỉ còn nợ ${vnd(d.left)} đ, không thể trừ ${vnd(a)} đ`);
      allocations.push({ doc_type: d.doc_type, doc_id: d.doc_id, amount: a }); d.left -= a;
    }
  } else fail('Cách trừ nợ không hợp lệ');
  const allocated = allocations.reduce((s, a) => s + a.amount, 0);
  if (allocated > amount) error = `Tổng tiền trừ vào các đơn (${vnd(allocated)} đ) lớn hơn số tiền nhận (${vnd(amount)} đ)`;
  const stillOwed = docs.reduce((s, d) => s + d.left, 0);
  if (!error && mode === 'manual' && amount - allocated > 0 && stillOwed > 0) {
    error = `Còn ${vnd(amount - allocated)} đ chưa trừ vào đơn nào trong khi khách vẫn đang nợ. Hãy chọn thêm đơn hoặc chuyển sang "Trừ đơn cũ trước".`;
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

// Ghi 1 phiếu thu cho khách và phần trừ vào từng đơn trong cùng một giao dịch; lúc lưu tính lại từ đầu
export function record_receipt(p) {
  const b = p.book_id;
  requirePerm(b, 'thu_chi');
  return once(p, b, 'record_receipt', () => {
    const plan = planReceipt(b, p.customer_id, p.amount, p.mode, p.allocations);
    if (!(plan.amount > 0)) fail('Số tiền nhận phải lớn hơn 0');
    if (plan.error) fail(plan.error);
    if (p.expect && !sameAlloc(plan.allocations, p.expect)) fail('Công nợ của khách vừa thay đổi. Hãy xem lại các đơn được trừ rồi lưu lại.');
    applyPrepaid(b, plan.prepaid_use);
    const r = doPayment(b, { kind: 'thu_khach', date: p.date, fund_id: p.fund_id, party_id: p.customer_id, amount: plan.amount,
      method: nz(p.method), ref_no: p.ref_no, note: trimNz(p.note), allocations: plan.allocations });
    return { ...r, allocations: plan.allocations, prepaid_used: plan.prepaid_use.reduce((s, u) => s + u.amount, 0), excess: plan.excess, debt_after: plan.debt_after, prepaid_after: plan.prepaid_after };
  });
}

// Lấy tiền khách trả trước còn dư trừ vào các đơn còn nợ, đơn cũ trước
export function apply_prepaid(p) {
  const b = p.book_id;
  requirePerm(b, 'thu_chi');
  return once(p, b, 'apply_prepaid', () => {
    const plan = planReceipt(b, p.customer_id, 0, 'auto');
    if (!plan.prepaid_use.length) fail('Khách không có tiền trả trước còn dư, hoặc không còn đơn nào đang nợ');
    applyPrepaid(b, plan.prepaid_use);
    return { used: plan.prepaid_use.reduce((s, u) => s + u.amount, 0), docs: plan.prepaid_use.map((u) => u.code) };
  });
}
