// Kiểm thử nghiệp vụ trên Postgres thật (PGlite) — chạy: node tests/business.test.mjs
import { freshDb, makeApi, check, expectError, summary } from './harness.mjs';
import crypto from 'crypto';

const db = await freshDb();
const api = makeApi(db);
const rid = () => crypto.randomUUID();
const log = []; // bảng kết quả cho báo cáo
let group = '';
const G = (name) => { group = name; };
const C = (name, actual, expected, tol) => { const ok = check(`[${group}] ${name}`, actual, expected, tol); log.push({ group, name, expected, actual, ok }); return ok; };
const E = async (name, fn, pat) => { const before = summary().failed; await expectError(`[${group}] ${name}`, fn, pat); log.push({ group, name, expected: 'Báo lỗi / chặn', actual: summary().failed === before ? 'Đã chặn' : 'KHÔNG chặn', ok: summary().failed === before }); };

const [{ d: TODAY }] = await api.sql(`select app.today()::text d`);
const D = (n) => { const t = new Date(TODAY + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - n); return t.toISOString().slice(0, 10); };

// ---------- Chuẩn bị ----------
const owner = await api.user('chu@gomsu.vn');
const staff = await api.user('nhanvien@gomsu.vn');
const outsider = await api.user('nguoila@gomsu.vn');
api.as(owner);
const books = await api.call('bootstrap');
const TH = books.find(b => b.short_name === 'TH').id;
const VG = books.find(b => b.short_name === 'VG').id;
await api.call('upsert_member', { book_id: TH, email: 'nhanvien@gomsu.vn', role: 'staff', display_name: 'Lan' });

const funds = await api.q('funds', TH);
const TM = funds.find(f => f.name === 'Tiền mặt').id, NH = funds.find(f => f.name.includes('ngân hàng')).id;
await api.call('save_fund', { book_id: TH, id: TM, name: 'Tiền mặt', opening_balance: 20000000 });
await api.call('save_fund', { book_id: TH, id: NH, name: 'Tài khoản ngân hàng', opening_balance: 100000000 });
const KL = (await api.one('customers', TH, [['code', 'eq', 'KL']])).id;
const A = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'Đại lý Minh Phát', price_tier: 2, credit_days: 5 })).id;
const B = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'Chùa Phúc Lâm', price_tier: 3, credit_days: 15 })).id;
const X = (await api.call('save_party', { book_id: TH, type: 'ncc', name: 'Xưởng Hưng Thịnh', credit_days: 30 })).id;
const Y = (await api.call('save_party', { book_id: TH, type: 'ncc', name: 'Lò men Quang Vinh', credit_days: 10 })).id;
await api.call('save_opening_debt', { book_id: TH, party_type: 'kh', party_id: A, amount: 20000000, debt_date: D(20), due_date: D(10) });
await api.call('save_opening_debt', { book_id: TH, party_type: 'ncc', party_id: X, amount: 30000000, debt_date: D(20), due_date: D(-5) });

// ---------- IMPORT hàng hóa 1 lần ----------
G('Import hàng hóa + tồn đầu kỳ');
const rows = [
  { sku: 'NGOI-DO-L', name: 'Ngói âm dương L đỏ gốm', category: 'Ngói', size: 'L', color: 'Đỏ gốm', unit: 'Viên', cost: 10000, price1: 18000, price2: 16000, price3: 15000, qty: 5000, low_stock: 1000 },
  { sku: 'GTG-HB', name: 'Gạch thông gió hoa bưởi', category: 'Gạch thông gió', size: '30x30', color: 'Xanh đồng', unit: 'Viên', cost: 28000, price1: 45000, price2: 40000, price3: 38000, qty: 500, low_stock: 100 },
  { sku: 'NGHE-40', name: 'Nghê phong thủy 40cm', category: 'Linh vật - phong thủy', size: '40cm', color: 'Vàng hoàng gia', unit: 'Đôi', cost: 2000000, price1: 3500000, price2: 3000000, price3: 2800000, qty: 4, low_stock: 2 },
  { name: 'Lan can con tiện cao 60', category: 'Lan can - con tiện', size: 'Cao 60', color: 'Nâu da lươn', unit: 'Cái', cost: '', price1: 120000, price2: 115000, price3: 110000, qty: 0 },
];
const imp = await api.call('import_products', { book_id: TH, request_id: rid(), opening_date: D(20), rows });
C('Số sản phẩm tạo mới', imp.created, 4);
C('Tổng số lượng tồn đầu kỳ', imp.opening_qty, 5504);
C('Tổng giá trị tồn đầu kỳ', imp.opening_value, 72000000);
const prods = await api.q('products', TH);
const P = Object.fromEntries(prods.map(p => [p.sku, p]));
C('SKU tự cấp cho dòng không có SKU', P['SP00001']?.name, 'Lan can con tiện cao 60');
const P1 = P['NGOI-DO-L'].id, P2 = P['GTG-HB'].id, P3 = P['NGHE-40'].id, P4 = P['SP00001'].id;
const imp2 = await api.call('import_products', { book_id: TH, request_id: rid(), rows: [{ sku: 'ngoi-do-l', name: 'Ngói âm dương L đỏ gốm', price1: 19000, qty: 999 }] });
C('Import lại SKU đã có: chỉ cập nhật', [imp2.created, imp2.updated, imp2.skipped_qty], [0, 1, 1]);
C('Import lại không làm đổi tồn kho', (await api.one('products', TH, [['id', 'eq', P1]])).on_hand, 5000);
C('Giá bán mức 1 được cập nhật', (await api.one('products', TH, [['id', 'eq', P1]])).price1, 19000);
await E('SKU lặp trong cùng file bị chặn', () => api.call('import_products', { book_id: TH, rows: [{ sku: 'Z1', name: 'a' }, { sku: 'z1', name: 'b' }] }), 'lặp');
await E('Dòng thiếu tên bị chặn', () => api.call('import_products', { book_id: TH, rows: [{ sku: 'Z2', name: '' }] }), 'thiếu tên');
C('Lỗi import không ghi gì (giao dịch trọn vẹn)', (await api.q('products', TH)).length, 4);
await api.call('update_book_settings', { book_id: TH, settings: { price_names: ['Giá lẻ', 'Giá đại lý', 'Giá công trình'] } });

