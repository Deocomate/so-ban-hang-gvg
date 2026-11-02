// Kiểm thử: vận đơn (SPX, BEST), tiền về tài khoản (SePay/Casso), thông báo — chạy: node test/ship-bank.test.js
import { freshDb, makeApi, suite, finish, rid, daysAgo as D, TODAY as today } from './harness.js';
import { mapTmStatus } from '../src/lib/labels.js';
import { RPC } from '../src/domain/rpc.js';

freshDb();
const api = makeApi();
const { G, C, E } = suite();
const TODAY = today();
// Hàm máy chủ (webhook) chạy không có người dùng đăng nhập
const svc = (fn, p) => api.svc(fn, p);
const ACCT = '1106738888';

// ---------- Chuẩn bị ----------
const owner = await api.user('chu@gomsu.vn');
const staff = await api.user('nv@gomsu.vn');
const kho = await api.user('kho@gomsu.vn');
const outsider = await api.user('la@gomsu.vn');
api.as(owner);
const books = await api.call('bootstrap');
const TH = books.find((b) => b.short_name === 'TH').id;
const VG = books.find((b) => b.short_name === 'VG').id;
await api.call('upsert_member', { book_id: VG, email: 'nv@gomsu.vn', role: 'staff', display_name: 'Lan' });           // quyền mặc định: bán hàng + thu chi
await api.call('upsert_member', { book_id: VG, email: 'kho@gomsu.vn', role: 'staff', display_name: 'Tùng', perms: { ban_hang: true } });
// Cả 2 sổ dùng chung 1 tài khoản Vietcombank
for (const b of [TH, VG]) await api.call('update_book_settings', { book_id: b, settings: { bank: { bin: '970436', bank_name: 'Vietcombank', account_no: ACCT, account_name: 'HKD GOM SU MAI HIEU' } } });
const fundsVG = await api.q('funds', VG); const NH_VG = fundsVG.find((f) => f.name.includes('ngân hàng')).id;
const fundsTH = await api.q('funds', TH); const NH_TH = fundsTH.find((f) => f.name.includes('ngân hàng')).id;
await api.call('import_products', { book_id: VG, request_id: rid(), opening_date: D(10), rows: [
  { sku: 'BHL-01', name: 'Bình hút lộc men rạn', category: 'Bình hút lộc', cost: 300000, price1: 650000, price2: 550000, price3: 500000, qty: 50 },
  { sku: 'AC-01', name: 'Bộ ấm chén men lam', category: 'Ấm chén', cost: 200000, price1: 450000, price2: 380000, price3: 350000, qty: 40 }] });
await api.call('import_products', { book_id: TH, request_id: rid(), opening_date: D(10), rows: [
  { sku: 'NGOI-L', name: 'Ngói âm dương L', category: 'Ngói', cost: 10000, price1: 18000, price2: 16000, price3: 15000, qty: 5000 }] });
const VP = Object.fromEntries((await api.q('products', VG)).map((p) => [p.sku, p.id]));
const TP = Object.fromEntries((await api.q('products', TH)).map((p) => [p.sku, p.id]));
const kh = async (b, name, extra = {}) => (await api.call('save_party', { book_id: b, type: 'kh', name, ...extra })).id;
const K1 = await kh(VG, 'Chị Hoa (Facebook)'), K2 = await kh(VG, 'Anh Tuấn (TikTok)'), K3 = await kh(VG, 'Cô Mai (Facebook)', { credit_days: 3 });
const KT = await kh(TH, 'Chùa Phúc Lâm', { price_tier: 3, credit_days: 15 });
const sell = async (b, customer_id, product_id, qty, unit_price, extra = {}) => api.call('save_sales_order', { book_id: b, request_id: rid(), customer_id, order_date: TODAY,
  channel: 'Facebook', lines: [{ product_id, qty, unit_price }], deliver_now: true, ...extra });
const ord = async (b, id) => api.one('sales_orders', b, [['id', 'eq', id]]);
const ship = async (id) => api.one('shipments', VG, [['id', 'eq', id]]);
const notes = async (who, b) => { api.as(who); const r = await api.call('my_notifications', { book_id: b }); api.as(owner); return r; };

