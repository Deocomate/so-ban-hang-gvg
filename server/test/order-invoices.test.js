// Kiểm thử công nợ theo từng hóa đơn HD lập từ đơn đặt hàng (như KiotViet) — chạy: node test/order-invoices.test.js
import { freshDb, makeApi, suite, finish, rid, daysAgo as D } from './harness.js';

freshDb();
const api = makeApi();
const { G, C, E } = suite();

const owner = await api.user('chu@gomsu.vn');
api.as(owner);
const books = await api.call('bootstrap');
const TH = books.find((b) => b.short_name === 'TH').id;
const TM = (await api.q('funds', TH))[0].id;
await api.call('import_products', { book_id: TH, request_id: rid(), opening_date: D(30), rows: [
  { sku: 'BINH', name: 'Bình gốm', unit: 'Cái', cost: 500, price1: 1000, qty: 100 }] });
const P = (await api.one('products', TH, [['sku', 'eq', 'BINH']])).id;
const A = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'Chị Lan' })).id;
const order = async (id) => api.one('sales_orders', TH, [['id', 'eq', id]]);
const invoices = async (id) => api.q('order_invoices', TH, [['order_id', 'eq', id]], 'delivery_date');
const pay = (allocations, amount) => api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'thu_khach', date: D(0), fund_id: TM, party_id: A,
  amount, allocations });

G('1. Đơn đặt có cọc, giao hai đợt: mỗi đợt là một hóa đơn HD với số đã thu / còn nợ riêng');
const o = (await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: A, kind: 'dat_hang', status: 'xac_nhan', order_date: D(5),
  lines: [{ product_id: P, qty: 10, unit_price: 1000 }] })).id;
await pay([{ doc_type: 'don_ban', doc_id: o, amount: 3000 }], 3000);
const line = (await api.q('sales_order_lines', TH, [['order_id', 'eq', o]]))[0].id;
const g1 = await api.call('deliver', { book_id: TH, request_id: rid(), order_id: o, date: D(4), lines: [{ order_line_id: line, qty: 4 }], deposit_used: 3000 });
const g2 = await api.call('deliver', { book_id: TH, request_id: rid(), order_id: o, date: D(2), lines: [{ order_line_id: line, qty: 6 }] });
let inv = await invoices(o);
C('Hai hóa đơn HD', inv.map((x) => x.code.slice(0, 2)), ['HD', 'HD']);
C('HD đợt 1: 4.000, trừ cọc 3.000, còn nợ 1.000', [inv[0].total, inv[0].paid, inv[0].debt], [4000, 3000, 1000]);
C('HD đợt 2: 6.000 chưa thu', [inv[1].total, inv[1].paid, inv[1].debt], [6000, 0, 6000]);
C('Tổng nợ các hóa đơn bằng nợ của đơn', inv[0].debt + inv[1].debt, (await order(o)).receivable);

G('2. Phiếu thu trừ thẳng vào hóa đơn đợt 2 (không phải hóa đơn cũ nhất)');
const p2 = await pay([{ doc_type: 'hoa_don', doc_id: g2.id, amount: 2500 }], 2500);
inv = await invoices(o);
C('HD đợt 2 đã thu 2.500', [inv[1].paid, inv[1].debt], [2500, 3500]);
C('HD đợt 1 không đổi', inv[0].debt, 1000);
C('Đơn đặt vẫn cộng đủ tiền đã thu', (await order(o)).paid_net, 5500);
const pv = await api.one('payments', TH, [['id', 'eq', p2.id]]);
C('Phiếu thu ghi mã hóa đơn HD', pv.allocations.map((a) => a.doc_code), [inv[1].code]);
await E('Không thu quá số còn nợ của hóa đơn', () => pay([{ doc_type: 'hoa_don', doc_id: g1.id, amount: 1500 }], 1500), /vượt số còn phải trả/);

G('3. Phiếu thu theo đợt trừ hóa đơn cũ trước, danh sách nợ chỉ có mã HD');
const plan = await api.call('preview_receipt', { book_id: TH, customer_id: A, amount: 2000, mode: 'auto' });
C('Danh sách nợ là các hóa đơn HD', plan.docs.map((d) => d.code), inv.map((x) => x.code));
C('Trừ hết 1.000 hóa đơn đợt 1 rồi 1.000 đợt 2', plan.docs.map((d) => d.amount), [1000, 1000]);
await api.call('record_receipt', { book_id: TH, request_id: rid(), customer_id: A, date: D(0), amount: 2000, fund_id: TM, mode: 'auto', expect: plan.allocations });
inv = await invoices(o);
C('Sau phiếu thu: đợt 1 hết nợ, đợt 2 còn 2.500', inv.map((x) => x.debt), [0, 2500]);
C('Nợ đơn khớp', (await order(o)).receivable, 2500);

G('4. Hủy hóa đơn đợt 2: tiền đã thu cho nó quay về đơn đặt');
await api.call('cancel_delivery', { book_id: TH, request_id: rid(), id: g2.id });
inv = await invoices(o);
C('Còn một hóa đơn, đã thu đủ', inv.map((x) => [x.total, x.debt]), [[4000, 0]]);
C('Tiền thu dư thành tiền trả trước của đơn đặt', (await order(o)).prepaid, 3500);

G('5. Hóa đơn bán ngay chỉ có một mã HD: phiếu giao mang luôn mã hóa đơn, không sinh mã GH');
const hd = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: A, kind: 'ban_san', order_date: D(0), deliver_now: true, lines: [{ product_id: P, qty: 1, unit_price: 1000 }] });
const hdDel = (await api.q('deliveries', TH, [['order_id', 'eq', hd.id]]))[0];
C('Mã hóa đơn HD, phiếu giao cùng mã', [hd.code.slice(0, 2), hdDel.code], ['HD', hd.code]);

finish('Công nợ theo từng hóa đơn HD của đơn đặt hàng');
