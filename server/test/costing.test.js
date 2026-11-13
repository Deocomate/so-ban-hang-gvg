// Phương pháp tính giá vốn: xem trước, đổi qua lại bình quân ↔ cố định, chỉ áp dụng cho chứng từ mới — chạy: node test/costing.test.js
import { freshDb, makeApi, suite, finish, TODAY, rid } from './harness.js';
import { seedSample } from '../scripts/sample-seed-data.js';

freshDb();
const api = makeApi();
const { G, C, E } = suite();
const owner = await api.user('chu@gomsu.vn');
const r = await seedSample({ call: (fn, p) => api.call(fn, p), svc: (fn, p) => api.svc(fn, p), ensureUser: (e) => api.user(e), setUser: (u) => api.as(u), owner, today: TODAY() });
api.as(owner);
const { TH } = r;

const state = async () => ({
  moves: (await api.sql(`select id, value, balance_value from stock_moves where book_id = ? and doc_type not in ('chenh_lech', 'danh_gia_lai') order by id`, [TH])).map((m) => [m.id, Math.round(m.value), Math.round(m.balance_value)]),
  cogs: (await api.sql(`select x.id, x.cogs from delivery_lines x join deliveries d on d.id = x.delivery_id where d.book_id = ? order by x.id`, [TH])).map((x) => [x.id, Math.round(x.cogs)]),
  stock: (await api.sql(`select id, on_hand, stock_value from products where book_id = ? order by id`, [TH])).map((p) => [p.id, p.on_hand, Math.round(p.stock_value)]),
  extra: (await api.sql(`select coalesce(sum(value), 0) as v from stock_moves where book_id = ? and doc_type = 'chenh_lech'`, [TH]))[0].v,
});
const info = await api.call('cost_method_info', { book_id: TH });
const first = info.first_date;

G('Mặc định và xem trước');
C('Sổ mặc định dùng giá vốn trung bình', info.method, 'avg');
const s0 = await state();
C('Sổ mẫu có giao hàng để so sánh', s0.cogs.length > 0, true);
const same = await api.call('cost_method_preview', { book_id: TH, method: 'avg', mode: 'from', from: first });
C('Tính lại bình quân từ đầu sổ: giá vốn không đổi', same.totals.cogs_after, same.totals.cogs_before);
C('Tính lại bình quân từ đầu sổ: tồn kho không đổi', same.totals.inventory_after, same.totals.inventory_before);
C('Tính lại bình quân từ đầu sổ: không mã nào đổi', same.totals.changed_products, 0);
const pv = await api.call('cost_method_preview', { book_id: TH, method: 'fixed', mode: 'from', from: first });
C('Xem trước có bảng theo tháng và theo hàng hóa', [pv.months.length > 0, pv.products.length > 0], [true, true]);
C('Xem trước không ghi gì vào sổ', JSON.stringify(await state()), JSON.stringify(s0));
C('Xem trước không đổi phương pháp', (await api.call('cost_method_info', { book_id: TH })).method, 'avg');
await E('Đổi thật phải xác nhận', () => api.call('change_cost_method', { book_id: TH, method: 'fixed', mode: 'from', from: first }), 'xác nhận');

G('Đổi sang giá vốn cố định từ đầu sổ');
const ch = await api.call('change_cost_method', { book_id: TH, method: 'fixed', mode: 'from', from: first, confirm: true });
C('Đã đổi', [ch.method, ch.label], ['fixed', 'Giá vốn cố định']);
const prods = await api.sql(`select * from products where book_id = ? and is_kit = 0 and product_type <> 'dich_vu'`, [TH]);
C('Mọi mã có giá vốn cố định', prods.every((p) => p.fixed_cost != null), true);
C('Tồn kho = số lượng × giá vốn cố định', prods.every((p) => Math.abs(p.stock_value - p.on_hand * p.fixed_cost) < 1), true);
const out = await api.sql(`select m.qty, m.value, p.fixed_cost from stock_moves m join products p on p.id = m.product_id where m.book_id = ? and m.doc_type = 'giao' and m.qty < 0`, [TH]);
C('Giá vốn mỗi lần giao = số lượng × giá vốn cố định', out.every((m) => Math.abs(m.value - Math.round(m.qty * m.fixed_cost)) < 1), true);
C('Giá vốn cố định không sinh chênh lệch giá vốn', (await api.sql(`select count(*) as n from stock_moves where book_id = ? and doc_type = 'chenh_lech'`, [TH]))[0].n, 0);
const plAfter = pv.totals.cogs_after;
const pl = await api.call('cost_method_preview', { book_id: TH, method: 'fixed', mode: 'from', from: first });
C('Số xem trước trùng số sau khi đổi', pl.totals.cogs_before, plAfter);
C('Có ghi lịch sử đổi', (await api.call('cost_method_info', { book_id: TH })).history.length, 1);

