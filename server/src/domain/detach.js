// Ngắt dữ liệu cũ: bỏ khỏi sổ mọi chứng từ đến hết một ngày (đơn bán / nhập, thu chi, chi phí, phiếu kho, nợ đầu kỳ) để
// báo cáo, công nợ, thống kê của mọi phân hệ không còn tính những năm đầu nhập liệu chưa đầy đủ. Khác "Xóa dữ liệu":
// công nợ khách / NCC cũ có thể bỏ hẳn (không chuyển thành nợ đầu kỳ); tồn kho, số dư quỹ, điểm vẫn giữ đúng.
// Từng dòng bị ngắt được giữ nguyên trong data_archives (JSON nén gzip) để tải về xem lại.
import zlib from 'node:zlib';
import { ctx, fail, one, all, run, insert, uuid, nowIso, asDate, today, rnd } from '../lib/context.js';
import { requirePerm, nextCode } from './access.js';
import { custBalances, suppBalances } from './reports.js';
import { pickOld, removeOld, checkCutoff, countsOf, LABELS_DETACH } from './purge.js';
import { auditTriggers, dropAuditTriggers } from '../db/index.js';

// Cột ngày của chứng từ: lấy ngày sớm nhất làm "từ ngày" của bản lưu trữ
const DATE_COLS = ['order_date', 'delivery_date', 'return_date', 'receipt_date', 'pay_date', 'exp_date', 'adj_date', 'prod_date', 'move_date', 'debt_date'];
const SKIP_TABLES = new Set(['audit_log', 'data_archives']);

// Ghi lại mọi dòng bị xóa (kể cả dòng con xóa theo khóa ngoại) bằng trigger tạm trong lúc chạy fn
function capture(fn) {
  const tables = all(`select name from main.sqlite_master where type = 'table' and name not like 'sqlite_%'`).map((r) => r.name).filter((t) => !SKIP_TABLES.has(t));
  run(`create temp table if not exists ngat_rows (seq integer primary key, t text not null, data text not null)`);
  run(`delete from temp.ngat_rows`);
  const val = (c) => `case when typeof(old."${c}") = 'blob' then null else old."${c}" end`;
  for (const t of tables) {
    const cols = all(`select name from pragma_table_info(?)`, t).map((r) => r.name);
    // json_object nhận tối đa ~60 cặp tham số: dựng theo từng nhóm 30 cột bằng json_insert (giữ được giá trị null)
    let expr = `json_object(${cols.slice(0, 30).map((c) => `'${c}', ${val(c)}`).join(', ')})`;
    for (let i = 30; i < cols.length; i += 30) expr = `json_insert(${expr}, ${cols.slice(i, i + 30).map((c) => `'$.${c}', ${val(c)}`).join(', ')})`;
    ctx.db.exec(`create temp trigger "ngat_${t}" after delete on "${t}" begin insert into ngat_rows (t, data) values ('${t}', ${expr}); end;`);
  }
  try { fn(); } finally { for (const t of tables) ctx.db.exec(`drop trigger if exists temp."ngat_${t}"`); }
  const out = {};
  for (const r of all(`select t, data from temp.ngat_rows order by seq`)) (out[r.t] ||= []).push(JSON.parse(r.data));
  run(`delete from temp.ngat_rows`);
  return out;
}

// Công nợ hôm nay: tổng phải thu / phải trả (chỉ phần dương) và từng bên
const balances = (b) => {
  const t = today();
  return { kh: new Map(custBalances(b, t).map((r) => [r.party_id, rnd(r.balance)])), ncc: new Map(suppBalances(b, t).map((r) => [r.party_id, rnd(r.balance)])) };
};
function debtChange(b, before, after) {
  const res = {};
  for (const type of ['kh', 'ncc']) {
    const x = before[type]; const y = after[type];
    const pos = (m) => rnd([...m.values()].reduce((s, v) => s + Math.max(v, 0), 0));
    const names = new Map(all(`select id, code, name from ${type === 'kh' ? 'customers' : 'suppliers'} where book_id = ?`, b).map((r) => [r.id, r]));
    const parties = [...new Set([...x.keys(), ...y.keys()])].map((id) => ({ id, code: names.get(id)?.code ?? '', name: names.get(id)?.name ?? '(không rõ)', before: x.get(id) ?? 0, after: y.get(id) ?? 0 }))
      .filter((p) => Math.abs(p.before - p.after) >= 1).sort((p, q) => Math.abs(q.before - q.after) - Math.abs(p.before - p.after));
    res[type] = { before: pos(x), after: pos(y), changed: parties.length, parties: parties.slice(0, 30) };
  }
  return res;
}

