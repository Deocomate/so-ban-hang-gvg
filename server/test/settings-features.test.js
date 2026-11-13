// Các thiết lập kiểu KiotViet: mã vạch, bảo hành, phân quyền theo nhóm hàng, chi phí nhập hàng, quy tắc đơn hàng, kết ca,
// người phụ trách, khách kiêm NCC, thông tin bắt buộc, tích điểm, khuyến mại, voucher, coupon, ngoại tệ, xác thực 2 lớp, xóa dữ liệu cũ
// — chạy: node test/settings-features.test.js
import { freshDb, makeApi, suite, finish, TODAY, rid } from './harness.js';
import { seedSample } from '../scripts/sample-seed-data.js';
import { addDays } from '../src/lib/context.js';
import { secondFactor } from '../src/lib/auth.js';
import { totp } from '../src/lib/totp.js';
import { ctx } from '../src/lib/context.js';
import { custBalances, suppBalances } from '../src/domain/reports.js';
import { setUser } from '../src/domain/access.js';

freshDb();
const api = makeApi();
const { G, C, E } = suite();
const owner = await api.user('chu@gomsu.vn');
const r = await seedSample({ call: (fn, p) => api.call(fn, p), svc: (fn, p) => api.svc(fn, p), ensureUser: (e) => api.user(e), setUser: (u) => api.as(u), owner, today: TODAY() });
api.as(owner);
const { TH } = r;
const T = TODAY(); const D = (n) => addDays(T, -n);
const set = (settings) => api.call('update_book_settings', { book_id: TH, settings });
const prods = await api.sql(`select * from products where book_id = ? and is_kit = 0 and product_type = 'hang' and on_hand > 50 order by sku`, [TH]);
const P = prods[0]; const P2 = prods[1];
const KL = (await api.one('customers', TH, [['code', 'eq', 'KL']])).id;
const A = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'Đại lý Thử Nghiệm', phone: '0900000001' })).id;
const funds = await api.q('funds', TH); const TM = funds.find((f) => f.name === 'Tiền mặt').id;
const sell = async (cust, lines, extra = {}) => api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: cust, order_date: T, deliver_now: true, lines, ...extra });
const order = (id) => api.one('sales_orders', TH, [['id', 'eq', id]]);

G('Mã vạch');
await api.call('save_product', { book_id: TH, id: P.id, sku: P.sku, name: P.name, unit: P.unit, product_type: 'hang', barcode: '8935001234567' });
C('Lưu mã vạch', (await api.one('products', TH, [['id', 'eq', P.id]])).barcode, '8935001234567');
await E('Mã vạch trùng bị chặn', () => api.call('save_product', { book_id: TH, id: P2.id, sku: P2.sku, name: P2.name, unit: P2.unit, product_type: 'hang', barcode: '8935001234567' }), 'đã dùng');
await api.call('save_product', { book_id: TH, id: P.id, sku: P.sku, name: P.name, unit: P.unit, product_type: 'hang' });
C('Sửa hàng không gửi mã vạch thì giữ mã vạch', (await api.one('products', TH, [['id', 'eq', P.id]])).barcode, '8935001234567');

G('Bảo hành, sửa chữa');
await E('Chưa bật bảo hành thì không lập phiếu', () => api.call('save_warranty_claim', { book_id: TH, customer_id: A, issue: 'x' }), 'chưa bật');
await set({ warranty: true });
await api.call('save_product', { book_id: TH, id: P.id, sku: P.sku, name: P.name, unit: P.unit, product_type: 'hang', warranty_months: 12, maintenance_months: 6 });
const so1 = await sell(A, [{ product_id: P.id, qty: 2, unit_price: 100000 }]);
const look = await api.call('warranty_lookup', { book_id: TH, customer_id: A });
C('Tra cứu bảo hành theo khách', [look.length, look[0].in_warranty, look[0].warranty_end], [1, true, addDays(addDays(T, 0), 0).replace(/^(\d{4})/, (y) => String(Number(y) + 1))]);
const cl = await api.call('save_warranty_claim', { book_id: TH, request_id: rid(), customer_id: A, delivery_line_id: look[0].delivery_line_id, issue: 'Nứt men', promise_date: addDays(T, 3), fee: 50000 });
C('Phiếu còn bảo hành: miễn phí', (await api.call('warranty_claims', { book_id: TH }))[0].fee, 0);
C('Còn trong hạn bảo hành', cl.in_warranty, true);
await E('Không nhảy thẳng sang Đã trả khách', () => api.call('set_warranty_status', { id: cl.id, status: 'da_tra' }), 'Không chuyển');
await api.call('set_warranty_status', { id: cl.id, status: 'dang_sua' });
await api.call('set_warranty_status', { id: cl.id, status: 'da_sua' });
await api.call('set_warranty_status', { id: cl.id, status: 'da_tra' });
C('Trả khách xong', (await api.call('warranty_claims', { book_id: TH }))[0].status, 'da_tra');

