// Kiểm thử phương thức thanh toán của đơn hàng — chạy: node test/pay-term.test.js
// - Thanh toán trên hóa đơn bán hàng (đơn giao một lần): hóa đơn trừ tiền cọc và các đợt thanh toán bổ sung.
// - Thanh toán theo tiến độ giao hàng: mỗi chuyến đến hạn 70% giá trị thực giao, cấn trừ cọc thủ công, quyết toán, biên bản đối chiếu.
import { freshDb, makeApi, suite, finish, rid, daysAgo as D } from './harness.js';
import { progressStatement, invoiceMoney, tripDue } from '../../web/src/lib/pay-term.js';
import { tokenValues } from '../../web/src/lib/docs/tokens.js';
import { docSettings } from '../../web/src/lib/docs/model.js';

freshDb();
const api = makeApi();
const { G, C, E } = suite();

const owner = await api.user('chu@gomsu.vn');
api.as(owner);
const books = await api.call('bootstrap');
const TH = books.find((b) => b.short_name === 'TH').id;
const TM = (await api.q('funds', TH))[0].id;
await api.call('import_products', { book_id: TH, request_id: rid(), opening_date: D(40), rows: [
  { sku: 'NGOI', name: 'Ngói', unit: 'Viên', cost: 500, price1: 1000, qty: 10000000 }] });
const P = (await api.one('products', TH, [['sku', 'eq', 'NGOI']])).id;
const A = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'Chủ đầu tư' })).id;
const order = async (id) => api.one('sales_orders', TH, [['id', 'eq', id]]);
const M = 1000000;
const pay = (o, purpose, amount, date, x = {}) => api.call('add_order_payment', { book_id: TH, request_id: rid(), order_id: o, purpose, amount, date, fund_id: TM, ...x });
const adjust = (o, kind, amount, date) => api.call('add_order_adjustment', { book_id: TH, order_id: o, kind, amount, date });
const ledger = async (id, cutoff) => {
  const od = await order(id);
  return progressStatement({ ratio: od.pay_ratio, invoices: await api.q('order_invoices', TH, [['order_id', 'eq', id]]),
    pays: await api.q('doc_payments', TH, [['doc_id', 'eq', id]]), adjustments: await api.q('order_adjustments', TH, [['order_id', 'eq', id]]), cutoff });
};

G('1. Phương thức thanh toán lưu trên đơn, mặc định thanh toán trên hóa đơn');
const big = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: A, kind: 'dat_hang', status: 'xac_nhan', order_date: D(30),
  pay_term: 'don_lon', pay_ratio: 70, lines: [{ product_id: P, qty: 1500000, unit_price: 1000 }] });
let od = await order(big.id);
C('Đơn 1,5 tỷ thanh toán theo tiến độ, 70% mỗi chuyến', [od.pay_term, od.pay_ratio, od.order_total], ['don_lon', 70, 1500 * M]);
await E('Tỷ lệ phải từ 1 đến 100%', () => api.call('update_order_info', { book_id: TH, id: big.id, pay_ratio: 0 }), /1 đến 100/);
const line = (await api.q('sales_order_lines', TH, [['order_id', 'eq', big.id]]))[0];
await api.call('save_sales_order', { book_id: TH, request_id: rid(), id: big.id, customer_id: A, kind: 'dat_hang', status: 'xac_nhan', order_date: D(30),
  lines: [{ id: line.id, product_id: P, qty: 1500000, unit_price: 1000 }] });
od = await order(big.id);
C('Lưu lại đơn không gửi phương thức: giữ nguyên', [od.pay_term, od.pay_ratio], ['don_lon', 70]);
const plain = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: A, kind: 'dat_hang', status: 'xac_nhan', order_date: D(30),
  lines: [{ product_id: P, qty: 100000, unit_price: 1000 }] });
C('Đơn mới mặc định thanh toán trên hóa đơn', (await order(plain.id)).pay_term, 'mac_dinh');

