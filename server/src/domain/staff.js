// Nhân viên: hồ sơ, ca làm việc, lịch làm việc theo tuần, chấm công, bảng hoa hồng, bảng lương.
// Lương tính linh hoạt theo từng nhân viên: theo ca, theo giờ, theo ngày công chuẩn hoặc cố định; cộng làm thêm giờ,
// thưởng doanh thu (bậc thang), hoa hồng theo bảng, phụ cấp; trừ các khoản giảm trừ. Chốt bảng lương sinh khoản chi phí
// "Lương" cho từng người (nhóm Nhân sự), trả lương bằng phiếu chi gắn vào khoản đó như mọi chi phí khác.
import { ctx, fail, one, all, run, insert, uuid, nowIso, num, int, nz, trimNz, rnd, asDate, today, addDays, json } from '../lib/context.js';
import { requirePerm, can, newMasterCode, nextCode, bookSettings, checkDate } from './access.js';
import { insertExpense } from './cash.js';

export const PAY_TYPES = { ca: 'Theo ca', gio: 'Theo giờ', ngay_cong: 'Theo ngày công chuẩn', co_dinh: 'Cố định' };
const STAFF_DEFAULTS = { std_days: 26, std_hours: 8, ot_rate: 1.5, late_grace: 5, paid_leave: true };
export const staffSettings = (b) => ({ ...STAFF_DEFAULTS, ...(bookSettings(b).staff_settings || {}) });

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const mins = (t) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
// Số phút giữa 2 mốc giờ; ca qua đêm (ra < vào) tính sang ngày hôm sau
const span = (a, b) => { const d = mins(b) - mins(a); return d < 0 ? d + 1440 : d; };
const money0 = (v, label) => { const n = num(v) ?? 0; if (n < 0) fail(`${label} không được âm`); return rnd(n); };

// ---------- HỒ SƠ NHÂN VIÊN ----------
function cleanPay(p = {}) {
  const type = p.type || 'ngay_cong';
  if (!PAY_TYPES[type]) fail('Loại lương không hợp lệ');
  const list = (arr, pers, label) => (Array.isArray(arr) ? arr : []).filter((x) => trimNz(x.name) || num(x.amount)).map((x) => {
    if (!pers.includes(x.per)) fail(`${label}: cách tính không hợp lệ`);
    return { name: trimNz(x.name) || label, amount: money0(x.amount, label), per: x.per };
  });
  const bonus = (Array.isArray(p.bonus) ? p.bonus : []).filter((x) => num(x.from) != null && num(x.value)).map((x) => {
    if (!['pct', 'vnd'].includes(x.type)) fail('Thưởng: kiểu không hợp lệ');
    if (x.type === 'pct' && (num(x.value) < 0 || num(x.value) > 100)) fail('Thưởng theo % phải từ 0 đến 100');
    return { from: money0(x.from, 'Mốc doanh thu'), type: x.type, value: rnd(num(x.value), 2) };
  }).sort((a, b) => a.from - b.from);
  const out = {
    type, rate: money0(p.rate, 'Mức lương'), std_days: num(p.std_days) || null, ot_rate: num(p.ot_rate) || null, ot: p.ot !== false,
    allowances: list(p.allowances, ['thang', 'ngay'], 'Phụ cấp'), deductions: list(p.deductions, ['thang', 'lan_muon', 'nghi_khong_phep'], 'Giảm trừ'),
    bonus, commission_id: nz(p.commission_id),
  };
  if (out.std_days != null && (out.std_days <= 0 || out.std_days > 31)) fail('Ngày công chuẩn từ 1 đến 31');
  return out;
}

export function save_employee(p) {
  const b = p.book_id;
  requirePerm(b, 'owner');
  const name = trimNz(p.name);
  if (!name) fail('Nhập tên nhân viên');
  let id = nz(p.id); let code = trimNz(p.code);
  if (!code && !id) code = newMasterCode(b, 'NV', 'employees');
  if (code && one(`select 1 from employees where book_id = ? and lower(code) = lower(?) and id is not ?`, b, code, id)) fail(`Mã "${code}" đã tồn tại`);
  const uid = nz(p.user_id);
  if (uid && !one(`select 1 from book_members where book_id = ? and user_id = ?`, b, uid)) fail('Tài khoản không thuộc sổ này');
  const pay = cleanPay(p.pay);
  if (pay.commission_id && !one(`select 1 from commission_tables where id = ? and book_id = ?`, pay.commission_id, b)) fail('Không tìm thấy bảng hoa hồng');
  const f = { name, phone: nz(p.phone), id_no: nz(p.id_no), title: nz(p.title), dept: nz(p.dept), address: nz(p.address), start_date: asDate(p.start_date),
    user_id: uid, pay, note: p.note ?? null };
  if (!id) {
    id = uuid();
    insert('employees', { id, book_id: b, code, ...f, created_at: nowIso() });
  } else {
    const keys = Object.keys(f);
    if (!run(`update employees set code = coalesce(?, code), active = ?, ${keys.map((k) => `${k} = ?`).join(', ')} where id = ? and book_id = ?`,
      code, p.active === false ? 0 : 1, ...keys.map((k) => f[k]), id, b).changes) fail('Không tìm thấy nhân viên');
  }
  return { id, code };
}

