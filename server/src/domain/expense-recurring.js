// Chi phí định kỳ (thuê nhà, phần mềm AI, internet, lương cố định…): mỗi tháng tự ghi 1 khoản chi phí vào ngày đã hẹn,
// có thể tự lập phiếu chi trả luôn từ 1 quỹ và chia cho nhiều thương hiệu như chi phí thường.
import { ctx, fail, one, all, run, insert, uuid, nowIso, num, int, nz, trimNz, rnd, today, json } from '../lib/context.js';
import { requirePerm, checkDate } from './access.js';
import { writeExpense, normSplit, expenseGroupOf } from './cash.js';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const nextMonth = (m) => { const t = new Date(m + '-01T00:00:00Z'); t.setUTCMonth(t.getUTCMonth() + 1); return t.toISOString().slice(0, 7); };
// Ngày ghi của tháng m: ngày hẹn, quá số ngày của tháng thì lấy ngày cuối tháng
export function dueDate(m, day) {
  const last = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
  return `${m}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

export function save_recurring(p) {
  const b = p.book_id;
  requirePerm(b, 'chi_phi');
  const id = nz(p.id);
  const old = id ? one(`select * from expense_recurring where id = ? and book_id = ?`, id, b) : null;
  if (id && !old) fail('Không tìm thấy chi phí định kỳ');
  // Sửa từng phần (vd. kéo thả đổi ngày) giữ nguyên các trường không gửi lên
  const v = (k, d = null) => (Object.hasOwn(p, k) ? p[k] : old ? old[k] : d);
  const name = trimNz(v('name')); const category = trimNz(v('category'));
  const amount = rnd(num(v('amount'))); const day = int(v('day', 1));
  const start = nz(v('start_month', today().slice(0, 7))); const end = nz(v('end_month'));
  const fund = nz(v('fund_id')); const active = v('active', 1) ? 1 : 0;
  if (!name) fail('Đặt tên cho chi phí định kỳ (vd. Thuê nhà, Claude AI)');
  if (!category) fail('Chọn khoản mục chi phí');
  if (!(amount > 0)) fail('Số tiền mỗi kỳ phải lớn hơn 0');
  if (!(day >= 1 && day <= 31)) fail('Ngày ghi hằng tháng từ 1 đến 31');
  if (!MONTH.test(start)) fail('Tháng bắt đầu không hợp lệ');
  if (end && (!MONTH.test(end) || end < start)) fail('Tháng kết thúc phải sau tháng bắt đầu');
  if (fund) {
    requirePerm(b, 'thu_chi');
    if (!one(`select 1 from funds where id = ? and book_id = ? and active = 1`, fund, b)) fail('Quỹ trả tiền không hợp lệ');
  }
  const splitIn = Object.hasOwn(p, 'split') ? p.split : json(old?.split, []);
  const parts = normSplit(b, splitIn, amount);
  const split = JSON.stringify((parts || []).map(({ book_id, pct }) => ({ book_id, pct })));
  const row = { name, category, expense_group: trimNz(v('expense_group')) || expenseGroupOf(b, category), amount, day, start_month: start, end_month: end,
    fund_id: fund, split, active, note: nz(v('note')), updated_at: nowIso() };
  let rid = id;
  if (old) {
    run(`update expense_recurring set ${Object.keys(row).map((k) => `${k} = ?`).join(', ')} where id = ?`, ...Object.values(row), id);
  } else {
    rid = uuid();
    insert('expense_recurring', { id: rid, book_id: b, created_by: ctx.uid, created_at: nowIso(), ...row });
  }
  return { id: rid, created: active ? generateDue(one(`select * from expense_recurring where id = ?`, rid)) : [] };
}

export function delete_recurring(p) {
  const r = one(`select * from expense_recurring where id = ?`, p.id);
  if (!r) fail('Không tìm thấy chi phí định kỳ');
  requirePerm(r.book_id, 'chi_phi');
  run(`delete from expense_recurring where id = ?`, r.id);   // khoản đã ghi các tháng trước vẫn giữ nguyên
  return { ok: true };
}

// Ghi ngay kỳ của tháng này (trước ngày hẹn) — vd. đã trả tiền nhà sớm
export function run_recurring(p) {
  const b = p.book_id;
  requirePerm(b, 'chi_phi');
  const list = p.id ? all(`select * from expense_recurring where id = ? and book_id = ?`, p.id, b) : all(`select * from expense_recurring where book_id = ? and active = 1`, b);
  if (p.id && !list.length) fail('Không tìm thấy chi phí định kỳ');
  const created = [];
  for (const r of list) {
    if (p.id && p.now) {
      if (r.fund_id) requirePerm(b, 'thu_chi');
      const m = today().slice(0, 7);
      if (m < r.start_month || (r.end_month && m > r.end_month)) fail('Tháng này nằm ngoài thời gian áp dụng của chi phí định kỳ');
      if (one(`select 1 from expenses where recur_id = ? and recur_month = ?`, r.id, m)) fail('Tháng này đã ghi khoản chi phí định kỳ này');
      created.push(genOne(r, m, today()));
    } else created.push(...generateDue(r));
  }
  return { created };
}

function genOne(r, m, d) {
  checkDate(r.book_id, d);
  const fundOk = r.fund_id && one(`select 1 from funds where id = ? and book_id = ? and active = 1`, r.fund_id, r.book_id);
  const e = writeExpense(r.book_id, { date: d, category: r.category, expense_group: r.expense_group, amount: r.amount, alloc_months: 1,
    description: `${r.name} · tháng ${m.slice(5, 7)}/${m.slice(0, 4)}`, note: r.note, split: json(r.split, []),
    pay_now: fundOk ? { fund_id: r.fund_id, method: null } : null, recur_id: r.id, recur_month: m });
  return e.code;
}

// Ghi các kỳ đã đến hạn mà chưa ghi (bù cả tháng trước nếu máy chủ tắt), tối đa 24 kỳ mỗi lần.
// Mỗi kỳ ghi trong 1 điểm lưu riêng: kỳ lỗi (sổ đã khóa, quỹ ngừng dùng…) bỏ qua, không làm hỏng kỳ khác.
export function generateDue(r, d = today()) {
  const created = [];
  let m = r.start_month; const cur = d.slice(0, 7);
  for (let n = 0; n < 240 && m <= cur && created.length < 24; n++, m = nextMonth(m)) {
    if (r.end_month && m > r.end_month) break;
    const due = dueDate(m, r.day);
    if (due > d || one(`select 1 from expenses where recur_id = ? and recur_month = ?`, r.id, m)) continue;
    try { created.push(ctx.db.transaction(() => genOne(r, m, due))()); } catch (e) { console.error(`chi phí định kỳ ${r.name} tháng ${m} lỗi:`, e.message); }
  }
  return created;
}

// Lịch tự động hằng ngày: mọi sổ thật
export function runAllRecurring(p = {}) {
  let n = 0;
  for (const r of all(`select r.* from expense_recurring r join books b on b.id = r.book_id where r.active = 1 and b.is_demo = 0`)) n += generateDue(r, p.date || today()).length;
  return { created: n };
}