const KIT = (await api.call('save_product', { book_id: TH, sku: 'BO-NG', name: 'Bộ mẫu ngói + gạch', unit: 'Bộ', is_kit: true, price1: 250000, price2: 230000, price3: 220000,
  components: [{ product_id: P1, qty: 10 }, { product_id: P2, qty: 2 }] })).id;

const ord = async (id) => api.one('sales_orders', TH, [['id', 'eq', id]]);
const prod = async (id) => api.one('products', TH, [['id', 'eq', id]]);
const cust = async (id) => api.one('customers', TH, [['id', 'eq', id]]);
const lines = async (oid) => api.q('sales_order_lines', TH, [['order_id', 'eq', oid]], 'line_no');

// ---------- 1. Bán thu đủ tiền ----------
G('1. Bán thu đủ tiền');
const s1 = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: KL, order_date: D(15), channel: 'Bán tại cửa hàng',
  lines: [{ product_id: P1, qty: 100, unit_price: 18000 }], deliver_now: true, deposit: { amount: 1800000, fund_id: TM, method: 'Tiền mặt' } });
let o = await ord(s1.id);
C('Trạng thái giao', o.delivery_status, 'da_giao_du');
C('Trạng thái thanh toán', o.payment_status, 'da_thanh_toan_du');
C('Doanh thu ghi nhận', o.delivered_value, 1800000);
C('Giá vốn (100 × 10.000)', o.cogs, 1000000);
C('Còn phải trả', o.remaining_to_pay, 0);
C('Tồn ngói sau bán', (await prod(P1)).on_hand, 4900);

// ---------- 2. Bán còn nợ ----------
G('2. Bán còn nợ (CK dòng 5%, giảm giá đơn, phí vận chuyển)');
const s2 = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: A, order_date: D(15),
  lines: [{ product_id: P1, qty: 1000, discount_pct: 5 }], discount: 200000, shipping_fee: 300000, deliver_now: true });
o = await ord(s2.id);
C('Đơn giá tự lấy theo mức giá đại lý', (await lines(s2.id))[0].unit_price, 16000);
C('Tổng đơn = 1000×16.000×95% − 200.000 + 300.000', o.order_total, 15300000);
C('Doanh thu ghi nhận khi giao', o.delivered_value, 15300000);
C('Khách còn nợ đơn này', o.receivable, 15300000);
C('Trạng thái thanh toán', o.payment_status, 'chua_thanh_toan');
C('Quá hạn (giao 15 ngày trước, được nợ 5 ngày)', o.overdue_days, 10);
C('Tổng nợ khách = nợ đầu kỳ 20tr + 15,3tr', (await cust(A)).balance, 35300000);
const pay2 = await api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'thu_khach', date: D(5), fund_id: NH, party_id: A, amount: 25000000, auto_allocate: true });
C('Tự phân bổ: trả nợ đầu kỳ trước rồi đến đơn', pay2.allocated, 25000000);
o = await ord(s2.id);
C('Đơn đã thu 5tr', o.paid_net, 5000000);
C('Đơn còn nợ', o.receivable, 10300000);
C('Trạng thái thanh toán', o.payment_status, 'thanh_toan_mot_phan');
C('Nợ đầu kỳ còn lại', (await api.q('opening_debts', TH, [['party_id', 'eq', A]]))[0].remaining, 0);
C('Tổng nợ khách', (await cust(A)).balance, 10300000);

