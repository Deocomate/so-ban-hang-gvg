// Xuất DỮ LIỆU MẪU (bản chạy thử) ra supabase/seed-demo.sql để dev nạp vào môi trường thử (staging / local).
// Chạy: node tests/export-demo-data.mjs
// KHÔNG nạp tệp kết quả vào dự án Supabase đang chạy thật.
import fs from 'fs';
import path from 'path';
import { freshDb, makeApi } from './harness.mjs';
import { seedDemo } from '../web/src/lib/demoSeed.js';
import logo from '../web/src/assets/demoLogo.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(here, '..', 'supabase', 'seed-demo.sql');
const db = await freshDb(); const api = makeApi(db);
await db.exec(`create or replace function app.demo_mark_book() returns trigger language plpgsql as $f$ begin new.is_demo := true; return new; end $f$;
  create trigger demo_mark before insert on app.books for each row execute function app.demo_mark_book();`);
const [{ d }] = await api.sql('select app.today()::text d');
await seedDemo({ call: (fn, p) => api.call(fn, p), ensureUser: (e, n) => api.user(e, n), setUser: (u) => api.as(u), today: d, logo, onProgress: () => {} });

// Bảng của schema app theo thứ tự phụ thuộc khóa ngoại (bảng được tham chiếu trước)
const tables = (await db.query(`select c.relname t from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'app' and c.relkind = 'r' order by c.relname`)).rows.map((r) => r.t);
const deps = (await db.query(`select c1.relname a, c2.relname b from pg_constraint k join pg_class c1 on c1.oid = k.conrelid join pg_class c2 on c2.oid = k.confrelid
  join pg_namespace n1 on n1.oid = c1.relnamespace join pg_namespace n2 on n2.oid = c2.relnamespace
  where k.contype = 'f' and n1.nspname = 'app' and n2.nspname = 'app' and c1.relname <> c2.relname`)).rows;
const order = []; const seen = new Set();
const visit = (t) => { if (seen.has(t)) return; seen.add(t); for (const x of deps.filter((e) => e.a === t)) visit(x.b); order.push(t); };
tables.forEach(visit);

const users = (await db.query(`select id, email, coalesce(raw_user_meta_data, '{}'::jsonb) meta from auth.users order by email`)).rows;
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
let sql = `-- =====================================================================
-- DỮ LIỆU MẪU (DEMO) — Sổ Bán Hàng Gốm, tạo ngày ${d}
-- Chỉ dùng cho môi trường THỬ (dự án Supabase staging hoặc Supabase local) để dev xem giao diện có số liệu.
-- KHÔNG chạy trên dự án đang dùng thật. Sổ mẫu được đánh dấu is_demo = true.
-- Thứ tự: chạy supabase/migration.sql trước, rồi chạy tệp này (SQL Editor hoặc psql).
-- Tài khoản mẫu (đăng nhập bằng email + mật khẩu): ${users.map((u) => u.email).join(', ')} — mật khẩu: Demo@123456
-- Tạo lại tệp này: node tests/export-demo-data.mjs
-- =====================================================================
begin;
set local session_replication_role = replica; -- tạm tắt trigger / kiểm tra khóa ngoại trong lúc nạp

-- Tài khoản đăng nhập mẫu (schema auth của Supabase)
`;
for (const u of users) {
  sql += `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', ${q(u.id)}, 'authenticated', 'authenticated', ${q(u.email)}, extensions.crypt('Demo@123456', extensions.gen_salt('bf')),
  now(), now(), now(), '{"provider":"email","providers":["email"]}', ${q(JSON.stringify(u.meta))}, '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), ${q(u.id)}, ${q(u.id)}, 'email', ${q(JSON.stringify({ sub: u.id, email: u.email, email_verified: true }))}, now(), now(), now())
on conflict do nothing;
`;
}
let total = 0; const counts = [];
for (const t of order) {
  const rows = (await db.query(`select to_jsonb(x) j from app.${t} x`)).rows;
  if (!rows.length) continue;
  counts.push(`${t}: ${rows.length}`); total += rows.length;
  sql += `\n-- app.${t} (${rows.length} dòng)\n`;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((r) => JSON.stringify(r.j));
    sql += `insert into app.${t} select * from jsonb_populate_recordset(null::app.${t}, ${q('[' + chunk.join(',') + ']')}::jsonb) on conflict do nothing;\n`;
  }
}
// Đặt lại các bộ đếm mã chứng từ nếu có sequence
const seqs = (await db.query(`select s.relname n from pg_class s join pg_namespace n on n.oid = s.relnamespace where n.nspname = 'app' and s.relkind = 'S'`)).rows;
for (const s of seqs) {
  const v = (await db.query(`select last_value, is_called from app.${s.n}`)).rows[0];
  sql += `select setval('app.${s.n}', ${v.last_value}, ${v.is_called});\n`;
}
sql += `\ncommit;\n-- Tổng: ${total} dòng dữ liệu. ${counts.join(', ')}\n`;
fs.writeFileSync(out, sql);
console.log(`Đã ghi ${out}: ${total} dòng, ${users.length} tài khoản, ${(sql.length / 1024).toFixed(0)} KB`);

// Kiểm tra: nạp lại vào cơ sở dữ liệu trống (PGlite có schema auth rút gọn → bỏ phần auth.identities / extensions)
const db2 = await freshDb();
const lite = sql.replace(/insert into auth\.identities[\s\S]*?on conflict do nothing;\n/g, '')
  .replace(/insert into auth\.users \(instance_id[^)]*\)\nvalues \('[^']*', ('[^']*'), [^,]*, [^,]*, ('[^']*'),[\s\S]*?on conflict \(id\) do nothing;/g, 'insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing;');
await db2.exec(lite);
const chk = (await db2.query(`select (select count(*) from app.sales_orders) so, (select count(*) from app.products) p, (select count(*) from app.books where is_demo) b`)).rows[0];
console.log('Nạp lại thử:', chk);
// So sánh số liệu giữa cơ sở dữ liệu gốc và bản nạp lại
const probe = `select (select sum(on_hand)::bigint from app.products) ton, (select sum(stock_value) from app.products) gtri,
  (select sum(amount) from app.payments where not voided) tien, (select count(*) from app.stock_moves) moves,
  (select count(*) from app.book_members) members, (select count(*) from app.expenses) cp`;
const a = (await db.query(probe)).rows[0]; const b = (await db2.query(probe)).rows[0];
console.log('Khớp số liệu sau khi nạp lại:', JSON.stringify(a) === JSON.stringify(b) ? 'CÓ' : 'KHÔNG', JSON.stringify(a), JSON.stringify(b));
if (JSON.stringify(a) !== JSON.stringify(b)) process.exit(1);
