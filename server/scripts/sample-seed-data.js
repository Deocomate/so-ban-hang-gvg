// Dữ liệu mẫu dựng từ file Excel trong mau-excel/ và giấy tờ thật trong tasks/build-so-ban-hang-kiotviet/data, để thử app trên máy.
// Số lượng, đơn giá, ngày giao, lái xe lấy đúng theo giấy tờ. Các mục giấy tờ không có (giá vốn, tồn đầu kỳ, số dư quỹ, chi phí, số hóa đơn, cước xe) là số giả định.
// Cần thư viện của web/ để đọc Excel nên chỉ chạy trên máy, không chạy trong Docker.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSheets, productRules, importRules, guessSheet, findHeader, guessColumns, buildRows, validateProducts, validateParties } from '../../web/src/lib/excel.js';
import { DEFAULT_TEXTS } from '../../web/src/lib/docs/model.js';
import { SAMPLE_STAFF_EMAIL } from '../src/lib/auth.js';
import { VG_PRODUCTS } from './demo-seed-data.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const papers = path.join(root, 'tasks/build-so-ban-hang-kiotviet/data/MẪU GIẤY TỜ');
const rid = () => crypto.randomUUID();

const OPENING_DATE = '2026-09-01';
const BANK_VCB = '970436';
const LPH_ADDRESS = 'Khu Đảo nổi Sông Hồng, Thôn Thái Phú Đoài, Xã Vũ Tiên, Tỉnh Hưng Yên';