G('2. Đơn giao một lần: hóa đơn 100 triệu, cọc 30 triệu, chuyển thêm 20 triệu → còn 50 triệu');
await pay(plain.id, 'coc', 30 * M, D(25), { ref_no: 'FT-COC-01' });
const pl = (await api.q('sales_order_lines', TH, [['order_id', 'eq', plain.id]]))[0];
const g0 = await api.call('deliver', { book_id: TH, request_id: rid(), order_id: plain.id, date: D(20), lines: [{ order_line_id: pl.id, qty: 100000 }] });
await pay(plain.id, 'thanh_toan', 20 * M, D(18), { ref_no: 'FT-TT-01', note: 'Chuyển khoản đợt 2' });
const inv0 = await api.one('order_invoices', TH, [['id', 'eq', g0.id]]);
C('Hóa đơn: tổng 100, đã trả 50, còn phải thanh toán 50 (triệu)', [inv0.total, inv0.paid, inv0.debt].map((x) => x / M), [100, 50, 50]);
const pays0 = await api.q('doc_payments', TH, [['doc_id', 'eq', plain.id]]);
const m0 = invoiceMoney(pays0, { whole: true });
C('Trên hóa đơn: tiền cọc 30, một đợt thanh toán bổ sung 20 (triệu)', [m0.deposit / M, m0.payments.map((p) => [p.amount / M, p.ref_no])], [30, [[20, 'FT-TT-01']]]);
await E('Mỗi giao dịch chỉ ghi nhận một lần', () => pay(plain.id, 'thanh_toan', 1 * M, D(17), { ref_no: 'ft-tt-01' }), /chỉ ghi nhận một lần/);
await E('Đơn thanh toán trên hóa đơn không cấn trừ cọc', () => adjust(plain.id, 'can_tru_coc', M, D(1)), /tiến độ/);
// Sửa phiếu (đổi ghi chú) không mất phân loại đặt cọc
const cocPay = pays0.find((p) => p.purpose === 'coc');
await api.call('update_payment', { book_id: TH, id: cocPay.payment_id, date: cocPay.pay_date, fund_id: TM, party_id: A, amount: 30 * M, note: 'Cọc lần 1',
  allocations: [{ doc_type: 'don_ban', doc_id: plain.id, amount: 30 * M }] });
C('Sửa phiếu cọc vẫn là tiền đặt cọc', (await api.q('doc_payments', TH, [['payment_id', 'eq', cocPay.payment_id]]))[0].purpose, 'coc');
const ds = docSettings(books.find((b) => b.id === TH), {});
const invDoc = tokenValues('hoa_don', { kind: 'delivery', o: await order(plain.id), d: { ...g0, id: g0.id, vat: 0, shipping_fee: 0 },
  dlines: await api.q('delivery_lines', TH, [['delivery_id', 'eq', g0.id]]), lines: [], prods: {}, pays: pays0, cust: {} }, ds, { old_debt: '0' });
C('Mẫu hóa đơn: tiền cọc 30.000.000, đợt thanh toán 20.000.000, còn 50.000.000',
  [invDoc.v.Tien_Coc_Da_Nhan, invDoc.pays.map((p) => p.Tien_Dot_Thanh_Toan), invDoc.v.Con_Thanh_Toan], ['30,000,000', ['20,000,000'], '50,000,000']);

G('3. Đơn 1,5 tỷ, cọc 500 triệu, 5 chuyến 800 triệu, khách chuyển thêm 300 triệu');
await pay(big.id, 'coc', 500 * M, D(28), { ref_no: 'FT-COC-BIG' });
const values = [100, 150, 200, 170, 180];
for (let i = 0; i < 5; i++) {
  await api.call('deliver', { book_id: TH, request_id: rid(), order_id: big.id, date: D(25 - i * 3), lines: [{ order_line_id: line.id, qty: values[i] * 1000 }] });
}
await pay(big.id, 'thanh_toan', 300 * M, D(9), { ref_no: 'FT-BIG-300' });
let st = await ledger(big.id, D(0));
C('Đến hạn từng chuyến = 70% giá trị thực giao (triệu)', st.trips.map((t) => t.due / M), [70, 105, 140, 119, 126]);
C('Đã giao 800, đến hạn 560, đã chuyển thêm 300 (triệu)', [st.delivered, st.due, st.paid].map((x) => x / M), [800, 560, 300]);
C('Chưa cấn trừ cọc: còn phải thanh toán 260 triệu', st.remaining / M, 260);
C('Chuyến đến hạn làm tròn theo từng chuyến', tripDue(333, 70), 233);
await E('Cấn trừ không vượt số còn phải thu', () => adjust(big.id, 'can_tru_coc', 261 * M, D(0)), /còn phải thu/);
await E('Cấn trừ trước khi khách chuyển thêm không vượt số còn phải thu ngày đó', () => adjust(big.id, 'can_tru_coc', 300 * M, D(20)), /còn phải thu/);
await adjust(big.id, 'can_tru_coc', 100 * M, D(5));
st = await ledger(big.id, D(0));
C('Cấn trừ 100 triệu: còn phải thanh toán 160 triệu', [st.offset / M, st.remaining / M], [100, 160]);
C('Số dư cọc 400 triệu, chưa đến hạn 240 triệu (chỉ trong sổ nội bộ)', [st.depositLeft / M, st.notDue / M], [400, 240]);
C('Ngày chốt trước ngày cấn trừ: chưa có cấn trừ', (await ledger(big.id, D(6))).offset, 0);
od = await order(big.id);
C('Cấn trừ cọc không tạo khoản thu: tiền đã nhận của đơn vẫn 800 triệu', od.paid_net / M, 800);

