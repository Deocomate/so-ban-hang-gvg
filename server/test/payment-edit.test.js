// Kiểm thử sửa phiếu thu / chi (giữ mã phiếu, tính lại quỹ và công nợ như hủy rồi lập lại) — chạy: node test/payment-edit.test.js
import { freshDb, makeApi, suite, finish, rid, daysAgo as D } from './harness.js';

freshDb();
const api = makeApi();
const { G, C, E } = suite();
const ACCT = '1106738888';

const owner = await api.user('chu@gomsu.vn');
await api.user('kho@gomsu.vn');
await api.user('thungan@gomsu.vn');
api.as(owner);
const books = await api.call('bootstrap');
const TH = books.find((b) => b.short_name === 'TH').id;
await api.call('upsert_member', { book_id: TH, email: 'kho@gomsu.vn', role: 'staff', perms: { ban_hang: true, xem_ban_hang: true } });
await api.call('upsert_member', { book_id: TH, email: 'thungan@gomsu.vn', role: 'staff', perms: { thu_chi: true, xem_thu_chi: true } });
await api.call('update_book_settings', { book_id: TH, settings: { bank: { bin: '970436', bank_name: 'Vietcombank', account_no: ACCT, account_name: 'HKD GOM SU' } } });
const funds = await api.q('funds', TH);
const NH = funds.find((f) => f.name.includes('ngân hàng')).id;
const TM = funds.find((f) => f.id !== NH).id;
await api.call('import_products', { book_id: TH, request_id: rid(), opening_date: D(60), rows: [{ sku: 'BINH', name: 'Bình gốm', unit: 'Cái', cost: 500, price1: 1000, qty: 100000 }] });
const P = (await api.one('products', TH, [['sku', 'eq', 'BINH']])).id;
const cust = async (name) => (await api.call('save_party', { book_id: TH, type: 'kh', name, credit_days: 0 })).id;
const sell = async (c, days, goods) => (await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: c, order_date: D(days), deliver_now: true,
  lines: [{ product_id: P, qty: goods / 1000, unit_price: 1000 }] })).id;
const order = (id) => api.one('sales_orders', TH, [['id', 'eq', id]]);
const customer = (id) => api.one('customers', TH, [['id', 'eq', id]]);
const fund = async (id) => (await api.one('funds', TH, [['id', 'eq', id]])).balance;
const payment = (id) => api.one('payments', TH, [['id', 'eq', id]]);
const edit = (id, x) => api.call('update_payment', { book_id: TH, id, ...x });
const state = async (c, o1, o2) => {
  const k = await customer(c); const a = await order(o1); const b = await order(o2);
  return [k.receivable, k.prepaid, a.paid_net, a.receivable, b.paid_net, b.receivable];
};

// ---------- 1. Sửa số tiền, phần trả cho đơn: giống hệt hủy rồi lập phiếu mới ----------
G('1. Sửa số tiền và phần trả cho đơn');
const A = await cust('Khách A'); const a1 = await sell(A, 20, 1000000); const a2 = await sell(A, 19, 2000000);
const B = await cust('Khách B'); const b1 = await sell(B, 20, 1000000); const b2 = await sell(B, 19, 2000000);
const nh0 = await fund(NH); const tm0 = await fund(TM);
// Phiếu gốc ghi rõ phần trả cho từng đơn (phiếu thu ở trang khách không tự chia nữa)
const split = (c, o1, o2) => api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'thu_khach', party_id: c, date: D(2), fund_id: NH, amount: 1500000, note: 'Đợt 1',
  allocations: [{ doc_type: 'don_ban', doc_id: o1, amount: 1000000 }, { doc_type: 'don_ban', doc_id: o2, amount: 500000 }] });
const ra = await split(A, a1, a2);
const rb = await split(B, b1, b2);
C('Phiếu gốc trả đơn 1 đủ, đơn 2 một phần', await state(A, a1, a2), [1500000, 0, 1000000, 0, 500000, 1500000]);
const res = await edit(ra.id, { date: D(1), fund_id: TM, amount: 2500000, method: 'Tiền mặt', note: 'Đợt 1 (sửa)', party_id: A,
  allocations: [{ doc_type: 'don_ban', doc_id: a2, amount: 2000000 }] });
// Khách B: hủy phiếu rồi lập phiếu mới cùng nội dung
await api.call('void_payment', { id: rb.id });
await api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'thu_khach', date: D(1), fund_id: TM, amount: 2500000, method: 'Tiền mặt', party_id: B,
  allocations: [{ doc_type: 'don_ban', doc_id: b2, amount: 2000000 }] });