// ---------- 1. Vận đơn Shopee Express ----------
G('1. Tạo vận đơn SPX');
const o1 = await sell(VG, K1, VP['BHL-01'], 1, 650000);          // COD 650k
const o2 = await sell(VG, K2, VP['AC-01'], 1, 450000);           // COD 450k
const o3 = await sell(VG, K3, VP['AC-01'], 2, 400000);           // sẽ bị hoàn
const s1 = await api.call('create_shipment', { book_id: VG, request_id: rid(), order_id: o1.id, delivery_id: o1.delivery?.id, tracking_no: 'spxvn 0123 456 789', cod_amount: 650000, ship_fee: 25000 });
C('Mã vận đơn được chuẩn hóa (bỏ khoảng trắng, chữ hoa)', s1.tracking_no, 'SPXVN0123456789');
let S = await ship(s1.id);
C('Trạng thái ban đầu', S.status, 'cho_lay_hang');
C('Trạng thái tiền COD', S.cod_status, 'chua_thu');
C('Có dòng lịch sử đầu tiên', S.event_count, 1);
C('Tên người nhận lấy theo khách', S.receiver_name, 'Chị Hoa (Facebook)');
await E('Trùng mã vận đơn bị chặn', () => api.call('create_shipment', { book_id: VG, order_id: o2.id, tracking_no: 'SPXVN0123456789' }), 'đã có');
const draft = await api.call('save_sales_order', { book_id: VG, request_id: rid(), customer_id: K1, order_date: TODAY, lines: [{ product_id: VP['AC-01'], qty: 1, unit_price: 450000 }] });
await E('Đơn nháp không tạo được vận đơn', () => api.call('create_shipment', { book_id: VG, order_id: draft.id, tracking_no: 'SPXVN999999' }), 'xác nhận');
await E('Người ngoài không tạo được vận đơn', () => api.as(outsider).call('create_shipment', { book_id: VG, order_id: o2.id, tracking_no: 'SPXVN77777' }), 'quyền');
api.as(owner);
const reqS = rid();
const s2 = await api.call('create_shipment', { book_id: VG, request_id: reqS, order_id: o2.id, tracking_no: 'SPXVN0000000002', cod_amount: 450000 });
const s2b = await api.call('create_shipment', { book_id: VG, request_id: reqS, order_id: o2.id, tracking_no: 'SPXVN0000000002', cod_amount: 450000 });
C('Bấm lưu 2 lần không tạo 2 vận đơn', [s2b.id === s2.id, (await api.q('shipments', VG, [['order_id', 'eq', o2.id]])).length], [true, 1]);
const s3 = await api.call('create_shipment', { book_id: VG, request_id: rid(), order_id: o3.id, tracking_no: 'SPXVN0000000003', cod_amount: 800000 });
api.as(kho);
const s4o = await sell(VG, K2, VP['BHL-01'], 1, 600000);
const s4 = await api.call('create_shipment', { book_id: VG, request_id: rid(), order_id: s4o.id, tracking_no: 'SPXVN0000000004', cod_amount: 0 });
C('Nhân viên kho (chỉ quyền bán hàng) tạo được vận đơn', !!s4.id, true);
api.as(owner);

G('2. Cập nhật trạng thái tự động (TrackingMore)');
C('Ánh xạ: transit → Đang trung chuyển', mapTmStatus('transit', null), 'dang_trung_chuyen');
C('Ánh xạ: pickup → Đang giao hàng', mapTmStatus('pickup', null), 'dang_giao');
C('Ánh xạ: undelivered → Giao thất bại', mapTmStatus('undelivered', null), 'giao_that_bai');
C('Ánh xạ: exception011 → Đang hoàn', mapTmStatus('exception', 'exception011'), 'dang_hoan');
C('Ánh xạ: exception010 → Đã hoàn', mapTmStatus('exception', 'exception010'), 'da_hoan');
const t0 = Date.now();
const ev = (min, detail, status) => ({ at: new Date(t0 + (400 - min) * 1000).toISOString(), detail, location: 'Hà Nội', status });
const payload1 = { tracking_no: 'SPXVN0123456789', status: 'transit', events: [ev(300, 'Đơn hàng đã được lấy', 'transit'), ev(200, 'Đã đến kho phân loại Bắc Ninh', 'transit')] };
let r = await svc('ingest_tracking', payload1);
C('Nhận 2 sự kiện mới', [r.shipments, r.new_events, r.changed], [1, 2, 1]);
C('Trạng thái → Đang trung chuyển', (await ship(s1.id)).status, 'dang_trung_chuyen');
r = await svc('ingest_tracking', payload1);
C('Gửi lại cùng dữ liệu không nhân đôi lịch sử', [r.new_events, r.changed], [0, 0]);
r = await svc('ingest_tracking', { tracking_no: 'spxvn0123456789', status: 'pickup', events: [...payload1.events, ev(60, 'Shipper đang giao hàng', 'pickup')] });
C('Trạng thái → Đang giao hàng', (await ship(s1.id)).status, 'dang_giao');
r = await svc('ingest_tracking', { tracking_no: 'SPXVN0123456789', status: 'delivered', substatus: 'delivered001', events: [ev(10, 'Giao hàng thành công', 'delivered')] });
S = await ship(s1.id);
C('Trạng thái → Giao thành công', S.status, 'giao_thanh_cong');
C('Giao thành công: COD chuyển sang “SPX đang giữ tiền”', S.cod_status, 'spx_dang_giu');
C('Lịch sử đủ 5 dòng, mới nhất ở trên', [S.event_count, S.events[0].detail], [5, 'Giao hàng thành công']);
await svc('ingest_tracking', { tracking_no: 'SPXVN0000000002', status: 'delivered', events: [ev(5, 'Giao hàng thành công', 'delivered')] });
await svc('ingest_tracking', { tracking_no: 'SPXVN0000000003', status: 'undelivered', events: [ev(30, 'Không liên lạc được người nhận', 'undelivered')] });
C('Giao thất bại được ghi nhận', (await ship(s3.id)).status, 'giao_that_bai');
await svc('ingest_tracking', { tracking_no: 'SPXVN0000000003', status: 'exception', substatus: 'exception011', events: [ev(20, 'Đang hoàn hàng về người gửi', 'exception')] });
await svc('ingest_tracking', { tracking_no: 'SPXVN0000000003', status: 'exception', substatus: 'exception010', events: [ev(1, 'Đã hoàn hàng cho người gửi', 'exception')] });
S = await ship(s3.id);
C('Hoàn hàng: trạng thái “Đã hoàn về shop”', S.status, 'da_hoan');
C('Hoàn hàng: COD “Không thu được”', S.cod_status, 'khong_thu_duoc');
C('Vận đơn hoàn được đánh dấu có vấn đề', S.has_problem, true);
const unknown = await svc('ingest_tracking', { tracking_no: 'SPXVN_KHONG_CO', status: 'transit', events: [] });
C('Mã vận đơn lạ không làm gì', unknown.shipments, 0);

