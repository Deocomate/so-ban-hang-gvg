// Quản trị người dùng (chỉ Tổng quản trị): mời, sửa thông tin, cấp quyền theo từng sổ, khóa, đăng xuất từ xa,
// vai trò mẫu, nhật ký bảo mật.
import { ctx, fail, one, all, run, insert, uuid, nowIso, json, nz, trimNz, int, outRows } from '../lib/context.js';
import { requireAdmin, loadMembers } from './access.js';
import { setMembership } from './books.js';
import { PERM_GROUPS, PERM_KEYS } from '../lib/labels.js';
import { inviteUser, resendInvite, sendResetFor, syncAdminBooks, secLog, normEmail } from '../lib/auth.js';

const ACCESS = ['none', 'owner', 'staff'];
const userRow = (id) => { const u = one(`select * from users where id = ?`, id); if (!u) fail('Không tìm thấy tài khoản'); return u; };
const activeAdmins = (except) => one(`select count(*) n from users where is_admin = 1 and status = 'active' and id is not ?`, except ?? null).n;
const membershipsOf = (uid) => Object.fromEntries(all(`select book_id, role, role_id, perms, display_name from book_members where user_id = ?`, uid)
  .map((m) => [m.book_id, { access: m.role, role_id: m.role_id, perms: json(m.perms), display_name: m.display_name }]));

// Mọi thứ trang Quản trị cần trong 1 lần gọi
export function admin_overview() {
  requireAdmin();
  const users = all(`select id, email, name, phone, status, is_admin, email_verified_at, must_change_password, last_login_at, created_at from users
    order by is_admin desc, status = 'disabled', coalesce(name, email)`).map((u) => ({ ...u, is_admin: !!u.is_admin, must_change_password: !!u.must_change_password,
    books: membershipsOf(u.id) }));
  const roles = all(`select r.*, (select count(*) from book_members m where m.role_id = r.id) as used from roles r order by r.name`)
    .map((r) => ({ ...r, perms: json(r.perms) }));
  const books = all(`select id, name, short_name, is_demo from books order by created_at, rowid`).map((b) => ({ ...b, is_demo: !!b.is_demo }));
  return { users, roles, books, perm_groups: PERM_GROUPS, me: ctx.uid };
}

// p = {id?, email (khi tạo mới), name, phone, is_admin, books: {book_id: {access: none|owner|staff, role_id, perms, display_name}}}
export function admin_save_user(p) {
  requireAdmin();
  let id = nz(p.id);
  const before = id ? { ...userRow(id), books: membershipsOf(id) } : null;
  if (!id) id = inviteUser({ email: p.email, name: p.name, phone: p.phone }).id;
  else {
    const name = trimNz(p.name); const phone = trimNz(p.phone);
    if (phone && !/^[0-9+().\s-]{6,20}$/.test(phone)) fail('Số điện thoại không hợp lệ');
    run(`update users set name = ?, phone = ?, updated_at = ? where id = ?`, name ? name.slice(0, 100) : null, phone, nowIso(), id);
  }
  const makeAdmin = !!p.is_admin;
  if (before?.is_admin && !makeAdmin) {
    if (id === ctx.uid) fail('Không thể tự bỏ quyền Tổng quản trị của chính mình');
    if (!activeAdmins(id)) fail('Hệ thống phải còn ít nhất 1 Tổng quản trị');
  }
  run(`update users set is_admin = ? where id = ?`, makeAdmin ? 1 : 0, id);
  if (makeAdmin) syncAdminBooks(id);
  else {
    for (const [bookId, m] of Object.entries(p.books || {})) {
      const access = m?.access || 'none';
      if (!ACCESS.includes(access)) fail('Quyền truy cập sổ không hợp lệ');
      if (access === 'none') run(`delete from book_members where book_id = ? and user_id = ?`, bookId, id);
      else setMembership(bookId, id, { role: access, role_id: m.role_id, perms: m.perms ?? {}, display_name: m.display_name });
    }
  }
  const after = { ...userRow(id), books: membershipsOf(id) };
  secLog(before ? 'user_updated' : 'user_created', id, before
    ? { is_admin: [!!before.is_admin, !!after.is_admin], books: [before.books, after.books] }
    : { email: after.email, is_admin: !!after.is_admin, books: after.books });
  loadMembers();
  return { id };
}

