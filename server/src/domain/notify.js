// Thông báo: theo sự kiện (đơn mới, vận chuyển, tiền về) + báo cáo ngày + nhắc công nợ; hàng đợi gửi lên điện thoại (Web Push).
import { ctx, fail, one, all, run, val, nowIso, json, int, vnd, dm, today, addDays, monthStart } from '../lib/context.js';
import { requirePerm, memberCan, setting } from './access.js';
import { carrierShort } from '../lib/labels.js';
import { calcPl } from './reports.js';

export const NOTIFY_KINDS = ['don_hang', 'van_chuyen', 'tien_ve', 'cong_no', 'bao_cao'];

export function notify(book, kind, level, title, body, link, key = null) {
  const r = run(`insert into notifications (book_id, kind, level, title, body, link, dedupe_key, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)
    on conflict (dedupe_key) do nothing`, book, kind, level || 'info', title, body, link, key, nowIso());
  return r.changes ? Number(r.lastInsertRowid) : null;
}

// Thành viên có nhận loại tin này không (theo cài đặt riêng + quyền)
export function notifyAllowed(book, user, kind) {
  const m = one(`select notify from book_members where book_id = ? and user_id = ?`, book, user);
  if (!m || json(m.notify)[kind] === false) return false;
  switch (kind) {
    case 'don_hang': case 'van_chuyen': return memberCan(book, user, 'ban_hang');
    case 'tien_ve': case 'cong_no': return memberCan(book, user, 'thu_chi');
    case 'bao_cao': return memberCan(book, user, 'xem_bao_cao') && memberCan(book, user, 'xem_gia_von');
    default: return false;
  }
}
const allowedKinds = (book, user) => NOTIFY_KINDS.filter((k) => notifyAllowed(book, user, k));
const kindsSql = (kinds) => `(${kinds.map(() => '?').join(', ') || 'null'})`;

// Đơn được xác nhận (đơn mới) — gọi sau khi đã lưu đủ dòng hàng để tổng tiền đúng
export function notifyOrderConfirmed(orderId) {
  const o = one(`select book_id, code, kind, customer_name, order_total, channel, due_date from v_sales_orders where id = ?`, orderId);
  if (!o) return;
  notify(o.book_id, 'don_hang', 'info',
    `🧾 ${o.kind === 'dat_hang' ? 'Đơn đặt riêng ' : 'Đơn mới '}${o.code} · ${vnd(o.order_total)}`,
    (o.customer_name ?? '') + (o.channel != null ? ' · ' + o.channel : '') + (o.due_date ? ' · hẹn giao ' + dm(o.due_date) : ''),
    'order:' + orderId, 'order:' + orderId + ':xac_nhan');
}

// ---------- THÔNG BÁO CỦA TÔI ----------
export function my_notifications(p) {
  const b = p.book_id;
  requirePerm(b, null);
  const lr = val(`select last_read_id from notification_reads where user_id = ? and book_id = ?`, ctx.uid, b) ?? 0;
  const kinds = allowedKinds(b, ctx.uid);
  const lim = Math.min(int(p.limit) ?? 50, 200);
  const items = all(`select id, kind, level, title, body, link, created_at as at from notifications
    where book_id = ? and kind in ${kindsSql(kinds)} order by id desc limit ${lim}`, b, ...kinds).map((n) => ({ ...n, unread: n.id > lr }));
  const unread = val(`select count(*) from notifications where book_id = ? and id > ? and kind in ${kindsSql(kinds)}`, b, lr, ...kinds);
  const prefs = json(val(`select notify from book_members where book_id = ? and user_id = ?`, b, ctx.uid), null);
  return { items, unread, prefs, subs: val(`select count(*) from push_subs where user_id = ?`, ctx.uid) };
}

export function mark_notifications_read(p) {
  const b = p.book_id;
  requirePerm(b, null);
  const mx = val(`select coalesce(max(id), 0) from notifications where book_id = ?`, b);
  run(`insert into notification_reads (user_id, book_id, last_read_id) values (?, ?, ?)
    on conflict (user_id, book_id) do update set last_read_id = max(last_read_id, excluded.last_read_id)`, ctx.uid, b, mx);
  return { ok: true };
}

