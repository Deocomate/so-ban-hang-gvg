// Kiểm thử chuyển dữ liệu KiotViet sang sổ và phí trả hàng — chạy: node test/kiotviet-import.test.js
// Dữ liệu KiotViet ở đây là mẫu tự dựng, đủ các trường hợp gặp trong dữ liệu thật (không dùng dữ liệu khách).
import { freshDb, makeApi, suite, finish, rid, TODAY, daysAgo } from './harness.js';
import { convertKiotViet } from '../scripts/kiotviet-convert.js';
import { custBalances, suppBalances } from '../src/domain/reports.js';

const { G, C, E } = suite();
const d = TODAY();
const at = (n, h = '09:00') => `${daysAgo(n)}T${h}:00.0000000+07:00`;

// ---------------- 1. Phí trả hàng ----------------
freshDb();
let api = makeApi();
const owner = await api.user('chu@gomsu.vn');
api.as(owner);
let TH = (await api.call('bootstrap')).find((b) => b.short_name === 'TH').id;
const kh = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'Anh Tùng' })).id;
const sp = (await api.call('save_product', { book_id: TH, name: 'Ngói âm 27', unit: 'Viên', price1: 10000 })).id;
await api.call('adjust_stock', { book_id: TH, reason: 'dau_ky', date: d, lines: [{ product_id: sp, qty_delta: 100, unit_cost: 6000 }] });
const so = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: kh, order_date: d, deliver_now: true, lines: [{ product_id: sp, qty: 10, unit_price: 10000 }] });
const dl = (await api.q('delivery_lines', TH, [['order_id', 'eq', so.id]]))[0];
const bal = async () => Math.round((custBalances(TH, d).find((x) => x.party_id === kh) || {}).balance || 0);

G('1. Phí trả hàng');
await E('Phí lớn hơn giá trị hàng trả bị chặn', () => api.call('sales_return', { order_id: so.id, date: d, fee: 30001, lines: [{ delivery_line_id: dl.id, qty: 3 }] }), 'lớn hơn giá trị hàng trả');
const t1 = await api.call('sales_return', { order_id: so.id, date: d, fee: 5000, lines: [{ delivery_line_id: dl.id, qty: 4 }] });
C('Trả 4 viên phí 5.000: doanh thu giảm 35.000, khách còn nợ 65.000', [t1.revenue, await bal()], [35000, 65000]);
const ret = (await api.sql(`select fee from sales_returns where id = ?`, [t1.id]))[0];
C('Phiếu trả ghi phí', ret.fee, 5000);
await api.call('sales_return', { order_id: so.id, date: d, lines: [{ delivery_line_id: dl.id, qty: 6 }] });
C('Trả nốt 6 viên không phí: khách còn nợ đúng phần phí 5.000', await bal(), 5000);
C('Tồn kho trở lại đủ 100', (await api.one('products', TH, [['id', 'eq', sp]])).on_hand, 100);

