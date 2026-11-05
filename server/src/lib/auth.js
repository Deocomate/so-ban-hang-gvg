// Tài khoản đăng nhập: email + mật khẩu (scrypt), phiên đăng nhập bằng token ký HMAC.
// Không có tự đăng ký: Tổng quản trị mời qua email, người được mời bấm link đặt mật khẩu (đồng thời xác thực email).
// Đổi / đặt lại mật khẩu, khóa tài khoản, "đăng xuất mọi thiết bị" → tăng token_version → mọi phiên cũ hết hiệu lực.
// Link trong email: mã ngẫu nhiên 32 byte, CSDL chỉ giữ bản băm SHA-256, dùng 1 lần, có hạn.
import crypto from 'node:crypto';
import { ctx, fail, one, all, run, insert, uuid, nowIso, trimNz } from './context.js';
import { createDefaultBooks, demoFlag } from '../domain/books.js';
import { queueMail, requireMail, appLink } from './mail.js';

export const SAMPLE_STAFF_EMAIL = 'lan.nhanvien@demo.vn';
// Tài khoản thử theo từng vai trò mẫu (chỉ có trong dữ liệu mẫu), vd. "Thủ kho" → thu-kho.mau@demo.vn
export const SAMPLE_ROLE_EMAIL = (roleName) => `${String(roleName).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.mau@demo.vn`;
// Ghi nhớ đăng nhập: 30 ngày; không ghi nhớ (máy dùng chung): 12 giờ và trình duyệt xóa phiên khi đóng
const TOKEN_SECONDS = { remember: 30 * 86400, session: 12 * 3600 };
const HOUR = 3600e3;
const TTL = { invite: 7 * 24 * HOUR, verify_email: 48 * HOUR, reset_password: HOUR, change_email: 24 * HOUR };
const NO_PASSWORD = '!';   // tài khoản đã mời, chưa đặt mật khẩu: không khớp mật khẩu nào
const b64u = (buf) => Buffer.from(buf).toString('base64url');

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${b64u(salt)}$${b64u(hash)}`;
}
function verifyPassword(pw, stored) {
  const [alg, n, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || typeof pw !== 'string') return false;
  const got = crypto.scryptSync(pw, Buffer.from(salt, 'base64url'), 32, { N: Number(n), r: 8, p: 1 });
  const want = Buffer.from(hash, 'base64url');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

function sign(payload, secret) {
  const body = b64u(JSON.stringify(payload));
  return `${body}.${b64u(crypto.createHmac('sha256', secret).update(body).digest())}`;
}
export function issueToken(user, secret, remember = true) {
  return sign({ sub: user.id, v: user.token_version, rem: remember ? 1 : 0, exp: Math.floor(Date.now() / 1000) + TOKEN_SECONDS[remember ? 'remember' : 'session'] }, secret);
}
// Trả về tài khoản (đang hoạt động) nếu token hợp lệ, ngược lại null
export function verifyToken(token, secret) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const want = b64u(crypto.createHmac('sha256', secret).update(body).digest());
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  let p; try { p = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
  if (!p.exp || p.exp < Date.now() / 1000) return null;
  const u = one(`select id, token_version, status, must_change_password from users where id = ?`, p.sub);
  return u && u.token_version === p.v && u.status === 'active' ? { ...u, remember: p.rem !== 0 } : null;
}

export const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, phone: u.phone ?? null, is_admin: !!u.is_admin,
  email_verified: !!u.email_verified_at, must_change_password: !!u.must_change_password });

// Mật khẩu mới: 8–200 ký tự, có cả chữ và số, không trùng email
export function checkPassword(pw, email) {
  if (typeof pw !== 'string' || pw.length < 8) fail('Mật khẩu cần ít nhất 8 ký tự');
  if (pw.length > 200) fail('Mật khẩu quá dài');
  if (!/\p{L}/u.test(pw) || !/\d/.test(pw)) fail('Mật khẩu cần có cả chữ và số');
  if (email && pw.toLowerCase() === String(email).toLowerCase()) fail('Mật khẩu không được trùng email');
}
export const normEmail = (e) => {
  const s = String(e ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || s.length > 200) fail('Email không hợp lệ');
  return s;
};
const cleanName = (v) => (trimNz(v) ? String(v).trim().slice(0, 100) : null);
const cleanPhone = (v) => { const s = trimNz(v); if (s && !/^[0-9+().\s-]{6,20}$/.test(s)) fail('Số điện thoại không hợp lệ'); return s; };
const userById = (id) => one(`select * from users where id = ?`, id);
const userByEmail = (e) => one(`select * from users where email = ?`, String(e ?? '').trim().toLowerCase());

// ---------- Nhật ký bảo mật ----------
export function secLog(event, userId, detail = {}) {
  run(`insert into security_log (at, user_id, actor_id, event, ip, detail) values (?, ?, ?, ?, ?, ?)`, nowIso(), userId ?? null, ctx.uid ?? null, event, ctx.ip ?? null, detail);
}

// ---------- Link dùng 1 lần ----------
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
function newLinkToken(userId, kind, newEmail = null) {
  run(`delete from auth_tokens where user_id = ? and kind = ? and used_at is null`, userId, kind);   // link cũ cùng loại hết hiệu lực
  const raw = crypto.randomBytes(32).toString('base64url');
  insert('auth_tokens', { id: uuid(), user_id: userId, kind, token_hash: sha(raw), new_email: newEmail, expires_at: new Date(Date.now() + TTL[kind]).toISOString(), created_at: nowIso() });
  return raw;
}
function findLinkToken(raw, kinds) {
  const t = raw ? one(`select * from auth_tokens where token_hash = ?`, sha(raw)) : null;
  if (!t || !kinds.includes(t.kind) || t.used_at || t.expires_at < nowIso()) fail('Link không hợp lệ hoặc đã hết hạn — hãy yêu cầu gửi lại link mới', 400);
  return t;
}
const useLinkToken = (t) => run(`update auth_tokens set used_at = ? where id = ?`, nowIso(), t.id);

// ---------- Thư ----------
const hello = (u) => `Chào ${u.name || u.email},`;
function mailInvite(u) {
  requireMail();
  const link = appLink('nhan-loi-moi', newLinkToken(u.id, 'invite'));
  queueMail(u.email, 'Lời mời dùng Sổ bán hàng gốm', `${hello(u)}\n\nBạn được mời dùng Sổ bán hàng gốm với email ${u.email}.\nBấm link dưới đây để đặt mật khẩu và kích hoạt tài khoản (hạn 7 ngày, dùng 1 lần):\n\n${link}\n\nNếu bạn không biết lời mời này, hãy bỏ qua thư.`);
}
function mailReset(u) {
  requireMail();
  const link = appLink('dat-lai-mat-khau', newLinkToken(u.id, 'reset_password'));
  queueMail(u.email, 'Đặt lại mật khẩu Sổ bán hàng gốm', `${hello(u)}\n\nCó yêu cầu đặt lại mật khẩu cho tài khoản ${u.email}.\nBấm link dưới đây để đặt mật khẩu mới (hạn 60 phút, dùng 1 lần):\n\n${link}\n\nNếu bạn không yêu cầu, hãy bỏ qua thư — mật khẩu hiện tại vẫn giữ nguyên.`);
}
function mailVerify(u) {
  requireMail();
  const link = appLink('xac-thuc-email', newLinkToken(u.id, 'verify_email'));
  queueMail(u.email, 'Xác thực email Sổ bán hàng gốm', `${hello(u)}\n\nBấm link dưới đây để xác thực email ${u.email} (hạn 48 giờ):\n\n${link}`);
}
const mailNotice = (u, subject, what) => queueMail(u.email, subject,
  `${hello(u)}\n\n${what}\nThời điểm: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}${ctx.ip ? ` · IP ${ctx.ip}` : ''}\n\nNếu không phải bạn làm, hãy báo ngay cho Tổng quản trị và dùng "Quên mật khẩu" để đặt mật khẩu mới.`);

function setPassword(u, password, { mustChange = false } = {}) {
  run(`update users set password_hash = ?, token_version = token_version + 1, must_change_password = ?, updated_at = ? where id = ?`,
    hashPassword(password), mustChange ? 1 : 0, nowIso(), u.id);
}

// ---------- Tạo tài khoản ----------
// Chỉ dùng trong mã (dữ liệu mẫu, kiểm thử, tài khoản quản trị đầu tiên); người dùng thật được tạo bằng lời mời
export function createUser({ email, password, name, isAdmin = false, verified = true, mustChange = false }) {
  const e = normEmail(email); checkPassword(password, e);
  if (userByEmail(e)) fail('Email này đã có tài khoản');
  const now = nowIso();
  const u = { id: uuid(), email: e, name: cleanName(name), password_hash: hashPassword(password), token_version: 0, created_at: now, status: 'active',
    is_admin: isAdmin ? 1 : 0, email_verified_at: verified ? now : null, must_change_password: mustChange ? 1 : 0 };
  insert('users', u);
  return u;
}

// Tổng quản trị mời người mới: tài khoản chờ kích hoạt + thư mời
export function inviteUser({ email, name, phone }) {
  const e = normEmail(email);
  if (userByEmail(e)) fail(`Email ${e} đã có tài khoản`);
  const u = { id: uuid(), email: e, name: cleanName(name), phone: cleanPhone(phone), password_hash: NO_PASSWORD, token_version: 0, status: 'invited', created_at: nowIso() };
  insert('users', u);
  mailInvite(u);
  secLog('invite_sent', u.id, { email: e });
  return u;
}
export function resendInvite(userId) {
  const u = userById(userId);
  if (!u || u.status !== 'invited') fail('Tài khoản này đã kích hoạt — không cần mời lại');
  mailInvite(u);
  secLog('invite_sent', u.id, { email: u.email, resend: true });
}

// ---------- Đăng nhập ----------
// Không ghi nhật ký ở đây (lỗi làm hủy giao dịch); http.js ghi sau khi biết kết quả
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));
export function signIn({ email, password }) {
  const u = userByEmail(email);
  // Email không có tài khoản vẫn tính băm mật khẩu như thường để không đoán được email nào tồn tại qua thời gian trả lời
  const ok = verifyPassword(password, u && u.password_hash !== NO_PASSWORD ? u.password_hash : DUMMY_HASH);
  if (!u || !ok) fail('Email hoặc mật khẩu không đúng', 401);
  if (u.status === 'disabled') fail('Tài khoản đã bị khóa — liên hệ Tổng quản trị', 403);
  run(`update users set last_login_at = ? where id = ?`, nowIso(), u.id);
  secLog('login_ok', u.id);
  return u;
}
export const loginFailed = (email, reason) => secLog('login_fail', userByEmail(email)?.id ?? null, { email: String(email ?? '').slice(0, 200), reason });

// ---------- Quên mật khẩu ----------
// Luôn trả lời giống nhau để không dò được email nào có tài khoản
export function requestPasswordReset({ email }) {
  requireMail();
  const u = userByEmail(email);
  if (u?.status === 'active') mailReset(u);
  else if (u?.status === 'invited') mailInvite(u);
  secLog('reset_requested', u?.id ?? null, { email: String(email ?? '').slice(0, 200) });
  return { ok: true };
}

export function resetPassword({ token, password }) {
  const t = findLinkToken(token, ['reset_password']);
  const u = userById(t.user_id);
  if (u.status !== 'active') fail('Tài khoản đã bị khóa — liên hệ Tổng quản trị', 403);
  checkPassword(password, u.email);
  useLinkToken(t);
  setPassword(u, password);
  run(`update users set email_verified_at = coalesce(email_verified_at, ?) where id = ?`, nowIso(), u.id);   // nhận được thư → email đúng là của họ
  mailNotice(u, 'Mật khẩu Sổ bán hàng gốm vừa được đặt lại', 'Mật khẩu tài khoản của bạn vừa được đặt lại bằng link quên mật khẩu. Mọi thiết bị đang đăng nhập đã bị đăng xuất.');
  secLog('password_reset', u.id);
  return userById(u.id);
}

export function acceptInvite({ token, password, name }) {
  const t = findLinkToken(token, ['invite']);
  const u = userById(t.user_id);
  if (u.status !== 'invited') fail('Tài khoản đã được kích hoạt — hãy đăng nhập');
  checkPassword(password, u.email);
  useLinkToken(t);
  setPassword(u, password);
  run(`update users set status = 'active', email_verified_at = ?, name = coalesce(?, name) where id = ?`, nowIso(), cleanName(name), u.id);
  secLog('invite_accepted', u.id);
  return userById(u.id);
}

// Xác thực email (lần đầu hoặc email mới sau khi đổi)
export function verifyEmail({ token }) {
  const t = findLinkToken(token, ['verify_email', 'change_email']);
  const u = userById(t.user_id);
  useLinkToken(t);
  if (t.kind === 'change_email') {
    if (userByEmail(t.new_email)) fail(`Email ${t.new_email} đã có tài khoản khác dùng`);
    run(`update users set email = ?, email_verified_at = ?, updated_at = ? where id = ?`, t.new_email, nowIso(), nowIso(), u.id);
    mailNotice(u, 'Email đăng nhập Sổ bán hàng gốm đã đổi', `Email đăng nhập của bạn đã đổi từ ${u.email} sang ${t.new_email}. Từ nay hãy đăng nhập bằng email mới.`);
    secLog('email_changed', u.id, { from: u.email, to: t.new_email });
  } else {
    run(`update users set email_verified_at = coalesce(email_verified_at, ?) where id = ?`, nowIso(), u.id);
    secLog('email_verified', u.id);
  }
  return { ok: true, email: t.new_email || u.email };
}

// Xem link thuộc loại nào, của email nào (không dùng mất link) — để trang đặt mật khẩu hiện đúng thông tin
export function linkInfo({ token }) {
  const t = findLinkToken(token, ['invite', 'reset_password', 'verify_email', 'change_email']);
  const u = userById(t.user_id);
  return { kind: t.kind, email: u.email, name: u.name, new_email: t.new_email };
}

// ---------- Tài khoản của tôi ----------
export function changePassword(uid, { old_password: oldPw, password }) {
  const u = userById(uid);
  if (!u || !verifyPassword(oldPw, u.password_hash)) fail('Mật khẩu hiện tại không đúng');
  checkPassword(password, u.email);
  if (oldPw === password) fail('Mật khẩu mới phải khác mật khẩu hiện tại');
  setPassword(u, password);
  mailNotice(u, 'Mật khẩu Sổ bán hàng gốm vừa được đổi', 'Mật khẩu tài khoản của bạn vừa được đổi. Các thiết bị khác đang đăng nhập đã bị đăng xuất.');
  secLog('password_changed', u.id);
  return userById(uid);
}

export function updateProfile(uid, { name, phone }) {
  run(`update users set name = ?, phone = ?, updated_at = ? where id = ?`, cleanName(name), cleanPhone(phone), nowIso(), uid);
  secLog('profile_updated', uid);
  return userById(uid);
}

export function requestEmailChange(uid, { new_email: newEmail, password }) {
  const u = userById(uid);
  if (!verifyPassword(password, u.password_hash)) fail('Mật khẩu hiện tại không đúng');
  const e = normEmail(newEmail);
  if (e === u.email) fail('Email mới trùng email hiện tại');
  if (userByEmail(e)) fail(`Email ${e} đã có tài khoản khác dùng`);
  requireMail();
  const link = appLink('xac-thuc-email', newLinkToken(u.id, 'change_email', e));
  queueMail(e, 'Xác nhận email mới cho Sổ bán hàng gốm', `${hello(u)}\n\nBấm link dưới đây để xác nhận đổi email đăng nhập từ ${u.email} sang ${e} (hạn 24 giờ):\n\n${link}\n\nChưa bấm link thì email đăng nhập vẫn là ${u.email}.`);
  mailNotice(u, 'Có yêu cầu đổi email đăng nhập', `Có yêu cầu đổi email đăng nhập sang ${e}. Email chỉ đổi khi link gửi tới ${e} được bấm.`);
  secLog('email_change_requested', u.id, { to: e });
  return { ok: true };
}

export function resendVerification(uid) {
  const u = userById(uid);
  if (u.email_verified_at) fail('Email đã được xác thực');
  mailVerify(u);
  return { ok: true };
}

export function logoutAll(uid) {
  run(`update users set token_version = token_version + 1 where id = ?`, uid);
  secLog('logout_all', uid);
  return userById(uid);
}

export const me = (uid) => { const u = userById(uid); return u && u.status === 'active' ? publicUser(u) : null; };

// ---------- Dành cho Tổng quản trị ----------
export function sendResetFor(userId) {
  const u = userById(userId);
  if (!u) fail('Không tìm thấy tài khoản');
  if (u.status !== 'active') fail(u.status === 'invited' ? 'Tài khoản chưa kích hoạt — hãy gửi lại lời mời' : 'Tài khoản đang bị khóa');
  mailReset(u);
  secLog('reset_sent_by_admin', u.id);
}

// ---------- Trên máy chủ ----------
// Lệnh khẩn cấp `npm run reset-password` (người có quyền vào máy chủ): bắt đổi mật khẩu ở lần đăng nhập tới,
// ghi nhật ký bảo mật và gửi thư báo cho chủ tài khoản → không thể đặt lại lén.
export function setPasswordByEmail(email, password) {
  const u = userByEmail(email);
  if (!u) fail(`Không có tài khoản ${email}`);
  checkPassword(password, u.email);
  setPassword(u, password, { mustChange: true });
  if (u.status === 'invited') run(`update users set status = 'active', email_verified_at = coalesce(email_verified_at, ?) where id = ?`, nowIso(), u.id);
  mailNotice(u, 'Mật khẩu Sổ bán hàng gốm vừa được đặt lại trên máy chủ', 'Mật khẩu tài khoản của bạn vừa được đặt lại bằng lệnh trên máy chủ. Mọi thiết bị đã bị đăng xuất; lần đăng nhập tới bạn phải đổi mật khẩu.');
  secLog('cli_password_reset', u.id);
}

// Owner rows của Tổng quản trị ở mọi sổ (Tổng quản trị luôn là Quản lý sổ ở cả 3 sổ)
export function syncAdminBooks(userId) {
  const scope = demoFlag.on ? 'where true' : 'where is_demo = 0';
  run(`insert into book_members (book_id, user_id, role, display_name, created_at) select id, ?, 'owner', 'Tổng quản trị', ? from books ${scope}
    on conflict (book_id, user_id) do update set role = 'owner', role_id = null`, userId, nowIso());
}

// Tổng quản trị đầu tiên từ ADMIN_EMAIL / ADMIN_PASSWORD, chạy mỗi lần máy chủ khởi động.
// Bản chạy thật: chỉ tạo khi hệ thống CHƯA có Tổng quản trị nào, bắt đổi mật khẩu ở lần đăng nhập đầu; về sau .env không đặt lại
// được mật khẩu (người giữ tệp .env, kể cả dev, không biết được mật khẩu quản trị).
// Chế độ dữ liệu mẫu (DEMO_MODE, máy dev): như cũ, mật khẩu luôn theo .env, nhân viên mẫu dùng chung mật khẩu.
export function ensureAdmin(email, password) {
  const e = normEmail(email);
  let u = userByEmail(e);
  let action = 'giữ nguyên';
  if (demoFlag.on) {
    checkPassword(password, e);
    if (!u) { u = createUser({ email: e, password, name: 'Quản trị', isAdmin: true }); action = 'đã tạo'; }
    else if (!verifyPassword(password, u.password_hash)) { setPassword(u, password); action = 'đã đặt lại mật khẩu'; }
    run(`update users set is_admin = 1, status = 'active' where id = ?`, u.id);
    // Tài khoản nhân viên mẫu dùng chung mật khẩu với quản trị mẫu
    for (const s of all(`select * from users where email = ? or email like '%.mau@demo.vn'`, SAMPLE_STAFF_EMAIL)) {
      if (!verifyPassword(password, s.password_hash)) setPassword(s, password);
    }
  } else if (!u) {
    if (one(`select 1 from users where is_admin = 1`)) return { email: e, action: 'bỏ qua — hệ thống đã có Tổng quản trị' };
    checkPassword(password, e);
    u = createUser({ email: e, password, name: 'Tổng quản trị', isAdmin: true, verified: false, mustChange: true });
    secLog('admin_bootstrap', u.id, { email: e });
    action = 'đã tạo (lần đăng nhập đầu phải đổi mật khẩu)';
  } else if (!u.is_admin) {
    return { email: e, action: 'bỏ qua — tài khoản này không phải Tổng quản trị' };
  } else if (!u.must_change_password && verifyPassword(password, u.password_hash)) {
    // Mật khẩu đang dùng vẫn là mật khẩu ghi trong .env (ai đọc được .env đều biết) → bắt đổi ở lần đăng nhập tới
    run(`update users set must_change_password = 1 where id = ?`, u.id);
    secLog('admin_env_password_flagged', u.id);
    action = 'mật khẩu còn trùng .env → bắt đổi ở lần đăng nhập tới';
  }
  const scope = demoFlag.on ? 'where true' : 'where is_demo = 0';
  if (!one(`select 1 from books ${scope}`)) createDefaultBooks(u.id);
  syncAdminBooks(u.id);
  return { email: e, action };
}
