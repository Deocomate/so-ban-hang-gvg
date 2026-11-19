// Chấm công theo tháng (giao diện như app lịch công việc): nhân viên tự chấm trên trang riêng, chủ cửa hàng xem công và lương cả nhóm.
// Quyền: nhân viên chỉ thấy và chấm của chính mình (hồ sơ nhân viên gắn với tài khoản đăng nhập), không tự ghi giờ làm thêm;
// người có quyền "Chấm công" thấy và sửa của mọi người; chỉ chủ cửa hàng (Quản lý sổ) thấy lương của người khác.
// Dùng chung bản ghi chấm công với bảng lương: chốt bảng lương thì ngày trong kỳ bị khóa với tất cả mọi người.
import { ctx, fail, one, all, nz, today, json, addDays, addMonths, inList } from '../lib/context.js';
import { requirePerm, can } from './access.js';
import { calcPay, writeTimesheet, removeTimesheet, staffSettings, WORK_STATUSES } from './staff.js';

const VN_MS = 7 * 3600e3;
const nowHM = () => new Date(Date.now() + VN_MS).toISOString().slice(11, 16);
const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const weekday = (d) => new Date(d + 'T00:00:00Z').getUTCDay();

// Hồ sơ nhân viên của người đang đăng nhập trong sổ này (nếu có)
export const myEmployee = (b) => one(`select * from employees where book_id = ? and user_id = ? and active = 1 order by created_at limit 1`, b, ctx.uid);
const NOT_LINKED = 'Tài khoản của bạn chưa gắn với hồ sơ nhân viên — nhờ chủ cửa hàng gắn ở Nhân viên › Danh sách nhân viên (ô "Tài khoản đăng nhập")';

// Được ghi chấm công cho nhân viên này không: người có quyền chấm công, hoặc chính người đó
function writer(b, employeeId) {
  requirePerm(b, null);
  if (can(b, 'cham_cong')) return { self: false };
  const me = myEmployee(b);
  if (me && me.id === employeeId) return { self: true };
  fail(me ? 'Bạn chỉ chấm công được cho chính mình' : NOT_LINKED, 403);
}

export function att_month(p) {
  const b = p.book_id;
  requirePerm(b, null);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(p.month || '') ? p.month : today().slice(0, 7);
  const from = `${month}-01`;
  const to = addDays(addMonths(from, 1), -1);
  const me = myEmployee(b);
  const manage = can(b, 'cham_cong'); const owner = can(b, 'owner');
  // Người quản lý thấy nhân viên đang làm + người đã nghỉ nhưng còn chấm công trong tháng
  const emps = manage
    ? all(`select * from employees e where book_id = ? and (active = 1 or exists (select 1 from timesheets t where t.employee_id = e.id and t.work_date between ? and ?))
      order by active desc, code`, b, from, to)
    : me ? [me] : [];
  const ids = emps.map((e) => e.id);
  const entries = ids.length ? all(`select t.id, t.employee_id, t.work_date, t.shift_id, t.status, t.check_in, t.check_out, t.hours, t.late_minutes, t.early_minutes,
      t.ot_hours, t.note, t.self_marked, s.name as shift_name, s.start_time, s.end_time
    from timesheets t left join shifts s on s.id = t.shift_id where t.employee_id in ${inList(ids)} and t.work_date between ? and ?
    order by t.work_date, s.start_time`, ...ids, from, to) : [];
  const locks = ids.length ? all(`select l.employee_id, s.period_from, s.period_to, s.code from paysheet_lines l join paysheets s on s.id = l.paysheet_id
    where s.status = 'chot' and s.period_from <= ? and s.period_to >= ? and l.employee_id in ${inList(ids)}`, to, from, ...ids) : [];
  const schedules = ids.length ? all(`select w.employee_id, w.weekday, w.shift_id, s.name, s.start_time, s.end_time from work_schedules w
    join shifts s on s.id = w.shift_id where s.active = 1 and w.employee_id in ${inList(ids)} order by s.start_time`, ...ids) : [];
  const people = emps.map((e) => {
    const c = calcPay(b, e, from, to);
    const mine = entries.filter((t) => t.employee_id === e.id);
    const showPay = owner || e.id === me?.id;
    return {
      id: e.id, code: e.code, name: e.name, title: e.title, active: !!e.active, linked: !!e.user_id, is_me: e.id === me?.id,
      summary: { ...c.detail, rate: undefined, bonus_tier: undefined, self_count: mine.filter((t) => t.self_marked).length, marked_days: new Set(mine.map((t) => t.work_date)).size },
      pay: showPay ? { type: c.detail.type, rate: c.detail.rate, base: c.base, ot: c.ot, bonus: c.bonus, commission: c.commission, allowance: c.allowance, deduction: c.deduction, total: c.total } : null,
    };
  });
  const payslips = me ? all(`select l.id, s.code, s.name, s.period_from, s.period_to, s.status, l.base, l.ot, l.bonus, l.commission, l.allowance, l.deduction, l.adjust,
      l.total, l.paid, l.unpaid, l.breakdown
    from v_paysheet_lines l join paysheets s on s.id = l.paysheet_id where l.employee_id = ? and s.status <> 'huy' order by s.period_from desc limit 12`, me.id)
    .map((x) => ({ ...x, breakdown: json(x.breakdown) })) : [];
  const st = staffSettings(b);
  return {
    month, from, to, today: today(), now: nowHM(), me_id: me?.id || null, can_manage: manage, can_pay: owner,
    linked: !!me, employees: people, entries, locks, schedules,
    shifts: all(`select id, name, start_time, end_time, hours from shifts where book_id = ? and active = 1 order by start_time`, b),
    payslips, settings: { std_hours: st.std_hours, late_grace: st.late_grace },
  };
}