// ---------------- 2. Chuyển dữ liệu KiotViet ----------------
const P1 = 11, P2 = 12, PDEL = 99, KH1 = 21, KH2 = 22, KHDEL = 29, NCC1 = 31;
const K = {
  branches: [{ Id: 1, Name: 'TH Ceramics 42' }], users: [], categories: [{ Id: 1, Name: 'Ngói' }], trademarks: [], shelves: [], attributes: [],
  customerGroups: [{ Id: 1, Name: 'Công trình' }], saleChannels: [], bankAccounts: [], cashflowGroups: [],
  surcharges: [{ Id: 501, Name: 'VAT', ValueRatio: 8 }, { Id: 502, Name: 'Tiền vận chuyển', Value: 0 }],
  priceBooks: [{ Id: 0, Name: 'Bảng giá chung' }, { Id: 801, Name: 'Công trình' }, { Id: 802, Name: 'Đại lý MAI' }, { Id: 803, Name: 'Đại lý MẸ' }, { Id: 804, Name: 'Giá công trình' }],
  priceBookItems: {
    0: [{ Id: P1, Price: 17000 }, { Id: P2, Price: 20000 }],
    801: [{ Id: P1, Price: 17000, Pb1: 13500 }], 802: [{ Id: P1, Price: 17000, Pb1: 15000 }], 803: [{ Id: P1, Price: 17000, Pb1: 13000 }], 804: [],
  },
  products: [
    { Id: P1, Code: '1AD27-DC01', FullName: 'Ngói âm 27 đỏ cờ - L180 x W190 (Viên)', Unit: 'Viên', CategoryName: 'Ngói', TradeMarkName: 'Thanh Hải', BasePrice: 17000, Cost: 12000, OnHand: 74, isActive: true, AllowsSale: true, CreatedDate: at(40) },
    { Id: P2, Code: 'SP000001', FullName: 'Gạch hoa (Viên)', Unit: 'Viên', BasePrice: 20000, Cost: 0, OnHand: 9, isActive: true, AllowsSale: true, CreatedDate: at(40) },
  ],
  productDetails: { [P1]: { ProductAttributes: [{ Name: 'KT', Value: 'L180 x W190' }, { Name: 'KG', Value: '0.94' }] } },
  customers: [
    { Id: KH1, Code: 'KH000001', Name: 'Chùa An Lạc', ContactNumber: '0900000001', Groups: 'Công trình', CustomerGroupNames: ['Công trình'], CustomerType: 'Cá nhân', Debt: 0, CreatedDate: at(40) },
    { Id: KH2, Code: 'KH000002', Name: 'Công ty Hòa Bình', TaxCode: '0101', Organization: 'Công ty Hòa Bình', CustomerType: 'Công ty', Groups: '', CustomerGroupNames: [], Debt: 0, CreatedDate: at(40) },
  ],
  suppliers: [{ Id: NCC1, Code: 'NCC11', Name: 'Thanh Hải - Xưởng', Phone: '0913', Debt: 0, isActive: true, CreatedDate: at(40) }],
  purchaseOrders: [
    { Id: 601, Code: 'PN000001', PurchaseDate: at(30), CreatedDate: at(30), SupplierId: NCC1, Status: 3, Total: 1200000, Details: [{ Id: 6011, ProductId: P1, Quantity: 100, Price: 12000 }] },
    { Id: 602, Code: 'PN000002', PurchaseDate: at(29), CreatedDate: at(29), SupplierId: NCC1, Status: 4, Details: [{ Id: 6021, ProductId: P1, Quantity: 5, Price: 12000 }] },
  ],
  purchaseReturns: [{ Id: 701, Code: 'THN000001', ReturnDate: at(25), PurchaseOrderId: 601, SupplierId: NCC1, Status: 1, Details: [{ Id: 7011, ProductId: P1, Quantity: 10, ReturnPrice: 12000, PurchaseOrderDetailId: 6011 }] }],
  orders: [{ Id: 301, Code: 'DH000001', PurchaseDate: at(20), CreatedDate: at(20), CustomerId: KH1, Status: 3, Discount: 0,
    Details: [{ Id: 3011, ProductId: P1, Quantity: 10, Price: 17000 }], Payments: [{ Id: 9003 }] }],
  invoices: [
    // từ đặt hàng, có VAT 10% ghi trên phiếu và tiền vận chuyển
    { Id: 401, Code: 'HD000001', PurchaseDate: at(19), CreatedDate: at(19), CustomerId: KH1, OrderId: 301, OrderCode: 'DH000001', Status: 1, Discount: 0,
      InvoiceOrderSurcharges: [{ SurchargeId: 501, SurchargeName: '', Price: 17000, SurValueRatio: 10 }, { SurchargeId: 502, SurchargeName: '', Price: 50000 }],
      Details: [{ Id: 4011, ProductId: P1, Quantity: 10, Price: 17000, OrderDetailId: 3011, SubTotal: 170000 }], Payments: [{ Id: 9001 }] },
    // bán lẻ: giảm giá âm (bán cao hơn giá niêm yết), hàng đã xóa
    { Id: 402, Code: 'HD000002', PurchaseDate: at(18), CreatedDate: at(18), CustomerId: KH2, Status: 1,
      Details: [{ Id: 4021, ProductId: P1, Quantity: 8, Price: 17000, Discount: -1000, SubTotal: 144000 },
        { Id: 4022, ProductId: PDEL, ProductCode: 'GACH01{DEL}', ProductName: 'Gạch cũ', Unit: 'Viên', Quantity: 2, Price: 30000, SubTotal: 60000 }] },
    // đã hủy
    { Id: 403, Code: 'HD000003', PurchaseDate: at(17), CreatedDate: at(17), CustomerId: KH2, Status: 2, Details: [{ Id: 4031, ProductId: P1, Quantity: 1, Price: 17000 }] },
    // khách đã xóa trên KiotViet
    { Id: 404, Code: 'HD000004', PurchaseDate: at(16), CreatedDate: at(16), CustomerId: KHDEL, Customer: { Code: 'KH000009{DEL}', Name: 'Khách cũ{DEL}' }, Status: 1,
      Details: [{ Id: 4041, ProductId: P2, Quantity: 1, Price: 20000, SubTotal: 20000 }] },
  ],
  returns: [{ Id: 501, Code: 'TH000001', ReturnDate: at(15), CreatedDate: at(15), InvoiceId: 402, CustomerId: KH2, Status: 1, ReturnFee: 4000, TotalReturn: 36000,
    Details: [{ Id: 5011, ProductId: P1, Quantity: 2, Price: 18000, InvoiceDetailId: 4021 }] }],
  stockTakes: [{ Id: 801, Code: 'KK000001', CreatedDate: at(10), AdjustmentDate: at(10), Status: 1, Description: 'Kiểm kho cuối tháng',
    Details: [{ ProductId: P2, AdjustmentValue: 6, Cost: 60000 }, { ProductId: P1, AdjustmentValue: 0 }] },
    { Id: 802, Code: 'KK000002', CreatedDate: at(9), AdjustmentDate: at(9), Status: 1, Description: 'Phiếu kiểm kho được tạo tự động khi thêm mới Hàng hóa SP000001',
      Details: [{ ProductId: P2, AdjustmentValue: 4, Cost: 40000 }] }],
  damageItems: [], internalUses: [], manufacturing: [],
  cashflow: [
    { Id: 9003, Code: 'TTDH000001', TransDate: at(20), Amount: 100000, PartnerType: 'C', PartnerId: KH1, Method: 'Cash', StatusValue: 'Đã thanh toán' },
    { Id: 9001, Code: 'TTHD000001', TransDate: at(19), Amount: 50000, PartnerType: 'C', PartnerId: KH1, Method: 'Transfer', StatusValue: 'Đã thanh toán' },
    { Id: 9002, Code: 'TT000001', TransDate: at(12), Amount: 100000, PartnerType: 'C', PartnerId: KH2, Method: 'Cash', StatusValue: 'Đã thanh toán' },
    { Id: 9004, Code: 'TT000002', TransDate: at(12), Amount: 999000, PartnerType: 'C', PartnerId: KH2, Method: 'Cash', StatusValue: 'Đã hủy' },
    { Id: 9005, Code: 'TTTH000001', TransDate: at(15), Amount: -10000, PartnerType: 'C', PartnerId: KH2, Method: 'Cash', StatusValue: 'Đã thanh toán' },
    { Id: 9006, Code: 'PCPN000001', TransDate: at(30), Amount: -500000, PartnerType: 'S', PartnerId: NCC1, Method: 'Cash', StatusValue: 'Đã thanh toán' },
  ],
};
// Nợ tính tay theo nghiệp vụ KiotViet: KH1 = 170.000 + VAT 17.000 + ship 50.000 − 150.000 + điều chỉnh 30.000
K.customers[0].Debt = 117000;
// KH2 = 144.000 + 60.000 − (36.000 hàng trả − 4.000 phí cửa hàng giữ) − 100.000 + 10.000 hoàn
K.customers[1].Debt = 82000;
// Tồn 1AD27-DC01 = 100 nhập − 10 trả NCC − 10 − 8 bán + 2 khách trả = 74
// NCC = 1.200.000 − 120.000 trả hàng − 500.000
K.suppliers[0].Debt = 580000;
const ledger = {
  customers: { [KH1]: { code: 'KH000001', rows: [{ DocumentType: 1, DocumentCode: 'CB000001', DocumentId: 1, Value: 30000, Balance: 30000, TransDate: at(35) }] } },
  suppliers: {},
};

