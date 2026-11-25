// Kiểm thử hình thức thanh toán của đơn đặt hàng (mặc định / đơn hàng lớn) — chạy: node test/pay-term.test.js
import { freshDb, makeApi, suite, finish, rid, daysAgo as D } from './harness.js';
import { depositForDelivery } from '../../web/src/lib/pay-term.js';

freshDb();
const api = makeApi();
const { G, C, E } = suite();

const owner = await api.user('chu@gomsu.vn');
api.as(owner);
const books = await api.call('bootstrap');
const TH = books.find((b) => b.short_name === 'TH').id;
const TM = (await api.q('funds', TH))[0].id;
await api.call('import_products', { book_id: TH, request_id: rid(), opening_date: D(30), rows: [
  { sku: 'NGOI', name: 'Ngói', unit: 'Viên', cost: 500, price1: 1000, qty: 10000000 }] });
const P = (await api.one('products', TH, [['sku', 'eq', 'NGOI']])).id;
const A = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'Chủ đầu tư' })).id;
const order = async (id) => api.one('sales_orders', TH, [['id', 'eq', id]]);
const M = 1000000;

G('1. Lưu hình thức thanh toán của đơn');
const o = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: A, kind: 'dat_hang', status: 'xac_nhan', order_date: D(20),
  pay_term: 'don_lon', pay_ratio: 70, lines: [{ product_id: P, qty: 1000000, unit_price: 1000 }] });
let od = await order(o.id);
C('Đơn hàng lớn, mỗi đợt trả 70%', [od.pay_term, od.pay_ratio, od.order_total], ['don_lon', 70, 1000 * M]);
await E('Tỷ lệ phải từ 1 đến 100%', () => api.call('update_order_info', { book_id: TH, id: o.id, pay_ratio: 0 }), /1 đến 100/);
const line = (await api.q('sales_order_lines', TH, [['order_id', 'eq', o.id]]))[0];
// Lưu lại đơn không gửi hình thức thanh toán (như màn Xử lý đơn hàng): giữ nguyên
await api.call('save_sales_order', { book_id: TH, request_id: rid(), id: o.id, customer_id: A, kind: 'dat_hang', status: 'xac_nhan', order_date: D(20),
  lines: [{ id: line.id, product_id: P, qty: 1000000, unit_price: 1000 }] });
od = await order(o.id);
C('Lưu lại đơn không mất hình thức thanh toán', [od.pay_term, od.pay_ratio], ['don_lon', 70]);

G('2. Đơn 1 tỷ, cọc 500 triệu, 5 đợt 200 triệu: gợi ý mỗi đợt trả 70%, cọc bù vào tổng công nợ ở các đợt cuối');
await api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'thu_khach', date: D(19), fund_id: TM, party_id: A, amount: 500 * M,
  allocations: [{ doc_type: 'don_ban', doc_id: o.id, amount: 500 * M }] });
const pays = []; const deps = [];
for (let i = 0; i < 5; i++) {
  od = await order(o.id);
  const left = Math.max(0, od.paid_net - od.delivered_value);
  const used = depositForDelivery({ term: od.pay_term, ratio: od.pay_ratio, value: 200 * M, deposit: left, remaining: od.order_total - od.delivered_value });
  const g = await api.call('deliver', { book_id: TH, request_id: rid(), order_id: o.id, date: D(15 - i), lines: [{ order_line_id: line.id, qty: 200000 }] });
  deps.push(used / M); pays.push((200 * M - used) / M);
  // Khách trả đúng phần phải trả của đợt
  if (200 * M - used > 0) await api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'thu_khach', date: D(15 - i), fund_id: TM, party_id: A, amount: 200 * M - used,
    allocations: [{ doc_type: 'hoa_don', doc_id: g.id, amount: 200 * M - used }] });
}
C('Phần cọc bù từng đợt (triệu)', deps, [60, 60, 60, 120, 200]);
C('Gợi ý khách trả từng đợt (triệu)', pays, [140, 140, 140, 80, 0]);
od = await order(o.id);
C('Giao đủ, tổng công nợ đơn hết, hết cọc', [od.remaining_qty, od.receivable, od.prepaid, od.paid_net], [0, 0, 0, 1000 * M]);
const inv = await api.q('order_invoices', TH, [['order_id', 'eq', o.id]], 'delivery_date');
C('Cọc không trừ vào hóa đơn: mỗi hóa đơn còn đúng phần cọc bù', inv.map((x) => [x.deposit_used, x.debt / M]), [[0, 60], [0, 60], [0, 60], [0, 120], [0, 200]]);

G('3. Phần cọc bù của đợt theo hình thức thanh toán');
C('Đợt 1 trừ hết phần cọc đủ cho đợt', depositForDelivery({ term: 'mac_dinh', value: 200, deposit: 500, remaining: 1000 }), 200);
C('Cọc ít hơn đợt: trừ hết cọc', depositForDelivery({ term: 'mac_dinh', value: 200, deposit: 50, remaining: 1000 }), 50);
C('Đơn hàng lớn, cọc ít: chỉ trừ phần ngoài 70%', depositForDelivery({ term: 'don_lon', ratio: 70, value: 200, deposit: 50, remaining: 1000 }), 50);

finish('Hình thức thanh toán của đơn đặt hàng');