G('Phân quyền theo nhóm hàng, khách theo người phụ trách');
const lan = await api.user('lan.phan.quyen@gomsu.vn');
await api.call('upsert_member', { book_id: TH, email: 'lan.phan.quyen@gomsu.vn', role: 'staff', perms: { ban_hang: true } });
await api.sql(`update book_members set categories = ? where book_id = ? and user_id = ?`, [JSON.stringify([P.category]), TH, lan]);
await set({ category_perm: true, customer_owner: true, customer_owner_only: true });
await api.call('save_party', { book_id: TH, type: 'kh', id: A, name: 'Đại lý Thử Nghiệm', phone: '0900000001', owner_ids: [lan] });
api.as(lan);
const seen = await api.q('products', TH);
C('Nhân viên chỉ thấy hàng thuộc nhóm được giao', seen.length > 0 && seen.every((x) => x.category === P.category), true);
const custs = await api.q('customers', TH);
C('Nhân viên chỉ thấy khách mình phụ trách', custs.map((c) => c.id), [A]);
api.as(owner);
C('Quản lý sổ vẫn thấy mọi hàng hóa', (await api.q('products', TH)).length > seen.length, true);
await set({ category_perm: false, customer_owner_only: false });
await E('Người phụ trách phải là người dùng của sổ', () => api.call('save_party', { book_id: TH, type: 'kh', id: A, name: 'Đại lý Thử Nghiệm', owner_ids: ['khong-co'] }), 'người dùng của sổ');

G('Thông tin bắt buộc, khách kiêm nhà cung cấp');
await set({ customer_required_on: true, customer_required: ['phone', 'email'] });
await E('Thiếu thông tin bắt buộc bị chặn', () => api.call('save_party', { book_id: TH, type: 'kh', name: 'Khách thiếu', phone: '09' }), 'Email');
await api.call('save_party', { book_id: TH, type: 'kh', name: 'Khách đủ', phone: '09', extra: { email: 'a@b.vn' } });
await set({ customer_required_on: false });
const sup = (await api.sql(`select id from suppliers where book_id = ? limit 1`, [TH]))[0].id;
await api.call('save_party', { book_id: TH, type: 'kh', id: A, name: 'Đại lý Thử Nghiệm', supplier_id: sup });
C('Gắn khách với nhà cung cấp', (await api.one('customers', TH, [['id', 'eq', A]])).supplier_id, sup);
await E('Một NCC chỉ gắn một khách', () => api.call('save_party', { book_id: TH, type: 'kh', name: 'Khách khác', supplier_id: sup }), 'đã gắn');

G('Chi phí nhập hàng');
const supId = sup;
const v0 = (await api.sql(`select stock_value from products where id = ?`, [P.id]))[0].stock_value;
const pay0 = (await api.one('suppliers', TH, [['id', 'eq', supId]])).payable;
await E('Chưa bật thì không ghi chi phí nhập', () => api.call('save_purchase_order', { book_id: TH, request_id: rid(), supplier_id: supId, order_date: T, receive_now: true,
  lines: [{ product_id: P.id, qty: 10, unit_cost: 10000 }], extra_costs: [{ name: 'Vận chuyển', amount: 20000, payer: 'ncc' }] }), 'chưa bật');
await set({ po_costs: true });
await api.call('save_purchase_order', { book_id: TH, request_id: rid(), supplier_id: supId, order_date: T, receive_now: true,
  lines: [{ product_id: P.id, qty: 10, unit_cost: 10000 }], extra_costs: [{ name: 'Vận chuyển', amount: 20000, payer: 'ncc' }, { name: 'Bốc xếp', amount: 5000, payer: 'khac' }] });