// ---------- CA LÀM VIỆC & LỊCH ----------
export function save_shift(p) {
  const b = p.book_id;
  requirePerm(b, 'owner');
  const name = trimNz(p.name);
  if (!name) fail('Nhập tên ca');
  if (!TIME.test(p.start_time || '') || !TIME.test(p.end_time || '')) fail('Giờ ca theo dạng HH:MM');
  const hours = num(p.hours) || rnd(span(p.start_time, p.end_time) / 60, 2);
  if (!(hours > 0)) fail('Số giờ của ca phải lớn hơn 0');
  const f = { name, start_time: p.start_time, end_time: p.end_time, hours, active: p.active === false ? 0 : 1 };
  let id = nz(p.id);
  if (!id) { id = uuid(); insert('shifts', { id, book_id: b, ...f }); }
  else if (!run(`update shifts set name = ?, start_time = ?, end_time = ?, hours = ?, active = ? where id = ? and book_id = ?`, f.name, f.start_time, f.end_time, f.hours, f.active, id, b).changes) fail('Không tìm thấy ca');
  return { id };
}

// items: [{shift_id, weekday}] thay toàn bộ lịch tuần của nhân viên
export function save_schedule(p) {
  const b = p.book_id;
  requirePerm(b, 'cham_cong');
  const e = one(`select id from employees where id = ? and book_id = ?`, p.employee_id, b);
  if (!e) fail('Không tìm thấy nhân viên');
  run(`delete from work_schedules where employee_id = ?`, e.id);
  let n = 0;
  for (const it of p.items || []) {
    const wd = int(it.weekday);
    if (wd == null || wd < 0 || wd > 6) fail('Thứ trong tuần không hợp lệ');
    if (!one(`select 1 from shifts where id = ? and book_id = ?`, it.shift_id, b)) fail('Không tìm thấy ca');
    run(`insert or ignore into work_schedules (book_id, employee_id, shift_id, weekday) values (?, ?, ?, ?)`, b, e.id, it.shift_id, wd);
    n++;
  }
  return { items: n };
}

// ---------- CHẤM CÔNG ----------
// Giờ làm: theo giờ vào/ra nếu có, không thì theo số giờ của ca. Đi muộn/về sớm so với giờ ca, trừ số phút cho phép.
function timeFacts(b, sh, status, cin, cout) {
  if (status !== 'di_lam') return { hours: 0, late_minutes: 0, early_minutes: 0 };
  const grace = staffSettings(b).late_grace;
  const hours = cin && cout ? rnd(span(cin, cout) / 60, 2) : sh ? sh.hours : staffSettings(b).std_hours;
  let late = 0; let early = 0;
  if (sh && cin) { const d = mins(cin) - mins(sh.start_time); if (d > grace) late = d; }
  if (sh && cout && sh.end_time > sh.start_time) { const d = mins(sh.end_time) - mins(cout); if (d > grace) early = d; }
  return { hours, late_minutes: late, early_minutes: early };
}

