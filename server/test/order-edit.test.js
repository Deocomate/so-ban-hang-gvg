// Kiểm thử sửa đơn đã giao / đã thu, hủy đợt giao và lịch sử đơn — chạy: node test/order-edit.test.js
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
  { sku: 'BINH', name: 'Bình gốm', unit: 'Cái', cost: 500, price1: 1000, qty: 100 },
  { sku: 'LO', name: 'Lọ hoa', unit: 'Cái', cost: 200, price1: 400, qty: 100 }] });
const P = (await api.one('products', TH, [['sku', 'eq', 'BINH']])).id;
const Q = (await api.one('products', TH, [['sku', 'eq', 'LO']])).id;
const A = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'Chị Lan' })).id;
const B = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'Anh Minh' })).id;
const order = async (id) => api.one('sales_orders', TH, [['id', 'eq', id]]);
const lines = async (id) => api.q('sales_order_lines', TH, [['order_id', 'eq', id]], 'line_no');
const stock = async (pid) => (await api.one('products', TH, [['id', 'eq', pid]])).on_hand;
const events = async (id) => api.q('order_events', TH, [['order_id', 'eq', id]], 'id');
const edit = async (o, ls, extra = {}) => api.call('save_sales_order', { book_id: TH, request_id: rid(), id: o, customer_id: A, kind: 'dat_hang', status: 'xac_nhan', order_date: D(0), lines: ls, ...extra });

G('1. Giao đủ rồi vẫn sửa được giá, thêm hàng; doanh thu tính lại');
const o1 = (await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: A, kind: 'dat_hang', status: 'xac_nhan', order_date: D(0),
  lines: [{ product_id: P, qty: 10, unit_price: 1000 }] })).id;
let ls = await lines(o1);
const g1 = await api.call('deliver', { book_id: TH, request_id: rid(), order_id: o1, date: D(0), lines: [{ order_line_id: ls[0].id, qty: 10 }] });
C('Giao đủ: doanh thu 10.000', (await order(o1)).delivered_value, 10000);
await api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'thu_khach', date: D(0), fund_id: TM, party_id: A, amount: 10000,
  allocations: [{ doc_type: 'don_ban', doc_id: o1, amount: 10000 }] });
C('Đã thu đủ', (await order(o1)).receivable, 0);
await edit(o1, [{ id: ls[0].id, product_id: P, qty: 10, unit_price: 1200 }]);
C('Sửa giá sau khi giao: doanh thu đã giao thành 12.000', (await order(o1)).delivered_value, 12000);
C('Khách còn nợ phần chênh 2.000', (await order(o1)).receivable, 2000);
await edit(o1, [{ id: ls[0].id, product_id: P, qty: 10, unit_price: 1200 }, { product_id: Q, qty: 5, unit_price: 400 }]);
C('Thêm hàng vào đơn đã giao: còn phải giao 5', (await order(o1)).remaining_qty, 5);
await E('Không bỏ được dòng đã giao', () => edit(o1, [{ product_id: Q, qty: 5, unit_price: 400 }]), 'không bỏ dòng');
await E('Không giảm dưới số đã giao', () => edit(o1, [{ id: ls[0].id, product_id: P, qty: 8, unit_price: 1200 }]), 'thấp hơn số đã giao');
await E('Không đổi sang hàng khác ở dòng đã giao', () => edit(o1, [{ id: ls[0].id, product_id: Q, qty: 10, unit_price: 1200 }]), 'đổi sang hàng khác');
await E('Đã có phiếu thu thì không đổi khách', () => edit(o1, [{ id: ls[0].id, product_id: P, qty: 10, unit_price: 1200 }], { customer_id: B }), 'khách cũ');

G('2. Hủy đợt giao bấm nhầm: hàng về kho, đơn quay lại chờ giao');
const before = await stock(P);
await E('Phải ghi lý do', () => api.call('cancel_delivery', { book_id: TH, request_id: rid(), id: g1.id, reason: '' }), 'lý do');
await api.call('cancel_delivery', { book_id: TH, request_id: rid(), id: g1.id, reason: 'Bấm nhầm giao đủ' });
C('Tồn kho trả lại 10', await stock(P), before + 10);
const v1 = await order(o1);
C('Đơn chưa giao gì, doanh thu 0', [v1.delivered_value, v1.delivery_count], [0, 0]);
C('Tiền đã thu thành tiền trả trước', v1.paid_net, 10000);
ls = await lines(o1);
await edit(o1, [{ id: ls[0].id, product_id: P, qty: 6, unit_price: 1200 }]);
C('Sau khi hủy giao, giảm số lượng được', (await lines(o1)).map((l) => l.qty), [6]);
C('Giá vốn kho giữ nguyên sau khi hủy giao', (await api.one('products', TH, [['id', 'eq', P]])).last_cost, 500);

