// Kiểm thử tạo ngược đơn đặt hàng từ các hóa đơn bán ngay — chạy: node test/invoice-to-order.test.js
import { freshDb, makeApi, suite, finish, rid, daysAgo as D } from './harness.js';

freshDb();
const api = makeApi();
const { G, C, E } = suite();

const owner = await api.user('chu@gomsu.vn');
api.as(owner);
const books = await api.call('bootstrap');
const TH = books.find((b) => b.short_name === 'TH').id;
const TM = (await api.q('funds', TH))[0].id;
await api.call('import_products', { book_id: TH, request_id: rid(), opening_date: D(60), rows: [
  { sku: 'NGOI', name: 'Ngói', unit: 'Viên', cost: 500, price1: 1000, qty: 1000 },
  { sku: 'DIEM', name: 'Diềm', unit: 'Viên', cost: 300, price1: 800, qty: 1000 },
  { sku: 'LO', name: 'Lọ hoa', unit: 'Cái', cost: 100, price1: 400, qty: 100 }] });
const P = Object.fromEntries((await api.q('products', TH)).map((x) => [x.sku, x.id]));
const A = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'Anh Thắng' })).id;
const sell = async (date, lines, extra = {}) => api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: A, kind: 'ban_san', status: 'xac_nhan',
  deliver_now: true, order_date: date, lines, ...extra });
const h1 = await sell(D(20), [{ product_id: P.NGOI, qty: 100, unit_price: 1000 }], { discount: 5000, shipping_fee: 20000 });
const h2 = await sell(D(10), [{ product_id: P.NGOI, qty: 50, unit_price: 1000 }, { product_id: P.DIEM, qty: 10, unit_price: 800 }]);
const h3 = await sell(D(5), [{ product_id: P.DIEM, qty: 20, unit_price: 800 }]);
const lone = await sell(D(3), [{ product_id: P.LO, qty: 2, unit_price: 400 }]);
await api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'thu_khach', date: D(4), fund_id: TM, party_id: A, amount: 50000,
  allocations: [{ doc_type: 'don_ban', doc_id: h2.id, amount: 50000 }] });
const before = await api.q('sales_orders', TH, [['customer_id', 'eq', A]]);
const sumOf = (rows, k) => rows.reduce((s, r) => s + r[k], 0);
const stock = async () => (await api.q('products', TH)).map((x) => [x.sku, x.on_hand]).sort();
const stockBefore = await stock();
const custBefore = await api.one('customers', TH, [['id', 'eq', A]]);

G('1. Tìm hóa đơn liên quan: chung mặt hàng, gần ngày nhau');
const c = await api.call('invoice_merge_candidates', { book_id: TH, invoice_id: h1.id });
C('Có 4 hóa đơn của khách', c.invoices.length, 4);
C('Nhóm tự tìm gồm 3 hóa đơn ngói / diềm', c.groups.map((g) => g.length), [3]);
C('Chọn sẵn nhóm của hóa đơn đang mở', [...c.picked].sort(), [h1.id, h2.id, h3.id].sort());
const c2 = await api.call('invoice_merge_candidates', { book_id: TH, invoice_id: lone.id });
C('Hóa đơn lẻ: chỉ chọn sẵn chính nó', c2.picked, [lone.id]);

G('2. Gộp 3 hóa đơn thành một đơn đặt hàng');
const r = await api.call('make_order_from_invoices', { book_id: TH, request_id: rid(), invoice_ids: [h3.id, h1.id, h2.id] });
C('Mã đơn đặt hàng DH', r.code.slice(0, 2), 'DH');
const o = await api.one('sales_orders', TH, [['id', 'eq', r.id]]);
C('Đơn là đơn đặt hàng, ngày theo hóa đơn sớm nhất', [o.kind, o.order_date], ['dat_hang', D(20)]);
C('Hai hóa đơn còn lại đã gộp (không còn đơn riêng)', (await api.q('sales_orders', TH, [['customer_id', 'eq', A]])).length, 2);
const all3 = before.filter((x) => [h1.id, h2.id, h3.id].includes(x.id)).sort((a, b) => a.order_date.localeCompare(b.order_date));
C('Tổng tiền, đã giao, đã thu không đổi', [o.order_total, o.delivered_value, o.paid_net], [sumOf(all3, 'order_total'), sumOf(all3, 'delivered_value'), sumOf(all3, 'paid_net')]);
C('Đơn giao đủ', o.remaining_qty, 0);
const inv = await api.q('order_invoices', TH, [['order_id', 'eq', r.id]], 'delivery_date');
C('Ba hóa đơn HD giữ nguyên mã và ngày', inv.map((x) => [x.code, x.delivery_date]), [[h1.code, D(20)], [h2.code, D(10)], [h3.code, D(5)]]);
C('Mỗi hóa đơn giữ số tiền', inv.map((x) => x.total), all3.map((x) => x.order_total));
C('Tiền đã thu vẫn nằm ở HD đợt 2', inv.map((x) => x.paid), [0, 50000, 0]);
C('Tồn kho không đổi', await stock(), stockBefore);
const custAfter = await api.one('customers', TH, [['id', 'eq', A]]);
const money = (x) => [x.delivered, x.paid, x.balance, x.receivable, x.prepaid, x.total_bought];
C('Công nợ khách không đổi', money(custAfter), money(custBefore));