G('Đổi về giá vốn trung bình từ đầu sổ: trở lại đúng như cũ');
await api.call('change_cost_method', { book_id: TH, method: 'avg', mode: 'from', from: first, confirm: true });
const s1 = await state();
C('Giá trị từng dòng sổ kho trở lại như cũ', JSON.stringify(s1.moves), JSON.stringify(s0.moves));
C('Giá vốn từng dòng giao trở lại như cũ', JSON.stringify(s1.cogs), JSON.stringify(s0.cogs));
C('Tồn kho từng mã trở lại như cũ', JSON.stringify(s1.stock), JSON.stringify(s0.stock));
C('Chênh lệch giá vốn trở lại như cũ', Math.round(s1.extra), Math.round(s0.extra));

G('Chỉ áp dụng cho chứng từ mới');
const p = prods.find((x) => x.on_hand > 5);
const cogsBefore = s1.cogs;
await api.call('change_cost_method', { book_id: TH, method: 'fixed', mode: 'new', fixed_costs: { [p.id]: 12345 }, confirm: true });
C('Chứng từ cũ giữ nguyên giá vốn', JSON.stringify((await state()).cogs), JSON.stringify(cogsBefore));
let pr = (await api.sql(`select * from products where id = ?`, [p.id]))[0];
C('Giá vốn cố định do người dùng nhập', pr.fixed_cost, 12345);
C('Tồn kho đánh giá lại theo giá mới', pr.stock_value, Math.round(pr.on_hand * 12345));
C('Có dòng đánh giá lại tồn kho hôm nay', (await api.sql(`select count(*) as n from stock_moves where product_id = ? and doc_type = 'danh_gia_lai' and move_date = ?`, [p.id, TODAY()]))[0].n, 1);
const KL = (await api.one('customers', TH, [['code', 'eq', 'KL']])).id;
const so = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: KL, order_date: TODAY(), lines: [{ product_id: p.id, qty: 2 }], deliver_now: true });
C('Đơn mới tính giá vốn cố định', (await api.one('sales_orders', TH, [['id', 'eq', so.id]])).cogs, 24690);
await E('Đổi về cách đang dùng bị chặn', () => api.call('change_cost_method', { book_id: TH, method: 'fixed', mode: 'new', confirm: true }), 'đang dùng');

G('Sửa giá vốn cố định ở phiếu hàng hóa');
await api.call('save_product', { book_id: TH, id: p.id, sku: p.sku, name: p.name, unit: p.unit, product_type: p.product_type, fixed_cost: 20000 });
pr = (await api.sql(`select * from products where id = ?`, [p.id]))[0];
C('Tồn kho đánh giá lại theo giá cố định mới', pr.stock_value, Math.round(pr.on_hand * 20000));

G('Ràng buộc');
await api.call('update_book_settings', { book_id: TH, settings: { lock_date: first } });
await E('Không áp dụng từ ngày đã khóa sổ', () => api.call('cost_method_preview', { book_id: TH, method: 'avg', mode: 'from', from: first }), 'khóa');
const staff = await api.user('nv.gia.von@gomsu.vn');
await api.call('upsert_member', { book_id: TH, email: 'nv.gia.von@gomsu.vn', role: 'staff' });
api.as(staff);
await E('Nhân viên không đổi được phương pháp giá vốn', () => api.call('cost_method_preview', { book_id: TH, method: 'avg', mode: 'new' }), 'chủ cửa hàng');
api.as(owner);

finish('Phương pháp tính giá vốn');