C('Giá trị tồn tăng = tiền hàng + mọi chi phí', (await api.sql(`select stock_value from products where id = ?`, [P.id]))[0].stock_value - v0, 125000);
C('Nợ NCC tăng = tiền hàng + phần NCC thu hộ', (await api.one('suppliers', TH, [['id', 'eq', supId]])).payable - pay0, 120000);

G('Quy tắc đơn hàng');
await set({ lock_txn_time: true, lock_txn_kinds: ['ban_hang', 'thu_chi'] });
await E('Không ghi đơn bán khác ngày hôm nay', () => api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: KL, order_date: D(1), lines: [{ product_id: P.id, qty: 1 }] }), 'khác ngày');
await E('Không đổi ngày đơn đã có', async () => { const o = await order(so1.id); const ls = await api.q('sales_order_lines', TH, [['order_id', 'eq', so1.id]]);
  return api.call('save_sales_order', { book_id: TH, request_id: rid(), id: so1.id, customer_id: A, order_date: D(1), lines: ls.map((l) => ({ id: l.id, product_id: l.product_id, qty: l.qty, unit_price: l.unit_price })) }); }, 'đổi thời gian');
await set({ lock_txn_time: false });
await set({ return_limit: true, return_limit_days: 7 });
const old = (await api.sql(`select x.id from delivery_lines x join deliveries d on d.id = x.delivery_id where d.book_id = ? and d.delivery_date < ? and x.qty > x.returned_qty limit 1`, [TH, D(10)]))[0];
const oldOrder = (await api.sql(`select d.order_id from delivery_lines x join deliveries d on d.id = x.delivery_id where x.id = ?`, [old.id]))[0].order_id;
await E('Quá hạn trả hàng bị chặn', () => api.call('sales_return', { order_id: oldOrder, request_id: rid(), date: T, lines: [{ delivery_line_id: old.id, qty: 1 }] }), 'quá 7 ngày');
await set({ return_limit: false, einvoice_lock: true });
await api.call('save_tax_invoice', { book_id: TH, direction: 'ra', inv_no: '0000123', inv_date: T, amount: 200000, vat_rate: 8, order_id: so1.id, party_name: 'Đại lý Thử Nghiệm' });
await E('Đơn đã phát hành HĐĐT không hủy được', () => api.call('cancel_sales_order', { id: so1.id, reason: 'thử' }), 'hóa đơn điện tử');
await set({ einvoice_lock: false });

G('Kết ca');
await set({ shift_on: true });
const sh = await api.call('open_shift', { book_id: TH, fund_id: TM, opening_cash: 1000000 });
await E('Không mở 2 ca cùng lúc', () => api.call('open_shift', { book_id: TH, fund_id: TM, opening_cash: 0 }), 'chưa kết');
await api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'thu_khac', date: T, fund_id: TM, amount: 300000, note: 'thu trong ca' });
await api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'chi_khac', date: T, fund_id: TM, amount: 50000, note: 'chi trong ca' });
C('Tiền mặt dự kiến trong ca', (await api.call('current_shift', { book_id: TH })).expected_cash, 1250000);
const cs = await api.call('close_shift', { book_id: TH, id: sh.id, counted_cash: 1240000 });
C('Kết ca: lệch tiền', [cs.expected_cash, cs.diff], [1250000, -10000]);

G('Ngoại tệ');
await api.call('save_currency_rates', { book_id: TH, currencies: [{ code: 'USD', name: 'Đô la Mỹ', rate: 25000 }], price_decimals: 0 });
const fx = await api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'thu_khac', date: T, fund_id: TM, fx: { code: 'USD', amount: 100 }, note: 'khách trả USD' });
C('Thu ngoại tệ quy đổi theo tỷ giá', (await api.one('payments', TH, [['id', 'eq', fx.id]])).amount, 2500000);
await api.call('save_currency_rates', { book_id: TH, currencies: [{ code: 'USD', name: 'Đô la Mỹ', rate: 25500 }] });
C('Lịch sử đổi tỷ giá', (await api.sql(`select json_array_length(json_extract(settings, '$.fx_history')) as n from books where id = ?`, [TH]))[0].n, 2);

