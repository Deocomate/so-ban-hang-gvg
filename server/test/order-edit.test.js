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

G('2. Hủy đợt giao bấm nhầm: hàng về kho, đơn quay lại chờ giao');
const before = await stock(P);
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

G('6. Tự động xử lý thay vì bắt làm từng bước (như KiotViet)');
const sale = async (cust, ls, extra = {}) => (await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: cust, kind: 'ban_san', order_date: D(0), deliver_now: true, lines: ls, ...extra })).id;
const resave = async (o, cust, ls, extra = {}) => api.call('save_sales_order', { book_id: TH, request_id: rid(), id: o, customer_id: cust, kind: 'ban_san', status: 'xac_nhan', order_date: D(0), lines: ls, ...extra });
const payOf = async (code) => api.one('payments', TH, [['code', 'eq', code]]);
// a) Đổi khách khi đơn đã giao, đã thu: phiếu thu tự chuyển sang khách mới
const o3 = await sale(A, [{ product_id: P, qty: 1, unit_price: 1000 }], { deposit: { amount: 1000, fund_id: TM } });
const pc3 = (await api.q('doc_payments', TH, [['doc_id', 'eq', o3]]))[0].code;
const l3 = await lines(o3);
const r3 = await resave(o3, B, l3.map((l) => ({ id: l.id, product_id: l.product_id, qty: l.qty, unit_price: l.unit_price })));
C('Đổi khách thành công', (await order(o3)).customer_id, B);
C('Phiếu thu chuyển sang khách mới', (await payOf(pc3)).party_id, B);
C('Đơn vẫn đã thu đủ', (await order(o3)).receivable, 0);
C('Báo cho người dùng biết đã tự chuyển', r3.notices.some((x) => x.includes(pc3)), true);
// b) Phiếu thu chung cho hai đơn: tách phần của đơn đổi khách ra phiếu mới
const o4 = await sale(A, [{ product_id: Q, qty: 1, unit_price: 400 }]);
const o5 = await sale(A, [{ product_id: Q, qty: 1, unit_price: 600 }]);
const pr = await api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'thu_khach', date: D(0), fund_id: TM, party_id: A, amount: 1000,
  allocations: [{ doc_type: 'don_ban', doc_id: o4, amount: 400 }, { doc_type: 'don_ban', doc_id: o5, amount: 600 }] });
const l4 = await lines(o4);
await resave(o4, B, l4.map((l) => ({ id: l.id, product_id: l.product_id, qty: l.qty, unit_price: l.unit_price })));
C('Phiếu chung còn phần của đơn kia', (await payOf(pr.code)).amount, 600);
const split = (await api.q('doc_payments', TH, [['doc_id', 'eq', o4]]))[0];
C('Phần của đơn đổi khách thành phiếu mới của khách mới', [(await payOf(split.code)).party_id, (await payOf(split.code)).amount], [B, 400]);
C('Cả hai đơn vẫn đã thu đủ', [(await order(o4)).receivable, (await order(o5)).receivable], [0, 0]);
// c) Hóa đơn đã giao: bỏ một dòng, giảm số lượng → tự hủy phiếu giao cũ và giao lại
const o6 = await sale(A, [{ product_id: P, qty: 3, unit_price: 1000 }, { product_id: Q, qty: 2, unit_price: 400 }]);
const sP = await stock(P); const sQ = await stock(Q);
const l6 = await lines(o6);
const g6 = (await api.q('deliveries', TH, [['order_id', 'eq', o6]]))[0].code;
const r6 = await resave(o6, A, [{ id: l6[0].id, product_id: P, qty: 1, unit_price: 1000 }]);
const v6 = await order(o6);
C('Giao lại đủ theo đơn mới', [v6.delivery_count, v6.remaining_qty, v6.delivered_value], [1, 0, 1000]);
C('Hàng bỏ / giảm đã về kho', [await stock(P), await stock(Q)], [sP + 2, sQ + 2]);
C('Báo phiếu giao cũ đã tự hủy', r6.notices.some((x) => x.includes(g6)), true);
// d) Đơn đặt giao một phần: giảm dưới số đã giao → giao lại đúng số mới, phần còn lại vẫn chờ giao
const o7 = (await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: A, kind: 'dat_hang', status: 'xac_nhan', order_date: D(0), lines: [{ product_id: Q, qty: 10, unit_price: 400 }] })).id;
let l7 = await lines(o7);
await api.call('deliver', { book_id: TH, request_id: rid(), order_id: o7, date: D(0), lines: [{ order_line_id: l7[0].id, qty: 4 }] });
await edit(o7, [{ id: l7[0].id, product_id: Q, qty: 3, unit_price: 400 }]);
l7 = await lines(o7);
C('Đơn đặt: giao lại 3, không còn phải giao', [l7[0].delivered_qty, (await order(o7)).remaining_qty], [3, 0]);
// e) Hủy hóa đơn đã giao: tự hủy phiếu giao, hàng về kho, tiền đã thu thành tiền cần hoàn
const o8 = await sale(A, [{ product_id: P, qty: 2, unit_price: 1000 }], { deposit: { amount: 2000, fund_id: TM } });
const s8 = await stock(P);
const c8 = await api.call('cancel_sales_order', { book_id: TH, id: o8, reason: 'Khách đổi ý' });
const v8 = await order(o8);
C('Đơn đã hủy, không còn phiếu giao', [v8.status, v8.delivery_count], ['huy', 0]);
C('Hàng về kho', await stock(P), s8 + 2);
C('Báo số tiền cần hoàn', c8.paid, 2000);
await E('Đơn đã có phiếu trả hàng thì không hủy được', () => api.call('cancel_sales_order', { book_id: TH, id: o2, reason: 'x' }), 'trả hàng');
// f) Nút Lưu trong chi tiết: sửa nhanh ghi chú, người bán
await api.call('update_order_info', { book_id: TH, id: o6, note: 'Giao buổi chiều', staff: 'Mai', channel: null });
C('Lưu nhanh ghi chú và người bán', [(await order(o6)).note, (await order(o6)).staff], ['Giao buổi chiều', 'Mai']);
C('Lưu nhanh có ghi lịch sử', (await events(o6)).at(-1).summary, 'Sửa thông tin hóa đơn');

G('Giá riêng khách deal: lưu cờ theo từng dòng, sửa đơn giữ hoặc bỏ được');
const oD = (await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: A, kind: 'dat_hang', status: 'xac_nhan', order_date: D(0),
  lines: [{ product_id: P, qty: 2, unit_price: 850, custom_price: true }, { product_id: Q, qty: 1, unit_price: 400 }] })).id;
let lD = await lines(oD);
C('Dòng deal có cờ giá riêng, dòng thường không', lD.map((l) => [l.unit_price, l.custom_price]), [[850, 1], [400, 0]]);
await edit(oD, [{ id: lD[0].id, product_id: P, qty: 2, unit_price: 1000, custom_price: false }, { id: lD[1].id, product_id: Q, qty: 1, unit_price: 380, custom_price: true }]);
lD = await lines(oD);
C('Sửa đơn: bỏ giá riêng dòng 1, đặt giá riêng dòng 2', lD.map((l) => [l.unit_price, l.custom_price]), [[1000, 0], [380, 1]]);

finish('Sửa đơn đã giao · hủy đợt giao · lịch sử đơn');