// Đọc file Excel đúng như hộp thoại nhập: tự đoán sheet, dòng tiêu đề, cột rồi kiểm tra từng dòng
async function readExcel(file, kind, priceNames) {
  const buf = fs.readFileSync(path.join(root, 'mau-excel', file));
  const sheets = await loadSheets({ name: file, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
  // Hộp thoại nhập chưa có cột Chất liệu, Định mức nên lấy quy tắc đầy đủ và giữ lại 3 cột này
  const rules = kind === 'products' ? productRules(priceNames) : importRules(kind, priceNames);
  const sheet = sheets.find((s) => s.name === guessSheet(sheets, rules));
  const headerIdx = findHeader(sheet.rows, rules).idx;
  const raw = buildRows(sheet, headerIdx, guessColumns(sheet, headerIdx, rules));
  const rows = kind === 'products' ? validateProducts(raw, [], priceNames) : validateParties(raw, [], priceNames, kind);
  return rows.map((r, i) => ({ ...r, material: raw[i].material, norm_m2: raw[i].norm_m2, norm_m: raw[i].norm_m })).filter((r) => !r.errors.length)
    .map(({ errors, warnings, changes, dup, existing, __row, ...rest }) => rest);
}

// Hàng có trên hợp đồng, hóa đơn, bảng đặt xưởng nhưng bảng giá không tách riêng hoa văn hoặc quy cách đóng gói
const VARIANTS = [
  { sku: 'DA27-GK-HP', from: 'DA27-GK', name: 'Diềm âm 27 hổ phù ghi ánh kim', pattern: 'Diềm âm hổ phù' },
  { sku: 'DA27-GK-SB', from: 'DA27-GK', name: 'Diềm âm 27 ghi ánh kim sen bông', pattern: 'Diềm âm sen bông' },
  { sku: 'DD27-GK-TH', from: 'DD27-GK', name: 'Diềm dương 27 ghi ánh kim thọ', pattern: 'Diềm dương thọ' },
  { sku: 'DA27-XD-HP', from: 'DA27-XD', name: 'Diềm âm hổ phù 27 xanh đồng', pattern: 'Diềm âm hổ phù' },
  { sku: 'DA27-DC-SB', from: 'DA27-DC', name: 'Diềm âm 27 sen bông đỏ cờ', pattern: 'Diềm âm sen bông' },
  { sku: 'DA43-XD-HP', from: 'DA43-XD', name: 'Diềm âm hổ phù 43 xanh đồng', pattern: 'Diềm âm hổ phù' },
  { sku: 'DA43-XD-SC', from: 'DA43-XD', name: 'Diềm âm 43 xanh đồng sen cành', pattern: 'Diềm âm sen cành' },
  { sku: 'DA80-GM-HP', from: 'DA80-GM', name: 'Diềm âm 80 gốm hổ phù', pattern: 'Diềm âm hổ phù', unit_weight: 0.3 },
  { sku: 'DD27-GM-LV', from: 'DD27-GM', name: 'Diềm dương 27 gốm Từ đường Lưu Vũ', units_per_pack: 36, unit_weight: 33 / 36 },
  { sku: 'BOA-GK', from: 'NA27-GK', name: 'Ngói bò A đại ghi ánh kim', pattern: 'Ngói bò', price1: 200000, price2: 200000, norm_m2: null, units_per_pack: 14, pack_unit: 'sọt' },
  { sku: 'BOA-GK-CC', from: 'NA27-GK', name: 'Ngói bò A đại ghi ánh kim có chắn', pattern: 'Ngói bò', price1: 350000, price2: 350000, norm_m2: null, units_per_pack: 12, pack_unit: 'sọt' },
  { sku: 'BOA-DC', from: 'NA27-DC', name: 'Ngói bò A đại đỏ cờ', pattern: 'Ngói bò', price1: 200000, price2: 200000, norm_m2: null, units_per_pack: 14, pack_unit: 'sọt' },
];

// Hợp đồng 1009/2026/HĐKT. Đợt 2 lấy 86 viên diềm âm theo Bảng đối chiếu (khớp tổng 576), biên bản bàn giao và bảng đặt xưởng ghi 96.
const LPH_LINES = [['DA27-GK-HP', 576, 33600], ['DD27-GK', 745, 26400], ['NA27-GK', 17280, 16800], ['ND27-GK', 10935, 13400]];
const LPH_TRIPS = [
  { date: '2026-09-22', driver: 'giang', boxes: 220, qty: [160, 175, 5600, 2970] },
  { date: '2026-09-26', driver: 'giang', boxes: 245, qty: [86, 240, 5280, 4590] },
  { date: '2026-10-01', driver: 'giang', boxes: 238, qty: [330, 330, 5400, 3375], deposit_used: 80000000 },
  { date: '2026-10-18', driver: 'duong', boxes: 25, qty: [0, 0, 1000, 0] },
];

// Bảng đặt xưởng tháng 10: [sku, số đặt, giao 22/9, 26/9, 1/10]. Ngói dương 43 xanh đồng ghi tổng giao 1.720 > 1.719 đặt nên đợt cuối giảm 1 viên.
const CHUA_DAYS = ['2026-09-22', '2026-09-26', '2026-10-01'];
const CHUA_LINES = [
  ['DA27-XD-HP', 1667, 0, 0, 0], ['DD27-XD', 1667, 0, 0, 0], ['NA27-XD', 1667, 0, 0, 0], ['ND27-XD', 1667, 0, 0, 0],
  ['NA27-HP', 33636, 1800, 2000, 1120], ['ND27-HP', 33636, 1800, 2025, 1125],
  ['DA43-XD-HP', 1719, 400, 0, 504], ['DD43-XD', 1719, 400, 0, 864], ['NA43-XD', 1719, 400, 420, 0], ['ND43-XD', 1719, 400, 880, 439],
  ['NA43-HP', 21774, 4000, 4140, 4980], ['ND43-HP', 21774, 4000, 5808, 5720],
];
const HANG_LINES = [['NA27-GK', 2800, 18000], ['ND27-GK', 2300, 14000], ['DA27-GK-SB', 175, 36000], ['DD27-GK-TH', 175, 28000], ['BOA-GK', 96, 200000], ['BOA-GK-CC', 12, 350000]];
const HUY_LINES = [['NA43-XD', 210], ['ND43-XD', 210], ['DA43-XD-SC', 210], ['DD43-XD', 210]];
const LIBRARY_LINES = [['NA27-DC', 1600], ['ND27L-DC', 1290], ['DA27-DC-SB', 160], ['DD27-DC', 160], ['BOA-DC', 46]];
const SON_LINES = [['DD27-GM-LV', 324], ['NA80-GM', 1400], ['ND80-GM', 1020], ['DA80-GM-HP', 1100], ['DD80-GM', 1008]];

// Giá vốn giả định bằng 60% giá đại lý, làm tròn trăm đồng
const costOf = (p) => Math.round(((p.price2 || p.price1 || 0) * 0.6) / 100) * 100;

export async function seedSample({ call, svc, ensureUser, setUser, owner, today, onProgress = () => {} }) {
  setUser(owner);
  const books = await call('bootstrap', {});
  const bookOf = (s) => books.find((b) => b.short_name === s);
  const TH = bookOf('TH').id; const VG = bookOf('VG').id; const AN = bookOf('AN').id;
  const q = (view, book_id, filters = [], order) => call('q', { view, book_id, filters, order });

  await ensureUser(SAMPLE_STAFF_EMAIL, 'Nhân viên Lan (mẫu)');
  for (const b of [TH, VG, AN]) {
    await call('upsert_member', { book_id: b, email: SAMPLE_STAFF_EMAIL, role: 'staff', display_name: 'Nhân viên Lan',
      perms: { ban_hang: true, thu_chi: true, nhap_hang: true, kho: false, danh_muc: false, chi_phi: false, xem_gia_von: false, xem_bao_cao: false } });
  }

  const setupFunds = async (b, cash, bank) => {
    const funds = await q('funds', b);
    const TM = funds.find((f) => f.name === 'Tiền mặt'); const NH = funds.find((f) => f.name !== 'Tiền mặt');
    await call('save_fund', { book_id: b, id: TM.id, name: TM.name, opening_balance: cash });
    await call('save_fund', { book_id: b, id: NH.id, name: NH.name, opening_balance: bank });
    return { TM: TM.id, NH: NH.id };
  };
  const customers = (b) => q('customers', b);
  const party = async (b, type, p) => (await call('save_party', { book_id: b, type, ...p })).id;
  const skuMap = async (b) => Object.fromEntries((await q('products', b)).map((p) => [p.sku, p]));
  const order = async (b, P, items, head) => {
    const o = await call('save_sales_order', { book_id: b, request_id: rid(), status: 'xac_nhan', channel: 'Bán tại cửa hàng', ...head,
      lines: items.map(([sku, qty, unit_price]) => ({ product_id: P[sku].id, qty, unit_price })) });
    return { ...o, lines: await q('sales_order_lines', b, [['order_id', 'eq', o.id]], 'line_no') };
  };
  const deliver = (o, date, qtys, extra = {}) => call('deliver', { order_id: o.id, request_id: rid(), date, ...extra,
    lines: o.lines.map((l, i) => ({ order_line_id: l.id, qty: qtys[i] })).filter((l) => l.qty > 0) });
  const docInfo = (b, ref_type, ref_id, data) => call('save_doc_info', { book_id: b, ref_type, ref_id, data });
  const pay = (b, p) => call('create_payment', { book_id: b, request_id: rid(), method: 'Chuyển khoản', ...p });
  const expense = (b, p) => call('save_expense', { book_id: b, request_id: rid(), ...p });

  // ===================== GỐM SỨ THANH HẢI =====================
  onProgress('Gốm sứ Thanh Hải: bảng giá, khách hàng, nhà cung cấp, lái xe…');
  const thNames = bookOf('TH').settings.price_names;
  await call('update_book_settings', { book_id: TH, settings: { default_vat: 8, monthly_target: 500000000, customer_groups: ['Khách lẻ', 'Đại lý', 'Công trình'],
    categories: [...new Set(['Ngói', 'Gạch hoa', ...bookOf('TH').settings.categories])] } });
  await call('save_bank_account', { book_id: TH, bank: { bin: BANK_VCB, bank_name: 'Vietcombank', account_no: '1027833793', account_name: 'CONG TY TNHH SAN XUAT VA THUONG MAI THANH HAI' } });
  const F = await setupFunds(TH, 30000000, 500000000);

  // Tồn đầu kỳ giả định: đủ giao các đơn trong giấy tờ, thêm phần dư; cứ 9 mã có 1 mã sắp hết để thử cảnh báo tồn
  const catalog = await readExcel('hang-hoa-thanh-hai-2026.xlsx', 'products', thNames);
  const bySku = Object.fromEntries(catalog.map((p) => [p.sku, p]));
  const variants = VARIANTS.map(({ from, ...v }) => ({ ...bySku[from], ...v }));
  const need = {};
  for (const [sku, n] of [...LPH_LINES, ...CHUA_LINES, ...HANG_LINES, ...HUY_LINES, ...LIBRARY_LINES, ...SON_LINES]) need[sku] = (need[sku] || 0) + n;
  const rows = [...catalog, ...variants].map((p, i) => {
    const brick = p.category === 'Gạch hoa'; const low = brick ? 10 : 200;
    const spare = i % 9 === 8 ? Math.round(low / 2) : brick ? 40 : 1000;
    return { ...p, cost: costOf(p), low_stock: low, qty: (need[p.sku] || 0) + spare };
  });
  await call('import_products', { book_id: TH, request_id: rid(), opening_date: OPENING_DATE, rows, note: 'Tồn đầu kỳ (dữ liệu mẫu, số giả định)' });
  const P = await skuMap(TH);
  const costs = Object.fromEntries(rows.map((p) => [p.sku, p.cost]));

  await call('import_parties', { book_id: TH, request_id: rid(), type: 'kh', debt_date: OPENING_DATE, rows: await readExcel('mau-khach-hang.xlsx', 'kh', thNames) });
  await call('import_parties', { book_id: TH, request_id: rid(), type: 'ncc', debt_date: OPENING_DATE, rows: await readExcel('mau-nha-cung-cap.xlsx', 'ncc', thNames) });
  const minhPhat = (await customers(TH)).find((c) => c.name === 'Đại lý Minh Phát').id;
  const KL = (await customers(TH)).find((c) => c.code === 'KL').id;
  const hungThinh = (await q('suppliers', TH))[0].id;

  const lph = await party(TH, 'kh', { name: 'Hộ kinh doanh Lý Phương Hoa', phone: '0855069898', address: LPH_ADDRESS, contact: 'Lý Phương Hoa', kind: 'Công trình', price_tier: 2, credit_days: 30, stage: 'tu_van',
    extra: { tax_code: '8440372878-003', ship_name: 'Hoàng', ship_phone: '0855069898', ship_address: LPH_ADDRESS } });
  const hang = await party(TH, 'kh', { name: 'Chị Đinh Hằng', phone: '0903494665', address: 'Tam Cốc, Nam Hoa Lư, Ninh Bình', kind: 'Khách lẻ', price_tier: 1, stage: 'tu_van' });
  const chua = await party(TH, 'kh', { name: 'Chùa Hưng Yên', address: 'Hưng Yên', kind: 'Công trình', price_tier: 2, credit_days: 30, stage: 'tu_van' });
  const huy = await party(TH, 'kh', { name: 'Anh Huy Đỗ', kind: 'Khách lẻ', price_tier: 2 });
  const library = await party(TH, 'kh', { name: 'Thư viện Lê Đức Anh', kind: 'Công trình', price_tier: 2 });
  const son = await party(TH, 'kh', { name: 'Anh Sơn - Nhà Gỗ', phone: '0934338887', address: 'Long Phước - Long Thành - Đồng Nai', kind: 'Khách lẻ', price_tier: 1 });

  const driver = async (p) => (await call('save_driver', { book_id: TH, ...p })).id;
  const drivers = {
    giang: await driver({ name: 'Nguyễn An Giang', phone: '0977937690' }),
    duong: await driver({ name: 'Nguyễn Hữu Dương', phone: '0862839183' }),
    hoan: await driver({ name: 'Anh Hoan', phone: '0967607687', plate: '95C - 083.60', id_no: '086069013140' }),
  };

  onProgress('Gốm sứ Thanh Hải: hợp đồng 1009 và 4 đợt giao…');
  const hd = await order(TH, P, LPH_LINES, { customer_id: lph, kind: 'dat_hang', order_date: '2026-09-10', vat_rate: 8, staff: 'Vũ Thanh Mai', note: 'Hợp đồng 1009/2026/HĐKT' });
  const contract = await call('save_contract', { book_id: TH, order_id: hd.id, code: '1009/2026/HĐKT', sign_date: '2026-09-10', profile_id: 'thanh_hai', rep_name: 'Lý Phương Hoa', rep_title: 'Chủ hộ kinh doanh',
    tax_code: '8440372878-003', ship_payer: 'Bên mua', ship_plan: 'Giao theo tiến độ công trình, tọa độ 20.349333, 106.254278', advance_amount: 80000000, advance_note: '30% giá trị hợp đồng trước VAT', advance_date: '2026-09-18' });
  await pay(TH, { kind: 'thu_khach', date: '2026-09-18', fund_id: F.NH, party_id: lph, amount: 80000000, note: 'Đặt cọc hợp đồng 1009/2026/HĐKT', allocations: [{ doc_type: 'don_ban', doc_id: hd.id, amount: 80000000 }] });
  const tripDrivers = { giang: ['Nguyễn An Giang', '0977937690'], duong: ['Nguyễn Hữu Dương', '0862839183'] };
  const hdDeliveries = [];
  for (const t of LPH_TRIPS) {
    const d = await deliver(hd, t.date, t.qty, { deposit_used: t.deposit_used });
    hdDeliveries.push(d);
    await docInfo(TH, 'delivery', d.id, { driver_name: tripDrivers[t.driver][0], driver_phone: tripDrivers[t.driver][1], handover_rep: 'Vũ Thanh Mai', recv_name: 'Hoàng', recv_phone: '0855069898', recv_address: LPH_ADDRESS, box_total: t.boxes, profile_hoa_don: 'thanh_hai' });
    await call('save_trip', { book_id: TH, request_id: rid(), driver_id: drivers[t.driver], order_id: hd.id, delivery_id: d.id, date: t.date, amount: 3500000, payer: 'khach', collect: 'truc_tiep', note: 'Bên mua trả cước trực tiếp cho lái xe (cước giả định)' });
  }
  await docInfo(TH, 'contract', contract.id, { date_de_nghi_tam_ung: '2026-09-10', date_doi_chieu_sl: '2026-10-24', date_doi_chieu_tt: '2026-10-24', date_de_nghi_tt: '2026-10-24' });
  await call('set_contract_reconciled', { id: contract.id });
  for (const name of ['1009.HĐKT NGÓI LÝ PHƯƠNG HOA.pdf', '1. BBĐC và GH.pdf']) {
    const f = path.join(papers, name);
    if (fs.existsSync(f)) await call('upload_attachment', { book_id: TH, ref_type: 'contract', ref_id: contract.id, name, mime: 'application/pdf', base64: fs.readFileSync(f).toString('base64') });
  }
  // Hóa đơn GTGT xuất sau mỗi đợt giao: tiền lấy theo Bảng đối chiếu, số hóa đơn giả định
  for (const [i, amount] of [143874000, 159435600, 155745000, 16800000].entries()) {
    await call('save_tax_invoice', { book_id: TH, direction: 'ra', inv_no: `000010${i + 1}`, inv_date: LPH_TRIPS[i].date, party_name: 'Hộ kinh doanh Lý Phương Hoa', party_tax: '8440372878-003', profile_id: 'thanh_hai', amount, vat_rate: 8, order_id: hd.id });
  }

  onProgress('Gốm sứ Thanh Hải: đơn đặt xưởng, hóa đơn bán hàng, vận chuyển…');
  const chuaOrder = await order(TH, P, CHUA_LINES.map(([sku, n]) => [sku, n]), { customer_id: chua, kind: 'dat_hang', order_date: '2026-09-15', due_date: '2026-12-20', staff: 'Vũ Thanh Mai', note: 'Chuyến tiếp theo 19/10, chuyến cuối 20/12/2026' });
  for (const [i, date] of CHUA_DAYS.entries()) await deliver(chuaOrder, date, CHUA_LINES.map((l) => l[2 + i]));

  const hangOrder = await order(TH, P, HANG_LINES, { customer_id: hang, kind: 'dat_hang', order_date: '2026-10-07', due_date: '2026-10-27', staff: 'Vũ Thanh Mai', shipping_fee: 3500000, discount: 3000000, deposit: { amount: 35000000, fund_id: F.NH, method: 'Chuyển khoản' } });
  const hangDelivery = await deliver(hangOrder, '2026-10-30', HANG_LINES.map((l) => l[1]));
  await docInfo(TH, 'order', hangOrder.id, { date_hoa_don: '2026-10-30' });
  const hangTrip = await call('save_trip', { book_id: TH, request_id: rid(), driver_id: drivers.duong, order_id: hangOrder.id, delivery_id: hangDelivery.id, date: '2026-10-30', amount: 3500000, payer: 'khach', collect: 'hoa_don', note: 'Thu cùng hóa đơn, lái xe giả định' });
  await call('pay_driver', { id: hangTrip.id, request_id: rid(), amount: 2000000, fund_id: F.TM, date: '2026-10-31' });
  await call('save_tax_invoice', { book_id: TH, direction: 'ra', inv_no: '0000201', inv_date: '2026-10-30', party_name: 'Chị Đinh Hằng', profile_id: 'mai_hieu', amount: 114200000, vat_rate: 0, order_id: hangOrder.id });

  await order(TH, P, HUY_LINES, { customer_id: huy, kind: 'dat_hang', order_date: '2026-10-09', due_date: '2026-10-15' });
  const libraryOrder = await order(TH, P, LIBRARY_LINES, { customer_id: library, kind: 'dat_hang', order_date: '2026-10-01', due_date: '2026-10-15' });
  const libraryPo = await call('save_purchase_order', { book_id: TH, request_id: rid(), kind: 'dat_sx', supplier_id: hungThinh, order_date: '2026-10-01', expected_date: '2026-10-15', sales_order_id: libraryOrder.id, status: 'xac_nhan',
    lines: libraryOrder.lines.map((l) => ({ product_id: l.product_id, qty: l.qty, unit_cost: costs[l.sku], sales_order_line_id: l.id })) });
  await call('set_prod_step', { id: libraryPo.id, step: 'Đang trong lò' });

  // Hợp đồng vận chuyển mẫu đề ngày 01/12/2024: đơn ghi trong kỳ để không rơi trước tồn đầu kỳ, ngày trên giấy giữ nguyên
  const sonOrder = await order(TH, P, SON_LINES, { customer_id: son, order_date: '2026-10-20', staff: 'Vũ Lan Anh' });
  const sonDelivery = await deliver(sonOrder, '2026-10-20', SON_LINES.map((l) => l[1]));
  const sonInfo = { date_hd_van_chuyen: '2024-12-01', profile_hd_van_chuyen: 'thanh_hai', handover_rep: 'Vũ Lan Anh', carrier_party: 'Anh Sơn - Nhà Gỗ', carrier_address: 'Long Phước - Long Thành - Đồng Nai',
    driver_name: 'Anh Hoan', driver_phone: '0967607687', vehicle: '95C - 083.60', id_no: '086069013140', transit_days: '04', box_total: 44 };
  await docInfo(TH, 'order', sonOrder.id, sonInfo);
  await docInfo(TH, 'delivery', sonDelivery.id, sonInfo);
  await call('save_trip', { book_id: TH, request_id: rid(), driver_id: drivers.hoan, order_id: sonOrder.id, delivery_id: sonDelivery.id, date: '2026-10-20', amount: 2000000, payer: 'khach', collect: 'truc_tiep', note: 'Thu vận chuyển khách hàng (cước giả định)' });

  onProgress('Gốm sứ Thanh Hải: báo giá, nhập hàng, chi phí, đơn tháng này…');
  const lineOf = (sku, name, measure, measure_unit, deduct = 0) => {
    const p = P[sku]; const norm = measure_unit === 'm' ? p.norm_m : p.norm_m2;
    return { product_id: p.id, name, spec: [p.size, p.material, p.color].filter(Boolean).join(', '), measure, measure_unit, norm, deduct, qty: measure * norm - deduct, unit: 'viên', price: p.price2 };
  };
  const pairs = (price, edge) => [
    { name: 'Diềm âm dương L xanh đồng', measure: 1, measure_unit: 'm', norm: 5, qty: 5, unit: 'cặp', price: edge },
    { name: 'Ngói âm dương L xanh đồng', measure: 2000, measure_unit: 'm2', norm: 27, deduct: 5, qty: 53995, unit: 'cặp', price },
  ];
  const sampleQuote = await call('save_quote', { book_id: TH, customer_id: chua, quote_date: '2026-10-29', template: 'ngoi', site: 'Công trình Chùa Hưng Yên', profile_id: 'thanh_hai', body: {
    vat_mode: 'da_gom', vat_rate: 8, show_norm: true, terms: DEFAULT_TEXTS.quote_ngoi, ship: { qty: 75.593, unit: 'tấn', price: 1300000 }, groups: [
      { name: 'NGÓI ÂM DƯƠNG L XANH ĐỒNG HÀNG PHẨM CẤP', note: 'Sản xuất từ đất cao lanh loại 1, nung ở nhiệt độ cao giúp xương ngói đặc chắc, cứng và chống thấm vượt trội.', lines: pairs(30000, 60000) },
      { name: 'NGÓI ÂM DƯƠNG L XANH ĐỒNG HÀNG THỨ CẤP', note: 'Được sản xuất từ nguồn nguyên liệu tối ưu chi phí và nung ở nhiệt độ phù hợp', lines: pairs(21500, 43000) },
      { name: 'NGÓI BÒ NÓC', lines: [{ name: 'Ngói bò chữ A', measure: 1, measure_unit: 'm', qty: 3, unit: 'viên', price: 200000 }, { name: 'Ngói bò chữ A cuối nóc', qty: 1, unit: 'viên', price: 300000 }] },
    ] } });
  await call('set_quote_status', { id: sampleQuote.id, status: 'da_gui' });
  // Báo giá gắn hàng hóa để thử nút Chuyển sang đơn: 100 m² mái, 20 m diềm, ngói = m² × định mức − số viên diềm
  await call('save_quote', { book_id: TH, customer_id: huy, quote_date: today, template: 'ngoi', site: 'Mái nhà Anh Huy Đỗ', profile_id: 'thanh_hai', body: {
    vat_mode: 'them', vat_rate: 8, show_norm: true, terms: DEFAULT_TEXTS.quote_ngoi, groups: [{ name: '', lines: [
      lineOf('DA27-XD', 'Diềm âm 27 xanh đồng', 20, 'm'), lineOf('DD27-XD', 'Diềm dương 27 xanh đồng', 20, 'm'),
      lineOf('NA27-XD', 'Ngói âm 27 xanh đồng', 100, 'm2', 100), lineOf('ND27-XD', 'Ngói dương 27 xanh đồng', 100, 'm2', 100)] }] } });

  await call('save_purchase_order', { book_id: TH, request_id: rid(), kind: 'mua_san', supplier_id: hungThinh, order_date: '2026-10-05', receive_now: true, lines: [{ product_id: P['GH-013'].id, qty: 100, unit_cost: costs['GH-013'] }], deposit: { amount: 2000000, fund_id: F.NH } });
  await call('save_tax_invoice', { book_id: TH, direction: 'vao', inv_no: 'HT-0005', inv_date: '2026-10-05', party_name: 'Xưởng gốm Hưng Thịnh', profile_id: 'mai_hieu', supplier_id: hungThinh, amount: costs['GH-013'] * 100, vat_rate: 8, category: 'Hàng hóa' });

  await expense(TH, { date: '2026-10-05', category: 'Thuê nhà / cửa hàng', description: 'Thuê showroom tháng 10', amount: 12000000, pay_now: { fund_id: F.NH, method: 'Chuyển khoản' } });
  await expense(TH, { date: '2026-10-31', category: 'Lương', description: 'Lương nhân viên tháng 10', amount: 25000000, pay_now: { fund_id: F.NH } });
  await expense(TH, { date: '2026-11-01', category: 'Thuê nhà / cửa hàng', description: 'Thuê showroom tháng 11', amount: 12000000, pay_now: { fund_id: F.NH, method: 'Chuyển khoản' } });

  await order(TH, P, [['GH-013', 40], ['GH-001', 30]], { customer_id: minhPhat, order_date: '2026-11-01', deliver_now: true, staff: 'Vũ Thanh Mai' });
  await order(TH, P, [['GH-005', 20]], { customer_id: KL, order_date: today, deliver_now: true, deposit: { amount: 20 * P['GH-005'].price1, fund_id: F.TM, method: 'Tiền mặt' } });
  await pay(TH, { kind: 'thu_khach', date: '2026-11-01', fund_id: F.NH, party_id: minhPhat, amount: 5000000, note: 'Trả bớt nợ đầu kỳ', auto_allocate: true });

  // ===================== GỐM VŨ GIA =====================
  // Tệp mẫu của Vũ Gia chỉ có 3 dòng ví dụ nên thêm danh mục đồ thờ của bản chạy thử để thử kênh online, vận đơn, tiền về
  onProgress('Gốm Vũ Gia: hàng hóa, đơn online, vận đơn, tiền về…');
  const vgNames = bookOf('VG').settings.price_names;
  await call('update_book_settings', { book_id: VG, settings: { default_vat: 8, monthly_target: 80000000, customer_groups: ['Khách online', 'Đại lý', 'Cộng tác viên'] } });
  await call('save_bank_account', { book_id: VG, bank: { bin: BANK_VCB, bank_name: 'Vietcombank', account_no: '1106738888', account_name: 'HKD GOM SU MAI HIEU' } });
  const VF = await setupFunds(VG, 8000000, 60000000);
  const vgRows = [...await readExcel('mau-hang-hoa_VuGia.xlsx', 'products', vgNames), ...VG_PRODUCTS];
  await call('import_products', { book_id: VG, request_id: rid(), opening_date: OPENING_DATE, rows: vgRows, note: 'Tồn đầu kỳ (dữ liệu mẫu, số giả định)' });
  const VP = await skuMap(VG);
  const hoa = await party(VG, 'kh', { name: 'Chị Hoa (TikTok)', phone: '0934222111', address: 'Q.7, TP HCM', kind: 'Khách online', price_tier: 1 });
  const tuan = await party(VG, 'kh', { name: 'Anh Tuấn (Facebook)', phone: '0916444555', address: 'Hải Phòng', kind: 'Khách online', price_tier: 1 });
  const phucAn = await party(VG, 'kh', { name: 'Cửa hàng đồ thờ Phúc An', phone: '0225888999', address: 'Thái Bình', kind: 'Đại lý', price_tier: 2, credit_days: 15, credit_limit: 50000000 });
  await party(VG, 'ncc', { name: 'Lò Bát Tràng Minh Long', phone: '0966303404', address: 'Bát Tràng', credit_days: 10 });

  const vgShip = async (customer_id, channel, sku, qty, date, carrier, tracking_no, ship_fee, statuses) => {
    const o = await order(VG, VP, [[sku, qty]], { customer_id, channel, order_date: date, deliver_now: true });
    const ov = (await q('sales_orders', VG, [['id', 'eq', o.id]]))[0];
    const s = await call('create_shipment', { book_id: VG, request_id: rid(), order_id: o.id, carrier, tracking_no, cod_amount: ov.receivable, ship_fee });
    for (const status of statuses) await call('update_shipment_status', { id: s.id, status });
    return ov;
  };
  await vgShip(hoa, 'TikTok', 'BHL-LAM-30', 1, '2026-10-25', 'SPX', 'SPXVN061234567801', 32000, ['da_lay_hang', 'dang_giao', 'giao_thanh_cong']);
  await vgShip(tuan, 'Facebook', 'BH-LAM-16', 2, '2026-10-28', 'BEST', '840123456781', 28000, ['da_lay_hang', 'dang_trung_chuyen', 'dang_giao']);
  await vgShip(hoa, 'TikTok', 'LH-LAM-30', 2, '2026-11-01', 'SPX', 'SPXVN061234567802', 32000, ['da_lay_hang', 'giao_that_bai']);
  const vgOrder = await order(VG, VP, [['BHL-RAN-35', 3]], { customer_id: phucAn, channel: 'Facebook', kind: 'dat_hang', order_date: '2026-10-30', due_date: '2026-11-10', deposit: { amount: 1000000, fund_id: VF.NH, method: 'Chuyển khoản' } });
  await svc('ingest_bank_txn', { provider: 'mau', ext_id: 'mau-1', account_no: '1106738888', amount: 1700000, direction: 'in', content: `PHUC AN CK VG${vgOrder.code}`, counter_name: 'CUA HANG DO THO PHUC AN', txn_at: `${today}T02:00:00.000Z` });
  await svc('ingest_bank_txn', { provider: 'mau', ext_id: 'mau-2', account_no: '1106738888', amount: 450000, direction: 'in', content: 'chuyen khoan', counter_name: 'TRAN THI BICH', txn_at: `${today}T03:00:00.000Z` });

  // ===================== ANAMTILE =====================
  // Mẫu BG ANAM để trống tên khách và đơn giá nên khách, họa tiết, số m² và giá là số giả định
  onProgress('Anamtile: tranh mosaic, báo giá, đơn đặt…');
  await call('update_book_settings', { book_id: AN, settings: { default_vat: 8, monthly_target: 150000000, customer_groups: ['Khách lẻ', 'Công trình'] } });
  const AF = await setupFunds(AN, 5000000, 100000000);
  await call('import_products', { book_id: AN, request_id: rid(), opening_date: OPENING_DATE, note: 'Dữ liệu mẫu', rows: [
    { sku: 'TM-KT', name: 'Tranh mosaic khảm trai', category: 'Tranh mosaic', unit: 'm²', material: 'Gốm sứ, khảm trai', size: 'Theo công trình', cost: 4500000, price1: 8500000, price2: 7500000, price3: 7000000 }] });
  const AP = await skuMap(AN);
  const anCustomer = await party(AN, 'kh', { name: 'Khách hàng mẫu Anamtile', phone: '0900000000', address: 'Hà Nội', kind: 'Công trình', price_tier: 1 });
  const mosaic = (motif, m2) => ({ vat_mode: 'them', vat_rate: 8, terms: DEFAULT_TEXTS.quote_mosaic, groups: [{ name: '', lines: [
    { product_id: AP['TM-KT'].id, name: 'Tranh mosaic khảm trai', spec: 'Gốm sứ, khảm trai', note: `Họa tiết: ${motif}`, measure: m2, measure_unit: 'm2', qty: m2, unit: 'm2', price: 8500000 }] }] });
  const anSent = await call('save_quote', { book_id: AN, customer_id: anCustomer, quote_date: '2026-10-29', template: 'mosaic', site: 'Sảnh biệt thự, Hà Nội', profile_id: 'thanh_hai', body: mosaic('Sen hồ', 12) });
  await call('set_quote_status', { id: anSent.id, status: 'da_gui' });
  const anQuote = await call('save_quote', { book_id: AN, customer_id: anCustomer, quote_date: '2026-10-20', template: 'mosaic', site: 'Tường phòng khách, Hà Nội', profile_id: 'thanh_hai', body: mosaic('Trống đồng', 6) });
  await order(AN, AP, [['TM-KT', 6, 8500000]], { customer_id: anCustomer, kind: 'dat_hang', order_date: '2026-10-22', due_date: '2026-11-30', vat_rate: 8, quote_id: anQuote.id, deposit: { amount: 27540000, fund_id: AF.NH, method: 'Chuyển khoản' } });

  return { TH, VG, AN, hd, contract, hangOrder, chuaOrder, sampleQuote };
}