// ---------- 3. Khách đặt cọc – đơn đặt riêng – đặt xưởng ----------
G('3. Khách đặt cọc (đơn đặt riêng + đặt xưởng)');
const s3 = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: B, kind: 'dat_hang', order_date: D(14), due_date: D(-10), status: 'xac_nhan',
  lines: [{ product_id: P4, qty: 300 }], deposit: { amount: 10000000, fund_id: NH } });
o = await ord(s3.id);
C('Giá công trình tự điền', (await lines(s3.id))[0].unit_price, 110000);
C('Tổng đơn', o.order_total, 33000000);
C('Trạng thái thanh toán', o.payment_status, 'da_dat_coc');
C('Tiền cọc KHÔNG phải doanh thu', o.delivered_value, 0);
C('Khách đã trả trước', (await cust(B)).prepaid, 10000000);
const sol3 = (await lines(s3.id))[0].id;
const po3 = await api.call('save_purchase_order', { book_id: TH, request_id: rid(), kind: 'dat_sx', supplier_id: Y, order_date: D(14), expected_date: D(4),
  sales_order_id: s3.id, status: 'xac_nhan', lines: [{ product_id: P4, qty: 300, unit_cost: 70000, sales_order_line_id: sol3 }] });
let po = await api.one('purchase_orders', TH, [['id', 'eq', po3.id]]);
C('Trạng thái sản xuất mặc định', po.prod_step, 'Chờ sản xuất');
C('Tiến độ đơn bán', (await ord(s3.id)).progress, 'Đang sản xuất / chờ hàng về');
await api.call('set_prod_step', { id: po3.id, step: 'Đang trong lò' });
C('Cập nhật bước "Đang trong lò"', (await api.one('purchase_orders', TH, [['id', 'eq', po3.id]])).progress, 'Đang trong lò');
await E('Bước sản xuất không có trong danh sách bị chặn', () => api.call('set_prod_step', { id: po3.id, step: 'Abc' }), 'không có trong danh sách');
C('Đơn đặt xưởng chưa nhận KHÔNG tăng tồn', (await prod(P4)).on_hand, 0);
C('Đơn đặt xưởng trễ hẹn được cảnh báo', (await api.one('purchase_orders', TH, [['id', 'eq', po3.id]])).is_late, true);

// ---------- 4. Nhận hàng từng phần ----------
G('4. Nhận hàng từng phần');
const lpo3 = (await api.q('purchase_order_lines', TH, [['po_id', 'eq', po3.id]]))[0].id;
await api.call('receive', { po_id: po3.id, request_id: rid(), date: D(10), lines: [{ po_line_id: lpo3, qty: 150 }] });
let p4 = await prod(P4);
C('Tồn sau khi nhận 150', p4.on_hand, 150);
C('Giá vốn bình quân', p4.avg_cost, 70000);
C('Hàng về được giữ cho đơn đặt riêng', p4.reserved, 150);
C('Số lượng còn có thể bán', p4.available, 0);
po = await api.one('purchase_orders', TH, [['id', 'eq', po3.id]]);
C('Trạng thái nhận', po.receive_status, 'nhan_mot_phan');
C('Nợ xưởng theo hàng đã nhận', po.payable, 10500000);
const nOrders = (await api.q('sales_orders', TH)).length;
await E('Bán lẻ hàng đang giữ cho đơn khác bị chặn', () => api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: KL, order_date: D(10),
  lines: [{ product_id: P4, qty: 10 }], deliver_now: true }), 'Không đủ hàng');
C('Lỗi không để lại đơn dở dang', (await api.q('sales_orders', TH)).length, nOrders);