G('Tích điểm và đổi điểm');
await set({ points_on: true, points: { earn_amount: 10000, redeem_value: 1000, min_redeem: 10 } });
const so2 = await sell(A, [{ product_id: P.id, qty: 5, unit_price: 100000 }]);
const pts = async () => (await api.one('customers', TH, [['id', 'eq', A]])).points;
C('Giao 500.000 đ được 50 điểm', await pts(), 50);
await E('Đổi ít hơn mức tối thiểu', () => sell(A, [{ product_id: P.id, qty: 1, unit_price: 100000 }], { promos: [{ kind: 'points', points: 5 }] }), 'tối thiểu');
const so3 = await sell(A, [{ product_id: P.id, qty: 1, unit_price: 100000 }], { promos: [{ kind: 'points', points: 20 }] });
C('Đổi 20 điểm giảm 20.000 đ', (await order(so3.id)).discount, 20000);
C('Điểm còn lại: 50 − 20 + tích đơn mới', await pts(), 50 - 20 + 8);
await E('Khách lẻ không tích điểm (không đổi được)', () => sell(KL, [{ product_id: P.id, qty: 1, unit_price: 100000 }], { promos: [{ kind: 'points', points: 10 }] }), 'chỉ có');

G('Khuyến mại, coupon, voucher');
await E('Chưa bật khuyến mại', () => api.call('preview_promos', { book_id: TH, customer_id: A, lines: [{ product_id: P.id, qty: 1, unit_price: 1000 }], promos: [{ kind: 'coupon', code: 'X' }] }), 'chưa bật');
await set({ promo_on: true, voucher_on: true, coupon_on: true });
const km = await api.call('save_promotion', { book_id: TH, name: 'Giảm 10% đơn từ 1 triệu', kind: 'order', min_amount: 1000000, discount_pct: 10, max_discount: 150000, start_date: D(1), end_date: addDays(T, 10) });
await E('Đơn chưa đủ mức tối thiểu', () => sell(A, [{ product_id: P.id, qty: 1, unit_price: 100000 }], { promos: [{ kind: 'promo', id: km.id }] }), 'áp dụng cho đơn từ');
const so4 = await sell(A, [{ product_id: P.id, qty: 20, unit_price: 100000 }], { discount: 5000, promos: [{ kind: 'promo', id: km.id }] });
C('Khuyến mại 10% có giảm tối đa + giảm tay', (await order(so4.id)).discount, 155000);
await api.call('save_coupon', { book_id: TH, code: 'TET2027', discount_amount: 30000, min_amount: 0, usage_limit: 1, start_date: D(1), end_date: addDays(T, 10) });
const so5 = await sell(A, [{ product_id: P.id, qty: 1, unit_price: 100000 }], { promos: [{ kind: 'coupon', code: 'tet2027' }] });
C('Coupon giảm 30.000 đ', (await order(so5.id)).discount, 30000);
await E('Coupon hết lượt', () => sell(A, [{ product_id: P.id, qty: 1, unit_price: 100000 }], { promos: [{ kind: 'coupon', code: 'TET2027' }] }), 'hết lượt');
const vc = await api.call('issue_vouchers', { book_id: TH, count: 2, value: 50000, prefix: 'GOM', expiry_date: addDays(T, 30) });
C('Phát hành 2 voucher', vc.codes.length, 2);
const draft = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: A, order_date: T, lines: [{ product_id: P.id, qty: 1, unit_price: 100000 }], promos: [{ kind: 'voucher', code: vc.codes[0] }] });
C('Voucher trừ 50.000 đ', (await order(draft.id)).discount, 50000);
await E('Voucher đã dùng không dùng lại', () => sell(A, [{ product_id: P.id, qty: 1, unit_price: 100000 }], { promos: [{ kind: 'voucher', code: vc.codes[0] }] }), 'đã dùng');
await api.call('cancel_sales_order', { id: draft.id, reason: 'thử hủy' });
C('Hủy đơn trả lại voucher', (await api.sql(`select status from vouchers where code = ?`, [vc.codes[0]]))[0].status, 'moi');
const pv = await api.call('preview_promos', { book_id: TH, customer_id: A, lines: [{ product_id: P.id, qty: 1, unit_price: 30000 }], promos: [{ kind: 'voucher', code: vc.codes[1] }] });
C('Giảm không vượt tiền hàng', pv.total, 30000);

