// Kết ca làm việc: thu ngân mở ca (tiền đầu ca trong quỹ tiền mặt), cuối ca đếm tiền thực có, phần mềm đối chiếu với
// tiền mặt thu / chi do chính người đó lập trong ca và lưu báo cáo bàn giao.
import { ctx, fail, one, oneN, all, insert, run, uuid, nowIso, num, trimNz, rnd } from '../lib/context.js';
import { requirePerm, nextCode, bookSettings } from './access.js';

const requireOn = (b) => { if (!bookSettings(b).shift_on) fail('Sổ chưa bật Kết ca làm việc (Thiết lập → Đơn hàng)'); };
const sums = (s, until) => oneN(`select
    coalesce(sum(case when (direction = 'thu' and fund_id = @f) or (direction = 'chuyen' and to_fund_id = @f) then amount - case when fund_id = @f then fee else 0 end else 0 end), 0) as cin,
    coalesce(sum(case when (direction = 'chi' and fund_id = @f) or (direction = 'chuyen' and fund_id = @f) then amount else 0 end), 0) as cout
  from payments where book_id = @b and voided = 0 and created_by = @u and created_at >= @a and created_at <= @z`,
{ b: s.book_id, f: s.fund_id, u: s.user_id, a: s.opened_at, z: until });

export function current_shift(p) {
  const b = p.book_id; requirePerm(b, 'thu_chi');
  const s = one(`select x.*, f.name as fund_name from cash_shifts x join funds f on f.id = x.fund_id where x.book_id = ? and x.user_id = ? and x.closed_at is null`, b, ctx.uid);
  if (!s) return null;
  const t = sums(s, nowIso());
  return { ...s, cash_in: t.cin, cash_out: t.cout, expected_cash: rnd(s.opening_cash + t.cin - t.cout) };
}

export function open_shift(p) {
  const b = p.book_id; requirePerm(b, 'thu_chi'); requireOn(b);
  if (one(`select 1 from cash_shifts where book_id = ? and user_id = ? and closed_at is null`, b, ctx.uid)) fail('Bạn đang có ca chưa kết — hãy kết ca trước');
  const f = one(`select id from funds where id = ? and book_id = ? and active = 1`, p.fund_id, b);
  if (!f) fail('Chọn quỹ tiền mặt của ca');
  const open = num(p.opening_cash) ?? 0; if (open < 0) fail('Tiền đầu ca không được âm');
  const id = uuid(); const code = nextCode(b, 'CA');
  insert('cash_shifts', { id, book_id: b, code, user_id: ctx.uid, fund_id: f.id, opened_at: nowIso(), opening_cash: open, note: trimNz(p.note) });
  return { id, code };
}

export function close_shift(p) {
  const b = p.book_id; requirePerm(b, 'thu_chi');
  const s = one(`select * from cash_shifts where id = ? and book_id = ?`, p.id, b);
  if (!s) fail('Không tìm thấy ca');
  if (s.closed_at) fail(`Ca ${s.code} đã kết`);
  if (s.user_id !== ctx.uid && !one(`select 1 from book_members where book_id = ? and user_id = ? and role = 'owner'`, b, ctx.uid)) fail('Chỉ người mở ca hoặc quản lý sổ được kết ca');
  const counted = num(p.counted_cash); if (counted == null || counted < 0) fail('Nhập số tiền mặt đếm được cuối ca');
  const at = nowIso(); const t = sums(s, at);
  const expected = rnd(s.opening_cash + t.cin - t.cout);
  run(`update cash_shifts set closed_at = ?, cash_in = ?, cash_out = ?, expected_cash = ?, counted_cash = ?, diff = ?, note = coalesce(?, note) where id = ?`,
    at, t.cin, t.cout, expected, counted, rnd(counted - expected), trimNz(p.note), s.id);
  return { code: s.code, expected_cash: expected, counted_cash: counted, diff: rnd(counted - expected) };
}

export function shift_list(p) {
  const b = p.book_id; requirePerm(b, 'thu_chi');
  const own = one(`select role from book_members where book_id = ? and user_id = ?`, b, ctx.uid)?.role === 'owner';
  return all(`select x.*, f.name as fund_name, coalesce(m.display_name, u.name, u.email) as user_name from cash_shifts x join funds f on f.id = x.fund_id
      join users u on u.id = x.user_id left join book_members m on m.book_id = x.book_id and m.user_id = x.user_id
    where x.book_id = ? and (? or x.user_id = ?) order by x.opened_at desc limit 300`, b, own ? 1 : 0, ctx.uid);
}