const { backup, report } = convertKiotViet(K, { today: d, ledger });

G('2. Chuyển dữ liệu: đối chiếu');
C('Doanh thu thuần khớp KiotViet', report.totals.doanh_thu_thuan_he_thong, report.totals.doanh_thu_thuan_kiotviet);
C('Không phải bù công nợ khách / NCC đang theo dõi', [report.adjustments.customers.filter((a) => !a.ghi_chu).length, report.adjustments.suppliers.filter((a) => !a.ghi_chu).length], [0, 0]);
C('Tồn kho mã đang bán khớp KiotViet, không cần bù', report.adjustments.stock.filter((s) => !s.ghi_chu), []);
C('Tổng nợ khách = KiotViet (khách đã xóa đưa về 0)', report.totals.no_khach_he_thong, report.totals.no_khach_kiotviet);
C('Phiếu hủy và phiếu tạm được ghi đúng', [report.counts.payments_voided, report.skipped.length], [1, 0]);

// ---------------- 3. Nạp vào sổ trống của máy chủ khác ----------------
freshDb();
api = makeApi();
const o2 = await api.user('chu@gomsu.vn');
api.as(o2);
TH = (await api.call('bootstrap')).find((b) => b.short_name === 'TH').id;
await api.call('update_book_settings', { book_id: TH, settings: { monthly_target: 123 } });
const r = await api.call('import_book', { book_id: TH, data: backup });