export function save_timesheet(p) {
  const b = p.book_id;
  requirePerm(b, 'cham_cong');
  const e = one(`select id from employees where id = ? and book_id = ?`, p.employee_id, b);
  if (!e) fail('Không tìm thấy nhân viên');
  const d = asDate(p.work_date);
  if (!d) fail('Chọn ngày chấm công');
  if (d > today()) fail('Không chấm công cho ngày chưa tới');
  const status = p.status || 'di_lam';
  if (!['di_lam', 'nghi_phep', 'nghi_khong_phep'].includes(status)) fail('Trạng thái chấm công không hợp lệ');
  const sid = nz(p.shift_id);
  const sh = sid ? one(`select * from shifts where id = ? and book_id = ?`, sid, b) : null;
  if (sid && !sh) fail('Không tìm thấy ca');
  const cin = nz(p.check_in); const cout = nz(p.check_out);
  if ((cin && !TIME.test(cin)) || (cout && !TIME.test(cout))) fail('Giờ vào / ra theo dạng HH:MM');
  const ot = num(p.ot_hours) ?? 0;
  if (ot < 0 || ot > 24) fail('Giờ làm thêm không hợp lệ');
  if (one(`select 1 from paysheet_lines l join paysheets s on s.id = l.paysheet_id
    where l.employee_id = ? and s.status = 'chot' and ? between s.period_from and s.period_to`, e.id, d)) fail('Ngày này đã nằm trong bảng lương đã chốt');
  const f = { status, check_in: status === 'di_lam' ? cin : null, check_out: status === 'di_lam' ? cout : null, ot_hours: status === 'di_lam' ? ot : 0, note: p.note ?? null,
    ...timeFacts(b, sh, status, cin, cout) };
  const ex = one(`select id from timesheets where employee_id = ? and work_date = ? and coalesce(shift_id, '') = ?`, e.id, d, sid || '');
  if (ex) {
    run(`update timesheets set status = ?, check_in = ?, check_out = ?, ot_hours = ?, note = ?, hours = ?, late_minutes = ?, early_minutes = ? where id = ?`,
      f.status, f.check_in, f.check_out, f.ot_hours, f.note, f.hours, f.late_minutes, f.early_minutes, ex.id);
    return { id: ex.id };
  }
  const id = uuid();
  insert('timesheets', { id, book_id: b, employee_id: e.id, work_date: d, shift_id: sid, ...f, created_by: ctx.uid, created_at: nowIso() });
  return { id };
}

export function delete_timesheet(p) {
  const t = one(`select * from timesheets where id = ?`, p.id);
  if (!t) fail('Không tìm thấy dòng chấm công');
  requirePerm(t.book_id, 'cham_cong');
  if (one(`select 1 from paysheet_lines l join paysheets s on s.id = l.paysheet_id
    where l.employee_id = ? and s.status = 'chot' and ? between s.period_from and s.period_to`, t.employee_id, t.work_date)) fail('Ngày này đã nằm trong bảng lương đã chốt');
  run(`delete from timesheets where id = ?`, t.id);
  return { ok: true };
}

// Chấm "đi làm" theo lịch cho các ca chưa chấm trong khoảng ngày (không quá hôm nay)
export function fill_timesheets(p) {
  const b = p.book_id;
  requirePerm(b, 'cham_cong');
  const from = asDate(p.from); const to = [asDate(p.to), today()].filter(Boolean).sort()[0];
  if (!from || !to || from > to) fail('Khoảng ngày không hợp lệ');
  if ((Date.parse(to) - Date.parse(from)) / 864e5 > 62) fail('Chỉ chấm theo lịch tối đa 2 tháng một lần');
  const ids = Array.isArray(p.employee_ids) && p.employee_ids.length ? p.employee_ids : null;
  const sched = all(`select w.*, s.start_time, s.end_time, s.hours from work_schedules w join shifts s on s.id = w.shift_id
    join employees e on e.id = w.employee_id where w.book_id = ? and e.active = 1 and s.active = 1`, b).filter((w) => !ids || ids.includes(w.employee_id));
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wd = new Date(d + 'T00:00:00Z').getUTCDay();
    for (const w of sched.filter((x) => x.weekday === wd)) {
      if (one(`select 1 from timesheets where employee_id = ? and work_date = ? and coalesce(shift_id, '') = ?`, w.employee_id, d, w.shift_id)) continue;
      insert('timesheets', { id: uuid(), book_id: b, employee_id: w.employee_id, work_date: d, shift_id: w.shift_id, status: 'di_lam', hours: w.hours,
        late_minutes: 0, early_minutes: 0, ot_hours: 0, created_by: ctx.uid, created_at: nowIso() });
      n++;
    }
  }
  return { created: n };
}