export function save_notify_prefs(p) {
  const b = p.book_id;
  requirePerm(b, null);
  const cur = json(val(`select notify from book_members where book_id = ? and user_id = ?`, b, ctx.uid));
  for (const k of NOTIFY_KINDS) if (p.prefs && k in p.prefs) cur[k] = p.prefs[k] !== false && p.prefs[k] !== 'false';
  run(`update book_members set notify = ? where book_id = ? and user_id = ?`, cur, b, ctx.uid);
  return { ok: true };
}

export function save_push_sub(p) {
  if (!ctx.uid) fail('Bạn chưa đăng nhập', 401);
  if (!/^https:\/\//.test(String(p.endpoint ?? '')) || !p.p256dh || !p.auth) fail('Thông tin đăng ký nhận thông báo không hợp lệ');
  run(`insert into push_subs (id, user_id, endpoint, p256dh, auth, user_agent, created_at) values (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)
    on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
      user_agent = excluded.user_agent, fail_count = 0`, ctx.uid, p.endpoint, p.p256dh, p.auth, p.user_agent ? String(p.user_agent).slice(0, 300) : null, nowIso());
  return { ok: true };
}

export function delete_push_sub(p) {
  run(`delete from push_subs where user_id = ? and (endpoint = ? or ?)`, ctx.uid, p.endpoint ?? null, p.all === true);
  return { ok: true };
}

// ---------- HÀNG ĐỢI GỬI LÊN ĐIỆN THOẠI (chỉ máy chủ gọi) ----------
export function pushQueue(limit = 50) {
  const since = new Date(Date.now() - 86400e3).toISOString();
  return all(`select n.id, n.kind, n.title, n.body, n.link, n.level, bk.name as book_name, bk.id as book_id from notifications n join books bk on bk.id = n.book_id
    where n.push_sent_at is null and n.created_at > ? and bk.is_demo = 0 order by n.id limit ?`, since, Math.min(limit, 200))
    .map((n) => {
      const subs = all(`select s.user_id, s.endpoint, s.p256dh, s.auth from push_subs s join book_members m on m.user_id = s.user_id and m.book_id = ?`, n.book_id)
        .filter((s) => notifyAllowed(n.book_id, s.user_id, n.kind)).map(({ endpoint, p256dh, auth }) => ({ endpoint, p256dh, auth }));
      const { kind, ...rest } = n;
      return { ...rest, subs };
    });
}

export function pushDone({ ids = [], ok_endpoints = [], dead_endpoints = [] }) {
  const now = nowIso();
  for (const id of ids) run(`update notifications set push_sent_at = ? where id = ?`, now, id);
  for (const e of ok_endpoints) run(`update push_subs set last_ok_at = ?, fail_count = 0 where endpoint = ?`, now, e);
  for (const e of dead_endpoints) run(`delete from push_subs where endpoint = ?`, e);
  return { ok: true };
}

// ---------- BÁO CÁO NGÀY & NHẮC CÔNG NỢ ----------
export function digestDaily(b, d) {
  const nb = val(`select name from books where id = ?`, b);
  const pl = calcPl(b, d, d); const mtd = calcPl(b, monthStart(d), d);
  const nDel = val(`select count(*) from deliveries where book_id = ? and delivery_date = ?`, b, d);
  const nNew = val(`select count(*) from sales_orders where book_id = ? and order_date = ? and status <> 'huy'`, b, d);
  const so = one(`select count(*) filter (where status = 'xac_nhan' and remaining_qty > 0) as open_o, count(*) filter (where is_late) as late_o
    from v_sales_orders where book_id = ?`, b);
  const sh = one(`select count(*) filter (where status not in ('giao_thanh_cong','da_hoan','da_huy')) as ships,
    count(*) filter (where status in ('giao_that_bai','dang_hoan','su_co')) as probs from shipments where book_id = ?`, b);
  const body = `Doanh thu ${vnd(pl.revenue)} (${nDel} lần giao) · Tiền thu ${vnd(pl.cash_in)} · Chi ${vnd(pl.cash_out)} · Lãi gộp ${vnd(pl.gross_profit)}`
    + `\nĐơn mới ${nNew} · Chờ giao ${so.open_o}${so.late_o > 0 ? ` (trễ hẹn ${so.late_o})` : ''}`
    + ` · Đang vận chuyển ${sh.ships}${sh.probs > 0 ? ` (có vấn đề ${sh.probs})` : ''}`
    + `\nLũy kế tháng: doanh thu ${vnd(mtd.revenue)} · lợi nhuận sau chi phí ${vnd(mtd.profit)}`;
  return notify(b, 'bao_cao', 'info', `📊 Báo cáo ngày ${dm(d)} · ${nb}`, body, 'page:tong-quan', `daily:${b}:${d}`);
}

export function digestDebt(b, d) {
  const warn = int(setting(b, 'due_warn_days')) ?? 3;
  const nb = val(`select name from books where id = ?`, b);
  const od = all(`select name, overdue, max_overdue_days from v_customers where book_id = ? and overdue > 0 order by overdue desc`, b);
  const top = od.slice(0, 5).map((x) => `${x.name} ${vnd(x.overdue)} (quá ${x.max_overdue_days} ngày)`).join('; ');
  const odTotal = od.slice(0, 5).reduce((s, x) => s + x.overdue, 0);
  const soon = all(`select customer_name, code, receivable, pay_due_date from v_sales_orders where book_id = ? and receivable > 0 and pay_due_date between ? and ?
    order by pay_due_date limit 5`, b, d, addDays(d, warn)).map((x) => `${x.customer_name ?? ''} · ${x.code} ${vnd(x.receivable)} hạn ${dm(x.pay_due_date)}`);
  const payDue = all(`select supplier_name, code, payable, overdue_days, pay_due_date from v_purchase_orders where book_id = ? and payable > 0 and pay_due_date <= ?
    order by pay_due_date limit 5`, b, addDays(d, warn))
    .map((x) => `${x.supplier_name ?? ''} · ${x.code} ${vnd(x.payable)}${x.overdue_days > 0 ? ` (quá ${x.overdue_days} ngày)` : ` hạn ${dm(x.pay_due_date)}`}`);
  const codOld = all(`select carrier, tracking_no, cod_amount from shipments where book_id = ? and cod_status = 'spx_dang_giu' and status_at < ? limit 5`,
    b, new Date(Date.now() - 7 * 86400e3).toISOString()).map((x) => `${carrierShort(x.carrier)} ${x.tracking_no} ${vnd(x.cod_amount)}`);
  let body = ''; let lvl = 'warn';
  if (od.length) { body += `Khách quá hạn: ${Math.min(od.length, 5)} khách, tổng ${vnd(odTotal)} — ${top}\n`; lvl = 'bad'; }
  if (soon.length) body += `Sắp đến hạn (${warn} ngày tới): ${soon.join('; ')}\n`;
  if (payDue.length) body += `Mình cần trả NCC: ${payDue.join('; ')}\n`;
  if (codOld.length) body += `COD đơn vị vận chuyển giữ quá 7 ngày chưa về TK: ${codOld.join('; ')}\n`;
  if (!body) return null;
  return notify(b, 'cong_no', lvl, `⏰ Nhắc công nợ ${dm(d)} · ${nb}`, body.replace(/\n+$/, ''), 'page:khach-hang', `debt:${b}:${d}`);
}

// Lịch tự động gọi. p = {kind:'daily_report'|'debt_reminder', book_id?, date?}
export function runScheduled(p) {
  const d = p.date || today(); let n = 0;
  const books = p.book_id ? all(`select id from books where id = ?`, p.book_id) : all(`select id from books where is_demo = 0`);
  for (const bk of books) {
    const r = p.kind === 'daily_report' ? digestDaily(bk.id, d) : p.kind === 'debt_reminder' ? digestDebt(bk.id, d) : null;
    if (r != null) n++;
  }
  return { created: n };
}

// Sổ dữ liệu mẫu: chủ sổ bấm để xem trước báo cáo ngày / nhắc nợ
export function demo_run_scheduled(p) {
  const b = p.book_id;
  requirePerm(b, 'owner');
  if (!val(`select is_demo from books where id = ?`, b)) fail('Chỉ dùng trong sổ dữ liệu mẫu');
  const d = today();
  run(`delete from notifications where book_id = ? and dedupe_key in (?, ?)`, b, `daily:${b}:${d}`, `debt:${b}:${d}`);
  return { id: p.kind === 'daily_report' ? digestDaily(b, d) : digestDebt(b, d) };
}