G('3. Cập nhật trạng thái bằng tay');
api.as(staff);
await api.call('update_shipment_status', { id: s4.id, status: 'da_lay_hang', note: 'Shipper đã lấy lúc 9h' });
C('Nhân viên cập nhật tay được', (await api.one('shipments', VG, [['id', 'eq', s4.id]])).status, 'da_lay_hang');
await E('Trạng thái không có trong danh sách bị chặn', () => api.call('update_shipment_status', { id: s4.id, status: 'bay_mau' }), 'không hợp lệ');
api.as(outsider);
await E('Người ngoài không cập nhật được', () => api.call('update_shipment_status', { id: s4.id, status: 'dang_giao' }), 'quyền');
api.as(owner);

// ---------- 4. Đối soát COD ----------
G('4. Đối soát COD Shopee Express');
const fundBefore = (await api.one('funds', VG, [['id', 'eq', NH_VG]])).balance;
const codTx = await svc('ingest_bank_txn', { provider: 'sepay', ext_id: 'SP-1001', account_no: ACCT, amount: 1060000, direction: 'in',
  content: 'SHOPEE EXPRESS THANH TOAN COD 12/10', txn_at: new Date().toISOString(), counter_name: 'CONG TY SPX' });
C('Tiền SPX về: chưa khớp, gợi ý đối soát COD', [codTx.status, /COD/.test(codTx.note)], ['cho_xu_ly', true]);
await E('Tiền về lớn hơn tổng COD bị chặn', () => api.call('settle_cod', { book_id: VG, shipment_ids: [s1.id, s2.id], fund_id: NH_VG, received: 1200000 }), 'lớn hơn');
await E('Vận đơn chưa giao xong không đối soát được', () => api.call('settle_cod', { book_id: VG, shipment_ids: [s1.id, s4.id], fund_id: NH_VG, received: 600000 }), 'chưa giao');
await E('Số tiền khác giao dịch ngân hàng bị chặn', () => api.call('settle_cod', { book_id: VG, shipment_ids: [s1.id, s2.id], fund_id: NH_VG, received: 1050000, bank_txn_id: codTx.id }), 'khác');
const st = await api.call('settle_cod', { book_id: VG, request_id: rid(), shipment_ids: [s1.id, s2.id], fund_id: NH_VG, received: 1060000, bank_txn_id: codTx.id });
C('Tạo 2 phiếu thu (mỗi khách 1 phiếu)', st.payments.length, 2);
C('Cước SPX trừ = 1.100.000 − 1.060.000', st.fee_total, 40000);
C('Vận đơn chuyển “Đã về tài khoản”', [(await ship(s1.id)).cod_status, (await ship(s2.id)).cod_status], ['da_ve_tk', 'da_ve_tk']);
C('Đơn của chị Hoa đã thu đủ', (await ord(VG, o1.id)).payment_status, 'da_thanh_toan_du');
C('Quỹ ngân hàng tăng đúng số tiền thực về', (await api.one('funds', VG, [['id', 'eq', NH_VG]])).balance - fundBefore, 1060000);
const fees = await api.sql(`select sum(amount) s, min(category) c, min(expense_group) g from expenses where book_id = ? and category = 'Phí vận chuyển (ship, COD)'`, [VG]);
C('Cước bị trừ ghi vào “Chi phí bán hàng · Phí vận chuyển (ship, COD)”', [fees[0].s, fees[0].g], [40000, 'Chi phí bán hàng']);
C('Giao dịch ngân hàng đã ghi', (await api.one('bank_txns', VG, [['id', 'eq', codTx.id]])).status, 'da_ghi');
await E('Đối soát lại vận đơn đã về tài khoản bị chặn', () => api.call('settle_cod', { book_id: VG, shipment_ids: [s1.id], fund_id: NH_VG, received: 600000 }), 'đối soát');
await E('Sửa tiền COD sau khi đã đối soát bị chặn', () => api.call('update_shipment', { id: s1.id, cod_amount: 1 }), 'đối soát');