// ---------- 5. Giao từng phần ----------
G('5. Giao hàng từng phần + thanh toán nhiều lần');
await api.call('deliver', { order_id: s3.id, request_id: rid(), date: D(9), lines: [{ order_line_id: sol3, qty: 150 }] });
o = await ord(s3.id);
C('Doanh thu đợt 1 (150 × 110.000)', o.delivered_value, 16500000);
C('Giá vốn đợt 1', o.cogs, 10500000);
C('Khách còn nợ = đã giao − đã trả', o.receivable, 6500000);
C('Trạng thái giao', o.delivery_status, 'giao_mot_phan');
C('Trạng thái thanh toán', o.payment_status, 'thanh_toan_mot_phan');
C('Tiến độ', o.progress, 'Giao một phần');
await api.call('receive', { po_id: po3.id, request_id: rid(), date: D(8), lines: [{ po_line_id: lpo3, qty: 150, unit_cost: 72000 }] });
p4 = await prod(P4);
C('Nhận đợt 2 giá mới 72.000 → giá vốn bình quân', p4.avg_cost, 72000);
C('Đơn đặt xưởng đã nhận đủ', (await api.one('purchase_orders', TH, [['id', 'eq', po3.id]])).progress, 'Đã nhận đủ');
await api.call('deliver', { order_id: s3.id, request_id: rid(), date: D(7), lines: [{ order_line_id: sol3, qty: 150 }] });
o = await ord(s3.id);
C('Doanh thu cả đơn', o.delivered_value, 33000000);
C('Giá vốn cả đơn (10,5tr + 10,8tr)', o.cogs, 21300000);
C('Tiến độ', o.progress, 'Đã giao đủ – chờ thu tiền');
await api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'thu_khach', date: D(6), fund_id: NH, party_id: B, amount: 23000000, auto_allocate: true });
o = await ord(s3.id);
C('Thu lần 3 → hoàn tất', [o.progress, o.payment_status], ['Hoàn tất', 'da_thanh_toan_du']);
C('Nợ xưởng Y = 10,5tr + 10,8tr', (await api.one('suppliers', TH, [['id', 'eq', Y]])).payable, 21300000);

// ---------- 6. Nhập cùng SKU với giá vốn mới ----------
G('6. Nhập cùng SKU giá mới – bình quân gia quyền');
const po6 = await api.call('save_purchase_order', { book_id: TH, request_id: rid(), supplier_id: X, order_date: D(6), receive_now: true,
  lines: [{ product_id: P1, qty: 2000, unit_cost: 12000 }] });
let p1 = await prod(P1);
C('Tồn ngói sau nhập', p1.on_hand, 5900);
C('Giá trị tồn = 39tr + 24tr', p1.stock_value, 63000000);
C('Giá vốn bình quân mới', p1.avg_cost, 63000000 / 5900, 0.01);
const s6 = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: KL, order_date: D(5), lines: [{ product_id: P1, qty: 590 }],
  deliver_now: true, deposit: { amount: 590 * 19000, fund_id: TM } });
C('Giá vốn đơn mới theo giá bình quân mới', (await ord(s6.id)).cogs, 6300000);
C('Giá vốn đơn cũ giữ nguyên (lưu tại thời điểm giao)', (await ord(s1.id)).cogs, 1000000);

// ---------- 7. Trả hàng ----------
G('7. Trả hàng (nhập lại kho) + hoàn tiền');
const dl2 = (await api.q('delivery_lines', TH, [['order_id', 'eq', s2.id]]))[0];
C('Giá bán thực sau CK & giảm giá đơn', dl2.unit_price_net, 15000);
const r7 = await api.call('sales_return', { order_id: s2.id, request_id: rid(), date: D(4), reason: 'Khách đổi ý', lines: [{ delivery_line_id: dl2.id, qty: 50 }] });
C('Doanh thu bị giảm', r7.revenue, 750000);
o = await ord(s2.id);
C('Giá vốn được hoàn theo giá lúc giao (10.000)', o.cogs, 10000000 - 500000);
C('Nợ đơn giảm tương ứng', o.receivable, 9550000);
p1 = await prod(P1);
C('Tồn ngói nhập lại', p1.on_hand, 5360);
C('Giá trị tồn ngói', p1.stock_value, 57200000);
const dl1 = (await api.q('delivery_lines', TH, [['order_id', 'eq', s1.id]]))[0];
const r7b = await api.call('sales_return', { order_id: s1.id, request_id: rid(), date: D(4), reason: 'Vỡ khi vận chuyển', lines: [{ delivery_line_id: dl1.id, qty: 10 }],
  refund: { amount: 180000, fund_id: TM } });
C('Có phiếu hoàn tiền', !!r7b.refund_code, true);
o = await ord(s1.id);
C('Đơn bán lẻ sau trả & hoàn tiền: đã thanh toán đủ', o.payment_status, 'da_thanh_toan_du');
C('Khách lẻ không còn nợ', (await cust(KL)).balance, 0);
await E('Trả vượt số đã giao bị chặn', () => api.call('sales_return', { order_id: s1.id, request_id: rid(), date: D(4), lines: [{ delivery_line_id: dl1.id, qty: 91 }] }), 'vượt');