const minDate = (tables) => {
  let m = null;
  for (const rows of Object.values(tables)) for (const r of rows) for (const c of DATE_COLS) if (r[c] && (!m || r[c] < m)) m = r[c];
  return m ? String(m).slice(0, 10) : null;
};

function detach(p, save) {
  const b = p.book_id; requirePerm(b, 'owner');
  const d = asDate(p.cutoff); checkCutoff(b, d, 'ngắt');
  const keep = { kh: p.keep_kh === true, ncc: p.keep_ncc === true };
  if (save && p.confirm !== true) fail('Cần xác nhận trước khi ngắt dữ liệu');
  const id = uuid();
  run('savepoint ngat_du_lieu');
  dropAuditTriggers(ctx.db);
  try {
    const before = balances(b);
    const x = pickOld(b, d, keep);
    const n = countsOf(x, LABELS_DETACH);
    const items = Object.entries(LABELS_DETACH).map(([key, label]) => ({ key, label, count: n[key] }));
    if (!items.some((i) => i.count)) fail(`Không có dữ liệu nào đến hết ngày ${d.split('-').reverse().join('/')} để ngắt`);
    const tables = capture(() => removeOld(b, d, x, keep, id, 'đã ngắt'));
    const debt = debtChange(b, before, balances(b));
    const rows = Object.fromEntries(Object.entries(tables).map(([t, r]) => [t, r.length]));
    const summary = { cutoff: d, from_date: minDate(tables), keep, items, rows, debt };
    if (!save) { run('rollback to ngat_du_lieu'); return summary; }

    const book = one(`select id, name, short_name from books where id = ?`, b);
    const refs = {
      customers: all(`select id, code, name, phone from customers where book_id = ?`, b),
      suppliers: all(`select id, code, name, phone from suppliers where book_id = ?`, b),
      products: all(`select id, sku, name, unit from products where book_id = ?`, b),
      funds: all(`select id, name from funds where book_id = ?`, b),
    };
    const code = nextCode(b, 'NGAT');
    const by = one(`select coalesce(name, email) as n from users where id = ?`, ctx.uid)?.n ?? null;
    const payload = { format: 'gomsu-archive-v1', code, book, created_at: nowIso(), created_by: by, ...summary, tables, refs };
    const data = zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
    insert('data_archives', { id, book_id: b, code, from_date: summary.from_date, cutoff: d, keep, summary, size: data.length, data, created_by: ctx.uid, created_at: payload.created_at });
    run(`insert into audit_log (book_id, user_id, at, table_name, op, row_id, old_data, new_data) values (?, ?, ?, 'data_archives', 'DETACH', ?, null, ?)`,
      b, ctx.uid, nowIso(), id, JSON.stringify({ code, cutoff: d, keep, rows }));
    return { id, code, ...summary };
  } finally {
    run('release ngat_du_lieu');
    auditTriggers(ctx.db);
  }
}

export const detach_preview = (p) => detach(p, false);
export const detach_data = (p) => detach(p, true);

export function data_archives(p) {
  requirePerm(p.book_id, 'owner');
  return all(`select a.id, a.code, a.from_date, a.cutoff, a.keep, a.summary, a.size, a.created_at, coalesce(u.name, u.email) as created_by_name
    from data_archives a left join users u on u.id = a.created_by where a.book_id = ? order by a.created_at desc`, p.book_id)
    .map((a) => ({ ...a, keep: JSON.parse(a.keep), summary: JSON.parse(a.summary) }));
}

// Toàn bộ dữ liệu của một lần ngắt (giải nén) để trình duyệt đóng gói thành tệp zip
export function data_archive_get(p) {
  requirePerm(p.book_id, 'owner');
  const a = one(`select data from data_archives where id = ? and book_id = ?`, p.id, p.book_id);
  if (!a) fail('Không tìm thấy bản lưu trữ');
  return JSON.parse(zlib.gunzipSync(a.data).toString('utf8'));
}