G('Xác thực 2 lớp cho nhân viên');
const nv = await api.user('nv.hai.lop@gomsu.vn');
await api.call('upsert_member', { book_id: TH, email: 'nv.hai.lop@gomsu.vn', role: 'staff' });
const u = ctx.db.prepare('select * from users where id = ?').get(nv);
C('Chưa bật thì đăng nhập bình thường', secondFactor(u, {}), {});
await set({ staff_2fa: true });
const run2 = (b) => ctx.db.transaction(() => secondFactor(ctx.db.prepare('select * from users where id = ?').get(nv), b))();
const en = run2({});
C('Lần đầu: yêu cầu cài ứng dụng xác thực', en.pending.need, 'enroll');
let wrong = null; try { run2({ otp: '000000' }); } catch (e) { wrong = e.message; }
C('Sai mã bị từ chối', /không đúng/.test(wrong || ''), true);
const ok = run2({ otp: totp(en.pending.secret) });
C('Đúng mã: được vào và nhớ thiết bị', typeof ok.device_token, 'string');
C('Thiết bị đã nhớ không hỏi lại', run2({ device_token: ok.device_token }), {});
C('Thiết bị lạ: hỏi mã', run2({}).pending.need, 'otp');
await api.call('admin_reset_2fa', { user_id: nv });
C('Tổng quản trị đặt lại: cài lại từ đầu', run2({}).pending.need, 'enroll');

G('Xóa dữ liệu cũ giữ đúng số dư');
const cut = D(20);
await E('Phải khóa sổ trước', () => api.call('purge_preview', { book_id: TH, cutoff: cut }), 'khóa sổ');
await set({ lock_date: cut });
const pr = await api.call('purge_preview', { book_id: TH, cutoff: cut });
C('Có chứng từ sẽ xóa', pr.items.find((x) => x.key === 'orders').count > 0, true);
setUser(owner);
const snap = () => ({
  c: Object.fromEntries(custBalances(TH, T).map((x) => [x.party_id, Math.round(x.balance)]).filter(([, v]) => v)),
  s: Object.fromEntries(suppBalances(TH, T).map((x) => [x.party_id, Math.round(x.balance)]).filter(([, v]) => v)),
  f: Object.fromEntries(ctx.db.prepare('select id, balance from v_funds where book_id = ?').all(TH).map((x) => [x.id, Math.round(x.balance)])),
  k: Object.fromEntries(ctx.db.prepare('select product_id, sum(qty) q, round(sum(value)) v from stock_moves where book_id = ? group by product_id').all(TH).map((x) => [x.product_id, [x.q, x.v]])),
  p: Object.fromEntries(ctx.db.prepare('select customer_id, sum(points) p from point_moves where book_id = ? group by customer_id').all(TH).map((x) => [x.customer_id, x.p])),
});
const before = snap();
await E('Phải xác nhận', () => api.call('schedule_purge', { book_id: TH, cutoff: cut, when: 'now' }), 'xác nhận');
const res = await api.call('schedule_purge', { book_id: TH, cutoff: cut, when: 'now', confirm: true });
C('Đã xóa đơn bán cũ', res.result.orders > 0, true);
C('Không còn đơn bán đã khép lại trước ngày xóa', (await api.sql(`select count(*) n from sales_orders where book_id = ? and order_date <= ? and status = 'huy'`, [TH, cut]))[0].n, 0);
setUser(owner);
const after = snap();
C('Công nợ từng khách giữ nguyên', JSON.stringify(after.c), JSON.stringify(before.c));
C('Công nợ từng NCC giữ nguyên', JSON.stringify(after.s), JSON.stringify(before.s));
C('Số dư từng quỹ giữ nguyên', JSON.stringify(after.f), JSON.stringify(before.f));
C('Tồn kho số lượng và giá trị từng mã giữ nguyên', JSON.stringify(after.k), JSON.stringify(before.k));
C('Điểm từng khách giữ nguyên', JSON.stringify(after.p), JSON.stringify(before.p));
C('Lịch sử xóa', (await api.call('purge_jobs', { book_id: TH }))[0].status, 'xong');

finish('Thiết lập kiểu KiotViet');