// Chấm một ngày (bấm ô trên lưới tháng). status 'xoa' = về "Chưa chấm".
export function att_save_day(p) {
  const b = p.book_id;
  const { self } = writer(b, p.employee_id);
  const d = p.work_date;
  const sid = nz(p.shift_id);
  const prev = one(`select * from timesheets where employee_id = ? and work_date = ? and coalesce(shift_id, '') = ?`, p.employee_id, d, sid || '');
  if (p.status === 'xoa') {
    if (prev) removeTimesheet(prev);
    return { removed: !!prev };
  }
  // Nhân viên không tự ghi giờ làm thêm (ảnh hưởng tiền lương): giữ nguyên số quản lý đã ghi
  const ot = self ? prev?.ot_hours ?? 0 : p.ot_hours;
  return writeTimesheet(b, { employee_id: p.employee_id, work_date: d, shift_id: sid, status: p.status, check_in: nz(p.check_in), check_out: nz(p.check_out),
    ot_hours: ot, note: p.note ?? prev?.note ?? null });
}

export function att_delete(p) {
  const t = one(`select * from timesheets where id = ?`, p.id);
  if (!t) fail('Không tìm thấy dòng chấm công');
  writer(t.book_id, t.employee_id);
  return removeTimesheet(t);
}

// Nhân viên bấm "Vào ca" / "Ra ca": giờ lấy theo đồng hồ máy chủ (giờ Việt Nam), không sửa tay được ở bước này.
// Vào ca: chọn ca trong lịch hôm nay chưa chấm, gần giờ hiện tại nhất; không có lịch thì chấm không theo ca.
export function att_clock(p) {
  const b = p.book_id;
  requirePerm(b, null);
  const me = myEmployee(b);
  if (!me) fail(NOT_LINKED, 403);
  const d = today(); const t = nowHM();
  const rows = all(`select * from timesheets where employee_id = ? and work_date = ?`, me.id, d);
  const open = rows.find((r) => WORK_STATUSES.includes(r.status) && r.check_in && !r.check_out);
  if (p.action === 'out') {
    if (!open) fail('Bạn chưa bấm "Vào ca" hôm nay');
    if (t === open.check_in) fail('Vừa vào ca — đợi ít nhất 1 phút rồi bấm "Ra ca"');
    writeTimesheet(b, { employee_id: me.id, work_date: d, shift_id: open.shift_id, status: open.status, check_in: open.check_in, check_out: t, ot_hours: open.ot_hours, note: open.note });
    return { check_out: t };
  }
  if (p.action !== 'in') fail('Thao tác không hợp lệ');
  if (open) fail('Bạn đang trong ca — bấm "Ra ca" khi về');
  const free = (sid) => { const r = rows.find((x) => (x.shift_id || '') === (sid || '')); return !r || !r.check_in; };
  const sched = all(`select s.* from work_schedules w join shifts s on s.id = w.shift_id where w.employee_id = ? and w.weekday = ? and s.active = 1`, me.id, weekday(d))
    .filter((s) => free(s.id)).sort((x, y) => Math.abs(mins(x.start_time) - mins(t)) - Math.abs(mins(y.start_time) - mins(t)));
  const sh = sched[0] || null;
  if (!sh && !free(null)) fail('Hôm nay bạn đã chấm vào và ra ca rồi');
  const prev = rows.find((x) => (x.shift_id || '') === (sh?.id || ''));
  writeTimesheet(b, { employee_id: me.id, work_date: d, shift_id: sh?.id || null, status: 'di_lam', check_in: t, ot_hours: prev?.ot_hours ?? 0, note: prev?.note ?? null });
  return { check_in: t, shift: sh?.name || null, late: sh ? Math.max(0, mins(t) - mins(sh.start_time)) : 0 };
}