// ---------- 8. Hủy đơn ----------
G('8. Hủy đơn / hủy phần chưa giao');
const s8a = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: KL, order_date: D(3), lines: [{ product_id: P3, qty: 1 }] });
C('Đơn nháp không giữ hàng', (await prod(P3)).reserved, 0);
await api.call('cancel_sales_order', { id: s8a.id, reason: 'Khách không mua nữa' });
C('Hủy đơn nháp', (await ord(s8a.id)).delivery_status, 'da_huy');
const s8b = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: A, order_date: D(3), status: 'xac_nhan', lines: [{ product_id: P3, qty: 1 }],
  deposit: { amount: 1000000, fund_id: TM } });
C('Đơn xác nhận giữ hàng', (await prod(P3)).reserved, 1);
await api.call('cancel_sales_order', { id: s8b.id, reason: 'Khách đổi mẫu' });
C('Hủy đơn nhả hàng giữ', (await prod(P3)).reserved, 0);
C('Tiền cọc của đơn hủy thành tiền cần hoàn', (await ord(s8b.id)).payment_status, 'thua_tien');
await E('Hoàn quá số đã cọc bị chặn', () => api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'hoan_khach', date: D(3), fund_id: TM, party_id: A, amount: 1200000,
  allocations: [{ doc_type: 'don_ban', doc_id: s8b.id, amount: 1200000 }] }), 'vượt');
await api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'hoan_khach', date: D(3), fund_id: TM, party_id: A, amount: 1000000,
  allocations: [{ doc_type: 'don_ban', doc_id: s8b.id, amount: 1000000 }] });
C('Sau hoàn cọc, nợ khách A trở lại 9,55tr', (await cust(A)).balance, 9550000);
await E('Hủy đơn đã giao bị chặn (phải dùng trả hàng)', () => api.call('cancel_sales_order', { id: s2.id, reason: 'x' }), 'đã giao hàng');
const s8d = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: A, order_date: D(3), status: 'xac_nhan', lines: [{ product_id: P2, qty: 200 }] });
const l8d = (await lines(s8d.id))[0].id;
await api.call('deliver', { order_id: s8d.id, request_id: rid(), date: D(3), lines: [{ order_line_id: l8d, qty: 120 }] });
await api.call('cancel_remaining', { id: s8d.id, reason: 'Khách chỉ lấy 120' });
o = await ord(s8d.id);
C('Hủy phần chưa giao → đã giao đủ', o.delivery_status, 'da_giao_du');
C('Tổng đơn còn 120 × 40.000', o.order_total, 4800000);
C('Hàng giữ được nhả', (await prod(P2)).reserved, 0);

// ---------- 9. Hàng vỡ ----------
G('9. Hàng vỡ / hàng trả lỗi không nhập lại');
await api.call('adjust_stock', { book_id: TH, request_id: rid(), date: D(2), reason: 'vo', note: 'Rơi vỡ khi dọn kho', lines: [{ product_id: P3, qty_delta: -1 }] });
C('Tồn nghê sau vỡ', (await prod(P3)).on_hand, 3);
await E('Phiếu vỡ ghi tăng bị chặn', () => api.call('adjust_stock', { book_id: TH, date: D(2), reason: 'vo', lines: [{ product_id: P3, qty_delta: 1 }] }), 'chỉ được ghi giảm');
await E('Giảm quá tồn bị chặn', () => api.call('adjust_stock', { book_id: TH, date: D(2), reason: 'that_thoat', note: 'x', lines: [{ product_id: P3, qty_delta: -9 }] }), 'tồn hiện tại');
const s9 = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: KL, order_date: D(2), lines: [{ product_id: P3, qty: 1 }], deliver_now: true,
  deposit: { amount: 3500000, fund_id: TM } });
const dl9 = (await api.q('delivery_lines', TH, [['order_id', 'eq', s9.id]]))[0];
const r9 = await api.call('sales_return', { order_id: s9.id, request_id: rid(), date: D(2), reason: 'Men lỗi', lines: [{ delivery_line_id: dl9.id, qty: 1, restock: false }],
  refund: { amount: 3500000, fund_id: TM } });
C('Hàng trả lỗi: tạo phiếu hao hụt', !!r9.loss_code, true);
C('Tồn nghê không tăng lại', (await prod(P3)).on_hand, 2);

// ---------- 10. Bán theo bộ ----------
G('10. Bán theo bộ – trừ đúng thành phần');
const before1 = await prod(P1), before2 = await prod(P2);
const kitp = await prod(KIT);
C('Số bộ có thể bán = min(ngói/10, gạch/2)', kitp.available, Math.min(Math.floor(before1.available / 10), Math.floor(before2.available / 2)));
const s10 = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: KL, order_date: D(1), lines: [{ product_id: KIT, qty: 2 }], deliver_now: true,
  deposit: { amount: 500000, fund_id: TM } });
