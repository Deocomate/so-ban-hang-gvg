// Kiểm thử quy trình mới: định mức, báo giá, hợp đồng, VAT theo đơn, cọc khấu trừ, công nợ lái xe, đặt xưởng, tổng quan, thuế
import { freshDb, makeApi, suite, finish, TODAY } from './harness.js';

const { G, C, E } = suite();
freshDb();
const api = makeApi();
const owner = await api.user('chu@gomsu.vn');
api.as(owner);
const books = await api.call('bootstrap');
const TH = books.find((b) => b.short_name === 'TH').id;
const d = TODAY();
const fund = (await api.q('funds', TH))[0].id;
const cust = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'HKD Lý Phương Hoa', phone: '0855069898', kind: 'Công trình', stage: 'tu_van',
  extra: { tax_code: '8440372878-003', ship_address: 'Hưng Yên' } })).id;
const am = (await api.call('save_product', { book_id: TH, name: 'Ngói âm L ghi ánh kim', unit: 'Viên', units_per_pack: 40, pack_weight: 38, norm_m2: 27, norm_m: 5, material: 'Sứ', price1: 16800 })).id;
await api.call('adjust_stock', { book_id: TH, date: d, reason: 'dau_ky', lines: [{ product_id: am, qty_delta: 20000, unit_cost: 8000 }] });

G('Danh mục');
const prod = await api.one('products', TH, [['id', 'eq', am]]);
C('Lưu định mức và chất liệu', [prod.norm_m2, prod.norm_m, prod.material], [27, 5, 'Sứ']);
await api.call('save_prices', { book_id: TH, rows: [{ id: am, price2: 15000 }] });
C('Sửa nhanh bảng giá giữ nguyên giá khác', [(await api.one('products', TH, [['id', 'eq', am]])).price2, (await api.one('products', TH, [['id', 'eq', am]])).price1], [15000, 16800]);
C('Khách lưu thông tin xuất hóa đơn', (await api.one('customers', TH, [['id', 'eq', cust]])).extra.tax_code, '8440372878-003');
await E('Định mức âm bị từ chối', () => api.call('save_product', { book_id: TH, name: 'X', norm_m2: -1 }), /Định mức/);

G('Báo giá');
const quote = await api.call('save_quote', { book_id: TH, customer_id: cust, site: 'Công trình Hưng Yên', body: { vat_mode: 'them', vat_rate: 8, ship: { qty: 2, unit: 'tấn', price: 1300000 },
  groups: [{ name: 'Ngói L', lines: [{ product_id: am, name: 'Ngói âm', measure: 100, measure_unit: 'm2', norm: 27, deduct: 0, qty: 2700, unit: 'viên', price: 10000 }] }] } });
let q1 = await api.one('quotes', TH, [['id', 'eq', quote.id]]);
C('Máy chủ tự tính tổng báo giá', [q1.body.goods, q1.body.vat, q1.body.ship.amount, q1.total], [27000000, 2160000, 2600000, 31760000]);
C('Báo giá không giữ hàng', (await api.one('products', TH, [['id', 'eq', am]])).reserved, 0);
await E('Báo giá trống bị từ chối', () => api.call('save_quote', { book_id: TH, customer_name: 'A', body: { groups: [] } }), /chưa có sản phẩm/);
const o = await api.call('save_sales_order', { book_id: TH, kind: 'dat_hang', customer_id: cust, status: 'xac_nhan', quote_id: quote.id, vat_rate: 8, lines: [{ product_id: am, qty: 10000, unit_price: 10000 }] });
q1 = await api.one('quotes', TH, [['id', 'eq', quote.id]]);
C('Chuyển sang đơn thì báo giá chốt và gắn đơn', [q1.status, q1.order_id], ['chot', o.id]);
await E('Báo giá đã chuyển không sửa được', () => api.call('save_quote', { book_id: TH, id: quote.id, customer_id: cust, body: q1.body }), /đã chuyển/);

G('VAT theo đơn');
let so = await api.one('sales_orders', TH, [['id', 'eq', o.id]]);
C('Tổng đơn gồm VAT 8%', [so.goods_total, so.vat_total, so.order_total], [100000000, 8000000, 108000000]);