// ---------- 5. Tiền chuyển khoản về TK ----------
G('5. Tiền về tài khoản tự gạch nợ đơn');
const t1 = await sell(TH, KT, TP['NGOI-L'], 200, 15000);   // nợ 3.000.000
const t1o = await ord(TH, t1.id);
const content1 = `MBVCB.8312.TH${t1o.code}.CT tu 0071000 NGUYEN VAN A`;
r = await svc('ingest_bank_txn', { provider: 'casso', ext_id: 'CS-1', account_no: '110 673 8888', amount: 2000000, direction: 'in', content: content1, txn_at: new Date().toISOString() });
C('Tìm thấy mã đơn trong nội dung CK và ghi phiếu thu', [r.status, r.order_code], ['da_ghi', t1o.code]);
C('Ghi đúng sổ Thanh Hải dù 2 sổ dùng chung tài khoản', (await api.q('bank_txns', TH, [['id', 'eq', r.id]])).length, 1);
C('Sổ Vũ Gia không thấy giao dịch của Thanh Hải', (await api.q('bank_txns', VG, [['id', 'eq', r.id]])).length, 0);
C('Đơn còn nợ 1.000.000', (await ord(TH, t1.id)).receivable, 1000000);
C('Trạng thái thanh toán: một phần', (await ord(TH, t1.id)).payment_status, 'thanh_toan_mot_phan');
const r2 = await svc('ingest_bank_txn', { provider: 'casso', ext_id: 'CS-1', account_no: ACCT, amount: 2000000, direction: 'in', content: content1 });
C('Webhook gửi lại cùng giao dịch: không ghi 2 lần', [r2.duplicate, (await api.q('payments', TH)).filter((p) => p.method === 'Chuyển khoản').length], [true, 1]);
r = await svc('ingest_bank_txn', { provider: 'casso', ext_id: 'CS-2', account_no: ACCT, amount: 1500000, direction: 'in', content: `th ${t1o.code} con lai` });
C('Khách chuyển dư: gạch đủ đơn, phần dư thành trả trước', [r.allocated, r.excess], [1000000, 500000]);
C('Khách có 500.000 trả trước', (await api.one('customers', TH, [['id', 'eq', KT]])).prepaid, 500000);
// Đơn đặt riêng (chưa giao) nhận cọc qua chuyển khoản
const dep = await api.call('save_sales_order', { book_id: VG, request_id: rid(), customer_id: K1, kind: 'dat_hang', status: 'xac_nhan', order_date: TODAY,
  lines: [{ product_id: VP['BHL-01'], qty: 2, unit_price: 600000 }] });
const depo = await ord(VG, dep.id);
const revBefore = (await api.call('rpt_overview', { book_id: VG, from: TODAY, to: TODAY })).revenue;
r = await svc('ingest_bank_txn', { provider: 'sepay', ext_id: 'SP-2', account_no: ACCT, amount: 500000, direction: 'in', content: `VG${depo.code} coc`, code: null });
C('Tiền cọc qua CK được ghi vào đơn sổ Vũ Gia', [r.status, r.order_code], ['da_ghi', depo.code]);
C('Tiền cọc KHÔNG làm tăng doanh thu', (await api.call('rpt_overview', { book_id: VG, from: TODAY, to: TODAY })).revenue, revBefore);
C('Đơn đặt riêng: đã đặt cọc', (await ord(VG, dep.id)).payment_status, 'da_dat_coc');
r = await svc('ingest_bank_txn', { provider: 'sepay', ext_id: 'SP-3', account_no: ACCT, amount: 300000, direction: 'in', content: 'chuyen tien hang', counter_name: 'TRAN THI B' });
C('Không có mã đơn: chờ xử lý', r.status, 'cho_xu_ly');
C('Chưa rõ sổ nào: hiện ở cả 2 sổ', [(await api.q('bank_txns', TH, [['id', 'eq', r.id]])).length, (await api.q('bank_txns', VG, [['id', 'eq', r.id]])).length], [1, 1]);
const o3o = await ord(VG, o3.id);
await api.call('assign_bank_txn', { book_id: VG, request_id: rid(), id: r.id, order_id: o3.id });
C('Ghi tay vào đơn: trạng thái đã ghi', (await api.one('bank_txns', VG, [['id', 'eq', r.id]])).status, 'da_ghi');
C('Sau khi ghi tay ở Vũ Gia, sổ Thanh Hải không còn thấy', (await api.q('bank_txns', TH, [['id', 'eq', r.id]])).length, 0);
C('Đơn cô Mai còn nợ 800.000 − 300.000', (await ord(VG, o3.id)).receivable, o3o.receivable - 300000);
await E('Ghi 1 giao dịch 2 lần bị chặn', () => api.call('assign_bank_txn', { book_id: VG, id: r.id, order_id: o3.id }), 'đã được xử lý');
r = await svc('ingest_bank_txn', { provider: 'sepay', ext_id: 'SP-4', account_no: ACCT, amount: 100000, direction: 'in', content: 'me chuyen tien' });
await E('Bỏ qua phải có lý do', () => api.call('ignore_bank_txn', { book_id: TH, id: r.id, reason: '' }), 'lý do');
await api.call('ignore_bank_txn', { book_id: TH, id: r.id, reason: 'Tiền cá nhân' });
C('Bỏ qua giao dịch không phải tiền bán hàng', (await api.one('bank_txns', TH, [['id', 'eq', r.id]])).status, 'bo_qua');
r = await svc('ingest_bank_txn', { provider: 'sepay', ext_id: 'SP-5', account_no: ACCT, amount: 5000000, direction: 'out', content: 'tra tien xuong' });
C('Tiền ra: chỉ ghi nhận, không tạo phiếu', r.status, 'bo_qua');
r = await svc('ingest_bank_txn', { provider: 'sepay', ext_id: 'SP-6', account_no: ACCT, amount: 100000, direction: 'in', content: `TH${draft ? 'DH99999' : ''}` });
C('Mã đơn không tồn tại: chờ xử lý', r.status, 'cho_xu_ly');
// Khóa sổ: tiền về vào ngày đã khóa → không tự ghi, chờ xử lý
await api.call('update_book_settings', { book_id: TH, settings: { lock_date: D(1) } });
const t2 = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: KT, order_date: TODAY, status: 'xac_nhan', lines: [{ product_id: TP['NGOI-L'], qty: 10, unit_price: 15000 }] });
const t2o = await ord(TH, t2.id);
r = await svc('ingest_bank_txn', { provider: 'casso', ext_id: 'CS-9', account_no: ACCT, amount: 150000, direction: 'in', content: 'TH' + t2o.code, txn_at: D(3) + 'T03:00:00Z' });
C('Tiền về rơi vào kỳ đã khóa: không tự ghi, báo lý do', [r.status, /khóa/.test(r.note)], ['cho_xu_ly', true]);
await api.call('update_book_settings', { book_id: TH, settings: { lock_date: null } });
api.as(kho);
await E('Nhân viên không có quyền thu chi không xem được tiền về', () => api.q('bank_txns', VG), 'quyền');
api.as(owner);