export function admin_resend_invite(p) { requireAdmin(); resendInvite(p.user_id); return { ok: true }; }
export function admin_send_reset(p) { requireAdmin(); sendResetFor(p.user_id); return { ok: true }; }

// Khóa / mở khóa. Khóa: đăng xuất mọi thiết bị, ngừng nhận thông báo điện thoại.
export function admin_set_status(p) {
  requireAdmin();
  const u = userRow(p.user_id);
  if (u.id === ctx.uid) fail('Không thể tự khóa tài khoản của chính mình');
  if (p.disabled) {
    if (u.is_admin && !activeAdmins(u.id)) fail('Hệ thống phải còn ít nhất 1 Tổng quản trị');
    run(`update users set status = 'disabled', token_version = token_version + 1, updated_at = ? where id = ?`, nowIso(), u.id);
    run(`delete from push_subs where user_id = ?`, u.id);
    secLog('user_disabled', u.id);
  } else {
    run(`update users set status = ?, updated_at = ? where id = ?`, u.password_hash === '!' ? 'invited' : 'active', nowIso(), u.id);
    secLog('user_enabled', u.id);
  }
  return { ok: true };
}

export function admin_logout_user(p) {
  requireAdmin();
  userRow(p.user_id);
  run(`update users set token_version = token_version + 1 where id = ?`, p.user_id);
  secLog('logout_all', p.user_id);
  return { ok: true };
}

// ---------- Vai trò mẫu ----------
export function admin_save_role(p) {
  requireAdmin();
  const name = trimNz(p.name);
  if (!name) fail('Nhập tên vai trò');
  const keys = Array.isArray(p.perms) ? p.perms : Object.keys(p.perms || {}).filter((k) => p.perms[k] === true);
  const bad = keys.find((k) => !PERM_KEYS.includes(k));
  if (bad) fail(`Quyền "${bad}" không có`);
  if (!keys.length) fail('Chọn ít nhất 1 quyền cho vai trò');
  const perms = Object.fromEntries(keys.map((k) => [k, true]));
  let id = nz(p.id);
  if (one(`select 1 from roles where name = ? and id is not ?`, name, id)) fail(`Đã có vai trò "${name}"`);
  if (!id) { id = uuid(); insert('roles', { id, name: name.slice(0, 80), description: trimNz(p.description), perms, created_at: nowIso() }); }
  else if (!run(`update roles set name = ?, description = ?, perms = ? where id = ?`, name.slice(0, 80), trimNz(p.description), perms, id).changes) fail('Không tìm thấy vai trò');
  secLog('role_saved', null, { role_id: id, name, perms: keys });
  return { id };
}

export function admin_delete_role(p) {
  requireAdmin();
  const r = one(`select * from roles where id = ?`, p.id);
  if (!r) fail('Không tìm thấy vai trò');
  const n = one(`select count(*) n from book_members where role_id = ?`, r.id).n;
  if (n) fail(`Còn ${n} người đang dùng vai trò "${r.name}" — hãy đổi vai trò của họ trước`);
  run(`delete from roles where id = ?`, r.id);
  secLog('role_deleted', null, { name: r.name });
  return { ok: true };
}

// ---------- Nhật ký bảo mật ----------
export function admin_security_log(p) {
  requireAdmin();
  const lim = Math.min(Math.max(int(p.limit) || 300, 1), 2000);
  const where = []; const args = [];
  if (nz(p.user_id)) { where.push('(l.user_id = ? or l.actor_id = ?)'); args.push(p.user_id, p.user_id); }
  if (nz(p.email)) { const e = normEmail(p.email); where.push(`(u.email = ? or json_extract(l.detail, '$.email') = ?)`); args.push(e, e); }
  return outRows(all(`select l.id, l.at, l.event, l.ip, l.detail, l.user_id, u.email as user_email, u.name as user_name, l.actor_id, a.email as actor_email
    from security_log l left join users u on u.id = l.user_id left join users a on a.id = l.actor_id
    ${where.length ? 'where ' + where.join(' and ') : ''} order by l.id desc limit ${lim}`, ...args));
}