G('Hợp đồng');
const k = await api.call('save_contract', { book_id: TH, order_id: o.id, sign_date: '2026-09-10', advance_amount: 30000000, advance_note: '30% giá trị hợp đồng', ship_unit: 'Xe ngoài', ship_payer: 'Bên mua' });
C('Số hợp đồng theo ngày ký', k.code, '1009/2026/HĐKT');
await E('Một đơn chỉ có một hợp đồng', () => api.call('save_contract', { book_id: TH, order_id: o.id }), /đã có hợp đồng/);
let kv = await api.one('contracts', TH, [['id', 'eq', k.id]]);
C('Hợp đồng lấy số liệu từ đơn', [kv.order_total, kv.contract_status, kv.advance_short], [108000000, 'moi_ky', 30000000]);
await E('Chưa giao thì chưa đối chiếu được', () => api.call('set_contract_reconciled', { id: k.id }), /chưa có đợt giao/);
const att = await api.call('upload_attachment', { book_id: TH, ref_type: 'contract', ref_id: k.id, name: 'scan.pdf', mime: 'application/pdf', base64: Buffer.from('noi dung').toString('base64') });
C('Tải lại đúng tệp đính kèm', Buffer.from((await api.call('get_attachment', { id: att.id })).base64, 'base64').toString(), 'noi dung');
C('Hợp đồng đếm tệp', (await api.one('contracts', TH, [['id', 'eq', k.id]])).file_count, 1);
await E('Tệp không gắn đúng chứng từ bị từ chối', () => api.call('upload_attachment', { book_id: TH, ref_type: 'contract', ref_id: 'x', name: 'a', base64: 'YQ==' }), /Không tìm thấy/);

G('Cọc khấu trừ từng đợt');
await api.call('create_payment', { book_id: TH, kind: 'thu_khach', fund_id: fund, party_id: cust, amount: 30000000, allocations: [{ doc_type: 'don_ban', doc_id: o.id, amount: 30000000 }] });
const line = (await api.q('sales_order_lines', TH, [['order_id', 'eq', o.id]]))[0];
await E('Khấu trừ vượt cọc bị từ chối', () => api.call('deliver', { order_id: o.id, date: d, shipping_fee: 0, deposit_used: 31000000, lines: [{ order_line_id: line.id, qty: 1000 }] }), /Tiền cọc còn lại/);
const d1 = await api.call('deliver', { order_id: o.id, date: d, shipping_fee: 0, deposit_used: 10000000, lines: [{ order_line_id: line.id, qty: 4000 }] });
so = await api.one('sales_orders', TH, [['id', 'eq', o.id]]);
C('Công nợ tính cả VAT phần đã giao', [so.delivered_value, so.deposit_used, so.receivable], [43200000, 10000000, 13200000]);
C('Công nợ khách khớp sổ', (await api.one('customers', TH, [['id', 'eq', cust]])).receivable, 13200000);
const ov = await api.call('rpt_overview', { book_id: TH, from: d, to: d });
C('Tổng phải thu cuối kỳ gồm VAT', ov.receivable, 13200000);
C('Doanh thu không gồm VAT', ov.revenue_goods, 40000000);

G('Trả hàng đơn có VAT');
const dl = (await api.q('delivery_lines', TH, [['delivery_id', 'eq', d1.id]]))[0];
await api.call('sales_return', { order_id: o.id, date: d, lines: [{ delivery_line_id: dl.id, qty: 1000, restock: true }] });
so = await api.one('sales_orders', TH, [['id', 'eq', o.id]]);
C('Trả hàng giảm cả VAT', [so.delivered_value, so.net_total], [32400000, 97200000]);
C('Số dư cuối kỳ khớp view sau trả hàng', (await api.call('rpt_overview', { book_id: TH, from: d, to: d })).receivable, 2400000);

