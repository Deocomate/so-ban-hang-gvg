// Ngữ cảnh dùng chung cho mọi hàm nghiệp vụ: kết nối CSDL, người đang gọi, tiện ích SQL / ngày / số.
// better-sqlite3 chạy đồng bộ nên mỗi lời gọi RPC chạy trọn vẹn trước lời gọi kế tiếp
// → giữ "người đang gọi" trong biến chung là an toàn.
import crypto from 'node:crypto';

export const ctx = { db: null, uid: null, members: new Map() };

export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const fail = (message, status) => { throw new AppError(message, status); };

export const uuid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

// ---------- Ngày giờ Việt Nam (UTC+7, không đổi giờ mùa hè) ----------
const VN_MS = 7 * 3600e3;
export const vnDate = (ts) => (ts == null ? null : new Date(new Date(ts).getTime() + VN_MS).toISOString().slice(0, 10));
export const today = () => vnDate(Date.now());
export const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const daysBetween = (a, b) => (a == null || b == null ? null : Math.round((Date.parse(a.slice(0, 10) + 'T00:00:00Z') - Date.parse(b.slice(0, 10) + 'T00:00:00Z')) / 86400e3));
export const monthStart = (d) => d.slice(0, 8) + '01';
export const addMonths = (d, n) => { const t = new Date(monthStart(d) + 'T00:00:00Z'); t.setUTCMonth(t.getUTCMonth() + n); return t.toISOString().slice(0, 10); };
export const dmy = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');
export const dm = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');

// Ngày dạng 'YYYY-MM-DD' (nhận cả chuỗi có giờ); rỗng → null; sai → báo lỗi
export function asDate(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m || isNaN(Date.parse(m[1] + 'T00:00:00Z'))) fail(`Ngày "${s}" không hợp lệ`);
  return m[1];
}
// Thời điểm → ISO UTC; rỗng → null
export function asTs(v) {
  if (v == null || v === '') return null;
  const t = new Date(v);
  if (isNaN(+t)) fail(`Thời điểm "${v}" không hợp lệ`);
  return t.toISOString();
}

// ---------- Số ----------
// Làm tròn như Postgres round(numeric): nửa xa số 0
export const rnd = (x, digits = 0) => {
  if (x == null || Number.isNaN(x)) return x;
  const f = 10 ** digits;
  return (Math.sign(x) * Math.round(Math.abs(x) * f + 1e-9)) / f;
};
// Đọc số từ JSON: '' / null / undefined → null; không phải số → báo lỗi
export function num(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) fail(`"${v}" không phải là số`);
  return n;
}
export const int = (v) => { const n = num(v); return n == null ? null : Math.trunc(n); };
export function bool(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (['true', 't', '1', 'yes', 'on'].includes(s)) return true;
  if (['false', 'f', '0', 'no', 'off'].includes(s)) return false;
  return fail(`"${v}" không phải giá trị đúng/sai`);
}
export const str = (v) => (v == null ? null : String(v));
export const nz = (v) => (v == null || String(v) === '' ? null : String(v));          // nullif(x, '')
export const trimNz = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
export const coalesce = (...a) => { for (const x of a) if (x !== null && x !== undefined) return x; return null; };

export function vnd(n) {
  if (n == null) return '0đ';
  const v = rnd(Number(n));
  return (v < 0 ? '-' : '') + Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
}

// ---------- Truy vấn ----------
const stmts = new Map();
function stmt(sql) {
  let s = stmts.get(sql);
  if (!s || s.database !== ctx.db) { s = ctx.db.prepare(sql); stmts.set(sql, s); }
  return s;
}
const param = (v) => {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v !== null && typeof v === 'object' && !Buffer.isBuffer(v)) return JSON.stringify(v);
  return v;
};
const params = (a) => a.map(param);
export const one = (sql, ...a) => stmt(sql).get(...params(a));
export const all = (sql, ...a) => stmt(sql).all(...params(a));
export const run = (sql, ...a) => stmt(sql).run(...params(a));
export const val = (sql, ...a) => { const r = one(sql, ...a); return r ? Object.values(r)[0] : undefined; };
// Tham số đặt tên (@b, @d1…) cho truy vấn dài dùng lại nhiều lần cùng 1 giá trị
const named = (sql, o) => {
  const used = new Set([...sql.matchAll(/@(\w+)/g)].map((m) => m[1]));
  return Object.fromEntries(Object.entries(o).filter(([k]) => used.has(k)).map(([k, v]) => [k, param(v)]));
};
export const oneN = (sql, o) => stmt(sql).get(named(sql, o));
export const allN = (sql, o) => stmt(sql).all(named(sql, o));

export function insert(table, obj) {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  run(`insert into ${table} (${keys.join(', ')}) values (${keys.map(() => '?').join(', ')})`, ...keys.map((k) => obj[k]));
  return obj;
}
export function update(table, where, obj) {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  const wk = Object.keys(where);
  return run(`update ${table} set ${keys.map((k) => `${k} = ?`).join(', ')} where ${wk.map((k) => `${k} = ?`).join(' and ')}`,
    ...keys.map((k) => obj[k]), ...wk.map((k) => where[k])).changes;
}
export const inList = (arr) => `(${arr.map(() => '?').join(', ') || 'null'})`;

// ---------- Định dạng dữ liệu trả về (giống JSON của Postgres) ----------
const BOOL_COLS = new Set(['is_kit', 'active', 'is_low', 'voided', 'restock', 'is_late', 'is_final', 'has_problem', 'assigned',
  'order_cancelled', 'is_demo', 'has_alloc', 'unread', 'all_received', 'any_received', 'can_cost', 'duplicate', 'transport_included']);
const JSON_COLS = new Set(['settings', 'perms', 'notify', 'components', 'lines', 'allocations', 'events', 'cod_payment_codes', 'payment_ids',
  'payment_codes', 'candidate_books', 'cod_payment_ids', 'old_data', 'new_data', 'data', 'payload', 'raw', 'subs', 'extra', 'body']);
export function outRow(r) {
  if (!r) return r;
  for (const k of Object.keys(r)) {
    const v = r[k];
    if (v == null) continue;
    if (BOOL_COLS.has(k) && typeof v === 'number') r[k] = v !== 0;
    else if (JSON_COLS.has(k) && typeof v === 'string') { try { r[k] = JSON.parse(v); } catch { /* giữ chuỗi */ } }
  }
  return r;
}
export const outRows = (rows) => rows.map(outRow);
export const json = (v, dflt = {}) => { if (v == null) return dflt; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return dflt; } };