C('Giữ nguyên mã phiếu', [res.code, (await payment(ra.id)).code], [ra.code, ra.code]);
C('Công nợ, trả trước, tiền đơn sau khi sửa', await state(A, a1, a2), [500000, 0, 0, 1000000, 2000000, 0]);  // khách còn nợ a1 1.000.000, bù trừ 500.000 trả trước
C('Giống hệt hủy rồi lập lại', await state(A, a1, a2), await state(B, b1, b2));
C('Quỹ: tiền chuyển sang tiền mặt, ngân hàng chỉ còn phiếu đã hủy', [await fund(NH) - nh0, await fund(TM) - tm0], [0, 5000000]);
const pa = await payment(ra.id);
C('Phiếu lưu ngày, quỹ, nội dung mới', [pa.pay_date, pa.fund_id, pa.note, pa.amount, pa.unallocated], [D(1), TM, 'Đợt 1 (sửa)', 2500000, 500000]);
C('Ghi lịch sử sửa phiếu', [pa.edit_log.length, pa.edit_log[0].changes.some((x) => x.startsWith('Số tiền')), pa.edit_log[0].changes.some((x) => x.startsWith('Trả cho'))], [1, true, true]);
const ev = await api.sql(`select action, summary from order_events where order_id = ? and action = 'sua_phieu'`, [a2]);
C('Lịch sử đơn ghi lần sửa phiếu', [ev.length, ev[0]?.summary.includes(ra.code)], [1, true]);
const same = await edit(ra.id, { date: D(1), fund_id: TM, amount: 2500000, method: 'Tiền mặt', note: 'Đợt 1 (sửa)', party_id: A, allocations: [{ doc_type: 'don_ban', doc_id: a2, amount: 2000000 }] });
C('Lưu lại không đổi gì: không thêm dòng lịch sử', [same.changes.length, (await payment(ra.id)).edit_log.length], [0, 1]);

// ---------- 2. Các trường hợp bị chặn ----------
G('2. Kiểm tra khi sửa');
await E('Trả cho đơn quá số còn nợ bị chặn', () => edit(ra.id, { amount: 5000000, fund_id: TM, party_id: A, allocations: [{ doc_type: 'don_ban', doc_id: a1, amount: 1500000 }] }), 'vượt');
await E('Tổng trả cho đơn lớn hơn số tiền phiếu bị chặn', () => edit(ra.id, { amount: 500000, fund_id: TM, party_id: A, allocations: [{ doc_type: 'don_ban', doc_id: a2, amount: 2000000 }] }), 'nhiều hơn');
C('Lỗi thì phiếu giữ nguyên', [(await payment(ra.id)).amount, (await order(a2)).paid_net], [2500000, 2000000]);
await E('Không có quyền thu chi bị chặn', async () => { api.as(await api.user('kho@gomsu.vn')); try { await edit(ra.id, { amount: 1 }); } finally { api.as(owner); } }, 'quyền');
api.as(await api.user('thungan@gomsu.vn'));
await edit(ra.id, { amount: 2500000, fund_id: TM, party_id: A, note: 'Thu ngân sửa', allocations: [{ doc_type: 'don_ban', doc_id: a2, amount: 2000000 }] });
api.as(owner);
C('Người có quyền thu chi sửa được', (await payment(ra.id)).note, 'Thu ngân sửa');
await E('Phiếu đã hủy không sửa được', () => edit(rb.id, { amount: 1500000 }), 'đã hủy');
await E('Ngày tương lai bị chặn', () => edit(ra.id, { date: D(-2), amount: 2500000, fund_id: TM, party_id: A }), 'tương lai');

// ---------- 3. Khóa sổ ----------
G('3. Khóa sổ');
const old = await api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'thu_khac', date: D(10), fund_id: TM, amount: 100000, note: 'Thu cũ' });
await api.call('update_book_settings', { book_id: TH, settings: { lock_date: D(5) } });
await E('Phiếu trong kỳ đã khóa không sửa được', () => edit(old.id, { date: D(10), amount: 200000, fund_id: TM }), 'khóa');
await E('Không dời phiếu vào kỳ đã khóa', () => edit(ra.id, { date: D(6), amount: 2500000, fund_id: TM, party_id: A, allocations: [{ doc_type: 'don_ban', doc_id: a2, amount: 2000000 }] }), 'khóa');
await api.call('update_book_settings', { book_id: TH, settings: { lock_date: null } });

// ---------- 4. Phí sàn ----------
G('4. Phí sàn đi theo phiếu');
const C2 = await cust('Khách sàn'); const c1 = await sell(C2, 3, 1000000);
const fp = await api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'thu_khach', date: D(1), fund_id: NH, amount: 1000000, fee: 50000, method: 'TikTok Shop', party_id: C2,
  allocations: [{ doc_type: 'don_ban', doc_id: c1, amount: 1000000 }] });