G('Công nợ lái xe');
const drv = (await api.call('save_driver', { book_id: TH, name: 'Anh Hùng', phone: '0912345678', plate: '29C-123.45' })).id;
const t1 = await api.call('save_trip', { book_id: TH, driver_id: drv, order_id: o.id, delivery_id: d1.id, amount: 300000, payer: 'khach', collect: 'hoa_don', date: d });
let dv = await api.one('drivers', TH, [['id', 'eq', drv]]);
C('Thu cùng hóa đơn: cửa hàng phải trả lái xe', dv.unpaid, 300000);
await api.call('save_trip', { book_id: TH, driver_id: drv, amount: 500000, payer: 'khach', collect: 'truc_tiep', date: d });
C('Khách trả trực tiếp: không phát sinh nợ', (await api.one('drivers', TH, [['id', 'eq', drv]])).unpaid, 300000);
await E('Trả vượt số còn nợ bị từ chối', () => api.call('pay_driver', { id: t1.id, amount: 400000, fund_id: fund }), /còn phải trả/);
await api.call('pay_driver', { id: t1.id, amount: 100000, fund_id: fund });
dv = await api.one('drivers', TH, [['id', 'eq', drv]]);
C('Trả một phần', [dv.paid, dv.unpaid], [100000, 200000]);
await E('Đã trả thì không xóa chuyến', () => api.call('delete_trip', { id: t1.id }), /đã trả tiền lái xe/);
const o2 = await api.call('save_sales_order', { book_id: TH, customer_id: cust, status: 'xac_nhan', lines: [{ product_id: am, qty: 1, unit_price: 1 }], shipping_fee: 200000, transport: { driver_id: drv, amount: 200000, payer: 'khach', collect: 'hoa_don' } });
C('Khai lái xe trong màn bán hàng', (await api.q('driver_trips', TH, [['order_id', 'eq', o2.id]])).length, 1);
await api.call('save_sales_order', { book_id: TH, id: o2.id, customer_id: cust, status: 'xac_nhan', lines: [{ product_id: am, qty: 1, unit_price: 1 }], shipping_fee: 0, transport: null });
C('Bỏ vận chuyển thì bỏ khoản phải trả', [(await api.q('driver_trips', TH, [['order_id', 'eq', o2.id]])).length, (await api.one('drivers', TH, [['id', 'eq', drv]])).unpaid], [0, 200000]);

G('Đơn đặt xưởng');
const fac = await api.call('rpt_factory', { book_id: TH });
const fl = fac.lines.find((l) => l.id === line.id);
C('Cột theo ngày giao và còn phải làm', [fac.days, fl.moves[d], fl.remaining], [[d], 4000, 6000]);
await api.call('cancel_remaining', { id: o.id, reason: 'Khách dừng hàng' });
C('Hủy phần còn lại hiện là dừng hàng', (await api.call('rpt_factory', { book_id: TH })).lines.find((l) => l.id === line.id).stopped, true);

G('Tổng quan điều hành');
await api.call('update_book_settings', { book_id: TH, settings: { monthly_target: 30000000 } });
const dash = await api.call('rpt_dashboard', { book_id: TH, from: d, to: d });
C('Mục tiêu theo số ngày của kỳ', dash.target, 1000000);
C('Phễu đếm khách', [dash.funnel.tu_van, dash.funnel.bao_gia, dash.funnel.chot], [1, 1, 1]);
C('Top sản phẩm', dash.top_products[0].name, 'Ngói âm L ghi ánh kim');
C('Có cơ cấu chi phí', dash.costs[0].label, 'Giá vốn hàng bán');
const staff = await api.user('nv@gomsu.vn');
await api.call('upsert_member', { book_id: TH, email: 'nv@gomsu.vn', perms: { xem_bao_cao: true } });
api.as(staff);
C('Nhân viên không có quyền thì không thấy giá vốn', (await api.call('rpt_dashboard', { book_id: TH, from: d, to: d })).costs, []);
api.as(owner);

G('Hóa đơn thuế');
await api.call('save_tax_invoice', { book_id: TH, direction: 'ra', inv_no: '0001', inv_date: d, amount: 10000000, vat_rate: 8, profile_id: 'thanh_hai' });
const vao = await api.call('save_tax_invoice', { book_id: TH, direction: 'vao', inv_no: 'V01', inv_date: d, amount: 5000000, vat_rate: 8 });
const tx = await api.call('rpt_tax', { book_id: TH, year: d.slice(0, 4) });
const mt = tx.months.find((m) => m.month === d.slice(0, 7));
C('Đối soát theo tháng', [mt.out_amount, mt.out_vat, mt.in_vat], [10000000, 800000, 400000]);
await api.call('void_tax_invoice', { id: vao.id });
C('Hóa đơn đã hủy không tính', (await api.call('rpt_tax', { book_id: TH, year: d.slice(0, 4) })).totals.in_amount, 0);

finish('Quy trình báo giá · hợp đồng · hóa đơn');