G('3. Nạp bản chuyển đổi vào sổ');
C('Nạp thành công, tồn kho khớp sổ kho', [r.ok, r.stock_mismatch], [true, []]);
const book = (await api.call('my_books')).find((b) => b.id === TH);
C('Giữ tên sổ và cài đặt riêng, thêm nhóm khách KiotViet', [book.name, book.settings.monthly_target, book.settings.customer_groups.includes('Công trình')], ['Gốm sứ Thanh Hải', 123, true]);
const p = await api.one('products', TH, [['sku', 'eq', '1AD27-DC01']]);
C('Hàng hóa: tên, 5 mức giá (Pb1), kích thước, cân nặng, thương hiệu, tồn', [p.name, p.price1, p.price2, p.price3, p.price4, p.price5, p.size, p.unit_weight, p.brand, p.on_hand],
  ['Ngói âm 27 đỏ cờ - L180 x W190', 17000, 13000, 13500, 15000, 17000, 'L180 x W190', 0.94, 'Thanh Hải', 74]);
const del = await api.one('products', TH, [['sku', 'eq', 'GACH01{DEL}']]);
C('Hàng đã xóa: giữ mã, ngừng kinh doanh, tồn về 0', [del.active, del.on_hand], [false, 0]);
const c1 = await api.one('customers', TH, [['code', 'eq', 'KH000001']]);
const c2 = await api.one('customers', TH, [['code', 'eq', 'KH000002']]);
C('Khách: nhóm, mức giá theo nhóm, loại khách, mã số thuế', [c1.kind, c1.price_tier, c2.extra.customer_type, c2.extra.tax_code], ['Công trình', 3, 'Công ty', '0101']);
const kb = (id) => Math.round((custBalances(TH, d).find((x) => x.party_id === id) || {}).balance || 0);
C('Công nợ từng khách khớp KiotViet (gồm phiếu điều chỉnh CB)', [kb(c1.id), kb(c2.id)], [117000, 82000]);
const ncc = await api.one('suppliers', TH, [['code', 'eq', 'NCC11']]);
C('Công nợ NCC khớp KiotViet', Math.round(suppBalances(TH, d).find((x) => x.party_id === ncc.id).balance), 580000);
const hd1 = await api.one('sales_orders', TH, [['code', 'eq', 'HD000001']]);
const dh1 = await api.one('sales_orders', TH, [['code', 'eq', 'DH000001']]);
C('Hóa đơn từ đặt hàng thành đợt giao của đơn đặt, giữ mã HĐ, VAT 10%', [hd1, dh1.status, dh1.vat_rate, dh1.delivery_count], [undefined, 'xac_nhan', 10, 1]);
const hd2 = await api.one('sales_orders', TH, [['code', 'eq', 'HD000002']]);
const hd3 = await api.one('sales_orders', TH, [['code', 'eq', 'HD000003']]);
C('Hóa đơn lẻ giữ mã, hóa đơn hủy thành đơn hủy', [hd2.status, hd3.status], ['xac_nhan', 'huy']);
const l2 = await api.q('sales_order_lines', TH, [['order_id', 'eq', hd2.id]], 'line_no');
C('Giảm giá âm ghi giá thực bán và ghi chú giá niêm yết', [l2[0].unit_price, /niêm yết 17\.000/.test(l2[0].note)], [18000, true]);
const tr = (await api.sql(`select code, fee from sales_returns where book_id = ?`, [TH]))[0];
C('Trả hàng giữ mã và phí trả hàng', [tr.code, tr.fee], ['TH000001', 4000]);
const pays = await api.sql(`select code, voided from payments where book_id = ? order by code`, [TH]);
C('Phiếu thu chi giữ mã KiotViet, phiếu hủy được hủy', pays.map((x) => `${x.code}${x.voided ? '*' : ''}`), ['PCPN000001', 'TT000001', 'TT000002*', 'TTDH000001', 'TTHD000001', 'TTTH000001']);
const kk = await api.sql(`select code, reason from stock_adjustments where book_id = ? and code like 'KK%' order by code`, [TH]);
C('Kiểm kho giữ mã KK; phiếu tự tạo khi thêm mới hàng là tồn đầu kỳ', kk.map((x) => x.reason), ['kiem_ke', 'dau_ky']);
const nx = await api.call('save_purchase_order', { book_id: TH, request_id: rid(), mode: 'nhap', supplier_id: ncc.id, order_date: d, receive_now: true, lines: [{ product_id: p.id, qty: 1, unit_price: 1 }] });
C('Phiếu nhập mới không trùng mã PN cũ', nx.code > 'PN000002' || !nx.code.startsWith('PN0000'), true);