C('Trừ ngói 20 viên', (await prod(P1)).on_hand, before1.on_hand - 20);
C('Trừ gạch 4 viên', (await prod(P2)).on_hand, before2.on_hand - 4);
C('Giá vốn bộ = tổng giá vốn thành phần', (await ord(s10.id)).cogs, Math.round(20 * before1.avg_cost) + Math.round(4 * before2.avg_cost));
C('Bộ không có tồn riêng', (await api.sql(`select count(*)::int n from app.stock_moves where product_id = $1`, [KIT]))[0].n, 0);

// ---------- 11. Chống ghi trùng ----------
G('11. Bấm nút nhiều lần không ghi trùng');
const R = rid();
const s11a = await api.call('save_sales_order', { book_id: TH, request_id: R, customer_id: A, order_date: D(1), status: 'xac_nhan', lines: [{ product_id: P2, qty: 10 }] });
const s11b = await api.call('save_sales_order', { book_id: TH, request_id: R, customer_id: A, order_date: D(1), status: 'xac_nhan', lines: [{ product_id: P2, qty: 10 }] });
C('Gửi lại cùng yêu cầu trả về cùng đơn', s11b.code, s11a.code);
C('Chỉ có 1 đơn được tạo', (await api.q('sales_orders', TH, [['customer_id', 'eq', A], ['order_date', 'eq', D(1)]])).length, 1);
const l11 = (await lines(s11a.id))[0].id; const R2 = rid();
await api.call('deliver', { order_id: s11a.id, request_id: R2, date: D(1), lines: [{ order_line_id: l11, qty: 5 }] });
const dup = await api.call('deliver', { order_id: s11a.id, request_id: R2, date: D(1), lines: [{ order_line_id: l11, qty: 5 }] });
C('Giao lần 2 cùng yêu cầu được nhận diện trùng', dup.duplicate, true);
C('Chỉ giao 5 (không phải 10)', (await ord(s11a.id)).delivered_qty, 5);

// ---------- 12. Phân quyền ----------
G('12. Phân quyền nhân viên');
api.as(staff);
const sp = await api.one('products', TH, [['id', 'eq', P1]]);
C('Nhân viên không thấy giá vốn', [sp.avg_cost, sp.stock_value], [null, null]);
C('Nhân viên vẫn thấy tồn và giá bán', sp.on_hand > 0 && sp.price1 === 19000, true);
await E('Nhân viên không xem được báo cáo lợi nhuận', () => api.call('rpt_overview', { book_id: TH, from: D(30), to: TODAY }), 'chưa được cấp quyền');
await E('Nhân viên không điều chỉnh kho', () => api.call('adjust_stock', { book_id: TH, reason: 'vo', lines: [{ product_id: P1, qty_delta: -1 }] }), 'chưa được cấp quyền');
await E('Nhân viên không hủy phiếu thu', () => api.call('void_payment', { id: pay2.id, reason: 'x' }), 'Chỉ chủ');
const stOrder = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: KL, order_date: TODAY, lines: [{ product_id: P2, qty: 1 }] });
C('Nhân viên tạo được đơn nháp', !!stOrder.code, true);
C('Nhân viên không thấy giá vốn trong đơn', (await ord(stOrder.id)).cogs, null);
await E('Nhân viên không vào được sổ Vũ Gia', () => api.q('products', VG), 'không có quyền');
api.as(outsider);
await E('Người ngoài không truy cập được', () => api.q('products', TH), 'không có quyền');
await E('Người ngoài không tự tạo sổ', () => api.call('bootstrap'), 'chưa được cấp quyền');
api.as(owner);
await api.call('cancel_sales_order', { id: stOrder.id, reason: 'Đơn thử' });

// ---------- Chi phí ----------
G('Chi phí vận hành');
const e1 = await api.call('save_expense', { book_id: TH, request_id: rid(), date: D(3), category: 'Thuê mặt bằng', description: 'Thuê showroom', amount: 5000000, pay_now: { fund_id: TM } });
C('Chi phí trả ngay có phiếu chi', !!e1.payment_code, true);
const e2 = await api.call('save_expense', { book_id: TH, request_id: rid(), date: D(3), category: 'Vận chuyển', description: 'Xe chở hàng', amount: 400000, supplier_id: X });
C('Chi phí ghi nợ NCC làm tăng nợ phải trả', (await api.one('suppliers', TH, [['id', 'eq', X]])).payable, 30000000 + 24000000 + 400000);
await E('Phiếu chi phí không gắn chứng từ bị chặn', () => api.call('create_payment', { book_id: TH, kind: 'chi_phi', fund_id: TM, amount: 100000 }), 'gắn đủ');