G('3. Chặn trường hợp không hợp lệ');
await E('Đơn đã là đơn đặt hàng', () => api.call('make_order_from_invoices', { book_id: TH, request_id: rid(), invoice_ids: [r.id] }), /đơn đặt hàng/);
const B = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'Chị Hoa' })).id;
const hb = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: B, kind: 'ban_san', status: 'xac_nhan', deliver_now: true, order_date: D(2),
  lines: [{ product_id: P.LO, qty: 1, unit_price: 400 }] });
await E('Khác khách', () => api.call('make_order_from_invoices', { book_id: TH, request_id: rid(), invoice_ids: [lone.id, hb.id] }), /cùng một khách/);
G('4. Một hóa đơn cũng tạo được đơn');
const one1 = await api.call('make_order_from_invoices', { book_id: TH, request_id: rid(), invoice_ids: [lone.id] });
const o1 = await api.one('sales_orders', TH, [['id', 'eq', one1.id]]);
C('Đơn đặt hàng có 1 đợt giao, giữ tổng tiền', [o1.kind, o1.delivery_count, o1.order_total], ['dat_hang', 1, 800]);
const inv1 = await api.q('order_invoices', TH, [['order_id', 'eq', one1.id]]);
C('Hóa đơn giữ mã cũ', inv1.map((x) => x.code), [lone.code]);

G('5. Hóa đơn chưa giao và phiếu tạm: thành hàng còn phải giao của đơn, tiền trả trước thành tiền cọc');
const wait = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: A, kind: 'ban_san', status: 'xac_nhan', order_date: D(2),
  lines: [{ product_id: P.LO, qty: 3, unit_price: 400 }] });
await api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'thu_khach', date: D(2), fund_id: TM, party_id: A, amount: 500,
  allocations: [{ doc_type: 'don_ban', doc_id: wait.id, amount: 500 }] });
const draft = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: A, kind: 'ban_san', order_date: D(1), lines: [{ product_id: P.LO, qty: 1, unit_price: 400 }] });
const c5 = await api.call('invoice_merge_candidates', { book_id: TH, invoice_id: wait.id });
C('Hóa đơn chờ giao và phiếu tạm được chọn sẵn cùng nhóm', [...c5.picked].sort(), [wait.id, draft.id].sort());
C('Ghi rõ trạng thái', c5.invoices.filter((x) => [wait.id, draft.id].includes(x.id)).map((x) => x.state).sort(), ['Chờ giao', 'Phiếu tạm']);
const r5 = await api.call('make_order_from_invoices', { book_id: TH, request_id: rid(), invoice_ids: [wait.id, draft.id] });
const o5 = await api.one('sales_orders', TH, [['id', 'eq', r5.id]]);
C('Đơn đã xác nhận, còn 4 cái phải giao, chưa có hóa đơn HD', [o5.kind, o5.status, o5.remaining_qty, o5.delivery_count], ['dat_hang', 'xac_nhan', 4, 0]);
C('Tiền đã trả thành tiền cọc', [o5.paid_net, o5.payment_status], [500, 'da_dat_coc']);
const ls5 = await api.q('sales_order_lines', TH, [['order_id', 'eq', r5.id]]);
const g5 = await api.call('deliver', { book_id: TH, request_id: rid(), order_id: r5.id, date: D(0), lines: ls5.map((l) => ({ order_line_id: l.id, qty: l.remaining_qty })), deposit_used: 500 });
const inv5 = await api.q('order_invoices', TH, [['order_id', 'eq', r5.id]]);
C('Giao tiếp được: hóa đơn HD mới, cọc ghi riêng không trừ vào hóa đơn', [g5.code.slice(0, 2), inv5[0].total, inv5[0].paid, inv5[0].debt], ['HD', 1600, 0, 1600]);
const d6 = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: A, kind: 'ban_san', order_date: D(0), lines: [{ product_id: P.LO, qty: 1, unit_price: 400 }] });
const r6 = await api.call('make_order_from_invoices', { book_id: TH, request_id: rid(), invoice_ids: [d6.id] });
C('Chỉ có phiếu tạm: đơn đặt hàng vẫn là phiếu tạm', (await api.one('sales_orders', TH, [['id', 'eq', r6.id]])).status, 'nhap');

G('6. Lập hóa đơn trước, đặt đơn sau: gắn hóa đơn vào đơn đặt hàng có sẵn');
const K = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'Anh Hoàn' })).id;
const sellK = (date, lines, extra = {}) => api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: K, kind: 'ban_san', status: 'xac_nhan',
  deliver_now: true, order_date: date, lines, ...extra });