// ---------------- 4. Danh mục mới từ file Excel của khách ----------------
// File mới đánh lại mã: "Ngói âm 27 đỏ cờ" mang mã NGOI-01; mã 1AD27-DC01 trong file là một hàng KHÁC; Gạch hoa SP000001 không có trong file.
const IMG = { full: 'data:image/jpeg;base64,/9j/full', thumb: 'data:image/jpeg;base64,/9j/thumb' };
const catalog = {
  rows: [
    { _row: 2, 'Mã SKU': 'NGOI-01', 'Tên hàng hóa *': 'Ngói âm 27 đỏ cờ', 'Nhóm hàng': 'Ngói âm dương', 'Chất liệu': 'Sứ tráng men', 'Kích thước (mm)': 'L200 x W195',
      'Màu sắc': 'Đỏ cờ', 'Định mức': '27 viên/m2', 'Thương hiệu': 'Thanh Hải', 'ĐVT': 'Viên', 'Giá vốn': 15675, 'Giá lẻ': 20000, 'Giá đại lý I': 16500,
      'Giá công trình': 18000, 'Giá đại lý II': 20000, 'Giá công trình lẻ': 19000, 'Số viên/hộp': 40, 'Đơn vị đóng gói': 'Hộp', 'Trọng lượng/thùng (kg)': 35, 'Trọng lượng/viên (kg)': 0.88 },
    { _row: 3, 'Mã SKU': '1AD27-DC01', 'Tên hàng hóa *': 'Diềm âm 27 đỏ cờ sen bông', 'ĐVT': 'Viên', 'Định mức': '5 viên/m dài', 'Giá lẻ': 40000, 'Giá vốn': 31350 },
  ],
  images: { 2: IMG },
  mapping: { '1AD27-DC01': 'NGOI-01' },
  price_books: [{ name: 'Giá Hòa Bình', items: [{ sku: 'NGOI-01', price: 15500 }, { sku: 'KHONG-CO', price: 1 }] }],
};
const conv2 = convertKiotViet(K, { today: d, ledger, catalog });
freshDb();
api = makeApi();
api.as(await api.user('chu@gomsu.vn'));
TH = (await api.call('bootstrap')).find((b) => b.short_name === 'TH').id;
const r4 = await api.call('import_book', { book_id: TH, data: conv2.backup });