// ---------- BẢNG HOA HỒNG ----------
const BASES = ['doanh_thu', 'lai_gop', 'so_luong'];
export function save_commission_table(p) {
  const b = p.book_id;
  requirePerm(b, 'owner');
  const name = trimNz(p.name);
  if (!name) fail('Nhập tên bảng hoa hồng');
  const rules = (Array.isArray(p.rules) ? p.rules : []).map((r) => {
    if (!['all', 'category', 'product'].includes(r.scope)) fail('Phạm vi hoa hồng không hợp lệ');
    if (!BASES.includes(r.basis)) fail('Cách tính hoa hồng không hợp lệ');
    const v = num(r.value);
    if (v == null || v < 0 || (r.basis !== 'so_luong' && v > 100)) fail('Mức hoa hồng không hợp lệ');
    if (r.scope === 'product' && !one(`select 1 from products where id = ? and book_id = ?`, r.target, b)) fail('Không tìm thấy hàng hóa trong bảng hoa hồng');
    if (r.scope === 'category' && !trimNz(r.target)) fail('Chọn nhóm hàng cho dòng hoa hồng');
    return { scope: r.scope, target: r.scope === 'all' ? null : trimNz(r.target), basis: r.basis, value: v };
  });
  let id = nz(p.id);
  if (!id) { id = uuid(); insert('commission_tables', { id, book_id: b, name, rules, active: 1, created_at: nowIso() }); }
  else if (!run(`update commission_tables set name = ?, rules = ?, active = ? where id = ? and book_id = ?`, name, rules, p.active === false ? 0 : 1, id, b).changes) fail('Không tìm thấy bảng hoa hồng');
  return { id };
}

// Doanh số của người bán (sales_orders.staff khớp tên hoặc mã nhân viên): từng dòng giao trừ dòng trả trong kỳ
function salesLines(b, emp, from, to) {
  const keys = [emp.name, emp.code].filter(Boolean).map((x) => x.trim().toLowerCase());
  const mine = `lower(trim(coalesce(o.staff, ''))) in (${keys.map(() => '?').join(', ')})`;
  return [
    ...all(`select x.product_id, p.category, x.qty, x.revenue, x.cogs from delivery_lines x join deliveries d on d.id = x.delivery_id
      join sales_orders o on o.id = d.order_id join products p on p.id = x.product_id where d.book_id = ? and d.delivery_date between ? and ? and ${mine}`, b, from, to, ...keys),
    ...all(`select x.product_id, p.category, -x.qty as qty, -x.revenue as revenue, -x.cogs as cogs from sales_return_lines x join sales_returns r on r.id = x.return_id
      join sales_orders o on o.id = r.order_id join products p on p.id = x.product_id where r.book_id = ? and r.return_date between ? and ? and ${mine}`, b, from, to, ...keys),
  ];
}

function commissionOf(lines, rules) {
  let total = 0;
  for (const l of lines) {
    const r = rules.find((x) => x.scope === 'product' && x.target === l.product_id) || rules.find((x) => x.scope === 'category' && x.target === l.category)
      || rules.find((x) => x.scope === 'all');
    if (!r) continue;
    total += r.basis === 'so_luong' ? l.qty * r.value : (r.basis === 'lai_gop' ? l.revenue - l.cogs : l.revenue) * r.value / 100;
  }
  return rnd(total);
}

