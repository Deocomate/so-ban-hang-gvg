import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SQL_FILES = ['00_demo_shim.sql', '01_schema.sql', '02_core.sql', '03_views.sql', '04_api.sql', '05_reports.sql', '06_ship_bank_notify.sql', '07_ship_bank_extra.sql', '08_carriers.sql', '09_expenses.sql', '10_documents.sql', '11_weight.sql'];

export async function freshDb() {
  const db = new PGlite();
  for (const f of SQL_FILES) await db.exec(fs.readFileSync(path.join(here, '..', 'db', f), 'utf8'));
  return db;
}

export function makeApi(db) {
  let current = null;
  const api = {
    async user(email) {
      const r = await db.query('insert into auth.users(email) values ($1) on conflict (email) do update set email = excluded.email returning id', [email]);
      return r.rows[0].id;
    },
    as(uid) { current = uid; return api; },
    async call(fn, p = {}) {
      await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: current })]);
      const r = await db.query(`select public.${fn}($1::jsonb) as r`, [JSON.stringify(p)]);
      return r.rows[0].r;
    },
    async q(view, book_id, filters = [], order, limit) { return api.call('q', { view, book_id, filters, order, limit }); },
    async one(view, book_id, filters) { const r = await api.q(view, book_id, filters); return r[0]; },
    async sql(text, params = []) { return (await db.query(text, params)).rows; },
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