// ---------- 6. Thông báo ----------
G('6. Thông báo');
let nOwner = await notes(owner, VG);
const kinds = new Set(nOwner.items.map((x) => x.kind));
C('Chủ nhận thông báo vận chuyển và tiền về', [kinds.has('van_chuyen'), kinds.has('tien_ve')], [true, true]);
C('Có thông báo “Giao thành công”', nOwner.items.some((x) => /Giao thành công/.test(x.title)), true);
C('Có thông báo hoàn hàng (mức đỏ)', nOwner.items.some((x) => /hoàn/i.test(x.title) && x.level === 'bad'), true);
C('Có thông báo tiền về chưa khớp', nOwner.items.some((x) => /chưa khớp/.test(x.title)), true);
C('Không thông báo “Đang trung chuyển” (tránh làm phiền)', nOwner.items.some((x) => /trung chuyển/.test(x.title)), false);
C('Số chưa đọc > 0', nOwner.unread > 0, true);
api.as(owner); await api.call('mark_notifications_read', { book_id: VG });
C('Đánh dấu đã đọc → 0', (await notes(owner, VG)).unread, 0);
const nKho = await notes(kho, VG);
C('Nhân viên không có quyền thu chi không nhận tin tiền về', nKho.items.some((x) => x.kind === 'tien_ve'), false);
C('Nhân viên bán hàng vẫn nhận tin vận chuyển', nKho.items.some((x) => x.kind === 'van_chuyen'), true);
api.as(staff); await api.call('save_notify_prefs', { book_id: VG, prefs: { van_chuyen: false } });
C('Tắt loại “vận chuyển” thì không nhận nữa', (await notes(staff, VG)).items.some((x) => x.kind === 'van_chuyen'), false);
api.as(owner);
r = await svc('run_scheduled', { kind: 'daily_report' });
C('Báo cáo ngày tạo cho cả 3 sổ', r.created, 3);
r = await svc('run_scheduled', { kind: 'daily_report' });
C('Chạy lại trong ngày không gửi trùng', r.created, 0);
const daily = (await notes(owner, VG)).items.find((x) => x.kind === 'bao_cao');
C('Báo cáo ngày có doanh thu, tiền thu, lãi gộp', /Doanh thu .*Tiền thu .*Lãi gộp/s.test(daily.body), true);
C('Nhân viên không có quyền xem giá vốn không nhận báo cáo', (await notes(staff, VG)).items.some((x) => x.kind === 'bao_cao'), false);
// nợ quá hạn: đơn của cô Mai giao 10 ngày trước, được nợ 3 ngày
const old = await api.call('save_sales_order', { book_id: VG, request_id: rid(), customer_id: K3, order_date: D(10), lines: [{ product_id: VP['AC-01'], qty: 1, unit_price: 400000 }], deliver_now: true, date: D(10) });
await api.sql(`update deliveries set delivery_date = ? where order_id = ?`, [D(10), old.id]);
r = await svc('run_scheduled', { kind: 'debt_reminder' });
const debt = (await notes(owner, VG)).items.find((x) => x.kind === 'cong_no');
C('Nhắc công nợ: có khách quá hạn', !!debt && /Cô Mai/.test(debt.body) && /quá hạn/i.test(debt.body), true);
C('Nhắc công nợ: mức đỏ khi có nợ quá hạn', debt?.level, 'bad');