G('4. Biên bản đối chiếu công nợ: hiện cấn trừ, ẩn số dư cọc và phần chưa đến hạn');
const docData = { kind: 'order', o: od, lines: [], prods: {}, cust: {}, allDl: [], pays: await api.q('doc_payments', TH, [['doc_id', 'eq', big.id]]),
  payBase: { term: 'don_lon', ratio: 70, total: od.order_total, order_code: od.code, invoices: await api.q('order_invoices', TH, [['order_id', 'eq', big.id]]),
    pays: await api.q('doc_payments', TH, [['doc_id', 'eq', big.id]]), adjustments: await api.q('order_adjustments', TH, [['order_id', 'eq', big.id]]) } };
const rec = tokenValues('doi_chieu_tt', docData, ds, { date_doi_chieu_tt: D(0) });
const html = rec.v.Bang_Doi_Chieu_Cong_No.h;
C('Có dòng tiền cọc cấn trừ 100.000.000', /TIỀN CỌC CẤN TRỪ \(3\)/.test(html) && html.includes('100,000,000'), true);
C('Còn phải thanh toán 160.000.000', /CÒN PHẢI THANH TOÁN/.test(html) && html.includes('160,000,000'), true);
C('Có tổng giá trị đơn hàng và 5 chuyến', [html.includes('1,500,000,000'), (html.match(/Chuyến \d/g) || []).length], [true, 5]);
C('Không in số dư cọc 400 triệu và phần chưa đến hạn 240 triệu', [html.includes('400,000,000'), html.includes('240,000,000'), /chưa sử dụng|chưa đến hạn/i.test(html)], [false, false, false]);
C('Dòng bằng chữ theo số còn phải thanh toán', rec.v.Con_No_Doi_Chieu_Bang_Chu, 'Một trăm sáu mươi triệu đồng chẵn');
const before = tokenValues('doi_chieu_tt', docData, ds, { date_doi_chieu_tt: D(6) }).v.Bang_Doi_Chieu_Cong_No.h;
C('Ngày chốt trước khi cấn trừ: không có dòng cấn trừ, còn 260 triệu', [/CẤN TRỪ/.test(before), before.includes('260,000,000')], [false, true]);

G('5. Quyết toán và khách thanh toán dư');
await E('Quyết toán không vượt phần chưa đến hạn', () => adjust(big.id, 'quyet_toan', 241 * M, D(0)), /chưa đến hạn/);
const q1 = await adjust(big.id, 'quyet_toan', 240 * M, D(1));
st = await ledger(big.id, D(0));
C('Quyết toán 240 triệu vào số đến hạn: đến hạn 800, còn 400 (triệu)', [st.due / M, st.notDue, st.remaining / M], [800, 0, 400]);
await E('Mỗi khoản chỉ tính một lần', () => adjust(big.id, 'quyet_toan', 1 * M, D(0)), /chưa đến hạn/);
await pay(big.id, 'thanh_toan', 450 * M, D(0), { ref_no: 'FT-BIG-450' });
st = await ledger(big.id, D(0));
C('Khách trả vượt: thanh toán dư 50 triệu', st.remaining / M, -50);
const over = tokenValues('doi_chieu_tt', { ...docData, payBase: { ...docData.payBase, pays: await api.q('doc_payments', TH, [['doc_id', 'eq', big.id]]),
  adjustments: await api.q('order_adjustments', TH, [['order_id', 'eq', big.id]]) } }, ds, { date_doi_chieu_tt: D(0) }).v.Bang_Doi_Chieu_Cong_No.h;
C('Biên bản ghi "Khách đã thanh toán dư" 50 triệu', /KHÁCH ĐÃ THANH TOÁN DƯ/.test(over) && over.includes('50,000,000'), true);
await api.call('delete_order_adjustment', { book_id: TH, id: q1.id });
C('Xóa đợt quyết toán: chưa đến hạn trở lại 240 triệu', (await ledger(big.id, D(0))).notDue / M, 240);

finish('Phương thức thanh toán của đơn hàng');
