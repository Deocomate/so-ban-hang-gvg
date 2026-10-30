// Kiểm thử quy trình nhập/xuất Excel từ file có sẵn: đọc file → chọn cột → kiểm tra → ghi sổ — chạy: node test/excel.test.js
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshDb, makeApi, suite, finish, rid } from './harness.js';
import {
  loadSheets, buildWorkbook, importFields, importRules, guessSheet, findHeader, guessColumns, buildRows, columnIssues, rowState,
  openingSheet, mergeOpening, validateProducts, validateParties, parseDateCell,
} from '../../web/src/lib/excel.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const XLSX = createRequire(path.join(here, '../../web/package.json'))('xlsx');
const { G, C, E } = suite();
const PN = ['Giá lẻ', 'Giá đại lý', 'Giá công trình'];

const fileOf = (name, data) => ({ name, arrayBuffer: async () => data });
const xlsxFile = (sheets) => {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  return fileOf('khach.xlsx', XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
};
// Mở sheet như hộp thoại nhập: tự đoán sheet, dòng tiêu đề, cột
async function open(file, kind = 'products') {
  const sheets = await loadSheets(file);
  const rules = importRules(kind, PN);
  const sheet = sheets.find((s) => s.name === guessSheet(sheets, rules));
  const headerIdx = findHeader(sheet.rows, rules).idx;
  return { sheets, sheet, headerIdx, columns: guessColumns(sheet, headerIdx, rules) };
}
const issuesOf = (o, kind = 'products', cols = o.columns) => columnIssues(kind, cols, importFields(kind, PN), o.sheet, o.headerIdx, PN);
const rowsOf = (o, existing, cols = o.columns) => validateProducts(buildRows(o.sheet, o.headerIdx, cols), existing, PN);
const payload = (rows) => rows.filter((x) => ['new', 'upd'].includes(rowState(x))).map(({ errors, warnings, changes, dup, existing, __row, ...rest }) => rest);
const without = (cols, ...headers) => cols.map((c) => (headers.includes(c.header) ? { ...c, on: false } : c));
const fieldOf = (cols, header) => cols.find((c) => c.header === header)?.field;

freshDb();
const api = makeApi();
const owner = await api.user('chu@gomsu.vn');
api.as(owner);
const TH = (await api.call('bootstrap')).find((b) => b.short_name === 'TH').id;
const products = () => api.q('products', TH);

// Cùng cấu trúc file "Danh mục nhập hàng" của khách: 4 mức giá, cột Thương hiệu, Mẫu và Màu để trống, kèm sheet đối chiếu NHIỀU DÒNG HƠN
const HEAD = ['Nhóm hàng', 'Mã hàng (SKU)', 'Tên hàng hóa *', 'Thương hiệu', 'Mẫu', 'Kích thước', 'Màu sắc / men', 'ĐVT', 'Giá vốn', 'Giá đại lý I', 'Giá đại lý II', 'Giá công trình', 'Giá lẻ', 'Số lượng tồn', 'Tồn tối thiểu', 'Số viên/hộp', 'Đơn vị đóng gói', 'Trọng lượng/hộp (kg)', 'Trọng lượng/viên (kg)', 'Ghi chú', '', ''];
const ROWS = [
  ['Âm dương 27', 'NAD27-DC001', 'Ngói âm 27 đỏ cờ', 'Thanh Hải', '', 'W195 x H200 x D80 mm', '', 'Viên', 16500, 16500, 19000, 18000, 20000, '', '', 40, 'hộp', 35, 0.88, ''],
  ['Âm dương 27', 'NAD27-DC002', 'Ngói dương 27 đỏ cờ', 'Thanh Hải', '', 'L155 x Ø95 x D80 mm', '', 'Viên', 14000, 14000, 14000, 14000, 15000, '', '', 45, 'hộp', 24, 0.53, ''],
  ['Âm dương 15', 'NAD15-ND004', 'Diềm dương 15 nâu đen', 'Thanh Hải', '', 'L255 x Ø140 mm', '', 'Viên', 40689, 40689, '', 50000, 60000, '', '', 40, 'sọt', 67, 1.68, ''],
];
const customer = () => xlsxFile({
  'Hàng hóa': [HEAD, ...ROWS],
  'Hướng dẫn': [['HƯỚNG DẪN'], ['Tên hàng hóa là bắt buộc']],
  'Đối chiếu giá': [['Tên hàng hóa', 'Giá đại lý I', 'Giá công trình', 'Giá lẻ', 'Vị trí nguồn'], ...Array.from({ length: 8 }, (_, i) => [`Dòng đối chiếu ${i}`, 1, 2, 3, 'mục 1'])],
  'Quy cách': [['Tên hàng theo nguồn', 'Viên/hộp'], ['Ngói âm 15 sứ', 14]],
});

G('1. Nhận đúng sheet và cột của file có sẵn');
const o = await open(customer());
C('Chọn sheet nhiều cột khớp, không chọn sheet nhiều dòng', o.sheet.name, 'Hàng hóa');
C('SKU trong ngoặc được nhận', fieldOf(o.columns, 'Mã hàng (SKU)'), 'sku');
C('Giá đại lý I vào mức giá đại lý', fieldOf(o.columns, 'Giá đại lý I'), 'price2');
C('Giá lẻ vào mức 1', fieldOf(o.columns, 'Giá lẻ'), 'price1');
C('Giá công trình vào mức 3', fieldOf(o.columns, 'Giá công trình'), 'price3');
C('Trọng lượng/hộp vào kg mỗi hộp', fieldOf(o.columns, 'Trọng lượng/hộp (kg)'), 'pack_weight');
C('Trọng lượng/viên vào kg mỗi viên', fieldOf(o.columns, 'Trọng lượng/viên (kg)'), 'unit_weight');
C('Cột không có chỗ nhập thì không tự chọn', [fieldOf(o.columns, 'Giá đại lý II'), fieldOf(o.columns, 'Thương hiệu')], ['', '']);
C('Cột không tiêu đề, không dữ liệu bị lược bỏ', o.columns.length, 20);

G('2. Cảnh báo định dạng');
const iss = issuesOf(o);
C('File của khách không bị chặn', iss.filter((x) => x.tone === 'bad').length, 0);
C('Báo các cột có dữ liệu chưa được nhập', iss.some((x) => x.text.includes('Giá đại lý II') && x.text.includes('Thương hiệu')), true);
C('Cột trống Mẫu, Màu vẫn nhập được', iss.some((x) => x.tone === 'info' && x.text.includes('Mẫu') && x.text.includes('Màu sắc')), true);
C('Bỏ cả Tên lẫn SKU thì bị chặn', issuesOf(o, 'products', without(o.columns, 'Tên hàng hóa *', 'Mã hàng (SKU)')).some((x) => x.tone === 'bad'), true);
C('Bỏ SKU thì báo sẽ cấp mã mới', issuesOf(o, 'products', without(o.columns, 'Mã hàng (SKU)')).some((x) => x.text.includes('Không có cột Mã SKU')), true);
const blank = await open(xlsxFile({ S: [['Product', 'Price'], ['Vase', 1]] }));
C('Không nhận ra cột nào thì bị chặn', issuesOf(blank).some((x) => x.tone === 'bad'), true);

G('3. Nhập theo cột đã chọn, ô trống không hại gì');
const first = rowsOf(o, await products());
C('Tất cả là dòng mới, không lỗi', first.map(rowState), ['new', 'new', 'new']);
const imp = await api.call('import_products', { book_id: TH, request_id: rid(), rows: payload(first) });
C('Tạo 3 mã', imp.created, 3);
C('Không có tồn nên không có phiếu tồn đầu kỳ', imp.adjustment_code, null);
let P = Object.fromEntries((await products()).map((p) => [p.sku, p]));
C('Ô giá trống thành 0, không lỗi', P['NAD15-ND004'].price2, 40689);
C('Đóng gói sọt được giữ', P['NAD15-ND004'].pack_unit, 'sọt');
C('Mẫu, màu để trống', [P['NAD27-DC001'].pattern ?? '', P['NAD27-DC001'].color ?? ''], ['', '']);

G('4. Nhập lại file an toàn');
const again = rowsOf(await open(customer()), await products());
C('Nhập lại đúng file đó: không có gì đổi', again.map(rowState), ['same', 'same', 'same']);
await api.call('save_product', { ...P['NAD27-DC001'], color: 'Đỏ cờ', pattern: 'Sen', low_stock: 7 });
const oneCol = await open(xlsxFile({ S: [['SKU', 'Giá lẻ', 'Màu sắc / men'], ['nad27-dc001', 21000, ''], ['NAD27-DC002', '', 'Xanh']] }));
const upd = rowsOf(oneCol, await products());
C('Chỉ SKU + giá vẫn cập nhật được, không cần tên', upd.map(rowState), ['upd', 'upd']);
C('Bảng xem trước nêu rõ thay đổi', upd[0].changes, ['Giá lẻ: 20.000 → 21.000']);
await api.call('import_products', { book_id: TH, request_id: rid(), rows: payload(upd) });
P = Object.fromEntries((await products()).map((p) => [p.sku, p]));
C('Giá mới được ghi', P['NAD27-DC001'].price1, 21000);
C('Tên giữ nguyên khi không nhập cột tên', P['NAD27-DC001'].name, 'Ngói âm 27 đỏ cờ');
C('Ô màu trống không xóa màu đã có', P['NAD27-DC001'].color, 'Đỏ cờ');
C('Cột không chọn không đụng tới', [P['NAD27-DC001'].pattern, P['NAD27-DC001'].low_stock, P['NAD27-DC001'].units_per_pack], ['Sen', 7, 40]);
await E('Mã mới mà không có tên vẫn bị chặn ở máy chủ', () => api.call('import_products', { book_id: TH, request_id: rid(), rows: [{ sku: 'CHUA-CO', price1: 1 }] }), 'thiếu tên');
C('Mã mới không tên báo lỗi ngay ở bước kiểm tra', rowState(rowsOf(await open(xlsxFile({ S: [['SKU', 'Giá lẻ'], ['CHUA-CO', 1]] })), await products())[0]), 'err');

G('5. Lỗi từng dòng');
const dirty = await open(xlsxFile({ S: [
  ['SKU', 'Tên hàng hóa', 'Giá lẻ', 'Số lượng tồn'],
  ['A1', 'Hàng tốt', '1.500.000', 3], ['A2', 'Giá chữ', 'liên hệ', 2], ['', '', 500, ''], ['A1', 'Trùng mã', 1, 1], ['A3', 'Tồn khoảng', 1, '240–250'],
] }));
const bad = rowsOf(dirty, await products());
C('Dòng tốt nhập được, dòng lỗi bị đánh dấu', bad.map(rowState), ['new', 'err', 'err', 'err', 'err']);
C('Chuỗi 1.500.000 hiểu đúng', bad[0].price1, 1500000);
C('Cảnh báo cột có ô sai định dạng', issuesOf(dirty).filter((x) => /sai định dạng/.test(x.text)).length, 2);
const noQty = without(without(dirty.columns, 'Giá lẻ'), 'Số lượng tồn');
C('Bỏ chọn cột sai thì hết lỗi cột đó, dòng chỉ có dữ liệu ở cột đã bỏ thì lược đi', rowsOf(dirty, await products(), noQty).map(rowState), ['new', 'new', 'err', 'new']);

G('6. Không có mã: chống nhập trùng');
const noSku = await open(xlsxFile({ S: [['Tên hàng hóa', 'Kích thước', 'ĐVT'], ['Diềm dương 15 nâu đen', 'L255 x Ø140 mm', 'Viên'], ['Hàng hoàn toàn mới', '', 'Cái']] }));
C('Giống hàng đã có thì nghi trùng', rowsOf(noSku, await products()).map(rowState), ['dup', 'new']);

G('7. Xuất ra rồi nhập lại');
const exported = await products();
const columns = [
  { key: 'sku', label: 'Mã SKU' }, { key: 'name', label: 'Tên hàng hóa' }, { key: 'category', label: 'Chủng loại' }, { key: 'pattern', label: 'Mẫu' }, { key: 'size', label: 'Kích thước' },
  { key: 'color', label: 'Màu sắc / men' }, { key: 'unit', label: 'ĐVT' }, { key: 'avg_cost', label: 'Giá vốn' }, { key: 'price1', label: PN[0] }, { key: 'price2', label: PN[1] }, { key: 'price3', label: PN[2] },
  { key: 'on_hand', label: 'Số lượng tồn' }, { key: 'low_stock', label: 'Tồn tối thiểu' }, { key: 'units_per_pack', label: 'Số viên/hộp' }, { key: 'pack_unit', label: 'Đơn vị đóng gói' },
  { key: 'pack_weight', label: 'Trọng lượng/thùng (kg)' }, { key: 'unit_weight', label: 'Trọng lượng/viên (kg)' }, { key: 'note', label: 'Ghi chú' },
];
const blob = buildWorkbook([{ name: 'Sản phẩm', rows: exported, columns }]);
const back = await open(fileOf('san-pham.xlsx', await blob.arrayBuffer()));
C('File xuất nhận đủ mọi cột', back.columns.filter((c) => c.on).length, columns.length);
const rt = rowsOf(back, exported);
C('Nhập lại file vừa xuất: không dòng nào đổi', rt.every((x) => rowState(x) === 'same'), true);
C('Không sinh cảnh báo thừa', rt.flatMap((x) => x.warnings), []);

G('8. Khách hàng, nhà cung cấp');
const kh = await api.call('save_party', { book_id: TH, type: 'kh', code: 'KH-A', name: 'Đại lý A', phone: '0912000001', address: 'Bắc Ninh', contact: 'Anh Phát', kind: 'Đại lý', price_tier: 2, credit_days: 30, credit_limit: 5000000, note: 'VIP' });
await api.call('save_party', { book_id: TH, type: 'kh', id: kh.id, code: 'KH-A', name: 'Đại lý A', phone: '0912000001', address: 'Bắc Ninh', contact: 'Anh Phát', kind: 'Đại lý', price_tier: 2, credit_days: 30, credit_limit: 5000000, note: 'VIP', active: false });
const partyFile = await open(xlsxFile({ S: [['Mã KH', 'Tên khách hàng', 'Điện thoại', 'Mức giá', 'Hạn trả nợ đầu kỳ', 'Nợ đầu kỳ'], ['KH-A', '', 912000009, '', '', ''], ['', 'Khách mới', 987654321, 'Giá đại lý', '31/02/2026', 100], ['', 'Khách hợp lệ', '', 2, '15/11/2026', 200]] }), 'kh');
const customers = await api.q('customers', TH);
const pr = validateParties(buildRows(partyFile.sheet, partyFile.headerIdx, partyFile.columns), customers, PN, 'kh');
C('Điện thoại bị Excel mất số 0 được khôi phục', pr[0].phone, '0912000009');
C('Trạng thái từng dòng', pr.map(rowState), ['upd', 'err', 'new']);
C('Ngày không tồn tại bị báo lỗi', pr[1].errors, ['Hạn trả không đúng dạng dd/mm/yyyy']);
await api.call('import_parties', { book_id: TH, type: 'kh', request_id: rid(), rows: payload(pr), debt_date: '2026-10-01' });
const A = await api.one('customers', TH, [['code', 'eq', 'KH-A']]);
C('Đổi đúng ô có dữ liệu', A.phone, '0912000009');
C('Ô trống không xóa thông tin đã có', [A.address, A.contact, A.kind, A.price_tier, A.credit_days, A.credit_limit, A.note], ['Bắc Ninh', 'Anh Phát', 'Đại lý', 2, 30, 5000000, 'VIP']);
C('Không tự mở lại khách đã ngừng', !!A.active, false);
C('Khách mới được ghi nợ đầu kỳ', (await api.one('customers', TH, [['name', 'eq', 'Khách hợp lệ']])).opening, 200);
const ncc = await open(xlsxFile({ S: [['Mã NCC', 'Tên nhà cung cấp / xưởng', 'Mức giá', 'Hạn mức'], ['', 'Xưởng', 1, 9]] }), 'ncc');
C('Nhà cung cấp không có mức giá, hạn mức', ncc.columns.filter((c) => c.on).map((c) => c.field), ['code', 'name']);

G('9. Định dạng file đặc biệt');
const titled = await open(xlsxFile({ S: [['BẢNG GIÁ 2026'], [], ['Mã SKU', 'Tên hàng hóa', 'Giá lẻ'], ['X1', 'Hàng X', 1000]] }));
C('Dòng tiêu đề không nằm ở dòng 1', titled.headerIdx, 2);
C('Số dòng báo đúng theo Excel', buildRows(titled.sheet, titled.headerIdx, titled.columns)[0].__row, 4);
const enc = new TextEncoder();
const csv = await open(fileOf('hang.csv', enc.encode('Tên hàng hóa;Giá lẻ;Hạn\nNgói âm;1000;11/12/2026\n').buffer));
C('CSV UTF-8 không BOM giữ đúng tiếng Việt', csv.sheet.rows[0][0], 'Tên hàng hóa');
C('CSV không tự đổi ngày', csv.sheet.rows[1][2], '11/12/2026');
C('CSV dấu chấm phẩy tách đúng cột', csv.columns.filter((c) => c.on).map((c) => c.field), ['name', 'price1']);
C('CSV bảng mã Windows đọc được', (await open(fileOf('w.csv', new Uint8Array([0x54, 0xEA, 0x6E, 0x2C, 0x47, 0x69, 0xE1, 0x20, 0x6C, 0xEF, 0x0A]).buffer))).sheet.rows[0][0], 'Tên');
C('Ngày dd/mm/yyyy', parseDateCell('15/11/2026'), '2026-11-15');
C('Tháng 13 không hợp lệ', parseDateCell('15/13/2026'), 'INVALID');
const old = await open(xlsxFile({ 'Hàng hóa': [['SKU', 'Tên hàng hóa', 'Giá lẻ'], ['OLD-1', 'Hàng cũ', 1]], 'Tồn đầu kỳ': [['SKU', 'Số lượng', 'Giá vốn'], ['OLD-1', 12, 500]] }));
const merged = mergeOpening(buildRows(old.sheet, old.headerIdx, old.columns), openingSheet(old.sheets));
C('Ghép tồn từ sheet Tồn đầu kỳ', [merged[0].qty, merged[0].cost], [12, 500]);

await finish('excel');
