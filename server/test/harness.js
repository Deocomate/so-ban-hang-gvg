// Bộ khung kiểm thử: CSDL SQLite trong bộ nhớ, gọi hàm nghiệp vụ đúng như ứng dụng gọi qua /api/rpc.
import crypto from 'node:crypto';
import { openDb } from '../src/db/index.js';
import { ctx, today, nowIso } from '../src/lib/context.js';
import { callRpc, callService } from '../src/domain/rpc.js';
import { ingestTracking, logCarrierWebhook } from '../src/domain/shipping.js';
import { ingestBankTxn } from '../src/domain/bank.js';
import { runScheduled, pushQueue, pushDone } from '../src/domain/notify.js';

export const TODAY = () => today();

export function freshDb() { return openDb(':memory:'); }

const SERVICES = {
  ingest_tracking: ingestTracking, ingest_bank_txn: ingestBankTxn, run_scheduled: runScheduled, log_carrier_webhook: logCarrierWebhook,
  push_queue: (p) => pushQueue(p?.limit ?? 50), push_done: pushDone,
};

export function makeApi() {
  let current = null;
  const api = {
    async user(email) {
      const ex = ctx.db.prepare('select id from users where email = ?').get(email);
      if (ex) return ex.id;
      const id = crypto.randomUUID();
      ctx.db.prepare('insert into users (id, email, name, password_hash, created_at) values (?, ?, ?, ?, ?)').run(id, email, null, 'x', nowIso());
      return id;
    },
    as(uid) { current = uid; return api; },
    async call(fn, p = {}) { return JSON.parse(JSON.stringify(callRpc(current, fn, p))); },
    async svc(fn, p = {}) { return JSON.parse(JSON.stringify(callService(SERVICES[fn], p))); },
    async q(view, book_id, filters = [], order, limit) { return api.call('q', { view, book_id, filters, order, limit }); },
    async one(view, book_id, filters) { return (await api.q(view, book_id, filters))[0]; },
    async sql(text, params = []) { const st = ctx.db.prepare(text); return st.reader ? st.all(...params) : st.run(...params); },
  };
  return api;
}

let passed = 0, failed = 0; const failures = [];
export function check(name, actual, expected, tol = 0.5) {
  const ok = (typeof expected === 'number' && typeof actual === 'number') ? Math.abs(actual - expected) <= tol : JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++; else { failed++; failures.push(`${name}: mong đợi ${JSON.stringify(expected)}, thực tế ${JSON.stringify(actual)}`); }
  return ok;
}
export async function expectError(name, fn, pattern) {
  try { await fn(); failed++; failures.push(`${name}: mong đợi báo lỗi nhưng không lỗi`); }
  catch (e) {
    if (pattern && !new RegExp(pattern, 'i').test(e.message)) { failed++; failures.push(`${name}: lỗi khác mong đợi: ${e.message}`); }
    else passed++;
  }
}
export function summary() { return { passed, failed, failures }; }

// Nhóm kiểm thử + ghi kết quả
export function suite() {
  const log = []; let group = '';
  const G = (n) => { group = n; };
  const C = (name, actual, expected, tol) => { const ok = check(`[${group}] ${name}`, actual, expected, tol); log.push({ group, name, expected, actual, ok }); return ok; };
  const E = async (name, fn, pat) => {
    const before = summary().failed; await expectError(`[${group}] ${name}`, fn, pat);
    log.push({ group, name, expected: 'Báo lỗi / chặn', actual: summary().failed === before ? 'Đã chặn' : 'KHÔNG chặn', ok: summary().failed === before });
  };
  return { G, C, E, log };
}

export function finish(title) {
  const s = summary();
  console.log(`\n${title} — ĐẠT: ${s.passed}   LỖI: ${s.failed}`);
  for (const f of s.failures) console.log('  ✗ ' + f);
  process.exit(s.failed ? 1 : 0);
}

export const rid = () => crypto.randomUUID();
export const daysAgo = (n) => { const t = new Date(today() + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - n); return t.toISOString().slice(0, 10); };
