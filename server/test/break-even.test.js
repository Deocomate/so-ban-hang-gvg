// Kiểm thử báo cáo hòa vốn, so sánh thương hiệu, hệ số giá và làm tròn giá — chạy: node test/break-even.test.js
import { freshDb, makeApi, suite, finish, rid, TODAY } from './harness.js';
import { roundPrice } from '../src/domain/price-books.js';

const { G, C, E } = suite();
freshDb();
const api = makeApi();
const owner = await api.user('chu@gomsu.vn'); await api.user('nv@gomsu.vn');
api.as(owner);
const books = await api.call('bootstrap');
const TH = books.find((b) => b.short_name === 'TH').id;
const d = TODAY();
const cust = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'Khách lẻ A' })).id;
const sp = (await api.call('save_product', { book_id: TH, name: 'Bình gốm', unit: 'Cái', price1: 500000 })).id;
await api.call('adjust_stock', { book_id: TH, date: d, reason: 'dau_ky', lines: [{ product_id: sp, qty_delta: 100, unit_cost: 200000 }] });
for (const n of [3, 2]) {
  const o = await api.call('save_sales_order', { book_id: TH, customer_id: cust, status: 'xac_nhan', lines: [{ product_id: sp, qty: n, unit_price: 500000 }] });
  const line = (await api.q('sales_order_lines', TH, [['order_id', 'eq', o.id]]))[0];
  await api.call('deliver', { order_id: o.id, date: d, shipping_fee: 0, lines: [{ order_line_id: line.id, qty: n }] });
}
const exp = (category, amount) => api.call('save_expense', { book_id: TH, request_id: rid(), date: d, category, amount });
await exp('Quảng cáo Facebook', 100000);
await exp('Bao bì, đóng gói', 20000);
await exp('Lương', 300000);
await exp('Thuê nhà / cửa hàng', 150000);
await exp('Tiền điện', 30000);
await exp('Văn phòng phẩm', 10000);

G('1. Số đầu vào hòa vốn lấy từ sổ');
const be = await api.call('rpt_break_even', { book_id: TH, month: d });
const ov = await api.call('rpt_overview', { book_id: TH, from: be.from, to: be.to });
C('Tháng của báo cáo', be.month, d.slice(0, 8) + '01');
C('Doanh thu thuần, giá vốn, số đơn', [be.revenue, be.cogs, be.orders], [ov.revenue_net, ov.cogs, 2]);
C('Nhóm chi phí vào đúng khoản', [be.ads, be.other_var, be.staff, be.rent, be.utilities, be.tools, be.other_fixed], [100000, 20000, 300000, 150000, 30000, 0, 10000]);
const sum = be.revenue - be.cogs - be.ads - be.damage - be.other_var - be.staff - be.rent - be.utilities - be.tools - be.other_fixed;
C('Lãi lỗ theo mô hình hòa vốn khớp lãi lỗ tổng quan', sum, ov.profit);
C('Hệ số giá mặc định', be.multipliers, [2, 2.2, 2.5, 3]);

G('2. Hệ số giá lưu trong cài đặt sổ');
await api.call('update_book_settings', { book_id: TH, settings: { price_multipliers: [1.8, 2.4] } });
C('Lưu hệ số mới', (await api.call('rpt_break_even', { book_id: TH, month: d })).multipliers, [1.8, 2.4]);
await E('Hệ số ≤ 1 bị chặn', () => api.call('update_book_settings', { book_id: TH, settings: { price_multipliers: [1] } }), /Hệ số giá/);

G('3. So sánh thương hiệu');
const br = await api.call('rpt_brands', { book_id: TH, month: d });
C('Có đủ các sổ thật của chủ', br.brands.length, books.filter((b) => !b.is_demo).length);
C('Số của sổ TH trùng báo cáo hòa vốn', br.brands.find((b) => b.book_id === TH).revenue, be.revenue);

G('4. Quyền');
await api.call('upsert_member', { book_id: TH, email: 'nv@gomsu.vn', role: 'staff', perms: { xem_bao_cao: true } });
api.as(await api.user('nv@gomsu.vn'));
await E('Không có quyền giá vốn thì không xem hòa vốn', () => api.call('rpt_break_even', { book_id: TH, month: d }), /giá vốn/);
C('So sánh thương hiệu bỏ qua sổ không có quyền giá vốn', (await api.call('rpt_brands', { book_id: TH, month: d })).brands.length, 0);
api.as(owner);

G('5. Làm tròn giá trong công thức bảng giá');
C('Tự động: dưới 100 nghìn bước 1.000, làm tròn lên', roundPrice(41200, 'auto', 'up'), 42000);
C('Tự động: dưới 1 triệu bước 5.000', roundPrice(412300, 'auto', 'up'), 415000);
C('Tự động: dưới 10 triệu bước 10.000, gần nhất', roundPrice(4123000, 'auto', 'nearest'), 4120000);
C('Tự động: từ 10 triệu bước 100.000, xuống', roundPrice(12345678, 'auto', 'down'), 12300000);
C('Không làm tròn giữ nguyên', roundPrice(41234, 0), 41234);
const pb = await api.call('save_price_book', { book_id: TH, name: 'Đại lý I', formula: { base: 'cost', op: '+', value: 30, pct: true, round: 'auto', round_mode: 'up' } });
await api.call('apply_price_formula', { book_id: TH, price_book_id: pb.id, product_ids: [sp] });
const it = (await api.sql(`select price from price_book_items where price_book_id = ? and product_id = ?`, [pb.id, sp]))[0];
C('Giá vốn 200.000 + 30% = 260.000 (đã tròn bước 5.000)', it.price, 260000);
await E('Bước làm tròn lạ bị chặn', () => api.call('save_price_book', { book_id: TH, name: 'X', formula: { base: 'cost', value: 1, round: 7 } }), /làm tròn/);

finish('Hòa vốn · so sánh thương hiệu · làm tròn giá');