// ---------- 13. Sổ Vũ Gia: 1 phiếu thu cho nhiều đơn + phí sàn TikTok ----------
G('13. Sổ riêng Vũ Gia: TikTok, 1 phiếu thu nhiều đơn, phí sàn');
const vgF = await api.q('funds', VG); const VNH = vgF.find(f => f.name.includes('ngân hàng')).id;
await api.call('import_products', { book_id: VG, request_id: rid(), opening_date: D(5), rows: [{ sku: 'BHL-01', name: 'Bình hút lộc men lam', category: 'Bình hút lộc', unit: 'Cái', cost: 300000, price1: 650000, price2: 600000, price3: 550000, qty: 20 }] });
C('Sổ Vũ Gia chỉ thấy hàng của Vũ Gia', (await api.q('products', VG)).length, 1);
const BHL = (await api.q('products', VG))[0].id;
const C1 = (await api.call('save_party', { book_id: VG, type: 'kh', name: 'Khách TikTok – chị Hoa' })).id;
const v1 = await api.call('save_sales_order', { book_id: VG, request_id: rid(), customer_id: C1, channel: 'TikTok', order_date: D(2), lines: [{ product_id: BHL, qty: 1 }], deliver_now: true });
const v2 = await api.call('save_sales_order', { book_id: VG, request_id: rid(), customer_id: C1, channel: 'TikTok', order_date: D(2), lines: [{ product_id: BHL, qty: 1 }], deliver_now: true });
await E('Phân bổ vượt số tiền phiếu bị chặn', () => api.call('create_payment', { book_id: VG, kind: 'thu_khach', fund_id: VNH, party_id: C1, amount: 1000000,
  allocations: [{ doc_type: 'don_ban', doc_id: v1.id, amount: 650000 }, { doc_type: 'don_ban', doc_id: v2.id, amount: 650000 }] }), 'vượt');
await api.call('create_payment', { book_id: VG, request_id: rid(), kind: 'thu_khach', date: D(1), fund_id: VNH, party_id: C1, amount: 1300000, fee: 130000,
  note: 'TikTok thanh toán', allocations: [{ doc_type: 'don_ban', doc_id: v1.id, amount: 650000 }, { doc_type: 'don_ban', doc_id: v2.id, amount: 650000 }] });
const vo1 = await api.one('sales_orders', VG, [['id', 'eq', v1.id]]), vo2 = await api.one('sales_orders', VG, [['id', 'eq', v2.id]]);
C('Cả 2 đơn đã thu đủ', [vo1.payment_status, vo2.payment_status], ['da_thanh_toan_du', 'da_thanh_toan_du']);
C('Tiền về tài khoản = 1,3tr − phí 130k', (await api.one('funds', VG, [['id', 'eq', VNH]])).balance, 1170000);
const vgO = await api.call('rpt_overview', { book_id: VG, from: D(30), to: TODAY });
C('Phí sàn ghi vào chi phí vận hành', vgO.expenses, 130000);
C('Tiền thực thu = số tiền thực về', vgO.cash_in, 1170000);
C('Doanh thu Vũ Gia', vgO.revenue, 1300000);
C('Báo cáo theo kênh', (await api.call('rpt_groups', { book_id: VG, from: D(30), to: TODAY, by: 'channel' }))[0].name, 'TikTok');

// ---------- 14. Đối chiếu tổng ----------
G('14. Đối chiếu tổng (Thanh Hải)');
const ov = await api.call('rpt_overview', { book_id: TH, from: D(20), to: TODAY });
C('Doanh thu kỳ', ov.revenue, 70010000 + 300000 - 4430000);
const kitCogs = (await ord(s10.id)).cogs;
const expCogs = 1000000 + 10000000 + 21300000 + 6300000 + 3360000 + 2000000 + kitCogs + 140000 - 2600000;
C('Giá vốn kỳ', ov.cogs, expCogs);
C('Thuế GTGT ước tính 1%', ov.vat, Math.round(65880000 * 0.01));
C('Lợi nhuận gộp = DT thuần − giá vốn', ov.gross_profit, 65880000 - Math.round(65880000 * 0.01) - expCogs);
C('Hao hụt kho (vỡ + hàng trả lỗi)', ov.stock_loss, 4000000);
C('Chi phí vận hành = chi phí + hao hụt', ov.opex, 5400000 + 4000000);
C('Lợi nhuận sau chi phí', ov.profit, ov.gross_profit - 9400000);
const inv = await api.sql(`select sum(stock_value)::float8 v from app.products where book_id = $1`, [TH]);
C('Giá trị tồn kho = tổng sổ kho', ov.inventory_value, inv[0].v);
const invIdentity = await api.sql(`select
   (select coalesce(sum(value),0) from app.stock_moves where book_id=$1 and doc_type in ('dau_ky'))::float8 open_v,
   (select coalesce(sum(value),0) from app.stock_moves where book_id=$1 and doc_type in ('nhap','tra_ncc'))::float8 in_v`, [TH]);