G('4. Danh mục mới từ Excel, ghép theo tên');
C('Nạp thành công, số liệu vẫn khớp KiotViet', [r4.ok, r4.stock_mismatch, conv2.report.totals.doanh_thu_thuan_he_thong === conv2.report.totals.doanh_thu_thuan_kiotviet,
  conv2.report.totals.no_khach_he_thong, conv2.report.adjustments.stock.filter((s) => !s.ghi_chu)], [true, [], true, 199000, []]);
const ngoiId = (await api.one('products', TH, [['sku', 'eq', 'NGOI-01']])).id;
const ngoi = await api.one('products', TH, [['id', 'eq', ngoiId]]);
C('Mã mới: tên, giá 5 mức theo tên cột, quy cách, định mức, ảnh, tồn theo KiotViet', [ngoi.name, ngoi.price1, ngoi.price2, ngoi.price3, ngoi.price4, ngoi.price5,
  ngoi.units_per_pack, ngoi.pack_unit, ngoi.unit_weight, ngoi.norm_m2, ngoi.size, ngoi.image_url, ngoi.images, ngoi.on_hand, ngoi.active],
  ['Ngói âm 27 đỏ cờ', 20000, 16500, 18000, 20000, 19000, 40, 'hộp', 0.88, 27, 'L200 x W195', IMG.thumb, [IMG.full], 74, true]);
const dc01 = await api.one('products', TH, [['sku', 'eq', '1AD27-DC01']]);
C('Mã 1AD27-DC01 là hàng của file mới, không mang lịch sử KiotViet', [dc01.name, dc01.norm_m, dc01.on_hand, dc01.active], ['Diềm âm 27 đỏ cờ sen bông', 5, 0, true]);
const lines4 = await api.sql(`select p.sku from sales_order_lines l join products p on p.id = l.product_id join sales_orders o on o.id = l.order_id where o.code = 'HD000002' order by l.line_no`);
C('Lịch sử bán của mã KiotViet đã ghép chuyển sang mã mới', lines4.map((x) => x.sku), ['NGOI-01', 'GACH01{DEL}']);
const old = await api.one('products', TH, [['sku', 'eq', 'SP000001']]);
C('Mã KiotViet chưa ghép: giữ mã cũ, ngừng kinh doanh, giữ tồn KiotViet', [old.active, old.on_hand], [false, 9]);
const pbs = await api.q('price_books', TH);
const pbi = await api.q('price_book_items', TH);
const hb = await api.one('customers', TH, [['code', 'eq', 'KH000002']]);
C('Bảng giá riêng "Giá Hòa Bình": chỉ nhóm Hòa Bình, đúng giá, khách có tên Hòa Bình vào nhóm', [pbs.map((b) => [b.name, b.cust_groups, b.allow_others]), pbi.map((i) => i.price), hb.kind],
  [[['Giá Hòa Bình', ['Hòa Bình'], true]], [15500], 'Hòa Bình']);
C('Mã trong bảng giá không có trong danh mục được báo', conv2.report.warnings.some((w) => /KHONG-CO/.test(w)), true);

finish('Chuyển dữ liệu KiotViet + phí trả hàng');