const feeOf = async () => (await api.sql(`select amount, voided from expenses where settled_payment_id = ?`, [fp.id]));
await edit(fp.id, { date: D(1), fund_id: NH, amount: 1000000, fee: 30000, method: 'TikTok Shop', party_id: C2, allocations: [{ doc_type: 'don_ban', doc_id: c1, amount: 1000000 }] });
C('Sửa phí: khoản chi phí sửa theo', (await feeOf()).map((e) => [e.amount, e.voided]), [[30000, 0]]);
await edit(fp.id, { date: D(1), fund_id: NH, amount: 1000000, fee: 0, method: 'TikTok Shop', party_id: C2, allocations: [{ doc_type: 'don_ban', doc_id: c1, amount: 1000000 }] });
C('Bỏ phí: khoản chi phí bị hủy', (await feeOf()).map((e) => e.voided), [1]);

// ---------- 5. Phiếu ghi từ giao dịch ngân hàng ----------
G('5. Phiếu ghi từ tiền về tài khoản');
const K = await cust('Khách CK'); const k1 = await sell(K, 2, 3000000);
const ko = await order(k1);
const tx = await api.svc('ingest_bank_txn', { provider: 'casso', ext_id: 'ED-1', account_no: ACCT, amount: 1000000, direction: 'in', content: `TH${ko.code} chuyen tien`, txn_at: new Date().toISOString() });
C('Tiền về đã ghi phiếu', tx.status, 'da_ghi');
const bp = (await api.q('payments', TH, [['party_id', 'eq', K]]))[0];
await E('Không đổi được số tiền của phiếu ngân hàng', () => edit(bp.id, { date: bp.pay_date, fund_id: bp.fund_id, amount: 900000, party_id: K }), 'ngân hàng');
await E('Không đổi được quỹ của phiếu ngân hàng', () => edit(bp.id, { date: bp.pay_date, fund_id: TM, amount: 1000000, party_id: K }), 'ngân hàng');
await edit(bp.id, { date: bp.pay_date, fund_id: bp.fund_id, amount: 1000000, party_id: K, method: bp.method, note: 'Khách CK đợt 1', allocations: [{ doc_type: 'don_ban', doc_id: k1, amount: 1000000 }] });
C('Sửa nội dung phiếu ngân hàng được', (await payment(bp.id)).note, 'Khách CK đợt 1');
C('Giao dịch ngân hàng vẫn đã ghi', (await api.one('bank_txns', TH, [['id', 'eq', tx.id]])).status, 'da_ghi');

// ---------- 6. Phiếu trả cho hóa đơn HD của đơn đặt hàng ----------
G('6. Phiếu trả theo hóa đơn HD (đơn đặt giao nhiều đợt)');
const H = await cust('Khách đặt hàng');
const ho = (await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: H, kind: 'dat_hang', status: 'xac_nhan', order_date: D(5),
  lines: [{ product_id: P, qty: 3000, unit_price: 1000 }] })).id;
const hl = (await api.q('sales_order_lines', TH, [['order_id', 'eq', ho]]))[0].id;
await api.call('deliver', { book_id: TH, request_id: rid(), order_id: ho, date: D(4), lines: [{ order_line_id: hl, qty: 1000 }] });
await api.call('deliver', { book_id: TH, request_id: rid(), order_id: ho, date: D(3), lines: [{ order_line_id: hl, qty: 2000 }] });
const [g1, g2] = (await api.q('deliveries', TH, [['order_id', 'eq', ho]])).sort((x, y) => x.delivery_date.localeCompare(y.delivery_date));
const hr = await api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'thu_khach', party_id: H, date: D(1), fund_id: NH, amount: 3000000,
  allocations: [{ doc_type: 'hoa_don', doc_id: g1.id, amount: 1000000 }, { doc_type: 'hoa_don', doc_id: g2.id, amount: 2000000 }] });
const hp = await payment(hr.id);
C('Phiếu gốc trả cho hai hóa đơn HD', hp.allocations.map((x) => [x.delivery_id, x.amount]).sort(), [[g1.id, 1000000], [g2.id, 2000000]].sort());
await edit(hr.id, { date: D(1), fund_id: NH, amount: 2500000, party_id: H, allocations: [{ doc_type: 'hoa_don', doc_id: g1.id, amount: 1000000 }, { doc_type: 'hoa_don', doc_id: g2.id, amount: 1500000 }] });
const hp2 = await payment(hr.id);
C('Sau khi sửa vẫn trả theo từng hóa đơn HD', hp2.allocations.map((x) => [x.delivery_id, x.amount]).sort(), [[g1.id, 1000000], [g2.id, 1500000]].sort());
const open2 = await api.q('open_docs', TH, [['doc_id', 'eq', g2.id]]);
C('Hóa đơn đợt 2 còn nợ 500.000, đơn còn nợ 500.000', [open2[0].remaining_total, (await order(ho)).receivable], [500000, 500000]);

finish('Sửa phiếu thu / chi');
