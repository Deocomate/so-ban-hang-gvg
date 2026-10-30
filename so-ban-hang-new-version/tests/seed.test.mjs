import { freshDb, makeApi } from './harness.mjs';
import { seedDemo } from '../web/src/lib/demoSeed.js';
const db = await freshDb(); const api = makeApi(db);
await db.exec(`create or replace function app.demo_mark_book() returns trigger language plpgsql as $f$ begin new.is_demo := true; return new; end $f$; create trigger demo_mark before insert on app.books for each row execute function app.demo_mark_book();`);
const [{ d }] = await api.sql('select app.today()::text d');
const t0 = Date.now();
const r = await seedDemo({ call: (fn, p) => api.call(fn, p), ensureUser: (e) => api.user(e), setUser: (u) => api.as(u), today: d, onProgress: (m) => console.log(m) });
console.log('seed ms', Date.now() - t0);
api.as(r.owner);
for (const b of [r.TH, r.VG]) {
  const o = await api.call('rpt_overview', { book_id: b, from: d.slice(0,8)+'01', to: d });
  console.log(JSON.stringify({ rev: o.revenue, cogs: o.cogs, gp: o.gross_profit, opex: o.opex, profit: o.profit, cash_in: o.cash_in, cash_out: o.cash_out, ar: o.receivable, ap: o.payable, inv: o.inventory_value, open: o.open_orders, late: o.late_orders, low: o.low_stock, latepo: o.late_pos }));
  const bad = await api.sql(`select p.sku from app.products p left join (select product_id, sum(qty) q, sum(value) v from app.stock_moves group by 1) m on m.product_id = p.id where p.book_id=$1 and not p.is_kit and (coalesce(m.q,0) <> p.on_hand or coalesce(m.v,0) <> p.stock_value)`, [b]);
  console.log('mismatch', bad.length);
  const ships = await api.q('shipments', b); const txns = await api.q('bank_txns', b); const n = await api.call('my_notifications', { book_id: b });
  console.log('ships', ships.map((x) => x.status + '/' + x.cod_status).join(' '), '| bank', txns.map((t) => t.status + ':' + t.amount).join(' '), '| notif', n.items.length, n.items.slice(0, 4).map((x) => x.title).join(' || '));
}
const so = await api.q('sales_orders', r.TH, [], 'order_date');
for (const x of so) console.log(x.code, x.kind, x.customer_name, x.delivery_status, x.payment_status, x.progress, x.receivable, x.overdue_days, x.is_late);