G('3. Giảm giá cả đơn, phí vận chuyển khi đã giao đủ');
const o2 = (await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: A, kind: 'ban_san', order_date: D(0), deliver_now: true, shipping_fee: 100,
  lines: [{ product_id: P, qty: 2, unit_price: 1000 }, { product_id: Q, qty: 1, unit_price: 400 }] })).id;
const l2 = await lines(o2);
await api.call('save_sales_order', { book_id: TH, request_id: rid(), id: o2, customer_id: A, kind: 'ban_san', order_date: D(0), discount: 400, shipping_fee: 300,
  lines: l2.map((l) => ({ id: l.id, product_id: l.product_id, qty: l.qty, unit_price: l.unit_price })) });
const v2 = await order(o2);
C('Đã giao = tiền hàng − giảm giá + phí vận chuyển mới', v2.delivered_value, 2300);
C('Phí vận chuyển đã tính theo phí mới', v2.ship_billed, 300);

G('4. Đơn có hàng trả lại: không đổi được tiền hàng, không hủy được đợt giao');
const dl = (await api.q('delivery_lines', TH, [['order_id', 'eq', o2]]))[0];
await api.call('sales_return', { book_id: TH, request_id: rid(), order_id: o2, date: D(0), reason: 'Vỡ', lines: [{ delivery_line_id: dl.id, qty: 1 }] });
await E('Không đổi giá khi đã trả hàng', () => api.call('save_sales_order', { book_id: TH, request_id: rid(), id: o2, customer_id: A, kind: 'ban_san', order_date: D(0), discount: 400, shipping_fee: 300,
  lines: l2.map((l) => ({ id: l.id, product_id: l.product_id, qty: l.qty, unit_price: l.unit_price + 100 })) }), 'trả hàng');
const g2 = (await api.q('deliveries', TH, [['order_id', 'eq', o2]]))[0];
await E('Không hủy đợt giao đã có hàng trả', () => api.call('cancel_delivery', { book_id: TH, request_id: rid(), id: g2.id, reason: 'x' }), 'trả lại');
await api.call('save_sales_order', { book_id: TH, request_id: rid(), id: o2, customer_id: A, kind: 'ban_san', order_date: D(0), discount: 400, shipping_fee: 300, note: 'Khách quen',
  lines: l2.map((l) => ({ id: l.id, product_id: l.product_id, qty: l.qty, unit_price: l.unit_price })) });
C('Vẫn sửa được ghi chú', (await order(o2)).note, 'Khách quen');

G('5. Lịch sử đơn ghi bằng lời');
const ev = await events(o1);
C('Các thao tác theo thứ tự', ev.map((e) => e.action), ['tao', 'giao', 'thu_tien', 'sua', 'sua', 'huy_giao', 'sua']);
const sua1 = ev.find((e) => e.action === 'sua');
C('Sửa giá ghi rõ cũ → mới', sua1.detail.some((x) => x.includes('đơn giá 1.000đ → 1.200đ')), true);
C('Sửa ghi tổng đơn cũ → mới', sua1.detail.some((x) => x.startsWith('Tổng đơn: 10.000đ → 12.000đ')), true);
C('Thêm hàng được ghi', ev[4].detail.some((x) => x.startsWith('Thêm LO')), true);
C('Hủy giao ghi lý do', ev[5].detail[0], 'Lý do: Bấm nhầm giao đủ');
C('Ghi người làm', !!ev[0].user_name, true);
C('Ghi thu tiền kèm số tiền', ev[2].summary.includes('10.000đ'), true);
const ev2 = await events(o2);
C('Đơn bán ngay: tạo, giao, sửa, trả hàng, sửa', ev2.map((e) => e.action), ['tao', 'giao', 'sua', 'tra_hang', 'sua']);
const pay = (await api.q('payments', TH, [['party_id', 'eq', A]]))[0];
await api.call('void_payment', { book_id: TH, id: pay.id, reason: 'Thu nhầm' });
C('Hủy phiếu thu được ghi vào lịch sử đơn', (await events(o1)).at(-1).action, 'huy_phieu');

finish('Sửa đơn đã giao · hủy đợt giao · lịch sử đơn');
