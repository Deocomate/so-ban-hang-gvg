// Hai "động cơ" dữ liệu dùng CHUNG bộ quy tắc SQL:
//  - demo: Postgres (PGlite) chạy ngay trong trình duyệt, lưu trong IndexedDB của máy đang xem.
//  - supabase: cơ sở dữ liệu dùng chung trên mạng, có đăng nhập thật.
import sql0 from '../../../db/00_demo_shim.sql?raw';
import sql1 from '../../../db/01_schema.sql?raw';
import sql2 from '../../../db/02_core.sql?raw';
import sql3 from '../../../db/03_views.sql?raw';
import sql4 from '../../../db/04_api.sql?raw';
import sql5 from '../../../db/05_reports.sql?raw';
import sql6 from '../../../db/06_ship_bank_notify.sql?raw';
import sql7 from '../../../db/07_ship_bank_extra.sql?raw';
import sql8 from '../../../db/08_carriers.sql?raw';
import sql9 from '../../../db/09_expenses.sql?raw';
import sql10 from '../../../db/10_documents.sql?raw';
import sql11 from '../../../db/11_weight.sql?raw';

export const DEMO_VERSION = 'v16';
const FN_RE = /^[a-z_][a-z0-9_]*$/;

function cleanError(e) {
  let m = (e && (e.message || e.error_description || e.msg)) || String(e);
  m = m.replace(/^ERROR:\s*/i, '').replace(/^error:\s*/i, '');
  if (/Failed to fetch|NetworkError|network/i.test(m)) m = 'Mất kết nối mạng — chưa lưu được. Kiểm tra mạng rồi thử lại.';
  if (/JWT expired|invalid JWT/i.test(m)) m = 'Phiên đăng nhập đã hết hạn — hãy đăng nhập lại.';
  const err = new Error(m); err.raw = e; return err;
}

// ---------------- DEMO (PGlite) ----------------
export async function createDemoBackend(onProgress = () => {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  let db; let persistent = true;
  const name = 'gomsu-demo-' + DEMO_VERSION;
  onProgress('Đang khởi động cơ sở dữ liệu…');
  try {
    db = new PGlite('idb://' + name);
    await db.waitReady;
  } catch (e) {
    persistent = false;
    db = new PGlite();
    await db.waitReady;
  }
  const ready = await db.query(`select to_regclass('app.books') is not null as ok`);
  let fresh = false;
  if (!ready.rows[0].ok) {
    onProgress('Đang tạo cấu trúc dữ liệu…');
    for (const s of [sql0, sql1, sql2, sql3, sql4, sql5, sql6, sql7, sql8, sql9, sql10, sql11]) await db.exec(s);
    // Cơ sở dữ liệu riêng của bản chạy thử: mọi sổ là sổ mẫu (cho phép nút giả lập tiền về / SPX)
    await db.exec(`create or replace function app.demo_mark_book() returns trigger language plpgsql as $f$ begin new.is_demo := true; return new; end $f$; create trigger demo_mark before insert on app.books for each row execute function app.demo_mark_book();`);
    fresh = true;
  }
  let uid = null;
  let chain = Promise.resolve();
  const run = (fn) => (chain = chain.then(fn, fn));

  const backend = {
    kind: 'demo',
    persistent,
    async rpc(fn, p = {}) {
      if (!FN_RE.test(fn)) throw new Error('Tên hàm không hợp lệ');
      return run(async () => {
        try {
          await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: uid })]);
          const r = await db.query(`select public.${fn}($1::jsonb) as r`, [JSON.stringify(p)]);
          return r.rows[0].r;
        } catch (e) { throw cleanError(e); }
      });
    },
    async sql(text, params = []) { return run(async () => (await db.query(text, params)).rows); },
    async demoUsers() {
      return (await db.query(`select u.id, u.email, coalesce(u.raw_user_meta_data->>'name', u.email) as name from auth.users u order by u.email`)).rows;
    },
    async ensureUser(email, name) {
      const r = await db.query(`insert into auth.users(email, raw_user_meta_data) values ($1, jsonb_build_object('name', $2::text))
        on conflict (email) do update set raw_user_meta_data = excluded.raw_user_meta_data returning id`, [email, name]);
      return r.rows[0].id;
    },
    setUser(id) { uid = id; },
    currentUser() { return uid; },
    async getSession() { return uid ? { user: { id: uid } } : null; },
    async signOut() { uid = null; },
    async reset() {
      try { await db.close(); } catch (e) { /* bỏ qua */ }
      await new Promise((res) => { try { const r = indexedDB.deleteDatabase('/pglite/' + name); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch (e) { res(); } });
    },
    fresh,
  };
  return backend;
}

// ---------------- SUPABASE ----------------
export async function createSupabaseBackend(url, key) {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  return {
    kind: 'supabase',
    persistent: true,
    sb,
    async rpc(fn, p = {}) {
      if (!FN_RE.test(fn)) throw new Error('Tên hàm không hợp lệ');
      const { data, error } = await sb.rpc(fn, { p });
      if (error) throw cleanError(error);
      return data;
    },
    async getSession() { const { data } = await sb.auth.getSession(); return data.session; },
    onAuth(cb) { return sb.auth.onAuthStateChange((_e, s) => cb(s)); },
    async signIn(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw cleanError(error); },
    async signUp(email, password, name) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name } } });
      if (error) throw cleanError(error);
      return data;
    },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) throw cleanError(error);
    },
    async updatePassword(password) { const { error } = await sb.auth.updateUser({ password }); if (error) throw cleanError(error); },
    async signOut() { await sb.auth.signOut(); },
  };
}
