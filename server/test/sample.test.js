// Dữ liệu mẫu theo giấy tờ thật: chạy toàn bộ rồi đối chiếu các số in trên hợp đồng, biên bản, hóa đơn, bảng đặt xưởng, báo giá — chạy: node test/sample.test.js
import { freshDb, makeApi, suite, finish, TODAY } from './harness.js';
import { seedSample } from '../scripts/sample-seed-data.js';

freshDb();
const api = makeApi();
const { G, C } = suite();
const owner = await api.user('chu@gomsu.vn');
const r = await seedSample({ call: (fn, p) => api.call(fn, p), svc: (fn, p) => api.svc(fn, p), ensureUser: (e) => api.user(e), setUser: (u) => api.as(u), owner, today: TODAY() });
api.as(owner);
const { TH, VG, AN } = r;

G('Hợp đồng 1009/2026/HĐKT');
const so = await api.one('sales_orders', TH, [['id', 'eq', r.hd.id]]);
C('Tổng tiền, VAT, tổng thanh toán đúng hợp đồng', [so.goods_total, so.vat_total, so.order_total], [475854600, 38068368, 513922968]);
C('Đã cọc 80 triệu, còn thanh toán đúng Bảng đối chiếu', [so.paid_net, so.remaining_to_pay], [80000000, 433922968]);
C('Giao đủ 4 đợt', [so.delivery_count, so.remaining_qty], [4, 0]);
const k = await api.one('contracts', TH, [['id', 'eq', r.contract.id]]);
C('Hợp đồng đã đối chiếu', [k.code, !!k.reconciled_at], ['1009/2026/HĐKT', true]);
const deliveries = await api.q('deliveries', TH, [['order_id', 'eq', r.hd.id]], 'delivery_date');
const dl = await api.q('delivery_lines', TH, [['order_id', 'eq', r.hd.id]]);
const value = (id) => dl.filter((x) => x.delivery_id === id).reduce((s, x) => s + x.revenue, 0);
C('Tiền từng đợt đúng Bảng đối chiếu', deliveries.map((d) => value(d.id)), [143874000, 159435600, 155745000, 16800000]);

G('Hóa đơn Chị Đinh Hằng');
const hang = await api.one('sales_orders', TH, [['id', 'eq', r.hangOrder.id]]);
C('Tổng tiền hàng, ship, chiết khấu', [hang.goods_gross, hang.ship_billed, hang.discount], [117200000, 3500000, 3000000]);
C('Tổng thanh toán còn lại đúng hóa đơn', hang.remaining_to_pay, 82700000);

G('Bảng đặt xưởng');
const fac = await api.call('rpt_factory', { book_id: TH });
const left = (name) => fac.lines.find((l) => l.order_id === r.chuaOrder.id && l.product_name === name)?.remaining;
C('Còn SX của Chùa Hưng Yên đúng bảng', [left('Ngói âm 27 hổ phách'), left('Ngói dương 43 hổ phách'), left('Diềm âm hổ phù 43 xanh đồng')], [28716, 6246, 815]);

G('Báo giá');
const q = await api.one('quotes', TH, [['id', 'eq', r.sampleQuote.id]]);
C('Tổng báo giá đúng mẫu', [q.body.goods, q.body.ship.amount, q.total], [2782157500, 98270900, 2880428400]);

G('Sổ kho, công nợ, quỹ');
for (const [b, name] of [[TH, 'Thanh Hải'], [VG, 'Vũ Gia'], [AN, 'Anamtile']]) {
  const bad = await api.sql(`select p.sku from products p left join (select product_id, sum(qty) q, sum(value) v from stock_moves group by 1) m on m.product_id = p.id
    where p.book_id = ? and not p.is_kit and (coalesce(m.q, 0) <> p.on_hand or coalesce(m.v, 0) <> p.stock_value)`, [b]);
  C(`${name}: sổ kho khớp tồn từng SKU`, bad.length, 0);
  const ov = await api.call('rpt_overview', { book_id: b, from: '2026-01-01', to: TODAY() });
  C(`${name}: tồn quỹ khớp các quỹ`, ov.fund_balance, (await api.q('funds', b)).reduce((s, f) => s + f.balance, 0));
  C(`${name}: phải thu khớp sổ khách`, ov.receivable, (await api.q('customers', b)).reduce((s, c) => s + c.receivable, 0));
}
C('Thanh Hải: đủ hàng bảng giá và biến thể', (await api.q('products', TH)).length, 198);
C('Vũ Gia: có tiền về đã ghi và chờ xử lý', (await api.q('bank_txns', VG)).map((t) => t.status).sort(), ['cho_xu_ly', 'da_ghi']);

finish('Dữ liệu mẫu theo giấy tờ thật');