G('7. Gửi thông báo lên điện thoại (hàng đợi)');
api.as(owner);
await E('Đăng ký nhận thông báo phải là địa chỉ https', () => api.call('save_push_sub', { endpoint: 'http://x', p256dh: 'a', auth: 'b' }), 'không hợp lệ');
await api.call('save_push_sub', { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'BPk', auth: 'xyz', user_agent: 'Android Chrome' });
api.as(staff);
await api.call('save_push_sub', { endpoint: 'https://web.push.apple.com/def', p256dh: 'BQq', auth: 'uvw', user_agent: 'iPhone' });
let q = await svc('push_queue', { limit: 200 });
const qd = q.find((x) => /Báo cáo ngày/.test(x.title) && x.book_id === VG);
C('Báo cáo ngày gửi tới máy của chủ, không gửi máy nhân viên', qd.subs.map((s) => s.endpoint), ['https://fcm.googleapis.com/fcm/send/abc']);
const qm = q.find((x) => /chưa khớp/.test(x.title) && x.book_id === VG);
C('Tin tiền về gửi tới cả chủ và nhân viên thu chi', qm.subs.length, 2);
await svc('push_done', { ids: q.map((x) => x.id), ok_endpoints: ['https://fcm.googleapis.com/fcm/send/abc'], dead_endpoints: ['https://web.push.apple.com/def'] });
q = await svc('push_queue', {});
C('Đã gửi thì không gửi lại', q.length, 0);
C('Máy đã hủy đăng ký được xóa', (await api.sql(`select count(*) n from push_subs`))[0].n, 1);
C('Người dùng KHÔNG tự gọi được hàm nhận tiền / hàng đợi', [Object.hasOwn(RPC, 'ingest_bank_txn'), Object.hasOwn(RPC, 'push_queue'), Object.hasOwn(RPC, 'create_shipment')], [false, false, true]);
await E('Gọi hàm máy chủ qua API bị chặn', () => api.call('ingest_bank_txn', { provider: 'x', ext_id: '1', amount: 1 }), 'Không có chức năng');

// ---------- 8. Đối chiếu ----------
G('8. Đối chiếu tổng');
api.as(owner);
for (const [b, name] of [[TH, 'Thanh Hải'], [VG, 'Vũ Gia']]) {
  const ov = await api.call('rpt_overview', { book_id: b, from: D(30), to: TODAY });
  const fs_ = await api.q('funds', b);
  C(`${name}: Tồn quỹ Tổng quan = tổng các quỹ`, ov.fund_balance, fs_.reduce((s, f) => s + f.balance, 0));
  const cs = await api.q('customers', b);
  C(`${name}: Phải thu = tổng sổ khách hàng`, ov.receivable, cs.reduce((s, c) => s + c.receivable, 0));
}
const bt = await api.sql(`select count(*) filter (where status = 'da_ghi' and json_array_length(payment_ids) = 0) bad from bank_txns`);
C('Mọi giao dịch “đã ghi” đều có phiếu thu', bt[0].bad, 0);
const exp = await api.call('export_book', { book_id: VG });
C('Sao lưu có vận đơn, lịch sử vận chuyển, tiền về', [exp.shipments.length, exp.shipment_events.length > 5, exp.bank_txns.length > 0], [4, true, true]);

// ---------- 9. Bổ sung: đơn mới, hủy phiếu, nhập trạng thái hàng loạt, tài khoản nhận tiền ----------
G('9. Đơn mới · hủy phiếu thu · nhập trạng thái từ file SPX');
api.as(owner);
await api.call('mark_notifications_read', { book_id: VG });
const nw = await api.call('save_sales_order', { book_id: VG, request_id: rid(), customer_id: K2, order_date: TODAY, status: 'xac_nhan', channel: 'TikTok',
  lines: [{ product_id: VP['AC-01'], qty: 2, unit_price: 450000 }] });
