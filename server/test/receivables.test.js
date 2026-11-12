// Kiểm thử sổ công nợ khách hàng và phiếu thu theo đợt — chạy: node test/receivables.test.js
import { freshDb, makeApi, suite, finish, rid, daysAgo as D } from './harness.js';

freshDb();
const api = makeApi();
const { G, C, E } = suite();

const owner = await api.user('chu@gomsu.vn');
const staff = await api.user('banhang@gomsu.vn');
api.as(owner);
const books = await api.call('bootstrap');
const TH = books.find((b) => b.short_name === 'TH').id;
await api.call('upsert_member', { book_id: TH, email: 'banhang@gomsu.vn', role: 'staff', perms: { ban_hang: true, xem_ban_hang: true } });
const NH = (await api.q('funds', TH)).find((f) => f.name.includes('ngân hàng')).id;
await api.call('import_products', { book_id: TH, request_id: rid(), opening_date: D(60), rows: [{ sku: 'BINH', name: 'Bình gốm', unit: 'Cái', cost: 500, price1: 1000, qty: 100000 }] });
const P = (await api.one('products', TH, [['sku', 'eq', 'BINH']])).id;
const cust = async (name) => (await api.call('save_party', { book_id: TH, type: 'kh', name, credit_days: 0 })).id;
// Bán và giao ngay (một hóa đơn); đặt mã giống KiotViet: đơn và hóa đơn cùng mã
const sell = async (c, days, goods, ship = 0, code) => {
  const o = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: c, order_date: D(days), deliver_now: true, shipping_fee: ship,
    lines: [{ product_id: P, qty: goods / 1000, unit_price: 1000 }] });
  if (code) { await api.sql('update sales_orders set code = ? where id = ?', [code, o.id]); await api.sql('update deliveries set code = ? where order_id = ?', [code, o.id]); }
  return o.id;
};
const order = async (id) => api.one('sales_orders', TH, [['id', 'eq', id]]);
const ledger = async (c, extra = {}) => api.call('customer_ledger', { book_id: TH, customer_id: c, ...extra });
const receipt = (c, amount, extra = {}) => api.call('record_receipt', { book_id: TH, request_id: rid(), customer_id: c, date: D(0), fund_id: NH, amount,
  method: 'Chuyển khoản', mode: 'auto', note: 'Thanh toán công nợ đợt 1', ...extra });

// ---------- Tình huống nghiệm thu ----------
G('1. Khách nợ 31.930.000, chuyển 15.000.000, cấn đơn cũ trước');
const A = await cust('A Cường Quảng Ninh');
const o296 = await sell(A, 30, 12800000, 1500000, 'HD000296');
const o300 = await sell(A, 29, 3220000, 200000, 'HD000300');
const o305 = await sell(A, 28, 2180000, 150000, 'HD000305');
await sell(A, 27, 2080000, 0, 'HD000308.01');
await sell(A, 26, 9600000, 200000, 'HD000943');
let L = await ledger(A);
C('Tổng nợ trước khi thu', L.receivable, 31930000);
C('Mỗi hóa đơn một dòng dù đơn và hóa đơn cùng mã', L.rows.map((r) => r.code), ['HD000296', 'HD000300', 'HD000305', 'HD000308.01', 'HD000943']);
const pv = await api.call('preview_receipt', { book_id: TH, customer_id: A, amount: 15000000, mode: 'auto' });
C('Xem trước: cấn 2 đơn cũ nhất', pv.allocations.map((a) => [a.doc_id, a.amount]), [[o296, 14300000], [o300, 700000]]);
C('Xem trước: HD000300 còn nợ sau cấn', pv.docs.find((d) => d.doc_id === o300).after, 2720000);
C('Xem trước: tổng khách còn nợ sau khi thu', pv.debt_after, 16930000);
const REQ = rid();
const r1 = await receipt(A, 15000000, { request_id: REQ, ref_no: 'FT2611120001', expect: pv.allocations });
const r1b = await receipt(A, 15000000, { request_id: REQ, ref_no: 'FT2611120001', expect: pv.allocations });
C('Bấm lưu hai lần: cùng một phiếu', r1b.id, r1.id);
C('Chỉ có một phiếu thu', (await api.q('payments', TH, [['party_id', 'eq', A]])).length, 1);
L = await ledger(A);
const pr = L.rows.filter((r) => r.type === 'thu');
C('Sổ công nợ có một dòng phiếu thu 15.000.000', pr.map((r) => r.paid), [15000000]);
C('Dòng phiếu thu kèm phần trừ vào từng đơn', pr[0].allocs.map((a) => [a.code, a.amount]), [['HD000296', 14300000], ['HD000300', 700000]]);
C('Số dư sau phiếu thu', pr[0].balance, 16930000);
C('Sổ khớp số dư khách', L.ledger_end, L.balance);
C('HD000296 đã thu đủ', [(await order(o296)).paid_net, (await order(o296)).receivable], [14300000, 0]);
C('HD000300 thu một phần, còn nợ 2.720.000', [(await order(o300)).paid_net, (await order(o300)).receivable], [700000, 2720000]);
const pay = await api.one('payments', TH, [['id', 'eq', r1.id]]);
C('Phiếu lưu mã giao dịch và người ghi', [pay.ref_no, !!pay.created_by_name], ['FT2611120001', true]);
C('Tổng phải thu / đã thu', [L.total_billed, L.total_paid], [31930000, 15000000]);

G('2. Lọc theo khoảng ngày: số dư đầu kỳ và cuối kỳ');
const P2 = await ledger(A, { from: D(28), to: D(27) });
C('Dòng trong kỳ', P2.rows.map((r) => r.code), ['HD000305', 'HD000308.01']);
C('Số dư đầu kỳ', P2.opening, 17720000);
C('Số dư cuối kỳ', P2.closing, 22130000);

