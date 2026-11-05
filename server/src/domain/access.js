// Quyền truy cập theo sổ, số chứng từ, chống ghi trùng, kiểm tra ngày chứng từ.
import { ctx, fail, one, all, run, val, json, today, dmy, nowIso } from '../lib/context.js';
import { permLabel, PERM_KEYS, PERM_IMPLIES } from '../lib/labels.js';

const on = (v) => v === true || v === 'true' || v === 1;

// Quyền hiệu lực của 1 thành viên sổ: Quản lý sổ có hết; nhân viên = quyền của vai trò mẫu, ghi đè bằng phần chỉnh riêng
// (true/false từng ô), rồi quyền sửa kéo theo quyền xem cùng nhóm.
export function effectivePerms(role, roleId, overrides) {
  if (role === 'owner') return Object.fromEntries(PERM_KEYS.map((k) => [k, true]));
  const base = roleId ? json(val(`select perms from roles where id = ?`, roleId)) : {};
  const merged = { ...base, ...json(overrides) };
  const out = {};
  for (const k of PERM_KEYS) {
    if (!on(merged[k])) continue;
    out[k] = true;
    for (const i of PERM_IMPLIES[k] || []) out[i] = true;
  }
  return out;
}
const memberOf = (r) => (r ? { role: r.role, perms: effectivePerms(r.role, r.role_id, r.perms) } : null);

// Đặt người đang gọi và nạp quyền của họ vào bộ nhớ (view cần đọc quyền mà không truy vấn lại)
export function setUser(uid) {
  ctx.uid = uid || null;
  loadMembers();
}
export function loadMembers() {
  ctx.members = new Map();
  if (!ctx.uid) return;
  for (const m of all(`select book_id, role, role_id, perms from book_members where user_id = ?`, ctx.uid)) ctx.members.set(m.book_id, memberOf(m));
}

const allowed = (m, perm) => {
  if (!m) return false;
  if (m.role === 'owner' || perm == null) return true;
  if (perm === 'owner') return false;
  return m.perms?.[perm] === true;
};

// Tổng quản trị (quản lý người dùng, vai trò, nhật ký bảo mật của cả hệ thống)
export function requireAdmin() {
  if (!ctx.uid) fail('Bạn chưa đăng nhập', 401);
  if (!one(`select 1 from users where id = ? and is_admin = 1 and status = 'active'`, ctx.uid)) fail('Chỉ Tổng quản trị được thực hiện thao tác này', 403);
}

// Có quyền không (không báo lỗi)
export const can = (book, perm) => allowed(ctx.members.get(book), perm);
export const isOwner = (book) => ctx.members.get(book)?.role === 'owner';

// Bắt buộc có quyền (báo lỗi tiếng Việt)
export function requirePerm(book, perm) {
  if (!ctx.uid) fail('Bạn chưa đăng nhập', 401);
  const m = memberOf(book ? one(`select role, role_id, perms from book_members where book_id = ? and user_id = ?`, book, ctx.uid) : null);
  if (!m) fail('Bạn không có quyền truy cập sổ này', 403);
  if (m.role === 'owner' || perm == null) return;
  if (perm === 'owner') fail('Chỉ chủ cửa hàng (Quản lý sổ) được thực hiện thao tác này', 403);
  if (!allowed(m, perm)) fail(`Bạn chưa được cấp quyền: ${permLabel(perm)}`, 403);
}

// Thành viên bất kỳ (không phải người đang gọi) có quyền không
export function memberCan(book, user, perm) {
  return allowed(memberOf(one(`select role, role_id, perms from book_members where book_id = ? and user_id = ?`, book, user)), perm);
}

export const bookSettings = (book) => json(val(`select settings from books where id = ?`, book));
export const setting = (book, key) => bookSettings(book)[key];

// Số chứng từ tự tăng, không trùng
export function nextCode(book, kind) {
  const n = val(`insert into doc_counters (book_id, kind, last_no) values (?, ?, 1)
    on conflict (book_id, kind) do update set last_no = last_no + 1 returning last_no`, book, kind);
  return kind + String(n).padStart(5, '0');
}

// Mã danh mục chưa ai dùng (SKU / mã khách / mã NCC)
export function newMasterCode(book, kind, table) {
  const col = table === 'products' ? 'sku' : 'code';
  for (;;) {
    const c = nextCode(book, kind);
    if (!one(`select 1 from ${table} where book_id = ? and lower(${col}) = lower(?)`, book, c)) return c;
  }
}

// Kiểm tra ngày chứng từ: không để trống, không ở tương lai, không rơi vào kỳ đã khóa sổ
export function checkDate(book, d) {
  if (!d) fail('Thiếu ngày chứng từ');
  if (d > today()) fail(`Ngày ${dmy(d)} ở tương lai — không thể ghi nhận trước`);
  const lk = setting(book, 'lock_date') || null;
  if (lk && d <= lk) fail(`Sổ đã khóa đến ngày ${dmy(lk)} — không thể ghi chứng từ ngày ${dmy(d)}`);
  return d;
}

// ---------- Chống ghi trùng khi bấm nút nhiều lần ----------
// Mỗi lần mở form, ứng dụng tạo 1 mã yêu cầu (request_id). Gửi lại cùng mã → trả về kết quả cũ.
export function reqBegin(req, book, fn) {
  if (!req) return null;
  const ex = one(`select result from request_log where request_id = ?`, String(req));
  if (ex) return { ...(json(ex.result, null) || {}), duplicate: true };
  run(`insert into request_log (request_id, book_id, fn, user_id, created_at) values (?, ?, ?, ?, ?)`, String(req), book, fn, ctx.uid, nowIso());
  return null;
}
export function reqEnd(req, res) {
  if (req) run(`update request_log set result = ? where request_id = ?`, JSON.stringify(res), String(req));
  return res;
}
// Bọc 1 thao tác ghi bằng chống ghi trùng
export function once(p, book, fn, body) {
  const dup = reqBegin(p.request_id, book, fn);
  if (dup) return dup;
  return reqEnd(p.request_id, body());
}