const nwo = await ord(VG, nw.id);
let nn = (await notes(owner, VG)).items.find((x) => x.kind === 'don_hang' && x.link === 'order:' + nw.id);
C('Xác nhận đơn → có thông báo đơn mới kèm tổng tiền', !!nn && /900\.000đ/.test(nn.title) && /TikTok/.test(nn.body), true);
const dr = await api.call('save_sales_order', { book_id: VG, request_id: rid(), customer_id: K2, order_date: TODAY, status: 'nhap', lines: [{ product_id: VP['AC-01'], qty: 1, unit_price: 450000 }] });
C('Đơn nháp không báo', (await notes(owner, VG)).items.some((x) => x.link === 'order:' + dr.id), false);
await api.call('confirm_sales_order', { book_id: VG, request_id: rid(), id: dr.id });
C('Nháp → xác nhận thì báo', (await notes(owner, VG)).items.some((x) => x.link === 'order:' + dr.id && x.kind === 'don_hang'), true);
// Hủy phiếu thu sinh từ tiền về → giao dịch quay lại chờ xử lý, đơn nợ lại
r = await svc('ingest_bank_txn', { provider: 'sepay', ext_id: 'SP-90', account_no: ACCT, amount: 900000, direction: 'in', content: 'VG ' + nwo.code });
C('Tiền về tự gạch nợ đơn mới', [r.status, (await ord(VG, nw.id)).payment_status], ['da_ghi', 'da_thanh_toan_du']);
const tx90 = await api.one('bank_txns', VG, [['id', 'eq', r.id]]);
const pay90 = (await api.q('payments', VG)).find((p) => p.code === tx90.payment_codes[0]);
await api.call('void_payment', { book_id: VG, id: pay90.id, reason: 'Ghi nhầm đơn' });
const tx90b = await api.one('bank_txns', VG, [['id', 'eq', r.id]]);
C('Hủy phiếu thu → giao dịch quay lại “chờ xử lý”', [tx90b.status, tx90b.payment_ids.length], ['cho_xu_ly', 0]);
C('Đơn trở lại chưa thanh toán', (await ord(VG, nw.id)).payment_status, 'chua_thanh_toan');
await api.call('assign_bank_txn', { book_id: VG, request_id: rid(), id: r.id, order_id: nw.id });
C('Ghi lại được vào đơn sau khi hủy', (await ord(VG, nw.id)).payment_status, 'da_thanh_toan_du');
// Hủy phiếu đối soát COD → vận đơn quay lại “SPX đang giữ tiền”
const codShip = (await api.q('shipments', VG)).find((x) => x.cod_status === 'da_ve_tk');
const codPay = (await api.q('payments', VG)).find((p) => p.code === codShip.cod_payment_codes[0]);
await api.call('void_payment', { book_id: VG, id: codPay.id, reason: 'Đối soát nhầm' });
C('Hủy phiếu COD → vận đơn: SPX đang giữ tiền', (await ship(codShip.id)).cod_status, 'spx_dang_giu');
// Nhập trạng thái hàng loạt
const ns1 = await api.call('create_shipment', { book_id: VG, request_id: rid(), order_id: nw.id, tracking_no: 'SPXVN0900000001', cod_amount: 0 });
const ns2 = await api.call('create_shipment', { book_id: VG, request_id: rid(), order_id: dr.id, tracking_no: 'SPXVN0900000002', cod_amount: 450000 });
const later = new Date(Date.now() - 60 * 1000).toISOString();
r = await api.call('import_shipment_statuses', { book_id: VG, request_id: rid(), rows: [
  { tracking_no: 'spxvn0900000001', status: 'dang_giao', at: later, detail: 'Shipper đang giao' },
  { tracking_no: 'SPXVN0900000002', status: 'giao_thanh_cong', at: later },
  { tracking_no: 'SPXVN0999999999', status: 'dang_giao' },
  { tracking_no: 'SPXVN0900000001', status: 'abc' }] });
C('Nhập file: 2 vận đơn đổi trạng thái', r.changed, 2);
C('Báo mã không có trong sổ', r.not_found, ['SPXVN0999999999']);
C('Báo trạng thái không đọc được', r.bad_status, ['SPXVN0900000001']);
C('Giao thành công + COD → SPX đang giữ tiền', (await ship(ns2.id)).cod_status, 'spx_dang_giu');
r = await api.call('import_shipment_statuses', { book_id: VG, request_id: rid(), rows: [{ tracking_no: 'SPXVN0900000001', status: 'dang_giao', at: later, detail: 'Shipper đang giao' }] });
C('Nhập lại cùng file không thêm sự kiện trùng', [r.changed, r.events], [0, 0]);
r = await api.call('import_shipment_statuses', { book_id: VG, request_id: rid(), rows: [{ tracking_no: 'SPXVN0900000001', status: 'cho_lay_hang', at: new Date(Date.now() - 86400e3).toISOString() }] });
C('Dòng cũ hơn không ghi đè trạng thái mới', (await ship(ns1.id)).status, 'dang_giao');
const ns3 = await api.call('create_shipment', { book_id: VG, request_id: rid(), order_id: nw.id, tracking_no: 'SPXVN0900000003', cod_amount: 0 });
r = await api.call('import_shipment_statuses', { book_id: VG, request_id: rid(), rows: [{ tracking_no: 'SPXVN0900000003', status: 'giao_thanh_cong', at: new Date(Date.now() - 3 * 3600e3).toISOString() }] });
C('Trạng thái đi xa hơn được ghi dù giờ trong file sớm hơn lúc nhập vận đơn', (await ship(ns3.id)).status, 'giao_thanh_cong');
// Tài khoản nhận tiền
await E('Tài khoản thiếu tên chủ TK bị chặn', () => api.call('save_bank_account', { book_id: TH, bank: { bin: '970436', account_no: ACCT, account_name: '' } }), 'tên chủ');
await api.call('save_bank_account', { book_id: TH, bank: { bin: '970436', bank_name: 'Vietcombank', account_no: '1106 738 888', account_name: 'hkd gom su mai hieu' } });
const thb = (await api.call('my_books')).find((b) => b.id === TH).settings.bank;
C('Lưu tài khoản: chuẩn hóa số TK và tên in hoa', [thb.account_no, thb.account_name], [ACCT, 'HKD GOM SU MAI HIEU']);
api.as(staff);
await E('Nhân viên không sửa được tài khoản nhận tiền', () => api.call('save_bank_account', { book_id: VG, bank: { bin: '970436', account_no: '999999', account_name: 'X' } }), 'chủ');
api.as(owner);