const k1 = await sellK(D(15), [{ product_id: P.NGOI, qty: 40, unit_price: 1000 }]);
await api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'thu_khach', date: D(15), fund_id: TM, party_id: K, amount: 40000,
  allocations: [{ doc_type: 'don_ban', doc_id: k1.id, amount: 40000 }] });
const k2 = await sellK(D(8), [{ product_id: P.NGOI, qty: 30, unit_price: 1100 }, { product_id: P.LO, qty: 2, unit_price: 400 }]);
const dh = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: K, kind: 'dat_hang', status: 'xac_nhan', order_date: D(1),
  lines: [{ product_id: P.NGOI, qty: 100, unit_price: 1000 }, { product_id: P.DIEM, qty: 20, unit_price: 800 }] });
const kBefore = await api.one('customers', TH, [['id', 'eq', K]]);
const c6 = await api.call('invoice_merge_candidates', { book_id: TH, invoice_id: k1.id });
C('Gợi ý gắn vào đơn có sẵn của khách', [c6.target, c6.orders.length], [dh.id, 1]);
const c6b = await api.call('invoice_merge_candidates', { book_id: TH, order_id: dh.id });
C('Mở từ đơn: chọn sẵn các hóa đơn có mặt hàng chung', [c6b.target, [...c6b.picked].sort()], [dh.id, [k1.id, k2.id].sort()]);
const r6b = await api.call('make_order_from_invoices', { book_id: TH, request_id: rid(), invoice_ids: [k1.id, k2.id], order_id: dh.id });
C('Gắn vào đúng đơn, giữ mã đơn', [r6b.id, r6b.code, r6b.attached], [dh.id, dh.code, true]);
const odh = await api.one('sales_orders', TH, [['id', 'eq', dh.id]]);
const ldh = await api.q('sales_order_lines', TH, [['order_id', 'eq', dh.id]], 'line_no');
const byP = (pid, k) => ldh.filter((l) => l.product_id === pid).reduce((s, l) => s + l[k], 0);
C('Ngói: đặt 100, đã giao 70 (hai hóa đơn), còn 30', [byP(P.NGOI, 'eff_qty'), byP(P.NGOI, 'delivered_qty'), byP(P.NGOI, 'remaining_qty')], [100, 70, 30]);
C('Diềm chưa giao vẫn còn 20; lọ hoa lấy thêm ngoài đơn', [byP(P.DIEM, 'remaining_qty'), byP(P.LO, 'eff_qty'), byP(P.LO, 'remaining_qty')], [20, 2, 0]);
C('Đơn có 2 hóa đơn, giữ mã HD', (await api.q('order_invoices', TH, [['order_id', 'eq', dh.id]], 'delivery_date')).map((x) => x.code), [k1.code, k2.code]);
C('Tổng đơn = phần còn lại theo giá đặt + hai hóa đơn theo giá đã bán', odh.order_total, 30 * 1000 + 20 * 800 + 40000 + 30 * 1100 + 800);
C('Đã giao, đã thu đúng như hai hóa đơn', [odh.delivered_value, odh.paid_net], [40000 + 33000 + 800, 40000]);
const kAfter = await api.one('customers', TH, [['id', 'eq', K]]);
C('Công nợ khách không đổi', [kAfter.balance, kAfter.delivered], [kBefore.balance, kBefore.delivered]);
const k3 = await sellK(D(1), [{ product_id: P.LO, qty: 1, unit_price: 400 }], { vat_rate: 8 });
await E('Khác thuế suất với đơn', () => api.call('make_order_from_invoices', { book_id: TH, request_id: rid(), invoice_ids: [k3.id], order_id: dh.id }), /thuế suất/);

G('7. Sửa ngày bán của hóa đơn');
const s7 = await sellK(D(3), [{ product_id: P.LO, qty: 1, unit_price: 400 }]);
await api.call('update_order_info', { book_id: TH, id: s7.id, order_date: D(6) });
const o7 = await api.one('sales_orders', TH, [['id', 'eq', s7.id]]);
const d7 = (await api.q('deliveries', TH, [['order_id', 'eq', s7.id]]))[0];
C('Hóa đơn bán ngay: ngày bán và ngày giao đổi theo', [o7.order_date, d7.delivery_date], [D(6), D(6)]);
const mv7 = await api.q('stock_moves', TH, [['doc_id', 'eq', d7.id]]);
C('Thẻ kho đổi ngày theo', [...new Set(mv7.map((m) => m.move_date))], [D(6)]);
const hd = (await api.q('order_invoices', TH, [['order_id', 'eq', dh.id]], 'delivery_date'))[1];
await api.call('set_delivery_date', { book_id: TH, id: hd.id, date: D(9) });
C('Hóa đơn HD của đơn đặt hàng đổi ngày', (await api.one('order_invoices', TH, [['id', 'eq', hd.id]])).delivery_date, D(9));
await E('Không đổi sang ngày tương lai', () => api.call('set_delivery_date', { book_id: TH, id: hd.id, date: '2999-01-01' }), /tương lai/);

finish('Tạo đơn đặt hàng từ hóa đơn');
