// Kiểm thử tổng hợp: chạy toàn bộ dữ liệu mẫu (gần như mọi chức năng) rồi đối chiếu sổ kho, công nợ, quỹ — chạy: node test/seed.test.js
import { freshDb, makeApi, suite, finish, TODAY as today } from './harness.js';
import { demoFlag } from '../src/domain/books.js';
import { seedDemo } from '../scripts/demo-seed-data.js';

freshDb();
const api = makeApi();
const { G, C } = suite();
const d = today();
demoFlag.on = true;
const r = await seedDemo({ call: (fn, p) => api.call(fn, p), ensureUser: (e) => api.user(e), setUser: (u) => api.as(u), today: d });
api.as(r.owner);

G('Dữ liệu mẫu chạy hết không lỗi');
for (const [b, name] of [[r.TH, 'Thanh Hải'], [r.VG, 'Vũ Gia']]) {
  const ov = await api.call('rpt_overview', { book_id: b, from: d.slice(0, 8) + '01', to: d });
  C(`${name}: có doanh thu trong tháng`, ov.revenue > 0, true);
  const bad = await api.sql(`select p.sku from products p left join (select product_id, sum(qty) q, sum(value) v from stock_moves group by 1) m on m.product_id = p.id
    where p.book_id = ? and not p.is_kit and (coalesce(m.q, 0) <> p.on_hand or coalesce(m.v, 0) <> p.stock_value)`, [b]);
  C(`${name}: sổ kho khớp tồn từng SKU`, bad.length, 0);
  const funds = await api.q('funds', b);
  C(`${name}: tồn quỹ Tổng quan = tổng các quỹ`, ov.fund_balance, funds.reduce((s, f) => s + f.balance, 0));
  const cs = await api.q('customers', b);
  C(`${name}: phải thu = tổng sổ khách hàng`, ov.receivable, cs.reduce((s, c) => s + c.receivable, 0));
  const n = await api.call('my_notifications', { book_id: b });
  C(`${name}: có thông báo`, n.items.length > 0, true);
}
const ships = await api.q('shipments', r.VG);
C('Vũ Gia: có vận đơn SPX và BEST', [ships.some((s) => s.carrier === 'SPX'), ships.some((s) => s.carrier === 'BEST')], [true, true]);
const txns = await api.q('bank_txns', r.VG);
C('Vũ Gia: có tiền về đã ghi và chờ xử lý', [txns.some((t) => t.status === 'da_ghi'), txns.some((t) => t.status === 'cho_xu_ly')], [true, true]);

finish('Dữ liệu mẫu');