// ---------- 10. BEST Express ----------
G('10. BEST Express (nhiều đơn vị vận chuyển)');
api.as(owner);
const bo1 = await sell(VG, K1, VP['BHL-01'], 1, 650000);
const bo2 = await sell(VG, K2, VP['AC-01'], 1, 450000);
const b1 = await api.call('create_shipment', { book_id: VG, request_id: rid(), order_id: bo1.id, carrier: 'BEST', tracking_no: '84123456789', cod_amount: 650000 });
const b2 = await api.call('create_shipment', { book_id: VG, request_id: rid(), order_id: bo2.id, carrier: 'BEST', tracking_no: '84123456790', cod_amount: 450000 });
C('Tạo vận đơn BEST', [(await ship(b1.id)).carrier, (await ship(b1.id)).carrier_name], ['BEST', 'BEST Express']);
await E('Đơn vị vận chuyển lạ bị chặn', () => api.call('create_shipment', { book_id: VG, order_id: bo1.id, carrier: 'XYZ', tracking_no: 'ABC12345' }), 'không hợp lệ');
// BEST gửi trạng thái (qua hàm máy chủ, dạng chung)
r = await svc('ingest_tracking', { tracking_no: '84123456789', mapped_status: 'giao_thanh_cong', latest_detail: '666 - Giao hàng thành công', latest_at: new Date().toISOString(),
  events: [{ at: new Date(Date.now() - 3600e3).toISOString(), detail: 'Đang giao hàng · BC Gia Lâm', mapped_status: 'dang_giao' }] });
C('Sự kiện hành trình từ hãng có tên trạng thái', (await ship(b1.id)).events.some((e) => e.status === 'dang_giao' && e.label === 'Đang giao hàng'), true);
C('BEST báo giao thành công → BEST đang giữ COD', [(await ship(b1.id)).status, (await ship(b1.id)).cod_status], ['giao_thanh_cong', 'spx_dang_giu']);
nn = (await notes(owner, VG)).items.find((x) => x.link === 'ship:' + b1.id && /Giao thành công/.test(x.title));
C('Thông báo ghi đúng tên BEST (không ghi SPX)', !!nn && /BEST 84123456789/.test(nn.body) && /BEST đang giữ COD/.test(nn.body) && !/SPX/.test(nn.body), true);
await svc('ingest_tracking', { tracking_no: '84123456790', mapped_status: 'giao_thanh_cong' });
// Đối soát: không trộn SPX với BEST
const spxHeld = (await api.q('shipments', VG)).find((x) => x.carrier === 'SPX' && x.cod_status === 'spx_dang_giu');
await E('Không cho đối soát chung SPX với BEST', () => api.call('settle_cod', { book_id: VG, shipment_ids: [b1.id, spxHeld.id], received: 100000, fund_id: NH_VG }), '1 đơn vị vận chuyển');
r = await svc('ingest_bank_txn', { provider: 'sepay', ext_id: 'SP-BEST-1', account_no: ACCT, amount: 1060000, direction: 'in', content: 'BEST EXPRESS VIET NAM TT COD 24/10' });
C('Tiền về có chữ BEST: gợi ý đối soát COD BEST', /BEST Express/.test(r.note), true);
r = await api.call('settle_cod', { book_id: VG, request_id: rid(), shipment_ids: [b1.id, b2.id], received: 1060000, fund_id: NH_VG, bank_txn_id: r.id });
C('Đối soát COD BEST: 2 phiếu thu, cước 40.000', [r.payments.length, r.fee_total, r.carrier], [2, 40000, 'BEST']);
const bestPays = (await api.q('payments', VG)).filter((p) => r.payments.includes(p.code));
C('Phiếu thu ghi hình thức “COD BEST Express”', bestPays.every((p) => p.method === 'COD BEST Express'), true);
C('Cả 2 đơn BEST đã thu đủ', [(await ord(VG, bo1.id)).payment_status, (await ord(VG, bo2.id)).payment_status], ['da_thanh_toan_du', 'da_thanh_toan_du']);
// Nhật ký dữ liệu hãng gửi về
await svc('log_carrier_webhook', { carrier: 'BEST', tracking_no: '84123456789', raw_status: '666', mapped_status: 'giao_thanh_cong', result: 'da_cap_nhat', payload: { billcode: '84123456789', status: '666' } });
await svc('log_carrier_webhook', { carrier: 'BEST', tracking_no: '99999', raw_status: '123', result: 'chua_doc_duoc', payload: { x: 1 } });
const lg = await api.call('carrier_webhook_log', { book_id: VG, carrier: 'BEST' }); const bo1code = (await ord(VG, bo1.id)).code;
C('Chủ sổ xem được nhật ký BEST gửi về (gồm dòng chưa đọc được)', [lg.length, lg.some((x) => x.order_code === bo1code), lg.some((x) => x.result === 'chua_doc_duoc')], [2, true, true]);
api.as(staff);
await E('Nhân viên không xem nhật ký kết nối', () => api.call('carrier_webhook_log', { book_id: VG }), 'chủ');
api.as(owner);
C('Người dùng không tự ghi được nhật ký webhook', Object.hasOwn(RPC, 'log_carrier_webhook'), false);

finish('Vận chuyển · tiền về · thông báo');