G('3. Chọn đơn thủ công');
await E('Cấn vượt số còn nợ của đơn bị chặn', () => receipt(A, 3000000, { mode: 'manual', allocations: [{ doc_id: o300, amount: 3000000 }] }), 'chỉ còn nợ');
await E('Còn tiền chưa cấn khi khách vẫn nợ bị chặn', () => receipt(A, 3000000, { mode: 'manual', allocations: [{ doc_id: o305, amount: 2330000 }] }), 'chưa trừ vào đơn');
const B = await cust('Khách khác');
const oB = await sell(B, 10, 1000000);
await E('Cấn sang đơn của khách khác bị chặn', () => receipt(A, 1000000, { mode: 'manual', allocations: [{ doc_id: oB, amount: 1000000 }] }), 'không phải của khách');
await E('Công nợ đổi sau khi xem trước bị chặn', () => receipt(A, 1000000, { expect: [{ doc_id: o305, amount: 1000000 }] }), 'vừa thay đổi');
const r3 = await receipt(A, 2330000, { mode: 'manual', allocations: [{ doc_id: o305, amount: 2330000 }] });
C('Thủ công: HD000305 đã thu đủ, HD000300 không đổi', [(await order(o305)).receivable, (await order(o300)).receivable], [0, 2720000]);
C('Thủ công: phiếu cấn đúng một đơn', r3.allocations.length, 1);

G('4. Thu vượt tổng nợ → tiền khách trả trước, dùng cho đơn sau');
const pvB = await api.call('preview_receipt', { book_id: TH, customer_id: B, amount: 1500000, mode: 'auto' });
C('Xem trước: phần vượt là trả trước', [pvB.excess, pvB.prepaid_after, pvB.debt_after], [500000, 500000, 0]);
await receipt(B, 1500000);
C('Khách B trả trước 500.000', (await api.one('customers', TH, [['id', 'eq', B]])).prepaid, 500000);
const oB2 = await sell(B, 0, 400000);
C('Đơn mới chưa cấn', (await order(oB2)).receivable, 400000);
const ap = await api.call('apply_prepaid', { book_id: TH, request_id: rid(), customer_id: B });
C('Cấn tiền trả trước vào đơn mới', [ap.used, (await order(oB2)).receivable], [400000, 0]);
const LB = await ledger(B);
C('Khách B: sổ khớp số dư, còn trả trước 100.000', [LB.ledger_end, LB.prepaid], [-100000, 100000]);
const oB3 = await sell(B, 0, 300000);
const rB = await receipt(B, 200000);
C('Phiếu thu tự dùng tiền trả trước còn lại trước', [rB.prepaid_used, (await order(oB3)).receivable], [100000, 0]);

G('5. Khách có khoản thu cũ (luồng thu theo đơn) và giao từng phần');
const K = await cust('Khách thu cũ');
const oK = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: K, order_date: D(20), status: 'xac_nhan', lines: [{ product_id: P, qty: 1000, unit_price: 1000 }] });
const lK = (await api.q('sales_order_lines', TH, [['order_id', 'eq', oK.id]]))[0].id;
await api.call('deliver', { order_id: oK.id, request_id: rid(), date: D(20), lines: [{ order_line_id: lK, qty: 400 }] });
await api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'thu_khach', date: D(15), fund_id: NH, party_id: K, amount: 300000,
  allocations: [{ doc_type: 'don_ban', doc_id: oK.id, amount: 300000 }] });
await api.call('deliver', { order_id: oK.id, request_id: rid(), date: D(10), lines: [{ order_line_id: lK, qty: 600 }] });
const LK = await ledger(K);
C('Giao 2 đợt = 2 dòng phát sinh nợ, khoản thu cũ = 1 dòng đã thu', LK.rows.map((r) => [r.type, r.debt, r.paid]), [['ban_hang', 400000, 0], ['thu', 0, 300000], ['ban_hang', 600000, 0]]);
C('Dòng giao từng đợt ghi rõ đợt', LK.rows.filter((r) => r.type === 'ban_hang').map((r) => r.title.split(' của')[0]), ['Giao đợt 1', 'Giao đợt 2']);
C('Khoản thu cũ tính một lần, sổ khớp số dư', [LK.ledger_end, LK.receivable], [700000, 700000]);
await receipt(K, 700000);
C('Đơn thu đủ sau phiếu đợt mới', (await order(oK.id)).receivable, 0);

G('6. Đơn hủy đã nhận tiền');
const H = await cust('Khách hủy đơn');
const oH = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: H, order_date: D(5), status: 'xac_nhan', lines: [{ product_id: P, qty: 500, unit_price: 1000 }] });
await api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'thu_khach', date: D(5), fund_id: NH, party_id: H, amount: 200000,
  allocations: [{ doc_type: 'don_ban', doc_id: oH.id, amount: 200000 }] });
await api.call('cancel_sales_order', { id: oH.id, reason: 'Khách không lấy nữa' });
const oH2 = await sell(H, 1, 300000);
const LH = await ledger(H);
C('Giữ lịch sử phiếu thu của đơn hủy', LH.rows.map((r) => r.type), ['thu', 'ban_hang']);
const pvH = await api.call('preview_receipt', { book_id: TH, customer_id: H, amount: 300000, mode: 'auto' });
C('Không cấn vào đơn đã hủy', pvH.allocations.map((a) => a.doc_id), [oH2]);

G('7. Quyền');
api.as(staff);
await E('Nhân viên không có quyền thu chi không ghi được phiếu', () => receipt(A, 1000), 'quyền');
await E('Nhân viên không có quyền xem thu chi không xem được sổ', () => ledger(A), 'quyền');

finish('Sổ công nợ khách hàng');