C('Tồn cuối = Tồn đầu + Nhập − Giá vốn − Hao hụt', ov.inventory_value, invIdentity[0].open_v + invIdentity[0].in_v - ov.cogs - ov.stock_loss);
const custSum = (await api.q('customers', TH)).reduce((s, c) => s + c.receivable, 0);
C('Phải thu Tổng quan = tổng sổ khách hàng', ov.receivable, custSum);
const supSum = (await api.q('suppliers', TH)).reduce((s, c) => s + c.payable, 0);
C('Phải trả Tổng quan = tổng sổ NCC', ov.payable, supSum);
const fundSum = (await api.q('funds', TH)).reduce((s, f) => s + f.balance, 0);
C('Tồn quỹ Tổng quan = tổng các quỹ', ov.fund_balance, fundSum);
C('Tồn quỹ = quỹ đầu + thu − chi', fundSum, 120000000 + ov.cash_in - ov.cash_out);
const bad = await api.sql(`select p.sku from app.products p left join (select product_id, sum(qty) q, sum(value) v from app.stock_moves group by 1) m on m.product_id = p.id
  where not p.is_kit and (coalesce(m.q,0) <> p.on_hand or coalesce(m.v,0) <> p.stock_value)`);
C('Sổ kho khớp tồn từng SKU', bad.length, 0);
const badL = await api.sql(`select l.id from app.sales_order_lines l left join (select order_line_id, sum(qty) q from app.delivery_lines group by 1) d on d.order_line_id = l.id
  where coalesce(d.q,0) <> l.delivered_qty`);
C('Số đã giao trên đơn khớp phiếu giao', badL.length, 0);
const drill = await api.call('rpt_drill', { book_id: TH, metric: 'revenue', from: D(20), to: TODAY });
C('Bấm vào Doanh thu xem được từng giao dịch, tổng khớp', drill.reduce((s, r) => s + r.amount, 0), ov.revenue);
const drillC = await api.call('rpt_drill', { book_id: TH, metric: 'cogs', from: D(20), to: TODAY });
C('Chi tiết Giá vốn khớp tổng', drillC.reduce((s, r) => s + r.amount, 0), ov.cogs);
const drillO = await api.call('rpt_drill', { book_id: TH, metric: 'opex', from: D(20), to: TODAY });
C('Chi tiết Chi phí khớp tổng', drillO.reduce((s, r) => s + r.amount, 0), ov.opex);
const audit = await api.q('audit', TH, [['table_name', 'eq', 'sales_orders']]);
C('Nhật ký ghi lại thay đổi đơn hàng', audit.length > 5, true);
await api.call('void_payment', { id: pay2.id, reason: 'Nhập nhầm số tiền' });
C('Hủy phiếu thu: không xóa, công nợ tăng lại', (await cust(A)).balance, 9550000 + 25000000 + 120 * 40000 + 5 * 40000);
C('Phiếu hủy vẫn còn trong lịch sử', (await api.q('payments', TH, [['id', 'eq', pay2.id]]))[0].voided, true);
await api.call('update_book_settings', { book_id: TH, settings: { lock_date: D(10) } });
await E('Khóa sổ: không ghi chứng từ vào kỳ đã khóa', () => api.call('create_payment', { book_id: TH, kind: 'thu_khac', date: D(12), fund_id: TM, amount: 1000 }), 'khóa');
await E('Không ghi chứng từ ngày tương lai', () => api.call('create_payment', { book_id: TH, kind: 'thu_khac', date: D(-3), fund_id: TM, amount: 1000 }), 'tương lai');
const exp = await api.call('export_book', { book_id: TH });
C('Xuất toàn bộ dữ liệu sao lưu', exp.sales_orders.length === (await api.q('sales_orders', TH)).length && exp.stock_moves.length > 0, true);

// ---------- Kết quả ----------
const s = summary();
import fs from 'fs';
fs.writeFileSync(new URL('./last-results.json', import.meta.url), JSON.stringify({ today: TODAY, ...s, log }, null, 2));
console.log(`\nĐẠT: ${s.passed}   LỖI: ${s.failed}`);
for (const f of s.failures) console.log('  ✗ ' + f);
process.exit(s.failed ? 1 : 0);