// ---------- TÍNH LƯƠNG ----------
export function calcPay(b, emp, from, to) {
  const st = staffSettings(b); const pay = cleanPay(json(emp.pay));
  const ts = all(`select t.*, s.hours as shift_hours from timesheets t left join shifts s on s.id = t.shift_id
    where t.employee_id = ? and t.work_date between ? and ?`, emp.id, from, to);
  const work = ts.filter((t) => t.status === 'di_lam');
  const days = new Set(work.map((t) => t.work_date)).size;
  const leaveDays = new Set(ts.filter((t) => t.status === 'nghi_phep').map((t) => t.work_date)).size;
  const absentDays = new Set(ts.filter((t) => t.status === 'nghi_khong_phep').map((t) => t.work_date)).size;
  const shifts = work.length; const hours = work.reduce((s, t) => s + t.hours, 0);
  const otHours = work.reduce((s, t) => s + t.ot_hours, 0); const lates = work.filter((t) => t.late_minutes > 0 || t.early_minutes > 0).length;
  const stdDays = pay.std_days || st.std_days;
  const paidDays = days + (st.paid_leave ? leaveDays : 0);
  const avgShift = shifts ? work.reduce((s, t) => s + (t.shift_hours || t.hours), 0) / shifts : st.std_hours;
  let base; let hourly;
  if (pay.type === 'ca') { base = pay.rate * shifts; hourly = pay.rate / (avgShift || st.std_hours); }
  else if (pay.type === 'gio') { base = pay.rate * hours; hourly = pay.rate; }
  else if (pay.type === 'ngay_cong') { base = pay.rate / stdDays * paidDays; hourly = pay.rate / stdDays / st.std_hours; }
  else { base = pay.rate; hourly = pay.rate / stdDays / st.std_hours; }
  const ot = pay.ot ? otHours * hourly * (pay.ot_rate || st.ot_rate) : 0;
  const allowance = pay.allowances.reduce((s, a) => s + (a.per === 'ngay' ? a.amount * days : a.amount), 0);
  const deduction = pay.deductions.reduce((s, a) => s + (a.per === 'lan_muon' ? a.amount * lates : a.per === 'nghi_khong_phep' ? a.amount * absentDays : a.amount), 0);
  const lines = salesLines(b, emp, from, to);
  const revenue = rnd(lines.reduce((s, l) => s + l.revenue, 0));
  const tier = [...pay.bonus].reverse().find((x) => revenue >= x.from);
  const bonus = tier ? (tier.type === 'pct' ? revenue * tier.value / 100 : tier.value) : 0;
  const ct = pay.commission_id ? one(`select rules from commission_tables where id = ? and active = 1`, pay.commission_id) : null;
  const commission = ct ? commissionOf(lines, json(ct.rules, [])) : 0;
  const r = { base: rnd(base), ot: rnd(ot), bonus: rnd(bonus), commission, allowance: rnd(allowance), deduction: rnd(deduction) };
  return { ...r, total: r.base + r.ot + r.bonus + r.commission + r.allowance - r.deduction,
    detail: { type: pay.type, rate: pay.rate, std_days: stdDays, days, leave_days: leaveDays, absent_days: absentDays, shifts, hours: rnd(hours, 2),
      ot_hours: rnd(otHours, 2), lates, revenue, bonus_tier: tier || null } };
}

// ---------- BẢNG LƯƠNG ----------
function fillLines(b, ps, ids) {
  run(`delete from paysheet_lines where paysheet_id = ?`, ps.id);
  const emps = all(`select * from employees where book_id = ? and active = 1 order by code`, b).filter((e) => !ids || ids.includes(e.id));
  if (!emps.length) fail('Chưa có nhân viên đang làm việc');
  for (const e of emps) {
    const c = calcPay(b, e, ps.period_from, ps.period_to);
    insert('paysheet_lines', { id: uuid(), paysheet_id: ps.id, book_id: b, employee_id: e.id, base: c.base, ot: c.ot, bonus: c.bonus, commission: c.commission,
      allowance: c.allowance, deduction: c.deduction, adjust: 0, total: c.total, breakdown: c.detail });
  }
  return emps.length;
}

export function create_paysheet(p) {
  const b = p.book_id;
  requirePerm(b, 'owner');
  const from = asDate(p.from); const to = asDate(p.to);
  if (!from || !to || from > to) fail('Kỳ lương không hợp lệ');
  const id = uuid(); const code = nextCode(b, 'BL');
  const ps = { id, book_id: b, code, name: trimNz(p.name) || `Bảng lương ${from.slice(5, 7)}/${from.slice(0, 4)}`, period_from: from, period_to: to,
    status: 'tam', note: p.note ?? null, created_by: ctx.uid, created_at: nowIso() };
  insert('paysheets', ps);
  const n = fillLines(b, ps, Array.isArray(p.employee_ids) && p.employee_ids.length ? p.employee_ids : null);
  return { id, code, lines: n };
}

const openSheet = (id) => {
  const ps = one(`select * from paysheets where id = ?`, id);
  if (!ps) fail('Không tìm thấy bảng lương');
  requirePerm(ps.book_id, 'owner');
  return ps;
};

// Tính lại theo chấm công / doanh số mới nhất (chỉ khi còn tạm tính); giữ khoản cộng/trừ tay
export function recalc_paysheet(p) {
  const ps = openSheet(p.id);
  if (ps.status !== 'tam') fail('Bảng lương đã chốt hoặc đã hủy');
  const adj = Object.fromEntries(all(`select employee_id, adjust, breakdown from paysheet_lines where paysheet_id = ?`, ps.id).map((l) => [l.employee_id, l]));
  const n = fillLines(ps.book_id, ps, Object.keys(adj).length ? Object.keys(adj) : null);
  for (const [eid, l] of Object.entries(adj)) {
    if (!l.adjust) continue;
    const note = json(l.breakdown).adjust_note ?? null;
    run(`update paysheet_lines set adjust = ?, total = total + ?, breakdown = json_set(breakdown, '$.adjust_note', ?) where paysheet_id = ? and employee_id = ?`, l.adjust, l.adjust, note, ps.id, eid);
  }
  return { lines: n };
}

