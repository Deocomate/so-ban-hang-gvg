// Tài khoản đăng nhập: email + mật khẩu (scrypt), phiên đăng nhập bằng token ký HMAC.
// Đổi mật khẩu → tăng token_version → mọi phiên cũ của tài khoản đó hết hiệu lực.
import crypto from 'node:crypto';
import { fail, one, run, insert, uuid, nowIso, trimNz } from './context.js';
import { requirePerm } from '../domain/access.js';

const TOKEN_DAYS = 30;
const b64u = (buf) => Buffer.from(buf).toString('base64url');

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${b64u(salt)}$${b64u(hash)}`;
}
function verifyPassword(pw, stored) {
  const [alg, n, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const got = crypto.scryptSync(pw, Buffer.from(salt, 'base64url'), 32, { N: Number(n), r: 8, p: 1 });
  const want = Buffer.from(hash, 'base64url');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

function sign(payload, secret) {
  const body = b64u(JSON.stringify(payload));
  return `${body}.${b64u(crypto.createHmac('sha256', secret).update(body).digest())}`;
}
export function issueToken(user, secret) {
  return sign({ sub: user.id, v: user.token_version, exp: Math.floor(Date.now() / 1000) + TOKEN_DAYS * 86400 }, secret);
}
// Trả về id người dùng nếu token hợp lệ, ngược lại null
export function verifyToken(token, secret) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const want = b64u(crypto.createHmac('sha256', secret).update(body).digest());
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  let p; try { p = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
  if (!p.exp || p.exp < Date.now() / 1000) return null;
  const u = one(`select id, token_version from users where id = ?`, p.sub);
  return u && u.token_version === p.v ? u.id : null;
}

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name });
const checkPassword = (pw) => { if (typeof pw !== 'string' || pw.length < 6) fail('Mật khẩu cần ít nhất 6 ký tự'); if (pw.length > 200) fail('Mật khẩu quá dài'); };
const normEmail = (e) => {
  const s = String(e ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || s.length > 200) fail('Email không hợp lệ');
  return s;
};

export function signUp({ email, password, name }) {
  const e = normEmail(email); checkPassword(password);
  if (one(`select 1 from users where email = ?`, e)) fail('Email này đã có tài khoản — hãy đăng nhập');
  const u = { id: uuid(), email: e, name: trimNz(name) ? String(name).trim().slice(0, 100) : null, password_hash: hashPassword(password), token_version: 0, created_at: nowIso() };
  insert('users', u);
  return u;
}

export function signIn({ email, password }) {
  const u = one(`select * from users where email = ?`, String(email ?? '').trim().toLowerCase());
  if (!u || typeof password !== 'string' || !verifyPassword(password, u.password_hash)) fail('Email hoặc mật khẩu không đúng', 401);
  return u;
}

export function changePassword(uid, { old_password: oldPw, password }) {
  const u = one(`select * from users where id = ?`, uid);
  if (!u || typeof oldPw !== 'string' || !verifyPassword(oldPw, u.password_hash)) fail('Mật khẩu hiện tại không đúng');
  checkPassword(password);
  run(`update users set password_hash = ?, token_version = token_version + 1 where id = ?`, hashPassword(password), uid);
  return one(`select * from users where id = ?`, uid);
}

// Đặt mật khẩu bằng dòng lệnh trên máy chủ (quên mật khẩu, kể cả chủ cửa hàng)
export function setPasswordByEmail(email, password) {
  checkPassword(password);
  const r = run(`update users set password_hash = ?, token_version = token_version + 1 where email = ?`, hashPassword(password), String(email).trim().toLowerCase());
  if (!r.changes) fail(`Không có tài khoản ${email}`);
}

// RPC: chủ sổ đặt lại mật khẩu cho nhân viên quên mật khẩu (không áp dụng cho tài khoản là chủ của bất kỳ sổ nào)
export function set_member_password(p) {
  requirePerm(p.book_id, 'owner');
  const m = one(`select user_id from book_members where book_id = ? and user_id = ? and role = 'staff'`, p.book_id, p.user_id);
  if (!m) fail('Chỉ đặt lại được mật khẩu cho nhân viên của sổ này');
  if (one(`select 1 from book_members where user_id = ? and role = 'owner'`, p.user_id)) fail('Tài khoản này là chủ một sổ — tự đổi mật khẩu trong Cài đặt');
  checkPassword(p.password);
  run(`update users set password_hash = ?, token_version = token_version + 1 where id = ?`, hashPassword(p.password), p.user_id);
  return { ok: true };
}

export const me = (uid) => { const u = one(`select * from users where id = ?`, uid); return u ? publicUser(u) : null; };
export { publicUser };