export function adjust_paysheet_line(p) {
  const l = one(`select l.*, s.status, s.book_id as b from paysheet_lines l join paysheets s on s.id = l.paysheet_id where l.id = ?`, p.id);
  if (!l) fail('Không tìm thấy dòng bảng lương');
  requirePerm(l.b, 'owner');
  if (l.status !== 'tam') fail('Bảng lương đã chốt hoặc đã hủy');
  const a = rnd(num(p.adjust) ?? 0);
  const total = l.total - l.adjust + a;
  if (total < 0) fail('Tổng lương không được âm');
  run(`update paysheet_lines set adjust = ?, total = ?, breakdown = json_set(breakdown, '$.adjust_note', ?) where id = ?`, a, total, trimNz(p.note), l.id);
  return { total };
}

// Chốt: mỗi người có lương > 0 thành một khoản chi phí "Lương" chưa trả
export function close_paysheet(p) {
  const ps = openSheet(p.id);
  if (ps.status !== 'tam') fail('Bảng lương đã chốt hoặc đã hủy');
  // Chốt trước khi hết kỳ: chi phí ghi vào hôm nay (không ghi ngày tương lai)
  const d = ps.period_to > today() ? today() : ps.period_to;
  checkDate(ps.book_id, d);
  for (const l of all(`select l.*, e.name from paysheet_lines l join employees e on e.id = l.employee_id where l.paysheet_id = ?`, ps.id)) {
    if (!(l.total > 0)) continue;
    const e = insertExpense(ps.book_id, { exp_date: d, category: 'Lương', expense_group: 'Nhân sự', description: `${ps.name} · ${l.name}`, amount: l.total,
      note: `Bảng lương ${ps.code}` });
    run(`update paysheet_lines set expense_id = ? where id = ?`, e.id, l.id);
  }
  run(`update paysheets set status = 'chot', closed_at = ? where id = ?`, nowIso(), ps.id);
  return { ok: true };
}

// Hủy bảng lương: chỉ khi chưa trả lương cho ai; khoản chi phí đã sinh bị hủy theo
export function cancel_paysheet(p) {
  const ps = openSheet(p.id);
  if (ps.status === 'huy') fail('Bảng lương đã hủy');
  const exps = all(`select expense_id from paysheet_lines where paysheet_id = ? and expense_id is not null`, ps.id).map((x) => x.expense_id);
  if (exps.some((id) => one(`select 1 from v_alloc_signed where doc_id = ?`, id))) fail('Đã trả lương cho nhân viên — hãy hủy phiếu chi trước');
  for (const id of exps) run(`update expenses set voided = 1, void_reason = ? where id = ?`, `Hủy bảng lương ${ps.code}`, id);
  run(`update paysheets set status = 'huy' where id = ?`, ps.id);
  return { ok: true };
}

// Báo cáo nhân viên: doanh số, lãi gộp, số đơn, hoa hồng theo bảng của từng người trong kỳ
export function rpt_staff(p) {
  const b = p.book_id;
  requirePerm(b, 'xem_bao_cao');
  const from = asDate(p.from) || today(); const to = asDate(p.to) || today();
  return all(`select * from employees where book_id = ? order by active desc, code`, b).map((e) => {
    const lines = salesLines(b, e, from, to);
    const keys = [e.name, e.code].filter(Boolean).map((x) => x.trim().toLowerCase());
    const orders = one(`select count(*) n from sales_orders where book_id = ? and status = 'xac_nhan' and order_date between ? and ?
      and lower(trim(coalesce(staff, ''))) in (${keys.map(() => '?').join(', ')})`, b, from, to, ...keys).n;
    const pay = json(e.pay);
    const ct = pay.commission_id ? one(`select rules from commission_tables where id = ?`, pay.commission_id) : null;
    const revenue = rnd(lines.reduce((s, l) => s + l.revenue, 0)); const cogs = rnd(lines.reduce((s, l) => s + l.cogs, 0));
    return { id: e.id, code: e.code, name: e.name, active: !!e.active, orders, revenue, gross_profit: can(b, 'xem_gia_von') ? revenue - cogs : null, commission: ct ? commissionOf(lines, json(ct.rules, [])) : 0 };
  });
}
